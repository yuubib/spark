import assert from "node:assert";

import * as THREE from "three";

import { SparkRenderer } from "../dist/spark.module.js";
import {
  type SplatScreenFloodMaskRenderStats,
  type SplatScreenFloodMaskWorkspace,
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

const workspace: SplatScreenFloodMaskWorkspace = {
  data: new Uint8Array(5 * 4 * 4),
  visited: new Uint8Array(5 * 4),
  stack: new Uint32Array(5 * 4),
  mask: new Uint8Array(3 * 2 * 4),
};
const workspaceResult = createSplatScreenFloodMaskFromRgba8(bottomLeftPixels, {
  width: 5,
  height: 4,
  seedX: 1,
  seedY: 0,
  threshold: 0.1,
  workspace,
});
const workspaceDataBuffer = workspace.data?.buffer;
const workspaceVisitedBuffer = workspace.visited?.buffer;
const workspaceStackBuffer = workspace.stack?.buffer;
const workspaceMaskBuffer = workspace.mask?.buffer;
assert.deepStrictEqual(workspaceResult.data, bottomLeftResult.data);
assert.strictEqual(workspaceResult.data.buffer, workspaceDataBuffer);
assert.strictEqual(workspaceResult.shape?.mask.buffer, workspaceMaskBuffer);

const emptyWorkspaceResult = createSplatScreenFloodMaskFromRgba8(
  bottomLeftPixels,
  {
    width: 5,
    height: 4,
    seedX: 1,
    seedY: 0,
    threshold: 0,
    workspace,
  },
);
assert.strictEqual(emptyWorkspaceResult.matchedPixelCount, 0);
assert.strictEqual(emptyWorkspaceResult.shape, null);
assert.strictEqual(emptyWorkspaceResult.data.buffer, workspaceDataBuffer);
assert.strictEqual(workspace.visited?.buffer, workspaceVisitedBuffer);
assert.strictEqual(workspace.stack?.buffer, workspaceStackBuffer);
assert.strictEqual(alphaAt(emptyWorkspaceResult.data, 5, 1, 0), 0);
assert.strictEqual(alphaAt(emptyWorkspaceResult.data, 5, 2, 1), 0);

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

const renderReadbackPixels = rgbaFromAlphaRows(
  [
    [90, 90],
    [0, 90],
  ],
  "bottom-left",
);
const previousTarget = { name: "previous-target" };
let currentTarget: unknown = previousTarget;
let xrEnabled = true;
let autoClear = true;
let dirtyCalls = 0;
let renderObject: unknown = null;
let readRect: { x: number; y: number; width: number; height: number } | null =
  null;
let clearArgs: unknown[] | null = null;
let clearColorArgs: unknown[] | null = null;
const restoredViewport = new THREE.Vector4(4, 3, 2, 1);
const restoredScissor = new THREE.Vector4(8, 7, 6, 5);
const rendererLog: string[] = [];
const fakeRenderer = {
  xr: {
    get enabled() {
      return xrEnabled;
    },
    set enabled(value: boolean) {
      xrEnabled = value;
      rendererLog.push(`xr:${value}`);
    },
  },
  get autoClear() {
    return autoClear;
  },
  set autoClear(value: boolean) {
    autoClear = value;
    rendererLog.push(`autoClear:${value}`);
  },
  getDrawingBufferSize: (target: THREE.Vector2) => target.set(2, 2),
  getRenderTarget: () => currentTarget,
  setRenderTarget: (target: unknown) => {
    currentTarget = target;
    rendererLog.push(
      target === previousTarget ? "target:restore" : "target:set",
    );
  },
  getViewport: (target: THREE.Vector4) => target.copy(restoredViewport),
  setViewport: (...args: unknown[]) => {
    rendererLog.push(args.length === 1 ? "viewport:restore" : "viewport:set");
  },
  getScissor: (target: THREE.Vector4) => target.copy(restoredScissor),
  setScissor: () => {
    rendererLog.push("scissor:restore");
  },
  getScissorTest: () => true,
  setScissorTest: (value: boolean) => {
    rendererLog.push(`scissorTest:${value}`);
  },
  getClearColor: (target: THREE.Color) => target.setRGB(0.1, 0.2, 0.3),
  getClearAlpha: () => 0.4,
  setClearColor: (...args: unknown[]) => {
    clearColorArgs = args;
    rendererLog.push(
      args[0] instanceof THREE.Color ? "clearColor:restore" : "clearColor:set",
    );
  },
  clear: (...args: unknown[]) => {
    clearArgs = args;
    rendererLog.push("clear");
  },
  render: (object: unknown) => {
    renderObject = object;
    rendererLog.push("render");
  },
  readRenderTargetPixels: (
    _target: unknown,
    x: number,
    y: number,
    width: number,
    height: number,
    pixels: Uint8Array,
  ) => {
    readRect = { x, y, width, height };
    pixels.set(renderReadbackPixels);
    rendererLog.push("read");
  },
};

const sparkRenderer = Object.create(
  SparkRenderer.prototype,
) as SparkRenderer & {
  renderer: typeof fakeRenderer;
  uniforms: {
    splatPickOutputMode: { value: number };
    splatEditorStateFilterMode: { value: number };
  };
  accumulators: unknown[];
  autoUpdate: boolean;
  dirty: boolean;
  onDirty: () => void;
  screenFloodWorkspace?: SplatScreenFloodMaskWorkspace;
};
sparkRenderer.renderer = fakeRenderer;
sparkRenderer.uniforms = {
  splatPickOutputMode: { value: 3 },
  splatEditorStateFilterMode: { value: 5 },
};
sparkRenderer.accumulators = [];
sparkRenderer.autoUpdate = true;
sparkRenderer.dirty = false;
sparkRenderer.onDirty = () => {
  dirtyCalls += 1;
};

let floodStats: SplatScreenFloodMaskRenderStats | null = null;
const renderedFlood = await sparkRenderer.createSplatScreenFloodMask({
  scene: new THREE.Scene(),
  camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10),
  seedX: 1,
  seedY: 0,
  threshold: 0.1,
  update: false,
  onStats: (stats) => {
    floodStats = stats;
  },
});

assert.strictEqual(renderedFlood.matchedPixelCount, 3);
assert.deepStrictEqual(renderedFlood.bounds, {
  x: 0,
  y: 0,
  width: 2,
  height: 2,
});
assert.strictEqual(alphaAt(renderedFlood.data, 2, 0, 0), 255);
assert.strictEqual(alphaAt(renderedFlood.data, 2, 1, 1), 255);
assert.strictEqual(alphaAt(renderedFlood.data, 2, 0, 1), 0);
assert.strictEqual(renderObject, sparkRenderer);
assert.deepStrictEqual(readRect, { x: 0, y: 0, width: 2, height: 2 });
assert.deepStrictEqual(clearArgs, [true, true, true]);
assert.deepStrictEqual(clearColorArgs, [new THREE.Color(0.1, 0.2, 0.3), 0.4]);
assert.strictEqual(currentTarget, previousTarget);
assert.strictEqual(xrEnabled, true);
assert.strictEqual(autoClear, true);
assert.strictEqual(sparkRenderer.autoUpdate, true);
assert.strictEqual(sparkRenderer.uniforms.splatPickOutputMode.value, 3);
assert.strictEqual(sparkRenderer.uniforms.splatEditorStateFilterMode.value, 5);
assert.strictEqual(dirtyCalls, 1);
assert.strictEqual(floodStats?.matchedPixelCount, 3);
assert.deepStrictEqual(floodStats?.bounds, { x: 0, y: 0, width: 2, height: 2 });
assert.strictEqual(floodStats?.targetWidth, 2);
assert.strictEqual(floodStats?.targetHeight, 2);
assert.ok(rendererLog.includes("render"));
assert.ok(rendererLog.includes("read"));
const rendererFloodWorkspace = sparkRenderer.screenFloodWorkspace;
assert.ok(rendererFloodWorkspace?.data);
assert.ok(rendererFloodWorkspace?.visited);
assert.ok(rendererFloodWorkspace?.stack);
assert.ok(rendererFloodWorkspace?.mask);

const secondRenderedFlood = await sparkRenderer.createSplatScreenFloodMask({
  scene: new THREE.Scene(),
  camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10),
  seedX: 1,
  seedY: 0,
  threshold: 0.1,
  update: false,
});

assert.strictEqual(secondRenderedFlood.matchedPixelCount, 3);
assert.strictEqual(secondRenderedFlood.data.buffer, renderedFlood.data.buffer);
assert.strictEqual(
  secondRenderedFlood.shape?.mask.buffer,
  renderedFlood.shape?.mask.buffer,
);

console.log("Splat screen flood mask tests passed");
