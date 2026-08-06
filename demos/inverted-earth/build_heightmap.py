#!/usr/bin/env python3
"""Builds the elevation map used by index.html from two NASA greyscale images.

Source: NASA Visible Earth, GEBCO_08 (public domain)
  topography  https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73934/gebco_08_rev_elev_21600x10800.png
  bathymetry  https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73963/gebco_08_rev_bath_21600x10800.png

Both are 21600x10800 at 8 bits, and each covers only one half of the range:
  topography  0 = sea level (the ocean is flat 0), 255 = ELEV_MAX
  bathymetry  255 = sea level (land is flat 255), 0 = DEPTH_MAX below

The output is a lossless RGB WebP holding signed elevation in metres at 12 bits:
R carries the top 8, G the low 4 shifted up. One 8-bit channel is not enough —
the 17324 m range would land in 68 m steps, which show up as terraces once the
relief is exaggerated. Full 16 bits costs 3.97 MB of base64 against 2.55 MB and
buys nothing visible: 12 bits are 4.2 m steps, far below the noise in the 8-bit
source.

The split is deliberately linear (value = 16*R + G/16). Bilinear filtering of
the two channels on the GPU therefore yields exactly what interpolating the
height itself would; a non-linear packing would jump at every carry.

Output:
  heightmap.webp – loaded by index.html, embedded by bundle.py
"""

import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # 233 Mpx is far past PIL's zip-bomb guard

SRC_ELEV = "https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73934/gebco_08_rev_elev_21600x10800.png"
SRC_BATH = "https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73963/gebco_08_rev_bath_21600x10800.png"

# Calibrated against known points, see README. Grey 255 in the topography is
# 6400 m, not 8848 m: Denver (grey 64, really 1610 m) and the Amazon basin
# (grey 2, really ~50 m) both point at 6400. The Himalaya saturates as a result,
# so Everest sits in the data at 6400 m rather than 8848 m.
ELEV_MAX = 6400.0
DEPTH_MAX = 10924.0  # Challenger Deep, grey 0 in the bathymetry

DECIMATE = 10  # 21600x10800 / 10 = 2160x1080, integer, no resampling needed
MID_W, MID_H = 21600 // DECIMATE, 10800 // DECIMATE
CHUNK_ROWS = 1000  # source rows per block, must divide by DECIMATE

# Final size is a power of two. WebGL1 only allows RepeatWrapping on POT
# textures, and the texture has to wrap in longitude or the normal calculation
# tears open along the date line.
OUT_W, OUT_H = 2048, 1024

HERE = Path(__file__).parent
CACHE = HERE / ".cache"


def fetch(url: str) -> Path:
    CACHE.mkdir(exist_ok=True)
    dest = CACHE / url.rsplit("/", 1)[-1]
    if dest.exists():
        print(f"  cached: {dest.name} ({dest.stat().st_size / 1e6:.1f} MB)")
        return dest
    print(f"  downloading {url}")
    urllib.request.urlretrieve(url, dest)
    print(f"  done: {dest.stat().st_size / 1e6:.1f} MB")
    return dest


def to_metres(elev: np.ndarray, bath: np.ndarray) -> np.ndarray:
    """Signed elevation in metres from the two half images.

    The land mask comes from the bathymetry: wherever it saturates at 255 there
    is land. That gives a clean coastline, which the topography alone could not
    because it fills both flat coastal strips and open ocean with 0.
    """
    land = bath == 255
    m = np.empty(elev.shape, dtype=np.float32)
    np.multiply(elev, ELEV_MAX / 255.0, out=m, where=land, casting="unsafe")
    depth = (bath.astype(np.float32) - 255.0) * (DEPTH_MAX / 255.0)
    return np.where(land, m, depth)


def smooth(field: np.ndarray, sigma: float = 0.75) -> np.ndarray:
    """Separable Gaussian, wrapping in longitude and clamped in latitude.

    The 8-bit source steps by 43 m in the ocean and 25 m on land. Flat regions
    such as the Sahara or the continental shelves are therefore patches that
    differ by a single grey level, and at 70x vertical exaggeration one level
    becomes a 3 km cliff — the globe grows a visible lattice. A sub-pixel blur
    removes it. Coastlines are gradients of several thousand metres and come
    through untouched.
    """
    radius = 3
    x = np.arange(-radius, radius + 1, dtype=np.float32)
    k = np.exp(-0.5 * (x / sigma) ** 2)
    k /= k.sum()

    rows = np.pad(field, ((0, 0), (radius, radius)), mode="wrap")
    field = sum(k[i] * rows[:, i : i + field.shape[1]] for i in range(len(k)))
    cols = np.pad(field, ((radius, radius), (0, 0)), mode="edge")
    return sum(k[i] * cols[i : i + field.shape[0], :] for i in range(len(k)))


def main() -> int:
    print("1/4  source data")
    im_e = Image.open(fetch(SRC_ELEV))
    im_b = Image.open(fetch(SRC_BATH))
    if im_e.size != im_b.size:
        sys.exit(f"size mismatch: {im_e.size} vs {im_b.size}")
    src_w, src_h = im_e.size

    print(f"2/4  convert, {DECIMATE}x{DECIMATE} block mean -> {MID_W}x{MID_H} -> {OUT_W}x{OUT_H}")
    # Block by block, otherwise two 233 MB greyscale images and their float32
    # copies sit in memory at once. Averaging happens in metres, not in grey
    # levels — otherwise the land and ocean scales get mixed at the coast.
    mid = np.empty((MID_H, MID_W), dtype=np.float32)
    for y0 in range(0, src_h, CHUNK_ROWS):
        y1 = min(y0 + CHUNK_ROWS, src_h)
        box = (0, y0, src_w, y1)
        e = np.asarray(im_e.crop(box).convert("L"))
        b = np.asarray(im_b.crop(box).convert("L"))
        block = to_metres(e, b)
        rows = (y1 - y0) // DECIMATE
        mid[y0 // DECIMATE : y0 // DECIMATE + rows] = block.reshape(
            rows, DECIMATE, MID_W, DECIMATE
        ).mean(axis=(1, 3))
        print(f"     row {y1}/{src_h}", end="\r")
    print()
    out = np.asarray(
        Image.fromarray(mid, "F").resize((OUT_W, OUT_H), Image.BOX), dtype=np.float32
    )
    out = smooth(out)

    print("3/4  sanity check")
    lat = (0.5 - (np.arange(OUT_H) + 0.5) / OUT_H) * 180.0
    w = np.cos(np.radians(lat))[:, None] * np.ones((1, OUT_W), dtype=np.float32)
    land_frac = float(w[out > 0].sum() / w.sum())
    print(f"     land fraction, area weighted: {land_frac * 100:.1f} %  (really 29.2 %)")
    print(f"     range: {out.min():.0f} m to {out.max():.0f} m")
    for name, la, lo, real in [
        ("Challenger Deep", 11.37, 142.59, -10924),
        ("N Atlantic abyss", 30.0, -45.0, -5000),
        ("Mid-Atlantic Ridge", 0.0, -25.0, -3000),
        ("Tibet", 32.0, 88.0, 5000),
        ("Denver", 39.74, -104.99, 1610),
        ("Amazon basin", -3.0, -60.0, 50),
    ]:
        y = int((90 - la) / 180 * OUT_H)
        x = int((lo + 180) / 360 * OUT_W)
        print(f"     {name:20s} {out[y, x]:8.0f} m   (really ~{real} m)")
    if not 0.25 < land_frac < 0.34:
        sys.exit(f"land fraction {land_frac:.3f} is implausible — check the calibration")

    print("4/4  12-bit RG encoding, lossless WebP")
    span = ELEV_MAX + DEPTH_MAX
    q = np.clip(np.rint((out + DEPTH_MAX) / span * 4095.0), 0, 4095).astype(np.uint16)
    rgb = np.zeros((OUT_H, OUT_W, 3), dtype=np.uint8)
    rgb[..., 0] = q >> 4
    rgb[..., 1] = (q & 0xF) << 4
    dest = HERE / "heightmap.webp"
    Image.fromarray(rgb, "RGB").save(dest, "WEBP", lossless=True, quality=100, method=6)
    size = dest.stat().st_size
    print(f"     {dest.name}: {size / 1e6:.2f} MB  (embedded {size * 4 / 3 / 1e6:.2f} MB)")
    print(f"     vertical resolution: {span / 4095:.1f} m per step")
    print()
    print("Constants index.html must repeat verbatim:")
    print(f"  SPAN = {span}, DEPTH_MAX = {DEPTH_MAX}, ELEV_TOP = {out.max():.0f}")
    print("  metres = (R*4080.0 + G*15.9375) / 4095.0 * SPAN - DEPTH_MAX   (R,G in 0..1)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
