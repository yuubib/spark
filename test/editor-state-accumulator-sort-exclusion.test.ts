import assert from "node:assert";

import { SplatAccumulator, SplatMesh } from "../dist/spark.module.js";
import { SPLAT_EDITOR_STATE_DELETED } from "../src/SplatEditorState.js";
import {
  compactSplatSortInputForEditorState,
  remapCompactSplatOrdering,
  shouldSkipSplatSortReadbackForEditorState,
} from "../src/SplatSortInput.js";

assert.strictEqual(
  shouldSkipSplatSortReadbackForEditorState({
    numSplats: 0,
    editorStateData: null,
  }),
  true,
);

assert.strictEqual(
  shouldSkipSplatSortReadbackForEditorState({
    numSplats: 3,
    editorStateData: null,
  }),
  false,
);

assert.strictEqual(
  shouldSkipSplatSortReadbackForEditorState({
    numSplats: 3,
    editorStateData: null,
    editorStateVisibleCount: 0,
  }),
  true,
);

assert.strictEqual(
  shouldSkipSplatSortReadbackForEditorState({
    numSplats: 3,
    editorStateData: new Uint8Array([
      SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_DELETED,
    ]),
    editorStateVisibleCount: 1,
  }),
  false,
);

assert.strictEqual(
  shouldSkipSplatSortReadbackForEditorState({
    numSplats: 3,
    editorStateData: new Uint8Array([
      SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_DELETED,
    ]),
  }),
  false,
);

assert.strictEqual(
  shouldSkipSplatSortReadbackForEditorState({
    numSplats: 3,
    editorStateData: new Uint8Array([
      SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_DELETED,
    ]),
  }),
  true,
);

assert.strictEqual(
  shouldSkipSplatSortReadbackForEditorState({
    numSplats: 3,
    editorStateData: new Uint8Array([
      SPLAT_EDITOR_STATE_DELETED,
      0,
      SPLAT_EDITOR_STATE_DELETED,
    ]),
  }),
  false,
);

{
  const readback = new Uint32Array([10, 20, 30, 40]);
  const compactReadback = new Uint32Array(4);
  const sourceIndices = new Uint32Array(4);

  const input = compactSplatSortInputForEditorState({
    numSplats: 4,
    readback,
    editorStateData: null,
    compactReadback,
    sourceIndices,
  });

  assert.strictEqual(input.numSplats, 4);
  assert.strictEqual(input.readback, readback);
  assert.strictEqual(input.sourceIndices, undefined);
  assert.strictEqual(input.excludedDeleted, 0);
}

{
  const readback = new Uint32Array([10, 20, 30, 40]);
  const compactReadback = new Uint32Array(4);
  const sourceIndices = new Uint32Array(4);

  const input = compactSplatSortInputForEditorState({
    numSplats: 4,
    readback,
    editorStateData: new Uint8Array([0, 0, 0, 0]),
    compactReadback,
    sourceIndices,
  });

  assert.strictEqual(input.numSplats, 4);
  assert.strictEqual(input.readback, readback);
  assert.strictEqual(input.sourceIndices, undefined);
  assert.strictEqual(input.excludedDeleted, 0);
}

{
  const readback = new Uint32Array([10, 20, 30, 40]);
  const compactReadback = new Uint32Array(4);
  const sourceIndices = new Uint32Array(4);

  const input = compactSplatSortInputForEditorState({
    numSplats: 4,
    readback,
    editorStateData: new Uint8Array([
      0,
      SPLAT_EDITOR_STATE_DELETED,
      0,
      SPLAT_EDITOR_STATE_DELETED,
    ]),
    compactReadback,
    sourceIndices,
  });

  assert.strictEqual(input.numSplats, 2);
  assert.strictEqual(input.readback, compactReadback);
  assert.strictEqual(input.sourceIndices, sourceIndices);
  assert.strictEqual(input.excludedDeleted, 2);
  assert.deepStrictEqual([...compactReadback.slice(0, 2)], [10, 30]);
  assert.deepStrictEqual([...sourceIndices.slice(0, 2)], [0, 2]);

  const ordering = new Uint32Array([1, 0, 99, 100]);
  remapCompactSplatOrdering(ordering, 2, sourceIndices);
  assert.deepStrictEqual([...ordering], [2, 0, 99, 100]);
}

{
  const readback = new Uint32Array([10, 20, 30]);
  const compactReadback = new Uint32Array(3);
  const sourceIndices = new Uint32Array(3);

  const input = compactSplatSortInputForEditorState({
    numSplats: 3,
    readback,
    editorStateData: new Uint8Array([
      SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_DELETED,
    ]),
    compactReadback,
    sourceIndices,
  });

  assert.strictEqual(input.numSplats, 0);
  assert.strictEqual(input.readback, compactReadback);
  assert.strictEqual(input.sourceIndices, sourceIndices);
  assert.strictEqual(input.excludedDeleted, 3);
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const state = mesh.ensureEditorState(2);
  const previous = new SplatAccumulator();
  const next = new SplatAccumulator();

  previous.mapping = [
    {
      node: mesh,
      version: 0,
      sortVersion: 0,
      styleVersion: 0,
      mappingVersion: 0,
      editorStateVisibilityVersion: state.visibilityVersion,
      base: 0,
      count: 2,
    },
  ];
  state.selectAll();
  state.deleteSelected();
  next.mapping = [
    {
      node: mesh,
      version: 0,
      sortVersion: 0,
      styleVersion: 0,
      mappingVersion: 0,
      editorStateVisibilityVersion: state.visibilityVersion,
      base: 0,
      count: 2,
    },
  ];

  assert.deepStrictEqual(previous.checkVersions(next.mapping), {
    splatsUpdated: false,
    sortUpdated: true,
    styleUpdated: false,
    mappingUpdated: false,
  });

  previous.dispose();
  next.dispose();
  mesh.dispose();
}

console.log("Splat editor accumulator sort exclusion tests passed");
