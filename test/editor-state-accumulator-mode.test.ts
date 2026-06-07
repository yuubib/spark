import assert from "node:assert";

import { SplatMesh } from "../dist/spark.module.js";

function readVersions(mesh: InstanceType<typeof SplatMesh>) {
  return {
    version: mesh.version,
    sortVersion: mesh.sortVersion,
    styleVersion: mesh.styleVersion,
  };
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  mesh.ensureEditorState(4);
  const initial = readVersions(mesh);

  const selectResult = mesh.selectAllSplatState({ recordChanges: true });
  assert.deepStrictEqual(selectResult.changes, [
    { index: 0, previous: 0, next: 1 },
    { index: 1, previous: 0, next: 1 },
    { index: 2, previous: 0, next: 1 },
    { index: 3, previous: 0, next: 1 },
  ]);
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [0, 1, 2, 3]);
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version,
    sortVersion: initial.sortVersion,
    styleVersion: initial.styleVersion + 1,
  });

  mesh.applySplatStateChanges(selectResult.changes ?? [], "previous");
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), []);
  mesh.applySplatStateChanges(selectResult.changes ?? [], "next");
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [0, 1, 2, 3]);

  const clearResult = mesh.clearSplatStateSelection({
    recordChanges: true,
    changeFormat: "compact",
  });
  assert.strictEqual(clearResult.changes, undefined);
  assert.deepStrictEqual(clearResult.changeSet, {
    kind: "uniform",
    start: 0,
    count: 4,
    previous: 1,
    next: 0,
    changed: 4,
  });
  assert.ok(clearResult.changeSet);
  mesh.applySplatStateChangeSet(clearResult.changeSet, "previous");
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [0, 1, 2, 3]);
  mesh.applySplatStateChangeSet(clearResult.changeSet, "next");
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), []);
  mesh.applySplatStateChangeSet(clearResult.changeSet, "previous");
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [0, 1, 2, 3]);

  const beforeDelete = readVersions(mesh);
  mesh.deleteSelectedSplatState();
  assert.deepStrictEqual(mesh.listSplatStateIndices("deleted"), [0, 1, 2, 3]);
  assert.deepStrictEqual(readVersions(mesh), {
    version: beforeDelete.version,
    sortVersion: beforeDelete.sortVersion,
    styleVersion: beforeDelete.styleVersion + 1,
  });

  const beforeReset = readVersions(mesh);
  mesh.resetDeletedSplatState();
  assert.deepStrictEqual(readVersions(mesh), {
    version: beforeReset.version,
    sortVersion: beforeReset.sortVersion,
    styleVersion: beforeReset.styleVersion + 1,
  });

  mesh.dispose();
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  mesh.ensureEditorState(8);
  mesh.selectSplatStateCandidates([1, 6], "add");
  const initial = readVersions(mesh);

  const selectResult = mesh.selectSplatStateCandidates([3], "set", {
    recordChanges: true,
  });

  assert.deepStrictEqual(selectResult.changes, [
    { index: 1, previous: 1, next: 0 },
    { index: 3, previous: 0, next: 1 },
    { index: 6, previous: 1, next: 0 },
  ]);
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [3]);
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version,
    sortVersion: initial.sortVersion,
    styleVersion: initial.styleVersion + 1,
  });

  mesh.dispose();
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "generator" });
  mesh.ensureEditorState(4);
  const initial = readVersions(mesh);

  mesh.selectAllSplatState();
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version + 1,
    sortVersion: initial.sortVersion,
    styleVersion: initial.styleVersion,
  });

  mesh.deleteSelectedSplatState();
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version + 2,
    sortVersion: initial.sortVersion + 1,
    styleVersion: initial.styleVersion,
  });

  mesh.dispose();
}

console.log("Splat editor accumulator mode tests passed");
