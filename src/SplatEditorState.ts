import * as THREE from "three";

import {
  CovSplat,
  Dyno,
  type DynoVal,
  Gsplat,
  defineCovSplat,
  defineGsplat,
  unindentLines,
} from "./dyno";
import { getTextureSize } from "./utils";

export const SPLAT_EDITOR_STATE_SELECTED = 1;
export const SPLAT_EDITOR_STATE_LOCKED = 2;
export const SPLAT_EDITOR_STATE_DELETED = 4;

export const SPLAT_EDITOR_STATE_NONE = 0;

export type SplatEditorStateBits = number;
export type SplatEditorStateOperation = "replace" | "set" | "clear" | "toggle";
export type SplatEditorSelectionOperation = "set" | "add" | "remove";
export type SplatEditorStateIndexMode =
  | "selected"
  | "unselected-selectable"
  | "locked"
  | "deleted";
export type SplatEditorStateChangeSide = "previous" | "next";
export type SplatEditorStateChangeFormat = "list" | "compact" | "packed";
export type SplatEditorStateFilterMode =
  | "all"
  | "visible"
  | "selected"
  | "editable"
  | "pick-add"
  | "pick-remove"
  | "pick-set";

export interface SplatEditorStateCounts {
  readonly selected: number;
  readonly locked: number;
  readonly deleted: number;
}

export interface SplatEditorStateSummary extends SplatEditorStateCounts {
  readonly total: number;
  readonly visible: number;
  readonly selectable: number;
}

export interface SplatEditorStateMutationResult {
  readonly changed: number;
  readonly counts: SplatEditorStateCounts;
  readonly version: number;
  readonly visibilityVersion: number;
  readonly changes?: readonly SplatEditorStateChange[];
  readonly changeSet?: SplatEditorStateChangeSet;
}

export interface SplatEditorStateChange {
  readonly index: number;
  readonly previous: SplatEditorStateBits;
  readonly next: SplatEditorStateBits;
}

export type SplatEditorStateChangeSet =
  | SplatEditorStateListChangeSet
  | SplatEditorStateUniformChangeSet
  | SplatEditorStatePackedListChangeSet;

export interface SplatEditorStateListChangeSet {
  readonly kind: "list";
  readonly changes: readonly SplatEditorStateChange[];
}

export interface SplatEditorStateUniformChangeSet {
  readonly kind: "uniform";
  readonly start: number;
  readonly count: number;
  readonly previous: SplatEditorStateBits;
  readonly next: SplatEditorStateBits;
  readonly changed: number;
}

export interface SplatEditorStatePackedListChangeSet {
  readonly kind: "packed-list";
  readonly indices: ArrayLike<number>;
  readonly previous: ArrayLike<number>;
  readonly next: ArrayLike<number>;
  readonly changed: number;
}

export interface SplatEditorStateMutationOptions {
  readonly recordChanges?: boolean;
  readonly changeFormat?: SplatEditorStateChangeFormat;
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

export type SplatEditorStateUploadMode =
  | "none"
  | "full-texture"
  | "dirty-range";

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

const DEFAULT_SELECTED_COLOR = new THREE.Vector4(0.38, 0.62, 1.0, 0.42);
const DEFAULT_LOCKED_COLOR = new THREE.Vector4(0.0, 0.0, 0.0, 0.05);
const MAX_DIRTY_UPLOAD_SPANS = 512;
const SPARSE_SELECTION_SET_THRESHOLD_RATIO = 0.25;

type StateTextureImage = {
  data: Uint8Array;
  width: number;
  height: number;
  depth: number;
};

type WebGLTextureProperties = {
  __webglTexture?: WebGLTexture;
};

interface SplatEditorStatePackedChangeBuffer {
  readonly kind: "packed-list-buffer";
  readonly indices: number[];
  readonly previous: number[];
  readonly next: number[];
}

type SplatEditorStateMutationChangeBuffer =
  | SplatEditorStateChange[]
  | SplatEditorStatePackedChangeBuffer;

export class SplatEditorState {
  states: Uint8Array;
  numSplats: number;
  maxSplats: number;
  version = 0;
  visibilityVersion = 0;
  texture: THREE.DataArrayTexture | null = null;
  selectedColor: THREE.Vector4;
  lockedColor: THREE.Vector4;

  private selected = 0;
  private locked = 0;
  private deleted = 0;
  private selectedIndices = new Set<number>();
  private selectedIndicesComplete = true;
  private dirtyRanges: SplatEditorStateDirtyRange[] = [];
  private renderDirtyRanges: SplatEditorStateDirtyRange[] = [];
  private dirtyAll = false;
  private renderDirtyAll = false;
  private fullTextureUploadPending = false;

  constructor(numSplats = 0, colors: SplatEditorStateColors = {}) {
    this.numSplats = 0;
    this.maxSplats = 0;
    this.states = new Uint8Array(0);
    this.selectedColor =
      colors.selected?.clone() ?? DEFAULT_SELECTED_COLOR.clone();
    this.lockedColor = colors.locked?.clone() ?? DEFAULT_LOCKED_COLOR.clone();
    this.ensureCapacity(numSplats);
  }

  dispose() {
    if (this.texture) {
      this.texture.dispose();
      this.texture.source.data = null;
      this.texture = null;
    }
    this.states = new Uint8Array(0);
    this.numSplats = 0;
    this.maxSplats = 0;
    this.selected = 0;
    this.locked = 0;
    this.deleted = 0;
    this.selectedIndices.clear();
    this.selectedIndicesComplete = true;
    this.visibilityVersion = 0;
    this.dirtyRanges = [];
    this.renderDirtyRanges = [];
    this.dirtyAll = false;
    this.renderDirtyAll = false;
    this.fullTextureUploadPending = false;
  }

  ensureCapacity(numSplats: number): Uint8Array {
    const safeNumSplats = Math.max(0, Math.ceil(numSplats));
    this.numSplats = Math.max(this.numSplats, safeNumSplats);
    if (safeNumSplats <= this.maxSplats) {
      return this.states;
    }

    const { maxSplats } = getTextureSize(safeNumSplats);
    const next = new Uint8Array(maxSplats);
    next.set(this.states);
    this.states = next;
    this.maxSplats = maxSplats;

    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
    this.fullTextureUploadPending = true;
    this.markDirtyRange(0, maxSplats);
    this.version++;
    return this.states;
  }

  get(index: number): SplatEditorStateBits {
    this.assertIndex(index);
    return this.states[index] ?? SPLAT_EDITOR_STATE_NONE;
  }

  set(index: number, bits: SplatEditorStateBits): SplatEditorStateBits {
    this.assertIndex(index);
    this.setUnchecked(index, bits);
    return this.states[index];
  }

  setBits(index: number, mask: SplatEditorStateBits): SplatEditorStateBits {
    this.assertIndex(index);
    this.setUnchecked(index, this.states[index] | mask);
    return this.states[index];
  }

  clearBits(index: number, mask: SplatEditorStateBits): SplatEditorStateBits {
    this.assertIndex(index);
    this.setUnchecked(index, this.states[index] & ~mask);
    return this.states[index];
  }

  toggleBits(index: number, mask: SplatEditorStateBits): SplatEditorStateBits {
    this.assertIndex(index);
    this.setUnchecked(index, this.states[index] ^ mask);
    return this.states[index];
  }

  update(
    index: number,
    mask: SplatEditorStateBits,
    operation: SplatEditorStateOperation,
  ): SplatEditorStateBits {
    this.assertIndex(index);
    this.setUnchecked(
      index,
      applyStateOperation(this.states[index], mask, operation),
    );
    return this.states[index];
  }

  matches(index: number, mode: SplatEditorStateFilterMode): boolean {
    return matchesSplatEditorStateBits(this.get(index), mode);
  }

  forEachIndex(
    mode: SplatEditorStateIndexMode,
    callback: (index: number, bits: SplatEditorStateBits) => unknown,
  ): void {
    for (let index = 0; index < this.numSplats; index++) {
      const bits = this.states[index] ?? SPLAT_EDITOR_STATE_NONE;
      if (
        matchesSplatEditorStateIndexMode(bits, mode) &&
        callback(index, bits) === false
      ) {
        return;
      }
    }
  }

  forEachSelectedIndex(
    callback: (index: number, bits: SplatEditorStateBits) => unknown,
  ): void {
    if (!this.selectedIndicesComplete) {
      this.forEachIndex("selected", callback);
      return;
    }

    for (const index of this.selectedIndices) {
      const bits = this.states[index] ?? SPLAT_EDITOR_STATE_NONE;
      if (bits !== SPLAT_EDITOR_STATE_SELECTED) {
        continue;
      }
      if (callback(index, bits) === false) {
        return;
      }
    }
  }

  listIndices(mode: SplatEditorStateIndexMode): number[] {
    const indices: number[] = [];
    this.forEachIndex(mode, (index) => {
      indices.push(index);
    });
    return indices;
  }

  setRange(
    start: number,
    count: number,
    bits: SplatEditorStateBits,
    operation: SplatEditorStateOperation = "replace",
  ): void {
    const safeStart = Math.max(0, Math.floor(start));
    const safeCount = Math.max(0, Math.floor(count));
    const end = Math.min(this.maxSplats, safeStart + safeCount);
    if (safeStart >= end) {
      return;
    }

    let changed = false;
    for (let index = safeStart; index < end; index++) {
      changed =
        this.setUnchecked(
          index,
          applyStateOperation(this.states[index], bits, operation),
          false,
        ) || changed;
    }
    if (changed) {
      this.markDirtyRange(safeStart, end - safeStart);
      this.version++;
      this.refreshSelectedIndexTracking();
    }
  }

  setList(
    indices: Iterable<number>,
    bits: SplatEditorStateBits,
    operation: SplatEditorStateOperation = "replace",
  ): void {
    let min = Number.POSITIVE_INFINITY;
    let max = -1;
    let changed = false;
    const dirtyIndices: number[] = [];
    for (const rawIndex of indices) {
      const index = Math.floor(rawIndex);
      if (index < 0 || index >= this.maxSplats) {
        continue;
      }
      const didChange = this.setUnchecked(
        index,
        applyStateOperation(this.states[index], bits, operation),
        false,
      );
      changed = didChange || changed;
      if (didChange) {
        dirtyIndices.push(index);
        min = Math.min(min, index);
        max = Math.max(max, index);
      }
    }
    if (changed) {
      if (dirtyIndices.length <= 1) {
        this.markDirtyRange(min, max - min + 1);
      } else {
        this.markDirtyList(dirtyIndices);
      }
      this.version++;
      this.refreshSelectedIndexTracking();
    }
  }

  selectCandidates(
    indices: Iterable<number>,
    operation: SplatEditorSelectionOperation = "set",
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    if (operation === "set") {
      const arrayLikeLength = getArrayLikeLength(indices);
      if (
        this.selected === 0 &&
        options.recordChanges &&
        options.changeFormat === "packed" &&
        arrayLikeLength !== null
      ) {
        return this.selectCandidateSetFromEmptyPackedArrayLike(
          indices as unknown as ArrayLike<number>,
          arrayLikeLength,
        );
      }
    }

    const changes = createMutationChanges(options);
    if (operation === "set") {
      if (this.selected === 0) {
        return this.selectCandidateSetFromEmpty(indices, changes);
      }

      let sparseCandidates = new Set<number>();
      let denseCandidates: Uint8Array | null = null;
      const sparseThreshold = Math.floor(
        this.numSplats * SPARSE_SELECTION_SET_THRESHOLD_RATIO,
      );
      for (const rawIndex of indices) {
        const index = this.normalizeIndex(rawIndex);
        if (index === null) {
          continue;
        }
        if (denseCandidates) {
          denseCandidates[index] = 1;
          continue;
        }
        sparseCandidates.add(index);
        if (sparseCandidates.size > sparseThreshold) {
          denseCandidates = new Uint8Array(this.numSplats);
          for (const candidate of sparseCandidates) {
            denseCandidates[candidate] = 1;
          }
          sparseCandidates = new Set<number>();
        }
      }
      const selectedCandidateCount = this.selectedIndicesComplete
        ? this.selectedIndices.size
        : this.selected;
      if (
        !denseCandidates &&
        sparseCandidates.size + selectedCandidateCount > sparseThreshold
      ) {
        denseCandidates = new Uint8Array(this.numSplats);
        for (const candidate of sparseCandidates) {
          denseCandidates[candidate] = 1;
        }
        sparseCandidates = new Set<number>();
      }

      if (denseCandidates) {
        return this.selectCandidateSetDense(denseCandidates, changes);
      }
      if (!this.ensureSelectedIndicesCompleteForSparse()) {
        denseCandidates = new Uint8Array(this.numSplats);
        for (const candidate of sparseCandidates) {
          denseCandidates[candidate] = 1;
        }
        return this.selectCandidateSetDense(denseCandidates, changes);
      }
      return this.selectCandidateSetSparse(sparseCandidates, changes);
    }

    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (const rawIndex of indices) {
      const index = this.normalizeIndex(rawIndex);
      if (index === null) {
        continue;
      }
      const previous = this.states[index];
      const next =
        operation === "add" && previous === SPLAT_EDITOR_STATE_NONE
          ? SPLAT_EDITOR_STATE_SELECTED
          : operation === "remove" && previous === SPLAT_EDITOR_STATE_SELECTED
            ? SPLAT_EDITOR_STATE_NONE
            : previous;
      if (this.setMutationUnchecked(index, next, changes)) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  selectAll(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    if (!options.recordChanges && this.locked === 0 && this.deleted === 0) {
      const changed = this.numSplats - this.selected;
      if (changed <= 0) {
        return this.createMutationResult(0);
      }
      return this.commitUniformMutation(SPLAT_EDITOR_STATE_SELECTED, changed);
    }
    if (
      options.recordChanges &&
      options.changeFormat === "compact" &&
      this.locked === 0 &&
      this.deleted === 0 &&
      this.selected === 0 &&
      this.numSplats > 0
    ) {
      return this.commitUniformMutation(
        SPLAT_EDITOR_STATE_SELECTED,
        this.numSplats,
        0,
        this.createUniformChangeSet(
          options,
          SPLAT_EDITOR_STATE_NONE,
          SPLAT_EDITOR_STATE_SELECTED,
          this.numSplats,
        ),
      );
    }

    const changes = createMutationChanges(options);
    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (let index = 0; index < this.numSplats; index++) {
      if (
        this.setMutationUnchecked(
          index,
          this.states[index] === SPLAT_EDITOR_STATE_NONE
            ? SPLAT_EDITOR_STATE_SELECTED
            : this.states[index],
          changes,
        )
      ) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  clearSelection(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    if (!options.recordChanges && this.locked === 0 && this.deleted === 0) {
      const changed = this.selected;
      if (changed <= 0) {
        return this.createMutationResult(0);
      }
      return this.commitUniformMutation(SPLAT_EDITOR_STATE_NONE, changed);
    }
    if (
      options.recordChanges &&
      options.changeFormat === "compact" &&
      this.locked === 0 &&
      this.deleted === 0 &&
      this.selected === this.numSplats &&
      this.numSplats > 0
    ) {
      return this.commitUniformMutation(
        SPLAT_EDITOR_STATE_NONE,
        this.numSplats,
        0,
        this.createUniformChangeSet(
          options,
          SPLAT_EDITOR_STATE_SELECTED,
          SPLAT_EDITOR_STATE_NONE,
          this.numSplats,
        ),
      );
    }

    const changes = createMutationChanges(options);
    const sparseResult = this.commitSparseSelectedMutation(
      SPLAT_EDITOR_STATE_NONE,
      changes,
    );
    if (sparseResult) {
      return sparseResult;
    }

    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (let index = 0; index < this.numSplats; index++) {
      if (
        this.setMutationUnchecked(
          index,
          this.states[index] === SPLAT_EDITOR_STATE_SELECTED
            ? SPLAT_EDITOR_STATE_NONE
            : this.states[index],
          changes,
        )
      ) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  invertSelection(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    if (!options.recordChanges && this.locked === 0 && this.deleted === 0) {
      if (this.selected === 0) {
        return this.numSplats > 0
          ? this.commitUniformMutation(
              SPLAT_EDITOR_STATE_SELECTED,
              this.numSplats,
            )
          : this.createMutationResult(0);
      }
      if (this.selected === this.numSplats) {
        return this.commitUniformMutation(
          SPLAT_EDITOR_STATE_NONE,
          this.numSplats,
        );
      }
    }
    if (
      options.recordChanges &&
      options.changeFormat === "compact" &&
      this.locked === 0 &&
      this.deleted === 0 &&
      this.numSplats > 0
    ) {
      if (this.selected === 0) {
        return this.commitUniformMutation(
          SPLAT_EDITOR_STATE_SELECTED,
          this.numSplats,
          0,
          this.createUniformChangeSet(
            options,
            SPLAT_EDITOR_STATE_NONE,
            SPLAT_EDITOR_STATE_SELECTED,
            this.numSplats,
          ),
        );
      }
      if (this.selected === this.numSplats) {
        return this.commitUniformMutation(
          SPLAT_EDITOR_STATE_NONE,
          this.numSplats,
          0,
          this.createUniformChangeSet(
            options,
            SPLAT_EDITOR_STATE_SELECTED,
            SPLAT_EDITOR_STATE_NONE,
            this.numSplats,
          ),
        );
      }
    }

    const changes = createMutationChanges(options);
    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (let index = 0; index < this.numSplats; index++) {
      const previous = this.states[index];
      const next =
        previous === SPLAT_EDITOR_STATE_NONE
          ? SPLAT_EDITOR_STATE_SELECTED
          : previous === SPLAT_EDITOR_STATE_SELECTED
            ? SPLAT_EDITOR_STATE_NONE
            : previous;
      if (this.setMutationUnchecked(index, next, changes)) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  hideSelected(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    if (
      !options.recordChanges &&
      this.selected === this.numSplats &&
      this.locked === 0 &&
      this.deleted === 0
    ) {
      return this.numSplats > 0
        ? this.commitUniformMutation(
            SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
            this.numSplats,
          )
        : this.createMutationResult(0);
    }
    if (
      options.recordChanges &&
      options.changeFormat === "compact" &&
      this.selected === this.numSplats &&
      this.locked === 0 &&
      this.deleted === 0 &&
      this.numSplats > 0
    ) {
      return this.commitUniformMutation(
        SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
        this.numSplats,
        0,
        this.createUniformChangeSet(
          options,
          SPLAT_EDITOR_STATE_SELECTED,
          SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
          this.numSplats,
        ),
      );
    }

    const changes = createMutationChanges(options);
    const sparseResult = this.commitSparseSelectedMutation(
      SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
      changes,
    );
    if (sparseResult) {
      return sparseResult;
    }

    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (let index = 0; index < this.numSplats; index++) {
      if (
        this.setMutationUnchecked(
          index,
          this.states[index] === SPLAT_EDITOR_STATE_SELECTED
            ? SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED
            : this.states[index],
          changes,
        )
      ) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  unhideAll(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    const changes = createMutationChanges(options);
    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (let index = 0; index < this.numSplats; index++) {
      const previous = this.states[index];
      const next =
        (previous & SPLAT_EDITOR_STATE_DELETED) === 0 &&
        (previous & SPLAT_EDITOR_STATE_LOCKED) !== 0
          ? previous & ~SPLAT_EDITOR_STATE_LOCKED
          : previous;
      if (this.setMutationUnchecked(index, next, changes)) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  deleteSelected(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    if (
      !options.recordChanges &&
      this.selected === this.numSplats &&
      this.locked === 0 &&
      this.deleted === 0
    ) {
      return this.numSplats > 0
        ? this.commitUniformMutation(
            SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_DELETED,
            this.numSplats,
            this.numSplats,
          )
        : this.createMutationResult(0);
    }
    if (
      options.recordChanges &&
      options.changeFormat === "compact" &&
      this.selected === this.numSplats &&
      this.locked === 0 &&
      this.deleted === 0 &&
      this.numSplats > 0
    ) {
      return this.commitUniformMutation(
        SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_DELETED,
        this.numSplats,
        this.numSplats,
        this.createUniformChangeSet(
          options,
          SPLAT_EDITOR_STATE_SELECTED,
          SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_DELETED,
          this.numSplats,
        ),
      );
    }

    const changes = createMutationChanges(options);
    const sparseResult = this.commitSparseSelectedMutation(
      SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_DELETED,
      changes,
    );
    if (sparseResult) {
      return sparseResult;
    }

    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (let index = 0; index < this.numSplats; index++) {
      if (
        this.setMutationUnchecked(
          index,
          this.states[index] === SPLAT_EDITOR_STATE_SELECTED
            ? SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_DELETED
            : this.states[index],
          changes,
        )
      ) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  resetDeleted(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    const changes = createMutationChanges(options);
    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (let index = 0; index < this.numSplats; index++) {
      const previous = this.states[index];
      const next =
        (previous & SPLAT_EDITOR_STATE_DELETED) !== 0
          ? previous & ~SPLAT_EDITOR_STATE_DELETED
          : previous;
      if (this.setMutationUnchecked(index, next, changes)) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  cropToSelection(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    const changes = createMutationChanges(options);
    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (let index = 0; index < this.numSplats; index++) {
      const previous = this.states[index];
      const next =
        previous !== SPLAT_EDITOR_STATE_SELECTED &&
        (previous & SPLAT_EDITOR_STATE_DELETED) === 0
          ? previous | SPLAT_EDITOR_STATE_DELETED
          : previous;
      if (this.setMutationUnchecked(index, next, changes)) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  applyChanges(
    changes: Iterable<SplatEditorStateChange>,
    side: SplatEditorStateChangeSide = "next",
  ): SplatEditorStateMutationResult {
    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (const change of changes) {
      const index = this.normalizeIndex(change.index);
      if (index === null) {
        continue;
      }
      const next = side === "previous" ? change.previous : change.next;
      if (this.setUnchecked(index, next, false)) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange);
  }

  applyChangeSet(
    changeSet: SplatEditorStateChangeSet,
    side: SplatEditorStateChangeSide = "next",
  ): SplatEditorStateMutationResult {
    if (changeSet.kind === "list") {
      return this.applyChanges(changeSet.changes, side);
    }
    if (changeSet.kind === "packed-list") {
      return this.applyPackedChangeSet(changeSet, side);
    }
    return this.applyUniformChangeSet(changeSet, side);
  }

  replace(states: ArrayLike<number>, numSplats = states.length): void {
    const safeNumSplats = Math.max(0, Math.floor(numSplats));
    this.ensureCapacity(safeNumSplats);
    this.numSplats = safeNumSplats;

    let changed = false;
    let visibilityChanged = false;
    let selected = 0;
    let locked = 0;
    let deleted = 0;
    this.selectedIndices.clear();
    this.selectedIndicesComplete = true;
    const selectedIndexThreshold = Math.floor(
      safeNumSplats * SPARSE_SELECTION_SET_THRESHOLD_RATIO,
    );

    for (let index = 0; index < this.maxSplats; index++) {
      const previous = this.states[index];
      const next =
        index < safeNumSplats
          ? Number(states[index] ?? SPLAT_EDITOR_STATE_NONE) & 0xff
          : SPLAT_EDITOR_STATE_NONE;

      if (previous !== next) {
        changed = true;
        if (
          (previous & SPLAT_EDITOR_STATE_DELETED) !==
          (next & SPLAT_EDITOR_STATE_DELETED)
        ) {
          visibilityChanged = true;
        }
        this.states[index] = next;
      }

      if ((next & SPLAT_EDITOR_STATE_DELETED) !== 0) {
        deleted++;
      } else if ((next & SPLAT_EDITOR_STATE_LOCKED) !== 0) {
        locked++;
      } else if ((next & SPLAT_EDITOR_STATE_SELECTED) !== 0) {
        selected++;
      }
      if (next === SPLAT_EDITOR_STATE_SELECTED) {
        if (
          this.selectedIndicesComplete &&
          this.selectedIndices.size < selectedIndexThreshold
        ) {
          this.selectedIndices.add(index);
        } else {
          this.selectedIndices.clear();
          this.selectedIndicesComplete = false;
        }
      }
    }

    this.selected = selected;
    this.locked = locked;
    this.deleted = deleted;

    if (changed) {
      this.markDirtyRange(0, this.maxSplats);
      this.version++;
      if (visibilityChanged) {
        this.visibilityVersion++;
      }
    }
  }

  clear(mask?: SplatEditorStateBits): void {
    if (mask === undefined) {
      const hadDeleted = this.deleted > 0;
      this.states.fill(0);
      this.selected = 0;
      this.locked = 0;
      this.deleted = 0;
      this.selectedIndices.clear();
      this.selectedIndicesComplete = true;
      this.markDirtyRange(0, this.maxSplats);
      this.version++;
      if (hadDeleted) {
        this.visibilityVersion++;
      }
      return;
    }

    this.setRange(0, this.maxSplats, mask, "clear");
  }

  reset(): void {
    this.clear();
  }

  getCounts(): SplatEditorStateCounts {
    return {
      selected: this.selected,
      locked: this.locked,
      deleted: this.deleted,
    };
  }

  getSummary(): SplatEditorStateSummary {
    return {
      total: this.numSplats,
      visible: Math.max(0, this.numSplats - this.deleted),
      selectable: Math.max(0, this.numSplats - this.locked - this.deleted),
      selected: this.selected,
      locked: this.locked,
      deleted: this.deleted,
    };
  }

  setColors(colors: SplatEditorStateColors): void {
    let changed = false;
    if (colors.selected && !colors.selected.equals(this.selectedColor)) {
      this.selectedColor.copy(colors.selected);
      changed = true;
    }
    if (colors.locked && !colors.locked.equals(this.lockedColor)) {
      this.lockedColor.copy(colors.locked);
      changed = true;
    }
    if (changed) {
      this.version++;
    }
  }

  markDirtyRange(start: number, count: number): void {
    if (count <= 0 || this.maxSplats <= 0) {
      return;
    }
    const safeStart = Math.max(0, Math.floor(start));
    const safeEnd = Math.min(this.maxSplats, safeStart + Math.floor(count));
    if (safeStart >= safeEnd) {
      return;
    }
    if (!this.dirtyAll) {
      this.dirtyRanges.push({ start: safeStart, count: safeEnd - safeStart });
    }
    if (!this.renderDirtyAll) {
      this.renderDirtyRanges.push({
        start: safeStart,
        count: safeEnd - safeStart,
      });
    }
    this.dirtyAll ||= safeEnd - safeStart >= this.maxSplats;
    this.renderDirtyAll ||= safeEnd - safeStart >= this.maxSplats;
  }

  markDirtyList(indices: Iterable<number>): void {
    const sortedIndices: number[] = [];
    for (const rawIndex of indices) {
      const index = Math.floor(rawIndex);
      if (index < 0 || index >= this.maxSplats) {
        continue;
      }
      sortedIndices.push(index);
    }
    if (sortedIndices.length === 0) {
      return;
    }

    sortedIndices.sort((a, b) => a - b);
    let start = sortedIndices[0];
    let previous = start;
    for (let i = 1; i < sortedIndices.length; i++) {
      const index = sortedIndices[i];
      if (index <= previous) {
        continue;
      }
      if (index === previous + 1) {
        previous = index;
        continue;
      }
      this.markDirtyRange(start, previous - start + 1);
      start = index;
      previous = index;
    }
    this.markDirtyRange(start, previous - start + 1);
  }

  getDirtyRanges(): readonly SplatEditorStateDirtyRange[] {
    if (this.dirtyAll) {
      return [{ start: 0, count: this.maxSplats }];
    }
    return this.dirtyRanges.slice();
  }

  getRenderDirtyRanges(): readonly SplatEditorStateDirtyRange[] {
    if (this.renderDirtyAll) {
      return [{ start: 0, count: this.maxSplats }];
    }
    return this.renderDirtyRanges.slice();
  }

  clearRenderDirtyRanges(): void {
    this.renderDirtyAll = false;
    this.renderDirtyRanges = [];
  }

  getDirtyUploadSpans(): readonly SplatEditorStateDirtyUploadSpan[] {
    if (this.maxSplats <= 0) {
      return [];
    }
    const { width, height } = getTextureSize(this.maxSplats);
    return createDirtyUploadSpans(
      this.getDirtyRanges(),
      width,
      height,
      this.maxSplats,
    );
  }

  uploadDirty(): THREE.DataArrayTexture {
    return this.uploadDirtyWithResult().texture;
  }

  uploadDirtyWithResult(
    renderer?: THREE.WebGLRenderer,
  ): SplatEditorStateUploadResult {
    const texture = this.getTexture();
    const ranges = this.getDirtyRanges();
    const hasDirty =
      this.fullTextureUploadPending ||
      this.dirtyAll ||
      this.dirtyRanges.length > 0;
    if (!hasDirty) {
      return {
        texture,
        mode: "none",
        ranges: [],
        uploadSpans: [],
      };
    }

    const uploadSpans =
      this.dirtyAll || this.fullTextureUploadPending
        ? []
        : this.getDirtyUploadSpans();
    if (
      !this.dirtyAll &&
      !this.fullTextureUploadPending &&
      renderer &&
      uploadSpans.length > 0 &&
      uploadSpans.length <= MAX_DIRTY_UPLOAD_SPANS &&
      this.uploadDirtySpans(renderer, texture, uploadSpans)
    ) {
      this.clearDirty();
      return {
        texture,
        mode: "dirty-range",
        ranges,
        uploadSpans,
      };
    }

    if (texture !== SplatEditorState.emptyTexture) {
      texture.needsUpdate = true;
    }
    this.clearDirty();
    this.fullTextureUploadPending = false;
    return {
      texture,
      mode: "full-texture",
      ranges,
      uploadSpans,
    };
  }

  getTexture(): THREE.DataArrayTexture {
    if (this.maxSplats <= 0) {
      return SplatEditorState.emptyTexture;
    }
    if (!this.texture) {
      const { width, height, depth } = getTextureSize(this.maxSplats);
      this.texture = createStateTexture(this.states, width, height, depth);
      this.texture.needsUpdate = true;
      this.fullTextureUploadPending = true;
    } else if (this.texture.image.data !== this.states) {
      this.texture.image.data = this.states;
      this.texture.needsUpdate = true;
      this.fullTextureUploadPending = true;
    }
    return this.texture;
  }

  deferDirtyTextureUpload(): void {
    if (
      this.maxSplats <= 0 ||
      (!this.fullTextureUploadPending &&
        !this.dirtyAll &&
        this.dirtyRanges.length === 0)
    ) {
      return;
    }
    this.fullTextureUploadPending = true;
    this.dirtyAll = true;
    this.dirtyRanges = [];
  }

  private clearDirty(): void {
    this.dirtyAll = false;
    this.dirtyRanges = [];
  }

  private uploadDirtySpans(
    renderer: THREE.WebGLRenderer,
    texture: THREE.DataArrayTexture,
    uploadSpans: readonly SplatEditorStateDirtyUploadSpan[],
  ): boolean {
    if (
      texture === SplatEditorState.emptyTexture ||
      !renderer.properties.has(texture)
    ) {
      return false;
    }

    const gl = renderer.getContext();
    if (!("texSubImage3D" in gl)) {
      return false;
    }

    const textureProperties = renderer.properties.get(
      texture,
    ) as WebGLTextureProperties;
    const glTexture = textureProperties.__webglTexture;
    if (!glTexture) {
      return false;
    }

    const image = texture.image as StateTextureImage;
    if (image.data !== this.states) {
      return false;
    }

    const gl2 = gl as WebGL2RenderingContext;
    const previousAlignment = gl2.getParameter(gl2.UNPACK_ALIGNMENT) as number;
    const previousFlipY = gl2.getParameter(gl2.UNPACK_FLIP_Y_WEBGL) as boolean;
    const previousRowLength = gl2.getParameter(gl2.UNPACK_ROW_LENGTH) as number;
    const previousImageHeight = gl2.getParameter(
      gl2.UNPACK_IMAGE_HEIGHT,
    ) as number;
    const previousSkipPixels = gl2.getParameter(
      gl2.UNPACK_SKIP_PIXELS,
    ) as number;
    const previousSkipRows = gl2.getParameter(gl2.UNPACK_SKIP_ROWS) as number;
    const previousSkipImages = gl2.getParameter(
      gl2.UNPACK_SKIP_IMAGES,
    ) as number;

    renderer.state.activeTexture(gl2.TEXTURE0);
    renderer.state.bindTexture(gl2.TEXTURE_2D_ARRAY, glTexture);
    gl2.bindBuffer(gl2.PIXEL_UNPACK_BUFFER, null);
    gl2.pixelStorei(gl2.UNPACK_FLIP_Y_WEBGL, false);
    gl2.pixelStorei(gl2.UNPACK_ALIGNMENT, 1);
    gl2.pixelStorei(gl2.UNPACK_ROW_LENGTH, 0);
    gl2.pixelStorei(gl2.UNPACK_IMAGE_HEIGHT, 0);
    gl2.pixelStorei(gl2.UNPACK_SKIP_PIXELS, 0);
    gl2.pixelStorei(gl2.UNPACK_SKIP_ROWS, 0);
    gl2.pixelStorei(gl2.UNPACK_SKIP_IMAGES, 0);

    try {
      for (const span of uploadSpans) {
        const data = this.states.subarray(span.start, span.start + span.count);
        gl2.texSubImage3D(
          gl2.TEXTURE_2D_ARRAY,
          0,
          0,
          span.row,
          span.layer,
          image.width,
          span.rowCount,
          1,
          gl2.RED_INTEGER,
          gl2.UNSIGNED_BYTE,
          data,
        );
      }
    } finally {
      gl2.pixelStorei(gl2.UNPACK_ALIGNMENT, previousAlignment);
      gl2.pixelStorei(gl2.UNPACK_FLIP_Y_WEBGL, previousFlipY);
      gl2.pixelStorei(gl2.UNPACK_ROW_LENGTH, previousRowLength);
      gl2.pixelStorei(gl2.UNPACK_IMAGE_HEIGHT, previousImageHeight);
      gl2.pixelStorei(gl2.UNPACK_SKIP_PIXELS, previousSkipPixels);
      gl2.pixelStorei(gl2.UNPACK_SKIP_ROWS, previousSkipRows);
      gl2.pixelStorei(gl2.UNPACK_SKIP_IMAGES, previousSkipImages);
      renderer.state.bindTexture(gl2.TEXTURE_2D_ARRAY, null);
    }

    return true;
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.maxSplats) {
      throw new Error(`Invalid splat editor state index: ${index}`);
    }
  }

  private normalizeIndex(rawIndex: number): number | null {
    const index = Math.floor(rawIndex);
    return Number.isFinite(index) && index >= 0 && index < this.numSplats
      ? index
      : null;
  }

  private createUniformChangeSet(
    options: SplatEditorStateMutationOptions,
    previous: SplatEditorStateBits,
    next: SplatEditorStateBits,
    changed: number,
  ): SplatEditorStateUniformChangeSet | undefined {
    return options.recordChanges && options.changeFormat === "compact"
      ? {
          kind: "uniform",
          start: 0,
          count: this.numSplats,
          previous,
          next,
          changed,
        }
      : undefined;
  }

  private commitUniformMutation(
    bits: SplatEditorStateBits,
    changed: number,
    visibilityDelta = 0,
    changeSet?: SplatEditorStateChangeSet,
  ): SplatEditorStateMutationResult {
    const next = bits & 0xff;
    this.states.fill(next, 0, this.numSplats);
    this.selected =
      (next & (SPLAT_EDITOR_STATE_DELETED | SPLAT_EDITOR_STATE_LOCKED)) === 0 &&
      (next & SPLAT_EDITOR_STATE_SELECTED) !== 0
        ? this.numSplats
        : 0;
    this.locked =
      (next & SPLAT_EDITOR_STATE_DELETED) === 0 &&
      (next & SPLAT_EDITOR_STATE_LOCKED) !== 0
        ? this.numSplats
        : 0;
    this.deleted =
      (next & SPLAT_EDITOR_STATE_DELETED) !== 0 ? this.numSplats : 0;
    this.resetSelectedIndexTrackingForUniform(next);
    this.visibilityVersion += visibilityDelta;
    return this.commitMutation(changed, [], false, undefined, changeSet);
  }

  private applyUniformChangeSet(
    changeSet: SplatEditorStateUniformChangeSet,
    side: SplatEditorStateChangeSide,
  ): SplatEditorStateMutationResult {
    const safeStart = Math.max(0, Math.floor(changeSet.start));
    const safeCount = Math.max(0, Math.floor(changeSet.count));
    const safeEnd = Math.min(this.numSplats, safeStart + safeCount);
    if (safeStart >= safeEnd) {
      return this.createMutationResult(0);
    }

    const target = side === "previous" ? changeSet.previous : changeSet.next;
    const source = side === "previous" ? changeSet.next : changeSet.previous;
    const visibilityDelta =
      (source & SPLAT_EDITOR_STATE_DELETED) !==
      (target & SPLAT_EDITOR_STATE_DELETED)
        ? changeSet.changed
        : 0;

    if (safeStart === 0 && safeEnd === this.numSplats) {
      if (this.matchesUniformState(target)) {
        return this.createMutationResult(0);
      }
      return this.commitUniformMutation(
        target,
        changeSet.changed,
        visibilityDelta,
      );
    }

    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (let index = safeStart; index < safeEnd; index++) {
      if (this.setUnchecked(index, target, false)) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange);
  }

  private applyPackedChangeSet(
    changeSet: SplatEditorStatePackedListChangeSet,
    side: SplatEditorStateChangeSide,
  ): SplatEditorStateMutationResult {
    const length = Math.min(
      Math.max(0, Math.floor(changeSet.changed)),
      changeSet.indices.length,
      changeSet.previous.length,
      changeSet.next.length,
    );
    if (length <= 0) {
      return this.createMutationResult(0);
    }

    const values = side === "previous" ? changeSet.previous : changeSet.next;
    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (let offset = 0; offset < length; offset++) {
      const index = this.normalizeIndex(changeSet.indices[offset]);
      if (index === null) {
        continue;
      }
      const next = Number(values[offset] ?? SPLAT_EDITOR_STATE_NONE) & 0xff;
      if (this.setUnchecked(index, next, false)) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange);
  }

  private matchesUniformState(bits: SplatEditorStateBits): boolean {
    const state = bits & 0xff;
    if ((state & SPLAT_EDITOR_STATE_DELETED) !== 0) {
      return this.deleted === this.numSplats;
    }
    if ((state & SPLAT_EDITOR_STATE_LOCKED) !== 0) {
      return this.locked === this.numSplats && this.deleted === 0;
    }
    if ((state & SPLAT_EDITOR_STATE_SELECTED) !== 0) {
      return (
        this.selected === this.numSplats &&
        this.locked === 0 &&
        this.deleted === 0
      );
    }
    return this.selected === 0 && this.locked === 0 && this.deleted === 0;
  }

  private createMutationResult(
    changed: number,
    changes?: readonly SplatEditorStateChange[],
    changeSet?: SplatEditorStateChangeSet,
  ): SplatEditorStateMutationResult {
    return {
      changed,
      counts: this.getCounts(),
      version: this.version,
      visibilityVersion: this.visibilityVersion,
      ...(changes ? { changes } : {}),
      ...(changeSet ? { changeSet } : {}),
    };
  }

  private commitMutation(
    changed: number,
    dirtyIndices: readonly number[] = [],
    fullRange = false,
    changes?: SplatEditorStateMutationChangeBuffer,
    changeSet?: SplatEditorStateChangeSet,
  ): SplatEditorStateMutationResult {
    if (changed > 0) {
      if (
        fullRange ||
        dirtyIndices.length === 0 ||
        dirtyIndices.length > this.numSplats / 4
      ) {
        this.markDirtyRange(0, this.numSplats);
      } else if (dirtyIndices.length === 1) {
        this.markDirtyRange(dirtyIndices[0], 1);
      } else {
        this.markDirtyList(dirtyIndices);
      }
      this.version++;
      this.refreshSelectedIndexTracking();
    }
    return this.createMutationResult(
      changed,
      getListMutationChanges(changes),
      changeSet ?? createMutationChangeSet(changes),
    );
  }

  private collectDirtyIndex(dirtyIndices: number[], index: number): boolean {
    if (dirtyIndices.length > this.numSplats / 4) {
      return true;
    }
    dirtyIndices.push(index);
    if (dirtyIndices.length > this.numSplats / 4) {
      dirtyIndices.length = 0;
      return true;
    }
    return false;
  }

  private getSparseSelectionSetThreshold(): number {
    return Math.floor(this.numSplats * SPARSE_SELECTION_SET_THRESHOLD_RATIO);
  }

  private shouldTrackSelectedIndices(count = this.selected): boolean {
    return count <= this.getSparseSelectionSetThreshold();
  }

  private ensureSelectedIndicesCompleteForSparse(): boolean {
    if (this.selectedIndicesComplete) {
      return true;
    }
    if (!this.shouldTrackSelectedIndices()) {
      return false;
    }
    this.rebuildSelectedIndices();
    return this.selectedIndicesComplete;
  }

  private rebuildSelectedIndices(): void {
    this.selectedIndices.clear();
    const threshold = this.getSparseSelectionSetThreshold();
    for (let index = 0; index < this.numSplats; index++) {
      if (this.states[index] !== SPLAT_EDITOR_STATE_SELECTED) {
        continue;
      }
      if (this.selectedIndices.size >= threshold) {
        this.selectedIndices.clear();
        this.selectedIndicesComplete = false;
        return;
      }
      this.selectedIndices.add(index);
    }
    this.selectedIndicesComplete = true;
  }

  private refreshSelectedIndexTracking(): void {
    if (this.selected === 0) {
      this.selectedIndices.clear();
      this.selectedIndicesComplete = true;
      return;
    }
    if (!this.shouldTrackSelectedIndices()) {
      this.selectedIndices.clear();
      this.selectedIndicesComplete = false;
      return;
    }
    if (
      !this.selectedIndicesComplete ||
      this.selectedIndices.size !== this.selected
    ) {
      this.rebuildSelectedIndices();
    }
  }

  private resetSelectedIndexTrackingForUniform(
    bits: SplatEditorStateBits,
  ): void {
    this.selectedIndices.clear();
    if (bits !== SPLAT_EDITOR_STATE_SELECTED) {
      this.selectedIndicesComplete = true;
      return;
    }
    if (!this.shouldTrackSelectedIndices(this.numSplats)) {
      this.selectedIndicesComplete = false;
      return;
    }
    for (let index = 0; index < this.numSplats; index++) {
      this.selectedIndices.add(index);
    }
    this.selectedIndicesComplete = true;
  }

  private setUnchecked(
    index: number,
    bits: SplatEditorStateBits,
    markDirty = true,
  ): boolean {
    const next = bits & 0xff;
    const previous = this.states[index];
    if (previous === next) {
      return false;
    }
    this.updateCounts(previous, -1);
    this.updateSelectedIndex(index, previous, next);
    this.states[index] = next;
    this.updateCounts(next, 1);
    if (
      (previous & SPLAT_EDITOR_STATE_DELETED) !==
      (next & SPLAT_EDITOR_STATE_DELETED)
    ) {
      this.visibilityVersion++;
    }
    if (markDirty) {
      this.markDirtyRange(index, 1);
      this.version++;
    }
    return true;
  }

  private selectCandidateSetFromEmpty(
    indices: Iterable<number>,
    changes?: SplatEditorStateMutationChangeBuffer,
  ): SplatEditorStateMutationResult {
    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (const rawIndex of indices) {
      const index = this.normalizeIndex(rawIndex);
      if (index === null || this.states[index] !== SPLAT_EDITOR_STATE_NONE) {
        continue;
      }
      if (
        this.setMutationUnchecked(index, SPLAT_EDITOR_STATE_SELECTED, changes)
      ) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  private selectCandidateSetFromEmptyPackedArrayLike(
    indices: ArrayLike<number>,
    length: number,
  ): SplatEditorStateMutationResult {
    const changedIndices = new Uint32Array(length);
    const previousValues = new Uint8Array(length);
    const nextValues = new Uint8Array(length);
    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;

    for (let offset = 0; offset < length; offset++) {
      const index = this.normalizeIndex(indices[offset]);
      if (index === null || this.states[index] !== SPLAT_EDITOR_STATE_NONE) {
        continue;
      }
      if (!this.setUnchecked(index, SPLAT_EDITOR_STATE_SELECTED, false)) {
        continue;
      }
      changedIndices[changed] = index;
      nextValues[changed] = SPLAT_EDITOR_STATE_SELECTED;
      changed++;
      fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
    }

    const changeSet: SplatEditorStatePackedListChangeSet = {
      kind: "packed-list",
      indices: changedIndices.subarray(0, changed),
      previous: previousValues.subarray(0, changed),
      next: nextValues.subarray(0, changed),
      changed,
    };
    return this.commitMutation(
      changed,
      dirtyIndices,
      fullRange,
      undefined,
      changeSet,
    );
  }

  private selectCandidateSetDense(
    candidates: Uint8Array,
    changes?: SplatEditorStateMutationChangeBuffer,
  ): SplatEditorStateMutationResult {
    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (let index = 0; index < this.numSplats; index++) {
      const previous = this.states[index];
      const next =
        candidates[index] && previous === SPLAT_EDITOR_STATE_NONE
          ? SPLAT_EDITOR_STATE_SELECTED
          : !candidates[index] && previous === SPLAT_EDITOR_STATE_SELECTED
            ? SPLAT_EDITOR_STATE_NONE
            : previous;
      if (this.setMutationUnchecked(index, next, changes)) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  private selectCandidateSetSparse(
    candidates: ReadonlySet<number>,
    changes?: SplatEditorStateMutationChangeBuffer,
  ): SplatEditorStateMutationResult {
    const mutations: { index: number; next: SplatEditorStateBits }[] = [];
    for (const index of this.selectedIndices) {
      if (!candidates.has(index)) {
        mutations.push({ index, next: SPLAT_EDITOR_STATE_NONE });
      }
    }
    for (const index of candidates) {
      if (this.states[index] === SPLAT_EDITOR_STATE_NONE) {
        mutations.push({ index, next: SPLAT_EDITOR_STATE_SELECTED });
      }
    }
    mutations.sort((a, b) => a.index - b.index);

    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (const { index, next } of mutations) {
      if (this.setMutationUnchecked(index, next, changes)) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  private commitSparseSelectedMutation(
    next: SplatEditorStateBits,
    changes?: SplatEditorStateMutationChangeBuffer,
  ): SplatEditorStateMutationResult | null {
    if (this.selected <= 0) {
      return this.commitMutation(0, [], false, changes);
    }
    if (!this.ensureSelectedIndicesCompleteForSparse()) {
      return null;
    }

    const indices = [...this.selectedIndices].sort((a, b) => a - b);
    const dirtyIndices: number[] = [];
    let fullRange = false;
    let changed = 0;
    for (const index of indices) {
      if (this.setMutationUnchecked(index, next, changes)) {
        changed++;
        fullRange ||= this.collectDirtyIndex(dirtyIndices, index);
      }
    }
    return this.commitMutation(changed, dirtyIndices, fullRange, changes);
  }

  private setMutationUnchecked(
    index: number,
    bits: SplatEditorStateBits,
    changes?: SplatEditorStateMutationChangeBuffer,
  ): boolean {
    const previous = this.states[index];
    const next = bits & 0xff;
    if (!this.setUnchecked(index, next, false)) {
      return false;
    }
    recordMutationChange(changes, index, previous, next);
    return true;
  }

  private updateCounts(bits: number, delta: number): void {
    if ((bits & SPLAT_EDITOR_STATE_DELETED) !== 0) {
      this.deleted += delta;
    } else if ((bits & SPLAT_EDITOR_STATE_LOCKED) !== 0) {
      this.locked += delta;
    } else if ((bits & SPLAT_EDITOR_STATE_SELECTED) !== 0) {
      this.selected += delta;
    }
  }

  private updateSelectedIndex(
    index: number,
    previous: SplatEditorStateBits,
    next: SplatEditorStateBits,
  ): void {
    if (previous === next || !this.selectedIndicesComplete) {
      return;
    }
    if (previous === SPLAT_EDITOR_STATE_SELECTED) {
      this.selectedIndices.delete(index);
    }
    if (next === SPLAT_EDITOR_STATE_SELECTED) {
      this.selectedIndices.add(index);
      if (!this.shouldTrackSelectedIndices(this.selectedIndices.size)) {
        this.selectedIndices.clear();
        this.selectedIndicesComplete = false;
      }
    }
  }

  static emptyTexture = createStateTexture(new Uint8Array(1), 1, 1, 1);
}

export function applySplatEditorStateVisibility(
  gsplat: DynoVal<typeof Gsplat>,
  stateTexture: DynoVal<"usampler2DArray">,
  enabled: DynoVal<"bool">,
): DynoVal<typeof Gsplat> {
  return new ApplySplatEditorStateVisibility({ gsplat, stateTexture, enabled })
    .outputs.gsplat;
}

export function applySplatEditorStateColor(
  gsplat: DynoVal<typeof Gsplat>,
  stateTexture: DynoVal<"usampler2DArray">,
  enabled: DynoVal<"bool">,
  selectedColor: DynoVal<"vec4">,
  lockedColor: DynoVal<"vec4">,
): DynoVal<typeof Gsplat> {
  return new ApplySplatEditorStateColor({
    gsplat,
    stateTexture,
    enabled,
    selectedColor,
    lockedColor,
  }).outputs.gsplat;
}

export function applySplatEditorStateTransform(
  gsplat: DynoVal<typeof Gsplat>,
  stateTexture: DynoVal<"usampler2DArray">,
  stateEnabled: DynoVal<"bool">,
  transformEnabled: DynoVal<"bool">,
  pivot: DynoVal<"vec3">,
  translate: DynoVal<"vec3">,
  rotate: DynoVal<"vec4">,
  scale: DynoVal<"float">,
): DynoVal<typeof Gsplat> {
  return new ApplySplatEditorStateTransform({
    gsplat,
    stateTexture,
    stateEnabled,
    transformEnabled,
    pivot,
    translate,
    rotate,
    scale,
  }).outputs.gsplat;
}

export function applyCovSplatEditorStateColor(
  covsplat: DynoVal<typeof CovSplat>,
  stateTexture: DynoVal<"usampler2DArray">,
  enabled: DynoVal<"bool">,
  selectedColor: DynoVal<"vec4">,
  lockedColor: DynoVal<"vec4">,
): DynoVal<typeof CovSplat> {
  return new ApplyCovSplatEditorStateColor({
    covsplat,
    stateTexture,
    enabled,
    selectedColor,
    lockedColor,
  }).outputs.covsplat;
}

function createDirtyUploadSpans(
  ranges: readonly SplatEditorStateDirtyRange[],
  width: number,
  height: number,
  maxSplats: number,
): SplatEditorStateDirtyUploadSpan[] {
  if (width <= 0 || height <= 0 || maxSplats <= 0) {
    return [];
  }

  const splatsPerLayer = width * height;
  const spans: SplatEditorStateDirtyUploadSpan[] = [];
  for (const range of ranges) {
    let start = Math.max(0, Math.floor(range.start));
    const end = Math.min(
      maxSplats,
      start + Math.max(0, Math.floor(range.count)),
    );
    while (start < end) {
      const layer = Math.floor(start / splatsPerLayer);
      const layerStart = layer * splatsPerLayer;
      const layerEnd = Math.min(end, layerStart + splatsPerLayer);
      const firstRow = Math.floor((start - layerStart) / width);
      const lastRow = Math.floor((layerEnd - 1 - layerStart) / width);
      const rowCount = lastRow - firstRow + 1;
      spans.push({
        layer,
        row: firstRow,
        rowCount,
        start: layerStart + firstRow * width,
        count: rowCount * width,
      });
      start = layerStart + (lastRow + 1) * width;
    }
  }

  spans.sort((a, b) => a.layer - b.layer || a.row - b.row);

  const merged: SplatEditorStateDirtyUploadSpan[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.layer === span.layer &&
      previous.row + previous.rowCount >= span.row
    ) {
      const previousEndRow = previous.row + previous.rowCount;
      const nextEndRow = Math.max(previousEndRow, span.row + span.rowCount);
      merged[merged.length - 1] = {
        layer: previous.layer,
        row: previous.row,
        rowCount: nextEndRow - previous.row,
        start: previous.start,
        count: (nextEndRow - previous.row) * width,
      };
      continue;
    }
    merged.push(span);
  }
  return merged;
}

function applyStateOperation(
  previous: SplatEditorStateBits,
  bits: SplatEditorStateBits,
  operation: SplatEditorStateOperation,
): SplatEditorStateBits {
  switch (operation) {
    case "replace":
      return bits;
    case "set":
      return previous | bits;
    case "clear":
      return previous & ~bits;
    case "toggle":
      return previous ^ bits;
    default:
      throw new Error(`Unsupported splat editor state operation: ${operation}`);
  }
}

function createMutationChanges(
  options: SplatEditorStateMutationOptions,
): SplatEditorStateMutationChangeBuffer | undefined {
  if (!options.recordChanges) {
    return undefined;
  }
  return options.changeFormat === "packed"
    ? {
        kind: "packed-list-buffer",
        indices: [],
        previous: [],
        next: [],
      }
    : [];
}

function getArrayLikeLength(value: Iterable<number>): number | null {
  const length = (value as unknown as { length?: unknown }).length;
  if (typeof length !== "number" || !Number.isFinite(length)) {
    return null;
  }
  return Math.max(0, Math.floor(length));
}

function recordMutationChange(
  changes: SplatEditorStateMutationChangeBuffer | undefined,
  index: number,
  previous: SplatEditorStateBits,
  next: SplatEditorStateBits,
): void {
  if (!changes) {
    return;
  }
  if (Array.isArray(changes)) {
    changes.push({ index, previous, next });
    return;
  }
  changes.indices.push(index);
  changes.previous.push(previous & 0xff);
  changes.next.push(next & 0xff);
}

function getListMutationChanges(
  changes: SplatEditorStateMutationChangeBuffer | undefined,
): readonly SplatEditorStateChange[] | undefined {
  return Array.isArray(changes) ? changes : undefined;
}

function createMutationChangeSet(
  changes: SplatEditorStateMutationChangeBuffer | undefined,
): SplatEditorStateChangeSet | undefined {
  if (!changes) {
    return undefined;
  }
  if (Array.isArray(changes)) {
    return { kind: "list", changes };
  }
  return {
    kind: "packed-list",
    indices: Uint32Array.from(changes.indices),
    previous: Uint8Array.from(changes.previous),
    next: Uint8Array.from(changes.next),
    changed: changes.indices.length,
  };
}

export function matchesSplatEditorStateBits(
  bits: SplatEditorStateBits,
  mode: SplatEditorStateFilterMode,
): boolean {
  const state = bits & 0xff;
  switch (mode) {
    case "all":
      return true;
    case "visible":
      return (state & SPLAT_EDITOR_STATE_DELETED) === 0;
    case "selected":
      return state === SPLAT_EDITOR_STATE_SELECTED;
    case "editable":
    case "pick-set":
      return (
        (state & (SPLAT_EDITOR_STATE_LOCKED | SPLAT_EDITOR_STATE_DELETED)) === 0
      );
    case "pick-add":
      return state === SPLAT_EDITOR_STATE_NONE;
    case "pick-remove":
      return state === SPLAT_EDITOR_STATE_SELECTED;
    default:
      throw new Error(`Unsupported splat editor state filter mode: ${mode}`);
  }
}

export function matchesSplatEditorStateIndexMode(
  bits: SplatEditorStateBits,
  mode: SplatEditorStateIndexMode,
): boolean {
  const state = bits & 0xff;
  switch (mode) {
    case "selected":
      return state === SPLAT_EDITOR_STATE_SELECTED;
    case "unselected-selectable":
      return state === SPLAT_EDITOR_STATE_NONE;
    case "locked":
      return (
        (state & SPLAT_EDITOR_STATE_DELETED) === 0 &&
        (state & SPLAT_EDITOR_STATE_LOCKED) !== 0
      );
    case "deleted":
      return (state & SPLAT_EDITOR_STATE_DELETED) !== 0;
    default:
      throw new Error(`Unsupported splat editor state index mode: ${mode}`);
  }
}

function createStateTexture(
  states: Uint8Array,
  width: number,
  height: number,
  depth: number,
): THREE.DataArrayTexture {
  const texture = new THREE.DataArrayTexture(states, width, height, depth);
  texture.format = THREE.RedIntegerFormat;
  texture.type = THREE.UnsignedByteType;
  texture.internalFormat = "R8UI";
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

class ApplySplatEditorStateVisibility extends Dyno<
  { gsplat: typeof Gsplat; stateTexture: "usampler2DArray"; enabled: "bool" },
  { gsplat: typeof Gsplat }
> {
  constructor({
    gsplat,
    stateTexture,
    enabled,
  }: {
    gsplat: DynoVal<typeof Gsplat>;
    stateTexture: DynoVal<"usampler2DArray">;
    enabled: DynoVal<"bool">;
  }) {
    super({
      inTypes: {
        gsplat: Gsplat,
        stateTexture: "usampler2DArray",
        enabled: "bool",
      },
      outTypes: { gsplat: Gsplat },
      inputs: { gsplat, stateTexture, enabled },
      globals: () => [defineGsplat],
      statements: ({ inputs, outputs }) => {
        const { gsplat, stateTexture, enabled } = inputs;
        const { gsplat: outGsplat } = outputs;
        if (!outGsplat) {
          return [];
        }
        if (!gsplat || !stateTexture || !enabled) {
          return [`${outGsplat}.flags = 0u;`];
        }
        return unindentLines(`
          ${outGsplat} = ${gsplat};
          if (${enabled} && isGsplatActive(${gsplat}.flags)) {
            uint splatEditorState = texelFetch(${stateTexture}, splatTexCoord(${gsplat}.index), 0).r;
            if ((splatEditorState & ${SPLAT_EDITOR_STATE_DELETED}u) != 0u) {
              ${outGsplat}.flags = 0u;
            }
          }
        `);
      },
    });
  }
}

class ApplySplatEditorStateColor extends Dyno<
  {
    gsplat: typeof Gsplat;
    stateTexture: "usampler2DArray";
    enabled: "bool";
    selectedColor: "vec4";
    lockedColor: "vec4";
  },
  { gsplat: typeof Gsplat }
> {
  constructor({
    gsplat,
    stateTexture,
    enabled,
    selectedColor,
    lockedColor,
  }: {
    gsplat: DynoVal<typeof Gsplat>;
    stateTexture: DynoVal<"usampler2DArray">;
    enabled: DynoVal<"bool">;
    selectedColor: DynoVal<"vec4">;
    lockedColor: DynoVal<"vec4">;
  }) {
    super({
      inTypes: {
        gsplat: Gsplat,
        stateTexture: "usampler2DArray",
        enabled: "bool",
        selectedColor: "vec4",
        lockedColor: "vec4",
      },
      outTypes: { gsplat: Gsplat },
      inputs: { gsplat, stateTexture, enabled, selectedColor, lockedColor },
      globals: () => [defineGsplat],
      statements: ({ inputs, outputs }) => {
        const { gsplat, stateTexture, enabled, selectedColor, lockedColor } =
          inputs;
        const { gsplat: outGsplat } = outputs;
        if (!outGsplat) {
          return [];
        }
        if (
          !gsplat ||
          !stateTexture ||
          !enabled ||
          !selectedColor ||
          !lockedColor
        ) {
          return [`${outGsplat}.flags = 0u;`];
        }
        return unindentLines(`
          ${outGsplat} = ${gsplat};
          if (${enabled} && isGsplatActive(${gsplat}.flags)) {
            uint splatEditorState = texelFetch(${stateTexture}, splatTexCoord(${gsplat}.index), 0).r;
            if ((splatEditorState & ${SPLAT_EDITOR_STATE_LOCKED}u) != 0u) {
              ${outGsplat}.rgba *= ${lockedColor};
            } else if ((splatEditorState & ${SPLAT_EDITOR_STATE_SELECTED}u) != 0u) {
              ${outGsplat}.rgba.rgb = mix(${outGsplat}.rgba.rgb, ${selectedColor}.rgb, ${selectedColor}.a);
            }
          }
        `);
      },
    });
  }
}

class ApplySplatEditorStateTransform extends Dyno<
  {
    gsplat: typeof Gsplat;
    stateTexture: "usampler2DArray";
    stateEnabled: "bool";
    transformEnabled: "bool";
    pivot: "vec3";
    translate: "vec3";
    rotate: "vec4";
    scale: "float";
  },
  { gsplat: typeof Gsplat }
> {
  constructor({
    gsplat,
    stateTexture,
    stateEnabled,
    transformEnabled,
    pivot,
    translate,
    rotate,
    scale,
  }: {
    gsplat: DynoVal<typeof Gsplat>;
    stateTexture: DynoVal<"usampler2DArray">;
    stateEnabled: DynoVal<"bool">;
    transformEnabled: DynoVal<"bool">;
    pivot: DynoVal<"vec3">;
    translate: DynoVal<"vec3">;
    rotate: DynoVal<"vec4">;
    scale: DynoVal<"float">;
  }) {
    super({
      inTypes: {
        gsplat: Gsplat,
        stateTexture: "usampler2DArray",
        stateEnabled: "bool",
        transformEnabled: "bool",
        pivot: "vec3",
        translate: "vec3",
        rotate: "vec4",
        scale: "float",
      },
      outTypes: { gsplat: Gsplat },
      inputs: {
        gsplat,
        stateTexture,
        stateEnabled,
        transformEnabled,
        pivot,
        translate,
        rotate,
        scale,
      },
      globals: () => [defineGsplat],
      statements: ({ inputs, outputs }) => {
        const {
          gsplat,
          stateTexture,
          stateEnabled,
          transformEnabled,
          pivot,
          translate,
          rotate,
          scale,
        } = inputs;
        const { gsplat: outGsplat } = outputs;
        if (!outGsplat) {
          return [];
        }
        if (
          !gsplat ||
          !stateTexture ||
          !stateEnabled ||
          !transformEnabled ||
          !pivot ||
          !translate ||
          !rotate ||
          !scale
        ) {
          return [`${outGsplat}.flags = 0u;`];
        }
        return unindentLines(`
          ${outGsplat} = ${gsplat};
          if (${stateEnabled} && ${transformEnabled} && isGsplatActive(${gsplat}.flags)) {
            uint splatEditorState = texelFetch(${stateTexture}, splatTexCoord(${gsplat}.index), 0).r;
            if (splatEditorState == ${SPLAT_EDITOR_STATE_SELECTED}u) {
              vec3 selectedTransformOffset = (${outGsplat}.center - ${pivot}) * ${scale};
              ${outGsplat}.center = ${pivot} + quatVec(${rotate}, selectedTransformOffset) + ${translate};
              ${outGsplat}.scales *= ${scale};
              ${outGsplat}.quaternion = quatQuat(${rotate}, ${outGsplat}.quaternion);
            }
          }
        `);
      },
    });
  }
}

class ApplyCovSplatEditorStateColor extends Dyno<
  {
    covsplat: typeof CovSplat;
    stateTexture: "usampler2DArray";
    enabled: "bool";
    selectedColor: "vec4";
    lockedColor: "vec4";
  },
  { covsplat: typeof CovSplat }
> {
  constructor({
    covsplat,
    stateTexture,
    enabled,
    selectedColor,
    lockedColor,
  }: {
    covsplat: DynoVal<typeof CovSplat>;
    stateTexture: DynoVal<"usampler2DArray">;
    enabled: DynoVal<"bool">;
    selectedColor: DynoVal<"vec4">;
    lockedColor: DynoVal<"vec4">;
  }) {
    super({
      inTypes: {
        covsplat: CovSplat,
        stateTexture: "usampler2DArray",
        enabled: "bool",
        selectedColor: "vec4",
        lockedColor: "vec4",
      },
      outTypes: { covsplat: CovSplat },
      inputs: { covsplat, stateTexture, enabled, selectedColor, lockedColor },
      globals: () => [defineCovSplat],
      statements: ({ inputs, outputs }) => {
        const { covsplat, stateTexture, enabled, selectedColor, lockedColor } =
          inputs;
        const { covsplat: outCovSplat } = outputs;
        if (!outCovSplat) {
          return [];
        }
        if (
          !covsplat ||
          !stateTexture ||
          !enabled ||
          !selectedColor ||
          !lockedColor
        ) {
          return [`${outCovSplat}.flags = 0u;`];
        }
        return unindentLines(`
          ${outCovSplat} = ${covsplat};
          if (${enabled} && isCovSplatActive(${covsplat}.flags)) {
            uint splatEditorState = texelFetch(${stateTexture}, splatTexCoord(${covsplat}.index), 0).r;
            if ((splatEditorState & ${SPLAT_EDITOR_STATE_DELETED}u) != 0u) {
              ${outCovSplat}.flags = 0u;
            } else if ((splatEditorState & ${SPLAT_EDITOR_STATE_LOCKED}u) != 0u) {
              ${outCovSplat}.rgba *= ${lockedColor};
            } else if ((splatEditorState & ${SPLAT_EDITOR_STATE_SELECTED}u) != 0u) {
              ${outCovSplat}.rgba.rgb = mix(${outCovSplat}.rgba.rgb, ${selectedColor}.rgb, ${selectedColor}.a);
            }
          }
        `);
      },
    });
  }
}
