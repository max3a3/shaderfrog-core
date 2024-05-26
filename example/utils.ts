import {BaseNode, EdgeType, makeEdge} from "../src";

let id = 0;
const outFrom = (node: BaseNode) => node.outputs[0].id;

export const makeId = () => `id_${id++}`;
export const edgeFrom = (
    fromNode: BaseNode,
    toId: string,
    input: string,
    type?: EdgeType
) => makeEdge(makeId(), fromNode.id, toId, outFrom(fromNode), input, type);
