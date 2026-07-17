from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

root = Path(__file__).resolve().parents[1]
src = root / "tmp" / "pdfs" / "manual_render"
files = sorted(src.glob("page-*.png"))
thumbs = []
for i, file in enumerate(files, 1):
    image = Image.open(file).convert("RGB")
    image.thumbnail((420, 594))
    framed = ImageOps.expand(image, border=2, fill="#94a3b8")
    canvas = Image.new("RGB", (440, 630), "white")
    canvas.paste(framed, ((440-framed.width)//2, 22))
    ImageDraw.Draw(canvas).text((12, 5), f"Page {i}", fill="#0f172a")
    thumbs.append(canvas)
cols = 3
rows = (len(thumbs)+cols-1)//cols
sheet = Image.new("RGB", (cols*440, rows*630), "#e2e8f0")
for i, thumb in enumerate(thumbs):
    sheet.paste(thumb, ((i%cols)*440, (i//cols)*630))
sheet.save(src / "contact-sheet.png")
