import assert from "node:assert";

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

console.log("Splat generator version tests passed");
