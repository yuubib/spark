import assert from "node:assert";

import * as THREE from "three";

import {
  ExtSplats,
  PackedSplats,
  SPLAT_EDITOR_STATE_DELETED,
  SplatMesh,
  type SplatSource,
} from "../dist/spark.module.js";

const splat = (
  source: PackedSplats | ExtSplats,
  center: THREE.Vector3,
  color = new THREE.Color(1, 0, 0),
) => {
  source.pushSplat(
    center,
    new THREE.Vector3(0.25, 0.5, 0.75),
    new THREE.Quaternion(),
    0.8,
    color,
  );
};

const collectCenters = (
  each: (callback: (index: number, center: THREE.Vector3) => void) => void,
) => {
  const values: Array<[number, number, number, number]> = [];
  each((index, center) => {
    values.push([index, center.x, center.y, center.z]);
  });
  return values;
};

const collectRawCenters = (
  each: (
    callback: (index: number, x: number, y: number, z: number) => void,
  ) => void,
) => {
  const values: Array<[number, number, number, number]> = [];
  each((index, x, y, z) => {
    values.push([index, x, y, z]);
  });
  return values;
};

{
  const packed = new PackedSplats();
  splat(packed, new THREE.Vector3(1, 2, 3));
  splat(packed, new THREE.Vector3(-4, 5, -6));

  assert.deepStrictEqual(
    collectCenters(packed.forEachSplatCenter.bind(packed)),
    [
      [0, 1, 2, 3],
      [1, -4, 5, -6],
    ],
  );
  assert.deepStrictEqual(
    collectRawCenters(packed.forEachSplatCenterRaw.bind(packed)),
    [
      [0, 1, 2, 3],
      [1, -4, 5, -6],
    ],
  );
}

{
  const ext = new ExtSplats();
  splat(ext, new THREE.Vector3(0.25, -0.5, 1.5));
  splat(ext, new THREE.Vector3(12, 13, 14));

  assert.deepStrictEqual(collectCenters(ext.forEachSplatCenter.bind(ext)), [
    [0, 0.25, -0.5, 1.5],
    [1, 12, 13, 14],
  ]);
  assert.deepStrictEqual(
    collectRawCenters(ext.forEachSplatCenterRaw.bind(ext)),
    [
      [0, 0.25, -0.5, 1.5],
      [1, 12, 13, 14],
    ],
  );
}

{
  let fullDecodeCount = 0;
  let rawCenterCount = 0;
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
    forEachSplat(callback) {
      fullDecodeCount += 1;
      callback(
        0,
        new THREE.Vector3(7, 8, 9),
        new THREE.Vector3(1, 1, 1),
        new THREE.Quaternion(),
        1,
        new THREE.Color(0, 1, 0),
      );
    },
    forEachSplatCenterRaw(callback) {
      rawCenterCount += 1;
      callback(0, 7, 8, 9);
    },
  };
  const mesh = new SplatMesh({ splats: source });

  assert.deepStrictEqual(collectCenters(mesh.forEachSplatCenter.bind(mesh)), [
    [0, 7, 8, 9],
  ]);
  assert.strictEqual(fullDecodeCount, 1);

  assert.deepStrictEqual(
    collectRawCenters(mesh.forEachSplatCenterRaw.bind(mesh)),
    [[0, 7, 8, 9]],
  );
  assert.strictEqual(rawCenterCount, 1);
  assert.strictEqual(fullDecodeCount, 1);
}

await SplatMesh.staticInitialized;

{
  const mesh = new SplatMesh({
    constructSplats: (splats) => {
      splat(splats, new THREE.Vector3(1, 2, 3));
      splat(splats, new THREE.Vector3(-2, -3, -4));
      splat(splats, new THREE.Vector3(5, 6, 7));
    },
  });
  await mesh.initialized;

  let rawCenterIteratorCount = 0;
  const originalRawCenterIterator = mesh.forEachSplatCenterRaw.bind(mesh);
  mesh.forEachSplatCenterRaw = (callback) => {
    rawCenterIteratorCount += 1;
    originalRawCenterIterator(callback);
  };
  mesh.forEachSplatCenter = () => {
    throw new Error("center-only bounds should use raw center iteration");
  };

  const allBounds = mesh.getBoundingBox(true);
  assert.deepStrictEqual(allBounds.min.toArray(), [-2, -3, -4]);
  assert.deepStrictEqual(allBounds.max.toArray(), [5, 6, 7]);

  mesh
    .ensureEditorState()
    .replace(new Uint8Array([0, SPLAT_EDITOR_STATE_DELETED, 0]), 3);
  const visibleBounds = mesh.getSplatStateBoundingBox({
    centersOnly: true,
    mode: "visible",
  });
  assert.deepStrictEqual(visibleBounds.min.toArray(), [1, 2, 3]);
  assert.deepStrictEqual(visibleBounds.max.toArray(), [5, 6, 7]);
  assert.strictEqual(rawCenterIteratorCount, 2);

  mesh.dispose();
}

console.log("Splat source center iteration tests passed");
