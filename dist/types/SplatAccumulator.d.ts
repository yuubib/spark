import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { Readback } from './Readback';
import { CovSplatGenerator, GsplatGenerator, SplatGenerator } from './SplatGenerator';
import { SplatMesh } from './SplatMesh';
import { DynoBool, DynoProgram, DynoProgramTemplate, DynoUsampler2DArray, DynoVec3 } from './dyno';
import * as THREE from "three";
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
export declare class SplatAccumulator {
    time: number;
    deltaTime: number;
    viewToWorld: THREE.Matrix4;
    viewOrigin: THREE.Vector3;
    viewDirection: THREE.Vector3;
    static viewCenterUniform: DynoVec3<THREE.Vector3, "value">;
    static viewDirUniform: DynoVec3<THREE.Vector3, "value">;
    static sortRadialUniform: DynoBool<string>;
    maxSplats: number;
    numSplats: number;
    target: THREE.WebGLArrayRenderTarget | null;
    mapping: GeneratorMapping[];
    version: number;
    sortVersion: number;
    mappingVersion: number;
    styleVersion: number;
    extSplats: boolean;
    covSplats: boolean;
    readback: Readback | null;
    readbackSplats: DynoUsampler2DArray<"extSplats", THREE.DataArrayTexture>[];
    editorStateData: Uint8Array<ArrayBuffer>;
    editorStateTexture: THREE.DataArrayTexture | null;
    editorStateEnabled: boolean;
    editorStateSelectedColor: THREE.Vector4;
    editorStateLockedColor: THREE.Vector4;
    private editorStateMappingKey;
    constructor({ extSplats, covSplats, }?: {
        extSplats?: boolean;
        covSplats?: boolean;
    });
    dispose(): void;
    getTextures(): THREE.DataArrayTexture[];
    getEditorStateTexture(): THREE.DataArrayTexture;
    updateEditorStateTexture({ mapping, renderer, }?: {
        mapping?: readonly GeneratorMapping[];
        renderer?: THREE.WebGLRenderer;
    }): boolean;
    private ensureEditorStateTexture;
    private uploadEditorStateSpans;
    static emptyTexture: THREE.DataArrayTexture;
    static emptyTextures: THREE.DataArrayTexture[];
    generateMapping(splatCounts: number[]): {
        maxSplats: number;
        mapping: {
            base: number;
            count: number;
        }[];
    };
    ensureGenerate({ maxSplats }: {
        maxSplats: number;
    }): boolean;
    private saveRenderState;
    private resetRenderState;
    prepareProgramMaterial(generator?: GsplatGenerator, covGenerator?: CovSplatGenerator): {
        program: DynoProgram;
        material: THREE.RawShaderMaterial;
    };
    static programExtTemplate: DynoProgramTemplate;
    static programTemplate: DynoProgramTemplate;
    static generatorProgram: WeakMap<GsplatGenerator | CovSplatGenerator, DynoProgram>;
    static fullScreenQuad: FullScreenQuad;
    generate({ generator, covGenerator, base, count, renderer, }: {
        generator?: GsplatGenerator;
        covGenerator?: CovSplatGenerator;
        base: number;
        count: number;
        renderer: THREE.WebGLRenderer;
    }): {
        nextBase: number;
    };
    prepareGenerate({ renderer, scene, time, camera, sortRadial, renderSize, previous, lodInstances, }: {
        renderer: THREE.WebGLRenderer;
        scene: THREE.Scene;
        time: number;
        camera: THREE.Camera;
        sortRadial: boolean;
        renderSize: THREE.Vector2;
        previous: SplatAccumulator;
        lodInstances?: Map<SplatMesh, {
            numSplats: number;
            texture: THREE.DataTexture;
        }>;
    }): {
        sameMapping: boolean;
        version: number;
        sortVersion: number;
        styleVersion: number;
        mappingVersion: number;
        styleUpdated: boolean;
        visibleGenerators: SplatGenerator[];
        generate: () => void;
        readback: () => Promise<Uint32Array<ArrayBuffer>>;
    };
    checkVersions(otherMapping: GeneratorMapping[]): {
        splatsUpdated: boolean;
        sortUpdated: boolean;
        styleUpdated: boolean;
        mappingUpdated: boolean;
    };
}
