import assert from "node:assert";

import * as THREE from "three";

import {
  ExtSplats,
  PackedSplats,
  PlyReader,
  SPLAT_EDITOR_STATE_DELETED,
  SPLAT_EDITOR_STATE_LOCKED,
  SplatMesh,
} from "../dist/spark.module.js";

await SplatMesh.staticInitialized;

const pushSplat = (
  splats: { pushSplat: SplatMesh["pushSplat"] },
  color: THREE.Color,
) => {
  splats.pushSplat(
    new THREE.Vector3(),
    new THREE.Vector3(0.1, 0.1, 0.1),
    new THREE.Quaternion(),
    1,
    color,
  );
};

const assertClose = (actual: number, expected: number, epsilon = 1 / 255) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} is not within ${epsilon} of ${expected}`,
  );
};

const makeDcPly = (rows: readonly (readonly number[])[]) => {
  const header = [
    "ply",
    "format binary_little_endian 1.0",
    `element vertex ${rows.length}`,
    "property float x",
    "property float y",
    "property float z",
    "property float f_dc_0",
    "property float f_dc_1",
    "property float f_dc_2",
    "end_header",
    "",
  ].join("\n");
  const headerBytes = new TextEncoder().encode(header);
  const body = new ArrayBuffer(rows.length * 6 * 4);
  const view = new DataView(body);
  let offset = 0;
  for (const row of rows) {
    for (const value of row) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
  }
  const bytes = new Uint8Array(headerBytes.length + body.byteLength);
  bytes.set(headerBytes);
  bytes.set(new Uint8Array(body), headerBytes.length);
  return bytes;
};

{
  const ply = new PlyReader({
    fileBytes: makeDcPly([
      [0, 0, 0, 0, 1, -1],
      [0, 0, 0, 10, -10, 0.5],
    ]),
  });
  await ply.parseHeader();
  const rgb = ply.readColorMatchRgb();
  assert.ok(rgb);
  assert.strictEqual(rgb.length, 6);
  assertClose(rgb[0], 0.5, 1e-6);
  assertClose(rgb[1], 0.5 + 0.28209479177387814, 1e-6);
  assertClose(rgb[2], 0.5 - 0.28209479177387814, 1e-6);
  assertClose(rgb[3], 1, 1e-6);
  assertClose(rgb[4], 0, 1e-6);
  assertClose(rgb[5], 0.5 + 0.5 * 0.28209479177387814, 1e-6);
}

{
  const ext = new ExtSplats();
  pushSplat(ext, new THREE.Color(0.25, 0.5, 0.75));
  const color = { r: 0, g: 0, b: 0 };
  assert.strictEqual(ext.getSplatColorRaw(0, color), true);
  assertClose(color.r, 0.25, 1e-3);
  assertClose(color.g, 0.5, 1e-3);
  assertClose(color.b, 0.75, 1e-3);
  assert.strictEqual(ext.getSplatColorRaw(1, color), false);
}

const mesh = new SplatMesh({
  constructSplats: (splats) => {
    pushSplat(splats, new THREE.Color(0.8, 0.1, 0.1));
    pushSplat(splats, new THREE.Color(0.78, 0.12, 0.11));
    pushSplat(splats, new THREE.Color(0.2, 0.8, 0.2));
    pushSplat(splats, new THREE.Color(0.79, 0.1, 0.13));
    pushSplat(splats, new THREE.Color(0.81, 0.08, 0.1));
  },
});
await mesh.initialized;

assert.strictEqual(mesh.hasIndexedSplatColors(), true);
const rawColor = { r: 0, g: 0, b: 0 };
assert.strictEqual(mesh.getSplatColorRaw(0, rawColor), true);
assertClose(rawColor.r, 0.8);
assertClose(rawColor.g, 0.1);
assertClose(rawColor.b, 0.1);

mesh.setSplatStateBits(3, SPLAT_EDITOR_STATE_LOCKED);
mesh.setSplatStateBits(4, SPLAT_EDITOR_STATE_DELETED);

const source = mesh.splats;
assert.ok(source);
source.forEachSplat = () => {
  throw new Error("indexed color matching should not fully decode splats");
};

let indexedColorReads = 0;
const originalIndexedColor = source.getSplatColorMatchRaw?.bind(source);
assert.ok(originalIndexedColor);
source.getSplatColorMatchRaw = (index, target) => {
  indexedColorReads += 1;
  return originalIndexedColor(index, target);
};
let bulkColorIterations = 0;
let bulkColorReads = 0;
const originalBulkColorMatch = source.forEachSplatColorMatchRaw?.bind(source);
assert.ok(originalBulkColorMatch);
source.forEachSplatColorMatchRaw = (callback) => {
  bulkColorIterations += 1;
  originalBulkColorMatch((index, r, g, b) => {
    bulkColorReads += 1;
    return callback(index, r, g, b);
  });
};

const allMatches = mesh.findSplatColorMatches({
  seedIndex: 0,
  threshold: 0.035,
});

assert.deepStrictEqual([...(allMatches?.indices ?? [])], [0, 1, 3, 4]);
assert.strictEqual(allMatches?.threshold, 0.035);
assert.strictEqual(allMatches?.tested, 5);
assert.strictEqual(allMatches?.matched, 4);
assert.strictEqual(allMatches?.stateRejected, 0);
assert.strictEqual(allMatches?.earlyExit, false);
assert.strictEqual(allMatches?.indices.buffer.byteLength, 5 * 4);
assert.strictEqual(indexedColorReads, 1);
assert.strictEqual(bulkColorIterations, 1);
assert.strictEqual(bulkColorReads, 5);

const originalGetEditorState = mesh.getEditorState.bind(mesh);
mesh.getEditorState = () => {
  throw new Error("mode all should not read editor state");
};
const allMatchesWithoutState = mesh.findSplatColorMatches({
  seedIndex: 0,
  threshold: 0.035,
  mode: "all",
});
assert.deepStrictEqual(
  [...(allMatchesWithoutState?.indices ?? [])],
  [0, 1, 3, 4],
);
mesh.getEditorState = originalGetEditorState;

let filteredModeReadEditorState = false;
mesh.getEditorState = () => {
  filteredModeReadEditorState = true;
  return originalGetEditorState();
};
const editableMatches = mesh.findSplatColorMatches({
  seedIndex: 0,
  threshold: 0.035,
  mode: "editable",
});
mesh.getEditorState = originalGetEditorState;

assert.strictEqual(filteredModeReadEditorState, true);
assert.deepStrictEqual([...(editableMatches?.indices ?? [])], [0, 1]);
assert.strictEqual(editableMatches?.tested, 3);
assert.strictEqual(editableMatches?.stateRejected, 2);

indexedColorReads = 0;
bulkColorIterations = 0;
bulkColorReads = 0;
const capped = mesh.findSplatColorMatches({
  seedIndex: 0,
  threshold: 1,
  maxMatches: 1,
});

assert.deepStrictEqual([...(capped?.indices ?? [])], [0]);
assert.strictEqual(capped?.threshold, 1);
assert.strictEqual(capped?.earlyExit, true);
assert.strictEqual(capped?.indices.buffer.byteLength, 1 * 4);
assert.strictEqual(indexedColorReads, 1);
assert.strictEqual(bulkColorIterations, 1);
assert.strictEqual(bulkColorReads, 1);

const clamped = mesh.findSplatColorMatches({
  seedIndex: 0,
  threshold: 2,
  mode: "editable",
});

assert.deepStrictEqual([...(clamped?.indices ?? [])], [0, 1, 2]);
assert.strictEqual(clamped?.threshold, 1);

const nonFinite = mesh.findSplatColorMatches({
  seedIndex: 0,
  threshold: Number.POSITIVE_INFINITY,
  mode: "editable",
});

assert.deepStrictEqual([...(nonFinite?.indices ?? [])], [0]);
assert.strictEqual(nonFinite?.threshold, 0);

const selection = mesh.selectSplatStateColorMatches({
  seedIndex: 0,
  threshold: 0.035,
  mode: "all",
  operation: "set",
  mutationOptions: {
    recordChanges: true,
    changeFormat: "packed",
  },
});

assert.deepStrictEqual([...(selection?.match.indices ?? [])], [0, 1, 3, 4]);
assert.strictEqual(selection?.mutation.changed, 2);
assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [0, 1]);
assert.deepStrictEqual(mesh.listSplatStateIndices("locked"), [3]);
assert.deepStrictEqual(mesh.listSplatStateIndices("deleted"), [4]);

assert.strictEqual(
  mesh.findSplatColorMatches({ seedIndex: 99, threshold: 0.1 }),
  null,
);

mesh.dispose();

{
  const packedBase = new PackedSplats();
  pushSplat(packedBase, new THREE.Color(0.8, 0.1, 0.1));
  pushSplat(packedBase, new THREE.Color(0.81, 0.11, 0.11));
  pushSplat(packedBase, new THREE.Color(0.79, 0.09, 0.09));
  const packed = new PackedSplats({
    packedArray: packedBase.packedArray?.slice(),
    numSplats: 3,
    extra: {
      colorMatchRgb: new Float32Array([
        0.1, 0.1, 0.1, 0.5, 0.5, 0.5, 0.12, 0.1, 0.1,
      ]),
    },
  });
  const storageColor = { r: 0, g: 0, b: 0 };
  const matchColor = { r: 0, g: 0, b: 0 };
  assert.strictEqual(packed.getSplatColorRaw(1, storageColor), true);
  assert.strictEqual(packed.getSplatColorMatchRaw(1, matchColor), true);
  assertClose(storageColor.r, 0.81);
  assertClose(matchColor.r, 0.5, 1e-6);

  const meshWithSidecar = new SplatMesh({ packedSplats: packed });
  let sidecarBulkReads = 0;
  const originalSidecarBulk = packed.forEachSplatColorMatchRaw.bind(packed);
  packed.forEachSplatColorMatchRaw = (callback) => {
    originalSidecarBulk((index, r, g, b) => {
      sidecarBulkReads += 1;
      return callback(index, r, g, b);
    });
  };
  const sidecarMatches = meshWithSidecar.findSplatColorMatches({
    seedIndex: 0,
    threshold: 0.05,
  });
  assert.deepStrictEqual([...(sidecarMatches?.indices ?? [])], [0, 2]);
  assert.strictEqual(sidecarBulkReads, 3);
  meshWithSidecar.dispose();
  packedBase.dispose();
}

{
  const ext = new ExtSplats();
  pushSplat(ext, new THREE.Color(0.2, 0.3, 0.4));
  pushSplat(ext, new THREE.Color(0.21, 0.3, 0.41));
  pushSplat(ext, new THREE.Color(0.6, 0.7, 0.8));
  const meshWithExt = new SplatMesh({ extSplats: ext });
  let extIndexedReads = 0;
  let extBulkReads = 0;
  const originalExtIndexed = ext.getSplatColorMatchRaw.bind(ext);
  const originalExtBulk = ext.forEachSplatColorMatchRaw.bind(ext);
  ext.getSplatColorMatchRaw = (index, target) => {
    extIndexedReads += 1;
    return originalExtIndexed(index, target);
  };
  ext.forEachSplatColorMatchRaw = (callback) => {
    originalExtBulk((index, r, g, b) => {
      extBulkReads += 1;
      return callback(index, r, g, b);
    });
  };
  const extMatches = meshWithExt.findSplatColorMatches({
    seedIndex: 0,
    threshold: 0.02,
  });
  assert.deepStrictEqual([...(extMatches?.indices ?? [])], [0, 1]);
  assert.strictEqual(extIndexedReads, 1);
  assert.strictEqual(extBulkReads, 3);
  meshWithExt.dispose();
}

{
  let decodedSplats = 0;
  const fallbackPacked = new PackedSplats();
  pushSplat(fallbackPacked, new THREE.Color(0.5, 0.1, 0.1));
  pushSplat(fallbackPacked, new THREE.Color(0.52, 0.1, 0.1));
  pushSplat(fallbackPacked, new THREE.Color(0.1, 0.5, 0.1));
  const rawFallback = fallbackPacked as unknown as {
    forEachSplatColorMatchRaw?: unknown;
    getSplatColorMatchRaw?: unknown;
    getSplatColorRaw?: unknown;
  };
  rawFallback.forEachSplatColorMatchRaw = undefined;
  rawFallback.getSplatColorMatchRaw = undefined;
  rawFallback.getSplatColorRaw = undefined;
  const originalFallbackForEach =
    fallbackPacked.forEachSplat.bind(fallbackPacked);
  fallbackPacked.forEachSplat = (callback) => {
    originalFallbackForEach(
      (index, center, scales, quaternion, opacity, color) => {
        decodedSplats += 1;
        callback(index, center, scales, quaternion, opacity, color);
      },
    );
  };
  const fallbackMesh = new SplatMesh({ splats: fallbackPacked });
  const fallbackMatches = fallbackMesh.findSplatColorMatches({
    seedIndex: 0,
    threshold: 0.03,
  });
  assert.deepStrictEqual([...(fallbackMatches?.indices ?? [])], [0, 1]);
  assert.ok(decodedSplats >= 4);
  fallbackMesh.dispose();
  fallbackPacked.dispose();
}

console.log("Splat mesh color match tests passed");
