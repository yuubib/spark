import assert from "node:assert";

import * as THREE from "three";

import { SplatMesh } from "../dist/spark.module.js";
import {
  CovSplatTransformer,
  SplatGenerator,
  SplatTransformer,
} from "../src/SplatGenerator.js";

{
  const generator = new SplatGenerator({});

  assert.strictEqual(generator.version, 0);
  assert.strictEqual(generator.sortVersion, 0);
  assert.strictEqual(generator.styleVersion, 0);
  assert.strictEqual(generator.mappingVersion, 0);

  generator.updateStyleVersion();
  assert.strictEqual(generator.version, 0);
  assert.strictEqual(generator.sortVersion, 0);
  assert.strictEqual(generator.styleVersion, 1);
  assert.strictEqual(generator.mappingVersion, 0);

  generator.updateRenderVersion();
  assert.strictEqual(generator.version, 1);
  assert.strictEqual(generator.sortVersion, 0);
  assert.strictEqual(generator.styleVersion, 1);
  assert.strictEqual(generator.mappingVersion, 0);

  generator.updateVersion();
  assert.strictEqual(generator.version, 2);
  assert.strictEqual(generator.sortVersion, 1);
  assert.strictEqual(generator.styleVersion, 1);
  assert.strictEqual(generator.mappingVersion, 0);

  generator.updateMappingVersion();
  assert.strictEqual(generator.version, 3);
  assert.strictEqual(generator.sortVersion, 2);
  assert.strictEqual(generator.styleVersion, 1);
  assert.strictEqual(generator.mappingVersion, 1);
}

{
  const transformer = new SplatTransformer();
  const position = new THREE.Vector3(1, 2, 3);
  const quaternion = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI / 4,
  );
  const scale = new THREE.Vector3(2, 2, 2);
  const transform = new THREE.Matrix4().compose(position, quaternion, scale);

  assert.strictEqual(transformer.updateFromMatrix(transform), true);
  assert.strictEqual(transformer.scale.value, 2);
  assert.deepStrictEqual(transformer.translate.value.toArray(), [1, 2, 3]);
  assert(transformer.rotate.value.angleTo(quaternion) < 1e-12);
  assert.strictEqual(transformer.updateFromMatrix(transform), false);

  const moved = transform.clone().setPosition(4, 5, 6);
  assert.strictEqual(transformer.updateFromMatrix(moved), true);
  assert.deepStrictEqual(transformer.translate.value.toArray(), [4, 5, 6]);
}

{
  const transformer = new CovSplatTransformer();
  const transform = new THREE.Matrix4().makeTranslation(1, 2, 3);

  assert.strictEqual(transformer.updateFromMatrix(transform), true);
  assert.deepStrictEqual(transformer.offset.value.toArray(), [1, 2, 3]);
  assert.strictEqual(transformer.updateFromMatrix(transform), false);

  const moved = transform.clone().setPosition(4, 5, 6);
  assert.strictEqual(transformer.updateFromMatrix(moved), true);
  assert.deepStrictEqual(transformer.offset.value.toArray(), [4, 5, 6]);
}

function updateMesh(mesh: SplatMesh, viewToWorld = new THREE.Matrix4()): void {
  mesh.update({
    renderer: {} as THREE.WebGLRenderer,
    object: mesh,
    time: 0,
    deltaTime: 0,
    viewToWorld,
    globalEdits: [],
  });
}

await SplatMesh.staticInitialized;

{
  const mesh = new SplatMesh();
  await mesh.initialized;

  updateMesh(mesh);
  const version = mesh.version;
  const sortVersion = mesh.sortVersion;

  mesh.updateGeneratorRenderOnly();
  updateMesh(mesh);
  assert.strictEqual(mesh.version, version + 1);
  assert.strictEqual(mesh.sortVersion, sortVersion);

  mesh.updateGenerator();
  mesh.updateGeneratorRenderOnly();
  updateMesh(mesh);
  assert.strictEqual(mesh.sortVersion, sortVersion + 1);

  mesh.dispose();
}

console.log("Splat generator version tests passed");
