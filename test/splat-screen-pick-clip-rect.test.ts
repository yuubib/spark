import assert from "node:assert";
import { test } from "node:test";

import { clipPickRect } from "../dist/spark.module.js";

// Regression: clipPickRect clamped the origin to [0, targetWidth] then forced width >= 1, so a rect
// flush to / past the right or bottom edge produced x == targetWidth, width == 1 — a read one pixel
// out of bounds (readRenderTargetPixels GL-error / garbage / spurious edge pick). The read must stay
// inside [0, targetWidth) x [0, targetHeight).
test("clipPickRect keeps the >=1px read inside the framebuffer", () => {
  const W = 100;
  const H = 80;

  // Interior rect is unchanged.
  const interior = clipPickRect({ x: 10, y: 20, width: 5, height: 6 }, W, H);
  assert.strictEqual(interior.x, 10);
  assert.strictEqual(interior.y, 20);
  assert.strictEqual(interior.width, 5);
  assert.strictEqual(interior.height, 6);

  // Point pick flush to the far corner: pre-fix x=100,width=1 → read column [100,101) (out of bounds).
  const corner = clipPickRect({ x: W, y: H, width: 0, height: 0 }, W, H);
  assert.ok(corner.width >= 1 && corner.height >= 1);
  assert.ok(corner.x >= 0 && corner.y >= 0);
  assert.ok(
    corner.x + corner.width <= W,
    `x+width=${corner.x + corner.width} must be <= ${W}`,
  );
  assert.ok(
    corner.y + corner.height <= H,
    `y+height=${corner.y + corner.height} must be <= ${H}`,
  );

  // Rect dragged off the right/bottom edge stays in bounds.
  const overflow = clipPickRect({ x: 95, y: 78, width: 50, height: 50 }, W, H);
  assert.ok(overflow.x + overflow.width <= W);
  assert.ok(overflow.y + overflow.height <= H);
  assert.ok(overflow.x >= 0 && overflow.y >= 0);

  // Degenerate target does not produce a negative origin.
  const empty = clipPickRect({ x: 0, y: 0, width: 0, height: 0 }, 0, 0);
  assert.ok(empty.x >= 0 && empty.y >= 0);
});
