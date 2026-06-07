export type SplatSortInputForEditorState = {
    numSplats: number;
    readback: Uint32Array;
    sourceIndices?: Uint32Array;
    excludedDeleted: number;
};
export declare function compactSplatSortInputForEditorState({ numSplats, readback, editorStateData, compactReadback, sourceIndices, }: {
    numSplats: number;
    readback: Uint32Array;
    editorStateData?: Uint8Array | null;
    compactReadback: Uint32Array;
    sourceIndices: Uint32Array;
}): SplatSortInputForEditorState;
export declare function remapCompactSplatOrdering(ordering: Uint32Array, activeSplats: number, sourceIndices: Uint32Array): void;
