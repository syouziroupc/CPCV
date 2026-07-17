from pathlib import Path
import pypdfium2 as pdfium

root = Path(__file__).resolve().parents[1]
pdf_path = root / "output" / "pdf" / "Class_PDF_Comment_Viewer_取扱説明書.pdf"
out = root / "tmp" / "pdfs" / "manual_render"
out.mkdir(parents=True, exist_ok=True)
pdf = pdfium.PdfDocument(str(pdf_path))
print(f"pages {len(pdf)}")
for i, page in enumerate(pdf):
    image = page.render(scale=1.35).to_pil()
    image.save(out / f"page-{i+1:02}.png")
