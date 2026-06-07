import * as THREE from "three";

import { injectSplatDefines } from "./shaderIncludes";
import computeUvec4Template from "./shaders/computeUvec4.glsl";
import computeUvec4Vec4Template from "./shaders/computeUvec4_Vec4.glsl";
import computeUvec4x2Vec4Template from "./shaders/computeUvec4x2_Vec4.glsl";
import computeVec4Template from "./shaders/computeVec4.glsl";
import oldSplatFragment from "./shaders/oldSplatFragment.glsl";
import oldSplatVertex from "./shaders/oldSplatVertex.glsl";
import splatDefines from "./shaders/splatDefines.glsl";
import splatFragment from "./shaders/splatFragment.glsl";
import splatVertex from "./shaders/splatVertex.glsl";

let shaders: Record<string, string> | null = null;

export function getShaders(): Record<string, string> {
  if (!shaders) {
    // @ts-ignore
    THREE.ShaderChunk.splatDefines = splatDefines;
    shaders = {
      oldSplatVertex: injectSplatDefines(oldSplatVertex, splatDefines),
      oldSplatFragment: injectSplatDefines(oldSplatFragment, splatDefines),
      splatVertex: injectSplatDefines(splatVertex, splatDefines),
      splatFragment: injectSplatDefines(splatFragment, splatDefines),
      computeVec4Template: injectSplatDefines(
        computeVec4Template,
        splatDefines,
      ),
      computeUvec4Vec4Template: injectSplatDefines(
        computeUvec4Vec4Template,
        splatDefines,
      ),
      computeUvec4x2Vec4Template: injectSplatDefines(
        computeUvec4x2Vec4Template,
        splatDefines,
      ),
      computeUvec4Template: injectSplatDefines(
        computeUvec4Template,
        splatDefines,
      ),
    };
  }
  return shaders;
}
