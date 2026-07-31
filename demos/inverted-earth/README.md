# Inverted Earth

A rotatable 3D globe with the planet's topography turned inside out. Ocean
depths become mountains, continents become basins, and the colours flip with
them — the old sea floor wears greens, browns and snow, the old continents lie
under water. 42 well-known cities are pinned to their real coordinates, which
puts every one of them underwater in the inverted world.

The **Inversion** slider morphs continuously between the real Earth and the
inverted one, so you can watch the flip happen.

## Running it

```bash
python3 -m http.server        # then open http://localhost:8000/
```

A plain `file://` open also works, except that the browser then refuses to read
the elevation image back off a canvas, so the city markers sit at sea level
instead of on the terrain. Use the bundled single file for that case.

## Controls

| Control | What it does |
|---|---|
| Inversion | 0% real Earth, 100% fully inverted, anything in between morphs |
| Vertical exaggeration | Radial scale of the relief, 1×–200× (8 km on a 6371 km sphere is invisible at 1×) |
| Peak contrast | Exponent applied to the normalised height. 1.0 is the honest linear mapping; higher values flatten the abyssal plains so the trenches tower |
| Show water | Translucent shell at sea level — the drowned continents show through it |

## Why "peak contrast" exists

Most of the sea floor is a 4–6 km abyssal plain. Inverted and scaled linearly,
the globe becomes one smooth bulge with the trenches barely poking out of it —
technically faithful, visually dead. Raising the normalised height to a power
compresses the plains and lets the extremes stand up. It is a deliberate lie
about the data, which is why it is a slider with an honest setting at 1.0.

## Data

NASA Visible Earth, GEBCO_08, public domain. Two 21600×10800 8-bit greyscale
images, one for land and one for sea floor, merged into signed metres by
`build_heightmap.py` and written out as a 2048×1024 lossless WebP with the
height packed 12 bits wide across R and G.

```bash
pip install Pillow numpy
python3 build_heightmap.py     # ~53 MB of downloads, cached in .cache/
```

The script prints a sanity check on every run. Current numbers:

| Check | Result | Reality |
|---|---|---|
| Land fraction, area weighted | 29.3% | 29.2% |
| Denver | 1768 m | 1610 m |
| N Atlantic abyssal plain | −4853 m | ~−5000 m |
| Challenger Deep | −10361 m | −10924 m |

**One known distortion:** the NASA topography saturates at 6400 m. Everest and
the rest of the high Himalaya are clipped to that value, so inverted they form a
basin around 6 km deep rather than the 8848 m the real mountain would give. The
bathymetry is not clipped. The sub-pixel blur that removes the 8-bit banding
also trims narrow trenches by a few percent, which is where the −10361 m above
comes from.

Neither the sea level threshold nor the metre scale is documented by NASA, so
both were derived and are verified on every build: land fraction fixes the
threshold, and known point elevations fix the scale.

## Sharing it

`bundle.py` inlines three.js and the elevation map into a single self-contained
HTML file with no external requests, which is what a published artifact's CSP
requires.

```bash
python3 bundle.py             # -> dist/inverted-earth.html, ~2.7 MB
```

For a public link, GitHub Pages serves this directory as-is — no bundling
needed, since `index.html` only references files next to it.

## How it works

- `THREE.SphereGeometry(1, 512, 256)` displaced radially in the vertex shader by
  a texture fetch, so nothing is recomputed on the CPU when a slider moves.
- Inversion is a mirror around zero: `mix(h, -h, m)` is `h * (1 - 2m)`.
- The fragment shader samples the same texture at full resolution, so coastlines
  stay crisp even though the mesh is coarser. Normals come from four neighbours,
  spaced in metres and corrected for latitude.
- The colour ramp is tuned for the real Earth, where land tops out near 6 km.
  Inverted, the old abyssal plains sit at 4–6 km and everything would render as
  snow, so the ramp stretches with the inversion.
- The water shell uses the same 512×256 tessellation as the terrain on purpose.
  At a coarser resolution its flat facets sag further inward than the flattened
  lowlands rise, and the sea floor breaks through it in a pattern of blobs.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole simulation, loads the two files below |
| `heightmap.webp` | 2048×1024 elevation map, 12 bits packed into R and G |
| `vendor/` | three.js r147 UMD plus OrbitControls, MIT |
| `build_heightmap.py` | Rebuilds the elevation map from NASA source, with calibration |
| `bundle.py` | Inlines everything into `dist/inverted-earth.html` |
