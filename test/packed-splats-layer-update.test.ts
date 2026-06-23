import assert from "node:assert";
import { test } from "node:test";

import * as THREE from "three";

import { PackedSplats } from "../dist/spark.module.js";

const scales = new THREE.Vector3(0.25, 0.5, 0.75);
const quaternion = new THREE.Quaternion();
const color = new THREE.Color(1, 0, 0);

function setTestSplat(packed: PackedSplats, index: number): void {
  packed.setSplat(
    index,
    new THREE.Vector3(index, index + 1, index + 2),
    scales,
    quaternion,
    0.8,
    color,
  );
}

function createCenterMatchPackedSplats(count: number): PackedSplats {
  const base = new PackedSplats();
  const centers = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    setTestSplat(base, i);
    const offset = i * 3;
    centers[offset] = i;
    centers[offset + 1] = i + 1;
    centers[offset + 2] = i + 2;
  }

  const packed = new PackedSplats({
    packedArray: base.packedArray?.slice(),
    numSplats: count,
    extra: { centerMatchXyz: centers },
  });
  packed.ensureSplats(packed.maxSplats);
  return packed;
}

function createSourceBackedPackedSplats(): {
  packed: PackedSplats;
  texture: THREE.DataArrayTexture;
  packedArray: Uint32Array;
} {
  const packed = new PackedSplats();
  const packedArray = packed.ensureSplats(8);
  const texture = new THREE.DataArrayTexture(
    packedArray,
    2,
    2,
    packed.maxSplats / 4,
  );
  texture.format = THREE.RGBAIntegerFormat;
  texture.type = THREE.UnsignedIntType;
  texture.internalFormat = "RGBA32UI";

  packed.source = texture;
  packed.needsUpdate = false;

  return { packed, texture, packedArray };
}

test("source-backed setSplat marks DataArrayTexture layer updates", () => {
  const { packed, texture } = createSourceBackedPackedSplats();

  setTestSplat(packed, 1);
  setTestSplat(packed, 3);

  assert.strictEqual(packed.needsUpdate, true);
  assert.deepStrictEqual(Array.from(texture.layerUpdates), [0]);

  const versionBeforeUpload = texture.source.version;
  assert.strictEqual(packed.getTexture(), texture);
  assert.strictEqual(texture.source.version, versionBeforeUpload + 1);
  assert.deepStrictEqual(Array.from(texture.layerUpdates), [0]);

  setTestSplat(packed, 4);

  assert.deepStrictEqual(Array.from(texture.layerUpdates).sort(), [0, 1]);
});

test("full source data swaps clear stale layer updates", () => {
  const { packed, texture, packedArray } = createSourceBackedPackedSplats();
  texture.addLayerUpdate(0);
  texture.addLayerUpdate(1);

  const replacement = new Uint32Array(packedArray.length);
  packed.packedArray = replacement;
  packed.needsUpdate = true;

  assert.strictEqual(packed.getTexture(), texture);
  assert.strictEqual(texture.image.data, replacement);
  assert.strictEqual(texture.layerUpdates.size, 0);
});

test("source realloc clears stale layer updates before replacing texture", () => {
  const { packed, texture } = createSourceBackedPackedSplats();
  texture.addLayerUpdate(0);
  texture.addLayerUpdate(1);

  packed.maxSplats = 4096;
  packed.packedArray = new Uint32Array(packed.maxSplats * 4);
  packed.needsUpdate = true;

  const replacement = packed.getTexture();

  assert.notStrictEqual(replacement, texture);
  assert.strictEqual(texture.layerUpdates.size, 0);
  assert.strictEqual(replacement.image.data, packed.packedArray);
  assert.strictEqual(replacement.layerUpdates.size, 0);
});

test("center-match setSplat marks DataArrayTexture layer updates", () => {
  const packed = createCenterMatchPackedSplats(2);
  const texture = packed.getCenterMatchTexture();
  assert.ok(texture);
  assert.strictEqual(texture.layerUpdates.size, 0);

  const versionBeforeWrite = texture.source.version;
  setTestSplat(packed, 1);

  assert.deepStrictEqual(Array.from(texture.layerUpdates), [0]);
  assert.strictEqual(texture.source.version, versionBeforeWrite + 1);
  assert.deepStrictEqual(
    Array.from((texture.image.data as Float32Array).slice(4, 8)),
    [1, 2, 3, 1],
  );

  packed.markCenterMatchTextureDirty();
  assert.strictEqual(packed.getCenterMatchTexture(), texture);
  assert.strictEqual(texture.layerUpdates.size, 0);
});

test("center-match layer updates follow texture layer layout", () => {
  const packed = createCenterMatchPackedSplats(8);
  const textureData = new Float32Array(8 * 4);
  const texture = new THREE.DataArrayTexture(textureData, 2, 2, 2);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.FloatType;
  texture.internalFormat = "RGBA32F";

  const internals = packed as unknown as {
    centerMatchTexture: THREE.DataArrayTexture | null;
    centerMatchTextureData: Float32Array | null;
    centerMatchTextureNeedsUpdate: boolean;
  };
  internals.centerMatchTexture = texture;
  internals.centerMatchTextureData = textureData;
  internals.centerMatchTextureNeedsUpdate = false;

  const versionBeforeWrite = texture.source.version;
  setTestSplat(packed, 5);

  assert.deepStrictEqual(Array.from(texture.layerUpdates), [1]);
  assert.strictEqual(texture.source.version, versionBeforeWrite + 1);
  assert.deepStrictEqual(Array.from(textureData.slice(20, 24)), [5, 6, 7, 1]);
});
