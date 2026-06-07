import assert from "node:assert";

import {
  SPLAT_EDITOR_STATE_DELETED,
  SPLAT_EDITOR_STATE_LOCKED,
  SPLAT_EDITOR_STATE_SELECTED,
  SplatMesh,
} from "../dist/spark.module.js";

{
  const mesh = new SplatMesh();
  const state = mesh.ensureEditorState(6);
  state.replace(
    new Uint8Array([
      SPLAT_EDITOR_STATE_SELECTED,
      SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
      SPLAT_EDITOR_STATE_DELETED,
      SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_DELETED,
      0,
      0,
    ]),
    6,
  );

  assert.deepStrictEqual(state.getSummary(), {
    total: 6,
    visible: 4,
    selectable: 3,
    selected: 1,
    locked: 1,
    deleted: 2,
  });
  assert.deepStrictEqual(mesh.getSplatStateSummary(), state.getSummary());

  mesh.dispose();
}

{
  const mesh = new SplatMesh();
  mesh.numSplats = 3;
  assert.deepStrictEqual(mesh.getSplatStateSummary(), {
    total: 3,
    visible: 3,
    selectable: 3,
    selected: 0,
    locked: 0,
    deleted: 0,
  });
  mesh.dispose();
}

console.log("Editor state summary tests passed");
