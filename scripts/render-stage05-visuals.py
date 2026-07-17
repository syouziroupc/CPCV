from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path

from bs4 import BeautifulSoup
from PIL import Image, ImageChops
from weasyprint import HTML

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "stage05-screenshots"
OUT.mkdir(parents=True, exist_ok=True)

BASE_HTML = (ROOT / "public" / "_admin_spa.html").read_text(encoding="utf-8")
CSS = (ROOT / "public" / "assets" / "app.css").read_text(encoding="utf-8")

ROWS = [
    ("15:24:01", "承認待ち", "この投稿は承認待ちです", "pending", "承認待ち", ["承認", "非表示", "削除"]),
    ("15:23:35", "表示中", "承認されて投影されるコメントです", "visible", "表示中", ["非表示", "削除"]),
    ("15:22:18", "非表示", "先生が非表示にしたコメントです", "hidden", "非表示", ["復元", "削除"]),
    ("15:21:04", "削除済み", "論理削除され監査用に保持されます", "deleted", "削除済み", ["復元"]),
]


def build_html(width: int, height: int) -> str:
    soup = BeautifulSoup(BASE_HTML, "html.parser")
    for tag in list(soup.find_all("link", href=re.compile(r"/assets/app\.css"))):
        tag.replace_with(soup.new_tag("style"))
        soup.style.string = CSS
    for tag in list(soup.find_all("script", src=re.compile(r"/assets/admin\.js"))):
        tag.decompose()

    extra = soup.new_tag("style")
    extra.string = f"""
      @page {{ size: {width}px {height}px; margin: 0; }}
      html, body {{ width: {width}px; min-height: {height}px; }}
      #loginSection, #createSection, #activeSessionsSection, #notFoundSection {{ display:none !important; }}
      #sessionSection {{ display:block !important; }}
      #logoutButton {{ display:inline-flex !important; }}
      .moderation-table-wrap {{ overflow:hidden; max-height:none; }}
      .local-log-section {{ display:none; }}
      {".two { grid-template-columns: 1fr; } .card { padding: 18px; } .teacher-item { align-items: stretch; flex-direction: column; }" if width <= 720 else ""}
    """
    soup.head.append(extra)

    values = {
        "sessionTitle": "Stage 5 モデレーション確認授業",
        "joinUrl": "https://example.invalid/j/ABCD23",
        "publicCode": "合言葉: ABCD23",
        "viewerUrl": "https://example.invalid/viewer/sess_stage5_visual",
        "postingState": "投稿: 受付中",
        "commentsState": "コメント表示: ON",
        "commentModeState": "表示方法: 右下へ3件",
        "moderationModeState": "投稿承認: 承認後に表示",
        "commentDisplayState": "表示時間: 1分",
        "sessionState": "残り: 5時間42分",
        "moderationStatus": "4件表示中",
        "documentInfo": "PDFは先生の端末だけで読み込みます。",
    }
    for element_id, value in values.items():
        element = soup.find(id=element_id)
        if element is None:
            raise RuntimeError(f"Missing visual fixture element: {element_id}")
        element.clear()
        element.append(value)

    body = soup.find(id="moderationBody")
    if body is None:
        raise RuntimeError("Missing moderationBody")
    body.clear()
    for time_text, nickname, message, state, label, actions in ROWS:
        row = soup.new_tag("tr")
        select_cell = soup.new_tag("td")
        checkbox = soup.new_tag("input", attrs={"type": "checkbox", "class": "moderation-select", "aria-label": "コメントを選択"})
        select_cell.append(checkbox)
        row.append(select_cell)
        for text in (time_text, nickname):
            cell = soup.new_tag("td")
            cell.string = text
            row.append(cell)
        message_cell = soup.new_tag("td", attrs={"class": "moderation-message"})
        message_cell.string = message
        row.append(message_cell)
        state_cell = soup.new_tag("td")
        badge = soup.new_tag("span", attrs={"class": f"moderation-state state-{state}"})
        badge.string = label
        state_cell.append(badge)
        row.append(state_cell)
        action_cell = soup.new_tag("td", attrs={"class": "moderation-actions"})
        for action in actions:
            classes = ["button", "small"]
            if action == "削除":
                classes.append("danger")
            button = soup.new_tag("button", attrs={"class": " ".join(classes), "type": "button"})
            button.string = action
            action_cell.append(button)
        row.append(action_cell)
        body.append(row)
    return str(soup)


def crop_to_content(path: Path) -> dict[str, int]:
    image = Image.open(path).convert("RGB")
    background = Image.new("RGB", image.size, image.getpixel((0, 0)))
    diff = ImageChops.difference(image, background)
    box = diff.getbbox()
    if box:
        left, top, right, bottom = box
        padding = 12
        box = (max(0, left - padding), 0, min(image.width, right + padding), min(image.height, bottom + padding))
        image = image.crop(box)
        image.save(path)
    return {"width": image.width, "height": image.height, "moderationRows": len(ROWS)}


def render(name: str, width: int, page_height: int) -> None:
    html = build_html(width, page_height)
    with tempfile.TemporaryDirectory(prefix="cpcv-stage05-visual-") as temp_dir:
        temp = Path(temp_dir)
        pdf = temp / f"{name}.pdf"
        png_prefix = temp / name
        HTML(string=html, base_url=str(ROOT), media_type="screen").write_pdf(pdf)
        subprocess.run([
            "pdftoppm", "-png", "-r", "96", "-singlefile", str(pdf), str(png_prefix)
        ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        source_png = Path(f"{png_prefix}.png")
        target = OUT / f"{name}.png"
        target.write_bytes(source_png.read_bytes())
    metrics = crop_to_content(target)
    if metrics["width"] > width + 2:
        raise RuntimeError(f"{name} exceeds target width: {metrics}")
    (OUT / f"{name}.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


render("admin-moderation-desktop", 1440, 2800)
render("admin-moderation-mobile", 390, 5200)
print(json.dumps({"ok": True, "outputDir": str(OUT)}, ensure_ascii=False, indent=2))
