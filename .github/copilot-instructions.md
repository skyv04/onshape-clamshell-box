# Copilot Instructions: onshape-clamshell-box

## What this tool does

This is a parameterized 3D-printable clamshell box generator. It produces STL and
dual-color 3MF files using JSCAD CSG, ready for OnShape visual inspection and
Bambu Studio (or any slicer) printing. The design features a print-in-place hinge
and a J-hook snap-fit clasp.

## How to use it

### Generate a box

```bash
cd onshape-clamshell-box
npm install          # first time only
node src/generate.js # default 3×3 inch box
```

### Custom sizes

```bash
node src/generate.js --width 100 --depth 80 --height 20 --name my_box
```

### From a config file

```bash
node src/generate.js --config examples/jewelry-box-4x4.json
```

### Key CLI flags

- `--width <mm>` — box width per half (default 76.2)
- `--depth <mm>` — box depth per half (default 76.2)
- `--height <mm>` — box height per half (default 12.7)
- `--wall <mm>` — wall thickness (default 2.0, minimum 1.5)
- `--hookWidth <mm>` — clasp width (default 38, should be ~50% of depth)
- `--segments <n>` — mesh resolution (32 = production, 16 = fast test)
- `--name <str>` — output filename prefix
- `--output <dir>` — output directory (default: ./output)

### Output files

All land in `./output/` (or `--output` dir):

- `*_base.stl` — base half for dual-color
- `*_lid.stl` — lid half for dual-color
- `*_print.stl` — both halves, flat layout
- `*_closed.stl` — closed position for OnShape inspection
- `*_print.3mf` — dual-color 3MF for Bambu Studio

## Critical design rules (DO NOT violate)

1. **NEVER use `roundedCuboid` for tray shells.** It rounds the top edge, creating
   an uncloseable gap between halves. Use `makeRoundedPrism()` (hull of 4 vertical
   cylinders) which keeps top/bottom perfectly flat.

2. **Arm bottom must be EXACTLY at box height (BH).** When the lid mirrors closed
   (Z' = 2·BH − Z), anything above BH on the arm maps to below BH, creating a gap.

3. **Hinge barrel-to-bore clearance must be ≥1mm per side** for FDM print-in-place.
   Default: 3mm barrel in 5mm bore = 1mm/side. Tighter will fuse during printing.

4. **Blind pockets only** for the clasp. The pocket depth must be < wall thickness.
   Leave ≥0.3mm wall material behind the pocket.

5. **No nesting lip.** Flat-top geometry already closes flush. Thin protrusions
   (<1.5mm) don't print reliably on FDM and peel off.

6. **Hull-based hinge supports need ≥3mm wall overlap** to hide the seam inside
   the wall volume.

## Validation

The generator validates parameters before building. It will reject:
- Wall < 1.5mm
- Corner radius ≥ wall thickness
- Bore clearance < 1mm total
- Pocket depth ≥ wall thickness
- Hook width > 80% of box depth

## OnShape import tips

- Use millimeter units when importing STL
- Do NOT check "Y axis points up"
- Press F to fit view after import
- Expect "Parts (1) + Surfaces (1)" — normal for JSCAD mesh output
- "Imported with errors" warning is normal for STL mesh imports

## Bambu Studio tips

- Open the 3MF file directly (File → Open)
- Base and lid appear as two color groups
- Assign filaments via the AMS panel
- Recommended: 0.2mm layer height, 15-20% infill, no supports
- Works on P2S, X1C, A1, any Bambu printer

## When to customize parameters

| Want | Adjust |
|------|--------|
| Bigger box | `--width`, `--depth`, `--height` |
| Thicker walls | `--wall` (min 1.5mm) |
| Tighter clasp | Increase `catchDepth` in config (max: wall - 0.5) |
| Wider clasp | `--hookWidth` (max: 80% of depth) |
| Smoother curves | `--segments 64` |
| Different colors | `--baseColor "#FF0000" --lidColor "#00FF00"` |
