import assert from "node:assert";

import {
  compactSplatCenterIntersectionBitsetBytes,
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

{
  const stats = createSplatCenterIntersectionCompactStats();
  const compact = compactSplatCenterIntersectionBitsetBytes(
    new Uint8Array([0b1010_0101, 0b0000_0010]),
    { bitCount: 12, stats },
  );

  assert.deepStrictEqual([...compact], [0, 2, 5, 7, 9]);
  assert.deepStrictEqual(stats, {
    byteCount: 2,
    candidateByteCount: 5,
    uniqueHitCount: 5,
    earlyExit: false,
  });
}

{
  const compact = compactSplatCenterIntersectionBitsetBytes(
    new Uint8Array([0x80, 0x01, 0, 0, 0x01]),
    { bitCount: 33 },
  );

  assert.deepStrictEqual([...compact], [7, 8, 32]);
}

{
  const stats = createSplatCenterIntersectionCompactStats();
  const compact = compactSplatCenterIntersectionBitsetBytes(
    new Uint8Array([0b1111_0000]),
    { bitCount: 4, stats },
  );

  assert.deepStrictEqual([...compact], []);
  assert.deepStrictEqual(stats, {
    byteCount: 1,
    candidateByteCount: 0,
    uniqueHitCount: 0,
    earlyExit: false,
  });
}

{
  const stats = createSplatCenterIntersectionCompactStats();
  const holder = { buffer: new Uint32Array(2).fill(999) };
  const compact = compactSplatCenterIntersectionBitsetBytes(
    new Uint8Array([0b0010_0101, 0b0000_0011]),
    {
      bitCount: 12,
      maxCandidates: 2,
      indexBuffer: holder,
      stats,
    },
  );

  assert.deepStrictEqual([...compact], [0, 2]);
  assert.strictEqual(compact.buffer, holder.buffer.buffer);
  assert.strictEqual(holder.buffer[1], 2);
  assert.deepStrictEqual(stats, {
    byteCount: 2,
    candidateByteCount: 3,
    uniqueHitCount: 2,
    earlyExit: true,
  });
}

{
  const holder = { buffer: new Uint32Array(1) };
  const compact = compactSplatCenterIntersectionBitsetBytes(
    new Uint8Array([0b0000_1111]),
    {
      bitCount: 4,
      indexBuffer: holder,
    },
  );

  assert.deepStrictEqual([...compact], [0, 1, 2, 3]);
  assert.ok(holder.buffer.length >= 4);
  assert.strictEqual(compact.buffer, holder.buffer.buffer);
}

{
  const stats = createSplatCenterIntersectionCompactStats();
  const compact = compactSplatCenterIntersectionBitsetBytes(
    new Uint8Array([0b1111_1111]),
    {
      bitCount: 8,
      maxCandidates: 0,
      stats,
    },
  );

  assert.deepStrictEqual([...compact], []);
  assert.deepStrictEqual(stats, {
    byteCount: 1,
    candidateByteCount: 0,
    uniqueHitCount: 0,
    earlyExit: true,
  });
}

assert.throws(
  () =>
    compactSplatCenterIntersectionBitsetBytes(new Uint8Array([0]), {
      bitCount: 9,
    }),
  /Splat center bitset buffer too small/,
);

console.log("Splat center intersection processor tests passed");
