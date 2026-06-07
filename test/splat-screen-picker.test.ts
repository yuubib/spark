import assert from "node:assert";

import {
  collectSplatScreenPickHitsFromRgba8,
  editorSelectionOperationToPickFilterMode,
  normalizeSplatScreenPickShape,
  splatEditorStateFilterModeToPickUniform,
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

assert.deepStrictEqual(
  collectSplatScreenPickHitsFromRgba8(pixels, {
    x: 10,
    y: 20,
    width: 3,
    height: 2,
  }),
  [
    { accumulatorIndex: 2, pixel: { x: 11, y: 21 } },
    { accumulatorIndex: 7, pixel: { x: 10, y: 21 } },
    { accumulatorIndex: 300, pixel: { x: 11, y: 20 } },
  ],
);

assert.deepStrictEqual(
  collectSplatScreenPickHitsFromRgba8(
    pixels,
    {
      x: 10,
      y: 20,
      width: 3,
      height: 2,
    },
    { maxCandidates: 2, sort: false },
  ),
  [
    { accumulatorIndex: 7, pixel: { x: 10, y: 21 } },
    { accumulatorIndex: 2, pixel: { x: 11, y: 21 } },
  ],
);

assert.deepStrictEqual(
  collectSplatScreenPickHitsFromRgba8(pixels, {
    x: 10,
    y: 20,
    width: 3,
    height: 2,
    mask: {
      data: new Uint8Array([
        0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0,
        0,
      ]),
      width: 3,
      height: 2,
      channel: 3,
      threshold: 0,
    },
  }),
  [
    { accumulatorIndex: 7, pixel: { x: 10, y: 21 } },
    { accumulatorIndex: 300, pixel: { x: 11, y: 20 } },
  ],
);

assert.throws(() =>
  collectSplatScreenPickHitsFromRgba8(new Uint8Array(3), {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  }),
);

console.log("Splat screen picker tests passed");
