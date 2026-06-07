import { SPLAT_EDITOR_STATE_DELETED } from "./SplatEditorState";

export type SplatSortInputForEditorState = {
  numSplats: number;
  readback: Uint32Array;
  sourceIndices?: Uint32Array;
  excludedDeleted: number;
};

export function shouldSkipSplatSortReadbackForEditorState({
  numSplats,
  editorStateData,
  editorStateVisibleCount,
}: {
  numSplats: number;
  editorStateData?: Uint8Array | null;
  editorStateVisibleCount?: number | null;
}): boolean {
  const count = Math.max(0, Math.floor(numSplats));
  if (count === 0) {
    return true;
  }
  if (editorStateVisibleCount != null) {
    return Math.max(0, Math.floor(editorStateVisibleCount)) === 0;
  }
  if (!editorStateData || editorStateData.length < count) {
    return false;
  }
  for (let index = 0; index < count; index += 1) {
    if ((editorStateData[index] & SPLAT_EDITOR_STATE_DELETED) === 0) {
      return false;
    }
  }
  return true;
}

export function compactSplatSortInputForEditorState({
  numSplats,
  readback,
  editorStateData,
  editorStateUniformValue,
  compactReadback,
  sourceIndices,
}: {
  numSplats: number;
  readback: Uint32Array;
  editorStateData?: Uint8Array | null;
  editorStateUniformValue?: number | null;
  compactReadback: Uint32Array;
  sourceIndices: Uint32Array;
}): SplatSortInputForEditorState {
  const count = Math.max(0, Math.floor(numSplats));
  if (editorStateUniformValue != null) {
    if ((editorStateUniformValue & SPLAT_EDITOR_STATE_DELETED) === 0) {
      return { numSplats: count, readback, excludedDeleted: 0 };
    }
    return {
      numSplats: 0,
      readback: compactReadback,
      sourceIndices,
      excludedDeleted: count,
    };
  }
  if (!editorStateData || editorStateData.length === 0 || count === 0) {
    return { numSplats: count, readback, excludedDeleted: 0 };
  }
  if (compactReadback.length < count || sourceIndices.length < count) {
    throw new Error("Compact sort buffers are too small");
  }

  let compactCount = 0;
  let excludedDeleted = 0;
  const stateCount = Math.min(count, editorStateData.length);
  for (let index = 0; index < count; index += 1) {
    const state = index < stateCount ? editorStateData[index] : 0;
    if ((state & SPLAT_EDITOR_STATE_DELETED) !== 0) {
      excludedDeleted += 1;
      continue;
    }
    compactReadback[compactCount] = readback[index] ?? 0;
    sourceIndices[compactCount] = index;
    compactCount += 1;
  }

  if (excludedDeleted === 0) {
    return { numSplats: count, readback, excludedDeleted: 0 };
  }

  return {
    numSplats: compactCount,
    readback: compactReadback,
    sourceIndices,
    excludedDeleted,
  };
}

export function remapCompactSplatOrdering(
  ordering: Uint32Array,
  activeSplats: number,
  sourceIndices: Uint32Array,
): void {
  const count = Math.min(
    Math.max(0, Math.floor(activeSplats)),
    ordering.length,
  );
  for (let index = 0; index < count; index += 1) {
    ordering[index] = sourceIndices[ordering[index]] ?? 0;
  }
}
