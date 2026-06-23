import assert from "node:assert";

import * as THREE from "three";

import { SplatMesh } from "../dist/spark.module.js";
import { SplatGenerator } from "../src/SplatGenerator.js";

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
