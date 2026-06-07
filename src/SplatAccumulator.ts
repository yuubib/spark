import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { Readback } from "./Readback";
import { SplatEdit } from "./SplatEdit";
import {
  SplatEditorState,
  type SplatEditorStateDirtyRange,
} from "./SplatEditorState";
import {
  type CovSplatGenerator,
  type GsplatGenerator,
  SplatGenerator,
} from "./SplatGenerator";
import { SplatMesh } from "./SplatMesh";
import {
  LN_SCALE_MAX,
  LN_SCALE_MIN,
  SPLAT_TEX_HEIGHT,
  SPLAT_TEX_WIDTH,
} from "./defines";
import {
  type CovSplat,
  Dyno,
  DynoBool,
  DynoProgram,
  DynoProgramTemplate,
  DynoUsampler2DArray,
  type DynoVal,
  DynoVec3,
  combineCovSplat,
  combineGsplat,
  dynoBlock,
  dynoConst,
  gsplatToCovSplat,
  mul,
  outputCovSplat,
  outputCovSplatDepth,
  outputExtCovSplat,
  outputExtendedSplat,
  outputPackedSplat,
  outputSplatDepth,
  splitCovSplat,
  splitGsplat,
  sub,
  unindentLines,
} from "./dyno";
import { getShaders } from "./shaders";
import { getTextureSize, threeMrtArray } from "./utils";

// A GeneratorMapping describes a Gsplat range that was generated, including
// which generator and its version number.
export type GeneratorMapping = {
  node: SplatGenerator;
  generator?: GsplatGenerator;
  covGenerator?: CovSplatGenerator;
  version: number;
  sortVersion?: number;
  styleVersion?: number;
  mappingVersion?: number;
  base: number;
  count: number;
};

type EditorStateTextureImage = {
  data: Uint8Array;
  width: number;
  height: number;
  depth: number;
};

type EditorStateUploadSpan = {
  layer: number;
  row: number;
  rowCount: number;
  start: number;
  count: number;
};

type WebGLTextureProperties = {
  __webglTexture?: WebGLTexture;
};

const MAX_EDITOR_STATE_UPLOAD_SPANS = 512;

export class SplatAccumulator {
  time = 0;
  deltaTime = 0;
  viewToWorld = new THREE.Matrix4();
  viewOrigin = new THREE.Vector3();
  viewDirection = new THREE.Vector3();
  static viewCenterUniform = new DynoVec3({ value: new THREE.Vector3() });
  static viewDirUniform = new DynoVec3({ value: new THREE.Vector3() });
  static sortRadialUniform = new DynoBool({ value: true });
  maxSplats = 0;
  numSplats = 0;
  target: THREE.WebGLArrayRenderTarget | null = null;
  mapping: GeneratorMapping[] = [];
  version = -1;
  sortVersion = -1;
  mappingVersion = -1;
  styleVersion = -1;
  extSplats: boolean;
  covSplats: boolean;
  readback: Readback | null = null;
  readbackSplats: DynoUsampler2DArray<"extSplats", THREE.DataArrayTexture>[] =
    [];
  editorStateData = new Uint8Array(0);
  editorStateTexture: THREE.DataArrayTexture | null = null;
  editorStateEnabled = false;
  editorStateSelectedColor = new THREE.Vector4(0.38, 0.62, 1.0, 0.42);
  editorStateLockedColor = new THREE.Vector4(0.58, 0.64, 0.72, 1.0);
  private editorStateMappingKey = "";

  constructor({
    extSplats,
    covSplats,
  }: { extSplats?: boolean; covSplats?: boolean } = {}) {
    if (!threeMrtArray) {
      throw new Error("Spark requires THREE.js r179 or above");
    }
    this.extSplats = extSplats ?? true;
    this.covSplats = covSplats ?? false;
  }

  dispose() {
    if (this.target) {
      this.target.dispose();
      this.target = null;
    }
    if (this.editorStateTexture) {
      this.editorStateTexture.dispose();
      this.editorStateTexture.source.data = null;
      this.editorStateTexture = null;
    }
    this.editorStateData = new Uint8Array(0);
    this.editorStateEnabled = false;
    this.editorStateMappingKey = "";
  }

  // Returns a THREE.DataArrayTexture representing the NewSplatAccumulator
  // content as 2 x Uint32x4 data array textures (2048 x 2048 x 2048 in size)
  getTextures(): THREE.DataArrayTexture[] {
    if (this.target) {
      return this.target.textures;
    }
    return SplatAccumulator.emptyTextures;
  }

  getEditorStateTexture(): THREE.DataArrayTexture {
    return this.editorStateTexture ?? SplatEditorState.emptyTexture;
  }

  updateEditorStateTexture({
    mapping = this.mapping,
    renderer,
  }: {
    mapping?: readonly GeneratorMapping[];
    renderer?: THREE.WebGLRenderer;
  } = {}): boolean {
    const stateMappings: {
      item: GeneratorMapping;
      state: SplatEditorState;
    }[] = [];
    let requiredSplats = 0;
    for (const item of mapping) {
      const node = item.node;
      if (
        !(node instanceof SplatMesh) ||
        node.editorStateRenderMode !== "accumulator"
      ) {
        continue;
      }

      const state = node.getEditorState();
      if (!state) {
        continue;
      }

      stateMappings.push({ item, state });
      requiredSplats = Math.max(requiredSplats, item.base + item.count);
    }

    if (stateMappings.length === 0 || requiredSplats <= 0) {
      const wasEnabled = this.editorStateEnabled;
      this.editorStateEnabled = false;
      this.editorStateMappingKey = "";
      return wasEnabled;
    }

    const mappingKey = createEditorStateMappingKey(stateMappings);
    const allocated = this.ensureEditorStateTexture(requiredSplats);
    const fullCopy =
      allocated ||
      !this.editorStateEnabled ||
      this.editorStateMappingKey !== mappingKey;
    const dirtyRanges: SplatEditorStateDirtyRange[] = [];
    if (fullCopy) {
      this.editorStateData.fill(0);
    }

    let enabled = false;
    let colorsCopied = false;
    for (const { item, state } of stateMappings) {
      enabled = true;
      if (!colorsCopied) {
        this.editorStateSelectedColor.copy(state.selectedColor);
        this.editorStateLockedColor.copy(state.lockedColor);
        colorsCopied = true;
      }

      if (fullCopy) {
        const source = state.states.subarray(
          0,
          Math.min(item.count, state.states.length),
        );
        this.editorStateData.set(source, item.base);
        state.clearRenderDirtyRanges();
        continue;
      }

      for (const range of state.getRenderDirtyRanges()) {
        const start = Math.max(0, Math.floor(range.start));
        const end = Math.min(
          item.count,
          start + Math.max(0, Math.floor(range.count)),
        );
        if (start >= end) {
          continue;
        }
        this.editorStateData.set(
          state.states.subarray(start, end),
          item.base + start,
        );
        dirtyRanges.push({ start: item.base + start, count: end - start });
      }
      state.clearRenderDirtyRanges();
    }

    this.editorStateEnabled = enabled;
    this.editorStateMappingKey = mappingKey;
    if (
      this.editorStateTexture &&
      this.editorStateTexture.image.data !== this.editorStateData
    ) {
      this.editorStateTexture.image.data = this.editorStateData;
    }
    if (this.editorStateTexture) {
      if (fullCopy) {
        this.editorStateTexture.needsUpdate = true;
      } else if (dirtyRanges.length > 0) {
        const uploadSpans = createEditorStateUploadSpans(
          dirtyRanges,
          this.editorStateTexture.image.width,
          this.editorStateTexture.image.height,
          this.editorStateData.length,
        );
        if (
          !renderer ||
          uploadSpans.length === 0 ||
          uploadSpans.length > MAX_EDITOR_STATE_UPLOAD_SPANS ||
          !this.uploadEditorStateSpans(renderer, uploadSpans)
        ) {
          this.editorStateTexture.needsUpdate = true;
        }
      }
    }
    return enabled;
  }

  private ensureEditorStateTexture(maxSplats: number): boolean {
    const {
      width,
      height,
      depth,
      maxSplats: capacity,
    } = getTextureSize(Math.max(1, maxSplats));
    if (this.editorStateData.length === capacity && this.editorStateTexture) {
      return false;
    }

    if (this.editorStateTexture) {
      this.editorStateTexture.dispose();
      this.editorStateTexture = null;
    }
    this.editorStateData = new Uint8Array(capacity);
    this.editorStateTexture = new THREE.DataArrayTexture(
      this.editorStateData,
      width,
      height,
      depth,
    );
    this.editorStateTexture.format = THREE.RedIntegerFormat;
    this.editorStateTexture.type = THREE.UnsignedByteType;
    this.editorStateTexture.internalFormat = "R8UI";
    this.editorStateTexture.magFilter = THREE.NearestFilter;
    this.editorStateTexture.minFilter = THREE.NearestFilter;
    this.editorStateTexture.generateMipmaps = false;
    this.editorStateTexture.needsUpdate = true;
    return true;
  }

  private uploadEditorStateSpans(
    renderer: THREE.WebGLRenderer,
    uploadSpans: readonly EditorStateUploadSpan[],
  ): boolean {
    const texture = this.editorStateTexture;
    if (!texture || !renderer.properties.has(texture)) {
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

    const image = texture.image as EditorStateTextureImage;
    if (image.data !== this.editorStateData) {
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
        const data = this.editorStateData.subarray(
          span.start,
          span.start + span.count,
        );
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

  static emptyTexture = (() => {
    const { width, height, depth, maxSplats } = getTextureSize(1);
    const emptyArray = new Uint32Array(maxSplats * 4);
    const texture = new THREE.DataArrayTexture(
      emptyArray,
      width,
      height,
      depth,
    );
    texture.format = THREE.RGBAIntegerFormat;
    texture.type = THREE.UnsignedIntType;
    texture.internalFormat = "RGBA32UI";
    texture.needsUpdate = true;
    return texture;
  })();

  static emptyTextures = (() => {
    return [SplatAccumulator.emptyTexture, SplatAccumulator.emptyTexture];
  })();

  // Given an array of splatCounts (.numSplats for each
  // SplatGenerator/SplatMesh in the scene), compute a
  // "mapping layout" in the composite array of generated outputs.
  generateMapping(splatCounts: number[]): {
    maxSplats: number;
    mapping: { base: number; count: number }[];
  } {
    let maxSplats = 0;
    const mapping = splatCounts.map((numSplats) => {
      const base = maxSplats;
      // Generation happens in horizontal row chunks, so round up to full width
      const rounded = Math.ceil(numSplats / SPLAT_TEX_WIDTH) * SPLAT_TEX_WIDTH;
      maxSplats += rounded;
      return { base, count: numSplats };
    });
    return { maxSplats, mapping };
  }

  // Ensures our NewSplatAccumulator.target render target has enough space
  // to generate maxSplats total Gsplats, and reallocate if not large enough.
  ensureGenerate({ maxSplats }: { maxSplats: number }) {
    if (this.target && (maxSplats ?? 1) <= this.maxSplats) {
      return false;
    }
    this.dispose();

    // The packed Gsplats are stored in a 2D array texture of max size
    // 2048 x 2048 x 2048, one RGBA32UI pixel = 4 uint32 = one Gsplat
    const textureSize = getTextureSize(maxSplats ?? 1);
    const { width, height, depth } = textureSize;
    this.maxSplats = textureSize.maxSplats;
    this.target = new THREE.WebGLArrayRenderTarget(width, height, depth, {
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      format: THREE.RGBAIntegerFormat,
      type: THREE.UnsignedIntType,
    });
    this.target.scissorTest = true;

    if (this.extSplats) {
      const target2 = this.target.texture.clone();
      const target3 = this.target.texture.clone();
      target3.format = THREE.RGBAFormat;
      target3.type = THREE.UnsignedByteType;
      target3.internalFormat = "RGBA8";
      this.target.textures = [this.target.texture, target2, target3];
    } else {
      const target3 = this.target.texture.clone();
      target3.format = THREE.RGBAFormat;
      target3.type = THREE.UnsignedByteType;
      target3.internalFormat = "RGBA8";
      this.target.textures = [this.target.texture, target3];
    }

    return true;
  }

  private saveRenderState(renderer: THREE.WebGLRenderer) {
    return {
      target: renderer.getRenderTarget(),
      xrEnabled: renderer.xr.enabled,
      autoClear: renderer.autoClear,
    };
  }

  private resetRenderState(
    renderer: THREE.WebGLRenderer,
    state: {
      target: THREE.WebGLRenderTarget | null;
      xrEnabled: boolean;
      autoClear: boolean;
    },
  ) {
    renderer.setRenderTarget(state.target);
    renderer.xr.enabled = state.xrEnabled;
    renderer.autoClear = state.autoClear;
  }

  // Get a program and THREE.RawShaderMaterial for a given GsplatGenerator,
  // generating it if necessary and caching the result.
  prepareProgramMaterial(
    generator?: GsplatGenerator,
    covGenerator?: CovSplatGenerator,
  ) {
    const theGenerator = generator ?? covGenerator;
    if (!theGenerator) {
      throw new Error("Either generator or covGenerator must be provided");
    }

    let program = SplatAccumulator.generatorProgram.get(theGenerator);
    if (!program) {
      const graph = dynoBlock(
        { index: "int" },
        {},
        ({ index }, _outputs, { roots }) => {
          if (generator) {
            generator.inputs.index = index;
          }
          if (covGenerator) {
            covGenerator.inputs.index = index;
          }

          if (this.extSplats) {
            if (!this.covSplats) {
              if (generator) {
                const output = outputExtendedSplat(generator.outputs.gsplat);
                roots.push(output);
              } else {
                throw new Error("Generator must be provided");
              }
            } else {
              if (covGenerator) {
                const output = outputExtCovSplat(covGenerator.outputs.covsplat);
                roots.push(output);
              } else if (generator) {
                const covsplat = gsplatToCovSplat(generator.outputs.gsplat);
                const output = outputExtCovSplat(covsplat);
                roots.push(output);
              } else {
                throw new Error("Generator must be provided");
              }
            }
          } else {
            if (!this.covSplats) {
              if (generator) {
                const centerSubView = sub(
                  splitGsplat(generator.outputs.gsplat).outputs.center,
                  SplatAccumulator.viewCenterUniform,
                );
                // Use expanded LoD opacity encoding
                const halfAlpha = mul(
                  splitGsplat(generator.outputs.gsplat).outputs.opacity,
                  dynoConst("float", 0.5),
                );
                const gsplat = combineGsplat({
                  gsplat: generator.outputs.gsplat,
                  center: centerSubView,
                  opacity: halfAlpha,
                });
                const output = outputPackedSplat(
                  gsplat,
                  dynoConst("vec4", [0, 1, LN_SCALE_MIN, LN_SCALE_MAX]),
                );
                roots.push(output);
              } else {
                throw new Error("Generator must be provided");
              }
            } else {
              let covsplat: DynoVal<typeof CovSplat>;
              if (covGenerator) {
                covsplat = covGenerator.outputs.covsplat;
              } else if (generator) {
                covsplat = gsplatToCovSplat(generator.outputs.gsplat);
              } else {
                throw new Error("Generator must be provided");
              }
              const centerSubView = sub(
                splitCovSplat(covsplat).outputs.center,
                SplatAccumulator.viewCenterUniform,
              );
              const halfAlpha = mul(
                splitCovSplat(covsplat).outputs.opacity,
                dynoConst("float", 0.5),
              );
              covsplat = combineCovSplat({
                covsplat,
                center: centerSubView,
                opacity: halfAlpha,
              });
              const output = outputCovSplat(
                covsplat,
                dynoConst("vec4", [0, 1, LN_SCALE_MIN, LN_SCALE_MAX]),
              );
              roots.push(output);
            }
            if (!generator) {
              throw new Error("Generator must be provided");
            }
          }
          if (generator) {
            const outputDepth = outputSplatDepth(
              generator.outputs.gsplat,
              SplatAccumulator.viewCenterUniform,
              SplatAccumulator.viewDirUniform,
              SplatAccumulator.sortRadialUniform,
            );
            roots.push(outputDepth);
          }
          if (covGenerator) {
            const outputDepth = outputCovSplatDepth(
              covGenerator.outputs.covsplat,
              SplatAccumulator.viewCenterUniform,
              SplatAccumulator.viewDirUniform,
              SplatAccumulator.sortRadialUniform,
            );
            roots.push(outputDepth);
          }
          return undefined;
        },
      );
      program = new DynoProgram({
        graph,
        inputs: { index: "_index" },
        outputs: {},
        template: this.extSplats
          ? SplatAccumulator.programExtTemplate
          : SplatAccumulator.programTemplate,
        // consoleLog: true,
      });

      SplatAccumulator.generatorProgram.set(theGenerator, program);
    }
    Object.assign(program.uniforms, {
      targetLayer: { value: 0 },
      targetBase: { value: 0 },
      targetCount: { value: 0 },
    });

    const material = program.prepareMaterial();
    SplatAccumulator.fullScreenQuad.material = material;
    return { program, material };
  }

  static programExtTemplate = new DynoProgramTemplate(
    getShaders().computeUvec4x2Vec4Template,
  );
  static programTemplate = new DynoProgramTemplate(
    getShaders().computeUvec4Vec4Template,
  );
  static generatorProgram = new WeakMap<
    GsplatGenerator | CovSplatGenerator,
    DynoProgram
  >();
  static fullScreenQuad = new FullScreenQuad(
    new THREE.RawShaderMaterial({ visible: false }),
  );

  generate({
    generator,
    covGenerator,
    base,
    count,
    renderer,
  }: {
    generator?: GsplatGenerator;
    covGenerator?: CovSplatGenerator;
    base: number;
    count: number;
    renderer: THREE.WebGLRenderer;
  }) {
    if (!this.target) {
      throw new Error("Target must be initialized with ensureGenerate");
    }
    if (base + count > this.maxSplats) {
      throw new Error("Base + count exceeds maxSplats");
    }

    const { program, material } = this.prepareProgramMaterial(
      generator,
      covGenerator,
    );
    program.update();

    const renderState = this.saveRenderState(renderer);

    // Generate the Gsplats in "layer" chunks, in horizontal row ranges,
    // that cover the total count of Gsplats.
    const nextBase =
      Math.ceil((base + count) / SPLAT_TEX_WIDTH) * SPLAT_TEX_WIDTH;
    const layerSize = SPLAT_TEX_WIDTH * SPLAT_TEX_HEIGHT;
    material.uniforms.targetBase.value = base;
    material.uniforms.targetCount.value = count;

    // Keep generating layers until we've reached the next generation's base
    while (base < nextBase) {
      const layer = Math.floor(base / layerSize);
      material.uniforms.targetLayer.value = layer;

      const layerBase = layer * layerSize;
      const layerYStart = Math.floor((base - layerBase) / SPLAT_TEX_WIDTH);
      const layerYEnd = Math.min(
        SPLAT_TEX_HEIGHT,
        Math.ceil((nextBase - layerBase) / SPLAT_TEX_WIDTH),
      );

      // Render the desired portion of the layer
      this.target.scissor.set(
        0,
        layerYStart,
        SPLAT_TEX_WIDTH,
        layerYEnd - layerYStart,
      );
      renderer.setRenderTarget(this.target, layer);
      renderer.xr.enabled = false;
      renderer.autoClear = false;
      SplatAccumulator.fullScreenQuad.render(renderer);

      base += SPLAT_TEX_WIDTH * (layerYEnd - layerYStart);
    }

    this.resetRenderState(renderer, renderState);
    return { nextBase };
  }

  prepareGenerate({
    renderer,
    scene,
    time,
    camera,
    sortRadial,
    renderSize,
    previous,
    lodInstances,
  }: {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    time: number;
    camera: THREE.Camera;
    sortRadial: boolean;
    renderSize: THREE.Vector2;
    previous: SplatAccumulator;
    lodInstances?: Map<
      SplatMesh,
      { numSplats: number; texture: THREE.DataTexture }
    >;
  }) {
    this.viewToWorld.copy(camera.matrixWorld);
    camera.getWorldPosition(this.viewOrigin);
    camera.getWorldDirection(this.viewDirection);
    SplatAccumulator.viewCenterUniform.value.copy(this.viewOrigin);
    SplatAccumulator.viewDirUniform.value.copy(this.viewDirection);
    SplatAccumulator.sortRadialUniform.value = sortRadial;

    this.time = time;
    this.deltaTime = time - previous.time;

    const allGenerators: SplatGenerator[] = [];
    scene.traverse((node) => {
      if (node instanceof SplatGenerator) {
        if (!camera.layers || camera.layers.test(node.layers)) {
          allGenerators.push(node);
        }
      }
    });

    const globalEditsSet = new Set<SplatEdit>();
    scene.traverseVisible((node) => {
      if (node instanceof SplatEdit) {
        let ancestor = node.parent;
        while (ancestor != null && !(ancestor instanceof SplatMesh)) {
          ancestor = ancestor.parent;
        }
        if (ancestor == null) {
          // Not part of a SplatMesh so it's a global edit
          globalEditsSet.add(node);
        }
      }
    });
    const globalEdits = Array.from(globalEditsSet);

    for (const object of allGenerators) {
      try {
        object.frameUpdate?.({
          renderer,
          object,
          time: this.time,
          deltaTime: this.deltaTime,
          viewToWorld: this.viewToWorld,
          camera,
          renderSize,
          globalEdits,
          lodIndices:
            lodInstances && object instanceof SplatMesh
              ? lodInstances.get(object)
              : undefined,
        });
      } catch (error) {
        console.error("frameUpdate error", error);
        object.generator = undefined;
        object.covGenerator = undefined;
        object.generatorError = error;
      }
    }

    const visibleGenerators: SplatGenerator[] = [];
    scene.traverseVisible((node) => {
      if (node instanceof SplatGenerator) {
        if (!camera.layers || camera.layers.test(node.layers)) {
          visibleGenerators.push(node);
        }
      }
    });

    const splatCounts = visibleGenerators.map(
      (generator) => generator.numSplats,
    );
    const { maxSplats, mapping: baseCounts } =
      this.generateMapping(splatCounts);

    const previousMappings = previous.mapping.reduce((mappings, mapping) => {
      mappings.set(mapping.node, mapping);
      return mappings;
    }, new Map<SplatGenerator, GeneratorMapping>());

    this.mapping = [];
    this.numSplats = 0;

    baseCounts.forEach(({ base, count }, index) => {
      const node = visibleGenerators[index];
      const previousNode = previousMappings.get(node);
      if (previousNode && previousNode.count !== node.numSplats) {
        node.updateMappingVersion();
      }

      const { generator, covGenerator } = node;
      if ((generator || covGenerator) && count > 0) {
        const { version, sortVersion, styleVersion, mappingVersion } = node;
        this.mapping.push({
          node,
          generator,
          covGenerator,
          version,
          sortVersion,
          styleVersion,
          mappingVersion,
          base,
          count,
        });
        this.numSplats = Math.max(this.numSplats, base + count);
      }
    });
    const { splatsUpdated, sortUpdated, styleUpdated, mappingUpdated } =
      previous.checkVersions(this.mapping);
    this.version = previous.version + (splatsUpdated ? 1 : 0);
    this.sortVersion = previous.sortVersion + (sortUpdated ? 1 : 0);
    this.styleVersion = previous.styleVersion + (styleUpdated ? 1 : 0);
    this.mappingVersion = previous.mappingVersion + (mappingUpdated ? 1 : 0);

    return {
      sameMapping: !mappingUpdated,
      version: this.version,
      sortVersion: this.sortVersion,
      styleVersion: this.styleVersion,
      mappingVersion: this.mappingVersion,
      styleUpdated,
      visibleGenerators,
      generate: () => {
        this.ensureGenerate({ maxSplats });

        for (const { node, base, count } of this.mapping) {
          const { generator, covGenerator } = node;
          if ((generator || covGenerator) && count > 0) {
            this.generate({ generator, covGenerator, base, count, renderer });
          }
        }
        this.updateEditorStateTexture({ renderer });
      },
      readback: async () => {
        const textures = this.getTextures();
        if (this.readbackSplats.length === 0) {
          this.readbackSplats = [
            new DynoUsampler2DArray({ value: textures[0], key: "extSplats" }),
            new DynoUsampler2DArray({ value: textures[1], key: "extSplats" }),
          ];
        }
        this.readbackSplats[0].value = textures[0];
        this.readbackSplats[1].value = textures[1];

        if (!this.readback) {
          this.readback = new Readback({ renderer });
        }
        const readback = this.readback;
        const words = this.extSplats ? 8 : 4;
        const array = readback.ensureBuffer(
          this.numSplats * words,
          new Uint32Array(0),
        );

        const reader = dynoBlock(
          { index: "int" },
          { rgba8: "vec4" },
          ({ index }) => {
            const rgba8 = new Dyno({
              inTypes: {
                index: "int",
                extSplats1: "usampler2DArray",
                extSplats2: "usampler2DArray",
              },
              outTypes: { rgba8: "vec4" },
              inputs: {
                index,
                extSplats1: this.readbackSplats[0],
                extSplats2: this.readbackSplats[1],
              },
              statements: ({ inputs, outputs }) => {
                if (this.extSplats) {
                  return unindentLines(`
                    int indexDiv8 = ${inputs.index} >> 3;
                    ivec3 coord = splatTexCoord(indexDiv8);
                    uvec4 packedData;
                    if ((${inputs.index} & 4) == 0) {
                      packedData = texelFetch(${inputs.extSplats1}, coord, 0);
                    } else {
                      packedData = texelFetch(${inputs.extSplats2}, coord, 0);
                    }

                    int indexMod4 = ${inputs.index} & 3;
                    uint data = (indexMod4 == 0) ? packedData.x
                      : (indexMod4 == 1) ? packedData.y
                      : (indexMod4 == 2) ? packedData.z
                      : packedData.w;
                    ${outputs.rgba8} = uintToVec4(data);
                  `);
                }
                return unindentLines(`
                  int indexDiv4 = ${inputs.index} >> 2;
                  ivec3 coord = splatTexCoord(indexDiv4);
                  uvec4 packedData = texelFetch(${inputs.extSplats1}, coord, 0);

                  int indexMod4 = ${inputs.index} & 3;
                  uint data = (indexMod4 == 0) ? packedData.x
                    : (indexMod4 == 1) ? packedData.y
                    : (indexMod4 == 2) ? packedData.z
                    : packedData.w;
                  ${outputs.rgba8} = uintToVec4(data);
                `);
              },
            }).outputs.rgba8;
            return { rgba8 };
          },
        );

        return await readback.renderReadback({
          reader,
          count: this.numSplats * words,
          renderer,
          readback: array,
        });
      },
    };
  }

  // Check if this accumulator has exactly the same generator mapping as
  // the previous one. If so, we can reuse the Gsplat sort order.
  checkVersions(otherMapping: GeneratorMapping[]) {
    if (this.mapping.length !== otherMapping.length) {
      return {
        splatsUpdated: true,
        sortUpdated: true,
        styleUpdated: true,
        mappingUpdated: true,
      };
    }
    const mappingUpdated = this.mapping.some((item, i) => {
      const other = otherMapping[i];
      return (
        item.node !== other.node ||
        item.base !== other.base ||
        item.count !== other.count ||
        item.mappingVersion !== other.mappingVersion
      );
    });
    if (mappingUpdated) {
      return {
        splatsUpdated: true,
        sortUpdated: true,
        styleUpdated: true,
        mappingUpdated: true,
      };
    }
    const splatsUpdated = this.mapping.some((item, i) => {
      return item.version !== otherMapping[i].version;
    });
    const sortUpdated = this.mapping.some((item, i) => {
      return item.sortVersion !== otherMapping[i].sortVersion;
    });
    const styleUpdated = this.mapping.some((item, i) => {
      return item.styleVersion !== otherMapping[i].styleVersion;
    });
    return { splatsUpdated, sortUpdated, styleUpdated, mappingUpdated };
  }
}

function createEditorStateMappingKey(
  stateMappings: readonly {
    item: GeneratorMapping;
    state: SplatEditorState;
  }[],
): string {
  return stateMappings
    .map(({ item, state }) =>
      [
        item.node.id,
        item.base,
        item.count,
        state.maxSplats,
        state.numSplats,
      ].join(":"),
    )
    .join("|");
}

function createEditorStateUploadSpans(
  ranges: readonly SplatEditorStateDirtyRange[],
  width: number,
  height: number,
  maxSplats: number,
): EditorStateUploadSpan[] {
  if (width <= 0 || height <= 0 || maxSplats <= 0) {
    return [];
  }

  const splatsPerLayer = width * height;
  const spans: EditorStateUploadSpan[] = [];
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

  const merged: EditorStateUploadSpan[] = [];
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
