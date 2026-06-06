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

export interface SplatEditorStateCounts {
  readonly selected: number;
  readonly locked: number;
  readonly deleted: number;
}

export interface SplatEditorStateDirtyRange {
  readonly start: number;
  readonly count: number;
}

export interface SplatEditorStateColors {
  readonly selected?: THREE.Vector4;
  readonly locked?: THREE.Vector4;
}

const DEFAULT_SELECTED_COLOR = new THREE.Vector4(0.38, 0.62, 1.0, 0.42);
const DEFAULT_LOCKED_COLOR = new THREE.Vector4(0.58, 0.64, 0.72, 1.0);

export class SplatEditorState {
  states: Uint8Array;
  maxSplats: number;
  version = 0;
  texture: THREE.DataArrayTexture | null = null;
  selectedColor: THREE.Vector4;
  lockedColor: THREE.Vector4;

  private selected = 0;
  private locked = 0;
  private deleted = 0;
  private dirtyRanges: SplatEditorStateDirtyRange[] = [];
  private dirtyAll = false;

  constructor(numSplats = 0, colors: SplatEditorStateColors = {}) {
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
    this.maxSplats = 0;
    this.selected = 0;
    this.locked = 0;
    this.deleted = 0;
    this.dirtyRanges = [];
    this.dirtyAll = false;
  }

  ensureCapacity(numSplats: number): Uint8Array {
    const safeNumSplats = Math.max(0, Math.ceil(numSplats));
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
    for (const rawIndex of indices) {
      const index = Math.floor(rawIndex);
      if (index < 0 || index >= this.maxSplats) {
        continue;
      }
      changed =
        this.setUnchecked(
          index,
          applyStateOperation(this.states[index], bits, operation),
          false,
        ) || changed;
      min = Math.min(min, index);
      max = Math.max(max, index);
    }
    if (changed) {
      this.markDirtyRange(min, max - min + 1);
      this.version++;
    }
  }

  clear(mask?: SplatEditorStateBits): void {
    if (mask === undefined) {
      this.states.fill(0);
      this.selected = 0;
      this.locked = 0;
      this.deleted = 0;
      this.markDirtyRange(0, this.maxSplats);
      this.version++;
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
    this.dirtyRanges.push({ start: safeStart, count: safeEnd - safeStart });
    this.dirtyAll ||= safeEnd - safeStart >= this.maxSplats;
    if (this.texture) {
      this.texture.needsUpdate = true;
    }
  }

  markDirtyList(indices: Iterable<number>): void {
    let min = Number.POSITIVE_INFINITY;
    let max = -1;
    for (const rawIndex of indices) {
      const index = Math.floor(rawIndex);
      if (index < 0 || index >= this.maxSplats) {
        continue;
      }
      min = Math.min(min, index);
      max = Math.max(max, index);
    }
    if (max >= min) {
      this.markDirtyRange(min, max - min + 1);
    }
  }

  getDirtyRanges(): readonly SplatEditorStateDirtyRange[] {
    if (this.dirtyAll) {
      return [{ start: 0, count: this.maxSplats }];
    }
    return this.dirtyRanges.slice();
  }

  uploadDirty(): THREE.DataArrayTexture {
    const texture = this.getTexture();
    if (this.dirtyAll || this.dirtyRanges.length > 0) {
      texture.needsUpdate = true;
      this.dirtyAll = false;
      this.dirtyRanges = [];
    }
    return texture;
  }

  getTexture(): THREE.DataArrayTexture {
    if (this.maxSplats <= 0) {
      return SplatEditorState.emptyTexture;
    }
    if (!this.texture) {
      const { width, height, depth } = getTextureSize(this.maxSplats);
      this.texture = createStateTexture(this.states, width, height, depth);
      this.texture.needsUpdate = true;
    } else if (this.texture.image.data !== this.states) {
      this.texture.image.data = this.states;
      this.texture.needsUpdate = true;
    }
    return this.texture;
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.maxSplats) {
      throw new Error(`Invalid splat editor state index: ${index}`);
    }
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
    this.states[index] = next;
    this.updateCounts(next, 1);
    if (markDirty) {
      this.markDirtyRange(index, 1);
      this.version++;
    }
    return true;
  }

  private updateCounts(bits: number, delta: number): void {
    if ((bits & SPLAT_EDITOR_STATE_SELECTED) !== 0) {
      this.selected += delta;
    }
    if ((bits & SPLAT_EDITOR_STATE_LOCKED) !== 0) {
      this.locked += delta;
    }
    if ((bits & SPLAT_EDITOR_STATE_DELETED) !== 0) {
      this.deleted += delta;
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
