import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/SparkRenderer.ts", import.meta.url),
  "utf8",
);

assert.match(source, /ordering32 = new Uint32Array\(0\)/);
assert.ok(
  source.includes(
    "const ordering = Readback.ensureBuffer(orderingMaxSplats, this.ordering32);",
  ),
);
assert.ok(source.includes("this.ordering32 = ordering;"));
assert.ok(source.includes("this.ordering32 = result.ordering;"));
assert.ok(
  source.includes("this.orderingTexture.image.data !== result.ordering"),
);
assert.ok(
  source.includes("this.orderingTexture.image.data = result.ordering;"),
);

assert.ok(
  source.indexOf("this.ordering32 = result.ordering;") <
    source.indexOf("this.activeSplats = result.activeSplats;"),
);

console.log("Spark renderer sort buffer reuse contract passed");
