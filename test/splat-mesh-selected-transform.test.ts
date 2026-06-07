import assert from "node:assert";

import * as THREE from "three";

import { SplatMesh } from "../dist/spark.module.js";

function readVersions(mesh: SplatMesh) {
  return {
    version: mesh.version,
    sortVersion: mesh.sortVersion,
    styleVersion: mesh.styleVersion,
  };
}

function assertVector(
  actual: THREE.Vector3 | undefined,
  expected: THREE.Vector3,
): void {
  assert.ok(actual);
  assert.ok(actual.distanceTo(expected) < 1e-9);
}

function assertQuaternion(
  actual: THREE.Quaternion | undefined,
  expected: THREE.Quaternion,
): void {
  assert.ok(actual);
  assert.ok(Math.abs(actual.dot(expected)) > 1 - 1e-9);
}

{
  const mesh = new SplatMesh();
  const initial = readVersions(mesh);

  assert.strictEqual(mesh.getSelectedSplatTransform(), null);
  assert.strictEqual(mesh.clearSelectedSplatTransform(), false);
  assert.deepStrictEqual(readVersions(mesh), initial);

  const pivot = new THREE.Vector3(1, 2, 3);
  const translate = new THREE.Vector3(4, 5, 6);
  const rotate = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI / 4,
  );

  assert.strictEqual(
    mesh.setSelectedSplatTransform({
      pivot,
      translate,
      rotate,
      scale: 2,
    }),
    true,
  );
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version + 1,
    sortVersion: initial.sortVersion + 1,
    styleVersion: initial.styleVersion,
  });

  const snapshot = mesh.getSelectedSplatTransform();
  assertVector(snapshot?.pivot, pivot);
  assertVector(snapshot?.translate, translate);
  assertQuaternion(snapshot?.rotate, rotate);
  assert.strictEqual(snapshot?.scale, 2);
  assert.notStrictEqual(snapshot?.pivot, pivot);
  assert.notStrictEqual(snapshot?.translate, translate);
  assert.notStrictEqual(snapshot?.rotate, rotate);

  snapshot?.pivot.setScalar(99);
  assertVector(mesh.getSelectedSplatTransform()?.pivot, pivot);

  const unchanged = readVersions(mesh);
  assert.strictEqual(
    mesh.setSelectedSplatTransform({
      pivot,
      translate,
      rotate,
      scale: 2,
    }),
    false,
  );
  assert.deepStrictEqual(readVersions(mesh), unchanged);

  assert.strictEqual(mesh.clearSelectedSplatTransform(), true);
  assert.strictEqual(mesh.getSelectedSplatTransform(), null);
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version + 2,
    sortVersion: initial.sortVersion + 2,
    styleVersion: initial.styleVersion,
  });

  mesh.dispose();
}

{
  const mesh = new SplatMesh();

  assert.throws(
    () => mesh.setSelectedSplatTransform({ scale: 0 }),
    /scale must be finite and > 0/,
  );
  assert.throws(
    () =>
      mesh.setSelectedSplatTransform({
        pivot: new THREE.Vector3(Number.NaN, 0, 0),
      }),
    /pivot must be finite/,
  );
  assert.throws(
    () =>
      mesh.setSelectedSplatTransform({
        rotate: new THREE.Quaternion(0, 0, 0, 0),
      }),
    /rotation must be finite/,
  );
  assert.strictEqual(mesh.getSelectedSplatTransform(), null);

  mesh.dispose();
}

console.log("Splat mesh selected transform tests passed");
