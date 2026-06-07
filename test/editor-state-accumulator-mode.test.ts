import assert from "node:assert";
import * as THREE from "three";

import {
  SPLAT_EDITOR_STATE_LOCKED,
  SPLAT_EDITOR_STATE_SELECTED,
  SplatAccumulator,
  SplatEditorState,
  SplatMesh,
} from "../dist/spark.module.js";

function readVersions(mesh: InstanceType<typeof SplatMesh>) {
  return {
    version: mesh.version,
    sortVersion: mesh.sortVersion,
    styleVersion: mesh.styleVersion,
  };
}

type GeneratorConstructableMesh = InstanceType<typeof SplatMesh> & {
  constructGenerator(context: unknown): void;
  context: unknown;
  generator?: unknown;
  covGenerator?: unknown;
};

type ProgramPreparingAccumulator = InstanceType<typeof SplatAccumulator> & {
  prepareProgramMaterial(
    generator?: unknown,
    covGenerator?: unknown,
  ): { program: { shader: string } };
};

type EditorStateTextureMesh = InstanceType<typeof SplatMesh> & {
  context: { editorStateTexture: { value: unknown } };
};

function readEditorStateTexture(mesh: InstanceType<typeof SplatMesh>): unknown {
  return (mesh as EditorStateTextureMesh).context.editorStateTexture.value;
}

function compileGeneratedShader(mesh: InstanceType<typeof SplatMesh>): string {
  const generatorMesh = mesh as GeneratorConstructableMesh;
  generatorMesh.constructGenerator(generatorMesh.context);

  const accumulator = new SplatAccumulator({
    extSplats: Boolean((mesh as { extSplats?: unknown }).extSplats),
    covSplats: Boolean((mesh as { covSplats?: unknown }).covSplats),
  }) as ProgramPreparingAccumulator;
  const { program } = accumulator.prepareProgramMaterial(
    generatorMesh.generator,
    generatorMesh.covGenerator,
  );
  accumulator.dispose();
  return program.shader;
}

function assertGeneratorVisibilityBaking({
  mode,
  covSplats = false,
  expected,
}: {
  mode: "generator" | "accumulator";
  covSplats?: boolean;
  expected: boolean;
}) {
  const mesh = new SplatMesh({
    editorStateRenderMode: mode,
    extSplats: covSplats,
    covSplats,
  });
  const shader = compileGeneratedShader(mesh);

  assert.strictEqual(
    shader.includes("& 4u"),
    expected,
    `${mode} ${covSplats ? "covariance" : "standard"} generator visibility bake`,
  );

  mesh.dispose();
}

assertGeneratorVisibilityBaking({ mode: "generator", expected: true });
assertGeneratorVisibilityBaking({ mode: "accumulator", expected: false });
assertGeneratorVisibilityBaking({
  mode: "generator",
  covSplats: true,
  expected: true,
});
assertGeneratorVisibilityBaking({
  mode: "accumulator",
  covSplats: true,
  expected: false,
});

{
  const mesh = new SplatMesh({
    editorStateRenderMode: "accumulator",
    editorSelectedTransformRenderMode: "accumulator",
  });
  const shader = compileGeneratedShader(mesh);
  assert.strictEqual(
    shader.includes("selectedTransformOffset"),
    false,
    "accumulator selected transform preview should not be baked into generated splats",
  );
  mesh.dispose();
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const state = mesh.ensureEditorState(10000);

  assert.strictEqual(state.texture, null);
  assert.strictEqual(
    readEditorStateTexture(mesh),
    SplatEditorState.emptyTexture,
  );

  mesh.selectAllSplatState({
    recordChanges: true,
    changeFormat: "compact",
  });
  assert.strictEqual(state.texture, null);
  assert.strictEqual(
    readEditorStateTexture(mesh),
    SplatEditorState.emptyTexture,
  );
  assert.deepStrictEqual(state.getDirtyRanges(), [
    { start: 0, count: state.maxSplats },
  ]);

  assert.strictEqual(mesh.setSelectedSplatTransform(), true);
  assert.ok(state.texture);
  assert.strictEqual(readEditorStateTexture(mesh), state.texture);

  assert.strictEqual(mesh.clearSelectedSplatTransform(), true);
  assert.strictEqual(
    readEditorStateTexture(mesh),
    SplatEditorState.emptyTexture,
  );

  mesh.dispose();
}

{
  const mesh = new SplatMesh({
    editorStateRenderMode: "accumulator",
    editorSelectedTransformRenderMode: "accumulator",
  });
  const state = mesh.ensureEditorState(10000);

  mesh.selectAllSplatState({
    recordChanges: true,
    changeFormat: "compact",
  });
  const beforeTransform = readVersions(mesh);
  assert.strictEqual(state.texture, null);
  assert.strictEqual(
    readEditorStateTexture(mesh),
    SplatEditorState.emptyTexture,
  );

  assert.strictEqual(
    mesh.setSelectedSplatTransform({
      pivot: new THREE.Vector3(1, 2, 3),
      translate: new THREE.Vector3(4, 5, 6),
      rotate: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI / 4,
      ),
      scale: 1.5,
    }),
    true,
  );
  assert.deepStrictEqual(readVersions(mesh), {
    version: beforeTransform.version,
    sortVersion: beforeTransform.sortVersion,
    styleVersion: beforeTransform.styleVersion + 1,
  });
  assert.strictEqual(state.texture, null);
  assert.strictEqual(
    readEditorStateTexture(mesh),
    SplatEditorState.emptyTexture,
  );

  const accumulator = new SplatAccumulator();
  accumulator.numSplats = 10000;
  assert.strictEqual(
    accumulator.updateEditorStateTexture({
      mapping: [
        {
          node: mesh,
          version: mesh.version,
          sortVersion: mesh.sortVersion,
          styleVersion: mesh.styleVersion,
          mappingVersion: mesh.mappingVersion,
          editorStateVisibilityVersion: state.visibilityVersion,
          base: 0,
          count: 10000,
        },
      ],
    }),
    true,
  );
  assert.strictEqual(accumulator.editorSelectedTransformEnabled, true);
  assert.deepStrictEqual(
    accumulator.editorSelectedTransformPivot.toArray(),
    [1, 2, 3],
  );
  assert.deepStrictEqual(
    accumulator.editorSelectedTransformTranslate.toArray(),
    [4, 5, 6],
  );
  assert.strictEqual(accumulator.editorSelectedTransformScale, 1.5);
  assert.strictEqual(accumulator.editorStateUniformValue, 1);
  assert.strictEqual(accumulator.editorStateTexture, null);

  accumulator.dispose();
  mesh.dispose();
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  const state = mesh.ensureEditorState(4);
  mesh.selectAllSplatState();
  mesh.hideSelectedSplatState();

  const accumulator = new SplatAccumulator();
  accumulator.numSplats = 4;
  assert.strictEqual(
    accumulator.updateEditorStateTexture({
      mapping: [
        {
          node: mesh,
          version: mesh.version,
          sortVersion: mesh.sortVersion,
          styleVersion: mesh.styleVersion,
          mappingVersion: mesh.mappingVersion,
          editorStateVisibilityVersion: state.visibilityVersion,
          base: 0,
          count: 4,
        },
      ],
    }),
    true,
  );
  assert.strictEqual(
    accumulator.editorStateUniformValue,
    SPLAT_EDITOR_STATE_SELECTED | SPLAT_EDITOR_STATE_LOCKED,
  );
  assert.strictEqual(accumulator.editorStateTexture, null);

  accumulator.dispose();
  mesh.dispose();
}

{
  const transformed = new SplatMesh({
    editorStateRenderMode: "accumulator",
    editorSelectedTransformRenderMode: "accumulator",
  });
  const untransformed = new SplatMesh({
    editorStateRenderMode: "accumulator",
    editorSelectedTransformRenderMode: "accumulator",
  });
  const transformedState = transformed.ensureEditorState(2);
  const untransformedState = untransformed.ensureEditorState(2);
  transformed.selectAllSplatState();
  untransformed.selectAllSplatState();
  transformed.setSelectedSplatTransform({
    translate: new THREE.Vector3(1, 0, 0),
  });

  const accumulator = new SplatAccumulator();
  accumulator.numSplats = 4;
  accumulator.updateEditorStateTexture({
    mapping: [
      {
        node: transformed,
        version: transformed.version,
        sortVersion: transformed.sortVersion,
        styleVersion: transformed.styleVersion,
        mappingVersion: transformed.mappingVersion,
        editorStateVisibilityVersion: transformedState.visibilityVersion,
        base: 0,
        count: 2,
      },
      {
        node: untransformed,
        version: untransformed.version,
        sortVersion: untransformed.sortVersion,
        styleVersion: untransformed.styleVersion,
        mappingVersion: untransformed.mappingVersion,
        editorStateVisibilityVersion: untransformedState.visibilityVersion,
        base: 2,
        count: 2,
      },
    ],
  });
  assert.strictEqual(
    accumulator.editorSelectedTransformEnabled,
    false,
    "global accumulator selected transform must disable on mixed selected mappings",
  );

  accumulator.dispose();
  transformed.dispose();
  untransformed.dispose();
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  mesh.ensureEditorState(4);
  const initial = readVersions(mesh);

  const selectResult = mesh.selectAllSplatState({ recordChanges: true });
  assert.deepStrictEqual(selectResult.changes, [
    { index: 0, previous: 0, next: 1 },
    { index: 1, previous: 0, next: 1 },
    { index: 2, previous: 0, next: 1 },
    { index: 3, previous: 0, next: 1 },
  ]);
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [0, 1, 2, 3]);
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version,
    sortVersion: initial.sortVersion,
    styleVersion: initial.styleVersion + 1,
  });

  mesh.applySplatStateChanges(selectResult.changes ?? [], "previous");
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), []);
  mesh.applySplatStateChanges(selectResult.changes ?? [], "next");
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [0, 1, 2, 3]);

  const clearResult = mesh.clearSplatStateSelection({
    recordChanges: true,
    changeFormat: "compact",
  });
  assert.strictEqual(clearResult.changes, undefined);
  assert.deepStrictEqual(clearResult.changeSet, {
    kind: "uniform",
    start: 0,
    count: 4,
    previous: 1,
    next: 0,
    changed: 4,
  });
  assert.ok(clearResult.changeSet);
  mesh.applySplatStateChangeSet(clearResult.changeSet, "previous");
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [0, 1, 2, 3]);
  mesh.applySplatStateChangeSet(clearResult.changeSet, "next");
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), []);
  mesh.applySplatStateChangeSet(clearResult.changeSet, "previous");
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [0, 1, 2, 3]);

  const beforeDelete = readVersions(mesh);
  mesh.deleteSelectedSplatState();
  assert.deepStrictEqual(mesh.listSplatStateIndices("deleted"), [0, 1, 2, 3]);
  assert.deepStrictEqual(readVersions(mesh), {
    version: beforeDelete.version,
    sortVersion: beforeDelete.sortVersion,
    styleVersion: beforeDelete.styleVersion + 1,
  });

  const beforeReset = readVersions(mesh);
  mesh.resetDeletedSplatState();
  assert.deepStrictEqual(readVersions(mesh), {
    version: beforeReset.version,
    sortVersion: beforeReset.sortVersion,
    styleVersion: beforeReset.styleVersion + 1,
  });

  mesh.dispose();
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "accumulator" });
  mesh.ensureEditorState(8);
  mesh.selectSplatStateCandidates([1, 6], "add");
  const initial = readVersions(mesh);

  const selectResult = mesh.selectSplatStateCandidates([3], "set", {
    recordChanges: true,
  });

  assert.deepStrictEqual(selectResult.changes, [
    { index: 1, previous: 1, next: 0 },
    { index: 3, previous: 0, next: 1 },
    { index: 6, previous: 1, next: 0 },
  ]);
  assert.deepStrictEqual(mesh.listSplatStateIndices("selected"), [3]);
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version,
    sortVersion: initial.sortVersion,
    styleVersion: initial.styleVersion + 1,
  });

  mesh.dispose();
}

{
  const mesh = new SplatMesh({ editorStateRenderMode: "generator" });
  mesh.ensureEditorState(4);
  const initial = readVersions(mesh);

  mesh.selectAllSplatState();
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version + 1,
    sortVersion: initial.sortVersion,
    styleVersion: initial.styleVersion,
  });

  mesh.deleteSelectedSplatState();
  assert.deepStrictEqual(readVersions(mesh), {
    version: initial.version + 2,
    sortVersion: initial.sortVersion + 1,
    styleVersion: initial.styleVersion,
  });

  mesh.dispose();
}

console.log("Splat editor accumulator mode tests passed");
