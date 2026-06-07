import assert from "node:assert";

import {
  type SplatScreenRgba8RowOrder,
  collectSplatScreenPickHitsFromRgba8,
  createSplatScreenFloodMaskFromRgba8,
  normalizeSplatScreenPickShape,
} from "../src/SplatScreenPicker.js";

function rgbaFromAlphaRows(
  rows: readonly (readonly number[])[],
  rowOrder: SplatScreenRgba8RowOrder,
): Uint8Array {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8Array(width * height * 4);
  for (let topY = 0; topY < height; topY++) {
    const sourceY = rowOrder === "bottom-left" ? height - 1 - topY : topY;
    for (let x = 0; x < width; x++) {
      data[(sourceY * width + x) * 4 + 3] = rows[topY][x] ?? 0;
    }
  }
  return data;
}

function alphaAt(
  data: ArrayLike<number>,
  width: number,
  x: number,
  y: number,
): number {
  return data[(y * width + x) * 4 + 3] ?? 0;
}

function encode(accumulatorIndex: number): number[] {
  const encoded = accumulatorIndex + 1;
  return [
    encoded & 0xff,
    (encoded >> 8) & 0xff,
    (encoded >> 16) & 0xff,
    (encoded >> 24) & 0xff,
  ];
}

const alphaRows = [
  [0, 100, 100, 100, 0],
  [0, 100, 120, 100, 0],
  [0, 0, 130, 0, 100],
  [100, 100, 100, 0, 100],
];
const bottomLeftPixels = rgbaFromAlphaRows(alphaRows, "bottom-left");
const topLeftPixels = rgbaFromAlphaRows(alphaRows, "top-left");

const bottomLeftResult = createSplatScreenFloodMaskFromRgba8(bottomLeftPixels, {
  width: 5,
  height: 4,
  seedX: 1,
  seedY: 0,
  threshold: 0.1,
});
const topLeftResult = createSplatScreenFloodMaskFromRgba8(topLeftPixels, {
  width: 5,
  height: 4,
  seedX: 1,
  seedY: 0,
  threshold: 0.1,
  rowOrder: "top-left",
});

assert.deepStrictEqual(bottomLeftResult.data, topLeftResult.data);
assert.strictEqual(bottomLeftResult.seed.value, 100);
assert.strictEqual(bottomLeftResult.sourceThreshold, 0.1);
assert.strictEqual(bottomLeftResult.matchedPixelCount, 6);
assert.deepStrictEqual(bottomLeftResult.bounds, {
  x: 1,
  y: 0,
  width: 3,
  height: 2,
});
assert.strictEqual(alphaAt(bottomLeftResult.data, 5, 1, 0), 255);
assert.strictEqual(alphaAt(bottomLeftResult.data, 5, 2, 1), 255);
assert.strictEqual(alphaAt(bottomLeftResult.data, 5, 2, 2), 0);
assert.strictEqual(alphaAt(bottomLeftResult.data, 5, 4, 2), 0);

assert.ok(bottomLeftResult.shape);
assert.strictEqual(bottomLeftResult.shape.kind, "mask");
assert.strictEqual(bottomLeftResult.shape.maskWidth, 3);
assert.strictEqual(bottomLeftResult.shape.maskHeight, 2);
assert.strictEqual(bottomLeftResult.shape.maskChannel, 3);
assert.strictEqual(bottomLeftResult.shape.maskThreshold, 0);
assert.deepStrictEqual(
  normalizeSplatScreenPickShape(bottomLeftResult.shape, 5, 4),
  {
    x: 1,
    y: 0,
    width: 3,
    height: 2,
    mask: {
      data: bottomLeftResult.shape.mask,
      width: 3,
      height: 2,
      channel: 3,
      threshold: 0,
    },
  },
);
assert.strictEqual(alphaAt(bottomLeftResult.shape.mask, 3, 0, 0), 255);
assert.strictEqual(alphaAt(bottomLeftResult.shape.mask, 3, 1, 1), 255);

const idPixels = new Uint8Array([
  ...encode(0),
  ...encode(1),
  ...encode(2),
  ...encode(3),
  ...encode(4),
  ...encode(5),
]);
assert.deepStrictEqual(
  collectSplatScreenPickHitsFromRgba8(
    idPixels,
    normalizeSplatScreenPickShape(bottomLeftResult.shape, 5, 4),
  ).map((hit) => hit.accumulatorIndex),
  [0, 1, 2, 3, 4, 5],
);

const strictThreshold = createSplatScreenFloodMaskFromRgba8(
  rgbaFromAlphaRows([[100, 120]], "top-left"),
  {
    width: 2,
    height: 1,
    seedX: 0,
    seedY: 0,
    threshold: 20 / 255,
    rowOrder: "top-left",
  },
);
assert.strictEqual(strictThreshold.matchedPixelCount, 1);
assert.strictEqual(alphaAt(strictThreshold.data, 2, 1, 0), 0);

const justAboveThreshold = createSplatScreenFloodMaskFromRgba8(
  rgbaFromAlphaRows([[100, 120]], "top-left"),
  {
    width: 2,
    height: 1,
    seedX: 0,
    seedY: 0,
    threshold: 20.001 / 255,
    rowOrder: "top-left",
  },
);
assert.strictEqual(justAboveThreshold.matchedPixelCount, 2);

const nonFiniteThreshold = createSplatScreenFloodMaskFromRgba8(
  rgbaFromAlphaRows([[100]], "top-left"),
  {
    width: 1,
    height: 1,
    seedX: 0,
    seedY: 0,
    threshold: Number.POSITIVE_INFINITY,
    rowOrder: "top-left",
  },
);
assert.strictEqual(nonFiniteThreshold.sourceThreshold, 0);
assert.strictEqual(nonFiniteThreshold.matchedPixelCount, 0);
assert.strictEqual(nonFiniteThreshold.shape, null);

const clampedHighThreshold = createSplatScreenFloodMaskFromRgba8(
  rgbaFromAlphaRows([[0, 254, 255]], "top-left"),
  {
    width: 3,
    height: 1,
    seedX: 0,
    seedY: 0,
    threshold: 2,
    rowOrder: "top-left",
  },
);
assert.strictEqual(clampedHighThreshold.sourceThreshold, 1);
assert.strictEqual(clampedHighThreshold.matchedPixelCount, 2);
assert.strictEqual(alphaAt(clampedHighThreshold.data, 3, 2, 0), 0);

assert.throws(() =>
  createSplatScreenFloodMaskFromRgba8(new Uint8Array(3), {
    width: 1,
    height: 1,
    seedX: 0,
    seedY: 0,
  }),
);
assert.throws(() =>
  createSplatScreenFloodMaskFromRgba8(new Uint8Array(4), {
    width: 1,
    height: 1,
    seedX: 1,
    seedY: 0,
  }),
);

console.log("Splat screen flood mask tests passed");
