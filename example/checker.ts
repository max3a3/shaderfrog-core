import {BaseNode, EdgeType, makeEdge, linkFromVertToFrag, outputNode, Graph} from "../src/graph"
import {engine as threngine, createMaterial} from '../src/plugins/three';
import {checkerboardF, checkerboardV} from "./checkboardNode";
import {edgeFrom, makeId} from "./utils";

let newGraph: Graph;


const outputF = outputNode(
    makeId(),
    'Output',
    {x: 434, y: -97},
    'fragment'
);
const outputV = outputNode(makeId(), 'Output', {x: 434, y: 16}, 'vertex');

const physicalF = threngine.constructors.physical!(
    makeId(),
    'Physical',
    {x: 178, y: -103},
    [],
    'fragment'
);
const physicalV = threngine.constructors.physical!(
    makeId(),
    'Physical',
    {x: 434, y: 130},
    [],
    'vertex'
);

export const createCheckerGraph = () => {
    const checkerboardf = checkerboardF(makeId(), {x: -162, y: -105});
    const checkerboardv = checkerboardV(makeId(), {
        x: -162,
        y: 43,
    });
    newGraph = {
        nodes: [
            outputF,
            outputV,
            physicalF,
            physicalV,
            checkerboardf,
            checkerboardv,
        ],
        edges: [
            linkFromVertToFrag(makeId(), physicalV.id, physicalF.id),
            linkFromVertToFrag(makeId(), checkerboardv.id, checkerboardf.id),
            edgeFrom(physicalF, outputF.id, 'filler_frogFragOut', 'fragment'),
            edgeFrom(physicalV, outputV.id, 'filler_gl_Position', 'vertex'),
            edgeFrom(
                checkerboardf,
                physicalF.id,
                'property_map',
                'fragment'
            ),
        ],
    };
    return newGraph
}