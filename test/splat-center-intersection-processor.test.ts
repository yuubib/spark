import assert from "node:assert";

import {
  compactSplatCenterIntersectionBytes,
  createSplatCenterIntersectionCompactStats,
} from "../src/SplatScreenPicker.js";

{
  const stats = createSplatCenterIntersectionCompactStats();
  const compact = compactSplatCenterIntersectionBytes(
    new Uint8Array([0, 255, 1, 0, 128]),
    { stats },
  );

  assert.deepStrictEqual([...compact], [1, 2, 4]);
  assert.deepStrictEqual(stats, {
    byteCount: 5,
    candidateByteCount: 3,
    uniqueHitCount: 3,
    earlyExit: false,
  });
}

{
  const stats = createSplatCenterIntersectionCompactStats();
  const holder = { buffer: new Uint32Array(2).fill(999) };
  const compact = compactSplatCenterIntersectionBytes(
    new Uint8Array([1, 0, 1, 0, 1]),
    {
      maxCandidates: 2,
      indexBuffer: holder,
      stats,
    },
  );

  assert.deepStrictEqual([...compact], [0, 2]);
  assert.strictEqual(compact.buffer, holder.buffer.buffer);
  assert.strictEqual(holder.buffer[1], 2);
  assert.deepStrictEqual(stats, {
    byteCount: 5,
    candidateByteCount: 3,
    uniqueHitCount: 2,
    earlyExit: true,
  });
}

{
  const holder = { buffer: new Uint32Array(1) };
  const compact = compactSplatCenterIntersectionBytes(
    new Uint8Array([1, 1, 1]),
    {
      indexBuffer: holder,
    },
  );

  assert.deepStrictEqual([...compact], [0, 1, 2]);
  assert.ok(holder.buffer.length >= 3);
  assert.strictEqual(compact.buffer, holder.buffer.buffer);
}

{
  const stats = createSplatCenterIntersectionCompactStats();
  const compact = compactSplatCenterIntersectionBytes(new Uint8Array([1, 1]), {
    maxCandidates: 0,
    stats,
  });

  assert.deepStrictEqual([...compact], []);
  assert.deepStrictEqual(stats, {
    byteCount: 2,
    candidateByteCount: 0,
    uniqueHitCount: 0,
    earlyExit: true,
  });
}

console.log("Splat center intersection processor tests passed");
