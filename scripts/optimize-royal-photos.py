#!/usr/bin/env python3
"""Compress redistributable Commons image thumbnails for instant mobile delivery.
Preserves the original source/creator/license manifest and strips camera location EXIF.
"""
import io
import json
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1] / "public" / "art" / "royal" / "photos"
manifest_path = root / "manifest.json"
records = json.loads(manifest_path.read_text("utf-8"))
updated = 0
original_bytes = 0
final_bytes = 0
for item in records.get("photos", []):
    filename = root / f"{item['id']}.jpg"
    if not filename.exists():
        continue
    raw = filename.read_bytes()
    original_bytes += len(raw)
    if item.get("optimized"):
        final_bytes += len(raw)
        continue
    with Image.open(io.BytesIO(raw)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((1600, 1400), Image.Resampling.LANCZOS)
        stream = io.BytesIO()
        image.save(stream, "JPEG", quality=82, optimize=True, progressive=True, subsampling=2)
        result = stream.getvalue()
    if len(result) < len(raw):
        filename.write_bytes(result)
        updated += 1
        size = len(result)
    else:
        size = len(raw)
    item["bytes"] = size
    item["optimized"] = True
    item.pop("skipped", None)
    final_bytes += size
records["optimization"] = {
    "resolution": "max 1600x1400",
    "format": "progressive JPEG",
    "quality": 82,
    "metadata": "Camera EXIF removed; credits preserved in manifest and UI",
}
manifest_path.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("ROYAL_PHOTO_OPTIMIZED", json.dumps({
    "images": len(records.get("photos", [])),
    "optimized": updated,
    "original_bytes": original_bytes,
    "final_bytes": final_bytes,
    "savings_pct": round(100 * (original_bytes - final_bytes) / max(1, original_bytes), 1)
}))
