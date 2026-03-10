/**
 * Default parameters for a 3×3×0.5 inch clamshell box.
 *
 * Every value is documented with its purpose and safe range.
 * Override any subset via a JSON config file or CLI flags.
 */
module.exports = {
  // ── Box dimensions (per half) ───────────────────────────
  box: {
    width:  76.2,   // mm — X dimension (3 inches)
    depth:  76.2,   // mm — Y dimension (3 inches)
    height: 12.7,   // mm — Z dimension (0.5 inches)
    wall:   2.0,    // mm — wall thickness (min 1.5 for FDM strength)
    floor:  2.0,    // mm — floor thickness
    cornerRadius: 2.0  // mm — vertical edge radius (cosmetic only, top/bottom stay flat)
  },

  // ── Hinge ───────────────────────────────────────────────
  hinge: {
    tubeOD:    7.0,   // mm — outer tube diameter (base side)
    boreD:     5.0,   // mm — bore through tube (must be > barrelOD + 2×clearance)
    barrelOD:  3.0,   // mm — barrel diameter (lid side, fits inside bore)
    hingeGap:  1.0,   // mm — gap between barrel end and tube end
    endGap:    1.0,   // mm — gap from barrel ends to box edge
    tubeFraction: 0.40,  // fraction of usable Y for tube (rest split between barrels)
    barrelExtFraction: 0.35, // fraction of tube length that barrel extends into tube
    blendRadius: 1.2,  // mm — rounded hull radius for seamless wall-to-hinge blend
    wallOverlap: 3     // mm — how deep support sinks into wall (hides seam)
  },

  // ── Clasp — J-hook with blind pocket ────────────────────
  clasp: {
    hookWidth:   38.0,  // mm — width of clasp (centered on front wall)
    armThick:    1.8,   // mm — arm thickness (X)
    armLength:   5.5,   // mm — arm drop below rim
    catchDepth:  1.4,   // mm — tongue depth inward into pocket
    catchHeight: 2.5,   // mm — tongue engagement height
    clearance:   0.2,   // mm — clearance per side (tight snap)
    roundRadius: 0.5    // mm — cosmetic rounding on clasp edges
  },

  // ── Export ──────────────────────────────────────────────
  export: {
    baseColor: '#4A90D9',   // blue
    lidColor:  '#D94A8C',   // pink-purple
    segments:  32            // mesh resolution (16 = fast preview, 32 = production, 64 = smooth)
  }
};
