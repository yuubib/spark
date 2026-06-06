import assert from "node:assert";

import {
  SPLAT_EDITOR_STATE_DELETED,
  SPLAT_EDITOR_STATE_LOCKED,
  SPLAT_EDITOR_STATE_NONE,
  SPLAT_EDITOR_STATE_SELECTED,
  SplatEditorState,
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
    selected: 2,
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
    selected: 1,
    locked: 1,
    deleted: 2,
  });

  assert.ok(state.getDirtyRanges().length > 0);
  const texture = state.uploadDirty();
  assert.strictEqual(texture.image.data, state.states);
  assert.deepStrictEqual(state.getDirtyRanges(), []);
}

console.log("Splat editor state tests passed");
