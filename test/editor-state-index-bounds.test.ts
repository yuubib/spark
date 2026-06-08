import assert from "node:assert";
import { test } from "node:test";

import {
  SPLAT_EDITOR_STATE_SELECTED,
  SplatMesh,
} from "../dist/spark.module.js";

// Regression: setUnchecked ran its selected/locked/deleted count + index-set bookkeeping
// unconditionally. The single-index public setters bound the index against maxSplats — the texture-
// PADDED capacity (e.g. 2048 for 100 splats) — so a write into the padding region [numSplats, maxSplats)
// passed, then bumped the counts for a splat that does not exist, corrupting getCounts()/getSummary()
// and every count-based fast path. The state byte may still be written (padding is never uploaded or
// rendered), but the counts must stay tied to real splats only.
test("writes into the padding region [numSplats, maxSplats) do not corrupt counts", () => {
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const state = mesh.ensureEditorState(100); // numSplats=100; texture padding makes maxSplats >> 100
  assert.ok(
    state.maxSplats > state.numSplats,
    "test needs a padded capacity (maxSplats > numSplats)",
  );

  // A valid in-range write counts correctly.
  state.set(50, SPLAT_EDITOR_STATE_SELECTED);
  assert.strictEqual(state.getCounts().selected, 1);

  // Writes at/after numSplats but within the padded capacity used to each bump `selected`.
  const padA = state.numSplats; // first padding index (100)
  const padB = Math.floor((state.numSplats + state.maxSplats) / 2); // mid-padding
  const padC = state.maxSplats - 1; // last padding index
  state.set(padA, SPLAT_EDITOR_STATE_SELECTED);
  state.set(padB, SPLAT_EDITOR_STATE_SELECTED);
  state.setBits(padC, SPLAT_EDITOR_STATE_SELECTED);

  // Counts reflect ONLY the one real selection — padding writes left them untouched.
  assert.deepStrictEqual(state.getCounts(), {
    selected: 1,
    locked: 0,
    deleted: 0,
  });
  // And the real splat's state is intact.
  assert.strictEqual(state.get(50), SPLAT_EDITOR_STATE_SELECTED);
});
