import type * as THREE from "three";

import type {
  SplatEditorSelectionOperation,
  SplatEditorStateFilterMode,
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
    };

export type SplatScreenPickRenderMode = "viewport" | "shape";
export type SplatScreenPickCandidateMode = "rendered-id" | "centers";

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
  renderMode?: SplatScreenPickRenderMode;
  onStats?: (stats: SplatScreenPickStats) => void;
};

export type SplatScreenPickIndexOptions = SplatScreenPickOptions & {
  target: SplatGenerator;
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

export type SplatScreenPickMask = {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channel: 0 | 1 | 2 | 3;
  threshold: number;
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
  centerCount: number;
  candidateCenterCount: number;
  maskTestedCenterCount: number;
  stateRejectedCenterCount: number;
  viewRejectedCenterCount: number;
  duplicateCenterHitCount: number;
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
    },
  };
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
    mask && mask.width === rect.width && mask.height === rect.height
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
            : !isPickMaskPixelEnabled(mask, x, topY, rect)
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
    centerCount: 0,
    candidateCenterCount: 0,
    maskTestedCenterCount: 0,
    stateRejectedCenterCount: 0,
    viewRejectedCenterCount: 0,
    duplicateCenterHitCount: 0,
    uniqueHitCount: 0,
    earlyExit: false,
  };
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
): boolean {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < rect.x ||
    y < rect.y ||
    x >= rect.x + rect.width ||
    y >= rect.y + rect.height
  ) {
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
      mask.width === rect.width && mask.height === rect.height
        ? !isPickMaskPixelEnabledAt(mask, localX, localY)
        : !isPickMaskPixelEnabled(mask, localX, localY, rect)
    ) {
      if (stats) {
        stats.viewRejectedCenterCount += 1;
      }
      return false;
    }
  }

  return true;
}

function clipPickRect(
  rect: Omit<SplatScreenPickRect, "mask">,
  targetWidth: number,
  targetHeight: number,
): SplatScreenPickRect {
  const x0 = Math.max(0, Math.min(targetWidth, rect.x));
  const y0 = Math.max(0, Math.min(targetHeight, rect.y));
  const x1 = Math.max(0, Math.min(targetWidth, rect.x + rect.width));
  const y1 = Math.max(0, Math.min(targetHeight, rect.y + rect.height));
  return {
    x: x0,
    y: y0,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0),
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

function isPickMaskPixelEnabled(
  mask: SplatScreenPickMask,
  x: number,
  y: number,
  rect: SplatScreenPickRect,
): boolean {
  if (mask.width <= 0 || mask.height <= 0) {
    return false;
  }
  const maskX = Math.max(
    0,
    Math.min(mask.width - 1, Math.floor((x / rect.width) * mask.width)),
  );
  const maskY = Math.max(
    0,
    Math.min(mask.height - 1, Math.floor((y / rect.height) * mask.height)),
  );
  return isPickMaskPixelEnabledAt(mask, maskX, maskY);
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
