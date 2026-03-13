/**
 * engrave.js — Text engraving for clamshell box lids.
 *
 * Uses opentype.js to convert text into JSCAD CSG geometry that can be
 * subtracted from the lid to create debossed lettering on the exterior.
 *
 * The lid exterior is the BOTTOM surface (z=0) of the lid tray in the
 * flat print layout.
 */

'use strict';

const fs = require('fs');
const opentype = require('opentype.js');
const { booleans, primitives, transforms, extrusions } = require('@jscad/modeling');
const { subtract, union } = booleans;
const { polygon } = primitives;
const { translate } = transforms;
const { extrudeLinear } = extrusions;

// ─────────────────────────────────────────────────────────────
// Path flattening — convert bezier curves to line segments
// ─────────────────────────────────────────────────────────────

function flattenCommands(commands, res) {
  const contours = [];
  let pts = [];
  let cx = 0, cy = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        if (pts.length >= 3) contours.push(pts);
        pts = [[cmd.x, cmd.y]];
        cx = cmd.x; cy = cmd.y;
        break;

      case 'L':
        pts.push([cmd.x, cmd.y]);
        cx = cmd.x; cy = cmd.y;
        break;

      case 'Q': {
        const x0 = cx, y0 = cy;
        for (let i = 1; i <= res; i++) {
          const t = i / res, m = 1 - t;
          pts.push([
            m * m * x0 + 2 * m * t * cmd.x1 + t * t * cmd.x,
            m * m * y0 + 2 * m * t * cmd.y1 + t * t * cmd.y
          ]);
        }
        cx = cmd.x; cy = cmd.y;
        break;
      }

      case 'C': {
        const x0 = cx, y0 = cy;
        for (let i = 1; i <= res; i++) {
          const t = i / res, m = 1 - t;
          pts.push([
            m*m*m*x0 + 3*m*m*t*cmd.x1 + 3*m*t*t*cmd.x2 + t*t*t*cmd.x,
            m*m*m*y0 + 3*m*m*t*cmd.y1 + 3*m*t*t*cmd.y2 + t*t*t*cmd.y
          ]);
        }
        cx = cmd.x; cy = cmd.y;
        break;
      }

      case 'Z':
        if (pts.length >= 3) contours.push(pts);
        pts = [];
        break;
    }
  }
  if (pts.length >= 3) contours.push(pts);
  return contours;
}

// ─────────────────────────────────────────────────────────────
// Polygon helpers
// ─────────────────────────────────────────────────────────────

function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return a / 2;
}

function dedup(pts) {
  const EPS2 = 0.001 * 0.001;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - out[out.length - 1][0];
    const dy = pts[i][1] - out[out.length - 1][1];
    if (dx * dx + dy * dy > EPS2) out.push(pts[i]);
  }
  const f = out[0], l = out[out.length - 1];
  if (out.length > 1 && (f[0] - l[0]) ** 2 + (f[1] - l[1]) ** 2 < EPS2) out.pop();
  return out.length >= 3 ? out : null;
}

// ─────────────────────────────────────────────────────────────
// Text line → 3D cutting geometry (centered at XY origin)
// ─────────────────────────────────────────────────────────────

/**
 * Measure a text line at reference font size (no geometry built).
 * Returns the raw bounding-box width and height at fontSize=200.
 */
function measureLine(text, font) {
  const path = font.getPath(text, 0, 0, 200);
  const bb = path.getBoundingBox();
  return { width: bb.x2 - bb.x1, height: bb.y2 - bb.y1 };
}

/**
 * Render a text line to 3D cutting geometry using a pre-computed uniform scale.
 * The text is centered at the XY origin.
 */
function renderLine(text, font, uniformScale, depth, flipX, flipY) {
  const path = font.getPath(text, 0, 0, 200);
  const bb = path.getBoundingBox();
  const rawW = bb.x2 - bb.x1;
  if (rawW < 0.1) return { geom: null, height: 0, width: 0 };

  const textW = rawW * uniformScale;
  const textH = (bb.y2 - bb.y1) * uniformScale;

  const raw = flattenCommands(path.commands, 16);

  // Transform: scale, flip Y (font Y goes down), center at origin.
  // flipX: negate X to pre-mirror for hinge closure.
  // flipY: negate Y for 180° rotation around X axis.
  const scaled = [];
  for (const c of raw) {
    let pts = c.map(([x, y]) => {
      let sx = (x - bb.x1) * uniformScale - textW / 2;
      if (flipX) sx = -sx;
      let sy = -(y - bb.y1) * uniformScale + textH / 2;
      if (flipY) sy = -sy;
      return [sx, sy];
    });
    // Odd number of axis flips reverses polygon winding — restore it
    if (flipX !== (flipY || false)) pts = pts.slice().reverse();
    pts = dedup(pts);
    if (pts) scaled.push(pts);
  }

  if (scaled.length === 0) return { geom: null, height: 0, width: 0 };

  // Determine winding convention from the largest contour
  const areas = scaled.map(pts => signedArea(pts));
  let maxIdx = 0;
  for (let i = 1; i < areas.length; i++) {
    if (Math.abs(areas[i]) > Math.abs(areas[maxIdx])) maxIdx = i;
  }
  const outerIsPositive = areas[maxIdx] > 0;

  // Classify contours as outer or hole.
  // CRITICAL: JSCAD polygon() requires CCW winding (positive signed area).
  // Ensure ALL contours are CCW regardless of the font's native winding.
  const outers = [];
  const holes = [];
  for (let i = 0; i < scaled.length; i++) {
    if (Math.abs(areas[i]) < 0.1) continue;
    const isCCW = areas[i] > 0;
    const ccwPts = isCCW ? scaled[i] : scaled[i].slice().reverse();
    if ((areas[i] > 0) === outerIsPositive) {
      outers.push(ccwPts);
    } else {
      holes.push(ccwPts);
    }
  }

  // Extrude with slight over-cut for clean booleans
  const h = depth + 0.02;
  let geom = null;

  for (const o of outers) {
    try {
      const ext = translate([0, 0, -0.01],
        extrudeLinear({ height: h }, polygon({ points: o })));
      geom = geom ? union(geom, ext) : ext;
    } catch (e) {
      console.warn(`  ⚠ Skipping contour (${e.message})`);
    }
  }

  for (const hole of holes) {
    try {
      const ext = translate([0, 0, -0.01],
        extrudeLinear({ height: h }, polygon({ points: hole })));
      if (geom) geom = subtract(geom, ext);
    } catch (e) {
      console.warn(`  ⚠ Skipping hole (${e.message})`);
    }
  }

  return { geom, height: textH, width: textW };
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Create engraving cutting geometry for the lid exterior.
 *
 * Text runs along the lid WIDTH (short edge). All lines share a UNIFORM
 * font size determined by the widest line fitting within
 * (lidWidth - 2*padding). Shorter lines are naturally centered.
 *
 * @param {string[]} lines - text lines top-to-bottom
 * @param {object} opts
 * @param {number} opts.lidWidth   - lid tray width (mm, short edge)
 * @param {number} opts.lidDepth   - lid tray depth (mm, long edge)
 * @param {number} opts.lidCenterX - lid center X in model coords
 * @param {number} opts.lidCenterY - lid center Y in model coords
 * @param {number} opts.engraveDepth - cut depth into surface (mm)
 * @param {number} opts.padding    - inset from lid short edges for widest line (mm)
 * @param {number} opts.lineGap    - vertical gap between lines (mm)
 * @param {string} opts.fontPath   - path to .ttf font file
 * @returns {Geom3|null}
 */
function makeEngraving(lines, opts) {
  const {
    lidWidth, lidDepth, lidCenterX, lidCenterY,
    engraveDepth = 0.6, padding = 5.0, lineGap = 5.0,
    fontPath, flipForClosure = false, flipY = false
  } = opts;

  // Find a usable font — prefer Cooper Black, fall back to others
  const candidates = [
    fontPath,
    'C:\\Windows\\Fonts\\COOPBL.TTF',
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\ARIAL.TTF',
    'C:\\Windows\\Fonts\\calibri.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
  ].filter(Boolean);

  let font;
  for (const fp of candidates) {
    if (fs.existsSync(fp)) {
      try { font = opentype.loadSync(fp); break; } catch (_) { /* next */ }
    }
  }
  if (!font) {
    console.error('   ⚠ No font found — skipping engraving');
    return null;
  }

  // Text runs along the short edge (lidWidth)
  const availW = lidWidth - 2 * padding;
  console.log(`   Font: ${font.names.fontFamily.en || 'unknown'}`);

  // First pass: measure all lines at reference size to find the widest
  const measurements = lines.map(text => measureLine(text, font));
  const maxRawWidth = Math.max(...measurements.map(m => m.width));
  if (maxRawWidth < 0.1) {
    console.warn('   ⚠ No measurable text — skipping engraving');
    return null;
  }

  // Uniform scale: widest line fills availW, all others use same scale
  const uniformScale = availW / maxRawWidth;
  console.log(`   Text width: ${availW.toFixed(1)}mm (${lidWidth.toFixed(1)} - 2×${padding}mm padding)`);
  console.log(`   Uniform scale: ${uniformScale.toFixed(4)} (set by widest line)`);

  // Second pass: render each line at uniform scale
  const rendered = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const r = renderLine(text, font, uniformScale, engraveDepth, flipForClosure, flipY);
    if (r.geom) {
      rendered.push(r);
      const lPad = (lidWidth - r.width) / 2;
      console.log(`   Line "${text}": ${r.width.toFixed(1)}×${r.height.toFixed(1)}mm, padding: ${lPad.toFixed(1)}mm each side`);
    } else {
      console.warn(`   ⚠ No geometry for "${text}"`);
    }
  }

  if (rendered.length === 0) return null;

  // Stack lines vertically, centered on lid.
  // Return ARRAY of positioned line geometries (not a single union)
  // so the caller can subtract them individually — JSCAD's CSG engine
  // can't handle subtracting one huge union of text polygons.
  const totalH = rendered.reduce((s, r) => s + r.height, 0)
    + (rendered.length - 1) * lineGap;

  const cuts = [];
  let yOff = totalH / 2; // start from top

  for (const { geom: lineGeom, height } of rendered) {
    yOff -= height / 2;
    // flipY: reverse stacking direction (180° around X axis)
    const yPos = flipY ? lidCenterY - yOff : lidCenterY + yOff;
    cuts.push(translate([lidCenterX, yPos, 0], lineGeom));
    yOff -= height / 2 + lineGap;
  }

  console.log(`   Block: ${availW.toFixed(1)} × ${totalH.toFixed(1)}mm, depth: ${engraveDepth}mm`);
  return cuts;
}

module.exports = { makeEngraving };
