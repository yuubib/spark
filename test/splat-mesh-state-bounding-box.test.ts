import assert from "node:assert";

import * as THREE from "three";

import {
  SPLAT_EDITOR_STATE_DELETED,
  SPLAT_EDITOR_STATE_SELECTED,
  SplatEditorState,
  SplatMesh,
  type SplatSource,
} from "../dist/spark.module.js";

function assertVectorClose(
  actual: THREE.Vector3,
  expected: THREE.Vector3,
  epsilon = 1e-9,
): void {
  assert.ok(
    actual.distanceTo(expected) < epsilon,
    `${actual.toArray()} differs from ${expected.toArray()}`,
  );
}

await SplatMesh.staticInitialized;

{
  const mesh = new SplatMesh({
    constructSplats: (splats) => {
      splats.pushSplat(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 1, 1),
        new THREE.Quaternion(),
        1,
        new THREE.Color(1, 1, 1),
      );
      splats.pushSplat(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(1, 1, 1),
        new THREE.Quaternion(),
        1,
        new THREE.Color(1, 1, 1),
      );
    },
  });
  await mesh.initialized;
  mesh.setSplatState(1, SPLAT_EDITOR_STATE_SELECTED);
  mesh.setSelectedSplatTransform({
    translate: new THREE.Vector3(10, 0, 0),
    rotate: new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 2,
    ),
    scale: 2,
  });

  const sourceBounds = mesh.getSplatStateBoundingBox({
    centersOnly: true,
    mode: "selected",
  });
  assertVectorClose(sourceBounds.min, new THREE.Vector3(1, 0, 0));
  assertVectorClose(sourceBounds.max, new THREE.Vector3(1, 0, 0));

  const transformedBounds = mesh.getSplatStateBoundingBox({
    centersOnly: true,
    mode: "selected",
    applySelectedTransform: true,
  });
  assertVectorClose(transformedBounds.min, new THREE.Vector3(10, 2, 0));
  assertVectorClose(transformedBounds.max, new THREE.Vector3(10, 2, 0));

  const sourceSplat = mesh.packedSplats?.getSplat(1);
  assert.ok(sourceSplat);
  assertVectorClose(sourceSplat.center, new THREE.Vector3(1, 0, 0));

  mesh.dispose();
}

{
  const state = new SplatEditorState(2);
  state.set(1, SPLAT_EDITOR_STATE_SELECTED);
  const source: SplatSource = {
    prepareFetchSplat() {},
    dispose() {},
    getNumSplats: () => 2,
    hasRgbDir: () => false,
    getNumSh: () => 0,
    setMaxSh() {},
    fetchSplat() {
      throw new Error("fetchSplat is not used by this test");
    },
    getEditorState: () => state,
    ensureEditorState: () => state,
    forEachSplat(callback) {
      callback(
        0,
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 1, 1),
        new THREE.Quaternion(),
        1,
        new THREE.Color(1, 1, 1),
      );
      callback(
        1,
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(1, 2, 3),
        new THREE.Quaternion(),
        1,
        new THREE.Color(1, 1, 1),
      );
    },
  };
  const mesh = new SplatMesh({ splats: source });
  await mesh.initialized;
  mesh.setSelectedSplatTransform({
    translate: new THREE.Vector3(10, 0, 0),
    rotate: new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 2,
    ),
    scale: 2,
  });

  const sourceBounds = mesh.getSplatStateBoundingBox({
    centersOnly: false,
    mode: "selected",
  });
  assertVectorClose(sourceBounds.min, new THREE.Vector3(0, -2, -3));
  assertVectorClose(sourceBounds.max, new THREE.Vector3(2, 2, 3));

  const transformedBounds = mesh.getSplatStateBoundingBox({
    centersOnly: false,
    mode: "selected",
    applySelectedTransform: true,
  });
  assertVectorClose(transformedBounds.min, new THREE.Vector3(6, 0, -6));
  assertVectorClose(transformedBounds.max, new THREE.Vector3(14, 4, 6));

  mesh.dispose();
}

{
  const state = new SplatEditorState(1);
  state.set(0, SPLAT_EDITOR_STATE_SELECTED);
  let rawCenterCalls = 0;
  const source: SplatSource = {
    prepareFetchSplat() {},
    dispose() {},
    getNumSplats: () => 1,
    hasRgbDir: () => false,
    getNumSh: () => 0,
    setMaxSh() {},
    fetchSplat() {
      throw new Error("fetchSplat is not used by this test");
    },
    getEditorState: () => state,
    ensureEditorState: () => state,
    forEachSplat() {
      throw new Error("center-only state bounds should not decode full splats");
    },
    forEachSplatCenterRaw(callback) {
      rawCenterCalls += 1;
      callback(0, 1, 0, 0);
    },
  };
  const mesh = new SplatMesh({ splats: source });
  await mesh.initialized;
  mesh.setSelectedSplatTransform({
    translate: new THREE.Vector3(10, 0, 0),
    rotate: new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 2,
    ),
    scale: 2,
  });

  const bounds = mesh.getSplatStateBoundingBox({
    centersOnly: true,
    mode: "selected",
    applySelectedTransform: true,
  });
  assertVectorClose(bounds.min, new THREE.Vector3(10, 2, 0));
  assertVectorClose(bounds.max, new THREE.Vector3(10, 2, 0));
  assert.strictEqual(rawCenterCalls, 1);

  mesh.dispose();
}

{
  const state = new SplatEditorState(2);
  state.setRange(0, 2, SPLAT_EDITOR_STATE_DELETED);
  let rawCenterCalls = 0;
  const source: SplatSource = {
    prepareFetchSplat() {},
    dispose() {},
    getNumSplats: () => 2,
    hasRgbDir: () => false,
    getNumSh: () => 0,
    setMaxSh() {},
    fetchSplat() {
      throw new Error("fetchSplat is not used by this test");
    },
    getEditorState: () => state,
    ensureEditorState: () => state,
    forEachSplat() {
      throw new Error("deleted uniform state bounds should not decode splats");
    },
    forEachSplatCenterRaw() {
      rawCenterCalls += 1;
      throw new Error("deleted uniform state bounds should not read centers");
    },
  };
  const mesh = new SplatMesh({ splats: source });
  await mesh.initialized;

  const target = new THREE.Box3();
  target.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const bounds = mesh.getSplatStateBoundingBox({
    centersOnly: true,
    mode: "visible",
    target,
  });
  assert.strictEqual(bounds, target);
  assert.strictEqual(bounds.isEmpty(), true);
  assert.strictEqual(rawCenterCalls, 0);

  mesh.dispose();
}

{
  const state = new SplatEditorState(2);
  let rawCenterCalls = 0;
  const source: SplatSource = {
    prepareFetchSplat() {},
    dispose() {},
    getNumSplats: () => 2,
    hasRgbDir: () => false,
    getNumSh: () => 0,
    setMaxSh() {},
    fetchSplat() {
      throw new Error("fetchSplat is not used by this test");
    },
    getEditorState: () => state,
    ensureEditorState: () => state,
    forEachSplat() {
      throw new Error("center-only uniform bounds should not decode splats");
    },
    forEachSplatCenterRaw(callback) {
      rawCenterCalls += 1;
      callback(0, -1, 2, 0);
      callback(1, 3, -4, 5);
    },
  };
  const mesh = new SplatMesh({ splats: source });
  await mesh.initialized;

  const target = new THREE.Box3();
  const bounds = mesh.getSplatStateBoundingBox({
    centersOnly: true,
    mode: "visible",
    target,
  });
  assert.strictEqual(bounds, target);
  assertVectorClose(bounds.min, new THREE.Vector3(-1, -4, 0));
  assertVectorClose(bounds.max, new THREE.Vector3(3, 2, 5));
  assert.strictEqual(rawCenterCalls, 1);

  mesh.dispose();
}

console.log("Splat mesh state bounding box tests passed");
