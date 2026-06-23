import assert from "node:assert";

import * as THREE from "three";

import {
  SplatEdit,
  SplatEditRgbaBlendMode,
  SplatEditSdf,
  SplatEditSdfType,
  SplatEdits,
} from "../src/SplatEdit.js";

const edit = new SplatEdit({
  rgbaBlendMode: SplatEditRgbaBlendMode.ADD_RGBA,
  softEdge: 0.25,
  sdfSmooth: 0.5,
});
const sdf = new SplatEditSdf({
  type: SplatEditSdfType.BOX,
  color: new THREE.Color(0.25, 0.5, 0.75),
  displace: new THREE.Vector3(1, 2, 3),
  opacity: 0.6,
  radius: 0.125,
});
sdf.position.set(1, 2, 3);
sdf.rotation.set(0.1, 0.2, 0.3);
sdf.scale.set(2, 3, 4);

const edits = new SplatEdits({ maxEdits: 1, maxSdfs: 1 });
const inputs = [{ edit, sdfs: [sdf] }];

{
  const result = edits.update(inputs);
  assert.strictEqual(result.updated, true);
  assert.strictEqual(result.dynoUpdated, false);
  assert.strictEqual(edits.numEdits, 1);
  assert.strictEqual(edits.numSdfs, 1);
}

{
  const result = edits.update(inputs);
  assert.strictEqual(result.updated, false);
  assert.strictEqual(result.dynoUpdated, false);
}

{
  sdf.position.x += 1;
  const result = edits.update(inputs);
  assert.strictEqual(result.updated, true);
  assert.strictEqual(result.dynoUpdated, false);
}

console.log("Splat edit update tests passed");
