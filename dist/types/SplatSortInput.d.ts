export type SplatSortInputForEditorState = {
    numSplats: number;
    readback: Uint32Array;
    sourceIndices?: Uint32Array;
    excludedDeleted: number;
};
export declare function shouldSkipSplatSortReadbackForEditorState({ numSplats, editorStateData, editorStateVisibleCount, }: {
    numSplats: number;
    editorStateData?: Uint8Array | null;
    editorStateVisibleCount?: number | null;
}): boolean;
export declare function compactSplatSortInputForEditorState({ numSplats, readback, editorStateData, editorStateUniformValue, compactReadback, sourceIndices, }: {
    numSplats: number;
    readback: Uint32Array;
    editorStateData?: Uint8Array | null;
    editorStateUniformValue?: number | null;
    compactReadback: Uint32Array;
    sourceIndices: Uint32Array;
}): SplatSortInputForEditorState;
export declare function remapCompactSplatOrdering(ordering: Uint32Array, activeSplats: number, sourceIndices: Uint32Array): void;
