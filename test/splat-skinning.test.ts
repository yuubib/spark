import assert from "node:assert";

import * as THREE from "three";

import type { SplatMesh } from "../src/SplatMesh.js";
import {
  SplatSkinning,
  SplatSkinningMode,
  defineApplyCovSplatDQSkinning,
  defineApplyCovSplatLBSkinning,
  defineApplyGsplatSkinning,
} from "../src/SplatSkinning.js";

function mesh(numSplats: number): SplatMesh {
  return { numSplats, needsUpdate: false } as unknown as SplatMesh;
}

type VersionedMesh = SplatMesh & {
  version: number;
  sortVersion: number;
};

function versionedMesh(numSplats: number): VersionedMesh {
  const fake = {
    numSplats,
    version: 0,
    sortVersion: 0,
    updateRenderVersion() {
      fake.version += 1;
    },
  };

  Object.defineProperty(fake, "needsUpdate", {
    get: () => false,
    set(value: boolean) {
      if (!value) {
        return;
      }
      fake.version += 1;
      fake.sortVersion += 1;
    },
  });

  return fake as unknown as VersionedMesh;
}

{
  const perRow = new SplatSkinning({
    mesh: mesh(2),
    numSplats: 2,
    numBones: 8,
  });
  perRow.setSplatBones(
    0,
    new THREE.Vector4(1, 2, 0, 0),
    new THREE.Vector4(0.5, 0.25, 0.25, 0),
  );
  perRow.setSplatBones(
    1,
    new THREE.Vector4(3, 4, 5, 6),
    new THREE.Vector4(1, 0, 0, 0),
  );
  const packed = perRow.skinData.slice(0, 8);

  const bulk = new SplatSkinning({ mesh: mesh(2), numSplats: 2, numBones: 8 });
  bulk.setSplatBonesPacked(packed);

  assert.deepStrictEqual(
    Array.from(bulk.skinData.slice(0, 8)),
    Array.from(packed),
  );
}

{
  assert.throws(
    () => new SplatSkinning({ mesh: mesh(1), numSplats: 1, numBones: 0 }),
    /numBones must be an integer in \[1, 256\]/,
  );
  assert.throws(
    () => new SplatSkinning({ mesh: mesh(1), numSplats: 1, numBones: 257 }),
    /numBones must be an integer in \[1, 256\]/,
  );
  const skinning = new SplatSkinning({
    mesh: mesh(1),
    numSplats: 1,
    numBones: 256,
  });
  skinning.setSplatBones(
    0,
    new THREE.Vector4(255, 0, 0, 0),
    new THREE.Vector4(1, 0, 0, 0),
  );
  assert.strictEqual(skinning.skinData[0] >> 8, 255);
  assert.throws(
    () =>
      skinning.setSplatBones(
        0,
        new THREE.Vector4(256, 0, 0, 0),
        new THREE.Vector4(1, 0, 0, 0),
      ),
    /boneIndices\[0\] must be an integer in \[0, 255\]/,
  );
  assert.throws(
    () =>
      skinning.setSplatBones(
        0,
        new THREE.Vector4(-1, 0, 0, 0),
        new THREE.Vector4(1, 0, 0, 0),
      ),
    /boneIndices\[0\] must be an integer in \[0, 255\]/,
  );
  assert.throws(
    () =>
      skinning.setSplatBones(
        0,
        new THREE.Vector4(0.5, 0, 0, 0),
        new THREE.Vector4(1, 0, 0, 0),
      ),
    /boneIndices\[0\] must be an integer in \[0, 255\]/,
  );
  assert.throws(
    () =>
      skinning.setSplatBones(
        1,
        new THREE.Vector4(0, 0, 0, 0),
        new THREE.Vector4(1, 0, 0, 0),
      ),
    /splatIndex must be an integer in \[0, 0\]/,
  );
  assert.throws(
    () =>
      skinning.setBoneQuatPos(256, new THREE.Quaternion(), new THREE.Vector3()),
    /boneIndex must be an integer in \[0, 255\]/,
  );
}

{
  const skinning = new SplatSkinning({
    mesh: mesh(4),
    numSplats: 4,
    numBones: 8,
  });
  const packed = new Uint16Array([1, 2, 3, 4, 5, 6, 7, 8]);
  skinning.setSplatBonesPacked(packed, 2);

  assert.deepStrictEqual(
    Array.from(skinning.skinData.slice(0, 8)),
    Array.from(packed),
  );
  assert.deepStrictEqual(
    Array.from(skinning.skinData.slice(8, 16)),
    new Array(8).fill(0),
  );
}

{
  const skinning = new SplatSkinning({
    mesh: mesh(1),
    numSplats: 1,
    numBones: 8,
  });
  const before = skinning.skinTexture.version;
  skinning.setSplatBonesPacked(new Uint16Array([0, 0, 0, 0]));

  assert.strictEqual(skinning.skinTexture.version, before + 1);
}

{
  const testMesh = versionedMesh(1);
  const skinning = new SplatSkinning({
    mesh: testMesh,
    numSplats: 1,
    numBones: 8,
  });
  const beforeBoneVersion = skinning.boneTexture.version;

  skinning.updateBones();

  assert.strictEqual(skinning.boneTexture.version, beforeBoneVersion + 1);
  assert.strictEqual(testMesh.version, 1);
  assert.strictEqual(testMesh.sortVersion, 1);
}

{
  const testMesh = versionedMesh(1);
  const skinning = new SplatSkinning({
    mesh: testMesh,
    numSplats: 1,
    numBones: 8,
  });
  const beforeBoneVersion = skinning.boneTexture.version;

  skinning.updateBoneTextureRenderOnly();

  assert.strictEqual(skinning.boneTexture.version, beforeBoneVersion + 1);
  assert.strictEqual(testMesh.version, 1);
  assert.strictEqual(testMesh.sortVersion, 0);
}

{
  const skinning = new SplatSkinning({
    mesh: mesh(1),
    numSplats: 1,
    numBones: 8,
  });
  const pos = new THREE.Vector3(1, 2, 3);
  const quat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI / 3,
  );

  skinning.setBoneQuatPos(1, quat, pos);
  const canonicalRow = Array.from(skinning.boneData.slice(16, 24));

  skinning.setBoneQuatPos(
    1,
    new THREE.Quaternion(-quat.x, -quat.y, -quat.z, -quat.w),
    pos,
  );

  assert.deepStrictEqual(
    Array.from(skinning.boneData.slice(16, 24)),
    canonicalRow,
  );
}

{
  const skinning = new SplatSkinning({
    mesh: mesh(1),
    numSplats: 1,
    numBones: 8,
    mode: SplatSkinningMode.LINEAR_BLEND,
  });
  const skinData = skinning.skinData;
  const boneData = skinning.boneData;
  assert.ok(skinData.length > 0);
  assert.ok(boneData.length > 0);
  assert.strictEqual(skinning.boneRestQuatPosScale.length, 8);
  assert.strictEqual(skinning.boneRestInvMats.length, 8);
  let skinDisposeCount = 0;
  let boneDisposeCount = 0;
  skinning.skinTexture.dispose = () => {
    skinDisposeCount += 1;
  };
  skinning.boneTexture.dispose = () => {
    boneDisposeCount += 1;
  };

  skinning.dispose();
  skinning.dispose();

  assert.strictEqual(skinDisposeCount, 1);
  assert.strictEqual(boneDisposeCount, 1);
  assert.strictEqual(skinning.skinTexture.source.data, null);
  assert.strictEqual(skinning.boneTexture.source.data, null);
  assert.notStrictEqual(skinning.skinData, skinData);
  assert.notStrictEqual(skinning.boneData, boneData);
  assert.strictEqual(skinning.skinData.length, 0);
  assert.strictEqual(skinning.boneData.length, 0);
  assert.deepStrictEqual(skinning.boneRestQuatPosScale, []);
  assert.deepStrictEqual(skinning.boneRestInvMats, []);
}

{
  const skinning = new SplatSkinning({
    mesh: mesh(2),
    numSplats: 2,
    numBones: 8,
  });

  assert.throws(
    () => skinning.setSplatBonesPacked(new Uint16Array(7)),
    /must cover splatCount\*4/,
  );
  assert.throws(
    () => skinning.setSplatBonesPacked(new Uint16Array(8), 3),
    /splatCount must be an integer/,
  );
  assert.throws(
    () => skinning.setSplatBonesPacked([] as unknown as Uint16Array),
    /Uint16Array/,
  );
  assert.throws(
    () => skinning.setSplatBonesPacked(new Uint16Array([8 << 8, 0, 0, 0]), 1),
    /packedSkinData bone index 8 at splat 0 lane 0 exceeds numBones 8/,
  );
  assert.throws(
    () => skinning.setSplatBonesPacked(new Uint16Array([0, 0, 0, 8 << 8]), 1),
    /packedSkinData bone index 8 at splat 0 lane 3 exceeds numBones 8/,
  );
}

assert.match(
  defineApplyGsplatSkinning,
  /if \(norm <= 1e-8\) \{\s+return;\s+\}/,
);
assert.match(
  defineApplyCovSplatDQSkinning,
  /if \(norm <= 1e-8\) \{\s+return;\s+\}/,
);
assert.match(defineApplyCovSplatLBSkinning, /float weightSum = 0\.0;/);
assert.match(
  defineApplyCovSplatLBSkinning,
  /if \(weightSum <= 0\.0\) \{\s+return;\s+\}/,
);

console.log("SplatSkinning packed skin data tests passed");
