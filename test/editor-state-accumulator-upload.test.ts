import assert from "node:assert";

import { SplatAccumulator, SplatMesh } from "../dist/spark.module.js";
import {
  SPLAT_EDITOR_STATE_DELETED,
  SPLAT_EDITOR_STATE_NONE,
  SPLAT_EDITOR_STATE_SELECTED,
} from "../src/SplatEditorState.js";

function createMockRenderer() {
  const texSubImageCalls: unknown[][] = [];
  const pixelStore = new Map<number, number | boolean>([
    [0x0cf5, 4],
    [0x9240, false],
    [0x0cf2, 0],
    [0x806e, 0],
    [0x0cf4, 0],
    [0x0cf3, 0],
    [0x806d, 0],
  ]);
  const gl = {
    TEXTURE0: 0x84c0,
    TEXTURE_2D_ARRAY: 0x8c1a,
    PIXEL_UNPACK_BUFFER: 0x88ec,
    RED_INTEGER: 0x8d94,
    UNSIGNED_BYTE: 0x1401,
    UNPACK_ALIGNMENT: 0x0cf5,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    UNPACK_ROW_LENGTH: 0x0cf2,
    UNPACK_IMAGE_HEIGHT: 0x806e,
    UNPACK_SKIP_PIXELS: 0x0cf4,
    UNPACK_SKIP_ROWS: 0x0cf3,
    UNPACK_SKIP_IMAGES: 0x806d,
    getParameter: (key: number) => pixelStore.get(key) ?? 0,
    bindBuffer: () => undefined,
    pixelStorei: (key: number, value: number | boolean) => {
      pixelStore.set(key, value);
    },
    texSubImage3D: (...args: unknown[]) => {
      texSubImageCalls.push(args);
    },
  };
  return {
    texSubImageCalls,
    renderer: {
      getContext: () => gl,
      properties: {
        has: () => true,
        get: () => ({ __webglTexture: {} }),
      },
      state: {
        activeTexture: () => undefined,
        bindTexture: () => undefined,
      },
    },
  };
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const state = mesh.ensureEditorState(5000);
  const accumulator = new SplatAccumulator();
  const mapping = [
    {
      node: mesh,
      version: 0,
      sortVersion: 0,
      styleVersion: 0,
      mappingVersion: 0,
      base: 0,
      count: 5000,
    },
  ];

  state.selectCandidates([2, 4099], "add");
  state.uploadDirtyWithResult();
  assert.ok(state.getRenderDirtyRanges().length > 0);

  assert.strictEqual(accumulator.updateEditorStateTexture({ mapping }), true);
  assert.strictEqual(accumulator.editorStateVisibleCount, 5000);
  assert.strictEqual(accumulator.editorStateData[2], 1);
  assert.strictEqual(accumulator.editorStateData[4099], 1);
  assert.deepStrictEqual(state.getRenderDirtyRanges(), []);

  const texture = accumulator.editorStateTexture;
  assert.ok(texture);
  texture.needsUpdate = false;
  state.selectCandidates([7], "set");
  state.uploadDirtyWithResult();
  assert.deepStrictEqual(state.getDirtyRanges(), []);
  assert.ok(state.getRenderDirtyRanges().length > 0);

  const { renderer, texSubImageCalls } = createMockRenderer();
  assert.strictEqual(
    accumulator.updateEditorStateTexture({ mapping, renderer }),
    true,
  );
  assert.strictEqual(accumulator.editorStateData[7], 1);
  assert.strictEqual(accumulator.editorStateData[2], 0);
  assert.strictEqual(accumulator.editorStateData[4099], 0);
  assert.strictEqual(accumulator.editorStateVisibleCount, 5000);
  assert.deepStrictEqual(state.getRenderDirtyRanges(), []);
  assert.strictEqual(texSubImageCalls.length, 2);
  assert.deepStrictEqual(
    texSubImageCalls[0].slice(0, 10),
    [0x8c1a, 0, 0, 0, 0, 2048, 1, 1, 0x8d94, 0x1401],
  );
  assert.deepStrictEqual(
    texSubImageCalls[1].slice(0, 10),
    [0x8c1a, 0, 0, 2, 0, 2048, 1, 1, 0x8d94, 0x1401],
  );
  assert.strictEqual((texSubImageCalls[0][10] as Uint8Array).length, 2048);
  assert.strictEqual((texSubImageCalls[1][10] as Uint8Array).length, 2048);

  accumulator.dispose();
  mesh.dispose();
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const state = mesh.ensureEditorState(4);
  const accumulator = new SplatAccumulator();
  const mapping = [
    {
      node: mesh,
      version: 0,
      sortVersion: 0,
      styleVersion: 0,
      mappingVersion: 0,
      base: 0,
      count: 4,
    },
  ];

  state.selectAll();

  assert.strictEqual(accumulator.updateEditorStateTexture({ mapping }), true);
  assert.strictEqual(
    accumulator.editorStateUniformValue,
    SPLAT_EDITOR_STATE_SELECTED,
  );
  assert.strictEqual(accumulator.editorStateVisibleCount, 4);
  assert.strictEqual(accumulator.editorStateTexture, null);
  assert.deepStrictEqual(state.getRenderDirtyRanges(), []);

  state.deleteSelected();

  assert.strictEqual(accumulator.updateEditorStateTexture({ mapping }), true);
  assert.strictEqual(
    accumulator.editorStateUniformValue,
    SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_DELETED,
  );
  assert.strictEqual(accumulator.editorStateVisibleCount, 0);
  assert.strictEqual(accumulator.editorStateTexture, null);

  state.replace([SPLAT_EDITOR_STATE_SELECTED, 0, 0, 0]);

  assert.strictEqual(accumulator.updateEditorStateTexture({ mapping }), true);
  assert.strictEqual(accumulator.editorStateUniformValue, null);
  assert.strictEqual(accumulator.editorStateVisibleCount, 4);
  assert.ok(accumulator.editorStateTexture);
  assert.strictEqual(
    accumulator.editorStateData[0],
    SPLAT_EDITOR_STATE_SELECTED,
  );

  state.selectAll();

  assert.strictEqual(accumulator.updateEditorStateTexture({ mapping }), true);
  assert.strictEqual(
    accumulator.editorStateUniformValue,
    SPLAT_EDITOR_STATE_SELECTED,
  );

  state.selectCandidates([1], "set");

  assert.strictEqual(accumulator.updateEditorStateTexture({ mapping }), true);
  assert.strictEqual(accumulator.editorStateUniformValue, null);
  assert.deepStrictEqual(
    [...accumulator.editorStateData.slice(0, 4)],
    [0, SPLAT_EDITOR_STATE_SELECTED, 0, 0],
  );

  accumulator.dispose();
  mesh.dispose();
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const state = mesh.ensureEditorState(5000);
  const accumulator = new SplatAccumulator();
  const mapping = [
    {
      node: mesh,
      version: 0,
      sortVersion: 0,
      styleVersion: 0,
      mappingVersion: 0,
      base: 0,
      count: 5000,
    },
  ];

  state.setList([2, 4099], SPLAT_EDITOR_STATE_DELETED, "set");

  assert.strictEqual(accumulator.updateEditorStateTexture({ mapping }), true);
  assert.strictEqual(accumulator.editorStateVisibleCount, 4998);
  assert.strictEqual(accumulator.editorStateUniformValue, null);
  assert.ok(accumulator.editorStateTexture);

  state.resetDeleted();

  assert.strictEqual(accumulator.updateEditorStateTexture({ mapping }), true);
  assert.strictEqual(accumulator.editorStateVisibleCount, 5000);
  assert.strictEqual(
    accumulator.editorStateUniformValue,
    SPLAT_EDITOR_STATE_NONE,
  );
  assert.ok(accumulator.editorStateTexture);

  accumulator.dispose();
  mesh.dispose();
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const plainMesh = new SplatMesh();
  const state = mesh.ensureEditorState(3);
  const accumulator = new SplatAccumulator();
  const mapping = [
    {
      node: plainMesh,
      version: 0,
      sortVersion: 0,
      styleVersion: 0,
      mappingVersion: 0,
      base: 0,
      count: 1,
    },
    {
      node: mesh,
      version: 0,
      sortVersion: 0,
      styleVersion: 0,
      mappingVersion: 0,
      base: 1,
      count: 3,
    },
    {
      node: plainMesh,
      version: 0,
      sortVersion: 0,
      styleVersion: 0,
      mappingVersion: 0,
      base: 4,
      count: 1,
    },
  ];

  state.selectAll();
  state.deleteSelected();

  assert.strictEqual(accumulator.updateEditorStateTexture({ mapping }), true);
  assert.strictEqual(accumulator.editorStateVisibleCount, 2);
  assert.strictEqual(accumulator.editorStateUniformValue, null);

  state.resetDeleted();

  assert.strictEqual(accumulator.updateEditorStateTexture({ mapping }), true);
  assert.strictEqual(accumulator.editorStateVisibleCount, 5);
  assert.strictEqual(accumulator.editorStateUniformValue, null);

  accumulator.dispose();
  plainMesh.dispose();
  mesh.dispose();
}

console.log("Splat editor accumulator upload tests passed");
