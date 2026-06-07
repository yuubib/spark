import assert from "node:assert";

import * as THREE from "three";

import { SplatMesh } from "../dist/spark.module.js";

await SplatMesh.staticInitialized;

const mesh = new SplatMesh({
  constructSplats: (splats) => {
    splats.pushSplat(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.2, 0.2, 0.2),
      new THREE.Quaternion(),
      1,
      new THREE.Color(1, 0, 0),
    );
    splats.pushSplat(
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(0.2, 0.2, 0.2),
      new THREE.Quaternion(),
      1,
      new THREE.Color(0, 1, 0),
    );
    splats.pushSplat(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0.2, 0.2, 0.2),
      new THREE.Quaternion(),
      1,
      new THREE.Color(0, 0, 1),
    );
  },
  minRaycastOpacity: 0.01,
});
await mesh.initialized;
mesh.updateMatrixWorld(true);

const raycaster = new THREE.Raycaster(
  new THREE.Vector3(0, 0, 2),
  new THREE.Vector3(0, 0, -1),
  0,
  10,
);

const visibleHits = mesh.pickSplatRay(raycaster);
assert.deepStrictEqual(
  visibleHits.map((hit) => hit.index),
  [0, 2],
);
assert.ok(visibleHits[0].distance < visibleHits[1].distance);
assert.strictEqual(visibleHits[0].object, mesh);
assert.ok(visibleHits[0].point.distanceTo(new THREE.Vector3(0, 0, 0.2)) < 0.01);

const firstHit = mesh.pickSplatRay(raycaster, { maxHits: 1 });
assert.deepStrictEqual(
  firstHit.map((hit) => hit.index),
  [0],
);

mesh.selectSplatStateCandidates([0], "set");
assert.deepStrictEqual(
  mesh
    .pickSplatRay(raycaster, { editorStateMode: "selected" })
    .map((hit) => hit.index),
  [0],
);
assert.deepStrictEqual(
  mesh
    .pickSplatRay(raycaster, { editorStateMode: "pick-add" })
    .map((hit) => hit.index),
  [2],
);

mesh.deleteSelectedSplatState();
assert.deepStrictEqual(
  mesh
    .pickSplatRay(raycaster, { editorStateMode: "visible" })
    .map((hit) => hit.index),
  [2],
);

const threeIntersections: THREE.Intersection[] = [];
mesh.raycast(raycaster, threeIntersections);
assert.deepStrictEqual(
  threeIntersections.map((hit) => hit.distance),
  mesh
    .pickSplatRay(raycaster, { editorStateMode: mesh.raycastEditorStateMode })
    .map((hit) => hit.distance),
);
assert.ok(!("index" in threeIntersections[0]));

mesh.dispose();

console.log("Splat mesh picking tests passed");
