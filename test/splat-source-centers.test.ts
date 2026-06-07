import assert from "node:assert";

import * as THREE from "three";

import {
  ExtSplats,
  PackedSplats,
  PlyReader,
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

const assertClose = (actual: number, expected: number, epsilon = 1e-6) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} is not within ${epsilon} of ${expected}`,
  );
};

const makePositionPly = (rows: readonly (readonly number[])[]) => {
  const header = [
    "ply",
    "format binary_little_endian 1.0",
    `element vertex ${rows.length}`,
    "property float x",
    "property float y",
    "property float z",
    "end_header",
    "",
  ].join("\n");
  const headerBytes = new TextEncoder().encode(header);
  const body = new ArrayBuffer(rows.length * 3 * 4);
  const view = new DataView(body);
  let offset = 0;
  for (const row of rows) {
    for (const value of row) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
  }
  const bytes = new Uint8Array(headerBytes.length + body.byteLength);
  bytes.set(headerBytes);
  bytes.set(new Uint8Array(body), headerBytes.length);
  return bytes;
};

{
  const ply = new PlyReader({
    fileBytes: makePositionPly([
      [0.3333333432674408, 2.25, -3.5],
      [-4.75, 5.125, 6.875],
    ]),
  });
  await ply.parseHeader();
  const xyz = ply.readCenterMatchXyz();
  assert.ok(xyz);
  assert.strictEqual(xyz.length, 6);
  assertClose(xyz[0], 0.3333333432674408);
  assertClose(xyz[1], 2.25);
  assertClose(xyz[2], -3.5);
  assertClose(xyz[3], -4.75);
  assertClose(xyz[4], 5.125);
  assertClose(xyz[5], 6.875);
}

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
  const center = { x: 0, y: 0, z: 0 };
  assert.strictEqual(packed.getSplatCenterRaw(1, center), true);
  assert.deepStrictEqual(center, { x: -4, y: 5, z: -6 });
  assert.strictEqual(packed.getSplatCenterRaw(2, center), false);
}

{
  const packedBase = new PackedSplats();
  splat(packedBase, new THREE.Vector3(0.3333333432674408, 2.25, -3.5));
  splat(packedBase, new THREE.Vector3(-4.75, 5.125, 6.875));
  const packed = new PackedSplats({
    packedArray: packedBase.packedArray?.slice(),
    numSplats: 2,
    extra: {
      centerMatchXyz: new Float32Array([
        0.3333333432674408, 2.25, -3.5, -4.75, 5.125, 6.875,
      ]),
    },
  });

  assert.deepStrictEqual(
    collectRawCenters(packed.forEachSplatCenterRaw.bind(packed)),
    [
      [0, 0.3333333432674408, 2.25, -3.5],
      [1, -4.75, 5.125, 6.875],
    ],
  );
  assert.deepStrictEqual(
    collectCenters(packed.forEachSplatCenter.bind(packed)),
    [
      [0, 0.3333333432674408, 2.25, -3.5],
      [1, -4.75, 5.125, 6.875],
    ],
  );

  const center = { x: 0, y: 0, z: 0 };
  assert.strictEqual(packed.getSplatCenterRaw(0, center), true);
  assert.deepStrictEqual(center, {
    x: 0.3333333432674408,
    y: 2.25,
    z: -3.5,
  });

  const texture = packed.getCenterMatchTexture();
  assert.ok(texture);
  assert.strictEqual(texture.format, THREE.RGBAFormat);
  assert.strictEqual(texture.type, THREE.FloatType);
  assert.strictEqual(texture.internalFormat, "RGBA32F");
  assert.strictEqual(texture.magFilter, THREE.NearestFilter);
  assert.strictEqual(texture.minFilter, THREE.NearestFilter);
  assert.strictEqual(texture.generateMipmaps, false);
  assert.strictEqual(
    texture.image.width * texture.image.height * texture.image.depth,
    packed.maxSplats,
  );
  assert.ok(texture.image.data instanceof Float32Array);
  const textureData = texture.image.data as Float32Array;
  assert.deepStrictEqual(
    Array.from(textureData.slice(0, 8)),
    [0.3333333432674408, 2.25, -3.5, 1, -4.75, 5.125, 6.875, 1],
  );
  assert.strictEqual(packed.getCenterMatchTexture(), texture);

  packed.setSplat(
    1,
    new THREE.Vector3(9.25, -8.5, 7.75),
    new THREE.Vector3(0.25, 0.5, 0.75),
    new THREE.Quaternion(),
    0.8,
    new THREE.Color(1, 0, 0),
  );
  assert.strictEqual(packed.getSplatCenterRaw(1, center), true);
  assert.deepStrictEqual(center, { x: 9.25, y: -8.5, z: 7.75 });
  assert.strictEqual(packed.getCenterMatchTexture(), texture);
  assert.deepStrictEqual(
    Array.from(textureData.slice(4, 8)),
    [9.25, -8.5, 7.75, 1],
  );

  splat(packed, new THREE.Vector3(1.125, 2.375, 3.625));
  assert.strictEqual(packed.getSplatCenterRaw(2, center), true);
  assert.deepStrictEqual(center, { x: 1.125, y: 2.375, z: 3.625 });
  assert.strictEqual(packed.getCenterMatchTexture(), texture);
  assert.deepStrictEqual(
    Array.from(textureData.slice(8, 12)),
    [1.125, 2.375, 3.625, 1],
  );

  packed.markCenterMatchTextureDirty();
  const centers = packed.centerMatchXyz;
  assert.ok(centers);
  centers[0] = 4.5;
  assert.strictEqual(packed.getCenterMatchTexture(), texture);
  assert.strictEqual(textureData[0], 4.5);

  packed.dispose();
  assert.strictEqual(packed.getCenterMatchTexture(), null);
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
  const center = { x: 0, y: 0, z: 0 };
  assert.strictEqual(ext.getSplatCenterRaw(0, center), true);
  assert.deepStrictEqual(center, { x: 0.25, y: -0.5, z: 1.5 });
  assert.strictEqual(ext.getSplatCenterRaw(-1, center), false);
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
  assert.strictEqual(mesh.hasIndexedSplatCenters(), false);

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

  const center = { x: 0, y: 0, z: 0 };
  assert.strictEqual(mesh.getSplatCenterRaw(0, center), true);
  assert.deepStrictEqual(center, { x: 7, y: 8, z: 9 });
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
  assert.strictEqual(mesh.hasIndexedSplatCenters(), true);
  const center = { x: 0, y: 0, z: 0 };
  assert.strictEqual(mesh.getSplatCenterRaw(2, center), true);
  assert.deepStrictEqual(center, { x: 5, y: 6, z: 7 });

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
