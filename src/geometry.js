/**
 * geometry.js — Core JSCAD CSG geometry primitives for clamshell boxes.
 *
 * Hard-won lessons baked in:
 *
 *  1. NEVER use roundedCuboid for mating surfaces. It rounds ALL 12 edges
 *     including the top rim, creating a curved surface that can never meet
 *     flush with another half. Use makeRoundedPrism instead.
 *
 *  2. The arm bottom must sit EXACTLY at box height (BH). When the lid
 *     mirrors closed (Z' = 2·BH − Z), anything above BH maps below BH on
 *     the base side, creating a gap. Flush = zero gap.
 *
 *  3. Print-in-place hinges need ≥1mm clearance per side between barrel
 *     and bore for FDM printers. Tighter tolerances fuse during printing.
 *
 *  4. Hull-based wedge supports with ≥3mm wall overlap bury the seam
 *     inside the wall volume, making it invisible from outside.
 *
 *  5. Blind pockets (not through-holes) preserve wall strength for clasps.
 *     Leave ≥0.3mm of wall material behind the pocket.
 *
 *  6. No nesting lip needed when using flat-top geometry. The flat surfaces
 *     meet flush by themselves. Lips that are too thin (<1.5mm) don't
 *     print reliably on FDM and peel off.
 */

'use strict';

const { booleans, primitives, transforms, hulls } = require('@jscad/modeling');
const { subtract, union } = booleans;
const { cuboid, cylinder, roundedCuboid } = primitives;
const { translate, rotate } = transforms;
const { hull } = hulls;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Cylinder oriented along the Y-axis, centered at (cx, cy, cz). */
function yCylinder(radius, length, cx, cy, cz, segments) {
  return translate([cx, cy, cz],
    rotate([Math.PI / 2, 0, 0],
      cylinder({ radius, height: length, segments })
    )
  );
}

/**
 * Rounded-rectangle prism via hull of 4 vertical cylinders.
 *
 * This is the CRITICAL primitive for clamshell boxes. Unlike roundedCuboid
 * (which rounds all 12 edges including top/bottom), this produces:
 *   - Perfectly FLAT top and bottom surfaces
 *   - Rounded vertical edges only
 *
 * When two halves close face-to-face, their flat tops meet with zero gap.
 */
function makeRoundedPrism(sizeX, sizeY, sizeZ, radius, cx, cy, czBottom, segments) {
  const dx = sizeX / 2 - radius;
  const dy = sizeY / 2 - radius;
  const corners = [];
  for (const [sx, sy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    corners.push(cylinder({
      radius,
      height: sizeZ,
      segments,
      center: [cx + sx * dx, cy + sy * dy, czBottom + sizeZ / 2]
    }));
  }
  return hull(...corners);
}

// ─────────────────────────────────────────────────────────────
// Tray (one half of the box)
// ─────────────────────────────────────────────────────────────

function makeTray(offsetX, p) {
  const { width: BW, depth: BD, height: BH, wall: WALL, floor: FLOOR, cornerRadius: CR } = p.box;
  const SEG = p.export.segments;
  const cx = offsetX + BW / 2;

  const outer = makeRoundedPrism(BW, BD, BH, CR, cx, BD / 2, 0, SEG);

  const innerW = BW - 2 * WALL;
  const innerD = BD - 2 * WALL;
  const innerH = BH - FLOOR + 1; // +1 so subtraction fully opens the top
  const innerR = Math.max(CR - WALL, 0.5);
  const inner = makeRoundedPrism(innerW, innerD, innerH, innerR, cx, BD / 2, FLOOR, SEG);

  return subtract(outer, inner);
}

// ─────────────────────────────────────────────────────────────
// Hinge — seamless hull-based wedge supports
// ─────────────────────────────────────────────────────────────

function makeHinge(p) {
  const { width: BW, depth: BD, height: BH } = p.box;
  const {
    tubeOD, boreD, barrelOD, hingeGap, endGap,
    tubeFraction, barrelExtFraction, blendRadius: BLEND_R, wallOverlap: OVERLAP
  } = p.hinge;
  const SEG = p.export.segments;

  const TUBE_R   = tubeOD / 2;
  const BORE_R   = boreD / 2;
  const BARREL_R = barrelOD / 2;

  const GAP     = tubeOD + 2;
  const HINGE_X = BW + GAP / 2;
  const HINGE_Z = BH;
  const LID_X   = BW + GAP;

  // Y layout
  const TOTAL_GAP_Y = 2 * endGap + 2 * hingeGap;
  const USABLE_Y    = BD - TOTAL_GAP_Y;
  const TUBE_LEN    = USABLE_Y * tubeFraction;
  const BARREL_VIS  = (USABLE_Y - TUBE_LEN) / 2;
  const BARREL_EXT  = TUBE_LEN * barrelExtFraction;
  const BARREL_TOTAL = BARREL_VIS + BARREL_EXT;

  const BL_Y0   = endGap;
  const BL_Y1   = BL_Y0 + BARREL_VIS;
  const TUBE_Y0 = BL_Y1 + hingeGap;
  const TUBE_Y1 = TUBE_Y0 + TUBE_LEN;
  const BR_Y0   = TUBE_Y1 + hingeGap;
  const BR_Y1   = BR_Y0 + BARREL_VIS;

  const tubeCY = (TUBE_Y0 + TUBE_Y1) / 2;
  const parts = { base: [], lid: [] };

  // ── Base: angled wedge → hollow tube ──
  const baseBridgeX0 = BW - OVERLAP;
  const baseBridgeX1 = HINGE_X;
  const baseBridgeW  = baseBridgeX1 - baseBridgeX0;

  const baseTopSlice = roundedCuboid({
    size: [baseBridgeW, TUBE_LEN + 2, 3],
    roundRadius: BLEND_R, segments: SEG,
    center: [(baseBridgeX0 + baseBridgeX1) / 2, tubeCY, BH - 1.5]
  });
  const baseBottomSlice = roundedCuboid({
    size: [OVERLAP + 2, TUBE_LEN + 2, 3],
    roundRadius: BLEND_R, segments: SEG,
    center: [BW - OVERLAP / 2 + 1, tubeCY, 1.5]
  });
  const baseSupport = hull(baseTopSlice, baseBottomSlice);
  const tubeSolid   = yCylinder(TUBE_R, TUBE_LEN, HINGE_X, tubeCY, HINGE_Z, SEG);
  const bore        = yCylinder(BORE_R, TUBE_LEN + 4, HINGE_X, tubeCY, HINGE_Z, SEG);
  parts.base.push(subtract(union(baseSupport, tubeSolid), bore));

  // ── Lid: left barrel + wedge ──
  const lidBridgeX0 = HINGE_X;
  const lidBridgeX1 = LID_X + OVERLAP;
  const lidBridgeW  = lidBridgeX1 - lidBridgeX0;

  const blVisCY = (BL_Y0 + BL_Y1) / 2;
  const lidTopSliceL = roundedCuboid({
    size: [lidBridgeW, BARREL_VIS + 2, 3],
    roundRadius: BLEND_R, segments: SEG,
    center: [(lidBridgeX0 + lidBridgeX1) / 2, blVisCY, BH - 1.5]
  });
  const lidBottomSliceL = roundedCuboid({
    size: [OVERLAP + 2, BARREL_VIS + 2, 3],
    roundRadius: BLEND_R, segments: SEG,
    center: [LID_X + OVERLAP / 2 - 1, blVisCY, 1.5]
  });
  const leftSupport = hull(lidTopSliceL, lidBottomSliceL);
  const blCY = BL_Y0 + BARREL_TOTAL / 2;
  const barrelL = yCylinder(BARREL_R, BARREL_TOTAL, HINGE_X, blCY, HINGE_Z, SEG);
  parts.lid.push(union(leftSupport, barrelL));

  // ── Lid: right barrel + wedge ──
  const brVisCY = (BR_Y0 + BR_Y1) / 2;
  const lidTopSliceR = roundedCuboid({
    size: [lidBridgeW, BARREL_VIS + 2, 3],
    roundRadius: BLEND_R, segments: SEG,
    center: [(lidBridgeX0 + lidBridgeX1) / 2, brVisCY, BH - 1.5]
  });
  const lidBottomSliceR = roundedCuboid({
    size: [OVERLAP + 2, BARREL_VIS + 2, 3],
    roundRadius: BLEND_R, segments: SEG,
    center: [LID_X + OVERLAP / 2 - 1, brVisCY, 1.5]
  });
  const rightSupport = hull(lidTopSliceR, lidBottomSliceR);
  const brCY = BR_Y1 - BARREL_TOTAL / 2;
  const barrelR = yCylinder(BARREL_R, BARREL_TOTAL, HINGE_X, brCY, HINGE_Z, SEG);
  parts.lid.push(union(rightSupport, barrelR));

  return { parts, layout: { GAP, HINGE_X, HINGE_Z, LID_X } };
}

// ─────────────────────────────────────────────────────────────
// Clasp — J-hook on lid + blind pocket on base
// ─────────────────────────────────────────────────────────────

function makeClasp(p, layout) {
  const { width: BW, depth: BD, height: BH, wall: WALL } = p.box;
  const {
    hookWidth: HOOK_W, armThick: ARM_THICK, armLength: ARM_LEN,
    catchDepth: CATCH_IN, catchHeight: CATCH_H, clearance: CLR,
    roundRadius: rr
  } = p.clasp;
  const SEG = p.export.segments;
  const { LID_X } = layout;

  const claspY    = BD / 2;
  const lidOuterX = LID_X + BW;

  // Pocket dimensions (derived)
  const PKT_W     = HOOK_W + 2 * CLR;
  const PKT_DEPTH = CATCH_IN + CLR + 0.1;
  const PKT_H     = CATCH_H + 2 * CLR;

  // ── Base: blind pocket on outer face of front wall ──
  const pktCenterZ = BH - ARM_LEN + CATCH_H / 2;
  const basePocket = cuboid({
    size: [PKT_DEPTH + 1, PKT_W, PKT_H],
    center: [PKT_DEPTH / 2 - 0.5, claspY, pktCenterZ]
  });

  // ── Lid: J-hook (root embedded in wall, arm drops, tongue catches) ──
  const EMBED      = WALL;
  const rootSizeX  = EMBED + ARM_THICK;
  const rootSizeZ  = 4.0;
  const rootCenterX = lidOuterX - EMBED / 2 + ARM_THICK / 2;
  const rootCenterZ = BH - rootSizeZ / 2;  // top at BH = flush close
  const root = roundedCuboid({
    size: [rootSizeX, HOOK_W + 2, rootSizeZ],
    roundRadius: rr, segments: SEG,
    center: [rootCenterX, claspY, rootCenterZ]
  });

  const arm = roundedCuboid({
    size: [ARM_THICK, HOOK_W, ARM_LEN],
    roundRadius: rr, segments: SEG,
    center: [lidOuterX + ARM_THICK / 2, claspY, BH + ARM_LEN / 2]
  });

  const catchCZ = BH + ARM_LEN - CATCH_H / 2;
  const catchRR = Math.min(rr, CATCH_H / 2 - 0.05);
  const catchPiece = roundedCuboid({
    size: [ARM_THICK + CATCH_IN, HOOK_W - 1, CATCH_H],
    roundRadius: catchRR, segments: SEG,
    center: [lidOuterX - CATCH_IN / 2 + ARM_THICK / 2, claspY, catchCZ]
  });

  return {
    baseCuts: [basePocket],
    hook: union(root, arm, catchPiece),
    info: { PKT_W, PKT_DEPTH, PKT_H }
  };
}

// ─────────────────────────────────────────────────────────────
// Assemble — combine all parts into base, lid, flat, closed
// ─────────────────────────────────────────────────────────────

function buildBox(p) {
  const { width: BW, height: BH } = p.box;

  // Hinge (also computes layout constants)
  const hinge = makeHinge(p);
  const { HINGE_X, HINGE_Z, LID_X } = hinge.layout;

  // Trays
  const baseTray = makeTray(0, p);
  const lidTray  = makeTray(LID_X, p);

  // Clasp
  const clasp = makeClasp(p, hinge.layout);

  // Combine
  const baseHalf = subtract(union(baseTray, ...hinge.parts.base), ...clasp.baseCuts);
  const lidHalf  = union(lidTray, ...hinge.parts.lid, clasp.hook);
  const flatBox  = union(baseHalf, lidHalf);

  // Closed view: rotate lid 180° around hinge axis
  const closedLid = translate(
    [HINGE_X, 0, HINGE_Z],
    rotate([0, Math.PI, 0],
      translate([-HINGE_X, 0, -HINGE_Z], lidHalf)
    )
  );
  const closedBox = union(baseHalf, closedLid);

  return {
    baseHalf, lidHalf,
    flat: flatBox,
    closed: closedBox,
    layout: hinge.layout,
    claspInfo: clasp.info
  };
}

module.exports = { buildBox, makeRoundedPrism, yCylinder };
