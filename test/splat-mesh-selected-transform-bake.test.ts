import assert from "node:assert";

import * as THREE from "three";

import {
  PackedSplats,
  SPLAT_EDITOR_STATE_SELECTED,
  SplatEditorState,
  SplatMesh,
} from "../dist/spark.module.js";

function createMesh(): SplatMesh {
  const splats = new PackedSplats();
  const identity = new THREE.Quaternion();
  const white = new THREE.Color(1, 1, 1);
  const selectedColor = new THREE.Color(0.25, 0.5, 0.75);
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
    selectedColor,
  );
  return new SplatMesh({ packedSplats: splats });
}

function createFiveSplatMesh(): SplatMesh {
  const splats = new PackedSplats();
  const identity = new THREE.Quaternion();
  const white = new THREE.Color(1, 1, 1);
  for (let index = 0; index < 5; index += 1) {
    splats.pushSplat(
      new THREE.Vector3(index, 0, 0),
      new THREE.Vector3(1, 1, 1),
      identity,
      1,
      white,
    );
  }
  return new SplatMesh({ packedSplats: splats });
}

function assertVectorClose(
  actual: THREE.Vector3 | undefined,
  expected: THREE.Vector3,
  epsilon = 1e-6,
): void {
  assert.ok(actual);
  assert.ok(
    actual.distanceTo(expected) < epsilon,
    `${actual.toArray()} differs from ${expected.toArray()}`,
  );
}

function assertQuaternionClose(
  actual: THREE.Quaternion | undefined,
  expected: THREE.Quaternion,
  epsilon = 1e-6,
): void {
  assert.ok(actual);
  assert.ok(
    Math.abs(actual.dot(expected)) > 1 - epsilon,
    `${actual.toArray()} differs from ${expected.toArray()}`,
  );
}

function assertColorClose(
  actual: THREE.Color | undefined,
  expected: THREE.Color,
  epsilon = 1e-6,
): void {
  assert.ok(actual);
  assert.ok(
    Math.abs(actual.r - expected.r) < epsilon &&
      Math.abs(actual.g - expected.g) < epsilon &&
      Math.abs(actual.b - expected.b) < epsilon,
    `${actual.toArray()} differs from ${expected.toArray()}`,
  );
}

{
  const mesh = createMesh();
  const source = mesh.packedSplats;
  assert.ok(source);
  source.getTexture();
  source.needsUpdate = false;
  const untouchedBefore = source.getSplat(0);
  const untouchedScalesBefore = untouchedBefore.scales.clone();
  const selectedBefore = source.getSplat(1);
  const selectedScalesBefore = selectedBefore.scales.clone();
  const selectedColorBefore = selectedBefore.color.clone();
  assert.ok(source.packedArray);
  const selectedPackedRgbaBefore = source.packedArray[4];
  mesh.setSplatState(1, SPLAT_EDITOR_STATE_SELECTED);
  const rotate = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    Math.PI / 2,
  );
  mesh.setSelectedSplatTransform({
    translate: new THREE.Vector3(10, 0, 0),
    rotate,
    scale: 2,
  });
  const versionBefore = mesh.version;
  const sortVersionBefore = mesh.sortVersion;

  const originalSetSplat = source.setSplat;
  source.setSplat = (() => {
    throw new Error("packed selected transform bake should not call setSplat");
  }) as typeof source.setSplat;
  let result: ReturnType<SplatMesh["bakeSelectedSplatTransform"]>;
  try {
    result = mesh.bakeSelectedSplatTransform();
  } finally {
    source.setSplat = originalSetSplat;
  }

  assert.deepStrictEqual(result, {
    applied: true,
    changed: 1,
    selected: 1,
    cleared: true,
    unsupported: false,
  });
  assert.strictEqual(mesh.getSelectedSplatTransform(), null);
  assert.strictEqual(source.needsUpdate, true);
  assert.strictEqual(mesh.version, versionBefore + 2);
  assert.strictEqual(mesh.sortVersion, sortVersionBefore + 2);

  const untouched = source.getSplat(0);
  assertVectorClose(untouched.center, new THREE.Vector3(0, 0, 0));
  assertVectorClose(untouched.scales, untouchedScalesBefore);

  assert.strictEqual(source.packedArray[4], selectedPackedRgbaBefore);
  const baked = source.getSplat(1);
  assertVectorClose(baked.center, new THREE.Vector3(10, 2, 0));
  assertVectorClose(baked.scales, selectedScalesBefore.multiplyScalar(2), 0.3);
  assertQuaternionClose(baked.quaternion, rotate, 1e-4);
  assert.strictEqual(baked.opacity, 0.8);
  assertColorClose(baked.color, selectedColorBefore, 1e-2);

  mesh.dispose();
}

{
  const mesh = createMesh();
  const source = mesh.packedSplats;
  assert.ok(source);
  const rawCenters = new Float32Array(source.maxSplats * 3);
  rawCenters.set([0, 0, 0, 1.25, -2.5, 3.75]);
  source.centerMatchXyz = rawCenters;
  source.extra.centerMatchXyz = rawCenters;
  const texture = source.getCenterMatchTexture();
  assert.ok(texture);
  const textureData = texture.image.data as Float32Array;
  assert.deepStrictEqual(
    Array.from(textureData.slice(4, 8)),
    [1.25, -2.5, 3.75, 1],
  );
  mesh.setSplatState(1, SPLAT_EDITOR_STATE_SELECTED);
  mesh.setSelectedSplatTransform({
    translate: new THREE.Vector3(10, 0.5, -1),
  });

  const result = mesh.bakeSelectedSplatTransform();

  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.changed, 1);
  const rawCenter = { x: 0, y: 0, z: 0 };
  assert.strictEqual(mesh.getSplatCenterRaw(1, rawCenter), true);
  assert.deepStrictEqual(rawCenter, { x: 11.25, y: -2, z: 2.75 });
  assert.deepStrictEqual(
    Array.from(textureData.slice(4, 8)),
    [11.25, -2, 2.75, 1],
  );
  assert.strictEqual(source.getCenterMatchTexture(), texture);

  mesh.dispose();
}

{
  const mesh = createFiveSplatMesh();
  mesh.setSplatState(3, SPLAT_EDITOR_STATE_SELECTED);
  const editorState = mesh.getEditorState();
  assert.ok(editorState);
  editorState.listIndices = () => {
    throw new Error("selected transform bake should not list selected indices");
  };
  editorState.forEachIndex = () => {
    throw new Error("selected transform bake should use selected index cache");
  };
  mesh.setSelectedSplatTransform({
    translate: new THREE.Vector3(2, 0, 0),
  });

  const result = mesh.bakeSelectedSplatTransform();

  assert.deepStrictEqual(result, {
    applied: true,
    changed: 1,
    selected: 1,
    cleared: true,
    unsupported: false,
  });
  assertVectorClose(
    mesh.packedSplats?.getSplat(3).center,
    new THREE.Vector3(5, 0, 0),
  );
  assertVectorClose(
    mesh.packedSplats?.getSplat(2).center,
    new THREE.Vector3(2, 0, 0),
  );

  mesh.dispose();
}

{
  const mesh = createMesh();
  mesh.setSplatState(1, SPLAT_EDITOR_STATE_SELECTED);
  mesh.setSelectedSplatTransform({
    translate: new THREE.Vector3(1, 0, 0),
  });

  const result = mesh.bakeSelectedSplatTransform({ clear: false });

  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.changed, 1);
  assert.strictEqual(result.cleared, false);
  assert.notStrictEqual(mesh.getSelectedSplatTransform(), null);
  assertVectorClose(
    mesh.packedSplats?.getSplat(1).center,
    new THREE.Vector3(2, 0, 0),
  );

  mesh.dispose();
}

{
  const state = new SplatEditorState(1);
  state.set(0, SPLAT_EDITOR_STATE_SELECTED);
  const sourceQuaternion = new THREE.Quaternion(
    0,
    Math.sin(Math.PI / 8) * 2,
    0,
    Math.cos(Math.PI / 8) * 2,
  );
  const rotate = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI / 4,
  );
  let bakedQuaternion: THREE.Quaternion | null = null;
  const source = {
    prepareFetchSplat() {},
    dispose() {},
    getNumSplats: () => 1,
    hasRgbDir: () => false,
    getNumSh: () => 0,
    setMaxSh() {},
    getEditorState: () => state,
    ensureEditorState: () => state,
    fetchSplat: () => {
      throw new Error("not used");
    },
    forEachSplat() {},
    getSplat: () => ({
      center: new THREE.Vector3(),
      scales: new THREE.Vector3(1, 1, 1),
      quaternion: sourceQuaternion.clone(),
      opacity: 1,
      color: new THREE.Color(1, 1, 1),
    }),
    setSplat: (
      _index: number,
      _center: THREE.Vector3,
      _scales: THREE.Vector3,
      quaternion: THREE.Quaternion,
    ) => {
      bakedQuaternion = quaternion.clone();
    },
  };
  const mesh = new SplatMesh({ splats: source as never });
  mesh.setSelectedSplatTransform({ rotate });

  const result = mesh.bakeSelectedSplatTransform();

  assert.deepStrictEqual(result, {
    applied: true,
    changed: 1,
    selected: 1,
    cleared: true,
    unsupported: false,
  });
  assert.ok(bakedQuaternion);
  assert.ok(
    Math.abs(
      Math.hypot(
        bakedQuaternion.x,
        bakedQuaternion.y,
        bakedQuaternion.z,
        bakedQuaternion.w,
      ) - 1,
    ) < 1e-6,
  );
  assert.strictEqual(bakedQuaternion.x, 0);
  assert.strictEqual(bakedQuaternion.z, 0);
  assert.ok(Math.abs(bakedQuaternion.y - Math.sin(Math.PI / 4)) < 1e-6);
  assert.ok(Math.abs(bakedQuaternion.w - Math.cos(Math.PI / 4)) < 1e-6);

  mesh.dispose();
}

{
  const mesh = createMesh();
  mesh.setSplatState(1, SPLAT_EDITOR_STATE_SELECTED);

  const result = mesh.bakeSelectedSplatTransform();

  assert.deepStrictEqual(result, {
    applied: false,
    changed: 0,
    selected: 1,
    cleared: false,
    unsupported: false,
  });

  mesh.dispose();
}

{
  const state = new SplatEditorState(1);
  state.set(0, SPLAT_EDITOR_STATE_SELECTED);
  const source = {
    prepareFetchSplat() {},
    dispose() {},
    getNumSplats: () => 1,
    hasRgbDir: () => false,
    getNumSh: () => 0,
    setMaxSh() {},
    getEditorState: () => state,
    ensureEditorState: () => state,
    fetchSplat: () => {
      throw new Error("not used");
    },
    forEachSplat() {},
  };
  const mesh = new SplatMesh({ splats: source as never });
  mesh.setSelectedSplatTransform({
    translate: new THREE.Vector3(1, 0, 0),
  });

  const result = mesh.bakeSelectedSplatTransform();

  assert.deepStrictEqual(result, {
    applied: false,
    changed: 0,
    selected: 1,
    cleared: false,
    unsupported: true,
  });
  assert.notStrictEqual(mesh.getSelectedSplatTransform(), null);

  mesh.dispose();
}

console.log("Splat mesh selected transform bake tests passed");
