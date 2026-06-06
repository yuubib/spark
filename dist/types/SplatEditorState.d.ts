import { CovSplat, DynoVal, Gsplat } from './dyno';
import * as THREE from "three";
export declare const SPLAT_EDITOR_STATE_SELECTED = 1;
export declare const SPLAT_EDITOR_STATE_LOCKED = 2;
export declare const SPLAT_EDITOR_STATE_DELETED = 4;
export declare const SPLAT_EDITOR_STATE_NONE = 0;
export type SplatEditorStateBits = number;
export type SplatEditorStateOperation = "replace" | "set" | "clear" | "toggle";
export type SplatEditorSelectionOperation = "set" | "add" | "remove";
export type SplatEditorStateFilterMode = "all" | "visible" | "selected" | "editable" | "pick-add" | "pick-remove" | "pick-set";
export interface SplatEditorStateCounts {
    readonly selected: number;
    readonly locked: number;
    readonly deleted: number;
}
export interface SplatEditorStateMutationResult {
    readonly changed: number;
    readonly counts: SplatEditorStateCounts;
    readonly version: number;
    readonly visibilityVersion: number;
}
export interface SplatEditorStateDirtyRange {
    readonly start: number;
    readonly count: number;
}
export interface SplatEditorStateDirtyUploadSpan {
    readonly layer: number;
    readonly row: number;
    readonly rowCount: number;
    readonly start: number;
    readonly count: number;
}
export type SplatEditorStateUploadMode = "none" | "full-texture" | "dirty-range";
export interface SplatEditorStateUploadResult {
    readonly texture: THREE.DataArrayTexture;
    readonly mode: SplatEditorStateUploadMode;
    readonly ranges: readonly SplatEditorStateDirtyRange[];
    readonly uploadSpans: readonly SplatEditorStateDirtyUploadSpan[];
}
export interface SplatEditorStateColors {
    readonly selected?: THREE.Vector4;
    readonly locked?: THREE.Vector4;
}
export declare class SplatEditorState {
    states: Uint8Array;
    numSplats: number;
    maxSplats: number;
    version: number;
    visibilityVersion: number;
    texture: THREE.DataArrayTexture | null;
    selectedColor: THREE.Vector4;
    lockedColor: THREE.Vector4;
    private selected;
    private locked;
    private deleted;
    private dirtyRanges;
    private dirtyAll;
    private fullTextureUploadPending;
    constructor(numSplats?: number, colors?: SplatEditorStateColors);
    dispose(): void;
    ensureCapacity(numSplats: number): Uint8Array;
    get(index: number): SplatEditorStateBits;
    set(index: number, bits: SplatEditorStateBits): SplatEditorStateBits;
    setBits(index: number, mask: SplatEditorStateBits): SplatEditorStateBits;
    clearBits(index: number, mask: SplatEditorStateBits): SplatEditorStateBits;
    toggleBits(index: number, mask: SplatEditorStateBits): SplatEditorStateBits;
    update(index: number, mask: SplatEditorStateBits, operation: SplatEditorStateOperation): SplatEditorStateBits;
    matches(index: number, mode: SplatEditorStateFilterMode): boolean;
    setRange(start: number, count: number, bits: SplatEditorStateBits, operation?: SplatEditorStateOperation): void;
    setList(indices: Iterable<number>, bits: SplatEditorStateBits, operation?: SplatEditorStateOperation): void;
    selectCandidates(indices: Iterable<number>, operation?: SplatEditorSelectionOperation): SplatEditorStateMutationResult;
    selectAll(): SplatEditorStateMutationResult;
    clearSelection(): SplatEditorStateMutationResult;
    invertSelection(): SplatEditorStateMutationResult;
    hideSelected(): SplatEditorStateMutationResult;
    unhideAll(): SplatEditorStateMutationResult;
    deleteSelected(): SplatEditorStateMutationResult;
    resetDeleted(): SplatEditorStateMutationResult;
    cropToSelection(): SplatEditorStateMutationResult;
    replace(states: ArrayLike<number>, numSplats?: number): void;
    clear(mask?: SplatEditorStateBits): void;
    reset(): void;
    getCounts(): SplatEditorStateCounts;
    setColors(colors: SplatEditorStateColors): void;
    markDirtyRange(start: number, count: number): void;
    markDirtyList(indices: Iterable<number>): void;
    getDirtyRanges(): readonly SplatEditorStateDirtyRange[];
    getDirtyUploadSpans(): readonly SplatEditorStateDirtyUploadSpan[];
    uploadDirty(): THREE.DataArrayTexture;
    uploadDirtyWithResult(renderer?: THREE.WebGLRenderer): SplatEditorStateUploadResult;
    getTexture(): THREE.DataArrayTexture;
    private clearDirty;
    private uploadDirtySpans;
    private assertIndex;
    private normalizeIndex;
    private commitMutation;
    private setUnchecked;
    private updateCounts;
    static emptyTexture: THREE.DataArrayTexture;
}
export declare function applySplatEditorStateVisibility(gsplat: DynoVal<typeof Gsplat>, stateTexture: DynoVal<"usampler2DArray">, enabled: DynoVal<"bool">): DynoVal<typeof Gsplat>;
export declare function applySplatEditorStateColor(gsplat: DynoVal<typeof Gsplat>, stateTexture: DynoVal<"usampler2DArray">, enabled: DynoVal<"bool">, selectedColor: DynoVal<"vec4">, lockedColor: DynoVal<"vec4">): DynoVal<typeof Gsplat>;
export declare function applyCovSplatEditorStateColor(covsplat: DynoVal<typeof CovSplat>, stateTexture: DynoVal<"usampler2DArray">, enabled: DynoVal<"bool">, selectedColor: DynoVal<"vec4">, lockedColor: DynoVal<"vec4">): DynoVal<typeof CovSplat>;
export declare function matchesSplatEditorStateBits(bits: SplatEditorStateBits, mode: SplatEditorStateFilterMode): boolean;
