import assert from "node:assert";
import { test } from "node:test";

import {
  SPLAT_EDITOR_STATE_SELECTED,
  SplatMesh,
} from "../dist/spark.module.js";

// Regression: markDirtyRange pushed one {start,count} object per call with no coalescing or cap, so
// per-splat brushing (setSplatStateBits in a loop) accumulated a range object per splat unboundedly
// until the next clear. Now adjacent edits coalesce, and a pathological scattered run collapses to a
// bounded full (dirty-all) upload.

test("markDirtyRange coalesces sequential edits into one range", () => {
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const state = mesh.ensureEditorState(5000);

  for (let i = 100; i < 250; i += 1) {
    state.setBits(i, SPLAT_EDITOR_STATE_SELECTED);
  }

  const ranges = state.getDirtyRanges();
  // Pre-fix: 150 separate range objects. Post-fix: a single contiguous range.
  assert.ok(
    ranges.length <= 2,
    `expected sequential edits to coalesce, got ${ranges.length} ranges`,
  );
  const covered = ranges.reduce((sum, r) => sum + r.count, 0);
  assert.ok(
    covered >= 150,
    `coalesced range must cover all edited splats, got ${covered}`,
  );
});

test("scattered per-splat edits stay bounded (collapse past the cap)", () => {
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const state = mesh.ensureEditorState(20000);

  // Every other splat → non-coalescible; pre-fix this was one range object each (unbounded).
  for (let i = 0; i < 4000; i += 2) {
    state.setBits(i, SPLAT_EDITOR_STATE_SELECTED);
  }

  const ranges = state.getDirtyRanges();
  // Bounded: capped range count, or collapsed to a single full-coverage (dirty-all) range.
  assert.ok(
    ranges.length <= 513,
    `dirty ranges must stay bounded, got ${ranges.length}`,
  );
});
