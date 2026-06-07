import assert from "node:assert";

import * as THREE from "three";

import {
  SparkRenderer,
  SplatMesh,
  type SplatScreenPickStats,
} from "../dist/spark.module.js";

await SplatMesh.staticInitialized;

const mesh = new SplatMesh({
  constructSplats: (splats) => {
    splats.pushSplat(
      new THREE.Vector3(-0.5, 0, 0),
      new THREE.Vector3(0.1, 0.1, 0.1),
      new THREE.Quaternion(),
      1,
      new THREE.Color(1, 0, 0),
    );
    splats.pushSplat(
      new THREE.Vector3(0.5, 0, 0),
      new THREE.Vector3(0.1, 0.1, 0.1),
      new THREE.Quaternion(),
      1,
      new THREE.Color(0, 1, 0),
    );
    splats.pushSplat(
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(0.1, 0.1, 0.1),
      new THREE.Quaternion(),
      1,
      new THREE.Color(0, 0, 1),
    );
  },
});
await mesh.initialized;

const scene = new THREE.Scene();
scene.add(mesh);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
camera.position.z = 1;
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);

const sparkRenderer = Object.create(
  SparkRenderer.prototype,
) as SparkRenderer & {
  renderer: { getDrawingBufferSize: (target: THREE.Vector2) => THREE.Vector2 };
  display: { mapping: Array<{ node: SplatMesh; base: number; count: number }> };
};
sparkRenderer.renderer = {
  getDrawingBufferSize: (target) => target.set(100, 100),
};
sparkRenderer.display = {
  mapping: [{ node: mesh, base: 0, count: 3 }],
};

let stats: SplatScreenPickStats | null = null;
const indices = await sparkRenderer.pickSplatCandidateIndices({
  target: mesh,
  scene,
  camera,
  candidateMode: "centers",
  shape: { kind: "rect", x: 0, y: 0, width: 1, height: 1 },
  width: 100,
  height: 100,
  operation: "set",
  onStats: (nextStats) => {
    stats = nextStats;
  },
});

assert.deepStrictEqual([...(indices ?? [])], [0, 1]);
assert.strictEqual(stats?.candidateMode, "centers");
assert.strictEqual(stats?.mappedHitCount, 2);
assert.strictEqual(stats?.sourceStableHitCount, 2);
assert.strictEqual(stats?.centerCollect?.centerCount, 3);
assert.strictEqual(stats?.centerCollect?.candidateCenterCount, 2);
assert.strictEqual(stats?.centerCollect?.viewRejectedCenterCount, 1);
assert.deepStrictEqual(stats?.centerCollect?.projectedBounds, {
  minX: 25,
  minY: 50,
  maxX: 75,
  maxY: 50,
  minNdcZ: -0.8,
  maxNdcZ: -0.8,
});
assert.deepStrictEqual(stats?.centerCollect?.candidateBounds, {
  minX: 25,
  minY: 50,
  maxX: 75,
  maxY: 50,
  minNdcZ: -0.8,
  maxNdcZ: -0.8,
});

const capped = await sparkRenderer.pickSplatCandidateIndices({
  target: mesh,
  scene,
  camera,
  candidateMode: "centers",
  shape: { kind: "rect", x: 0, y: 0, width: 1, height: 1 },
  width: 100,
  height: 100,
  operation: "set",
  maxCandidates: 1,
});

assert.deepStrictEqual([...(capped ?? [])], [0]);

mesh.dispose();

console.log("Splat screen picker index tests passed");
