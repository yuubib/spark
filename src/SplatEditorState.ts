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
const DEFAULT_LOCKED_COLOR = new THREE.Vector4(0.58, 0.64, 0.72, 1.0);
const MAX_DIRTY_UPLOAD_SPANS = 512;

type StateTextureImage = {
  data: Uint8Array;
  width: number;
  height: number;
  depth: number;
};

type WebGLTextureProperties = {
  __webglTexture?: WebGLTexture;
};

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
  private fullTextureUploadPending = false;

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
    this.fullTextureUploadPending = false;
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
    if ((bits & SPLAT_EDITOR_STATE_DELETED) !== 0) {
      this.deleted += delta;
    } else if ((bits & SPLAT_EDITOR_STATE_LOCKED) !== 0) {
      this.locked += delta;
    } else if ((bits & SPLAT_EDITOR_STATE_SELECTED) !== 0) {
      this.selected += delta;
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
