#!/usr/bin/env python3
"""
Generate Android launcher icon PNGs from src/assets/icon.png.

Usage:
    pip install Pillow
    python3 scripts/generate_android_icons.py

Source:  src/assets/icon.png  (1024×1024 RGBA PNG)
Output:  android/app/src/main/res/mipmap-<density>/
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

REPO_ROOT = Path(__file__).parent.parent
SRC = REPO_ROOT / "src" / "assets" / "icon.png"
MIPMAP_BASE = REPO_ROOT / "android" / "app" / "src" / "main" / "res"

# Legacy launcher icon sizes (48 dp base), keyed by mipmap density folder.
LEGACY_SIZES: dict[str, int] = {
    "mipmap-ldpi":    36,
    "mipmap-mdpi":    48,
    "mipmap-hdpi":    72,
    "mipmap-xhdpi":   96,
    "mipmap-xxhdpi":  144,
    "mipmap-xxxhdpi": 192,
}

# Adaptive icon layer canvas sizes (108 dp base).
ADAPTIVE_SIZES: dict[str, int] = {
    "mipmap-ldpi":    81,
    "mipmap-mdpi":    108,
    "mipmap-hdpi":    162,
    "mipmap-xhdpi":   216,
    "mipmap-xxhdpi":  324,
    "mipmap-xxxhdpi": 432,
}


def write_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"  {path.relative_to(REPO_ROOT)}")


def main() -> None:
    if not SRC.exists():
        sys.exit(f"Source image not found: {SRC}")

    src = Image.open(SRC).convert("RGBA")
    print(f"Source: {SRC.relative_to(REPO_ROOT)}  ({src.width}×{src.height})")

    # 1. Legacy ic_launcher.png — square, icon on white background.
    print("\nLegacy ic_launcher.png:")
    for density, size in LEGACY_SIZES.items():
        bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        icon = src.resize((size, size), Image.LANCZOS)
        bg.paste(icon, (0, 0), icon)
        write_png(bg.convert("RGB"), MIPMAP_BASE / density / "ic_launcher.png")

    # 2. Legacy ic_launcher_round.png — circular crop on transparent background.
    print("\nLegacy ic_launcher_round.png:")
    for density, size in LEGACY_SIZES.items():
        icon = src.resize((size, size), Image.LANCZOS)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        bg.paste(icon, (0, 0), icon)
        result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        result.paste(bg, mask=mask)
        write_png(result, MIPMAP_BASE / density / "ic_launcher_round.png")

    # 3. Adaptive ic_launcher_foreground.png
    #    Canvas is 108 dp; icon is placed in the 72 dp safe zone (66.7 % of canvas).
    #    The ic_launcher_foreground_inset.xml wrapper adds an extra 16.7 % inset at
    #    runtime, so the foreground PNG itself fills the full safe zone without padding.
    print("\nAdaptive ic_launcher_foreground.png:")
    for density, canvas in ADAPTIVE_SIZES.items():
        icon_size = round(canvas * 72 / 108)
        offset = (canvas - icon_size) // 2
        icon = src.resize((icon_size, icon_size), Image.LANCZOS)
        canvas_img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        canvas_img.paste(icon, (offset, offset), icon)
        write_png(canvas_img, MIPMAP_BASE / density / "ic_launcher_foreground.png")

    # 4. Adaptive ic_launcher_background.png — solid white fill.
    print("\nAdaptive ic_launcher_background.png:")
    for density, canvas in ADAPTIVE_SIZES.items():
        bg = Image.new("RGB", (canvas, canvas), (255, 255, 255))
        write_png(bg, MIPMAP_BASE / density / "ic_launcher_background.png")

    print("\nDone.")


if __name__ == "__main__":
    main()
