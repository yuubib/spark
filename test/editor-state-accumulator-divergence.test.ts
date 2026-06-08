import assert from "node:assert";
import { test } from "node:test";

import {
  SPLAT_EDITOR_STATE_DELETED,
  SPLAT_EDITOR_STATE_SELECTED,
  SplatAccumulator,
  SplatMesh,
} from "../dist/spark.module.js";

// Regression: multi-accumulator editor-state divergence.
//
// The renderer keeps a pool of SplatAccumulators (display + current + free). Each owns its own
// editorStateData buffer, but the render-dirty ranges live on the single shared SplatEditorState and are
// consume-and-cleared by whichever accumulator syncs first. `createEditorStateMappingKey` excluded the
// state version, so an accumulator that did NOT consume a sparse edit kept stale bits and the incremental
// path never healed it — when the display rotated to that accumulator, selected/locked tints flickered
// and (worse) deleted splats reappeared. Fix: a per-accumulator last-synced version vs the state's
// renderDirtyBaseVersion forces a full copy for any accumulator that missed cleared edits.
//
// Each block builds two accumulators sharing ONE state, lets accumulator A consume+clear a sparse edit,
// then syncs accumulator B (which now sees EMPTY render-dirty ranges) and asserts B still reflects it.

function mappingFor(mesh: InstanceType<typeof SplatMesh>, count: number) {
  return [
    {
      node: mesh,
      version: 0,
      sortVersion: 0,
      styleVersion: 0,
      mappingVersion: 0,
      base: 0,
      count,
    },
  ];
}

test("a sparse SELECT edit consumed by one accumulator still reaches the others", () => {
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const state = mesh.ensureEditorState(5000);
  const mapping = mappingFor(mesh, 5000);
  const accA = new SplatAccumulator();
  const accB = new SplatAccumulator();

  // Both accumulators full-copy on their first sync (a baseline edit so the state is enabled).
  state.selectCandidates([2], "add");
  state.uploadDirtyWithResult();
  assert.strictEqual(accA.updateEditorStateTexture({ mapping }), true);
  assert.strictEqual(accB.updateEditorStateTexture({ mapping }), true);
  assert.strictEqual(accA.editorStateData[2], SPLAT_EDITOR_STATE_SELECTED);
  assert.strictEqual(accB.editorStateData[2], SPLAT_EDITOR_STATE_SELECTED);

  // Sparse edit: select splat 7. Accumulator A consumes + clears the shared render-dirty range.
  state.selectCandidates([7], "add");
  state.uploadDirtyWithResult();
  assert.ok(state.getRenderDirtyRanges().length > 0);
  accA.updateEditorStateTexture({ mapping });
  assert.strictEqual(accA.editorStateData[7], SPLAT_EDITOR_STATE_SELECTED);
  assert.deepStrictEqual(state.getRenderDirtyRanges(), []); // A cleared it

  // B now sees EMPTY render-dirty ranges. Pre-fix it stayed stale (editorStateData[7] === 0); the
  // version guard must force a full copy so B reflects the edit.
  accB.updateEditorStateTexture({ mapping });
  assert.strictEqual(
    accB.editorStateData[7],
    SPLAT_EDITOR_STATE_SELECTED,
    "accumulator B must reflect the edit consumed by A (divergence regression)",
  );
  assert.strictEqual(accB.editorStateData[2], SPLAT_EDITOR_STATE_SELECTED);

  accA.dispose();
  accB.dispose();
});

test("a sparse DELETE edit consumed by one accumulator still excludes the splat in the others", () => {
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const state = mesh.ensureEditorState(5000);
  const mapping = mappingFor(mesh, 5000);
  const accA = new SplatAccumulator();
  const accB = new SplatAccumulator();

  // Baseline sync of both.
  state.selectCandidates([1], "add");
  state.uploadDirtyWithResult();
  accA.updateEditorStateTexture({ mapping });
  accB.updateEditorStateTexture({ mapping });

  // Delete splat 42 (select then delete → SELECTED|DELETED). A consumes + clears.
  state.selectCandidates([42], "set");
  state.deleteSelected();
  state.uploadDirtyWithResult();
  accA.updateEditorStateTexture({ mapping });
  assert.ok((accA.editorStateData[42] & SPLAT_EDITOR_STATE_DELETED) !== 0);

  // B must also see the delete (else the deleted splat would reappear when B becomes the display).
  accB.updateEditorStateTexture({ mapping });
  assert.ok(
    (accB.editorStateData[42] & SPLAT_EDITOR_STATE_DELETED) !== 0,
    "accumulator B must exclude the deleted splat consumed by A (divergence regression)",
  );

  accA.dispose();
  accB.dispose();
});

test("the in-sync accumulator stays on the incremental path (no needless full copy)", () => {
  // Sanity: an accumulator that syncs every edit keeps catching up incrementally — the fix must NOT
  // force a full copy when the accumulator is already current (that would defeat the dirty-range path).
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const state = mesh.ensureEditorState(5000);
  const mapping = mappingFor(mesh, 5000);
  const acc = new SplatAccumulator();

  state.selectCandidates([3], "add");
  state.uploadDirtyWithResult();
  acc.updateEditorStateTexture({ mapping });
  assert.strictEqual(acc.editorStateData[3], SPLAT_EDITOR_STATE_SELECTED);

  for (let i = 10; i < 15; i += 1) {
    state.selectCandidates([i], "add");
    state.uploadDirtyWithResult();
    acc.updateEditorStateTexture({ mapping });
    assert.strictEqual(acc.editorStateData[i], SPLAT_EDITOR_STATE_SELECTED);
  }
  // Earlier edits remain intact across the incremental updates.
  assert.strictEqual(acc.editorStateData[3], SPLAT_EDITOR_STATE_SELECTED);

  acc.dispose();
});
