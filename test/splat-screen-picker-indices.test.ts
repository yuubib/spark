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
let rawCenterIteratorUsed = false;
const originalRawCenterIterator = mesh.forEachSplatCenterRaw.bind(mesh);
mesh.forEachSplatCenterRaw = (callback) => {
  rawCenterIteratorUsed = true;
  originalRawCenterIterator(callback);
};
mesh.forEachSplatCenter = () => {
  throw new Error("compact center picking should use raw center iteration");
};
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
assert.strictEqual(rawCenterIteratorUsed, true);
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

const reusableIndexBuffer = { buffer: new Uint32Array(4) };
const reused = await sparkRenderer.pickSplatCandidateIndices({
  target: mesh,
  scene,
  camera,
  candidateMode: "centers",
  shape: { kind: "rect", x: 0, y: 0, width: 1, height: 1 },
  width: 100,
  height: 100,
  operation: "set",
  indexBuffer: reusableIndexBuffer,
});

assert.deepStrictEqual([...(reused ?? [])], [0, 1]);
assert.strictEqual(reused?.buffer, reusableIndexBuffer.buffer.buffer);
assert.strictEqual(reused?.byteOffset, reusableIndexBuffer.buffer.byteOffset);
assert.strictEqual(reusableIndexBuffer.buffer.length, 4);

const undersizedIndexBuffer = { buffer: new Uint32Array(1) };
const grown = await sparkRenderer.pickSplatCandidateIndices({
  target: mesh,
  scene,
  camera,
  candidateMode: "centers",
  shape: { kind: "rect", x: 0, y: 0, width: 1, height: 1 },
  width: 100,
  height: 100,
  operation: "set",
  indexBuffer: undersizedIndexBuffer,
});

assert.deepStrictEqual([...(grown ?? [])], [0, 1]);
assert.ok(undersizedIndexBuffer.buffer.length >= 2);
assert.strictEqual(grown?.buffer, undersizedIndexBuffer.buffer.buffer);

const cappedIndexBuffer = { buffer: new Uint32Array(4).fill(999) };
const cappedReuse = await sparkRenderer.pickSplatCandidateIndices({
  target: mesh,
  scene,
  camera,
  candidateMode: "centers",
  shape: { kind: "rect", x: 0, y: 0, width: 1, height: 1 },
  width: 100,
  height: 100,
  operation: "set",
  maxCandidates: 1,
  indexBuffer: cappedIndexBuffer,
});

assert.deepStrictEqual([...(cappedReuse ?? [])], [0]);
assert.strictEqual(cappedReuse?.buffer, cappedIndexBuffer.buffer.buffer);
assert.strictEqual(cappedIndexBuffer.buffer[1], 999);

const strictRectBoundary = await sparkRenderer.pickSplatCandidateIndices({
  target: mesh,
  scene,
  camera,
  candidateMode: "centers",
  shape: { kind: "rect", x: 0.25, y: 0, width: 0.5, height: 1 },
  width: 100,
  height: 100,
  operation: "set",
});

assert.deepStrictEqual([...(strictRectBoundary ?? [])], []);

const fullMaskBoundary = await sparkRenderer.pickSplatCandidateIndices({
  target: mesh,
  scene,
  camera,
  candidateMode: "centers",
  shape: {
    kind: "mask",
    x: 0.25,
    y: 0,
    width: 0.5,
    height: 1,
    mask: new Uint8Array(50 * 100 * 4).fill(255),
    maskWidth: 50,
    maskHeight: 100,
  },
  width: 100,
  height: 100,
  operation: "set",
});

assert.deepStrictEqual([...(fullMaskBoundary ?? [])], [0]);

const originalPickSplatCandidates =
  sparkRenderer.pickSplatCandidates.bind(sparkRenderer);
let renderedSeedOptions: unknown = null;
sparkRenderer.pickSplatCandidates = async (options) => {
  renderedSeedOptions = options;
  return [
    {
      object: mesh,
      index: 1,
      accumulatorIndex: 7,
      sourceIndexStable: true,
      pixel: { x: 75, y: 50 },
    },
  ];
};

const renderedSeed = await sparkRenderer.pickRenderedSplatIndex({
  target: mesh,
  scene,
  camera,
  shape: { kind: "point", x: 0.75, y: 0.5, radiusPixels: 0 },
  width: 100,
  height: 100,
  operation: "set",
});

assert.deepStrictEqual(renderedSeed, {
  index: 1,
  accumulatorIndex: 7,
  pixel: { x: 75, y: 50 },
});
assert.strictEqual(
  (renderedSeedOptions as { candidateMode?: string }).candidateMode,
  "rendered-id",
);
assert.strictEqual(
  (renderedSeedOptions as { renderMode?: string }).renderMode,
  "shape",
);
assert.strictEqual(
  (renderedSeedOptions as { maxCandidates?: number }).maxCandidates,
  1,
);
assert.strictEqual((renderedSeedOptions as { sort?: boolean }).sort, false);

sparkRenderer.pickSplatCandidates = async () => [
  {
    object: mesh,
    index: 1,
    accumulatorIndex: 7,
    sourceIndexStable: true,
    pixel: { x: 75, y: 50 },
  },
  {
    object: mesh,
    index: 0,
    accumulatorIndex: 3,
    sourceIndexStable: true,
    pixel: { x: 25, y: 50 },
  },
  {
    object: mesh,
    index: 1,
    accumulatorIndex: 8,
    sourceIndexStable: true,
    pixel: { x: 76, y: 50 },
  },
];
const renderedIndexBuffer = { buffer: new Uint32Array(4) };
const renderedIndices = await sparkRenderer.pickSplatCandidateIndices({
  target: mesh,
  scene,
  camera,
  candidateMode: "rendered-id",
  shape: { kind: "rect", x: 0, y: 0, width: 1, height: 1 },
  width: 100,
  height: 100,
  operation: "set",
  indexBuffer: renderedIndexBuffer,
});

assert.deepStrictEqual([...(renderedIndices ?? [])], [0, 1]);
assert.strictEqual(renderedIndices?.buffer, renderedIndexBuffer.buffer.buffer);

sparkRenderer.pickSplatCandidates = async () => [
  {
    object: {} as never,
    index: 1,
    accumulatorIndex: 7,
    sourceIndexStable: true,
    pixel: { x: 75, y: 50 },
  },
];
assert.strictEqual(
  await sparkRenderer.pickRenderedSplatIndex({
    target: mesh,
    scene,
    camera,
    shape: { kind: "point", x: 0.75, y: 0.5 },
  }),
  null,
);

sparkRenderer.pickSplatCandidates = async () => [
  {
    object: mesh,
    index: 1,
    accumulatorIndex: 7,
    sourceIndexStable: false,
    pixel: { x: 75, y: 50 },
  },
];
assert.strictEqual(
  await sparkRenderer.pickRenderedSplatIndex({
    target: mesh,
    scene,
    camera,
    shape: { kind: "point", x: 0.75, y: 0.5 },
  }),
  null,
);
sparkRenderer.pickSplatCandidates = originalPickSplatCandidates;

rawCenterIteratorUsed = false;
let nearestStats: SplatScreenPickStats | null = null;
const nearest = await sparkRenderer.pickNearestSplatCenterIndex({
  target: mesh,
  scene,
  camera,
  candidateMode: "centers",
  shape: { kind: "point", x: 0.7, y: 0.5, radiusPixels: 30 },
  width: 100,
  height: 100,
  operation: "set",
  onStats: (nextStats) => {
    nearestStats = nextStats;
  },
});

assert.deepStrictEqual(nearest, {
  index: 1,
  pixel: { x: 75, y: 50 },
  screenDistanceSq: 25,
  ndcZ: -0.8,
});
assert.strictEqual(rawCenterIteratorUsed, true);
assert.strictEqual(nearestStats?.mappedHitCount, 1);
assert.strictEqual(nearestStats?.sourceStableHitCount, 1);
assert.strictEqual(nearestStats?.centerCollect?.candidateCenterCount, 1);
assert.strictEqual(nearestStats?.centerCollect?.uniqueHitCount, 1);

const maskedNearest = await sparkRenderer.pickNearestSplatCenterIndex({
  target: mesh,
  scene,
  camera,
  candidateMode: "centers",
  shape: {
    kind: "mask",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    mask: new Uint8Array([0, 0, 0, 255, 0, 0, 0, 0]),
    maskWidth: 2,
    maskHeight: 1,
  },
  width: 100,
  height: 100,
  editorStateMode: "all",
});

assert.strictEqual(maskedNearest?.index, 0);

mesh.selectSplatStateCandidates([1], "set");
const addFilteredNearest = await sparkRenderer.pickNearestSplatCenterIndex({
  target: mesh,
  scene,
  camera,
  shape: { kind: "point", x: 0.75, y: 0.5, radiusPixels: 2 },
  width: 100,
  height: 100,
  operation: "add",
});

assert.strictEqual(addFilteredNearest, null);

const removeFilteredNearest = await sparkRenderer.pickNearestSplatCenterIndex({
  target: mesh,
  scene,
  camera,
  shape: { kind: "point", x: 0.75, y: 0.5, radiusPixels: 2 },
  width: 100,
  height: 100,
  operation: "remove",
});

assert.strictEqual(removeFilteredNearest?.index, 1);

let indexedCenterReadCount = 0;
const originalIndexedCenter = mesh.getSplatCenterRaw.bind(mesh);
mesh.getSplatCenterRaw = (index, target) => {
  indexedCenterReadCount += 1;
  return originalIndexedCenter(index, target);
};
mesh.forEachSplatCenterRaw = () => {
  throw new Error("selected center picking should use indexed centers");
};

let selectedStats: SplatScreenPickStats | null = null;
const editorState = mesh.getEditorState();
assert.ok(editorState);
editorState.listIndices = () => {
  throw new Error("compact selected picking should stream selected indices");
};
const selectedSparse = await sparkRenderer.pickSplatCandidateIndices({
  target: mesh,
  scene,
  camera,
  candidateMode: "centers",
  shape: { kind: "rect", x: 0, y: 0, width: 1, height: 1 },
  width: 100,
  height: 100,
  operation: "remove",
  onStats: (nextStats) => {
    selectedStats = nextStats;
  },
});

assert.deepStrictEqual([...(selectedSparse ?? [])], [1]);
assert.strictEqual(indexedCenterReadCount, 1);
assert.strictEqual(selectedStats?.centerCollect?.centerCount, 1);
assert.strictEqual(selectedStats?.centerCollect?.candidateCenterCount, 1);

const cacheMesh = new SplatMesh({
  constructSplats: (splats) => {
    for (let index = 0; index < 5; index += 1) {
      splats.pushSplat(
        new THREE.Vector3(-0.8 + index * 0.4, 0, 0),
        new THREE.Vector3(0.1, 0.1, 0.1),
        new THREE.Quaternion(),
        1,
        new THREE.Color(1, 1, 1),
      );
    }
  },
});
await cacheMesh.initialized;
scene.add(cacheMesh);
cacheMesh.selectSplatStateCandidates([3], "set");

const cacheEditorState = cacheMesh.getEditorState();
assert.ok(cacheEditorState);
cacheEditorState.listIndices = () => {
  throw new Error("cache-backed selected picking should not list indices");
};
cacheEditorState.forEachIndex = () => {
  throw new Error("cache-backed selected picking should not scan state");
};

let cacheIndexedCenterReadCount = 0;
const originalCacheIndexedCenter = cacheMesh.getSplatCenterRaw.bind(cacheMesh);
cacheMesh.getSplatCenterRaw = (index, target) => {
  cacheIndexedCenterReadCount += 1;
  return originalCacheIndexedCenter(index, target);
};

let cacheSelectedStats: SplatScreenPickStats | null = null;
const cacheSelectedSparse = await sparkRenderer.pickSplatCandidateIndices({
  target: cacheMesh,
  scene,
  camera,
  candidateMode: "centers",
  shape: { kind: "rect", x: 0, y: 0, width: 1, height: 1 },
  width: 100,
  height: 100,
  operation: "remove",
  onStats: (nextStats) => {
    cacheSelectedStats = nextStats;
  },
});

assert.deepStrictEqual([...(cacheSelectedSparse ?? [])], [3]);
assert.strictEqual(cacheIndexedCenterReadCount, 1);
assert.strictEqual(cacheSelectedStats?.centerCollect?.centerCount, 1);
assert.strictEqual(cacheSelectedStats?.centerCollect?.candidateCenterCount, 1);

const depthMesh = new SplatMesh({
  constructSplats: (splats) => {
    splats.pushSplat(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0.1, 0.1, 0.1),
      new THREE.Quaternion(),
      1,
      new THREE.Color(1, 0, 0),
    );
    splats.pushSplat(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.1, 0.1, 0.1),
      new THREE.Quaternion(),
      1,
      new THREE.Color(0, 1, 0),
    );
  },
});
await depthMesh.initialized;
scene.add(depthMesh);

const depthNearest = await sparkRenderer.pickNearestSplatCenterIndex({
  target: depthMesh,
  scene,
  camera,
  shape: { kind: "point", x: 0.5, y: 0.5, radiusPixels: 2 },
  width: 100,
  height: 100,
  operation: "set",
});

assert.strictEqual(depthNearest?.index, 1);
assert.strictEqual(depthNearest?.ndcZ, -0.8);

const screenOnlyNearest = await sparkRenderer.pickNearestSplatCenterIndex({
  target: depthMesh,
  scene,
  camera,
  shape: { kind: "point", x: 0.5, y: 0.5, radiusPixels: 2 },
  width: 100,
  height: 100,
  operation: "set",
  rankMode: "screen-distance",
});

assert.strictEqual(screenOnlyNearest?.index, 0);

depthMesh.dispose();
cacheMesh.dispose();
mesh.dispose();

console.log("Splat screen picker index tests passed");
