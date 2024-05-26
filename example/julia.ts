import {juliaF as makeJuliaF,juliaV as makeJuliaV} from "./juliaNode"
import {edgeFrom, makeId} from "./utils";
import {linkFromVertToFrag, outputNode} from "../src";
import {engine as threngine} from "../src/plugins/three";

export const createJuliaGraph = () => {

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
    const juliaF = makeJuliaF(makeId(),{x: -162, y: -105});
    const juliaV = makeJuliaV(makeId(),{x: -162, y: -105});
    let newGraph = {
        nodes: [
            outputF,
            outputV,
            physicalF,
            physicalV,
            juliaF,
            juliaV,
        ],
        edges: [
            linkFromVertToFrag(makeId(), physicalV.id, physicalF.id),
            linkFromVertToFrag(makeId(), juliaV.id, juliaF.id),
            edgeFrom(physicalF, outputF.id, 'filler_frogFragOut', 'fragment'),
            edgeFrom(physicalV, outputV.id, 'filler_gl_Position', 'vertex'),
            edgeFrom(
                juliaF,
                physicalF.id,
                'property_map',
                'fragment'
            ),
        ],
    };
    return newGraph
}