'use strict';

/* ------------------------------------------------------------------ *
 * policy.js - the one brain every visitor watches.                    *
 *                                                                     *
 * Evolved offline for 700 generations with the same creature and the  *
 * same strategy this page ships: every episode is a ten-second,       *
 * hundred-metre race, and the record to beat is Bolt's 9.58 s.        *
 * The weights are baked in, so the published page shows every visitor *
 * the identical runner instead of each browser training its own.      *
 * Weights are int16 deltas on a shared scale, packed as base64.       *
 * ------------------------------------------------------------------ */

const POLICY = {
  trained: 700,
  fitness: 73.718,
  scale: 0.00006698995941038239,
  /* [generation, best-ever score, population mean] from the offline run */
  curve: [
    [1, 13.24, 8.31],
    [100, 34.93, 17.13],
    [200, 62.18, 38.81],
    [300, 68.82, 47.38],
    [400, 71.02, 52.65],
    [500, 71.13, 50.39],
    [600, 73.72, 53.68],
    [700, 73.72, 56.62],
  ],
  packed: [
    '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',
  ].join(''),
};

/* unpack: int16 little-endian -> float32 weights */
POLICY.weights = (function () {
  const bin = atob(POLICY.packed);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(bin.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) * POLICY.scale;
  return out;
})();
