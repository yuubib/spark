import assert from "node:assert";

import { SplatMesh } from "../dist/spark.module.js";

{
  let skinningDisposeCount = 0;
  const mesh = {
    skinning: {
      dispose() {
        skinningDisposeCount += 1;
      },
    },
    splats: undefined,
    packedSplats: undefined,
    extSplats: undefined,
  } as unknown as SplatMesh;

  SplatMesh.prototype.dispose.call(mesh);
  SplatMesh.prototype.dispose.call(mesh);

  assert.strictEqual(skinningDisposeCount, 1);
  assert.strictEqual(mesh.skinning, null);
}

console.log("SplatMesh disposal tests passed");
