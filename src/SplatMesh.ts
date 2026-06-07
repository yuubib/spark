import * as THREE from "three";

import init_wasm, {
  get_raycast_buffer,
  get_raycast_buffer2,
  raycast_ext_buffer_hits,
  raycast_packed_buffer_hits,
} from "spark-rs";
import { ExtSplats } from "./ExtSplats";
import { OldSparkRenderer } from "./OldSparkRenderer";
import { PackedSplats } from "./PackedSplats";
import { type RgbaArray, TRgbaArray } from "./RgbaArray";
import { SparkRenderer } from "./SparkRenderer";
import { SplatEdit, SplatEditSdf, SplatEdits } from "./SplatEdit";
import {
  SPLAT_EDITOR_STATE_NONE,
  SPLAT_EDITOR_STATE_SELECTED,
  type SplatEditorSelectionOperation,
  SplatEditorState,
  type SplatEditorStateBits,
  type SplatEditorStateChange,
  type SplatEditorStateChangeSet,
  type SplatEditorStateChangeSide,
  type SplatEditorStateCounts,
  type SplatEditorStateFilterMode,
  type SplatEditorStateIndexMode,
  type SplatEditorStateMutationOptions,
  type SplatEditorStateMutationResult,
  type SplatEditorStateOperation,
  type SplatEditorStateSummary,
  type SplatEditorStateUploadResult,
  applyCovSplatEditorStateColor,
  applySplatEditorStateColor,
  applySplatEditorStateTransform,
  applySplatEditorStateVisibility,
  matchesSplatEditorStateBits,
} from "./SplatEditorState";
import {
  type CovSplatModifier,
  CovSplatTransformer,
  type FrameUpdateContext,
  type GsplatModifier,
  SplatGenerator,
  SplatTransformer,
} from "./SplatGenerator";
import { PagedSplats, SplatPager } from "./SplatPager";
import type { SplatSkinning } from "./SplatSkinning";
import {
  DEFAULT_SPLAT_ENCODING,
  LN_SCALE_MAX,
  LN_SCALE_MIN,
  type SplatEncoding,
  type SplatFileType,
} from "./defines";
import {
  CovSplat,
  Dyno,
  DynoBool,
  DynoFloat,
  DynoInt,
  DynoUsampler2D,
  DynoUsampler2DArray,
  type DynoVal,
  DynoVec3,
  DynoVec4,
  Gsplat,
  combineCovSplat,
  combineGsplat,
  defineGsplat,
  dyno,
  dynoBlock,
  gsplatToCovSplat,
  mul,
  splitCovSplat,
  splitGsplat,
  unindentLines,
} from "./dyno";

export type SplatEditorStateRenderMode = "generator" | "accumulator";
export type SplatEditorSelectedTransformRenderMode =
  | "generator"
  | "accumulator";

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

export type SplatMeshStateIterationCallback = (
  index: number,
  center: THREE.Vector3,
  scales: THREE.Vector3,
  quaternion: THREE.Quaternion,
  opacity: number,
  color: THREE.Color,
  state: SplatEditorStateBits,
) => void;

export type SplatMeshOptions = {
  // URL to fetch a Gaussian splat file from(supports .ply, .splat, .ksplat,
  // .spz formats). (default: undefined)
  url?: string;
  // Raw bytes of a Gaussian splat file to decode directly instead of fetching
  // from URL. (default: undefined)
  fileBytes?: Uint8Array | ArrayBuffer;
  // Override the file type detection for formats that can't be reliably
  // auto-detected (.splat, .ksplat). (default: undefined auto-detects other
  // formats from file contents)
  fileType?: SplatFileType;
  // File name to use for type detection. (default: undefined)
  fileName?: string;
  // Stream to read the Gaussian splat file from. (default: undefined)
  stream?: ReadableStream;
  // Length of the stream in bytes. (default: undefined)
  streamLength?: number;
  // Use an existing PackedSplats object as the source instead of loading from
  // a file. Can be used to share a collection of Gsplats among multiple SplatMeshes
  // (default: undefined creates a new empty PackedSplats or decoded from a
  // data source above)
  packedSplats?: PackedSplats;
  // Use an existing SplatSource object as the source instead of loading from file.
  splats?: SplatSource;
  // Reserve space for at least this many splats when constructing the mesh
  // initially. (default: determined by file)
  maxSplats?: number;
  // Callback function to programmatically create splats at initialization
  // in provided PackedSplats. (default: undefined)
  constructSplats?: (splats: PackedSplats) => Promise<void> | void;
  // Callback function called while downloading and initializing (default: undefined)
  onProgress?: (event: ProgressEvent) => void;
  // Callback function that is called when mesh initialization is complete.
  // (default: undefined)
  onLoad?: (mesh: SplatMesh) => Promise<void> | void;
  // Controls whether SplatEdits have any effect on this mesh. (default: true)
  editable?: boolean;
  // Controls whether SplatMesh participates in Three.js raycasting (default: true)
  raycastable?: boolean;
  // Minimum opacity for raycasting splats. (default: 0.2)
  minRaycastOpacity?: number;
  // Editor-state filter used by the built-in THREE.Raycaster path. (default: "visible")
  raycastEditorStateMode?: SplatEditorStateFilterMode;
  // Controls where selected/locked editor-state styling is applied.
  // "generator" preserves Spark's default generated-output path.
  // "accumulator" lets the final draw shader sample accumulator-local state,
  // avoiding generated splat output updates for selected/locked/deleted changes.
  // Generator mode keeps deleted visibility baked into generated output.
  // (default: "generator")
  editorStateRenderMode?: SplatEditorStateRenderMode;
  // Controls where selected-splat transform previews are applied.
  // "generator" preserves Spark's default generated-output path.
  // "accumulator" applies the preview in the final accumulator draw shader,
  // avoiding generated splat output updates for single-editor-mesh previews.
  // Accumulator selected-transform rendering currently supports non-covariance
  // splats only; covariance splats stay on the generator path.
  // (default: "generator")
  editorSelectedTransformRenderMode?: SplatEditorSelectedTransformRenderMode;
  // Callback function that is called every frame to update the mesh.
  // Call mesh.updateVersion() if splats need to be regenerated due to some change.
  // Calling updateVersion() is not necessary for object transformations, recoloring,
  // or opacity adjustments as these are auto-detected. (default: undefined)
  onFrame?: ({
    mesh,
    time,
    deltaTime,
  }: { mesh: SplatMesh; time: number; deltaTime: number }) => void;
  // Gsplat modifier to apply in object-space before any transformations.
  // A GsplatModifier is a dyno shader-graph block that transforms an input
  // gsplat: DynoVal<Gsplat> to an output gsplat: DynoVal<Gsplat> with gsplat.center
  // coordinate in object-space. (default: undefined)
  objectModifier?: GsplatModifier;
  objectModifiers?: GsplatModifier[];
  // Gsplat modifier to apply in world-space after transformations.
  // (default: undefined)
  worldModifier?: GsplatModifier;
  worldModifiers?: GsplatModifier[];
  covObjectModifiers?: CovSplatModifier[];
  covWorldModifiers?: CovSplatModifier[];
  // Override the default splat encoding ranges for the PackedSplats.
  // (default: undefined)
  splatEncoding?: SplatEncoding;
  // Set to true to load/use "extended splat" encoding with float32 x/y/z
  extSplats?: boolean | ExtSplats;
  // Set to true to output covariance splats for anisotropic scaling
  covSplats?: boolean;
  // Enable LOD. If a number is provided, it will be used as LoD level base,
  // otherwise the default 1.5 is used. When loading a file without pre-computed
  // LoD it will use the "quick lod" algorithm to generate one on-the-fly with
  // the selected LoD level base. (default: undefined=false)
  lod?: boolean | "quality";
  // Only create LoD if the input splat acount is above this (default: undefined=0)
  lodAbove?: number;
  // Keep the original PackedSplats data before creating LoD version. (default: false)
  nonLod?: boolean;
  // Force enable/disable LoD (default: enabled iff packedSplats.lodSplats is not null)
  enableLod?: boolean;
  // LoD scale to apply @default 1.0
  lodScale?: number;
  // Foveation scale to apply behind viewer
  // (default: 1.0)
  behindFoveate?: number;
  // Full-width angle in degrees of fixed foveation cone along the view direction
  // with perfection foveation=1.0
  // (default: 0.0)
  coneFov0?: number;
  // Full-width angle in degrees of fixed foveation cone along the view direction. 0.0=disable
  // (default: 0.0)
  coneFov?: number;
  // Foveation scale to apply at the edge of the cone
  // (default: 1.0)
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
  editorStateTexture: DynoUsampler2DArray<
    "splatEditorStateTexture",
    THREE.DataArrayTexture
  >;
  editorSelectedColor: DynoVec4<THREE.Vector4, "splatEditorSelectedColor">;
  editorLockedColor: DynoVec4<THREE.Vector4, "splatEditorLockedColor">;
  editorSelectedTransformEnabled: DynoBool<"splatEditorSelectedTransformEnabled">;
  editorSelectedTransformPivot: DynoVec3<
    THREE.Vector3,
    "splatEditorSelectedTransformPivot"
  >;
  editorSelectedTransformTranslate: DynoVec3<
    THREE.Vector3,
    "splatEditorSelectedTransformTranslate"
  >;
  editorSelectedTransformRotate: DynoVec4<
    THREE.Quaternion,
    "splatEditorSelectedTransformRotate"
  >;
  editorSelectedTransformScale: DynoFloat<"splatEditorSelectedTransformScale">;
  enableLod: DynoBool<string>;
  lodIndices: DynoUsampler2D<"lodIndices", THREE.DataTexture>;
};

export interface SplatCenterRaw {
  x: number;
  y: number;
  z: number;
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

  fetchSplat({
    index,
    viewOrigin,
  }: { index: DynoVal<"int">; viewOrigin?: DynoVal<"vec3"> }): DynoVal<
    typeof Gsplat
  >;

  forEachSplat(
    callback: (
      index: number,
      center: THREE.Vector3,
      scales: THREE.Vector3,
      quaternion: THREE.Quaternion,
      opacity: number,
      color: THREE.Color,
    ) => void,
  ): void;

  forEachSplatCenter?(
    callback: (index: number, center: THREE.Vector3) => void,
  ): void;

  forEachSplatCenterRaw?(
    callback: (index: number, x: number, y: number, z: number) => void,
  ): void;

  getSplatCenterRaw?(index: number, target: SplatCenterRaw): boolean;
}

type MutableSplatSource = SplatSource & {
  needsUpdate?: boolean;
  textures?: [THREE.DataArrayTexture, THREE.DataArrayTexture];
  getSplat(index: number): {
    center: THREE.Vector3;
    scales: THREE.Vector3;
    quaternion: THREE.Quaternion;
    opacity: number;
    color: THREE.Color;
  };
  setSplat(
    index: number,
    center: THREE.Vector3,
    scales: THREE.Vector3,
    quaternion: THREE.Quaternion,
    opacity: number,
    color: THREE.Color,
  ): void;
};

export type SplatStateBoundingBoxOptions = {
  centersOnly?: boolean;
  mode?: SplatEditorStateFilterMode;
  applySelectedTransform?: boolean;
  target?: THREE.Box3;
};

export class EmptySplatSource implements SplatSource {
  fetchDyno = new Dyno({
    inTypes: {},
    outTypes: { gsplat: Gsplat },
    globals: () => [defineGsplat],
    statements: ({ outputs }) =>
      unindentLines(`
      ${outputs.gsplat}.flags = 0u;
      return;
    `),
  }).outputs.gsplat;

  prepareFetchSplat() {}
  dispose() {}

  getNumSplats() {
    return 0;
  }
  hasRgbDir() {
    return false;
  }
  getNumSh() {
    return 0;
  }
  setMaxSh(maxSh: number) {}

  fetchSplat({ index }: { index: DynoVal<"int"> }): DynoVal<typeof Gsplat> {
    return this.fetchDyno;
  }

  forEachSplat() {}

  forEachSplatCenter() {}

  forEachSplatCenterRaw() {}

  getSplatCenterRaw() {
    return false;
  }
}

export class SplatMesh extends SplatGenerator {
  // A Promise<SplatMesh> you can await to ensure fetching, parsing,
  // and initialization has completed
  initialized: Promise<SplatMesh>;
  // A boolean indicating whether initialization is complete
  isInitialized = false;

  // If you modify packedSplats you should set
  // splatMesh.packedSplats.needsUpdate = true to signal to Three.js that it
  // should re-upload the data to the underlying texture. Use this sparingly with
  // objects with smaller Gsplat counts as it requires a CPU-GPU data transfer for
  // each frame. Thousands to tens of thousands of Gsplats is fine. (See hands.ts
  // for an example of rendering "Gsplat hands" in WebXR using this technique.)
  packedSplats?: PackedSplats;
  extSplats?: ExtSplats;
  covSplats: boolean;
  splats?: SplatSource;
  lastSplats?: SplatSource;
  lastEditorState?: SplatEditorState | null;
  lastEditorStateVersion = -1;
  lastEditorStateVisibilityVersion = -1;
  paged?: PagedSplats;

  // A THREE.Color that can be used to tint all splats in the mesh.
  // (default: new THREE.Color(1, 1, 1))
  recolor: THREE.Color = new THREE.Color(1, 1, 1);
  // Global opacity multiplier for all splats in the mesh. (default: 1)
  opacity = 1;

  // A SplatMeshContext consisting of useful scene and object dyno uniforms that can
  // be used to in the Gsplat processing pipeline, for example via objectModifier and
  // worldModifier. (created on construction)
  context: SplatMeshContext;
  onFrame?: ({
    mesh,
    time,
    deltaTime,
  }: { mesh: SplatMesh; time: number; deltaTime: number }) => void;
  generatorDirty = true;

  objectModifiers?: GsplatModifier[];
  worldModifiers?: GsplatModifier[];
  covObjectModifiers?: CovSplatModifier[];
  covWorldModifiers?: CovSplatModifier[];
  // Set to true to have the viewToObject property in context be updated each frame.
  // If the mesh has extra.sh1 (first order spherical harmonics directional lighting)
  // this property will always be updated. (default: false)
  enableViewToObject = false;
  // Set to true to have context.viewToWorld updated each frame. (default: false)
  enableViewToWorld = false;
  // Set to true to have context.worldToView updated each frame. (default: false)
  enableWorldToView = false;

  // Optional SplatSkinning instance for animating splats with dual-quaternion
  // skeletal animation. (default: null)
  skinning: SplatSkinning | null = null;

  // Optional list of SplatEdits to apply to the mesh. If null, any SplatEdit
  // children in the scene graph will be added automatically. (default: null)
  edits: SplatEdit[] | null = null;
  editable: boolean;
  raycastable: boolean;
  minRaycastOpacity: number;
  raycastEditorStateMode: SplatEditorStateFilterMode;
  editorStateRenderMode: SplatEditorStateRenderMode;
  editorSelectedTransformRenderMode: SplatEditorSelectedTransformRenderMode;
  raycastIndices?: { numSplats: number; indices: Uint32Array };
  // Compiled SplatEdits for applying SDF edits to splat RGBA + centers
  rgbaDisplaceEdits: SplatEdits | null = null;
  // Optional RgbaArray to overwrite splat RGBA values with custom values.
  // Useful for "baking" RGB and opacity edits into the SplatMesh. (default: null)
  splatRgba: RgbaArray | null = null;

  // Maximum Spherical Harmonics level to use. Call updateGenerator()
  // after changing. (default: 3)
  maxSh = 3;

  enableLod?: boolean;
  lodScale: number;
  behindFoveate?: number;
  coneFov0?: number;
  coneFov?: number;
  coneFoveate?: number;

  showLodPage?: number;
  showLodPageDyno = new DynoInt({ value: 0 });

  constructor(options: SplatMeshOptions = {}) {
    super({
      update: (context) => this.update(context),
    });

    if (options.splats) {
      this.splats = options.splats;
      this.numSplats = options.splats.getNumSplats();
    } else if (options.paged) {
      if (options.extSplats) {
        console.warn(
          "To set extSplats with the paged option, set SparkRenderer.pagedExtSplats",
        );
      }
      const rootUrl = options.url ?? "";
      if (options.paged === true) {
        this.paged = new PagedSplats({ rootUrl });
      } else if (options.paged instanceof PagedSplats) {
        this.paged = options.paged;
      } else if (options.paged instanceof SplatPager) {
        this.paged = new PagedSplats({ rootUrl, pager: options.paged });
      } else {
        throw new Error("Invalid paged option");
      }
      this.splats = this.paged;
    } else if (options.extSplats) {
      this.extSplats =
        options.extSplats instanceof ExtSplats
          ? options.extSplats
          : new ExtSplats();
      options.extSplats = this.extSplats;
      this.numSplats = this.extSplats.numSplats;
      this.splats = this.extSplats;
    } else if (options.packedSplats) {
      this.packedSplats = options.packedSplats;
      this.packedSplats.splatEncoding = options.splatEncoding ?? {
        ...DEFAULT_SPLAT_ENCODING,
      };
      this.splats = this.packedSplats;
    } else {
      this.packedSplats = new PackedSplats();
    }

    this.editable = options.editable ?? true;
    this.raycastable = options.raycastable ?? true;
    this.minRaycastOpacity = options.minRaycastOpacity ?? 0.2;
    this.raycastEditorStateMode = options.raycastEditorStateMode ?? "visible";
    this.editorStateRenderMode = options.editorStateRenderMode ?? "generator";
    this.editorSelectedTransformRenderMode =
      options.editorSelectedTransformRenderMode ?? "generator";
    this.onFrame = options.onFrame;

    this.context = {
      transform: new SplatTransformer(),
      viewToWorld: new SplatTransformer(),
      worldToView: new SplatTransformer(),
      viewToObject: new SplatTransformer(),
      covTransform: new CovSplatTransformer(),
      covViewToWorld: new CovSplatTransformer(),
      covWorldToView: new CovSplatTransformer(),
      covViewToObject: new CovSplatTransformer(),
      recolor: new DynoVec4({
        value: new THREE.Vector4().setScalar(Number.NEGATIVE_INFINITY),
      }),
      time: new DynoFloat({ value: 0 }),
      deltaTime: new DynoFloat({ value: 0 }),
      numSplats: new DynoInt({ value: 0 }),
      splats: new EmptySplatSource(),
      editorStateEnabled: new DynoBool({
        key: "splatEditorStateEnabled",
        value: false,
      }),
      editorStateTexture: new DynoUsampler2DArray({
        key: "splatEditorStateTexture",
        value: SplatEditorState.emptyTexture,
      }),
      editorSelectedColor: new DynoVec4({
        key: "splatEditorSelectedColor",
        value: new THREE.Vector4(),
      }),
      editorLockedColor: new DynoVec4({
        key: "splatEditorLockedColor",
        value: new THREE.Vector4(),
      }),
      editorSelectedTransformEnabled: new DynoBool({
        key: "splatEditorSelectedTransformEnabled",
        value: false,
      }),
      editorSelectedTransformPivot: new DynoVec3({
        key: "splatEditorSelectedTransformPivot",
        value: new THREE.Vector3(),
      }),
      editorSelectedTransformTranslate: new DynoVec3({
        key: "splatEditorSelectedTransformTranslate",
        value: new THREE.Vector3(),
      }),
      editorSelectedTransformRotate: new DynoVec4({
        key: "splatEditorSelectedTransformRotate",
        value: new THREE.Quaternion(),
      }),
      editorSelectedTransformScale: new DynoFloat({
        key: "splatEditorSelectedTransformScale",
        value: 1,
      }),
      enableLod: new DynoBool({ value: false }),
      lodIndices: new DynoUsampler2D({
        value: emptyLodIndices,
        key: "lodIndices",
      }),
    };

    this.covSplats = options.covSplats ?? false;
    if (this.covSplats && !this.extSplats) {
      throw new Error("CovSplats requires ExtSplats");
    }

    this.objectModifiers = options.objectModifier
      ? [options.objectModifier]
      : undefined;
    this.worldModifiers = options.worldModifier
      ? [options.worldModifier]
      : undefined;

    if (options.objectModifiers) {
      this.objectModifiers = options.objectModifiers;
    }
    if (options.worldModifiers) {
      this.worldModifiers = options.worldModifiers;
    }

    this.enableLod = options.enableLod;
    this.lodScale = options.lodScale ?? 1.0;
    this.behindFoveate = options.behindFoveate;
    this.coneFov0 = options.coneFov0;
    this.coneFov = options.coneFov;
    this.coneFoveate = options.coneFoveate;

    this.updateGenerator();

    if (
      options.url ||
      options.fileBytes ||
      options.stream ||
      options.constructSplats ||
      (options.packedSplats && !options.packedSplats.isInitialized) ||
      (this.extSplats && !this.extSplats.isInitialized)
    ) {
      // We need to initialize asynchronously given the options
      this.initialized = this.asyncInitialize(options).then(async () => {
        this.updateGenerator();

        this.isInitialized = true;
        if (options.onLoad) {
          const maybePromise = options.onLoad(this);
          if (maybePromise instanceof Promise) {
            await maybePromise;
          }
        }
        return this;
      });
    } else {
      this.isInitialized = true;
      this.initialized = Promise.resolve(this);
      if (options.onLoad) {
        const maybePromise = options.onLoad(this);
        // If onLoad returns a promise, wait for it to complete
        if (maybePromise instanceof Promise) {
          this.initialized = maybePromise.then(() => this);
        }
      }
    }

    // this.add(createRendererDetectionMesh());
  }

  async asyncInitialize(options: SplatMeshOptions) {
    const {
      url,
      fileBytes,
      fileType,
      fileName,
      stream,
      streamLength,
      maxSplats,
      constructSplats,
      onProgress,
      splatEncoding,
      lod,
      nonLod,
      lodAbove,
    } = options;
    if (this.packedSplats) {
      if (url || fileBytes || stream || constructSplats) {
        const packedSplatsOptions = {
          url,
          fileBytes,
          fileType,
          fileName,
          stream,
          streamLength,
          maxSplats,
          construct: constructSplats,
          onProgress,
          splatEncoding,
          lod,
          nonLod,
          lodAbove,
        };
        this.packedSplats.reinitialize(packedSplatsOptions);
      }
      await this.packedSplats.initialized;
      this.splats = this.packedSplats;
    } else if (this.extSplats) {
      if (url || fileBytes || stream || constructSplats) {
        const construct = constructSplats as
          | ((splats: ExtSplats) => Promise<void>)
          | undefined;
        this.extSplats.reinitialize({
          url,
          fileBytes,
          fileType,
          fileName,
          stream,
          streamLength,
          maxSplats,
          construct,
          onProgress,
          lod,
          nonLod,
          lodAbove,
        });
        await this.extSplats.initialized;
        this.splats = this.extSplats;
      }
    }

    if (this.splats) {
      this.numSplats = this.splats.getNumSplats();
      this.updateGenerator();
    }
  }

  static staticInitialized = SplatMesh.staticInitialize();
  static isStaticInitialized = false;

  static dynoTime = new DynoFloat({ value: 0 });

  static async staticInitialize() {
    await init_wasm();
    SplatMesh.isStaticInitialized = true;
  }

  // Creates a new Gsplat with the provided parameters (all values in "float" space,
  // i.e. 0-1 for opacity and color) and adds it to the end of the packedSplats,
  // increasing numSplats by 1. If necessary, reallocates the buffer with an exponential
  // doubling strategy to fit the new data, so it's fairly efficient to just
  // pushSplat(...) each Gsplat you want to create in a loop.
  pushSplat(
    center: THREE.Vector3,
    scales: THREE.Vector3,
    quaternion: THREE.Quaternion,
    opacity: number,
    color: THREE.Color,
  ) {
    if (this.packedSplats) {
      this.packedSplats.pushSplat(center, scales, quaternion, opacity, color);
    } else if (this.extSplats) {
      this.extSplats.pushSplat(center, scales, quaternion, opacity, color);
    }
  }

  // This method iterates over all Gsplats in this instance's packedSplats,
  // invoking the provided callback with index: number in 0..=(this.numSplats-1) and
  // center: THREE.Vector3, scales: THREE.Vector3, quaternion: THREE.Quaternion,
  // opacity: number (0..1), and color: THREE.Color (rgb values in 0..1).
  // Note that the objects passed in as center etc. are the same for every callback
  // invocation: these objects are reused for efficiency. Changing these values has
  // no effect as they are decoded/unpacked copies of the underlying data. To update
  // the packedSplats, call .packedSplats.setSplat(index, center, scales,
  // quaternion, opacity, color).
  forEachSplat(
    callback: (
      index: number,
      center: THREE.Vector3,
      scales: THREE.Vector3,
      quaternion: THREE.Quaternion,
      opacity: number,
      color: THREE.Color,
    ) => void,
  ) {
    this.splats?.forEachSplat(callback);
  }

  // Iterate over decoded splats that match an editor-state filter. The decoded
  // component objects follow forEachSplat reuse semantics and are safe to read
  // but not retain between iterations.
  forEachSplatByState(
    callback: SplatMeshStateIterationCallback,
    {
      mode = "visible",
      applySelectedTransform = false,
    }: SplatMeshStateIterationOptions = {},
  ): void {
    const source = this.splats;
    if (!source) {
      return;
    }

    const editorState = this.getEditorState();
    const selectedTransform = applySelectedTransform
      ? this.getSelectedSplatTransform()
      : null;
    source.forEachSplat((index, center, scales, quaternion, opacity, color) => {
      const bits = this.getEditorStateBits(editorState, index);
      if (!matchesSplatEditorStateBits(bits, mode)) {
        return;
      }
      if (selectedTransform && bits === SPLAT_EDITOR_STATE_SELECTED) {
        applySelectedTransformToDecodedSplat(
          center,
          scales,
          quaternion,
          selectedTransform,
        );
      }
      callback(index, center, scales, quaternion, opacity, color, bits);
    });
  }

  // Iterate over splat centers without requiring sources to decode scale,
  // rotation, opacity, or color attributes. Custom sources may omit the center
  // hook; in that case Spark falls back to the full splat iterator.
  forEachSplatCenter(callback: (index: number, center: THREE.Vector3) => void) {
    const source = this.splats;
    if (!source) {
      return;
    }
    if (source.forEachSplatCenter) {
      source.forEachSplatCenter(callback);
      return;
    }
    source.forEachSplat((index, center) => callback(index, center));
  }

  // Iterate over raw splat center components. Center-mode editor picking uses
  // this path to avoid creating or mutating Three.js vectors per source center.
  forEachSplatCenterRaw(
    callback: (index: number, x: number, y: number, z: number) => void,
  ) {
    const source = this.splats;
    if (!source) {
      return;
    }
    if (source.forEachSplatCenterRaw) {
      source.forEachSplatCenterRaw(callback);
      return;
    }
    this.forEachSplatCenter((index, center) =>
      callback(index, center.x, center.y, center.z),
    );
  }

  hasIndexedSplatCenters(): boolean {
    return this.splats?.getSplatCenterRaw != null;
  }

  getSplatCenterRaw(index: number, target: SplatCenterRaw): boolean {
    const source = this.splats;
    if (!source || index < 0 || index >= source.getNumSplats()) {
      return false;
    }
    if (source.getSplatCenterRaw) {
      return source.getSplatCenterRaw(index, target);
    }

    let found = false;
    this.forEachSplatCenterRaw((centerIndex, x, y, z) => {
      if (found || centerIndex !== index) {
        return;
      }
      target.x = x;
      target.y = y;
      target.z = z;
      found = true;
    });
    return found;
  }

  getEditorState(): SplatEditorState | null {
    const source = this.getEditorStateSource();
    return source.getEditorState?.() ?? null;
  }

  ensureEditorState(numSplats = this.numSplats): SplatEditorState {
    const source = this.getEditorStateSource();
    if (!source.ensureEditorState) {
      throw new Error("SplatSource does not support editor state");
    }
    const existing = source.getEditorState?.() ?? null;
    const previousVersion = existing?.version ?? -1;
    const state = source.ensureEditorState(numSplats || source.getNumSplats());
    this.updateEditorStateContext(state);
    if (!existing || state.version !== previousVersion) {
      this.updateEditorStateStyleVersion();
    }
    return state;
  }

  clearEditorState(): void {
    const source = this.getEditorStateSource();
    const state = source.getEditorState?.();
    const hadDeleted = (state?.getCounts().deleted ?? 0) > 0;
    source.clearEditorState?.();
    if (state) {
      this.updateEditorStateContext(null);
      if (hadDeleted) {
        this.updateEditorStateVisibilityVersion();
      } else {
        this.updateEditorStateStyleVersion();
      }
    }
  }

  getSplatState(index: number): SplatEditorStateBits {
    return this.getEditorState()?.get(index) ?? SPLAT_EDITOR_STATE_NONE;
  }

  setSplatState(
    index: number,
    bits: SplatEditorStateBits,
  ): SplatEditorStateBits {
    const state = this.ensureEditorState();
    const previousVersion = state.version;
    const previousVisibilityVersion = state.visibilityVersion;
    const next = state.set(index, bits);
    this.updateVersionForEditorState(
      state,
      previousVersion,
      previousVisibilityVersion,
    );
    return next;
  }

  setSplatStateBits(
    index: number,
    mask: SplatEditorStateBits,
  ): SplatEditorStateBits {
    const state = this.ensureEditorState();
    const previousVersion = state.version;
    const previousVisibilityVersion = state.visibilityVersion;
    const next = state.setBits(index, mask);
    this.updateVersionForEditorState(
      state,
      previousVersion,
      previousVisibilityVersion,
    );
    return next;
  }

  clearSplatStateBits(
    index: number,
    mask: SplatEditorStateBits,
  ): SplatEditorStateBits {
    const state = this.ensureEditorState();
    const previousVersion = state.version;
    const previousVisibilityVersion = state.visibilityVersion;
    const next = state.clearBits(index, mask);
    this.updateVersionForEditorState(
      state,
      previousVersion,
      previousVisibilityVersion,
    );
    return next;
  }

  toggleSplatStateBits(
    index: number,
    mask: SplatEditorStateBits,
  ): SplatEditorStateBits {
    const state = this.ensureEditorState();
    const previousVersion = state.version;
    const previousVisibilityVersion = state.visibilityVersion;
    const next = state.toggleBits(index, mask);
    this.updateVersionForEditorState(
      state,
      previousVersion,
      previousVisibilityVersion,
    );
    return next;
  }

  updateSplatState(
    index: number,
    mask: SplatEditorStateBits,
    operation: SplatEditorStateOperation,
  ): SplatEditorStateBits {
    const state = this.ensureEditorState();
    const previousVersion = state.version;
    const previousVisibilityVersion = state.visibilityVersion;
    const next = state.update(index, mask, operation);
    this.updateVersionForEditorState(
      state,
      previousVersion,
      previousVisibilityVersion,
    );
    return next;
  }

  setSplatStateRange(
    start: number,
    count: number,
    bits: SplatEditorStateBits,
    operation: SplatEditorStateOperation = "replace",
  ): void {
    const state = this.ensureEditorState(start + count);
    const previousVersion = state.version;
    const previousVisibilityVersion = state.visibilityVersion;
    state.setRange(start, count, bits, operation);
    this.updateVersionForEditorState(
      state,
      previousVersion,
      previousVisibilityVersion,
    );
  }

  setSplatStateList(
    indices: Iterable<number>,
    bits: SplatEditorStateBits,
    operation: SplatEditorStateOperation = "replace",
  ): void {
    const state = this.ensureEditorState();
    const previousVersion = state.version;
    const previousVisibilityVersion = state.visibilityVersion;
    state.setList(indices, bits, operation);
    this.updateVersionForEditorState(
      state,
      previousVersion,
      previousVisibilityVersion,
    );
  }

  replaceSplatState(
    states: ArrayLike<number>,
    numSplats = states.length,
  ): void {
    const state = this.ensureEditorState(numSplats);
    const previousVersion = state.version;
    const previousVisibilityVersion = state.visibilityVersion;
    state.replace(states, numSplats);
    this.updateVersionForEditorState(
      state,
      previousVersion,
      previousVisibilityVersion,
    );
  }

  clearSplatState(mask?: SplatEditorStateBits): void {
    const state = this.ensureEditorState();
    const previousVersion = state.version;
    const previousVisibilityVersion = state.visibilityVersion;
    state.clear(mask);
    this.updateVersionForEditorState(
      state,
      previousVersion,
      previousVisibilityVersion,
    );
  }

  selectSplatStateCandidates(
    indices: Iterable<number>,
    operation: SplatEditorSelectionOperation = "set",
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    return this.mutateEditorState((state) =>
      state.selectCandidates(indices, operation, options),
    );
  }

  selectAllSplatState(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    return this.mutateEditorState((state) => state.selectAll(options));
  }

  clearSplatStateSelection(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    return this.mutateEditorState((state) => state.clearSelection(options));
  }

  invertSplatStateSelection(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    return this.mutateEditorState((state) => state.invertSelection(options));
  }

  hideSelectedSplatState(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    return this.mutateEditorState((state) => state.hideSelected(options));
  }

  unhideAllSplatState(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    return this.mutateEditorState((state) => state.unhideAll(options));
  }

  deleteSelectedSplatState(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    return this.mutateEditorState((state) => state.deleteSelected(options));
  }

  resetDeletedSplatState(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    return this.mutateEditorState((state) => state.resetDeleted(options));
  }

  cropSplatStateToSelection(
    options: SplatEditorStateMutationOptions = {},
  ): SplatEditorStateMutationResult {
    return this.mutateEditorState((state) => state.cropToSelection(options));
  }

  applySplatStateChanges(
    changes: Iterable<SplatEditorStateChange>,
    side: SplatEditorStateChangeSide = "next",
  ): SplatEditorStateMutationResult {
    return this.mutateEditorState((state) => state.applyChanges(changes, side));
  }

  applySplatStateChangeSet(
    changeSet: SplatEditorStateChangeSet,
    side: SplatEditorStateChangeSide = "next",
  ): SplatEditorStateMutationResult {
    return this.mutateEditorState((state) =>
      state.applyChangeSet(changeSet, side),
    );
  }

  setSelectedSplatTransform({
    pivot,
    translate,
    rotate,
    scale = 1,
  }: SplatMeshSelectedTransformOptions = {}): boolean {
    const nextPivot = pivot?.clone() ?? new THREE.Vector3();
    const nextTranslate = translate?.clone() ?? new THREE.Vector3();
    const nextRotate = rotate?.clone() ?? new THREE.Quaternion();

    if (!isFiniteVector3(nextPivot)) {
      throw new Error("Selected splat transform pivot must be finite");
    }
    if (!isFiniteVector3(nextTranslate)) {
      throw new Error("Selected splat transform translation must be finite");
    }
    if (!isFiniteQuaternion(nextRotate)) {
      throw new Error("Selected splat transform rotation must be finite");
    }
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error("Selected splat transform scale must be finite and > 0");
    }

    nextRotate.normalize();
    const changed =
      !this.context.editorSelectedTransformEnabled.value ||
      !this.context.editorSelectedTransformPivot.value.equals(nextPivot) ||
      !this.context.editorSelectedTransformTranslate.value.equals(
        nextTranslate,
      ) ||
      !this.context.editorSelectedTransformRotate.value.equals(nextRotate) ||
      this.context.editorSelectedTransformScale.value !== scale;

    if (!changed) {
      return false;
    }

    this.context.editorSelectedTransformEnabled.value = true;
    this.context.editorSelectedTransformPivot.value.copy(nextPivot);
    this.context.editorSelectedTransformTranslate.value.copy(nextTranslate);
    this.context.editorSelectedTransformRotate.value.copy(nextRotate);
    this.context.editorSelectedTransformScale.value = scale;
    this.updateEditorStateContext(this.getEditorState());
    this.updateVersionForSelectedSplatTransform();
    return true;
  }

  clearSelectedSplatTransform(): boolean {
    if (!this.context.editorSelectedTransformEnabled.value) {
      return false;
    }

    this.context.editorSelectedTransformEnabled.value = false;
    this.context.editorSelectedTransformPivot.value.set(0, 0, 0);
    this.context.editorSelectedTransformTranslate.value.set(0, 0, 0);
    this.context.editorSelectedTransformRotate.value.identity();
    this.context.editorSelectedTransformScale.value = 1;
    this.updateEditorStateContext(this.getEditorState());
    this.updateVersionForSelectedSplatTransform();
    return true;
  }

  getSelectedSplatTransform(): SplatMeshSelectedTransformSnapshot | null {
    if (!this.context.editorSelectedTransformEnabled.value) {
      return null;
    }

    return {
      pivot: this.context.editorSelectedTransformPivot.value.clone(),
      translate: this.context.editorSelectedTransformTranslate.value.clone(),
      rotate: this.context.editorSelectedTransformRotate.value.clone(),
      scale: this.context.editorSelectedTransformScale.value,
    };
  }

  getAccumulatorSelectedSplatTransform(): SplatMeshSelectedTransformSnapshot | null {
    if (!this.usesAccumulatorSelectedSplatTransform()) {
      return null;
    }
    return this.getSelectedSplatTransform();
  }

  bakeSelectedSplatTransform({
    clear = true,
  }: SplatMeshSelectedTransformBakeOptions = {}): SplatMeshSelectedTransformBakeResult {
    const selectedTransform = this.getSelectedSplatTransform();
    const editorState = this.getEditorState();
    const selected = editorState?.getCounts().selected ?? 0;
    const result: SplatMeshSelectedTransformBakeResult = {
      applied: false,
      changed: 0,
      selected,
      cleared: false,
      unsupported: false,
    };
    if (!selectedTransform || selected <= 0 || !editorState) {
      return result;
    }

    const source = this.splats;
    if (!isMutableSplatSource(source)) {
      return {
        ...result,
        unsupported: true,
      };
    }

    const sourceCount = source.getNumSplats();
    for (const index of editorState.listIndices("selected")) {
      if (index < 0 || index >= sourceCount) {
        continue;
      }
      const splat = source.getSplat(index);
      applySelectedTransformToDecodedSplat(
        splat.center,
        splat.scales,
        splat.quaternion,
        selectedTransform,
      );
      source.setSplat(
        index,
        splat.center,
        splat.scales,
        splat.quaternion,
        splat.opacity,
        splat.color,
      );
      result.changed += 1;
    }

    if (result.changed > 0) {
      markMutableSplatSourceUpdated(source);
      this.updateVersion();
      result.applied = true;
    }
    if (clear) {
      result.cleared = this.clearSelectedSplatTransform();
    }
    return result;
  }

  getSplatStateCounts(): SplatEditorStateCounts {
    return (
      this.getEditorState()?.getCounts() ?? {
        selected: 0,
        locked: 0,
        deleted: 0,
      }
    );
  }

  getSplatStateSummary(): SplatEditorStateSummary {
    return (
      this.getEditorState()?.getSummary() ?? {
        total: this.numSplats,
        visible: this.numSplats,
        selectable: this.numSplats,
        selected: 0,
        locked: 0,
        deleted: 0,
      }
    );
  }

  listSplatStateIndices(mode: SplatEditorStateIndexMode): number[] {
    const state = this.getEditorState();
    if (state) {
      return state.listIndices(mode);
    }
    if (mode !== "unselected-selectable") {
      return [];
    }
    return Array.from({ length: this.numSplats }, (_, index) => index);
  }

  uploadDirtySplatState(
    renderer?: THREE.WebGLRenderer,
  ): THREE.DataArrayTexture {
    return this.ensureEditorState().uploadDirtyWithResult(renderer).texture;
  }

  uploadDirtySplatStateWithResult(
    renderer?: THREE.WebGLRenderer,
  ): SplatEditorStateUploadResult {
    return this.ensureEditorState().uploadDirtyWithResult(renderer);
  }

  // Call this when you are finished with the SplatMesh and want to free
  // any buffers it holds (via packedSplats).
  dispose() {
    if (
      this.splats &&
      this.splats !== this.packedSplats &&
      this.splats !== this.extSplats
    ) {
      this.splats.dispose();
      this.splats = undefined;
    }
    if (this.packedSplats) {
      this.packedSplats.dispose();
      this.packedSplats = undefined;
    }
    if (this.extSplats) {
      this.extSplats.dispose();
      this.extSplats = undefined;
    }
  }

  // Returns axis-aligned bounding box of the SplatMesh. If centers_only is true,
  // only the centers of the splats are used to compute the bounding box.
  // IMPORTANT: This should only be called after the SplatMesh is initialized.
  getBoundingBox(centers_only = true) {
    if (!this.initialized) {
      throw new Error(
        "Cannot get bounding box before SplatMesh is initialized",
      );
    }
    const minVec = new THREE.Vector3(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    const maxVec = new THREE.Vector3(
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );
    const corners = new THREE.Vector3();
    const signs = [-1, 1];

    if (centers_only) {
      this.forEachSplatCenterRaw((_index, x, y, z) => {
        minVec.x = Math.min(minVec.x, x);
        minVec.y = Math.min(minVec.y, y);
        minVec.z = Math.min(minVec.z, z);
        maxVec.x = Math.max(maxVec.x, x);
        maxVec.y = Math.max(maxVec.y, y);
        maxVec.z = Math.max(maxVec.z, z);
      });
      return new THREE.Box3(minVec, maxVec);
    }

    this.splats?.forEachSplat(
      (_index, center, scales, quaternion, _opacity, _color) => {
        // Get the 8 corners of the AABB in local space
        for (const x of signs) {
          for (const y of signs) {
            for (const z of signs) {
              corners.set(x * scales.x, y * scales.y, z * scales.z);
              // Transform corner by rotation and position
              corners.applyQuaternion(quaternion);
              corners.add(center);
              minVec.min(corners);
              maxVec.max(corners);
            }
          }
        }
      },
    );
    return new THREE.Box3(minVec, maxVec);
  }

  getSplatStateBoundingBox({
    centersOnly = true,
    mode = "visible",
    applySelectedTransform = false,
    target,
  }: SplatStateBoundingBoxOptions = {}) {
    if (!this.initialized) {
      throw new Error(
        "Cannot get editor-state bounding box before SplatMesh is initialized",
      );
    }

    const box = target ?? new THREE.Box3();
    box.makeEmpty();
    const editorState = this.getEditorState();
    const selectedTransform = applySelectedTransform
      ? this.getSelectedSplatTransform()
      : null;
    const corners = new THREE.Vector3();
    const signs = [-1, 1];

    if (centersOnly) {
      const center = new THREE.Vector3();
      this.forEachSplatCenterRaw((index, x, y, z) => {
        const bits = this.getEditorStateBits(editorState, index);
        if (!matchesSplatEditorStateBits(bits, mode)) {
          return;
        }

        center.set(x, y, z);
        if (selectedTransform && bits === SPLAT_EDITOR_STATE_SELECTED) {
          applySelectedTransformToCenter(center, selectedTransform);
        }

        box.expandByPoint(center);
      });
      return box;
    }

    this.splats?.forEachSplat(
      (index, center, scales, quaternion, _opacity, _color) => {
        const bits = this.getEditorStateBits(editorState, index);
        if (!matchesSplatEditorStateBits(bits, mode)) {
          return;
        }
        if (selectedTransform && bits === SPLAT_EDITOR_STATE_SELECTED) {
          applySelectedTransformToDecodedSplat(
            center,
            scales,
            quaternion,
            selectedTransform,
          );
        }
        for (const x of signs) {
          for (const y of signs) {
            for (const z of signs) {
              corners.set(x * scales.x, y * scales.y, z * scales.z);
              corners.applyQuaternion(quaternion);
              corners.add(center);
              box.expandByPoint(corners);
            }
          }
        }
      },
    );

    return box;
  }

  private getEditorStateSource(): SplatSource {
    const source =
      this.splats ?? this.packedSplats ?? this.extSplats ?? this.paged;
    if (!source) {
      throw new Error("SplatMesh does not have a splat source");
    }
    return source;
  }

  private getEditorStateBits(
    state: SplatEditorState | null | undefined,
    index: number,
  ): SplatEditorStateBits {
    if (!state || index < 0 || index >= state.maxSplats) {
      return SPLAT_EDITOR_STATE_NONE;
    }
    return state.states[index] ?? SPLAT_EDITOR_STATE_NONE;
  }

  private matchesEditorStateMode(
    state: SplatEditorState | null | undefined,
    index: number,
    mode: SplatEditorStateFilterMode,
  ): boolean {
    return matchesSplatEditorStateBits(
      this.getEditorStateBits(state, index),
      mode,
    );
  }

  private updateVersionForEditorState(
    state: SplatEditorState,
    previousVersion: number,
    previousVisibilityVersion: number,
  ): void {
    this.updateEditorStateContext(state);
    if (state.version !== previousVersion) {
      if (state.visibilityVersion !== previousVisibilityVersion) {
        this.updateEditorStateVisibilityVersion();
      } else {
        this.updateEditorStateStyleVersion();
      }
    }
  }

  private mutateEditorState(
    mutate: (state: SplatEditorState) => SplatEditorStateMutationResult,
  ): SplatEditorStateMutationResult {
    const state = this.ensureEditorState();
    const previousVersion = state.version;
    const previousVisibilityVersion = state.visibilityVersion;
    const result = mutate(state);
    this.updateVersionForEditorState(
      state,
      previousVersion,
      previousVisibilityVersion,
    );
    return result;
  }

  private updateEditorStateVisibilityVersion(): void {
    if (this.editorStateRenderMode === "accumulator") {
      this.updateStyleVersion();
      return;
    }
    this.updateVersion();
  }

  private updateEditorStateStyleVersion(): void {
    if (this.editorStateRenderMode === "accumulator") {
      this.updateStyleVersion();
      return;
    }
    this.updateRenderVersion();
  }

  private updateVersionForSelectedSplatTransform(): void {
    if (this.usesAccumulatorSelectedSplatTransform()) {
      this.updateStyleVersion();
      return;
    }
    this.updateVersion();
  }

  private usesAccumulatorSelectedSplatTransform(): boolean {
    return (
      this.editorStateRenderMode === "accumulator" &&
      this.editorSelectedTransformRenderMode === "accumulator" &&
      !this.covSplats
    );
  }

  private usesGeneratorSelectedSplatTransform(): boolean {
    return !this.usesAccumulatorSelectedSplatTransform();
  }

  private updateEditorStateContext(
    state: SplatEditorState | null,
    renderer?: THREE.WebGLRenderer,
  ): void {
    const needsSourceTexture =
      this.editorStateRenderMode === "generator" ||
      (this.context.editorSelectedTransformEnabled.value &&
        this.usesGeneratorSelectedSplatTransform());

    this.context.editorStateEnabled.value = state != null;
    if (state && needsSourceTexture) {
      this.context.editorStateTexture.value = renderer
        ? state.uploadDirtyWithResult(renderer).texture
        : state.getTexture();
    } else {
      state?.deferDirtyTextureUpload();
      this.context.editorStateTexture.value = SplatEditorState.emptyTexture;
    }
    if (state) {
      this.context.editorSelectedColor.value.copy(state.selectedColor);
      this.context.editorLockedColor.value.copy(state.lockedColor);
    }
  }

  set objectModifier(modifier: GsplatModifier | undefined) {
    if (modifier) {
      this.objectModifiers = [modifier];
    } else {
      this.objectModifiers = undefined;
    }
  }

  set worldModifier(modifier: GsplatModifier | undefined) {
    if (modifier) {
      this.worldModifiers = [modifier];
    } else {
      this.worldModifiers = undefined;
    }
  }

  private constructGenerator(context: SplatMeshContext) {
    if (this.covSplats) {
      return this.constructCovGenerator(context);
    }

    const { transform, viewToObject, recolor } = context;
    const generator = dynoBlock(
      { index: "int" },
      { gsplat: Gsplat },
      ({ index }) => {
        if (!index) {
          throw new Error("index is undefined");
        }

        index = maybeLookupIndex(
          context.lodIndices,
          index,
          context.numSplats,
          context.enableLod,
          this.showLodPageDyno,
        );

        // Read a Gsplat from the SplatSource
        context.splats.setMaxSh(this.maxSh);
        context.splats.prepareFetchSplat();
        let gsplat = context.splats.fetchSplat({
          index,
          viewOrigin: viewToObject.translate,
        });
        if (this.editorStateRenderMode === "generator") {
          gsplat = applySplatEditorStateVisibility(
            gsplat,
            context.editorStateTexture,
            context.editorStateEnabled,
          );
        }
        if (this.usesGeneratorSelectedSplatTransform()) {
          gsplat = applySplatEditorStateTransform(
            gsplat,
            context.editorStateTexture,
            context.editorStateEnabled,
            context.editorSelectedTransformEnabled,
            context.editorSelectedTransformPivot,
            context.editorSelectedTransformTranslate,
            context.editorSelectedTransformRotate,
            context.editorSelectedTransformScale,
          );
        }

        if (this.splatRgba) {
          // Overwrite RGBA with baked RGBA values
          gsplat = maybeInjectSplatRgba(
            gsplat,
            this.splatRgba.dyno,
            index,
            context.enableLod,
          );
        }

        if (this.skinning) {
          // Transform according to bones + skinning weights
          gsplat = this.skinning.modify(gsplat);
        }

        if (this.objectModifiers) {
          // Inject object-space Gsplat modifier dyno
          for (const modifier of this.objectModifiers) {
            gsplat = modifier.apply({ gsplat }).gsplat;
          }
        }

        // Transform from object to world-space
        gsplat = transform.applyGsplat(gsplat);

        // Apply any global recoloring and opacity
        const recolorRgba = mul(recolor, splitGsplat(gsplat).outputs.rgba);
        gsplat = combineGsplat({ gsplat, rgba: recolorRgba });

        if (this.rgbaDisplaceEdits) {
          // Apply RGBA edit layer SDFs
          gsplat = this.rgbaDisplaceEdits.modify(gsplat);
        }

        if (this.worldModifiers) {
          // Inject world-space Gsplat modifier dyno
          for (const modifier of this.worldModifiers) {
            gsplat = modifier.apply({ gsplat }).gsplat;
          }
        }

        if (this.editorStateRenderMode === "generator") {
          gsplat = applySplatEditorStateColor(
            gsplat,
            context.editorStateTexture,
            context.editorStateEnabled,
            context.editorSelectedColor,
            context.editorLockedColor,
          );
        }

        // We're done! Output resulting Gsplat
        return { gsplat };
      },
    );
    this.generator = generator;
    this.covGenerator = undefined;
  }

  constructCovGenerator(context: SplatMeshContext) {
    // console.log("CovSplatMesh.constructCovGenerator");
    const { covTransform, covViewToObject, recolor } = context;
    const generator = dynoBlock(
      { index: "int" },
      { covsplat: CovSplat },
      ({ index }) => {
        if (!index) {
          throw new Error("index is undefined");
        }

        index = maybeLookupIndex(
          context.lodIndices,
          index,
          context.numSplats,
          context.enableLod,
          this.showLodPageDyno,
        );

        // Read a Gsplat from the SplatSource
        context.splats.prepareFetchSplat();
        let gsplat = context.splats.fetchSplat({
          index,
          viewOrigin: covViewToObject.offset,
        });
        if (this.editorStateRenderMode === "generator") {
          gsplat = applySplatEditorStateVisibility(
            gsplat,
            context.editorStateTexture,
            context.editorStateEnabled,
          );
        }
        if (this.usesGeneratorSelectedSplatTransform()) {
          gsplat = applySplatEditorStateTransform(
            gsplat,
            context.editorStateTexture,
            context.editorStateEnabled,
            context.editorSelectedTransformEnabled,
            context.editorSelectedTransformPivot,
            context.editorSelectedTransformTranslate,
            context.editorSelectedTransformRotate,
            context.editorSelectedTransformScale,
          );
        }

        if (this.splatRgba) {
          // Overwrite RGBA with baked RGBA values
          gsplat = maybeInjectSplatRgba(
            gsplat,
            this.splatRgba.dyno,
            index,
            context.enableLod,
          );
        }

        if (this.objectModifiers) {
          // Inject object-space Gsplat modifier dyno
          for (const modifier of this.objectModifiers) {
            gsplat = modifier.apply({ gsplat }).gsplat;
          }
        }

        let covsplat = gsplatToCovSplat(gsplat);

        if (this.skinning) {
          // Transform according to bones + skinning weights
          covsplat = this.skinning.modifyCov(covsplat);
        }

        if (this.covObjectModifiers) {
          // Inject object-space CovSplat modifier dyno
          for (const modifier of this.covObjectModifiers) {
            covsplat = modifier.apply({ covsplat }).covsplat;
          }
        }

        // Transform from object to world-space
        covsplat = covTransform.applyCovSplat(covsplat);

        // Apply any global recoloring and opacity
        const recolorRgba = mul(recolor, splitCovSplat(covsplat).outputs.rgba);
        covsplat = combineCovSplat({ covsplat, rgba: recolorRgba });

        if (this.rgbaDisplaceEdits) {
          // Apply RGBA edit layer SDFs
          covsplat = this.rgbaDisplaceEdits.modifyCov(covsplat);
        }

        if (this.covWorldModifiers) {
          // Inject world-space CovSplat modifier dyno
          for (const modifier of this.covWorldModifiers) {
            covsplat = modifier.apply({ covsplat }).covsplat;
          }
        }

        if (this.editorStateRenderMode === "generator") {
          covsplat = applyCovSplatEditorStateColor(
            covsplat,
            context.editorStateTexture,
            context.editorStateEnabled,
            context.editorSelectedColor,
            context.editorLockedColor,
          );
        }

        // We're done! Output resulting Gsplat
        return { covsplat };
      },
    );
    this.generator = undefined;
    this.covGenerator = generator;
  }

  // Call this whenever something changes in the Gsplat processing pipeline,
  // for example changing maxSh or updating objectModifier or worldModifier.
  // Compiled generators are cached for efficiency and re-use when the same
  // pipeline structure emerges after successive changes.
  updateGenerator() {
    this.generatorDirty = true;
  }

  // This is called automatically by SparkRenderer and you should not have to
  // call it. It updates parameters for the generated pipeline and calls
  // updateGenerator() if the pipeline needs to change.
  update({
    renderer,
    time,
    deltaTime,
    viewToWorld,
    camera,
    renderSize,
    globalEdits,
    lodIndices,
  }: FrameUpdateContext) {
    this.context.time.value = time;
    this.context.deltaTime.value = deltaTime;
    SplatMesh.dynoTime.value = time;
    this.showLodPageDyno.value = this.showLodPage ?? -1;

    const splats = this.splats ?? this.packedSplats ?? this.extSplats;
    if (splats) {
      this.context.splats = splats;
    }
    this.numSplats = this.context.splats.getNumSplats();

    let updated = false;

    const lodSplats = this.packedSplats?.lodSplats ?? this.extSplats?.lodSplats;
    this.context.enableLod.value = lodSplats != null && lodIndices != null;
    if (this.enableLod === false) {
      this.context.enableLod.value = false;
    }
    this.context.lodIndices.value = lodIndices?.texture ?? emptyLodIndices;

    if (this.context.enableLod.value && lodSplats) {
      this.context.splats = lodSplats;
      this.numSplats = lodIndices?.numSplats ?? 0;
    }

    this.context.numSplats.value = this.numSplats;

    if (this.context.splats !== this.lastSplats) {
      this.lastSplats = this.context.splats;
      this.generatorDirty = true;
    }

    const editorState = this.context.splats.getEditorState?.() ?? null;
    this.updateEditorStateContext(editorState, renderer);
    const editorStateVersion = editorState?.version ?? -1;
    const editorStateVisibilityVersion = editorState?.visibilityVersion ?? -1;
    if (editorState !== this.lastEditorState) {
      if (editorState) {
        if (editorState.getCounts().deleted > 0) {
          this.updateEditorStateVisibilityVersion();
        } else {
          this.updateEditorStateStyleVersion();
        }
      } else if (this.lastEditorState) {
        this.updateEditorStateStyleVersion();
      }
    } else if (editorStateVersion !== this.lastEditorStateVersion) {
      if (editorState) {
        this.updateVersionForEditorState(
          editorState,
          this.lastEditorStateVersion,
          this.lastEditorStateVisibilityVersion,
        );
      }
    }
    this.lastEditorState = editorState;
    this.lastEditorStateVersion = editorStateVersion;
    this.lastEditorStateVisibilityVersion = editorStateVisibilityVersion;

    if (!this.covSplats) {
      if (this.context.transform.update(this)) {
        updated = true;
      }

      if (
        this.context.viewToWorld.updateFromMatrix(viewToWorld) &&
        this.enableViewToWorld
      ) {
        updated = true;
      }
      const worldToView = viewToWorld.clone().invert();
      if (
        this.context.worldToView.updateFromMatrix(worldToView) &&
        this.enableWorldToView
      ) {
        updated = true;
      }

      const objectToWorld = new THREE.Matrix4().compose(
        this.context.transform.translate.value,
        this.context.transform.rotate.value,
        new THREE.Vector3().setScalar(this.context.transform.scale.value),
      );
      const worldToObject = objectToWorld.invert();
      const viewToObjectMatrix = worldToObject.multiply(viewToWorld);
      if (
        this.context.viewToObject.updateFromMatrix(viewToObjectMatrix) &&
        (this.enableViewToObject || this.context.splats.hasRgbDir())
      ) {
        // Only trigger update if we have view-dependent spherical harmonics
        updated = true;
      }
    } else {
      if (this.context.covTransform.update(this)) {
        updated = true;
      }

      if (
        this.context.covViewToWorld.updateFromMatrix(viewToWorld) &&
        this.enableViewToWorld
      ) {
        updated = true;
      }
      const worldToView = viewToWorld.clone().invert();
      if (
        this.context.covWorldToView.updateFromMatrix(worldToView) &&
        this.enableWorldToView
      ) {
        updated = true;
      }

      const worldToObject = this.matrixWorld.clone().invert();
      const viewToObjectMatrix = worldToObject.multiply(viewToWorld);
      if (
        this.context.covViewToObject.updateFromMatrix(viewToObjectMatrix) &&
        (this.enableViewToObject || this.context.splats.hasRgbDir())
      ) {
        // Only trigger update if we have view-dependent spherical harmonics
        updated = true;
      }
    }

    const newRecolor = new THREE.Vector4(
      this.recolor.r,
      this.recolor.g,
      this.recolor.b,
      this.opacity,
    );
    if (!newRecolor.equals(this.context.recolor.value)) {
      this.context.recolor.value.copy(newRecolor);
      updated = true;
    }

    const edits = this.editable ? (this.edits ?? []).concat(globalEdits) : [];
    if (this.editable && !this.edits) {
      // If we haven't set any explicit edits, add any child SplatEdits
      this.traverseVisible((node) => {
        if (node instanceof SplatEdit) {
          edits.push(node);
        }
      });
    }

    edits.sort((a, b) => a.ordering - b.ordering);
    const editsSdfs = edits.map((edit) => {
      if (edit.sdfs != null) {
        return { edit, sdfs: edit.sdfs };
      }
      const sdfs: SplatEditSdf[] = [];
      edit.traverseVisible((node) => {
        if (node instanceof SplatEditSdf) {
          sdfs.push(node);
        }
      });
      return { edit, sdfs };
    });

    if (editsSdfs.length > 0 && !this.rgbaDisplaceEdits) {
      const edits = editsSdfs.length;
      const sdfs = editsSdfs.reduce(
        (total, edit) => total + edit.sdfs.length,
        0,
      );
      this.rgbaDisplaceEdits = new SplatEdits({
        maxEdits: edits,
        maxSdfs: sdfs,
      });
      this.generatorDirty = true;
    }
    if (this.rgbaDisplaceEdits) {
      const editResult = this.rgbaDisplaceEdits.update(editsSdfs);
      updated ||= editResult.updated;
      if (editResult.dynoUpdated) {
        this.generatorDirty = true;
      }
    }

    if (this.generatorDirty) {
      this.constructGenerator(this.context);
      this.generatorDirty = false;
      updated = true;
    }

    if (updated) {
      this.updateVersion();
    }

    this.onFrame?.({ mesh: this, time, deltaTime });
  }

  // This method conforms to the standard THREE.Raycaster API, performing object-ray
  // intersections using this method to populate the provided intersects[] array
  // with each intersection point.
  raycast(
    raycaster: THREE.Raycaster,
    intersects: {
      distance: number;
      point: THREE.Vector3;
      object: THREE.Object3D;
    }[],
  ) {
    for (const hit of this.collectSplatRayHits(raycaster, {
      editorStateMode: this.raycastEditorStateMode,
      sort: false,
    })) {
      intersects.push({
        distance: hit.distance,
        point: hit.point,
        object: this,
      });
    }
  }

  pickSplatRay(
    raycaster: THREE.Raycaster,
    options: SplatMeshRayPickOptions = {},
  ): SplatMeshRayPickHit[] {
    const hits = this.collectSplatRayHits(raycaster, options);
    if (options.sort ?? true) {
      hits.sort((a, b) => a.distance - b.distance);
    }
    const maxHits = normalizeMaxPickHits(options.maxHits);
    return maxHits === null ? hits : hits.slice(0, maxHits);
  }

  private collectSplatRayHits(
    raycaster: THREE.Raycaster,
    options: SplatMeshRayPickOptions,
  ): SplatMeshRayPickHit[] {
    const hits: SplatMeshRayPickHit[] = [];
    if (
      !SplatMesh.isStaticInitialized ||
      !this.raycastable ||
      (!this.packedSplats && !this.extSplats && !this.paged)
    ) {
      return hits;
    }
    const paged = this.paged != null;
    const ext = paged
      ? (this.paged?.pager?.extSplats ?? false)
      : this.extSplats != null;

    const { near, far, ray } = raycaster;
    const worldToMesh = this.matrixWorld.clone().invert();
    const worldToMeshRot = new THREE.Matrix3().setFromMatrix4(worldToMesh);
    const origin = ray.origin.clone().applyMatrix4(worldToMesh);
    const direction = ray.direction.clone().applyMatrix3(worldToMeshRot);

    const buffer = get_raycast_buffer();
    const bufferSize = buffer.length / 4;

    const contextNumSplats = this.context.numSplats.value;
    const activeNumSplats = paged
      ? this.paged?.numSplats
      : contextNumSplats > 0
        ? contextNumSplats
        : this.numSplats;
    const numSplats = this.raycastIndices?.numSplats ?? activeNumSplats ?? 0;
    const indices =
      this.raycastIndices?.indices ??
      (paged
        ? (this.paged?.dynoIndices.value.image.data as Uint32Array)
        : this.context.enableLod.value
          ? (this.context.lodIndices.value.image.data as Uint32Array)
          : null) ??
      null;
    const editorStateMode =
      options.editorStateMode ?? this.raycastEditorStateMode;
    const editorState =
      editorStateMode === "all"
        ? null
        : (this.context.splats.getEditorState?.() ?? this.getEditorState());
    const filterEditorState = editorState != null;
    const sourceIndices = SplatMesh.raycastSourceIndexBuffer;

    if (!ext) {
      const packed = paged
        ? (this.paged?.pager?.packedTexture.value.image.data as Uint32Array)
        : indices
          ? this.packedSplats?.lodSplats?.packedArray
          : this.packedSplats?.packedArray;
      if (!packed) {
        return hits;
      }
      const splatEncoding = paged
        ? this.paged?.splatEncoding
        : this.packedSplats?.splatEncoding;
      for (let base = 0; base < numSplats; base += bufferSize) {
        const count = Math.min(bufferSize, numSplats - base);
        let filteredCount = count;
        let mappedSourceIndices = Boolean(indices);
        if (!filterEditorState && !indices) {
          buffer.set(packed.subarray(base * 4, (base + count) * 4));
        } else if (!filterEditorState && indices) {
          for (let i = 0; i < count; ++i) {
            const index = indices[base + i];
            sourceIndices[i] = index;
            const i4 = i * 4;
            const index4 = index * 4;
            buffer[i4] = packed[index4];
            buffer[i4 + 1] = packed[index4 + 1];
            buffer[i4 + 2] = packed[index4 + 2];
            buffer[i4 + 3] = packed[index4 + 3];
          }
        } else {
          filteredCount = 0;
          mappedSourceIndices = true;
          for (let i = 0; i < count; ++i) {
            const index = indices ? indices[base + i] : base + i;
            if (
              !this.matchesEditorStateMode(editorState, index, editorStateMode)
            ) {
              continue;
            }
            sourceIndices[filteredCount] = index;
            const i4 = filteredCount * 4;
            const index4 = index * 4;
            buffer[i4] = packed[index4];
            buffer[i4 + 1] = packed[index4 + 1];
            buffer[i4 + 2] = packed[index4 + 2];
            buffer[i4 + 3] = packed[index4 + 3];
            filteredCount++;
          }
          if (filteredCount === 0) {
            continue;
          }
        }

        const newHits = raycast_packed_buffer_hits(
          origin.x,
          origin.y,
          origin.z,
          direction.x,
          direction.y,
          direction.z,
          this.minRaycastOpacity,
          near,
          far,
          filteredCount,
          splatEncoding?.lnScaleMin ?? LN_SCALE_MIN,
          splatEncoding?.lnScaleMax ?? LN_SCALE_MAX,
          splatEncoding?.lodOpacity ?? false,
        );
        this.appendRaycastHitPairs(
          hits,
          newHits,
          ray,
          mappedSourceIndices ? sourceIndices : null,
          base,
        );
      }
    } else {
      const buffer2 = get_raycast_buffer2();
      const ext1 = paged
        ? (this.paged?.pager?.packedTexture.value.image.data as Uint32Array)
        : indices
          ? this.extSplats?.lodSplats?.extArrays[0]
          : this.extSplats?.extArrays[0];
      const ext2 = paged
        ? (this.paged?.pager?.extTexture.value.image.data as Uint32Array)
        : indices
          ? this.extSplats?.lodSplats?.extArrays[1]
          : this.extSplats?.extArrays[1];
      if (!ext1 || !ext2) {
        return hits;
      }
      for (let base = 0; base < numSplats; base += bufferSize) {
        const count = Math.min(bufferSize, numSplats - base);
        let filteredCount = count;
        let mappedSourceIndices = Boolean(indices);
        if (!filterEditorState && !indices) {
          buffer.set(ext1.subarray(base * 4, (base + count) * 4));
          buffer2.set(ext2.subarray(base * 4, (base + count) * 4));
        } else if (!filterEditorState && indices) {
          for (let i = 0; i < count; ++i) {
            const index = indices[base + i];
            sourceIndices[i] = index;
            const i4 = i * 4;
            const index4 = index * 4;
            buffer[i4] = ext1[index4];
            buffer[i4 + 1] = ext1[index4 + 1];
            buffer[i4 + 2] = ext1[index4 + 2];
            buffer[i4 + 3] = ext1[index4 + 3];
            buffer2[i4] = ext2[index4];
            buffer2[i4 + 1] = ext2[index4 + 1];
            buffer2[i4 + 2] = ext2[index4 + 2];
            buffer2[i4 + 3] = ext2[index4 + 3];
          }
        } else {
          filteredCount = 0;
          mappedSourceIndices = true;
          for (let i = 0; i < count; ++i) {
            const index = indices ? indices[base + i] : base + i;
            if (
              !this.matchesEditorStateMode(editorState, index, editorStateMode)
            ) {
              continue;
            }
            sourceIndices[filteredCount] = index;
            const i4 = filteredCount * 4;
            const index4 = index * 4;
            buffer[i4] = ext1[index4];
            buffer[i4 + 1] = ext1[index4 + 1];
            buffer[i4 + 2] = ext1[index4 + 2];
            buffer[i4 + 3] = ext1[index4 + 3];
            buffer2[i4] = ext2[index4];
            buffer2[i4 + 1] = ext2[index4 + 1];
            buffer2[i4 + 2] = ext2[index4 + 2];
            buffer2[i4 + 3] = ext2[index4 + 3];
            filteredCount++;
          }
          if (filteredCount === 0) {
            continue;
          }
        }

        const newHits = raycast_ext_buffer_hits(
          origin.x,
          origin.y,
          origin.z,
          direction.x,
          direction.y,
          direction.z,
          this.minRaycastOpacity,
          near,
          far,
          filteredCount,
        );
        this.appendRaycastHitPairs(
          hits,
          newHits,
          ray,
          mappedSourceIndices ? sourceIndices : null,
          base,
        );
      }
    }

    return hits;
  }

  private static raycastSourceIndexBuffer = new Uint32Array(65536);
  private static raycastDistanceBits = new Uint32Array(1);
  private static raycastDistanceFloat = new Float32Array(
    SplatMesh.raycastDistanceBits.buffer,
  );

  private appendRaycastHitPairs(
    hits: SplatMeshRayPickHit[],
    hitPairs: Uint32Array,
    ray: THREE.Ray,
    sourceIndices: Uint32Array | null,
    base: number,
  ): void {
    for (let i = 0; i + 1 < hitPairs.length; i += 2) {
      const localIndex = hitPairs[i];
      SplatMesh.raycastDistanceBits[0] = hitPairs[i + 1];
      const distance = SplatMesh.raycastDistanceFloat[0];
      const index = sourceIndices
        ? sourceIndices[localIndex]
        : base + localIndex;
      const point = ray.direction
        .clone()
        .multiplyScalar(distance)
        .add(ray.origin);
      hits.push({
        index,
        distance,
        point,
        object: this,
      });
    }
  }

  async createLodSplats({
    rgbaArray,
    quality,
  }: { rgbaArray?: RgbaArray; quality?: boolean } = {}) {
    if (this.packedSplats) {
      await this.packedSplats.createLodSplats({ quality, rgbaArray });
    } else if (this.extSplats) {
      await this.extSplats.createLodSplats({ quality, rgbaArray });
    }
  }
}

function isFiniteVector3(value: THREE.Vector3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function isFiniteQuaternion(value: THREE.Quaternion): boolean {
  const lengthSq =
    value.x * value.x +
    value.y * value.y +
    value.z * value.z +
    value.w * value.w;
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.w) &&
    lengthSq > 0
  );
}

export function maybeLookupIndex(
  lodIndices: DynoUsampler2D<"lodIndices", THREE.DataTexture>,
  index: DynoVal<"int">,
  numSplats: DynoVal<"int">,
  enableLod: DynoVal<"bool">,
  showLodPage: DynoVal<"int">,
) {
  return dyno({
    inTypes: {
      lodIndices: "usampler2D",
      index: "int",
      numSplats: "int",
      enableLod: "bool",
      showLodPage: "int",
    },
    outTypes: {
      index: "int",
    },
    inputs: {
      lodIndices,
      index,
      numSplats,
      enableLod,
      showLodPage,
    },
    statements: ({ inputs, outputs }) =>
      unindentLines(`
        int index = ${inputs.index};
        if (${inputs.showLodPage} < 0) {
          if (index >= ${inputs.numSplats}) {
            return;
          }
          if (${inputs.enableLod}) {
            ivec2 lodIndexCoord = ivec2((index >> 2) & 4095, index >> 14);
            uint splatIndex = texelFetch(${inputs.lodIndices}, lodIndexCoord, 0)[index & 3];
            ${outputs.index} = int(splatIndex);
          } else {
            ${outputs.index} = index;
          }
        } else {
          int start = ${inputs.showLodPage} << 16;
          if (index >= 65536) {
            return;
          }
          ${outputs.index} = start + index;
        }
      `),
  }).outputs.index;
}

export function maybeInjectSplatRgba(
  gsplat: DynoVal<typeof Gsplat>,
  rgba: DynoVal<typeof TRgbaArray>,
  index: DynoVal<"int">,
  enableLod: DynoVal<"bool">,
): DynoVal<typeof Gsplat> {
  return dyno({
    inTypes: {
      gsplat: Gsplat,
      rgba: TRgbaArray,
      index: "int",
      enableLod: "bool",
    },
    outTypes: { gsplat: Gsplat },
    inputs: { gsplat, rgba, index, enableLod },
    statements: ({ inputs, outputs }) =>
      unindentLines(`
        ${outputs.gsplat} = ${inputs.gsplat};
        if (!${inputs.enableLod} && (${inputs.index} >= 0) && (${inputs.index} < ${inputs.rgba}.count)) {
          ${outputs.gsplat}.rgba = texelFetch(${inputs.rgba}.texture, splatTexCoord(${inputs.index}), 0);
        }
      `),
  }).outputs.gsplat;
}

export const emptyLodIndices = (() => {
  const texture = new THREE.DataTexture(
    new Uint32Array(16384),
    4096,
    1,
    THREE.RGBAIntegerFormat,
    THREE.UnsignedIntType,
  );
  texture.internalFormat = "RGBA32UI";
  texture.needsUpdate = true;
  return texture;
})();

const EMPTY_GEOMETRY = new THREE.BufferGeometry();
const EMPTY_MATERIAL = new THREE.ShaderMaterial();

function normalizeMaxPickHits(maxHits: number | undefined): number | null {
  if (maxHits === undefined || !Number.isFinite(maxHits)) {
    return null;
  }
  return Math.max(0, Math.floor(maxHits));
}

function isMutableSplatSource(
  source: SplatSource | undefined,
): source is MutableSplatSource {
  return (
    source !== undefined &&
    typeof (source as Partial<MutableSplatSource>).getSplat === "function" &&
    typeof (source as Partial<MutableSplatSource>).setSplat === "function"
  );
}

function markMutableSplatSourceUpdated(source: MutableSplatSource): void {
  if ("needsUpdate" in source) {
    source.needsUpdate = true;
  }
  for (const texture of source.textures ?? []) {
    texture.needsUpdate = true;
  }
}

function applySelectedTransformToDecodedSplat(
  center: THREE.Vector3,
  scales: THREE.Vector3,
  quaternion: THREE.Quaternion,
  { pivot, translate, rotate, scale }: SplatMeshSelectedTransformSnapshot,
): void {
  center.sub(pivot).multiplyScalar(scale).applyQuaternion(rotate);
  center.add(pivot).add(translate);
  scales.multiplyScalar(scale);
  quaternion.premultiply(rotate);
}

function applySelectedTransformToCenter(
  center: THREE.Vector3,
  { pivot, translate, rotate, scale }: SplatMeshSelectedTransformSnapshot,
): void {
  center.sub(pivot).multiplyScalar(scale).applyQuaternion(rotate);
  center.add(pivot).add(translate);
}

// Creates an empty mesh to hook into Three.js rendering.
// This is used to detect if a SparkRenderer is present in the scene.
// If not, one will be injected automatically.
function createRendererDetectionMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(EMPTY_GEOMETRY, EMPTY_MATERIAL);
  mesh.frustumCulled = false;
  mesh.onBeforeRender = function (renderer, scene) {
    if (!scene.isScene) {
      // The SplatMesh is part of render call that doesn't have a Scene at its root
      // Don't auto-inject a renderer.
      this.removeFromParent();
      return;
    }

    // Check if the scene has a SparkRenderer instance
    let hasSparkRenderer = false;
    scene.traverse((c) => {
      if (c instanceof SparkRenderer || c instanceof OldSparkRenderer) {
        hasSparkRenderer = true;
      }
    });

    if (!hasSparkRenderer) {
      // No spark renderer present in the scene, inject one.
      scene.add(new SparkRenderer({ renderer }));
    }

    // Remove mesh to stop checking
    this.removeFromParent();
  };
  return mesh;
}
