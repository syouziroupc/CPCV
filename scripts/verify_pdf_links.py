from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

root = Path(__file__).resolve().parents[1]
path = root / "tmp" / "pdf-link-test.pdf"
path.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(path), pagesize=A4)
c.drawString(72, 760, "External link")
c.linkURL("https://example.com", (68, 752, 180, 775), relative=0)
c.drawString(72, 720, "Go to page 2")
c.bookmarkPage("page1")
c.linkRect("", "page2", (68, 712, 180, 735), relative=0)
c.showPage()
c.bookmarkPage("page2")
c.drawString(72, 760, "Page 2")
c.save()
print(path)
