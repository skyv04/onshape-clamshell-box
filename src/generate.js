#!/usr/bin/env node
/**
 * generate.js — Parameterized clamshell box generator.
 *
 * Usage:
 *   node src/generate.js                           # default 3×3 inch box
 *   node src/generate.js --config config.json      # custom parameters
 *   node src/generate.js --width 100 --depth 80    # CLI overrides
 *   node src/generate.js --config examples/jewelry-box-4x4.json --segments 64
 *
 * Outputs (in ./output/):
 *   <name>_base.stl    — base half (for dual-color printing)
 *   <name>_lid.stl     — lid half
 *   <name>_print.stl   — both halves flat (single-color print)
 *   <name>_closed.stl  — closed preview (for OnShape import / visual check)
 *   <name>_print.3mf   — dual-color 3MF (base blue, lid pink-purple)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const stlSerializer = require('@jscad/stl-serializer');
const { buildBox } = require('./geometry');
const defaults = require('./defaults');

// ─────────────────────────────────────────────────────────────
// CLI argument parsing
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        args[key] = isNaN(Number(val)) ? val : Number(val);
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
        && target[key] && typeof target[key] === 'object') {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function buildParams(args) {
  let params = JSON.parse(JSON.stringify(defaults));

  // Load config file first
  if (args.config) {
    const configPath = path.resolve(args.config);
    if (!fs.existsSync(configPath)) {
      console.error(`Config file not found: ${configPath}`);
      process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    params = deepMerge(params, config);
  }

  // CLI overrides (flat keys map to nested structure)
  const cliMap = {
    width:        ['box', 'width'],
    depth:        ['box', 'depth'],
    height:       ['box', 'height'],
    wall:         ['box', 'wall'],
    floor:        ['box', 'floor'],
    cornerRadius: ['box', 'cornerRadius'],
    tubeOD:       ['hinge', 'tubeOD'],
    boreD:        ['hinge', 'boreD'],
    barrelOD:     ['hinge', 'barrelOD'],
    hookWidth:    ['clasp', 'hookWidth'],
    armLength:    ['clasp', 'armLength'],
    catchDepth:   ['clasp', 'catchDepth'],
    segments:     ['export', 'segments'],
    baseColor:    ['export', 'baseColor'],
    lidColor:     ['export', 'lidColor'],
  };

  for (const [cliKey, path] of Object.entries(cliMap)) {
    if (args[cliKey] !== undefined) {
      params[path[0]][path[1]] = args[cliKey];
    }
  }

  return params;
}

// ─────────────────────────────────────────────────────────────
// STL export
// ─────────────────────────────────────────────────────────────

function exportSTL(geometry, filename) {
  const rawData = stlSerializer.serialize({ binary: true }, geometry);
  const buffers = [];
  for (const chunk of rawData) buffers.push(Buffer.from(chunk));
  const buffer = Buffer.concat(buffers);
  fs.writeFileSync(filename, buffer);
  return buffer.length;
}

// ─────────────────────────────────────────────────────────────
// 3MF export (inline — no separate script needed)
// ─────────────────────────────────────────────────────────────

function parseBinarySTL(filePath) {
  const buf = fs.readFileSync(filePath);
  const triCount = buf.readUInt32LE(80);
  const vertices = [];
  const triangles = [];
  const vertMap = new Map();
  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    offset += 12; // skip normal
    const triIdx = [];
    for (let v = 0; v < 3; v++) {
      const x = buf.readFloatLE(offset); offset += 4;
      const y = buf.readFloatLE(offset); offset += 4;
      const z = buf.readFloatLE(offset); offset += 4;
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      if (!vertMap.has(key)) { vertMap.set(key, vertices.length); vertices.push([x, y, z]); }
      triIdx.push(vertMap.get(key));
    }
    triangles.push(triIdx);
    offset += 2;
  }
  return { vertices, triangles };
}

function export3MF(baseSTL, lidSTL, outPath, baseColor, lidColor) {
  const AdmZip = require('adm-zip');
  const baseMesh = parseBinarySTL(baseSTL);
  const lidMesh  = parseBinarySTL(lidSTL);

  function meshXML(mesh, indent) {
    let xml = `${indent}<mesh>\n${indent}  <vertices>\n`;
    for (const [x, y, z] of mesh.vertices)
      xml += `${indent}    <vertex x="${x}" y="${y}" z="${z}" />\n`;
    xml += `${indent}  </vertices>\n${indent}  <triangles>\n`;
    for (const [v1, v2, v3] of mesh.triangles)
      xml += `${indent}    <triangle v1="${v1}" v2="${v2}" v3="${v3}" />\n`;
    xml += `${indent}  </triangles>\n${indent}</mesh>\n`;
    return xml;
  }

  let model = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  model += `<model unit="millimeter" xml:lang="en-US"\n`;
  model += `  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n`;
  model += `  <metadata name="Application">onshape-clamshell-box</metadata>\n`;
  model += `  <resources>\n`;
  model += `    <basematerials id="1">\n`;
  model += `      <base name="Base" displaycolor="${baseColor}" />\n`;
  model += `      <base name="Lid" displaycolor="${lidColor}" />\n`;
  model += `    </basematerials>\n`;
  model += `    <object id="2" type="model" pid="1" pindex="0">\n`;
  model += meshXML(baseMesh, '      ');
  model += `    </object>\n`;
  model += `    <object id="3" type="model" pid="1" pindex="1">\n`;
  model += meshXML(lidMesh, '      ');
  model += `    </object>\n`;
  model += `  </resources>\n`;
  model += `  <build>\n    <item objectid="2" />\n    <item objectid="3" />\n  </build>\n`;
  model += `</model>\n`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(contentTypes, 'utf-8'));
  zip.addFile('_rels/.rels', Buffer.from(rels, 'utf-8'));
  zip.addFile('3D/3dmodel.model', Buffer.from(model, 'utf-8'));
  zip.writeZip(outPath);
  return fs.statSync(outPath).size;
}

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

function validate(p) {
  const errors = [];
  const { box, hinge, clasp } = p;

  if (box.wall < 1.5)
    errors.push(`Wall thickness ${box.wall}mm is below FDM minimum (1.5mm)`);
  if (box.cornerRadius > box.wall)
    errors.push(`Corner radius (${box.cornerRadius}) must be ≤ wall (${box.wall})`);
  if (hinge.boreD <= hinge.barrelOD + 1.0)
    errors.push(`Bore (${hinge.boreD}) needs ≥1mm total clearance over barrel (${hinge.barrelOD}). Current: ${(hinge.boreD - hinge.barrelOD).toFixed(1)}mm`);
  if (hinge.tubeOD <= hinge.boreD)
    errors.push(`Tube OD (${hinge.tubeOD}) must be > bore (${hinge.boreD})`);
  if (clasp.hookWidth > box.depth * 0.8)
    errors.push(`Hook width (${clasp.hookWidth}) should be ≤80% of box depth (${box.depth})`);

  const pktDepth = clasp.catchDepth + clasp.clearance + 0.1;
  if (pktDepth >= box.wall)
    errors.push(`Pocket depth (${pktDepth.toFixed(1)}mm) would pierce wall (${box.wall}mm). Reduce catchDepth or increase wall.`);

  if (errors.length) {
    console.error('\n⚠️  Validation errors:');
    errors.forEach(e => console.error(`   • ${e}`));
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const args   = parseArgs(process.argv);
const params = buildParams(args);

if (args.help) {
  console.log(`
  onshape-clamshell-box — Parameterized 3D-printable clamshell box generator

  Usage:
    node src/generate.js [options]

  Options:
    --config <file>     Load parameters from JSON config
    --width <mm>        Box width per half (default: 76.2)
    --depth <mm>        Box depth per half (default: 76.2)
    --height <mm>       Box height per half (default: 12.7)
    --wall <mm>         Wall thickness (default: 2.0, min: 1.5)
    --hookWidth <mm>    Clasp width (default: 38.0)
    --segments <n>      Mesh resolution (default: 32)
    --baseColor <hex>   Base half color for 3MF (default: #4A90D9)
    --lidColor <hex>    Lid half color for 3MF (default: #D94A8C)
    --output <dir>      Output directory (default: ./output)
    --name <name>       Output filename prefix (default: clamshell_box)
    --help              Show this help

  Examples:
    node src/generate.js
    node src/generate.js --config examples/jewelry-box-4x4.json
    node src/generate.js --width 100 --depth 80 --height 20 --name my_box
  `);
  process.exit(0);
}

validate(params);

const name   = args.name || params.name || 'clamshell_box';
const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
const outDir = path.resolve(args.output || 'output');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

console.log(`\n🔧 Generating: ${name}`);
console.log(`   Box: ${params.box.width}×${params.box.depth}×${params.box.height}mm per half`);
console.log(`   Wall: ${params.box.wall}mm, Floor: ${params.box.floor}mm, Corner R: ${params.box.cornerRadius}mm`);
console.log(`   Hinge: tube ∅${params.hinge.tubeOD} / bore ∅${params.hinge.boreD} / barrel ∅${params.hinge.barrelOD}`);
console.log(`   Clasp: ${params.clasp.hookWidth}mm wide J-hook, ${params.clasp.armLength}mm arm, ${params.clasp.catchDepth}mm catch`);
console.log(`   Segments: ${params.export.segments}\n`);

const boxResult = buildBox(params);
let { baseHalf, lidHalf, flat, closed } = boxResult;
const { layout } = boxResult;

// ── Optional engraving ──────────────────────────────────────
if (params.engrave && params.engrave.lines && params.engrave.lines.length > 0) {
  console.log(`✏️  Engraving: "${params.engrave.lines.join('" / "')}"`);
  const { makeEngraving } = require('./engrave');
  const { HINGE_X, HINGE_Z, LID_X } = layout;

  const engraveCuts = makeEngraving(params.engrave.lines, {
    lidWidth:     params.box.width,
    lidDepth:     params.box.depth,
    lidCenterX:   LID_X + params.box.width / 2,
    lidCenterY:   params.box.depth / 2,
    engraveDepth: params.engrave.depth || 0.4,
    padding:      params.engrave.padding || 1.0,
    lineGap:      params.engrave.lineGap || 5.0,
    fontPath:     params.engrave.font,
    flipForClosure: false,
    flipY: true
  });

  if (engraveCuts && engraveCuts.length > 0) {
    const { translate: tr, rotate: rot } = require('@jscad/modeling').transforms;
    const { subtract: sub, union: uni } = require('@jscad/modeling').booleans;

    // Subtract each line individually — JSCAD CSG can't handle one big union
    for (const cut of engraveCuts) {
      lidHalf = sub(lidHalf, cut);
    }
    flat    = uni(baseHalf, lidHalf);

    const closedLid = tr([HINGE_X, 0, HINGE_Z],
      rot([0, Math.PI, 0], tr([-HINGE_X, 0, -HINGE_Z], lidHalf)));
    closed = uni(baseHalf, closedLid);

    console.log(`   ✓ Engraved on lid exterior (${params.engrave.depth || 0.4}mm deep)\n`);
  }
}

// Export STLs
const baseFile   = path.join(outDir, `${safeName}_base.stl`);
const lidFile    = path.join(outDir, `${safeName}_lid.stl`);
const printFile  = path.join(outDir, `${safeName}_print.stl`);
const closedFile = path.join(outDir, `${safeName}_closed.stl`);
const mfFile     = path.join(outDir, `${safeName}_print.3mf`);

const sizes = {};
sizes.base   = exportSTL(baseHalf, baseFile);
sizes.lid    = exportSTL(lidHalf, lidFile);
sizes.print  = exportSTL(flat, printFile);
sizes.closed = exportSTL(closed, closedFile);

console.log(`   ✓ ${safeName}_base.stl   (${(sizes.base / 1024).toFixed(1)} KB)`);
console.log(`   ✓ ${safeName}_lid.stl    (${(sizes.lid / 1024).toFixed(1)} KB)`);
console.log(`   ✓ ${safeName}_print.stl  (${(sizes.print / 1024).toFixed(1)} KB)`);
console.log(`   ✓ ${safeName}_closed.stl (${(sizes.closed / 1024).toFixed(1)} KB)`);

// Export 3MF
const mfSize = export3MF(baseFile, lidFile, mfFile, params.export.baseColor, params.export.lidColor);
console.log(`   ✓ ${safeName}_print.3mf  (${(mfSize / 1024).toFixed(1)} KB) — dual color\n`);

console.log(`✅ Done! ${Object.keys(sizes).length + 1} files in ${outDir}/`);
console.log(`   Import ${safeName}_closed.stl to OnShape for visual inspection`);
console.log(`   Open ${safeName}_print.3mf in Bambu Studio for dual-color printing\n`);
