import groupBy from 'lodash.groupby';

import { AstNode, Program } from '@shaderfrog/glsl-parser/ast';
import { Engine, EngineContext } from './engine';
import { ShaderSections } from './ast/shader-sections';
import {
  CodeNode,
  mapInputName,
  SourceNode,
  SourceType,
} from './nodes/code-nodes';
import { NodeInput } from './nodes/core-node';
import {
  Graph,
  GraphNode,
  NodeType,
  collectConnectedNodes,
  filterGraphFromNode,
  isSourceNode,
  mangleEntireProgram,
} from './graph';
import { InputFillers, coreParsers } from './parsers';

/**
 * A node's context is the runtime / in-memory computed data associated with a
 * graph node. It includes the parsed AST representation of the node, as well as
 * the inputs found in that AST. It's not currently saved to the database.
 */
export type NodeContext = {
  id?: string;
  name?: string;
  source?: string;
  ast: AstNode | Program;
  // Inputs are determined at parse time and should probably be in the graph,
  // not here on the runtime context for the node
  inputs?: NodeInput[];
  inputFillers: InputFillers;
  errors?: NodeErrors;
};

type NodeErrors = { type: 'errors'; errors: any[] };
const makeError = (...errors: any[]): NodeErrors => ({
  type: 'errors',
  errors,
});
const isError = (test: any): test is NodeErrors => test?.type === 'errors';

// Merge existing node inputs, and inputs based on properties, with new ones
// found from the source code, using the *id* as the uniqueness key. Any filler input gets
// merged into property inputs with the same id. This preserves the
// "baked" property on node inputs which is toggle-able in the graph
const collapseNodeInputs = (
  node: CodeNode,
  updatedInputs: NodeInput[]
): NodeInput[] =>
  Object.values(groupBy([...updatedInputs, ...node.inputs], (i) => i.id)).map(
    (dupes) => dupes.reduce((node, dupe) => ({ ...node, ...dupe }))
  );

const computeNodeContext = async (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph,
  node: SourceNode
): Promise<NodeContext | NodeErrors> => {
  // THIS DUPLICATES OTHER LINE
  const parser = {
    ...(coreParsers[node.type] || coreParsers[NodeType.SOURCE]),
    ...(engine.parsers[node.type] || {}),
  };

  const { onBeforeCompile, manipulateAst } = parser;
  if (onBeforeCompile) {
    const { groupId } = node as SourceNode;
    const sibling = graph.nodes.find(
      (n) =>
        n !== node && 'groupId' in n && (n as SourceNode).groupId === groupId
    );
    await onBeforeCompile(
      graph,
      engineContext,
      node as SourceNode,
      sibling as SourceNode
    );
  }

  const inputEdges = graph.edges.filter((edge) => edge.to === node.id);

  let ast;
  try {
    ast = parser.produceAst(engineContext, engine, graph, node, inputEdges);
    if (manipulateAst) {
      ast = manipulateAst(engineContext, engine, graph, node, ast, inputEdges);
    }
  } catch (error) {
    console.error('Error parsing source code!', { error, node });
    return makeError(error);
  }

  // Find all the inputs of this node where a "source" code node flows into it,
  // to auto-bake it. This handles the case where a graph is instantiated with
  // a shader plugged into a texture property. The property on the intial node
  // doesn't know if it's baked or not
  const dataInputs = groupBy(
    filterGraphFromNode(
      graph,
      node,
      {
        input: (input, b, c, fromNode) =>
          input.bakeable && fromNode?.type === 'source',
      },
      1
    ).inputs[node.id] || [],
    'id'
  );

  // Find the combination if inputs (data) and fillers (runtime context data)
  // and copy the input data onto the node, and the fillers onto the context
  const computedInputs = parser.findInputs(
    engineContext,
    node,
    ast,
    inputEdges
  );

  node.inputs = collapseNodeInputs(
    node,
    computedInputs.map(([i]) => ({
      ...i,
      displayName: mapInputName(node, i),
    }))
  ).map((input) => ({
    // Auto-bake
    ...input,
    ...(input.id in dataInputs ? { baked: true } : {}),
  }));

  const nodeContext: NodeContext = {
    ast,
    id: node.id,
    inputFillers: computedInputs.reduce<InputFillers>(
      (acc, [input, filler, args]) => ({
        ...acc,
        [input.id]: {
          filler,
          args,
        },
      }),
      {}
    ),
  };

  // Skip mangling if the node tells us to, which probably means it's an engine
  // node where we don't care about renaming all the variables, or if it's
  // an expression, where we want to be in the context of other variables
  // TODO: Use global undefined engine variables here?
  if (
    node.config.mangle !== false &&
    node.sourceType !== SourceType.EXPRESSION &&
    node.sourceType !== SourceType.FN_BODY_FRAGMENT
  ) {
    mangleEntireProgram(ast as Program, node, engine);
  }

  return nodeContext;
};

export const computeContextForNodes = async (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph,
  nodes: GraphNode[]
) =>
  nodes
    .filter(isSourceNode)
    .reduce<Promise<Record<string, NodeContext> | NodeErrors>>(
      async (ctx, node) => {
        const context = await ctx;
        if (isError(context)) {
          return context;
        }

        let nodeContext = await computeNodeContext(
          engineContext,
          engine,
          graph,
          node
        );
        if (isError(nodeContext)) {
          return makeError(nodeContext);
        }

        context[node.id] = {
          ...(context[node.id] || {}),
          ...nodeContext,
        };
        return context;
      },
      Promise.resolve(engineContext.nodes as Record<string, NodeContext>)
    );

export type CompileGraphResult = {
  fragment: ShaderSections;
  vertex: ShaderSections;
  outputFrag: GraphNode;
  outputVert: GraphNode;
  orphanNodes: GraphNode[];
  activeNodeIds: Set<string>;
};

/**
 * Compute the context for every node in the graph, done on initial graph load
 * to compute the inputs/outputs for every node
 */
export const computeAllContexts = (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph
) => computeContextForNodes(engineContext, engine, graph, graph.nodes);

/**
 * Compute the contexts for nodes starting from the outputs, working backwards.
 * Used to only (re)-compute context for any actively used nodes
 */
export const computeGraphContext = async (
  engineContext: EngineContext,
  engine: Engine,
  graph: Graph
) => {
  const outputFrag = graph.nodes.find(
    (node) => node.type === 'output' && node.stage === 'fragment'
  );
  if (!outputFrag) {
    throw new Error('No fragment output in graph');
  }
  const outputVert = graph.nodes.find(
    (node) => node.type === 'output' && node.stage === 'vertex'
  );
  if (!outputVert) {
    throw new Error('No vertex output in graph');
  }

  const vertexIds = collectConnectedNodes(graph, outputVert);
  const fragmentIds = collectConnectedNodes(graph, outputFrag);
  const additionalIds = graph.nodes.filter(
    (node) =>
      isSourceNode(node) &&
      node.stage === 'vertex' &&
      node.nextStageNodeId &&
      fragmentIds[node.nextStageNodeId] &&
      !vertexIds[node.id]
  );

  await computeContextForNodes(engineContext, engine, graph, [
    outputVert,
    ...Object.values(vertexIds).filter((node) => node.id !== outputVert.id),
    ...additionalIds,
  ]);
  await computeContextForNodes(engineContext, engine, graph, [
    outputFrag,
    ...Object.values(fragmentIds).filter((node) => node.id !== outputFrag.id),
  ]);
};
