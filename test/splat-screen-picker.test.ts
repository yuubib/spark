import assert from "node:assert";

import {
  type SplatScreenPickCollectStats,
  collectSplatScreenPickHitsFromRgba8,
  createSplatScreenPickCenterCollectStats,
  editorSelectionOperationToPickFilterMode,
  normalizeSplatScreenPickCenterShape,
  normalizeSplatScreenPickShape,
  projectSplatScreenPickCenter,
  recordSplatScreenPickCandidateCenter,
  recordSplatScreenPickProjectedCenter,
  resolveSplatScreenPickRenderLayout,
  splatEditorStateFilterModeToPickUniform,
  testSplatScreenPickCenter,
} from "../src/SplatScreenPicker.js";

assert.strictEqual(editorSelectionOperationToPickFilterMode("add"), "pick-add");
assert.strictEqual(
  editorSelectionOperationToPickFilterMode("remove"),
  "pick-remove",
);
assert.strictEqual(editorSelectionOperationToPickFilterMode("set"), "pick-set");

assert.strictEqual(splatEditorStateFilterModeToPickUniform("all"), 1);
assert.strictEqual(splatEditorStateFilterModeToPickUniform("visible"), 2);
assert.strictEqual(splatEditorStateFilterModeToPickUniform("selected"), 3);
assert.strictEqual(splatEditorStateFilterModeToPickUniform("editable"), 4);
assert.strictEqual(splatEditorStateFilterModeToPickUniform("pick-set"), 4);
assert.strictEqual(splatEditorStateFilterModeToPickUniform("pick-add"), 5);
assert.strictEqual(splatEditorStateFilterModeToPickUniform("pick-remove"), 6);

const identityMatrixElements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const projectedCenter = { x: 0, y: 0, ndcZ: 0 };
assert.strictEqual(
  projectSplatScreenPickCenter(
    identityMatrixElements,
    0,
    0,
    0,
    100,
    50,
    projectedCenter,
  ),
  true,
);
assert.deepStrictEqual(projectedCenter, { x: 50, y: 25, ndcZ: 0 });
assert.strictEqual(
  projectSplatScreenPickCenter(
    identityMatrixElements,
    0.5,
    -0.5,
    0.25,
    200,
    100,
    projectedCenter,
  ),
  true,
);
assert.deepStrictEqual(projectedCenter, { x: 150, y: 75, ndcZ: 0.25 });
assert.strictEqual(
  projectSplatScreenPickCenter(
    identityMatrixElements,
    2,
    0,
    0,
    100,
    50,
    projectedCenter,
  ),
  false,
);

assert.deepStrictEqual(
  normalizeSplatScreenPickShape(
    { kind: "point", x: 0.5, y: 0.5, radiusPixels: 1 },
    100,
    50,
  ),
  { x: 49, y: 24, width: 3, height: 3 },
);

assert.deepStrictEqual(
  normalizeSplatScreenPickShape(
    { kind: "rect", x: 0.8, y: 0.6, width: -0.25, height: -0.3 },
    200,
    100,
  ),
  { x: 110, y: 30, width: 50, height: 30 },
);

const supersplatRectX = 0.083;
const supersplatRectY = 0.138;
const supersplatRectWidth = 0.834;
const supersplatRectHeight = 0.831 - supersplatRectY;
assert.deepStrictEqual(
  normalizeSplatScreenPickCenterShape(
    {
      kind: "rect",
      x: supersplatRectX,
      y: supersplatRectY,
      width: supersplatRectWidth,
      height: supersplatRectHeight,
    },
    1280,
    687,
  ),
  {
    x: 106.24000000000001,
    y: 94.80600000000001,
    width: 1067.52,
    height: 476.0909999999999,
  },
);

const pickRect = normalizeSplatScreenPickShape(
  { kind: "rect", x: 0.25, y: 0.25, width: 0.25, height: 0.25 },
  1000,
  500,
);

assert.deepStrictEqual(
  resolveSplatScreenPickRenderLayout(pickRect, 1000, 500, "viewport"),
  {
    targetWidth: 1000,
    targetHeight: 500,
    readRect: { x: 250, y: 125, width: 250, height: 125 },
    viewOffset: null,
  },
);

assert.deepStrictEqual(
  resolveSplatScreenPickRenderLayout(pickRect, 1000, 500, "shape"),
  {
    targetWidth: 250,
    targetHeight: 125,
    readRect: { x: 0, y: 0, width: 250, height: 125 },
    viewOffset: {
      fullWidth: 1000,
      fullHeight: 500,
      x: 250,
      y: 125,
      width: 250,
      height: 125,
    },
  },
);

assert.throws(() =>
  resolveSplatScreenPickRenderLayout(
    { x: 0, y: 0, width: 1, height: 1 },
    1,
    1,
    "bogus" as never,
  ),
);

const encode = (accumulatorIndex: number) => {
  const encoded = accumulatorIndex + 1;
  return [
    encoded & 0xff,
    (encoded >> 8) & 0xff,
    (encoded >> 16) & 0xff,
    (encoded >> 24) & 0xff,
  ];
};

const pixels = new Uint8Array([
  ...encode(7),
  ...encode(2),
  ...encode(7),
  0,
  0,
  0,
  0,
  ...encode(300),
  ...encode(2),
]);

const emptyCollectStats = (): SplatScreenPickCollectStats => ({
  pixelCount: 0,
  candidatePixelCount: 0,
  maskTestedPixelCount: 0,
  encodedPixelCount: 0,
  duplicatePixelHitCount: 0,
  uniqueHitCount: 0,
  earlyExit: false,
});

const stats = emptyCollectStats();
assert.deepStrictEqual(
  collectSplatScreenPickHitsFromRgba8(
    pixels,
    {
      x: 10,
      y: 20,
      width: 3,
      height: 2,
    },
    { stats },
  ),
  [
    { accumulatorIndex: 2, pixel: { x: 11, y: 21 } },
    { accumulatorIndex: 7, pixel: { x: 10, y: 21 } },
    { accumulatorIndex: 300, pixel: { x: 11, y: 20 } },
  ],
);
assert.deepStrictEqual(stats, {
  pixelCount: 6,
  candidatePixelCount: 6,
  maskTestedPixelCount: 0,
  encodedPixelCount: 5,
  duplicatePixelHitCount: 2,
  uniqueHitCount: 3,
  earlyExit: false,
});

const earlyStats = emptyCollectStats();
assert.deepStrictEqual(
  collectSplatScreenPickHitsFromRgba8(
    pixels,
    {
      x: 10,
      y: 20,
      width: 3,
      height: 2,
    },
    { maxCandidates: 2, sort: false, stats: earlyStats },
  ),
  [
    { accumulatorIndex: 7, pixel: { x: 10, y: 21 } },
    { accumulatorIndex: 2, pixel: { x: 11, y: 21 } },
  ],
);
assert.deepStrictEqual(earlyStats, {
  pixelCount: 6,
  candidatePixelCount: 2,
  maskTestedPixelCount: 0,
  encodedPixelCount: 2,
  duplicatePixelHitCount: 0,
  uniqueHitCount: 2,
  earlyExit: true,
});

const maskStats = emptyCollectStats();
assert.deepStrictEqual(
  collectSplatScreenPickHitsFromRgba8(
    pixels,
    {
      x: 10,
      y: 20,
      width: 3,
      height: 2,
      mask: {
        data: new Uint8Array([
          0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0,
          0, 0,
        ]),
        width: 3,
        height: 2,
        channel: 3,
        threshold: 0,
      },
    },
    { stats: maskStats },
  ),
  [
    { accumulatorIndex: 7, pixel: { x: 10, y: 21 } },
    { accumulatorIndex: 300, pixel: { x: 11, y: 20 } },
  ],
);
assert.deepStrictEqual(maskStats, {
  pixelCount: 6,
  candidatePixelCount: 2,
  maskTestedPixelCount: 6,
  encodedPixelCount: 2,
  duplicatePixelHitCount: 0,
  uniqueHitCount: 2,
  earlyExit: false,
});

const scaledMaskStats = emptyCollectStats();
assert.deepStrictEqual(
  collectSplatScreenPickHitsFromRgba8(
    pixels,
    {
      x: 10,
      y: 20,
      width: 3,
      height: 2,
      mask: {
        data: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255]),
        width: 1,
        height: 2,
        channel: 3,
        threshold: 0,
      },
    },
    { stats: scaledMaskStats },
  ),
  [
    { accumulatorIndex: 2, pixel: { x: 11, y: 21 } },
    { accumulatorIndex: 7, pixel: { x: 10, y: 21 } },
  ],
);
assert.deepStrictEqual(scaledMaskStats, {
  pixelCount: 6,
  candidatePixelCount: 3,
  maskTestedPixelCount: 6,
  encodedPixelCount: 3,
  duplicatePixelHitCount: 1,
  uniqueHitCount: 2,
  earlyExit: false,
});

const centerStats = createSplatScreenPickCenterCollectStats();
assert.strictEqual(
  testSplatScreenPickCenter(
    { x: 10, y: 20, width: 10, height: 5 },
    12.5,
    22.5,
    centerStats,
  ),
  true,
);
assert.strictEqual(centerStats.viewRejectedCenterCount, 0);
assert.strictEqual(centerStats.maskTestedCenterCount, 0);
assert.strictEqual(
  testSplatScreenPickCenter(
    { x: 10, y: 20, width: 10, height: 5 },
    20,
    22.5,
    centerStats,
  ),
  false,
);
assert.strictEqual(centerStats.viewRejectedCenterCount, 1);
assert.strictEqual(
  testSplatScreenPickCenter(
    { x: 10, y: 20, width: 10, height: 5 },
    10,
    22.5,
    centerStats,
  ),
  true,
);
assert.strictEqual(
  testSplatScreenPickCenter(
    { x: 10, y: 20, width: 10, height: 5 },
    10,
    22.5,
    centerStats,
    "strict",
  ),
  false,
);
assert.strictEqual(
  testSplatScreenPickCenter(
    { x: 10, y: 20, width: 10, height: 5 },
    12.5,
    20,
    centerStats,
    "strict",
  ),
  false,
);
assert.strictEqual(
  testSplatScreenPickCenter(
    { x: 10, y: 20, width: 10, height: 5 },
    10.001,
    20.001,
    centerStats,
    "strict",
  ),
  true,
);

const centerMask = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0,
]);
const centerMaskStats = createSplatScreenPickCenterCollectStats();
assert.strictEqual(
  testSplatScreenPickCenter(
    {
      x: 10,
      y: 20,
      width: 4,
      height: 2,
      mask: {
        data: centerMask,
        width: 4,
        height: 2,
        channel: 3,
        threshold: 0,
      },
    },
    11.2,
    20.7,
    centerMaskStats,
  ),
  true,
);
assert.strictEqual(
  testSplatScreenPickCenter(
    {
      x: 10,
      y: 20,
      width: 4,
      height: 2,
      mask: {
        data: centerMask,
        width: 4,
        height: 2,
        channel: 3,
        threshold: 0,
      },
    },
    12.2,
    20.7,
    centerMaskStats,
  ),
  false,
);
assert.strictEqual(centerMaskStats.maskTestedCenterCount, 2);
assert.strictEqual(centerMaskStats.viewRejectedCenterCount, 1);

const centerBoundsStats = createSplatScreenPickCenterCollectStats();
recordSplatScreenPickProjectedCenter(centerBoundsStats, {
  x: 12.5,
  y: 22.5,
  ndcZ: -0.25,
});
recordSplatScreenPickProjectedCenter(centerBoundsStats, {
  x: 20,
  y: 18,
  ndcZ: 0.5,
});
recordSplatScreenPickCandidateCenter(centerBoundsStats, {
  x: 14,
  y: 21,
  ndcZ: 0.125,
});
assert.deepStrictEqual(centerBoundsStats.projectedBounds, {
  minX: 12.5,
  minY: 18,
  maxX: 20,
  maxY: 22.5,
  minNdcZ: -0.25,
  maxNdcZ: 0.5,
});
assert.deepStrictEqual(centerBoundsStats.candidateBounds, {
  minX: 14,
  minY: 21,
  maxX: 14,
  maxY: 21,
  minNdcZ: 0.125,
  maxNdcZ: 0.125,
});

assert.throws(() =>
  collectSplatScreenPickHitsFromRgba8(new Uint8Array(3), {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  }),
);

console.log("Splat screen picker tests passed");
