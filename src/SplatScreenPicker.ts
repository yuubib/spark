import type * as THREE from "three";

import type {
  SplatEditorSelectionOperation,
  SplatEditorStateFilterMode,
  SplatEditorStateMutationOptions,
  SplatEditorStateMutationResult,
} from "./SplatEditorState";
import type { SplatGenerator } from "./SplatGenerator";

export type SplatScreenPickShape =
  | {
      kind: "point";
      x: number;
      y: number;
      radiusPixels?: number;
    }
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      kind: "mask";
      x: number;
      y: number;
      width: number;
      height: number;
      mask: ArrayLike<number>;
      maskWidth: number;
      maskHeight: number;
      maskChannel?: 0 | 1 | 2 | 3;
      maskThreshold?: number;
      maskRect?: SplatScreenPickMaskRect;
    };

export type SplatScreenRgba8RowOrder = "bottom-left" | "top-left";
export type SplatScreenFloodMaskShape = Extract<
  SplatScreenPickShape,
  { kind: "mask" }
>;

export type SplatScreenFloodMaskOptions = {
  width: number;
  height: number;
  seedX: number;
  seedY: number;
  threshold?: number;
  channel?: 0 | 1 | 2 | 3;
  rowOrder?: SplatScreenRgba8RowOrder;
  workspace?: SplatScreenFloodMaskWorkspace;
};

export type SplatScreenFloodMaskWorkspace = {
  data?: Uint8Array;
  visited?: Uint8Array;
  stack?: Uint32Array;
  mask?: Uint8Array;
};

export type SplatScreenFloodMaskResult = {
  data: Uint8Array;
  width: number;
  height: number;
  sourceChannel: 0 | 1 | 2 | 3;
  sourceThreshold: number;
  seed: {
    x: number;
    y: number;
    value: number;
  };
  matchedPixelCount: number;
  bounds: Omit<SplatScreenPickRect, "mask"> | null;
  shape: SplatScreenFloodMaskShape | null;
};

export type SplatScreenFloodMaskRenderOptions = {
  scene: THREE.Object3D;
  camera: THREE.Camera;
  seedX: number;
  seedY: number;
  width?: number;
  height?: number;
  threshold?: number;
  channel?: 0 | 1 | 2 | 3;
  update?: boolean;
  workspace?: SplatScreenFloodMaskWorkspace;
  onStats?: (stats: SplatScreenFloodMaskRenderStats) => void;
};

export type SplatScreenFloodMaskRenderStats = {
  viewportWidth: number;
  viewportHeight: number;
  targetWidth: number;
  targetHeight: number;
  seed: {
    x: number;
    y: number;
    value: number;
  };
  matchedPixelCount: number;
  bounds: Omit<SplatScreenPickRect, "mask"> | null;
  timingsMs: {
    update: number;
    render: number;
    readback: number;
    flood: number;
    total: number;
  };
};

export type SplatScreenPickRenderMode = "viewport" | "shape";
export type SplatScreenPickCandidateMode = "rendered-id" | "centers";
export type SplatScreenPickCenterProcessor = "auto" | "cpu" | "gpu";
export type SplatScreenPickCenterProcessorMode = "cpu" | "gpu";
export type SplatCenterIntersectionOutputEncoding =
  | "bytes-rgba8"
  | "bitset-rgba8";
export type SplatCenterIntersectionReadbackMode = "async" | "sync";
export type SplatScreenPickCenterProcessorFallbackReason =
  | "requested-cpu"
  | "auto-cpu-estimated-faster"
  | "gpu-unavailable"
  | "webgl2-unavailable"
  | "unsupported-source"
  | "lod-or-paged"
  | "missing-center-texture"
  | "selected-index-mode"
  | "selected-transform-preview"
  | "scene-wide-unsupported"
  | "nearest-unsupported"
  | "target-not-visible"
  | "gpu-readback-failed";

export type SplatScreenPickOptions = {
  scene: THREE.Object3D;
  camera: THREE.Camera;
  shape: SplatScreenPickShape;
  width?: number;
  height?: number;
  editorStateMode?: SplatEditorStateFilterMode;
  operation?: SplatEditorSelectionOperation;
  update?: boolean;
  maxCandidates?: number;
  sort?: boolean;
  candidateMode?: SplatScreenPickCandidateMode;
  centerProcessor?: SplatScreenPickCenterProcessor;
  renderMode?: SplatScreenPickRenderMode;
  onStats?: (stats: SplatScreenPickStats) => void;
};

export type SplatScreenPickIndexOptions = SplatScreenPickOptions & {
  target: SplatGenerator;
  indexBuffer?: SplatScreenPickIndexBuffer;
};

export type SplatScreenPickStateSelectionOptions =
  SplatScreenPickIndexOptions & {
    mutationOptions?: SplatEditorStateMutationOptions;
    shouldMutate?: () => boolean;
  };

export type SplatScreenPickStateSelectionResult = {
  applied: boolean;
  canceled?: boolean;
  candidateCount: number;
  pickStats?: SplatScreenPickStats;
  mutation?: SplatEditorStateMutationResult;
};

export type SplatScreenPickIndexBuffer = {
  buffer: Uint32Array;
};

export type SplatScreenPickNearestCenterRankMode =
  | "screen-distance-depth"
  | "screen-distance"
  | "depth";

export type SplatScreenPickNearestCenterOptions =
  SplatScreenPickIndexOptions & {
    rankMode?: SplatScreenPickNearestCenterRankMode;
  };

export type SplatScreenPickNearestCenterResult = {
  index: number;
  pixel: {
    x: number;
    y: number;
  };
  screenDistanceSq: number;
  ndcZ: number;
};

export type SplatScreenPickRenderedIndexOptions = Omit<
  SplatScreenPickIndexOptions,
  "candidateMode" | "maxCandidates" | "sort"
>;

export type SplatScreenPickRenderedIndexResult = {
  index: number;
  accumulatorIndex: number;
  pixel: {
    x: number;
    y: number;
  };
};

export type SplatScreenPickHit = {
  object: SplatGenerator;
  index: number;
  accumulatorIndex: number;
  sourceIndexStable: boolean;
  pixel?: {
    x: number;
    y: number;
  };
};

export type SplatScreenPickRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  mask?: SplatScreenPickMask;
};

export type SplatScreenPickMaskRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SplatScreenPickMask = {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channel: 0 | 1 | 2 | 3;
  threshold: number;
  sourceRect?: SplatScreenPickMaskRect;
};

export type SplatScreenPickPixelHit = {
  accumulatorIndex: number;
  pixel: {
    x: number;
    y: number;
  };
};

export type SplatScreenPickProjectedCenter = {
  x: number;
  y: number;
  ndcZ: number;
};

export type SplatScreenPickCenterBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minNdcZ: number;
  maxNdcZ: number;
};

export type SplatScreenPickCenterBoundsMode = "half-open" | "strict";

export type SplatScreenPickViewOffset = {
  fullWidth: number;
  fullHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SplatScreenPickRenderLayout = {
  targetWidth: number;
  targetHeight: number;
  readRect: Omit<SplatScreenPickRect, "mask">;
  viewOffset: SplatScreenPickViewOffset | null;
};

export type SplatScreenPickCollectStats = {
  pixelCount: number;
  candidatePixelCount: number;
  maskTestedPixelCount: number;
  encodedPixelCount: number;
  duplicatePixelHitCount: number;
  uniqueHitCount: number;
  earlyExit: boolean;
};

export type SplatScreenPickCenterCollectStats = {
  requestedProcessor: SplatScreenPickCenterProcessor;
  processor: SplatScreenPickCenterProcessorMode;
  fallbackReason?: SplatScreenPickCenterProcessorFallbackReason;
  centerCount: number;
  candidateCenterCount: number;
  maskTestedCenterCount: number;
  stateRejectedCenterCount: number;
  viewRejectedCenterCount: number;
  duplicateCenterHitCount: number;
  uniqueHitCount: number;
  processorOutputEncoding?: SplatCenterIntersectionOutputEncoding;
  processorReadbackByteCount?: number;
  processorReadbackMode?: SplatCenterIntersectionReadbackMode;
  projectedBounds: SplatScreenPickCenterBounds | null;
  candidateBounds: SplatScreenPickCenterBounds | null;
  earlyExit: boolean;
};

export type SplatCenterIntersectionCompactStats = {
  byteCount: number;
  candidateByteCount: number;
  uniqueHitCount: number;
  earlyExit: boolean;
};

export type SplatScreenPickStats = {
  shapeKind: SplatScreenPickShape["kind"];
  candidateMode?: SplatScreenPickCandidateMode;
  renderMode: SplatScreenPickRenderMode;
  viewportWidth: number;
  viewportHeight: number;
  targetWidth: number;
  targetHeight: number;
  normalizedRect: Omit<SplatScreenPickRect, "mask">;
  readRect: Omit<SplatScreenPickRect, "mask">;
  pixelHitCount: number;
  mappedHitCount: number;
  sourceStableHitCount: number;
  collect: SplatScreenPickCollectStats;
  centerCollect?: SplatScreenPickCenterCollectStats;
  timingsMs: {
    update: number;
    render?: number;
    readback?: number;
    renderReadback: number;
    decode: number;
    map: number;
    total: number;
  };
};

export const SPLAT_SCREEN_PICK_FILTER_OFF = 0;
export const SPLAT_SCREEN_PICK_FILTER_ALL = 1;
export const SPLAT_SCREEN_PICK_FILTER_VISIBLE = 2;
export const SPLAT_SCREEN_PICK_FILTER_SELECTED = 3;
export const SPLAT_SCREEN_PICK_FILTER_EDITABLE = 4;
export const SPLAT_SCREEN_PICK_FILTER_PICK_ADD = 5;
export const SPLAT_SCREEN_PICK_FILTER_PICK_REMOVE = 6;

export function editorSelectionOperationToPickFilterMode(
  operation: SplatEditorSelectionOperation,
): SplatEditorStateFilterMode {
  switch (operation) {
    case "add":
      return "pick-add";
    case "remove":
      return "pick-remove";
    case "set":
      return "pick-set";
    default:
      throw new Error(`Unsupported editor selection operation: ${operation}`);
  }
}

export function splatEditorStateFilterModeToPickUniform(
  mode?: SplatEditorStateFilterMode,
): number {
  switch (mode) {
    case undefined:
      return SPLAT_SCREEN_PICK_FILTER_PICK_SET;
    case "all":
      return SPLAT_SCREEN_PICK_FILTER_ALL;
    case "visible":
      return SPLAT_SCREEN_PICK_FILTER_VISIBLE;
    case "selected":
      return SPLAT_SCREEN_PICK_FILTER_SELECTED;
    case "editable":
    case "pick-set":
      return SPLAT_SCREEN_PICK_FILTER_EDITABLE;
    case "pick-add":
      return SPLAT_SCREEN_PICK_FILTER_PICK_ADD;
    case "pick-remove":
      return SPLAT_SCREEN_PICK_FILTER_PICK_REMOVE;
    default:
      throw new Error(`Unsupported splat editor state filter mode: ${mode}`);
  }
}

const SPLAT_SCREEN_PICK_FILTER_PICK_SET = SPLAT_SCREEN_PICK_FILTER_EDITABLE;
const DEFAULT_SPLAT_SCREEN_FLOOD_THRESHOLD = 0.2;
const SPLAT_SCREEN_FLOOD_MASK_CHANNEL = 3;

export function normalizeSplatScreenPickShape(
  shape: SplatScreenPickShape,
  targetWidth: number,
  targetHeight: number,
): SplatScreenPickRect {
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error("Splat screen picking target size must be positive");
  }

  if (shape.kind === "point") {
    const radius = Math.max(0, Math.floor(shape.radiusPixels ?? 0));
    const centerX = Math.floor(shape.x * targetWidth);
    const centerY = Math.floor(shape.y * targetHeight);
    return clipPickRect(
      {
        x: centerX - radius,
        y: centerY - radius,
        width: radius * 2 + 1,
        height: radius * 2 + 1,
      },
      targetWidth,
      targetHeight,
    );
  }

  const rawX = shape.width < 0 ? shape.x + shape.width : shape.x;
  const rawY = shape.height < 0 ? shape.y + shape.height : shape.y;
  const rawWidth = Math.abs(shape.width);
  const rawHeight = Math.abs(shape.height);
  const x = Math.floor(rawX * targetWidth);
  const y = Math.floor(rawY * targetHeight);
  const width = Math.max(1, Math.ceil((rawX + rawWidth) * targetWidth) - x);
  const height = Math.max(1, Math.ceil((rawY + rawHeight) * targetHeight) - y);
  const rect = clipPickRect({ x, y, width, height }, targetWidth, targetHeight);

  if (shape.kind !== "mask") {
    return rect;
  }
  return {
    ...rect,
    mask: {
      data: shape.mask,
      width: shape.maskWidth,
      height: shape.maskHeight,
      channel: shape.maskChannel ?? 3,
      threshold: shape.maskThreshold ?? 0,
      ...(shape.maskRect
        ? {
            sourceRect: normalizeSplatScreenPickMaskRect(
              shape.maskRect,
              targetWidth,
              targetHeight,
            ),
          }
        : {}),
    },
  };
}

export function normalizeSplatScreenPickCenterShape(
  shape: SplatScreenPickShape,
  targetWidth: number,
  targetHeight: number,
): SplatScreenPickRect {
  if (shape.kind !== "rect") {
    return normalizeSplatScreenPickShape(shape, targetWidth, targetHeight);
  }
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error("Splat screen picking target size must be positive");
  }

  const rawX = shape.width < 0 ? shape.x + shape.width : shape.x;
  const rawY = shape.height < 0 ? shape.y + shape.height : shape.y;
  return clipPickRect(
    {
      x: rawX * targetWidth,
      y: rawY * targetHeight,
      width: Math.abs(shape.width) * targetWidth,
      height: Math.abs(shape.height) * targetHeight,
    },
    targetWidth,
    targetHeight,
  );
}

export function resolveSplatScreenPickRenderLayout(
  rect: SplatScreenPickRect,
  viewportWidth: number,
  viewportHeight: number,
  renderMode: SplatScreenPickRenderMode = "viewport",
): SplatScreenPickRenderLayout {
  const fullWidth = Math.max(1, Math.floor(viewportWidth));
  const fullHeight = Math.max(1, Math.floor(viewportHeight));
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  if (renderMode === "shape") {
    return {
      targetWidth: width,
      targetHeight: height,
      readRect: { x: 0, y: 0, width, height },
      viewOffset: {
        fullWidth,
        fullHeight,
        x,
        y,
        width,
        height,
      },
    };
  }

  if (renderMode !== "viewport") {
    throw new Error(`Unsupported splat screen pick render mode: ${renderMode}`);
  }

  return {
    targetWidth: fullWidth,
    targetHeight: fullHeight,
    readRect: { x, y, width, height },
    viewOffset: null,
  };
}

function normalizeSplatScreenPickMaskRect(
  rect: SplatScreenPickMaskRect,
  targetWidth: number,
  targetHeight: number,
): SplatScreenPickMaskRect {
  const rawX = rect.width < 0 ? rect.x + rect.width : rect.x;
  const rawY = rect.height < 0 ? rect.y + rect.height : rect.y;
  return clipPickRect(
    {
      x: rawX * targetWidth,
      y: rawY * targetHeight,
      width: Math.abs(rect.width) * targetWidth,
      height: Math.abs(rect.height) * targetHeight,
    },
    targetWidth,
    targetHeight,
  );
}

export function createSplatScreenFloodMaskFromRgba8(
  pixels: ArrayLike<number>,
  options: SplatScreenFloodMaskOptions,
): SplatScreenFloodMaskResult {
  const width = Math.floor(options.width);
  const height = Math.floor(options.height);
  if (width <= 0 || height <= 0) {
    throw new Error("Splat flood mask dimensions must be positive");
  }

  const expectedLength = width * height * 4;
  if (pixels.length < expectedLength) {
    throw new Error(
      `Splat flood pixel buffer too small: ${pixels.length} < ${expectedLength}`,
    );
  }

  const seedX = Math.floor(options.seedX);
  const seedY = Math.floor(options.seedY);
  if (
    !Number.isFinite(seedX) ||
    !Number.isFinite(seedY) ||
    seedX < 0 ||
    seedX >= width ||
    seedY < 0 ||
    seedY >= height
  ) {
    throw new Error("Splat flood seed pixel must be inside the target");
  }

  const sourceChannel = options.channel ?? 3;
  const sourceThreshold = normalizeSplatScreenFloodThreshold(
    options.threshold ?? DEFAULT_SPLAT_SCREEN_FLOOD_THRESHOLD,
  );
  const maxDelta = sourceThreshold * 255;
  const rowOrder = options.rowOrder ?? "bottom-left";
  const workspace = options.workspace;
  const seedValue = readRgba8ChannelTopLeft(
    pixels,
    width,
    height,
    seedX,
    seedY,
    sourceChannel,
    rowOrder,
  );
  const data = ensureFloodUint8Buffer(
    workspace,
    "data",
    expectedLength,
  ).subarray(0, expectedLength);
  data.fill(0);
  const visited = ensureFloodUint8Buffer(
    workspace,
    "visited",
    width * height,
  ).subarray(0, width * height);
  visited.fill(0);
  const stack = ensureFloodUint32Buffer(workspace, width * height);
  let stackLength = 0;
  let matchedPixelCount = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  const push = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return;
    }
    const index = y * width + x;
    if (!visited[index]) {
      visited[index] = 1;
      stack[stackLength] = index;
      stackLength += 1;
    }
  };

  push(seedX, seedY);

  while (stackLength > 0) {
    stackLength -= 1;
    const index = stack[stackLength] as number;

    const x = index % width;
    const y = Math.floor(index / width);
    const value = readRgba8ChannelTopLeft(
      pixels,
      width,
      height,
      x,
      y,
      sourceChannel,
      rowOrder,
    );
    if (Math.abs(value - seedValue) >= maxDelta) {
      continue;
    }

    const offset = index * 4;
    data[offset] = 255;
    data[offset + SPLAT_SCREEN_FLOOD_MASK_CHANNEL] = 255;
    matchedPixelCount += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);

    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  if (matchedPixelCount === 0) {
    return {
      data,
      width,
      height,
      sourceChannel,
      sourceThreshold,
      seed: { x: seedX, y: seedY, value: seedValue },
      matchedPixelCount,
      bounds: null,
      shape: null,
    };
  }

  const bounds = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  const croppedMask = cropRgba8TopLeft(data, width, bounds, workspace);
  const shape: SplatScreenFloodMaskShape = {
    kind: "mask",
    x: bounds.x / width,
    y: bounds.y / height,
    width: bounds.width / width,
    height: bounds.height / height,
    mask: croppedMask,
    maskWidth: bounds.width,
    maskHeight: bounds.height,
    maskChannel: SPLAT_SCREEN_FLOOD_MASK_CHANNEL,
    maskThreshold: 0,
  };

  return {
    data,
    width,
    height,
    sourceChannel,
    sourceThreshold,
    seed: { x: seedX, y: seedY, value: seedValue },
    matchedPixelCount,
    bounds,
    shape,
  };
}

export function collectSplatScreenPickHitsFromRgba8(
  pixels: ArrayLike<number>,
  rect: SplatScreenPickRect,
  options: {
    maxCandidates?: number;
    sort?: boolean;
    stats?: SplatScreenPickCollectStats;
  } = {},
): SplatScreenPickPixelHit[] {
  const expectedLength = rect.width * rect.height * 4;
  if (pixels.length < expectedLength) {
    throw new Error(
      `Splat screen pick pixel buffer too small: ${pixels.length} < ${expectedLength}`,
    );
  }

  const seen = new Set<number>();
  const hits: SplatScreenPickPixelHit[] = [];
  const maxCandidates =
    options.maxCandidates != null
      ? Math.max(0, Math.floor(options.maxCandidates))
      : Number.POSITIVE_INFINITY;
  const mask = rect.mask;
  const directMask =
    mask &&
    !mask.sourceRect &&
    mask.width === rect.width &&
    mask.height === rect.height
      ? mask
      : null;
  const stats = {
    pixelCount: rect.width * rect.height,
    candidatePixelCount: 0,
    maskTestedPixelCount: 0,
    encodedPixelCount: 0,
    duplicatePixelHitCount: 0,
    uniqueHitCount: 0,
    earlyExit: false,
  };
  const finish = () => {
    stats.uniqueHitCount = hits.length;
    if (options.stats) {
      Object.assign(options.stats, stats);
    }
    return maybeSortPixelHits(hits, options.sort);
  };

  for (let readY = 0; readY < rect.height; readY++) {
    const topY = rect.height - 1 - readY;
    for (let x = 0; x < rect.width; x++) {
      if (mask) {
        stats.maskTestedPixelCount += 1;
        if (
          directMask
            ? !isPickMaskPixelEnabledAt(directMask, x, topY)
            : !isPickMaskScreenPixelEnabled(
                mask,
                rect.x + x,
                rect.y + topY,
                rect,
              )
        ) {
          continue;
        }
      }
      stats.candidatePixelCount += 1;

      const offset = (readY * rect.width + x) * 4;
      const encoded =
        (pixels[offset] |
          (pixels[offset + 1] << 8) |
          (pixels[offset + 2] << 16) |
          (pixels[offset + 3] << 24)) >>>
        0;
      if (encoded === 0) {
        continue;
      }
      stats.encodedPixelCount += 1;

      const accumulatorIndex = encoded - 1;
      if (seen.has(accumulatorIndex)) {
        stats.duplicatePixelHitCount += 1;
        continue;
      }
      seen.add(accumulatorIndex);
      hits.push({
        accumulatorIndex,
        pixel: {
          x: rect.x + x,
          y: rect.y + topY,
        },
      });
      if (hits.length >= maxCandidates) {
        stats.earlyExit = true;
        return finish();
      }
    }
  }

  return finish();
}

export function createSplatScreenPickCenterCollectStats(): SplatScreenPickCenterCollectStats {
  return {
    requestedProcessor: "cpu",
    processor: "cpu",
    fallbackReason: "requested-cpu",
    centerCount: 0,
    candidateCenterCount: 0,
    maskTestedCenterCount: 0,
    stateRejectedCenterCount: 0,
    viewRejectedCenterCount: 0,
    duplicateCenterHitCount: 0,
    uniqueHitCount: 0,
    projectedBounds: null,
    candidateBounds: null,
    earlyExit: false,
  };
}

export function setSplatScreenPickCenterProcessorStats(
  stats: SplatScreenPickCenterCollectStats,
  requestedProcessor: SplatScreenPickCenterProcessor = "auto",
  processor: SplatScreenPickCenterProcessorMode = "cpu",
  fallbackReason?: SplatScreenPickCenterProcessorFallbackReason,
): void {
  stats.requestedProcessor = requestedProcessor;
  stats.processor = processor;
  if (fallbackReason) {
    stats.fallbackReason = fallbackReason;
  } else {
    stats.fallbackReason = undefined;
  }
}

export function createSplatCenterIntersectionCompactStats(): SplatCenterIntersectionCompactStats {
  return {
    byteCount: 0,
    candidateByteCount: 0,
    uniqueHitCount: 0,
    earlyExit: false,
  };
}

const SPLAT_CENTER_INTERSECTION_LOW_BIT_INDEX = (() => {
  const table = new Int8Array(256);
  table.fill(-1);
  for (let bit = 0; bit < 8; bit += 1) {
    table[1 << bit] = bit;
  }
  return table;
})();

export function compactSplatCenterIntersectionBytes(
  bytes: ArrayLike<number>,
  options: {
    maxCandidates?: number;
    indexBuffer?: SplatScreenPickIndexBuffer;
    stats?: SplatCenterIntersectionCompactStats;
  } = {},
): Uint32Array {
  const maxCandidates =
    options.maxCandidates != null
      ? Math.max(0, Math.floor(options.maxCandidates))
      : Number.POSITIVE_INFINITY;
  let indices =
    options.indexBuffer?.buffer ??
    new Uint32Array(
      Math.min(Number.isFinite(maxCandidates) ? maxCandidates : 1024, 1024),
    );
  let indexCount = 0;
  const stats = createSplatCenterIntersectionCompactStats();
  stats.byteCount = bytes.length;

  const finish = () => {
    stats.uniqueHitCount = indexCount;
    if (options.stats) {
      Object.assign(options.stats, stats);
    }
    return indices.subarray(0, indexCount);
  };

  if (maxCandidates <= 0) {
    stats.earlyExit = true;
    return finish();
  }

  for (let index = 0; index < bytes.length; index += 1) {
    if ((bytes[index] ?? 0) === 0) {
      continue;
    }
    stats.candidateByteCount += 1;
    if (indexCount >= maxCandidates) {
      stats.earlyExit = true;
      return finish();
    }
    if (indexCount >= indices.length) {
      const nextCapacity = Math.min(
        Number.isFinite(maxCandidates)
          ? maxCandidates
          : Number.POSITIVE_INFINITY,
        Math.max(indices.length ? indices.length * 2 : 1024, indexCount + 1),
      );
      const next = new Uint32Array(nextCapacity);
      next.set(indices.subarray(0, indexCount));
      indices = next;
      if (options.indexBuffer) {
        options.indexBuffer.buffer = next;
      }
    }
    indices[indexCount] = index;
    indexCount += 1;
  }

  return finish();
}

export function compactSplatCenterIntersectionBitsetBytes(
  bytes: ArrayLike<number>,
  options: {
    bitCount?: number;
    maxCandidates?: number;
    indexBuffer?: SplatScreenPickIndexBuffer;
    stats?: SplatCenterIntersectionCompactStats;
  } = {},
): Uint32Array {
  const bitCount =
    options.bitCount != null
      ? Math.max(0, Math.floor(options.bitCount))
      : bytes.length * 8;
  const byteCount = Math.ceil(bitCount / 8);
  if (bytes.length < byteCount) {
    throw new Error(
      `Splat center bitset buffer too small: ${bytes.length} < ${byteCount}`,
    );
  }

  const maxCandidates =
    options.maxCandidates != null
      ? Math.max(0, Math.floor(options.maxCandidates))
      : Number.POSITIVE_INFINITY;
  let indices =
    options.indexBuffer?.buffer ??
    new Uint32Array(
      Math.min(Number.isFinite(maxCandidates) ? maxCandidates : 1024, 1024),
    );
  let indexCount = 0;
  const stats = createSplatCenterIntersectionCompactStats();
  stats.byteCount = byteCount;

  const finish = () => {
    stats.uniqueHitCount = indexCount;
    if (options.stats) {
      Object.assign(options.stats, stats);
    }
    return indices.subarray(0, indexCount);
  };

  if (maxCandidates <= 0) {
    stats.earlyExit = true;
    return finish();
  }

  for (let byteIndex = 0; byteIndex < byteCount; byteIndex += 1) {
    const packed = (bytes[byteIndex] ?? 0) & 0xff;
    if (packed === 0) {
      continue;
    }

    let remaining = packed;
    while (remaining !== 0) {
      const lowBit = remaining & -remaining;
      const bit = SPLAT_CENTER_INTERSECTION_LOW_BIT_INDEX[lowBit] ?? -1;
      const sourceIndex = byteIndex * 8 + bit;
      if (sourceIndex >= bitCount) {
        return finish();
      }

      stats.candidateByteCount += 1;
      if (indexCount >= maxCandidates) {
        stats.earlyExit = true;
        return finish();
      }
      if (indexCount >= indices.length) {
        const nextCapacity = Math.min(
          Number.isFinite(maxCandidates)
            ? maxCandidates
            : Number.POSITIVE_INFINITY,
          Math.max(indices.length ? indices.length * 2 : 1024, indexCount + 1),
        );
        const next = new Uint32Array(nextCapacity);
        next.set(indices.subarray(0, indexCount));
        indices = next;
        if (options.indexBuffer) {
          options.indexBuffer.buffer = next;
        }
      }
      indices[indexCount] = sourceIndex;
      indexCount += 1;
      remaining &= remaining - 1;
    }
  }

  return finish();
}

export function recordSplatScreenPickProjectedCenter(
  stats: SplatScreenPickCenterCollectStats,
  center: SplatScreenPickProjectedCenter,
): void {
  stats.projectedBounds = expandSplatScreenPickCenterBounds(
    stats.projectedBounds,
    center,
  );
}

export function recordSplatScreenPickCandidateCenter(
  stats: SplatScreenPickCenterCollectStats,
  center: SplatScreenPickProjectedCenter,
): void {
  stats.candidateBounds = expandSplatScreenPickCenterBounds(
    stats.candidateBounds,
    center,
  );
}

function expandSplatScreenPickCenterBounds(
  bounds: SplatScreenPickCenterBounds | null,
  center: SplatScreenPickProjectedCenter,
): SplatScreenPickCenterBounds {
  if (!bounds) {
    return {
      minX: center.x,
      minY: center.y,
      maxX: center.x,
      maxY: center.y,
      minNdcZ: center.ndcZ,
      maxNdcZ: center.ndcZ,
    };
  }
  bounds.minX = Math.min(bounds.minX, center.x);
  bounds.minY = Math.min(bounds.minY, center.y);
  bounds.maxX = Math.max(bounds.maxX, center.x);
  bounds.maxY = Math.max(bounds.maxY, center.y);
  bounds.minNdcZ = Math.min(bounds.minNdcZ, center.ndcZ);
  bounds.maxNdcZ = Math.max(bounds.maxNdcZ, center.ndcZ);
  return bounds;
}

export function projectSplatScreenPickCenter(
  objectToClipElements: ArrayLike<number>,
  centerX: number,
  centerY: number,
  centerZ: number,
  viewportWidth: number,
  viewportHeight: number,
  target: SplatScreenPickProjectedCenter,
): boolean {
  const clipX =
    objectToClipElements[0] * centerX +
    objectToClipElements[4] * centerY +
    objectToClipElements[8] * centerZ +
    objectToClipElements[12];
  const clipY =
    objectToClipElements[1] * centerX +
    objectToClipElements[5] * centerY +
    objectToClipElements[9] * centerZ +
    objectToClipElements[13];
  const clipZ =
    objectToClipElements[2] * centerX +
    objectToClipElements[6] * centerY +
    objectToClipElements[10] * centerZ +
    objectToClipElements[14];
  const clipW =
    objectToClipElements[3] * centerX +
    objectToClipElements[7] * centerY +
    objectToClipElements[11] * centerZ +
    objectToClipElements[15];

  if (!Number.isFinite(clipW) || clipW === 0) {
    return false;
  }
  const invW = 1 / clipW;
  const ndcX = clipX * invW;
  const ndcY = clipY * invW;
  const ndcZ = clipZ * invW;
  if (
    !Number.isFinite(ndcX) ||
    !Number.isFinite(ndcY) ||
    !Number.isFinite(ndcZ) ||
    Math.abs(ndcX) > 1 ||
    Math.abs(ndcY) > 1 ||
    Math.abs(ndcZ) > 1
  ) {
    return false;
  }

  target.x = (ndcX * 0.5 + 0.5) * viewportWidth;
  target.y = (-ndcY * 0.5 + 0.5) * viewportHeight;
  target.ndcZ = ndcZ;
  return true;
}

export function testSplatScreenPickCenter(
  rect: SplatScreenPickRect,
  x: number,
  y: number,
  stats?: SplatScreenPickCenterCollectStats,
  boundsMode: SplatScreenPickCenterBoundsMode = "half-open",
): boolean {
  const outsideRect =
    boundsMode === "strict"
      ? x <= rect.x ||
        y <= rect.y ||
        x >= rect.x + rect.width ||
        y >= rect.y + rect.height
      : x < rect.x ||
        y < rect.y ||
        x >= rect.x + rect.width ||
        y >= rect.y + rect.height;
  if (!Number.isFinite(x) || !Number.isFinite(y) || outsideRect) {
    if (stats) {
      stats.viewRejectedCenterCount += 1;
    }
    return false;
  }

  const mask = rect.mask;
  if (mask) {
    if (stats) {
      stats.maskTestedCenterCount += 1;
    }
    const localX = Math.floor(x - rect.x);
    const localY = Math.floor(y - rect.y);
    if (
      !mask.sourceRect &&
      mask.width === rect.width &&
      mask.height === rect.height
        ? !isPickMaskPixelEnabledAt(mask, localX, localY)
        : !isPickMaskScreenPixelEnabled(mask, x, y, rect)
    ) {
      if (stats) {
        stats.viewRejectedCenterCount += 1;
      }
      return false;
    }
  }

  return true;
}

export function clipPickRect(
  rect: Omit<SplatScreenPickRect, "mask">,
  targetWidth: number,
  targetHeight: number,
): SplatScreenPickRect {
  const x0 = Math.max(0, Math.min(targetWidth, rect.x));
  const y0 = Math.max(0, Math.min(targetHeight, rect.y));
  const x1 = Math.max(0, Math.min(targetWidth, rect.x + rect.width));
  const y1 = Math.max(0, Math.min(targetHeight, rect.y + rect.height));
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  // Pull the origin back so the (>=1px) read stays inside the framebuffer. A rect flush to / past the
  // right or bottom edge clamps to x0 == targetWidth (likewise y0); with width forced to >=1 that read
  // would otherwise sample the column/row at index targetWidth — one pixel out of bounds, which makes
  // readRenderTargetPixels GL-error or return garbage and yields a spurious/missing edge pick.
  return {
    x: Math.min(x0, Math.max(0, targetWidth - width)),
    y: Math.min(y0, Math.max(0, targetHeight - height)),
    width,
    height,
  };
}

function isPickMaskPixelEnabledAt(
  mask: SplatScreenPickMask,
  x: number,
  y: number,
): boolean {
  const value = mask.data[(y * mask.width + x) * 4 + mask.channel] ?? 0;
  return value > mask.threshold;
}

function isPickMaskScreenPixelEnabled(
  mask: SplatScreenPickMask,
  screenX: number,
  screenY: number,
  rect: SplatScreenPickRect,
): boolean {
  if (mask.width <= 0 || mask.height <= 0) {
    return false;
  }
  const sourceRect = mask.sourceRect ?? rect;
  if (sourceRect.width <= 0 || sourceRect.height <= 0) {
    return false;
  }
  const x = screenX - sourceRect.x;
  const y = screenY - sourceRect.y;
  const maskX = Math.max(
    0,
    Math.min(mask.width - 1, Math.floor((x / sourceRect.width) * mask.width)),
  );
  const maskY = Math.max(
    0,
    Math.min(
      mask.height - 1,
      Math.floor((y / sourceRect.height) * mask.height),
    ),
  );
  return isPickMaskPixelEnabledAt(mask, maskX, maskY);
}

function normalizeSplatScreenFloodThreshold(threshold: number): number {
  if (!Number.isFinite(threshold)) {
    return 0;
  }
  return Math.max(0, Math.min(1, threshold));
}

function readRgba8ChannelTopLeft(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: 0 | 1 | 2 | 3,
  rowOrder: SplatScreenRgba8RowOrder,
): number {
  const sourceY = rowOrder === "bottom-left" ? height - 1 - y : y;
  return pixels[(sourceY * width + x) * 4 + channel] ?? 0;
}

function cropRgba8TopLeft(
  data: Uint8Array,
  sourceWidth: number,
  bounds: Omit<SplatScreenPickRect, "mask">,
  workspace?: SplatScreenFloodMaskWorkspace,
): Uint8Array {
  const length = bounds.width * bounds.height * 4;
  const cropped = ensureFloodUint8Buffer(workspace, "mask", length).subarray(
    0,
    length,
  );
  for (let y = 0; y < bounds.height; y++) {
    const sourceStart = ((bounds.y + y) * sourceWidth + bounds.x) * 4;
    const sourceEnd = sourceStart + bounds.width * 4;
    cropped.set(data.subarray(sourceStart, sourceEnd), y * bounds.width * 4);
  }
  return cropped;
}

function ensureFloodUint8Buffer(
  workspace: SplatScreenFloodMaskWorkspace | undefined,
  key: "data" | "visited" | "mask",
  length: number,
): Uint8Array {
  const safeLength = Math.max(0, Math.floor(length));
  if (!workspace) {
    return new Uint8Array(safeLength);
  }
  const current = workspace[key];
  if (current && current.length >= safeLength) {
    return current;
  }
  const next = new Uint8Array(safeLength);
  workspace[key] = next;
  return next;
}

function ensureFloodUint32Buffer(
  workspace: SplatScreenFloodMaskWorkspace | undefined,
  length: number,
): Uint32Array {
  const safeLength = Math.max(0, Math.floor(length));
  if (!workspace) {
    return new Uint32Array(safeLength);
  }
  if (workspace.stack && workspace.stack.length >= safeLength) {
    return workspace.stack;
  }
  const next = new Uint32Array(safeLength);
  workspace.stack = next;
  return next;
}

function maybeSortPixelHits(
  hits: SplatScreenPickPixelHit[],
  sort = true,
): SplatScreenPickPixelHit[] {
  if (sort) {
    hits.sort((a, b) => a.accumulatorIndex - b.accumulatorIndex);
  }
  return hits;
}
