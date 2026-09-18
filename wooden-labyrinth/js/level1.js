/**
 * Level 1 — Der erste Pfad
 * Grid units: each cell is 1×1. Board sits on XZ plane.
 * Incomplete rim + one hazard hole teach careful tilting.
 */

export const LEVEL_1 = {
  id: 1,
  title: "Der erste Pfad",
  subtitle: "Kapitel I",
  cellSize: 1,
  width: 9,
  depth: 11,
  start: { x: 2.5, z: 2.5 },
  goal: { x: 7.5, z: 9.5 },
  goalRadius: 0.38,
  /** Extra holes that cost a life */
  hazards: [{ x: 4.5, z: 5.5, radius: 0.32 }],
  ballRadius: 0.24,
  /**
   * Outer rim with intentional openings (ball can roll off).
   * Format [x1,z1,x2,z2] in cell units.
   */
  rim: [
    // Bottom edge — gap on the right
    [0, 0, 6, 0],
    // Top edge — gap on the left
    [3, 11, 9, 11],
    // Left edge — gap in the middle
    [0, 0, 0, 4],
    [0, 7, 0, 11],
    // Right edge — gap near bottom
    [9, 2, 9, 11],
  ],
  /** Interior walls */
  walls: [
    [1, 3, 5, 3],
    [3, 5, 8, 5],
    [1, 7, 6, 7],
    [5, 9, 8, 9],
    [3, 1, 3, 3],
    [5, 3, 5, 5],
    [7, 5, 7, 8],
    [3, 7, 3, 10],
    [5, 7, 5, 9],
  ],
  palette: {
    board: 0x7a4a28,
    boardDark: 0x4a2c18,
    wall: 0x9a6a42,
    wallTop: 0xc4a06a,
    felt: 0x2c3a34,
    goalGlow: 0xd4b078,
    hazard: 0x1a1210,
    ball: 0xe8d5b0,
    mist: 0x8fa89c,
  },
};
