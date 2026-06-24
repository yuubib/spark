import assert from "node:assert";
import { test } from "node:test";

import * as THREE from "three";

import { SplatAccumulator, SplatGenerator } from "../dist/spark.module.js";

// Matches SPLAT_TEX_WIDTH in src/defines.ts. The accumulator lays generators
// out in horizontal row chunks rounded up to a full texture width.
const SPLAT_TEX_WIDTH = 2048;

function makeGen(numSplats: number): SplatGenerator {
  const gen = new SplatGenerator({ numSplats });
  // A truthy generator is all the mapping push condition needs; the generate()
  // closure (which would actually use it) is never invoked by this test.
  (gen as { generator?: unknown }).generator = {};
  return gen;
}

function layout(
  accumulator: SplatAccumulator,
  scene: THREE.Scene,
  camera: THREE.Camera,
  previous: SplatAccumulator,
) {
  accumulator.prepareGenerate({
    renderer: {} as unknown as THREE.WebGLRenderer,
    scene,
    time: 0,
    camera,
    sortRadial: false,
    renderSize: new THREE.Vector2(100, 100),
    previous,
  });
}

test("prepareGenerate builds row-aligned base/count mapping over visible generators", () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  // Includes a zero-count generator (c): it advances no stride and is not
  // pushed, but must not break base accounting for the generator after it.
  const a = makeGen(100);
  const b = makeGen(3000);
  const c = makeGen(0);
  const d = makeGen(50);
  scene.add(a, b, c, d);

  const previous = new SplatAccumulator();
  const accumulator = new SplatAccumulator();
  layout(accumulator, scene, camera, previous);

  const W = SPLAT_TEX_WIDTH;
  const baseA = 0;
  const baseB = Math.ceil(100 / W) * W; // 2048
  const afterB = baseB + Math.ceil(3000 / W) * W; // 2048 + 4096 = 6144
  const afterC = afterB + Math.ceil(0 / W) * W; // c adds 0
  const baseD = afterC; // 6144

  const mapping = accumulator.mapping;
  assert.strictEqual(mapping.length, 3, "zero-count generator is not pushed");
  assert.deepStrictEqual(
    mapping.map((entry) => entry.count),
    [100, 3000, 50],
  );
  assert.deepStrictEqual(
    mapping.map((entry) => entry.base),
    [baseA, baseB, baseD],
  );
  assert.strictEqual(accumulator.numSplats, baseD + 50);
});

test("prepareGenerate reused scratch yields identical mapping across frames", () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(makeGen(100), makeGen(5000));

  const previous = new SplatAccumulator();
  const accumulator = new SplatAccumulator();

  layout(accumulator, scene, camera, previous);
  const first = accumulator.mapping.map((entry) => ({
    base: entry.base,
    count: entry.count,
  }));
  const firstNumSplats = accumulator.numSplats;

  // Re-run on the SAME accumulator instance: this reuses the allGenerators /
  // globalEdits / previousMappings scratch. Output must be byte-identical,
  // proving the reused scratch is cleared and does not leak across frames.
  layout(accumulator, scene, camera, previous);
  const second = accumulator.mapping.map((entry) => ({
    base: entry.base,
    count: entry.count,
  }));

  assert.deepStrictEqual(second, first);
  assert.strictEqual(accumulator.numSplats, firstNumSplats);
});
