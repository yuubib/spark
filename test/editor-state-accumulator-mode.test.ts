import assert from "node:assert";

import {
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
