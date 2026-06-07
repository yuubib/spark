import assert from "node:assert/strict";

import {
  SPLAT_DEFINES_INCLUDE,
  injectSplatDefines,
} from "../src/shaderIncludes.js";

assert.equal(
  injectSplatDefines(
    `before\n${SPLAT_DEFINES_INCLUDE}\nafter`,
    "const float injected = 1.0;",
  ),
  "before\nconst float injected = 1.0;\nafter",
);

assert.equal(
  injectSplatDefines(
    `${SPLAT_DEFINES_INCLUDE}\n${SPLAT_DEFINES_INCLUDE}`,
    "defs",
  ),
  "defs\ndefs",
);

assert.equal(injectSplatDefines("void main() {}", "defs"), "void main() {}");

console.log("Shader include tests passed");
