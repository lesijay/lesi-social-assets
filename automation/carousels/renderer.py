#!/usr/bin/env python3
"""Reference-derived carousel renderer. Requires PRIVATE owner-authorized image backgrounds.
No Canva, Work, generative photo, external API or paid account required.
Use: python -m pip install Pillow
     python automation/carousels/renderer.py --config /path/to/post.json --out /path/to/output
Private image templates MUST NOT be committed into this public repo.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import argparse
import hashlib
import json
import re
import subprocess

WIDTH, HEIGHT = 1080, 1350
PALETTE = {"plum": (43, 17, 45), "lavender": (188, 113, 221), "muted": (77, 65, 80)}

def norm(s):
    return re.sub(r"\s+", " ", s).strip()

def font_path(bold):
    choices = ["Inter Display:style=Black", "Inter:style=Black", "DejaVu Sans:style=Bold"] if bold else ["Inter Display", "Inter", "DejaVu Sans"]
    for family in choices:
        found = subprocess.check_output(["fc-match", family, "-f", "%{file}"]).decode().strip()
        if found and Path(found).exists():
            return found
    raise FileNotFoundError("No suitable system sans-serif font found")

def wrapped(draw, text, font, max_width):
    lines = []
    line = ""
    for word in text.split():
        if draw.textlength(word, font=font) > max_width:
            raise ValueError("Word exceeds line width")
        next_line = (line + " " + word).strip()
        if line and draw.textlength(next_line, font=font) > max_width:
            lines.append(line)
            line = word
        else:
            line = next_line
    if line:
        lines.append(line)
    return lines

def render(config_path, out_dir):
    config_path = Path(config_path).resolve()
    cfg = json.loads(config_path.read_text(encoding="utf-8"))
    slides = cfg["slides"]
    assert 2 <= len(slides) <= 10
    assert len(slides) == len(cfg["approved_copy"])
    content_id = cfg["id"]
    assert re.fullmatch(r"[A-Za-z0-9-]+", content_id)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    fonts = {False: font_path(False), True: font_path(True)}
    manifest = []
    images = []
    for i, (page, approved) in enumerate(zip(slides, cfg["approved_copy"]), 1):
        source = Path(page["background"])
        source = source if source.is_absolute() else config_path.parent / source
        im = Image.open(source).convert("RGB")
        if im.size != (WIDTH, HEIGHT):
            raise ValueError(f"Page {i}: wrong template dimensions")
        d = ImageDraw.Draw(im)
        assembled = " ".join(b["text"] for b in page["blocks"])
        if norm(assembled) != norm(approved):
            raise ValueError(f"Page {i}: unapproved text change")
        for block in page["blocks"]:
            val, x, y = block["text"], int(block["x"]), int(block["y"])
            max_w, sz = int(block["max_width"]), int(block["size"])
            bold = bool(block.get("bold", False))
            color = PALETTE[block["color"]]
            limit = int(block.get("max_bottom", 1167))
            is_wrapped = bool(block.get("wrap", False))
            while True:
                font = ImageFont.truetype(fonts[bold], sz)
                lines = wrapped(d, val, font, max_w) if is_wrapped else [val]
                lh = int(sz * block.get("leading", 1.16))
                fits = all(d.textlength(line, font=font) <= max_w for line in lines)
                if fits and y + lh * len(lines) <= limit:
                    break
                sz -= 1
                if sz < 32:
                    raise ValueError(f"Page {i}: text overflow; human editor needed")
            for j, line in enumerate(lines):
                box = d.textbbox((x, y + lh*j), line, font=font, anchor="lt")
                if box[2] > WIDTH-52 or box[3] > limit:
                    raise ValueError(f"Page {i}: text intersects unsafe area")
                d.text((x, y + lh*j), line, font=font, fill=color, anchor="lt")
        path = out / f"{content_id}_{i:02d}.png"
        im.save(path, optimize=True)
        im.save(out / f"{content_id}_{i:02d}.jpg", "JPEG", quality=95, subsampling=0)
        images.append(im)
        manifest.append({"page": i, "filename": path.name,
                         "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                         "dimensions": [WIDTH, HEIGHT], "approved_copy": approved})
    thumb_w, thumb_h = 320, HEIGHT * 320 // WIDTH
    sheet = Image.new("RGB", (thumb_w*len(images), thumb_h+25), (243,241,238))
    for j, page in enumerate(images):
        sheet.paste(page.resize((thumb_w,thumb_h), Image.Resampling.LANCZOS), (j*thumb_w,25))
        ImageDraw.Draw(sheet).text((j*thumb_w+6,5), f"{j+1:02d}/{len(images):02d}", fill=PALETTE["plum"])
    sheet.save(out / f"{content_id}_OVERVIEW.jpg", quality=92)
    report = {"id": content_id, "state": "REQUIRES_QA_NOT_PUBLISHED",
              "renderer": "reference-derived v1", "master": cfg.get("master"),
              "pages": manifest}
    (out / f"{content_id}_manifest.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps({"id": content_id, "slides": len(images),
                      "output": str(out), "state": "REQUIRES_QA"}))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    render(args.config, args.out)
