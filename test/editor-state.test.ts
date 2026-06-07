import assert from "node:assert";

import {
  SPLAT_EDITOR_STATE_DELETED,
  SPLAT_EDITOR_STATE_LOCKED,
  SPLAT_EDITOR_STATE_NONE,
  SPLAT_EDITOR_STATE_SELECTED,
  SplatEditorState,
  matchesSplatEditorStateBits,
  matchesSplatEditorStateIndexMode,
} from "../src/SplatEditorState.js";

{
  const state = new SplatEditorState(5);

  assert.strictEqual(state.get(0), SPLAT_EDITOR_STATE_NONE);
  assert.deepStrictEqual(state.getCounts(), {
    selected: 0,
    locked: 0,
    deleted: 0,
  });

  state.set(1, SPLAT_EDITOR_STATE_SELECTED);
  state.setBits(2, SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED);
  state.setRange(3, 2, SPLAT_EDITOR_STATE_DELETED, "set");

  assert.deepStrictEqual(state.getCounts(), {
    selected: 1,
    locked: 1,
    deleted: 2,
  });

  state.clearBits(2, SPLAT_EDITOR_STATE_SELECTED);
  state.setList([1, 3], SPLAT_EDITOR_STATE_SELECTED, "toggle");

  assert.strictEqual(state.get(1), SPLAT_EDITOR_STATE_NONE);
  assert.strictEqual(
    state.get(3),
    SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_DELETED,
  );
  assert.deepStrictEqual(state.getCounts(), {
    selected: 0,
    locked: 1,
    deleted: 2,
  });

  assert.ok(state.getDirtyRanges().length > 0);
  const texture = state.uploadDirty();
  assert.strictEqual(texture.image.data, state.states);
  assert.deepStrictEqual(state.getDirtyRanges(), []);
}

{
  const state = new SplatEditorState(4);
  state.uploadDirty();

  state.replace(
    new Uint8Array([
      SPLAT_EDITOR_STATE_SELECTED,
      SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
      SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_NONE,
    ]),
  );

  assert.strictEqual(state.get(0), SPLAT_EDITOR_STATE_SELECTED);
  assert.strictEqual(
    state.get(1),
    SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
  );
  assert.strictEqual(
    state.get(2),
    SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_DELETED,
  );
  assert.deepStrictEqual(state.getCounts(), {
    selected: 1,
    locked: 1,
    deleted: 1,
  });
  assert.strictEqual(state.visibilityVersion, 1);
  assert.deepStrictEqual(state.getDirtyRanges(), [
    { start: 0, count: state.maxSplats },
  ]);

  const version = state.version;
  const visibilityVersion = state.visibilityVersion;
  state.uploadDirty();
  state.replace(
    new Uint8Array([
      SPLAT_EDITOR_STATE_SELECTED,
      SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
      SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_NONE,
    ]),
  );

  assert.strictEqual(state.version, version);
  assert.strictEqual(state.visibilityVersion, visibilityVersion);
  assert.deepStrictEqual(state.getDirtyRanges(), []);

  state.replace(
    new Uint8Array([SPLAT_EDITOR_STATE_SELECTED, SPLAT_EDITOR_STATE_NONE]),
    2,
  );

  assert.strictEqual(state.get(0), SPLAT_EDITOR_STATE_SELECTED);
  assert.strictEqual(state.get(1), SPLAT_EDITOR_STATE_NONE);
  assert.strictEqual(state.get(2), SPLAT_EDITOR_STATE_NONE);
  assert.strictEqual(state.get(3), SPLAT_EDITOR_STATE_NONE);
  assert.deepStrictEqual(state.getCounts(), {
    selected: 1,
    locked: 0,
    deleted: 0,
  });
  assert.strictEqual(state.visibilityVersion, visibilityVersion + 1);
  assert.deepStrictEqual(state.getDirtyRanges(), [
    { start: 0, count: state.maxSplats },
  ]);
}

{
  const state = new SplatEditorState(3);
  assert.ok(state.maxSplats >= state.numSplats);
  state.uploadDirty();

  const result = state.selectAll();
  assert.strictEqual(result.changed, 3);
  assert.deepStrictEqual(result.counts, {
    selected: 3,
    locked: 0,
    deleted: 0,
  });
  assert.strictEqual(state.get(0), SPLAT_EDITOR_STATE_SELECTED);
  assert.strictEqual(state.get(2), SPLAT_EDITOR_STATE_SELECTED);
  assert.strictEqual(state.states[3], SPLAT_EDITOR_STATE_NONE);
  assert.deepStrictEqual(state.getDirtyRanges(), [{ start: 0, count: 3 }]);

  const version = state.version;
  assert.strictEqual(state.selectCandidates([0, 1, 2], "add").changed, 0);
  assert.strictEqual(state.version, version);
}

{
  const state = new SplatEditorState(6);
  state.replace(
    new Uint8Array([
      SPLAT_EDITOR_STATE_SELECTED,
      SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
      SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_SELECTED,
      SPLAT_EDITOR_STATE_NONE,
      SPLAT_EDITOR_STATE_NONE,
    ]),
    6,
  );
  state.uploadDirty();
  const visibilityVersion = state.visibilityVersion;

  const setResult = state.selectCandidates([4, 1, 2], "set");
  assert.strictEqual(setResult.changed, 3);
  assert.strictEqual(state.get(0), SPLAT_EDITOR_STATE_NONE);
  assert.strictEqual(
    state.get(1),
    SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
  );
  assert.strictEqual(state.get(2), SPLAT_EDITOR_STATE_DELETED);
  assert.strictEqual(state.get(3), SPLAT_EDITOR_STATE_NONE);
  assert.strictEqual(state.get(4), SPLAT_EDITOR_STATE_SELECTED);
  assert.deepStrictEqual(setResult.counts, {
    selected: 1,
    locked: 1,
    deleted: 1,
  });
  assert.strictEqual(state.visibilityVersion, visibilityVersion);

  state.uploadDirty();
  const addResult = state.selectCandidates([0, 1, 2, 4, 99], "add");
  assert.strictEqual(addResult.changed, 1);
  assert.strictEqual(state.get(0), SPLAT_EDITOR_STATE_SELECTED);
  assert.strictEqual(
    state.get(1),
    SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
  );
  assert.strictEqual(state.get(2), SPLAT_EDITOR_STATE_DELETED);
  assert.strictEqual(state.get(4), SPLAT_EDITOR_STATE_SELECTED);
  assert.deepStrictEqual(addResult.counts, {
    selected: 2,
    locked: 1,
    deleted: 1,
  });

  const removeResult = state.selectCandidates([0, 1, 4], "remove");
  assert.strictEqual(removeResult.changed, 2);
  assert.strictEqual(state.get(0), SPLAT_EDITOR_STATE_NONE);
  assert.strictEqual(
    state.get(1),
    SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
  );
  assert.strictEqual(state.get(4), SPLAT_EDITOR_STATE_NONE);
  assert.deepStrictEqual(removeResult.counts, {
    selected: 0,
    locked: 1,
    deleted: 1,
  });
  assert.strictEqual(state.visibilityVersion, visibilityVersion);
}

{
  const state = new SplatEditorState(64);
  state.replace(
    new Uint8Array([
      SPLAT_EDITOR_STATE_SELECTED,
      SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
      SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_SELECTED,
      SPLAT_EDITOR_STATE_NONE,
      SPLAT_EDITOR_STATE_NONE,
    ]),
    64,
  );
  state.uploadDirty();
  state.clearRenderDirtyRanges();

  const result = state.selectCandidates([4], "set");
  assert.strictEqual(result.changed, 3);
  assert.deepStrictEqual(state.getDirtyRanges(), [
    { start: 0, count: 1 },
    { start: 3, count: 2 },
  ]);
  assert.deepStrictEqual(state.getRenderDirtyRanges(), [
    { start: 0, count: 1 },
    { start: 3, count: 2 },
  ]);
  assert.deepStrictEqual(state.listIndices("selected"), [4]);
  assert.deepStrictEqual(
    state.listIndices("unselected-selectable"),
    [
      0, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
      23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
      41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58,
      59, 60, 61, 62, 63,
    ],
  );
  assert.deepStrictEqual(state.listIndices("locked"), [1]);
  assert.deepStrictEqual(state.listIndices("deleted"), [2]);

  state.uploadDirty();
  state.clearRenderDirtyRanges();
  const deleteResult = state.deleteSelected();
  assert.strictEqual(deleteResult.changed, 1);
  assert.deepStrictEqual(state.getDirtyRanges(), [{ start: 4, count: 1 }]);
  assert.strictEqual(state.visibilityVersion, 2);

  state.uploadDirty();
  state.clearRenderDirtyRanges();
  const resetResult = state.resetDeleted();
  assert.strictEqual(resetResult.changed, 2);
  assert.deepStrictEqual(state.getDirtyRanges(), [
    { start: 2, count: 1 },
    { start: 4, count: 1 },
  ]);
}

{
  const state = new SplatEditorState(64);
  state.uploadDirty();
  state.clearRenderDirtyRanges();
  state.selectAll();
  assert.deepStrictEqual(state.getDirtyRanges(), [{ start: 0, count: 64 }]);
}

{
  const state = new SplatEditorState(6);
  state.replace(
    new Uint8Array([
      SPLAT_EDITOR_STATE_SELECTED,
      SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
      SPLAT_EDITOR_STATE_LOCKED,
      SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_NONE,
      SPLAT_EDITOR_STATE_SELECTED,
    ]),
    6,
  );
  state.uploadDirty();
  const visibilityVersion = state.visibilityVersion;

  const hideResult = state.hideSelected();
  assert.strictEqual(hideResult.changed, 2);
  assert.strictEqual(
    state.get(0),
    SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
  );
  assert.strictEqual(
    state.get(5),
    SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
  );
  assert.deepStrictEqual(hideResult.counts, {
    selected: 0,
    locked: 4,
    deleted: 1,
  });
  assert.strictEqual(state.visibilityVersion, visibilityVersion);

  const unhideResult = state.unhideAll();
  assert.strictEqual(unhideResult.changed, 4);
  assert.strictEqual(state.get(0), SPLAT_EDITOR_STATE_SELECTED);
  assert.strictEqual(state.get(1), SPLAT_EDITOR_STATE_SELECTED);
  assert.strictEqual(state.get(2), SPLAT_EDITOR_STATE_NONE);
  assert.strictEqual(state.get(5), SPLAT_EDITOR_STATE_SELECTED);
  assert.deepStrictEqual(unhideResult.counts, {
    selected: 3,
    locked: 0,
    deleted: 1,
  });
  assert.strictEqual(state.visibilityVersion, visibilityVersion);

  const deleteResult = state.deleteSelected();
  assert.strictEqual(deleteResult.changed, 3);
  assert.deepStrictEqual(deleteResult.counts, {
    selected: 0,
    locked: 0,
    deleted: 4,
  });
  assert.strictEqual(state.visibilityVersion, visibilityVersion + 3);

  const resetResult = state.resetDeleted();
  assert.strictEqual(resetResult.changed, 4);
  assert.strictEqual(state.get(0), SPLAT_EDITOR_STATE_SELECTED);
  assert.strictEqual(state.get(1), SPLAT_EDITOR_STATE_SELECTED);
  assert.strictEqual(state.get(3), SPLAT_EDITOR_STATE_NONE);
  assert.strictEqual(state.get(5), SPLAT_EDITOR_STATE_SELECTED);
  assert.deepStrictEqual(resetResult.counts, {
    selected: 3,
    locked: 0,
    deleted: 0,
  });
  assert.strictEqual(state.visibilityVersion, visibilityVersion + 7);

  const cropResult = state.cropToSelection();
  assert.strictEqual(cropResult.changed, 3);
  assert.deepStrictEqual(cropResult.counts, {
    selected: 3,
    locked: 0,
    deleted: 3,
  });
  assert.strictEqual(state.visibilityVersion, visibilityVersion + 10);
}

{
  assert.strictEqual(matchesSplatEditorStateBits(0, "all"), true);
  assert.strictEqual(matchesSplatEditorStateBits(0, "visible"), true);
  assert.strictEqual(matchesSplatEditorStateBits(0, "editable"), true);
  assert.strictEqual(matchesSplatEditorStateBits(0, "pick-add"), true);
  assert.strictEqual(matchesSplatEditorStateBits(0, "pick-set"), true);
  assert.strictEqual(matchesSplatEditorStateBits(0, "pick-remove"), false);

  assert.strictEqual(
    matchesSplatEditorStateBits(SPLAT_EDITOR_STATE_SELECTED, "selected"),
    true,
  );
  assert.strictEqual(
    matchesSplatEditorStateBits(SPLAT_EDITOR_STATE_SELECTED, "pick-remove"),
    true,
  );
  assert.strictEqual(
    matchesSplatEditorStateBits(SPLAT_EDITOR_STATE_SELECTED, "pick-set"),
    true,
  );

  const lockedSelected =
    SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED;
  assert.strictEqual(
    matchesSplatEditorStateBits(lockedSelected, "visible"),
    true,
  );
  assert.strictEqual(
    matchesSplatEditorStateBits(lockedSelected, "selected"),
    false,
  );
  assert.strictEqual(
    matchesSplatEditorStateBits(lockedSelected, "pick-add"),
    false,
  );
  assert.strictEqual(
    matchesSplatEditorStateBits(lockedSelected, "pick-remove"),
    false,
  );
  assert.strictEqual(
    matchesSplatEditorStateBits(lockedSelected, "pick-set"),
    false,
  );

  const deletedSelected =
    SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_DELETED;
  assert.strictEqual(
    matchesSplatEditorStateBits(deletedSelected, "visible"),
    false,
  );
  assert.strictEqual(
    matchesSplatEditorStateBits(deletedSelected, "pick-set"),
    false,
  );

  assert.strictEqual(
    matchesSplatEditorStateIndexMode(SPLAT_EDITOR_STATE_SELECTED, "selected"),
    true,
  );
  assert.strictEqual(
    matchesSplatEditorStateIndexMode(
      SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
      "selected",
    ),
    false,
  );
  assert.strictEqual(
    matchesSplatEditorStateIndexMode(
      SPLAT_EDITOR_STATE_NONE,
      "unselected-selectable",
    ),
    true,
  );
  assert.strictEqual(
    matchesSplatEditorStateIndexMode(SPLAT_EDITOR_STATE_LOCKED, "locked"),
    true,
  );
  assert.strictEqual(
    matchesSplatEditorStateIndexMode(
      SPLAT_EDITOR_STATE_LOCKED | SPLAT_EDITOR_STATE_DELETED,
      "locked",
    ),
    false,
  );
  assert.strictEqual(
    matchesSplatEditorStateIndexMode(SPLAT_EDITOR_STATE_DELETED, "deleted"),
    true,
  );
}

{
  const state = new SplatEditorState(5000);
  const initialUpload = state.uploadDirtyWithResult();
  assert.strictEqual(initialUpload.mode, "full-texture");
  assert.deepStrictEqual(state.getDirtyRanges(), []);
  assert.deepStrictEqual(state.getRenderDirtyRanges(), [
    { start: 0, count: state.maxSplats },
  ]);
  state.clearRenderDirtyRanges();

  state.setList([4099, 2, 2], SPLAT_EDITOR_STATE_SELECTED, "set");

  assert.deepStrictEqual(state.getDirtyRanges(), [
    { start: 2, count: 1 },
    { start: 4099, count: 1 },
  ]);
  assert.deepStrictEqual(state.getDirtyUploadSpans(), [
    { layer: 0, row: 0, rowCount: 1, start: 0, count: 2048 },
    { layer: 0, row: 2, rowCount: 1, start: 4096, count: 2048 },
  ]);

  const fallbackUpload = state.uploadDirtyWithResult();
  assert.strictEqual(fallbackUpload.mode, "full-texture");
  assert.deepStrictEqual(fallbackUpload.ranges, [
    { start: 2, count: 1 },
    { start: 4099, count: 1 },
  ]);
  assert.deepStrictEqual(fallbackUpload.uploadSpans, [
    { layer: 0, row: 0, rowCount: 1, start: 0, count: 2048 },
    { layer: 0, row: 2, rowCount: 1, start: 4096, count: 2048 },
  ]);
  assert.deepStrictEqual(state.getDirtyRanges(), []);
  assert.deepStrictEqual(state.getRenderDirtyRanges(), [
    { start: 2, count: 1 },
    { start: 4099, count: 1 },
  ]);
  state.clearRenderDirtyRanges();
  assert.deepStrictEqual(state.getRenderDirtyRanges(), []);

  const noOpUpload = state.uploadDirtyWithResult();
  assert.strictEqual(noOpUpload.mode, "none");
}

{
  const state = new SplatEditorState(5000);
  const texture = state.uploadDirtyWithResult().texture;
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
    UNPACK_ALIGNMENT: 0x0cf5,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    UNPACK_ROW_LENGTH: 0x0cf2,
    UNPACK_IMAGE_HEIGHT: 0x806e,
    UNPACK_SKIP_PIXELS: 0x0cf4,
    UNPACK_SKIP_ROWS: 0x0cf3,
    UNPACK_SKIP_IMAGES: 0x806d,
    RED_INTEGER: 0x8d94,
    UNSIGNED_BYTE: 0x1401,
    bindBuffer() {},
    getParameter(pname: number) {
      return pixelStore.get(pname) ?? 0;
    },
    pixelStorei(pname: number, value: number | boolean) {
      pixelStore.set(pname, value);
    },
    texSubImage3D(...args: unknown[]) {
      texSubImageCalls.push(args);
    },
  };
  const renderer = {
    properties: {
      has(candidate: unknown) {
        return candidate === texture;
      },
      get(candidate: unknown) {
        assert.strictEqual(candidate, texture);
        return { __webglTexture: {} };
      },
    },
    state: {
      activeTexture(slot: number) {
        assert.strictEqual(slot, gl.TEXTURE0);
      },
      bindTexture(target: number) {
        assert.strictEqual(target, gl.TEXTURE_2D_ARRAY);
      },
    },
    getContext() {
      return gl;
    },
  };

  state.setList([2, 4099], SPLAT_EDITOR_STATE_SELECTED, "set");

  const upload = state.uploadDirtyWithResult(renderer as never);
  assert.strictEqual(upload.mode, "dirty-range");
  assert.deepStrictEqual(upload.uploadSpans, [
    { layer: 0, row: 0, rowCount: 1, start: 0, count: 2048 },
    { layer: 0, row: 2, rowCount: 1, start: 4096, count: 2048 },
  ]);
  assert.strictEqual(texSubImageCalls.length, 2);
  assert.deepStrictEqual(texSubImageCalls[0].slice(0, 10), [
    gl.TEXTURE_2D_ARRAY,
    0,
    0,
    0,
    0,
    2048,
    1,
    1,
    gl.RED_INTEGER,
    gl.UNSIGNED_BYTE,
  ]);
  assert.deepStrictEqual(texSubImageCalls[1].slice(0, 10), [
    gl.TEXTURE_2D_ARRAY,
    0,
    0,
    2,
    0,
    2048,
    1,
    1,
    gl.RED_INTEGER,
    gl.UNSIGNED_BYTE,
  ]);
  assert.strictEqual((texSubImageCalls[0][10] as Uint8Array).length, 2048);
  assert.strictEqual((texSubImageCalls[1][10] as Uint8Array).length, 2048);
  assert.deepStrictEqual(state.getDirtyRanges(), []);
}

{
  const state = new SplatEditorState(8);
  state.uploadDirty();

  assert.strictEqual(state.visibilityVersion, 0);
  state.setBits(1, SPLAT_EDITOR_STATE_SELECTED);
  state.setBits(1, SPLAT_EDITOR_STATE_LOCKED);
  assert.strictEqual(state.visibilityVersion, 0);

  state.setBits(1, SPLAT_EDITOR_STATE_DELETED);
  assert.strictEqual(state.visibilityVersion, 1);

  state.setBits(1, SPLAT_EDITOR_STATE_DELETED);
  assert.strictEqual(state.visibilityVersion, 1);

  state.clearBits(1, SPLAT_EDITOR_STATE_DELETED);
  assert.strictEqual(state.visibilityVersion, 2);

  state.setRange(2, 2, SPLAT_EDITOR_STATE_DELETED, "set");
  assert.strictEqual(state.visibilityVersion, 4);
  state.clear();
  assert.strictEqual(state.visibilityVersion, 5);
}

{
  const state = new SplatEditorState(12);
  state.uploadDirty();

  state.markDirtyList([7, 3, 4, 4]);

  assert.deepStrictEqual(state.getDirtyRanges(), [
    { start: 3, count: 2 },
    { start: 7, count: 1 },
  ]);
}

console.log("Splat editor state tests passed");
