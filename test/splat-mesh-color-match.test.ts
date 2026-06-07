import assert from "node:assert";

import * as THREE from "three";

import {
  ExtSplats,
  SPLAT_EDITOR_STATE_DELETED,
  SPLAT_EDITOR_STATE_LOCKED,
  SplatMesh,
} from "../dist/spark.module.js";

await SplatMesh.staticInitialized;

const pushSplat = (
  splats: { pushSplat: SplatMesh["pushSplat"] },
  color: THREE.Color,
) => {
  splats.pushSplat(
    new THREE.Vector3(),
    new THREE.Vector3(0.1, 0.1, 0.1),
    new THREE.Quaternion(),
    1,
    color,
  );
};

const assertClose = (actual: number, expected: number, epsilon = 1 / 255) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} is not within ${epsilon} of ${expected}`,
  );
};

{
  const ext = new ExtSplats();
  pushSplat(ext, new THREE.Color(0.25, 0.5, 0.75));
  const color = { r: 0, g: 0, b: 0 };
  assert.strictEqual(ext.getSplatColorRaw(0, color), true);
  assertClose(color.r, 0.25, 1e-3);
  assertClose(color.g, 0.5, 1e-3);
  assertClose(color.b, 0.75, 1e-3);
  assert.strictEqual(ext.getSplatColorRaw(1, color), false);
}

const mesh = new SplatMesh({
  constructSplats: (splats) => {
    pushSplat(splats, new THREE.Color(0.8, 0.1, 0.1));
    pushSplat(splats, new THREE.Color(0.78, 0.12, 0.11));
    pushSplat(splats, new THREE.Color(0.2, 0.8, 0.2));
    pushSplat(splats, new THREE.Color(0.79, 0.1, 0.13));
    pushSplat(splats, new THREE.Color(0.81, 0.08, 0.1));
  },
});
await mesh.initialized;

assert.strictEqual(mesh.hasIndexedSplatColors(), true);
const rawColor = { r: 0, g: 0, b: 0 };
assert.strictEqual(mesh.getSplatColorRaw(0, rawColor), true);
assertClose(rawColor.r, 0.8);
assertClose(rawColor.g, 0.1);
assertClose(rawColor.b, 0.1);

mesh.setSplatStateBits(3, SPLAT_EDITOR_STATE_LOCKED);
mesh.setSplatStateBits(4, SPLAT_EDITOR_STATE_DELETED);

const source = mesh.splats;
assert.ok(source);
source.forEachSplat = () => {
  throw new Error("indexed color matching should not fully decode splats");
};

let indexedColorReads = 0;
const originalIndexedColor = mesh.getSplatColorRaw.bind(mesh);
mesh.getSplatColorRaw = (index, target) => {
  indexedColorReads += 1;
  return originalIndexedColor(index, target);
};

const allMatches = mesh.findSplatColorMatches({
  seedIndex: 0,
  threshold: 0.035,
});

assert.deepStrictEqual([...(allMatches?.indices ?? [])], [0, 1, 3, 4]);
assert.strictEqual(allMatches?.threshold, 0.035);
assert.strictEqual(allMatches?.tested, 5);
assert.strictEqual(allMatches?.matched, 4);
assert.strictEqual(allMatches?.stateRejected, 0);
assert.strictEqual(allMatches?.earlyExit, false);
assert.ok(indexedColorReads >= 6);

const editableMatches = mesh.findSplatColorMatches({
  seedIndex: 0,
  threshold: 0.035,
  mode: "editable",
});

assert.deepStrictEqual([...(editableMatches?.indices ?? [])], [0, 1]);
assert.strictEqual(editableMatches?.tested, 3);
assert.strictEqual(editableMatches?.stateRejected, 2);

const capped = mesh.findSplatColorMatches({
  seedIndex: 0,
  threshold: 1,
  maxMatches: 1,
});

assert.deepStrictEqual([...(capped?.indices ?? [])], [0]);
assert.strictEqual(capped?.threshold, 1);
assert.strictEqual(capped?.earlyExit, true);

const clamped = mesh.findSplatColorMatches({
  seedIndex: 0,
  threshold: 2,
  mode: "editable",
});

assert.deepStrictEqual([...(clamped?.indices ?? [])], [0, 1, 2]);
assert.strictEqual(clamped?.threshold, 1);

const nonFinite = mesh.findSplatColorMatches({
  seedIndex: 0,
  threshold: Number.POSITIVE_INFINITY,
  mode: "editable",
});

assert.deepStrictEqual([...(nonFinite?.indices ?? [])], [0]);
assert.strictEqual(nonFinite?.threshold, 0);

const selection = mesh.selectSplatStateColorMatches({
  seedIndex: 0,
  threshold: 0.035,
  mode: "all",
  operation: "set",
  mutationOptions: {
    recordChanges: true,
    changeFormat: "packed",
  },
});

assert.deepStrictEqual([...(selection?.match.indices ?? [])], [0, 1, 3, 4]);
assert.strictEqual(selection?.mutation.changed, 2);
assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [0, 1]);
assert.deepStrictEqual(mesh.listSplatStateIndices("locked"), [3]);
assert.deepStrictEqual(mesh.listSplatStateIndices("deleted"), [4]);

assert.strictEqual(
  mesh.findSplatColorMatches({ seedIndex: 99, threshold: 0.1 }),
  null,
);

mesh.dispose();

console.log("Splat mesh color match tests passed");
