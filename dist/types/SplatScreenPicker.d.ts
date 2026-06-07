import { SplatEditorSelectionOperation, SplatEditorStateFilterMode } from './SplatEditorState';
import { SplatGenerator } from './SplatGenerator';
import type * as THREE from "three";
export type SplatScreenPickShape = {
    kind: "point";
    x: number;
    y: number;
    radiusPixels?: number;
} | {
    kind: "rect";
    x: number;
    y: number;
    width: number;
    height: number;
} | {
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
export declare const SPLAT_SCREEN_PICK_FILTER_OFF = 0;
export declare const SPLAT_SCREEN_PICK_FILTER_ALL = 1;
export declare const SPLAT_SCREEN_PICK_FILTER_VISIBLE = 2;
export declare const SPLAT_SCREEN_PICK_FILTER_SELECTED = 3;
export declare const SPLAT_SCREEN_PICK_FILTER_EDITABLE = 4;
export declare const SPLAT_SCREEN_PICK_FILTER_PICK_ADD = 5;
export declare const SPLAT_SCREEN_PICK_FILTER_PICK_REMOVE = 6;
export declare function editorSelectionOperationToPickFilterMode(operation: SplatEditorSelectionOperation): SplatEditorStateFilterMode;
export declare function splatEditorStateFilterModeToPickUniform(mode?: SplatEditorStateFilterMode): number;
export declare function normalizeSplatScreenPickShape(shape: SplatScreenPickShape, targetWidth: number, targetHeight: number): SplatScreenPickRect;
export declare function resolveSplatScreenPickRenderLayout(rect: SplatScreenPickRect, viewportWidth: number, viewportHeight: number, renderMode?: SplatScreenPickRenderMode): SplatScreenPickRenderLayout;
export declare function collectSplatScreenPickHitsFromRgba8(pixels: ArrayLike<number>, rect: SplatScreenPickRect, options?: {
    maxCandidates?: number;
    sort?: boolean;
    stats?: SplatScreenPickCollectStats;
}): SplatScreenPickPixelHit[];
export declare function createSplatScreenPickCenterCollectStats(): SplatScreenPickCenterCollectStats;
export declare function projectSplatScreenPickCenter(objectToClipElements: ArrayLike<number>, centerX: number, centerY: number, centerZ: number, viewportWidth: number, viewportHeight: number, target: SplatScreenPickProjectedCenter): boolean;
export declare function testSplatScreenPickCenter(rect: SplatScreenPickRect, x: number, y: number, stats?: SplatScreenPickCenterCollectStats): boolean;
