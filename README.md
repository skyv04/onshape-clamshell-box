# onshape-clamshell-box

Parameterized 3D-printable clamshell box generator with print-in-place hinge and snap-fit J-hook clasp. Outputs STL and dual-color 3MF files ready for OnShape import and Bambu Studio printing.

![Box Overview](https://img.shields.io/badge/FDM-Print--in--Place-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## What It Does

Generates a two-half clamshell box with:

- **Flat-top rounded prism** geometry for gap-free closure (no `roundedCuboid` pitfall)
- **Print-in-place hinge** with tube/barrel design and seamless hull-based wall supports
- **J-hook snap-fit clasp** with blind pocket for secure closure that survives drops
- **Dual-color 3MF** export for multi-filament printers (Bambu AMS, Prusa MMU, etc.)
- **Configurable dimensions** via JSON config or CLI flags

## Quick Start

```bash
# Install
git clone https://github.com/YOUR_USERNAME/onshape-clamshell-box.git
cd onshape-clamshell-box
npm install

# Generate default 3×3 inch box
npm run generate

# Generate from a preset
node src/generate.js --config examples/jewelry-box-4x4.json

# Custom dimensions
node src/generate.js --width 100 --depth 80 --height 20 --name my_box
```

Output files land in `./output/`:

| File | Purpose |
|------|---------|
| `*_base.stl` | Base half only (for dual-color workflows) |
| `*_lid.stl` | Lid half only |
| `*_print.stl` | Both halves flat, single STL |
| `*_closed.stl` | Closed preview for OnShape visual inspection |
| `*_print.3mf` | Dual-color 3MF ready for Bambu Studio |

## Configuration

### JSON Config

Create a JSON file with any parameters you want to override:

```json
{
  "name": "My Custom Box",
  "box": {
    "width": 100,
    "depth": 80,
    "height": 20,
    "wall": 2.5,
    "cornerRadius": 3.0
  },
  "clasp": {
    "hookWidth": 45
  }
}
```

Then: `node src/generate.js --config my-box.json`

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--config <file>` | — | Load params from JSON |
| `--width <mm>` | 76.2 | Box width per half |
| `--depth <mm>` | 76.2 | Box depth per half |
| `--height <mm>` | 12.7 | Box height per half |
| `--wall <mm>` | 2.0 | Wall thickness (min 1.5) |
| `--hookWidth <mm>` | 38.0 | Clasp width |
| `--segments <n>` | 32 | Mesh resolution |
| `--baseColor <hex>` | #4A90D9 | Base color in 3MF |
| `--lidColor <hex>` | #D94A8C | Lid color in 3MF |
| `--output <dir>` | ./output | Output directory |
| `--name <name>` | clamshell_box | Filename prefix |

### Included Examples

| Preset | Size | Use Case |
|--------|------|----------|
| `coin-box-3x3.json` | 3×3×0.5 in | Coins, small items |
| `jewelry-box-4x4.json` | 4×4×0.75 in | Jewelry, accessories |
| `small-box-2x2.json` | 2×2×0.4 in | Rings, earbuds, SD cards |
| `pencil-box-8x4.json` | 8×4×2 in | Pencils, pens — with engraved lid |

## Text Engraving

Add superficial debossed text on the lid exterior by including an `engrave` block in your config:

```json
{
  "engrave": {
    "lines": ["GABRI-", "ELLE"],
    "depth": 0.4,
    "padding": 5.0,
    "lineGap": 5.0,
    "font": "C:\\Windows\\Fonts\\COOPBL.TTF"
  }
}
```

### Engraving Parameters

| Key | Default | Description |
|-----|---------|-------------|
| `lines` | `[]` | Array of text lines, top-to-bottom. Empty = no engraving. |
| `depth` | `0.4` | Cut depth in mm. 0.4mm = 2 layers at 0.20mm layer height. |
| `padding` | `1.0` | Left/right inset in mm from the lid edge for the widest line. |
| `lineGap` | `5.0` | Vertical gap between lines in mm. |
| `font` | auto | Path to a `.ttf` font file. Auto-detects Cooper Black → Arial → Calibri. |

### How It Works

1. All lines share a **uniform font size** set by the widest line fitting `(lidWidth - 2×padding)`. Shorter lines are naturally centered with more padding.
2. The text block is centered both horizontally and vertically on the lid.
3. Text is rendered as CSG geometry using [opentype.js](https://github.com/opentypejs/opentype.js) and subtracted from the lid. Each line is subtracted individually to avoid JSCAD CSG complexity limits.

### Text Orientation for Closed Box

The lid flips 180° around the hinge when the box closes. To make text read correctly on the closed box, use coordinate-level flips — **not** JSCAD `rotate()` transforms (which corrupt complex CSG booleans).

| Option | Effect | When to use |
|--------|--------|-------------|
| `flipForClosure` | Mirrors text in X | Text reads hinge→clasp when closed |
| `flipY` | Flips text 180° around X axis | Letters right-side-up when closed |

These are passed as options to `makeEngraving()` in `generate.js`. See the pencil-box example for the working combination.

### Example: Pencil Box with Engraving

```bash
node src/generate.js --config examples/pencil-box-8x4.json --name pencil_box
```

Produces an 8×4×2 inch box with "GABRI-" / "ELLE" in Cooper Black on the lid, readable when the box is closed.

## OnShape Workflow

1. Generate the closed STL: `node src/generate.js`
2. Go to [OnShape](https://cad.onshape.com), create a new document
3. Import `output/clamshell_box_closed.stl` (millimeters, Y-axis-up unchecked)
4. Press **F** to fit view, rotate to inspect the seam and clasp
5. The seam should be a razor-thin line with zero visible gap

## Bambu Studio Workflow

1. Open `output/clamshell_box_print.3mf` in Bambu Studio
2. The base and lid will appear as separate color groups
3. Assign filament colors to each group via the AMS panel
4. Recommended settings for Bambu Lab P2S:
   - Layer height: 0.2mm
   - Infill: 15-20% (the box is structurally strong from walls)
   - No supports needed (print-in-place design)
   - Plate type: Cool plate or PEI
5. Slice and print

## Design Decisions (Lessons from 30+ Iterations)

### Why `makeRoundedPrism` instead of `roundedCuboid`

JSCAD's `roundedCuboid` creates a Minkowski-sum shape that rounds ALL 12 edges, including the top 4. When two halves close face-to-face, both curved rims create a visible gap:

```
Gap(X) = 2 × (CR - sqrt(CR² - (CR-X)²))
```

Even with CR=2mm, the gap at the edge is 4mm and only drops below coin-thickness at ~0.35mm inward from the rim. `makeRoundedPrism` solves this by hulling 4 vertical cylinders, producing flat top/bottom surfaces with rounded vertical edges only.

### Why blind pockets (not through-holes)

The clasp pocket is carved 1.7mm into a 2.0mm wall, leaving 0.3mm of material. A through-hole would weaken the wall and make the pocket visible from inside. The blind approach keeps the interior clean and the wall structurally sound.

### Why hull-based supports (not extruded shapes)

The hinge supports use `hull()` between two `roundedCuboid` slices at different positions to create a smooth, angled wedge. The bottom slice overlaps 3mm into the wall, burying the junction seam inside the wall volume where it is invisible.

### Why no nesting lip

An earlier version had a thin U-shaped wall protruding from the base rim for alignment. It didn't print reliably on FDM (too thin, peels off as individual strands). The flat-top prism geometry makes it unnecessary since the surfaces already meet flush.

### Hinge clearance math

For FDM print-in-place, barrel-to-bore clearance must be at least 1mm per side. The default uses a 3mm barrel inside a 5mm bore (1mm/side). Tighter tolerances cause the barrel and tube to fuse during printing.

## Project Structure

```
onshape-clamshell-box/
├── src/
│   ├── generate.js     # CLI entry point + STL/3MF export
│   ├── geometry.js     # JSCAD CSG core (tray, hinge, clasp)
│   ├── engrave.js      # Text engraving (opentype.js → JSCAD CSG)
│   └── defaults.js     # Default parameters with documentation
├── examples/
│   ├── coin-box-3x3.json
│   ├── jewelry-box-4x4.json
│   ├── pencil-box-8x4.json
│   └── small-box-2x2.json
├── .github/
│   └── copilot-instructions.md
├── package.json
└── README.md
```

## For GitHub Copilot Users

This repo includes `.github/copilot-instructions.md` which teaches Copilot how to use this tool. In any session, you can say:

> "Generate a 4×4 inch clamshell box using the onshape-clamshell-box skill"

And Copilot will know to run this generator with the right parameters.

## License

MIT
