import { ExtSplats } from './ExtSplats';
import { PackedSplats } from './PackedSplats';
import { RgbaArray, TRgbaArray } from './RgbaArray';
import { SplatEdit, SplatEdits } from './SplatEdit';
import { SplatEditorSelectionOperation, SplatEditorState, SplatEditorStateBits, SplatEditorStateCandidateCommitGuard, SplatEditorStateCandidateProducer, SplatEditorStateCandidateSetMutationResult, SplatEditorStateChange, SplatEditorStateChangeSet, SplatEditorStateChangeSide, SplatEditorStateCounts, SplatEditorStateFilterMode, SplatEditorStateIndexMode, SplatEditorStateMutationOptions, SplatEditorStateMutationResult, SplatEditorStateOperation, SplatEditorStateSummary, SplatEditorStateUploadResult } from './SplatEditorState';
import { CovSplatModifier, CovSplatTransformer, FrameUpdateContext, GsplatModifier, SplatGenerator, SplatTransformer } from './SplatGenerator';
import { PagedSplats, SplatPager } from './SplatPager';
import { SplatSkinning } from './SplatSkinning';
import { SplatEncoding, SplatFileType } from './defines';
import { DynoBool, DynoFloat, DynoInt, DynoUsampler2D, DynoUsampler2DArray, DynoVal, DynoVec3, DynoVec4, Gsplat } from './dyno';
import * as THREE from "three";
export type SplatEditorStateRenderMode = "generator" | "accumulator";
export type SplatEditorSelectedTransformRenderMode = "generator" | "accumulator";
export type SplatMeshRayPickHit = {
    index: number;
    distance: number;
    point: THREE.Vector3;
    object: SplatMesh;
};
export type SplatMeshRayPickOptions = {
    editorStateMode?: SplatEditorStateFilterMode;
    maxHits?: number;
    sort?: boolean;
};
export type SplatMeshSelectedTransformOptions = {
    pivot?: THREE.Vector3;
    translate?: THREE.Vector3;
    rotate?: THREE.Quaternion;
    scale?: number;
};
export type SplatMeshSelectedTransformSnapshot = {
    pivot: THREE.Vector3;
    translate: THREE.Vector3;
    rotate: THREE.Quaternion;
    scale: number;
};
export type SplatMeshSelectedTransformBakeOptions = {
    clear?: boolean;
};
export type SplatMeshSelectedTransformBakeResult = {
    applied: boolean;
    changed: number;
    selected: number;
    cleared: boolean;
    unsupported: boolean;
};
export type SplatMeshStateIterationOptions = {
    mode?: SplatEditorStateFilterMode;
    applySelectedTransform?: boolean;
};
export type SplatMeshStateIterationCallback = (index: number, center: THREE.Vector3, scales: THREE.Vector3, quaternion: THREE.Quaternion, opacity: number, color: THREE.Color, state: SplatEditorStateBits) => void;
export type SplatMeshOptions = {
    url?: string;
    fileBytes?: Uint8Array | ArrayBuffer;
    fileType?: SplatFileType;
    fileName?: string;
    stream?: ReadableStream;
    streamLength?: number;
    packedSplats?: PackedSplats;
    splats?: SplatSource;
    maxSplats?: number;
    constructSplats?: (splats: PackedSplats) => Promise<void> | void;
    onProgress?: (event: ProgressEvent) => void;
    onLoad?: (mesh: SplatMesh) => Promise<void> | void;
    editable?: boolean;
    raycastable?: boolean;
    minRaycastOpacity?: number;
    raycastEditorStateMode?: SplatEditorStateFilterMode;
    editorStateRenderMode?: SplatEditorStateRenderMode;
    editorSelectedTransformRenderMode?: SplatEditorSelectedTransformRenderMode;
    onFrame?: ({ mesh, time, deltaTime, }: {
        mesh: SplatMesh;
        time: number;
        deltaTime: number;
    }) => void;
    objectModifier?: GsplatModifier;
    objectModifiers?: GsplatModifier[];
    worldModifier?: GsplatModifier;
    worldModifiers?: GsplatModifier[];
    covObjectModifiers?: CovSplatModifier[];
    covWorldModifiers?: CovSplatModifier[];
    splatEncoding?: SplatEncoding;
    extSplats?: boolean | ExtSplats;
    covSplats?: boolean;
    lod?: boolean | "quality";
    lodAbove?: number;
    nonLod?: boolean;
    enableLod?: boolean;
    lodScale?: number;
    behindFoveate?: number;
    coneFov0?: number;
    coneFov?: number;
    coneFoveate?: number;
    paged?: boolean | PagedSplats | SplatPager;
};
export type SplatMeshContext = {
    transform: SplatTransformer;
    viewToWorld: SplatTransformer;
    worldToView: SplatTransformer;
    viewToObject: SplatTransformer;
    covTransform: CovSplatTransformer;
    covViewToWorld: CovSplatTransformer;
    covWorldToView: CovSplatTransformer;
    covViewToObject: CovSplatTransformer;
    recolor: DynoVec4<THREE.Vector4>;
    time: DynoFloat;
    deltaTime: DynoFloat;
    numSplats: DynoInt<string>;
    splats: SplatSource;
    editorStateEnabled: DynoBool<"splatEditorStateEnabled">;
    editorStateTexture: DynoUsampler2DArray<"splatEditorStateTexture", THREE.DataArrayTexture>;
    editorSelectedColor: DynoVec4<THREE.Vector4, "splatEditorSelectedColor">;
    editorLockedColor: DynoVec4<THREE.Vector4, "splatEditorLockedColor">;
    editorSelectedTransformEnabled: DynoBool<"splatEditorSelectedTransformEnabled">;
    editorSelectedTransformPivot: DynoVec3<THREE.Vector3, "splatEditorSelectedTransformPivot">;
    editorSelectedTransformTranslate: DynoVec3<THREE.Vector3, "splatEditorSelectedTransformTranslate">;
    editorSelectedTransformRotate: DynoVec4<THREE.Quaternion, "splatEditorSelectedTransformRotate">;
    editorSelectedTransformScale: DynoFloat<"splatEditorSelectedTransformScale">;
    enableLod: DynoBool<string>;
    lodIndices: DynoUsampler2D<"lodIndices", THREE.DataTexture>;
};
export interface SplatCenterRaw {
    x: number;
    y: number;
    z: number;
}
export interface SplatColorRaw {
    r: number;
    g: number;
    b: number;
}
export type SplatColorMatchRawCallback = (index: number, r: number, g: number, b: number) => boolean | undefined;
export interface SplatMeshColorMatchOptions {
    seedIndex: number;
    threshold?: number;
    mode?: SplatEditorStateFilterMode;
    maxMatches?: number;
}
export interface SplatMeshColorMatchResult {
    indices: Uint32Array;
    seedColor: SplatColorRaw;
    threshold: number;
    tested: number;
    matched: number;
    stateRejected: number;
    earlyExit: boolean;
}
export interface SplatMeshColorMatchSummary {
    seedColor: SplatColorRaw;
    threshold: number;
    tested: number;
    matched: number;
    stateRejected: number;
    earlyExit: boolean;
}
export interface SplatMeshColorMatchSelectionOptions extends SplatMeshColorMatchOptions {
    operation?: SplatEditorSelectionOperation;
    mutationOptions?: SplatEditorStateMutationOptions;
}
export interface SplatMeshColorMatchSelectionResult {
    match: SplatMeshColorMatchResult;
    mutation: SplatEditorStateMutationResult;
}
export interface SplatMeshColorMatchStreamSelectionResult {
    match: SplatMeshColorMatchSummary;
    mutation: SplatEditorStateMutationResult;
}
export interface SplatSource {
    prepareFetchSplat(): void;
    dispose(): void;
    getNumSplats(): number;
    hasRgbDir(): boolean;
    getNumSh(): number;
    setMaxSh(maxSh: number): void;
    getEditorState?(): SplatEditorState | null;
    ensureEditorState?(numSplats?: number): SplatEditorState;
    clearEditorState?(): void;
    fetchSplat({ index, viewOrigin, }: {
        index: DynoVal<"int">;
        viewOrigin?: DynoVal<"vec3">;
    }): DynoVal<typeof Gsplat>;
    forEachSplat(callback: (index: number, center: THREE.Vector3, scales: THREE.Vector3, quaternion: THREE.Quaternion, opacity: number, color: THREE.Color) => void): void;
    forEachSplatCenter?(callback: (index: number, center: THREE.Vector3) => void): void;
    forEachSplatCenterRaw?(callback: (index: number, x: number, y: number, z: number) => void): void;
    getSplatCenterRaw?(index: number, target: SplatCenterRaw): boolean;
    getSplatColorRaw?(index: number, target: SplatColorRaw): boolean;
    getSplatColorMatchRaw?(index: number, target: SplatColorRaw): boolean;
    forEachSplatColorMatchRaw?(callback: SplatColorMatchRawCallback): void;
}
export type SplatStateBoundingBoxOptions = {
    centersOnly?: boolean;
    mode?: SplatEditorStateFilterMode;
    applySelectedTransform?: boolean;
    target?: THREE.Box3;
};
export declare class EmptySplatSource implements SplatSource {
    fetchDyno: DynoVal<{
        type: "Gsplat";
    }>;
    prepareFetchSplat(): void;
    dispose(): void;
    getNumSplats(): number;
    hasRgbDir(): boolean;
    getNumSh(): number;
    setMaxSh(maxSh: number): void;
    fetchSplat({ index }: {
        index: DynoVal<"int">;
    }): DynoVal<typeof Gsplat>;
    forEachSplat(): void;
    forEachSplatCenter(): void;
    forEachSplatCenterRaw(): void;
    getSplatCenterRaw(): boolean;
    getSplatColorRaw(): boolean;
}
export declare class SplatMesh extends SplatGenerator {
    initialized: Promise<SplatMesh>;
    isInitialized: boolean;
    packedSplats?: PackedSplats;
    extSplats?: ExtSplats;
    covSplats: boolean;
    splats?: SplatSource;
    lastSplats?: SplatSource;
    lastEditorState?: SplatEditorState | null;
    lastEditorStateVersion: number;
    lastEditorStateVisibilityVersion: number;
    paged?: PagedSplats;
    recolor: THREE.Color;
    opacity: number;
    context: SplatMeshContext;
    onFrame?: ({ mesh, time, deltaTime, }: {
        mesh: SplatMesh;
        time: number;
        deltaTime: number;
    }) => void;
    generatorDirty: boolean;
    objectModifiers?: GsplatModifier[];
    worldModifiers?: GsplatModifier[];
    covObjectModifiers?: CovSplatModifier[];
    covWorldModifiers?: CovSplatModifier[];
    enableViewToObject: boolean;
    enableViewToWorld: boolean;
    enableWorldToView: boolean;
    skinning: SplatSkinning | null;
    edits: SplatEdit[] | null;
    editable: boolean;
    raycastable: boolean;
    minRaycastOpacity: number;
    raycastEditorStateMode: SplatEditorStateFilterMode;
    editorStateRenderMode: SplatEditorStateRenderMode;
    editorSelectedTransformRenderMode: SplatEditorSelectedTransformRenderMode;
    raycastIndices?: {
        numSplats: number;
        indices: Uint32Array;
    };
    rgbaDisplaceEdits: SplatEdits | null;
    splatRgba: RgbaArray | null;
    maxSh: number;
    enableLod?: boolean;
    lodScale: number;
    behindFoveate?: number;
    coneFov0?: number;
    coneFov?: number;
    coneFoveate?: number;
    showLodPage?: number;
    showLodPageDyno: DynoInt<string>;
    constructor(options?: SplatMeshOptions);
    asyncInitialize(options: SplatMeshOptions): Promise<void>;
    static staticInitialized: Promise<void>;
    static isStaticInitialized: boolean;
    static dynoTime: DynoFloat<"value">;
    static staticInitialize(): Promise<void>;
    pushSplat(center: THREE.Vector3, scales: THREE.Vector3, quaternion: THREE.Quaternion, opacity: number, color: THREE.Color): void;
    forEachSplat(callback: (index: number, center: THREE.Vector3, scales: THREE.Vector3, quaternion: THREE.Quaternion, opacity: number, color: THREE.Color) => void): void;
    forEachSplatByState(callback: SplatMeshStateIterationCallback, { mode, applySelectedTransform, }?: SplatMeshStateIterationOptions): void;
    forEachSplatCenter(callback: (index: number, center: THREE.Vector3) => void): void;
    forEachSplatCenterRaw(callback: (index: number, x: number, y: number, z: number) => void): void;
    hasIndexedSplatCenters(): boolean;
    getSplatCenterRaw(index: number, target: SplatCenterRaw): boolean;
    hasIndexedSplatColors(): boolean;
    hasIndexedSplatColorMatches(): boolean;
    getSplatColorRaw(index: number, target: SplatColorRaw): boolean;
    getSplatColorMatchRaw(index: number, target: SplatColorRaw): boolean;
    private scanSplatColorMatches;
    findSplatColorMatches({ seedIndex, threshold, mode, maxMatches, }: SplatMeshColorMatchOptions): SplatMeshColorMatchResult | null;
    selectSplatStateColorMatches({ operation, mutationOptions, ...matchOptions }: SplatMeshColorMatchSelectionOptions): SplatMeshColorMatchSelectionResult | null;
    selectSplatStateColorMatchesStream({ operation, mutationOptions, ...matchOptions }: SplatMeshColorMatchSelectionOptions): SplatMeshColorMatchStreamSelectionResult | null;
    getEditorState(): SplatEditorState | null;
    ensureEditorState(numSplats?: number): SplatEditorState;
    clearEditorState(): void;
    getSplatState(index: number): SplatEditorStateBits;
    setSplatState(index: number, bits: SplatEditorStateBits): SplatEditorStateBits;
    setSplatStateBits(index: number, mask: SplatEditorStateBits): SplatEditorStateBits;
    clearSplatStateBits(index: number, mask: SplatEditorStateBits): SplatEditorStateBits;
    toggleSplatStateBits(index: number, mask: SplatEditorStateBits): SplatEditorStateBits;
    updateSplatState(index: number, mask: SplatEditorStateBits, operation: SplatEditorStateOperation): SplatEditorStateBits;
    setSplatStateRange(start: number, count: number, bits: SplatEditorStateBits, operation?: SplatEditorStateOperation): void;
    setSplatStateList(indices: Iterable<number>, bits: SplatEditorStateBits, operation?: SplatEditorStateOperation): void;
    replaceSplatState(states: ArrayLike<number>, numSplats?: number): void;
    clearSplatState(mask?: SplatEditorStateBits): void;
    selectSplatStateCandidates(indices: Iterable<number>, operation?: SplatEditorSelectionOperation, options?: SplatEditorStateMutationOptions): SplatEditorStateMutationResult;
    selectSplatStateCandidatesFromProducer(produce: SplatEditorStateCandidateProducer, operation?: SplatEditorSelectionOperation, options?: SplatEditorStateMutationOptions): SplatEditorStateMutationResult;
    selectSplatStateCandidateSetFromProducerGuarded(produce: SplatEditorStateCandidateProducer, options?: SplatEditorStateMutationOptions, shouldCommit?: SplatEditorStateCandidateCommitGuard): SplatEditorStateCandidateSetMutationResult;
    selectAllSplatState(options?: SplatEditorStateMutationOptions): SplatEditorStateMutationResult;
    clearSplatStateSelection(options?: SplatEditorStateMutationOptions): SplatEditorStateMutationResult;
    invertSplatStateSelection(options?: SplatEditorStateMutationOptions): SplatEditorStateMutationResult;
    hideSelectedSplatState(options?: SplatEditorStateMutationOptions): SplatEditorStateMutationResult;
    unhideAllSplatState(options?: SplatEditorStateMutationOptions): SplatEditorStateMutationResult;
    deleteSelectedSplatState(options?: SplatEditorStateMutationOptions): SplatEditorStateMutationResult;
    resetDeletedSplatState(options?: SplatEditorStateMutationOptions): SplatEditorStateMutationResult;
    cropSplatStateToSelection(options?: SplatEditorStateMutationOptions): SplatEditorStateMutationResult;
    applySplatStateChanges(changes: Iterable<SplatEditorStateChange>, side?: SplatEditorStateChangeSide): SplatEditorStateMutationResult;
    applySplatStateChangeSet(changeSet: SplatEditorStateChangeSet, side?: SplatEditorStateChangeSide): SplatEditorStateMutationResult;
    setSelectedSplatTransform({ pivot, translate, rotate, scale, }?: SplatMeshSelectedTransformOptions): boolean;
    clearSelectedSplatTransform(): boolean;
    getSelectedSplatTransform(): SplatMeshSelectedTransformSnapshot | null;
    getAccumulatorSelectedSplatTransform(): SplatMeshSelectedTransformSnapshot | null;
    bakeSelectedSplatTransform({ clear, }?: SplatMeshSelectedTransformBakeOptions): SplatMeshSelectedTransformBakeResult;
    getSplatStateCounts(): SplatEditorStateCounts;
    getSplatStateSummary(): SplatEditorStateSummary;
    listSplatStateIndices(mode: SplatEditorStateIndexMode): number[];
    uploadDirtySplatState(renderer?: THREE.WebGLRenderer): THREE.DataArrayTexture;
    uploadDirtySplatStateWithResult(renderer?: THREE.WebGLRenderer): SplatEditorStateUploadResult;
    dispose(): void;
    getBoundingBox(centers_only?: boolean): THREE.Box3;
    getSplatStateBoundingBox({ centersOnly, mode, applySelectedTransform, target, }?: SplatStateBoundingBoxOptions): THREE.Box3;
    private getEditorStateSource;
    private getEditorStateBits;
    private matchesEditorStateMode;
    private updateVersionForEditorState;
    private mutateEditorState;
    private updateEditorStateVisibilityVersion;
    private updateEditorStateStyleVersion;
    private updateVersionForSelectedSplatTransform;
    private usesAccumulatorSelectedSplatTransform;
    private usesGeneratorSelectedSplatTransform;
    private updateEditorStateContext;
    set objectModifier(modifier: GsplatModifier | undefined);
    set worldModifier(modifier: GsplatModifier | undefined);
    private constructGenerator;
    constructCovGenerator(context: SplatMeshContext): void;
    updateGenerator(): void;
    update({ renderer, time, deltaTime, viewToWorld, camera, renderSize, globalEdits, lodIndices, }: FrameUpdateContext): void;
    raycast(raycaster: THREE.Raycaster, intersects: {
        distance: number;
        point: THREE.Vector3;
        object: THREE.Object3D;
    }[]): void;
    pickSplatRay(raycaster: THREE.Raycaster, options?: SplatMeshRayPickOptions): SplatMeshRayPickHit[];
    private collectSplatRayHits;
    private static raycastSourceIndexBuffer;
    private static raycastDistanceBits;
    private static raycastDistanceFloat;
    private appendRaycastHitPairs;
    createLodSplats({ rgbaArray, quality, }?: {
        rgbaArray?: RgbaArray;
        quality?: boolean;
    }): Promise<void>;
}
export declare function maybeLookupIndex(lodIndices: DynoUsampler2D<"lodIndices", THREE.DataTexture>, index: DynoVal<"int">, numSplats: DynoVal<"int">, enableLod: DynoVal<"bool">, showLodPage: DynoVal<"int">): DynoVal<"int">;
export declare function maybeInjectSplatRgba(gsplat: DynoVal<typeof Gsplat>, rgba: DynoVal<typeof TRgbaArray>, index: DynoVal<"int">, enableLod: DynoVal<"bool">): DynoVal<typeof Gsplat>;
export declare const emptyLodIndices: THREE.DataTexture;
