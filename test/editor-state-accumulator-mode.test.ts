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

  mesh.selectAllSplatState();
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [0, 1, 2, 3]);
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version,
    sortVersion: initial.sortVersion,
    styleVersion: initial.styleVersion + 1,
  });

  mesh.deleteSelectedSplatState();
  assert.deepStrictEqual(mesh.listSplatStateIndices("deleted"), [0, 1, 2, 3]);
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version,
    sortVersion: initial.sortVersion,
    styleVersion: initial.styleVersion + 2,
  });

  mesh.resetDeletedSplatState();
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version,
    sortVersion: initial.sortVersion,
    styleVersion: initial.styleVersion + 3,
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
