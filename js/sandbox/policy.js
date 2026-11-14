'use strict';

/* ------------------------------------------------------------------ *
 * policy.js - the one brain every visitor watches.                    *
 *                                                                     *
 * Evolved offline for 2000 generations with the same creature and  *
 * the same strategy this page ships, on six-second episodes. The      *
 * weights are baked in, so the published page shows every visitor    *
 * the identical creature instead of each browser training its own.    *
 * Weights are int16 deltas on a shared scale, packed as base64.       *
 * ------------------------------------------------------------------ */

const POLICY = {
  trained: 2000,
  fitness: 60.445,
  scale: 0.00011485341959898679,
  /* [generation, best-ever score, population mean] from the offline run */
  curve: [
    [1, -0.96, -5.61],
    [100, 25.91, 20.59],
    [200, 31.82, 27.38],
    [300, 64.97, 44.66],
    [400, 77.44, 45.77],
    [500, 79.95, 49.2],
    [600, 88.95, 40.21],
    [700, 88.95, 4.85],
    [800, 40.44, 8.42],
    [900, 92.84, 35.75],
    [1000, 112.58, 50.99],
    [1100, 113.18, 48.57],
    [1200, 123.62, 51.6],
    [1300, 123.62, 54.48],
    [1400, 136.79, 56.86],
    [1500, 139.91, 64.24],
    [1600, 57.57, 5.62],
    [1700, 57.57, 6.8],
    [1800, 57.57, 8.37],
    [1900, 57.57, 14.12],
    [2000, 60.44, 16.1],
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
