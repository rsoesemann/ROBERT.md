# Inverted Earth

A rotatable 3D globe with the planet's topography turned inside out. Ocean
depths become mountains, continents become basins, and the colours follow the
height, so the old sea floor wears greens, browns and snow while the old
continents lie under water.

The **Inversion** slider morphs continuously between the real Earth and the
inverted one, so you can watch the flip happen.

42 cities and 32 islands are pinned to their real coordinates. Both end up
below sea level in the inverted world, but for different reasons — and the
islands are the better half of the trick. Every island is a high point in the
real world, so inverted it becomes a pit in the middle of a new continent. The
Hawaiian chain reads as a line of craters running across the middle of what
used to be the floor of the Pacific.

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
| Peak contrast | Exponent applied to the normalised height. Defaults to 1.0, the honest linear mapping; higher values flatten the abyssal plains so the trenches tower |
| Show water | Translucent shell at sea level — the drowned continents show through it |
| Show cities / islands | Two sets of markers, each with a stalk up to sea level |

## Why the inverted globe is white

The colour ramp reads the height in metres and is never rescaled between the
real and the inverted view. That is the point of the thing. An abyssal plain
4–6 km down really does become 4–6 km up, which is above the snow line, so the
inverted planet is a snowfield with the old continents as its seas. Rescaling
the ramp to keep the new continents green would be a nicer picture and a lie.

Snow is stripped from steep faces, which is both true of real mountains and the
only reason the relief stays readable across a plateau that large. The
Mid-Atlantic Ridge is the inverse case worth looking for: its crest sits about
2.5 km down, so inverted it is *lower* than the plains beside it — a bare brown
valley cutting through the snow.

## Lighting

The sun trails the camera by 38° of longitude and sits to the north, rather
than being fixed in space. A fixed sun makes a prettier still image and leaves
half the planet unusable — rotate to the Pacific and you get an unlit disc.

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

Islands smaller than a grid cell (about 20 km) are averaged into the seamount
they sit on, so their pit comes out shallower than reality — Tahiti reads as a
3 km depression rather than the 5 km its peak would give. The marker is still in
the right place.

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

### Link previews

`preview.png` is what LinkedIn, Slack and the rest show when the page URL is
shared. None of them run JavaScript, so the globe has to be handed over as a
finished image; the Open Graph tags in `index.html` point at it by absolute URL.

```bash
npx playwright install chromium
node make_preview.js          # -> preview.png, 1200x627
```

If the URL was shared before the tags existed, the unfurler has cached the
result — LinkedIn keeps it for about a week. Force a re-scrape at
<https://www.linkedin.com/post-inspector/>.

## How it works

- `THREE.SphereGeometry(1, 512, 256)` displaced radially in the vertex shader by
  a texture fetch, so nothing is recomputed on the CPU when a slider moves.
- Inversion is a mirror around zero: `mix(h, -h, m)` is `h * (1 - 2m)`.
- The fragment shader samples the same texture at full resolution, so coastlines
  stay crisp even though the mesh is coarser. Normals come from four neighbours,
  spaced in metres and corrected for latitude.
- Snow cover is a function of height, latitude and true terrain slope — the
  slope is taken from the gradient before vertical exaggeration, so the
  exaggeration slider does not change where snow lies.
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
