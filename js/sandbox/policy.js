'use strict';

/* ------------------------------------------------------------------ *
 * policy.js - the one brain every visitor watches.                    *
 *                                                                     *
 * Evolved offline for 2400 generations with the same creature and     *
 * the same strategy this page ships, on six-second episodes. The      *
 * weights are baked in, so the published page shows every visitor    *
 * the identical creature instead of each browser training its own.    *
 * Weights are int16 deltas on a shared scale, packed as base64.       *
 * ------------------------------------------------------------------ */

const POLICY = {
  trained: 2400,
  fitness: 24.549,
  scale: 0.00012057561056838101,
  /* [generation, best-ever score, population mean] from the offline run */
  curve: [
    [1, 1.73, 0.75],
    [100, 6.5, 1.51],
    [200, 8.96, 2.64],
    [300, 12.63, 3.65],
    [400, 15.27, 5.45],
    [500, 15.27, 3.69],
    [600, 15.27, 3],
    [700, 15.27, 5.17],
    [800, 15.27, 6.13],
    [900, 15.27, 4.68],
    [1000, 15.27, 4.34],
    [1100, 16.35, 5.13],
    [1200, 16.35, 5.01],
    [1300, 16.35, 7.36],
    [1400, 18.33, 5.58],
    [1500, 18.33, 6.4],
    [1600, 18.33, 6.59],
    [1700, 19.02, 6.53],
    [1800, 22.16, 4.98],
    [1900, 24.55, 6],
    [2000, 24.55, 6.92],
    [2100, 24.55, 4.26],
    [2200, 24.55, 6.1],
    [2300, 24.55, 4.95],
    [2400, 24.55, 7.15],
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
