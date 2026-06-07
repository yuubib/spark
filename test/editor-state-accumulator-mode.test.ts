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

  mesh.deleteSelectedSplatState();
  assert.deepStrictEqual(mesh.listSplatStateIndices("deleted"), [0, 1, 2, 3]);
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version,
    sortVersion: initial.sortVersion,
    styleVersion: initial.styleVersion + 4,
  });

  mesh.resetDeletedSplatState();
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version,
    sortVersion: initial.sortVersion,
    styleVersion: initial.styleVersion + 5,
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
