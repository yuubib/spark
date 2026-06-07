import assert from "node:assert";

import * as THREE from "three";

import {
  PackedSplats,
  SPLAT_EDITOR_STATE_DELETED,
  SPLAT_EDITOR_STATE_LOCKED,
  SPLAT_EDITOR_STATE_SELECTED,
  SplatMesh,
} from "../dist/spark.module.js";

function createMesh(): SplatMesh {
  const splats = new PackedSplats();
  const identity = new THREE.Quaternion();
  const white = new THREE.Color(1, 1, 1);
  splats.pushSplat(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 1, 1),
    identity,
    1,
    white,
  );
  splats.pushSplat(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(1, 2, 3),
    identity,
    0.8,
    white,
  );
  splats.pushSplat(
    new THREE.Vector3(2, 0, 0),
    new THREE.Vector3(1, 1, 1),
    identity,
    0.6,
    white,
  );
  splats.pushSplat(
    new THREE.Vector3(3, 0, 0),
    new THREE.Vector3(1, 1, 1),
    identity,
    0.4,
    white,
  );
  return new SplatMesh({ packedSplats: splats });
}

function collectIndices(
  mesh: SplatMesh,
  options?: Parameters<SplatMesh["forEachSplatByState"]>[1],
): number[] {
  const indices: number[] = [];
  mesh.forEachSplatByState((index) => indices.push(index), options);
  return indices;
}

function assertVectorClose(
  actual: THREE.Vector3 | undefined,
  expected: THREE.Vector3,
  epsilon = 1e-9,
): void {
  assert.ok(actual);
  assert.ok(
    actual.distanceTo(expected) < epsilon,
    `${actual.toArray()} differs from ${expected.toArray()}`,
  );
}

{
  const mesh = createMesh();
  assert.deepStrictEqual(collectIndices(mesh), [0, 1, 2, 3]);
  assert.deepStrictEqual(collectIndices(mesh, { mode: "selected" }), []);
  mesh.dispose();
}

{
  const mesh = createMesh();
  mesh.setSplatState(1, SPLAT_EDITOR_STATE_SELECTED);
  mesh.setSplatState(2, SPLAT_EDITOR_STATE_LOCKED);
  mesh.setSplatState(3, SPLAT_EDITOR_STATE_DELETED);

  assert.deepStrictEqual(collectIndices(mesh), [0, 1, 2]);
  assert.deepStrictEqual(collectIndices(mesh, { mode: "all" }), [0, 1, 2, 3]);
  assert.deepStrictEqual(collectIndices(mesh, { mode: "selected" }), [1]);
  assert.deepStrictEqual(collectIndices(mesh, { mode: "editable" }), [0, 1]);
  assert.deepStrictEqual(collectIndices(mesh, { mode: "pick-add" }), [0]);
  assert.deepStrictEqual(collectIndices(mesh, { mode: "pick-remove" }), [1]);

  const states: number[] = [];
  mesh.forEachSplatByState(
    (_, _center, _scales, _quaternion, _opacity, _color, state) =>
      states.push(state),
  );
  assert.deepStrictEqual(states, [
    0,
    SPLAT_EDITOR_STATE_SELECTED,
    SPLAT_EDITOR_STATE_LOCKED,
  ]);
  mesh.dispose();
}

{
  const mesh = createMesh();
  mesh.setSplatState(1, SPLAT_EDITOR_STATE_SELECTED);
  const rawSourceSplat = mesh.packedSplats?.getSplat(1);
  assert.ok(rawSourceSplat);
  const rawSourceScales = rawSourceSplat.scales.clone();
  const rotate = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    Math.PI / 2,
  );
  mesh.setSelectedSplatTransform({
    translate: new THREE.Vector3(10, 0, 0),
    rotate,
    scale: 2,
  });

  const rawCenters: THREE.Vector3[] = [];
  mesh.forEachSplatByState(
    (_index, center) => {
      rawCenters.push(center.clone());
    },
    { mode: "selected" },
  );
  assert.deepStrictEqual(
    rawCenters.map((center) => center.toArray()),
    [[1, 0, 0]],
  );

  const transformed: {
    center: THREE.Vector3;
    scales: THREE.Vector3;
    quaternion: THREE.Quaternion;
  }[] = [];
  mesh.forEachSplatByState(
    (_index, center, scales, quaternion) => {
      transformed.push({
        center: center.clone(),
        scales: scales.clone(),
        quaternion: quaternion.clone(),
      });
    },
    { mode: "selected", applySelectedTransform: true },
  );

  assert.strictEqual(transformed.length, 1);
  assertVectorClose(transformed[0].center, new THREE.Vector3(10, 2, 0));
  assertVectorClose(
    transformed[0].scales,
    rawSourceScales.clone().multiplyScalar(2),
  );
  assert.ok(Math.abs(transformed[0].quaternion.dot(rotate)) > 1 - 1e-9);

  const sourceSplat = mesh.packedSplats?.getSplat(1);
  assert.ok(sourceSplat);
  assert.deepStrictEqual(sourceSplat.center.toArray(), [1, 0, 0]);
  assertVectorClose(sourceSplat.scales, rawSourceScales);

  mesh.dispose();
}

console.log("Splat mesh state iteration tests passed");
