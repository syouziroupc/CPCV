from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, Flowable, ListFlowable, ListItem
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "Class_PDF_Comment_Viewer_取扱説明書.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

FONT_CANDIDATES = [
    Path(r"C:\Windows\Fonts\NotoSansJP-VF.ttf"),
    Path(r"C:\Windows\Fonts\YuGothR.ttc"),
    Path("/usr/share/fonts/truetype/noto/NotoSansJP-Regular.ttf"),
]
FONT = next((path for path in FONT_CANDIDATES if path.exists()), None)
if FONT is not None and FONT.suffix.lower() == ".ttf":
    FONT_NAME = "JP"
    pdfmetrics.registerFont(TTFont(FONT_NAME, str(FONT)))
else:
    # ReportLab cannot embed the common OpenType/CFF Noto CJK collection.
    # The built-in Japanese CID font keeps the generator portable.
    FONT_NAME = "HeiseiKakuGo-W5"
    pdfmetrics.registerFont(UnicodeCIDFont(FONT_NAME))
pdfmetrics.registerFontFamily(
    FONT_NAME,
    normal=FONT_NAME,
    bold=FONT_NAME,
    italic=FONT_NAME,
    boldItalic=FONT_NAME,
)

NAVY = colors.HexColor("#0f172a")
BLUE = colors.HexColor("#2563eb")
SKY = colors.HexColor("#dbeafe")
PALE = colors.HexColor("#f8fafc")
GRAY = colors.HexColor("#64748b")
BORDER = colors.HexColor("#cbd5e1")
GREEN = colors.HexColor("#15803d")
AMBER = colors.HexColor("#b45309")
RED = colors.HexColor("#b91c1c")

styles = getSampleStyleSheet()
base = ParagraphStyle("base", fontName=FONT_NAME, fontSize=9.3, leading=15, textColor=NAVY)
h1 = ParagraphStyle("h1", parent=base, fontSize=22, leading=29, textColor=NAVY, spaceAfter=10)
h2 = ParagraphStyle("h2", parent=base, fontSize=16, leading=22, textColor=BLUE, spaceBefore=4, spaceAfter=9)
h3 = ParagraphStyle("h3", parent=base, fontSize=11.5, leading=17, textColor=NAVY, spaceBefore=5, spaceAfter=5)
small = ParagraphStyle("small", parent=base, fontSize=7.8, leading=11.5, textColor=GRAY)
center = ParagraphStyle("center", parent=base, alignment=TA_CENTER)
caption = ParagraphStyle("caption", parent=small, alignment=TA_CENTER, spaceBefore=4)
callout = ParagraphStyle("callout", parent=base, fontSize=9, leading=14)

def P(text, style=base):
    return Paragraph(text, style)

def bullets(items, level=0):
    return ListFlowable(
        [ListItem(P(x), leftIndent=4*mm) for x in items],
        bulletType="bullet", leftIndent=(5 + level*4)*mm, bulletFontName=FONT_NAME,
        bulletFontSize=7, spaceAfter=5
    )

def numbered(items):
    return ListFlowable(
        [ListItem(P(x), leftIndent=5*mm) for x in items],
        bulletType="1", start="1", leftIndent=7*mm, bulletFontName=FONT_NAME,
        bulletFontSize=8, spaceAfter=5
    )

def info_box(title, text, color=BLUE, bg=SKY):
    t = Table([[P(f"<b>{title}</b>", callout)], [P(text, callout)]], colWidths=[174*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("BOX", (0,0), (-1,-1), 0.8, color),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    return t

class MockScreen(Flowable):
    def __init__(self, kind, width=174*mm, height=73*mm):
        super().__init__()
        self.kind, self.width, self.height = kind, width, height

    def draw_button(self, c, x, y, w, label, fill=BLUE, fg=colors.white):
        c.setFillColor(fill); c.roundRect(x, y, w, 15, 4, fill=1, stroke=0)
        c.setFillColor(fg); c.setFont(FONT_NAME, 7); c.drawCentredString(x+w/2, y+4.5, label)

    def draw(self):
        c = self.canv; w = self.width; h = self.height
        c.setFillColor(colors.white); c.setStrokeColor(BORDER)
        c.roundRect(0, 0, w, h, 7, fill=1, stroke=1)
        c.setFillColor(NAVY); c.roundRect(0, h-20, w, 20, 7, fill=1, stroke=0)
        c.setFillColor(colors.white); c.setFont(FONT_NAME, 8)
        titles = {"home":"トップページ", "admin":"授業管理", "viewer":"投影画面", "student":"学生投稿画面", "logs":"端末内コメントログ"}
        c.drawString(9, h-13, titles[self.kind])
        if self.kind == "home":
            c.setFillColor(NAVY); c.setFont(FONT_NAME, 13); c.drawString(16, h-45, "授業コメント表示")
            self.draw_button(c, 16, h-70, 74, "先生用 授業管理")
            c.setFillColor(NAVY); c.setFont(FONT_NAME, 9); c.drawString(16, h-95, "学生はこちら - 授業の合言葉")
            c.setFillColor(PALE); c.setStrokeColor(BORDER); c.roundRect(16, h-120, 80, 18, 4, fill=1, stroke=1)
            c.setFillColor(GRAY); c.setFont(FONT_NAME, 8); c.drawString(23, h-114, "ABC123")
            self.draw_button(c, 103, h-120, 60, "授業コメントへ")
        elif self.kind == "student":
            c.setFillColor(NAVY); c.setFont(FONT_NAME, 12); c.drawString(14, h-43, "観光文化論 第4回")
            c.setFillColor(colors.HexColor("#fffbeb")); c.setStrokeColor(colors.HexColor("#f59e0b"))
            c.roundRect(14, h-78, w-28, 26, 4, fill=1, stroke=1)
            c.setFillColor(AMBER); c.setFont(FONT_NAME, 6.6)
            c.drawString(20, h-65, "投稿内容・投稿日時は一定期間保存。IPアドレスは保存しません。")
            c.setFillColor(PALE); c.setStrokeColor(BORDER); c.roundRect(14, h-122, w-28, 32, 4, fill=1, stroke=1)
            c.setFillColor(GRAY); c.drawString(20, h-104, "質問、反応、分からない点など（140字以内）")
            self.draw_button(c, w-66, 12, 50, "送信")
        elif self.kind == "admin":
            c.setFillColor(NAVY); c.setFont(FONT_NAME, 12); c.drawString(12, h-43, "観光文化論 第4回")
            labels = ["投稿停止","表示OFF","3件 ▼","承認後表示","表示を消す","授業終了"]
            x=12
            for i,label in enumerate(labels):
                bw = 46 if i < 2 else 34 if i < 4 else 62
                self.draw_button(c, x, h-70, bw, label, colors.HexColor("#475569"))
                x += bw+5
            c.setFillColor(PALE); c.setStrokeColor(BORDER); c.roundRect(12, 12, w-24, h-100, 4, fill=1, stroke=1)
            c.setFillColor(NAVY); c.setFont(FONT_NAME, 8); c.drawString(20, h-92, "学生リンク / 合言葉: ABC123    承認待ち 2件 / 表示中 5件")
        elif self.kind == "viewer":
            c.setFillColor(colors.HexColor("#1f2937")); c.rect(0,0,w,h-20,fill=1,stroke=0)
            c.setFillColor(colors.white); c.rect(28,10,w-56,h-48,fill=1,stroke=0)
            c.setFillColor(colors.HexColor("#020617")); c.roundRect(8,h-39,w-16,15,4,fill=1,stroke=0)
            labels=["PDFを選択","QR大","QR隅","‹  2/10  ›","CSV","ログ消去","退出"]
            x=12
            for label in labels:
                bw=42 if label not in ["‹  2/10  ›","ログ消去"] else 51
                self.draw_button(c,x,h-38,bw,label,colors.HexColor("#334155"))
                x += bw+4
            c.setFillColor(BLUE); c.setFont(FONT_NAME,8)
            c.drawCentredString(w/2, 4, "PDFをクリック：次ページ ／ ←：前ページ ／ →：次ページ")
        elif self.kind == "logs":
            headers=["投稿日時","名前","コメント"]
            xs=[10,62,96]
            c.setFillColor(colors.HexColor("#e2e8f0")); c.rect(8,h-43,w-16,17,fill=1,stroke=0)
            c.setFillColor(NAVY); c.setFont(FONT_NAME,7)
            for x,label in zip(xs,headers): c.drawString(x,h-37,label)
            rows=[
                ("15:21:08","匿名","この用語の意味は？"),
                ("15:20:41","山田","もう一度説明してください"),
                ("15:19:02","匿名","理解できました"),
            ]
            y=h-58
            for row in rows:
                c.setStrokeColor(BORDER); c.line(8,y-5,w-8,y-5)
                for x,text in zip(xs,row):
                    c.setFillColor(NAVY); c.setFont(FONT_NAME,6.5); c.drawString(x,y,text[:22])
                y-=20
            c.setFillColor(GREEN); c.setFont(FONT_NAME,7); c.drawString(10,10,"最新が一番上・同一PC/同一ブラウザ・自動更新中")

def spec_table(rows, widths=(48*mm,126*mm)):
    data=[[P(f"<b>{a}</b>", small),P(b, small)] for a,b in rows]
    t=Table(data,colWidths=list(widths),repeatRows=0)
    t.setStyle(TableStyle([
        ("VALIGN",(0,0),(-1,-1),"TOP"),("GRID",(0,0),(-1,-1),0.5,BORDER),
        ("BACKGROUND",(0,0),(0,-1),colors.HexColor("#f1f5f9")),
        ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),
        ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
    ]))
    return t

def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont(FONT_NAME, 7)
    canvas.setFillColor(GRAY)
    canvas.drawString(18*mm, 10*mm, "Class PDF Comment Viewer 取扱説明書")
    canvas.drawRightString(192*mm, 10*mm, f"{doc.page}")
    canvas.setStrokeColor(BORDER); canvas.line(18*mm, 14*mm, 192*mm, 14*mm)
    canvas.restoreState()

story=[]
story += [Spacer(1,18*mm), P("Class PDF Comment Viewer", ParagraphStyle("cover",parent=h1,fontSize=28,leading=36,alignment=TA_CENTER)),
          P("授業コメント表示システム 取扱説明書", ParagraphStyle("cover2",parent=h2,fontSize=18,alignment=TA_CENTER,textColor=BLUE)),
          Spacer(1,8*mm), MockScreen("viewer", width=174*mm, height=78*mm), Spacer(1,8*mm),
          info_box("この説明書について","先生が授業を作成し、学生がコメントを投稿し、PDF投影画面へ表示するまでの操作を説明します。端末内ログ、CSV、重複ログイン、トラブル対応も含みます。"),
          Spacer(1,8*mm), P("対象バージョン：Stage 6 Realtime安定化版", center),
          P("公開URL：https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev", center), PageBreak()]

story += [P("1. まず知っておくこと", h1),
          P("このシステムは、先生のPCでローカルPDFを表示しながら、学生のコメントをリアルタイムに重ねて表示する授業支援ツールです。", base),
          Spacer(1,3*mm),
          spec_table([
              ("PDF","先生PC内だけで開きます。Cloudflareへアップロードされません。"),
              ("コメント記録","コメント本文と投稿日時を新版D1へ一定期間保存します。生IP、User-Agent、端末指紋は保存しません。"),
              ("授業の有効時間","授業作成から6時間。期限後は自動的に閉じます。"),
              ("先生ログイン","ログインセッションは約12時間。複数端末・複数ブラウザから同時ログインできます。"),
              ("学生投稿","1投稿140字以内。同じ端末からの連投は約10秒制限。URLを含む投稿は禁止。授業設定により承認後に表示します。"),
              ("表示方法","右下へ3件・5件・7件、または横流れ。表示時間・速度も変更できます。"),
              ("投稿承認","自動表示または承認後に表示を授業単位で選べます。"),
              ("再接続","一時的に通信が切れても順序番号から不足分を自動復元します。"),
          ]),
          Spacer(1,6*mm), P("全体の流れ", h2),
          numbered(["先生が「授業管理」へログインする。","授業名を入力して新しい授業を作成する。","学生へリンク・QRコード・6文字の合言葉を案内する。","投影画面を開き、授業で使うPDFを選択する。","学生がコメントを投稿する。","授業後、必要ならCSVを保存し、授業を終了する。"]),
          info_box("重要","D1の保存記録が正本です。投影端末のIndexedDBは画面表示を補助するcacheです。CSVは認証済みserver endpointから取得します。",AMBER,colors.HexColor("#fffbeb")), PageBreak()]

story += [P("2. 学生の参加方法", h1), MockScreen("home"), P("トップページから参加する場合", h2),
          numbered(["公開URLを開く。","「学生はこちら」の欄へ先生から聞いた6文字の合言葉を入力する。英字は自動的に大文字になります。","「授業コメントへ」を押す。Enterキーでも移動できます。"]),
          P("リンク・QRコードから参加する場合", h2),
          bullets(["先生から配られた学生リンクを開く。","投影画面の「QR大」または「QR隅」に表示されたQRコードをスマートフォンで読み取る。"]),
          info_box("合言葉が通らないとき","文字数が6文字か確認してください。授業終了済み、作成から6時間経過、入力間違いの場合は参加できません。",AMBER,colors.HexColor("#fffbeb")), PageBreak()]

story += [P("3. 学生の投稿方法", h1), MockScreen("student"),
          numbered(["授業名と投稿可能表示を確認する。","名前は任意。匿名のままでも投稿できます。","コメント欄へ140字以内で入力する。","「送信」を押す。自動表示では送信完了。承認方式では承認待ちと表示されます。"]),
          P("投稿時の制限", h2),
          bullets(["同じ端末から続けて投稿する場合は、約10秒待つ必要があります。","http://、https://、www. を含むURLは投稿できません。","先生が投稿を停止している間は送信できません。"]),
          info_box("記録に関する表示","投稿画面には、投稿内容と投稿日時を一定期間保存すること、生IPを保存しないことを表示します。",BLUE,SKY), PageBreak()]

story += [P("4. 先生：授業の作成", h1), MockScreen("admin"),
          numbered(["トップページの「先生用 授業管理」を押す。","発行済みの先生IDとパスワードでログインする。","「新しい授業」で授業名を入力し、「授業を作成」を押す。","学生リンク、合言葉、投影画面URLが表示される。"]),
          P("授業詳細で確認できるもの", h2),
          spec_table([
              ("学生に配るリンク","学生が直接投稿画面へ入るURL。コピーボタンがあります。"),
              ("合言葉","トップページから参加するときの6文字コード。"),
              ("投影画面","PDFとコメントを教室で表示する先生用画面。"),
              ("残り時間","授業が自動終了するまでの時間。"),
          ]),
          info_box("先生IDとパスワード","学生へ共有しないでください。学生にはリンク・QRコード・合言葉だけを案内します。",RED,colors.HexColor("#fef2f2")), PageBreak()]

story += [P("5. 先生：投影画面とPDF操作", h1), MockScreen("viewer"),
          P("PDFの表示", h2),
          numbered(["授業管理で「投影画面を開く」を押す。","必要なら先生ID・パスワードでログインする。","「PDFを選択」を押し、授業で使うPDFを選ぶ。PDFは先生PC内だけで処理されます。"]),
          P("ページ送り", h2),
          spec_table([
              ("PDFを左クリック","次のページへ進む。フォーカス状態に依存しないため、通常操作はこちらが簡単です。"),
              ("右矢印キー →","次のページへ進む。入力欄を操作中は反応しません。"),
              ("左矢印キー ←","前のページへ戻る。入力欄を操作中は反応しません。"),
              ("‹ / › ボタン","前ページ／次ページへ移動。PDFクリックとは別要素なので二重動作しません。"),
          ]),
          info_box("ボタンとの競合","PDFクリック送りは白いPDFキャンバスだけに設定されています。右上のQR、CSV、ログ消去、退出などを押してもページは進みません。",GREEN,colors.HexColor("#f0fdf4")),
          Spacer(1,4*mm),
          info_box("通信が一時的に切れた場合","投影画面は自動で再接続し、保存済みの順序番号から不足コメントを復元します。同じコメントを二重表示しません。授業終了またはログイン失効時は再接続を停止します。",BLUE,SKY), PageBreak()]

story += [P("6. コメント表示の操作", h1),
          spec_table([
              ("投稿を停止／再開","学生の新規投稿受付を切り替えます。"),
              ("コメント表示OFF／ON","投影画面への表示を切り替えます。表示OFFでもD1の保存記録は維持されます。"),
              ("投稿承認","自動表示では保存後すぐ表示。承認後に表示ではpendingとして保存します。"),
              ("3件・5件・7件","右下へ同時表示するコメント数を選びます。"),
              ("横流れ","コメントを画面右から左へ流します。"),
              ("表示時間／速度","積み上げ表示では10秒～5分。横流れでは最高速～とても遅いを選択します。"),
              ("表示コメントを消す","現在の表示待ち・画面上コメントを消します。端末内ログは削除しません。"),
              ("QR大","学生投稿リンクの大きなQRコードを表示します。背景を押すと閉じます。"),
              ("QR隅","投影中も残せる小型QRコードを表示・非表示にします。"),
          ]),
          Spacer(1,5*mm), P("キーボードショートカット", h2),
          spec_table([("F","全画面表示を切り替える。"),("C","コメント表示を一時的にON/OFFする。"),("Q","大きなQRコードを表示／非表示にする。"),("← / →","PDFの前ページ／次ページ。")]),
          info_box("注意","Cキーによる表示切替は投影画面側の一時操作です。授業全体の設定変更には管理画面のボタンを使ってください。",AMBER,colors.HexColor("#fffbeb")), PageBreak()]

story += [P("7. 手動モデレーション", h1),
          P("授業管理の「保存コメントとモデレーション」で保存済みコメントを確認します。", base),
          Spacer(1,4*mm),
          spec_table([
              ("承認待ち","「承認」で表示します。「非表示」または「削除」も選べます。"),
              ("表示中","「非表示」または「削除」で投影画面から撤回します。"),
              ("非表示","保存記録は維持します。「復元」で再表示できます。"),
              ("削除済み","論理削除です。retentionまで監査用に保持します。最初の復元では非表示へ戻ります。"),
              ("選択操作","最大25件まで承認。非表示。復元。削除を一括実行できます。"),
              ("表示コメントを消す","投影画面だけをclearします。保存stateは変わりません。"),
          ]),
          Spacer(1,5*mm),
          P("削除済みコメントの安全な復元", h2),
          numbered(["削除済みコメントで「復元」を押す。","コメントはまず非表示へ戻る。投影画面には出ない。","内容を確認する。","再表示してよい場合だけ、もう一度「復元」を押す。"]),
          info_box("競合時","別の先生が先に操作した場合は再読み込みを求められます。古い画面の状態で上書きしません。",AMBER,colors.HexColor("#fffbeb")), PageBreak()]

story += [P("8. 端末内コメントログ", h1), MockScreen("logs"),
          P("保存される項目", h2),
          bullets(["投稿日時","名前（任意）","コメント本文","授業名・授業ID","保存期限"]),
          P("管理画面での確認", h2),
          bullets(["授業詳細の下部に「この端末の受信ログ」が常時表示されます。","最新コメントが一番上です。","投影画面が受信すると同一ブラウザ内の補助cacheも更新します。","管理画面は同じbrowser内の補助cacheを定期的に再確認します。","「再読み込み」で手動更新もできます。"]),
          P("CSV保存と削除", h2),
          bullets(["投影画面の「CSV」で、認証済みserver endpointから授業記録を取得します。","「ログ消去」は、その端末の表示用cacheだけを削除します。D1の保存記録は削除しません。","「表示コメントを消す」と「ログ消去」は別操作です。"]),
          info_box("保存範囲","D1の記録は設定された保存期限まで保持されます。端末内cacheはサイトデータ削除などで消える可能性があります。必要な記録はCSVでも保管してください。",RED,colors.HexColor("#fef2f2")), PageBreak()]

story += [P("9. 授業終了と安全な片付け", h1),
          P("推奨手順", h2),
          numbered(["管理画面の端末内ログを確認する。","必要なら投影画面の「CSV」で保存する。","学生の投稿を止める場合は「投稿を停止」を押す。","授業が終わったら「授業終了」を押す。","端末にログを残さない場合は、CSV保存を確認してから「ログ消去」を押す。","投影画面を閉じ、必要なら「退出」または管理画面の「ログアウト」を押す。"]),
          P("似ている操作の違い", h2),
          spec_table([
              ("授業終了","投稿を停止し、授業を終了状態にします。"),
              ("一覧から消す","授業を削除状態にし、進行中一覧から除外します。"),
              ("ログアウト／退出","そのブラウザの先生ログインを終了します。他端末のログインは切れません。"),
              ("ログ消去","先生PC内のIndexedDBログだけを削除します。"),
              ("表示コメントを消す","画面表示と表示待ちコメントだけを消します。"),
          ]), PageBreak()]

story += [P("10. 複数端末・重複ログインの仕様", h1),
          P("同じ先生IDで複数端末・複数ブラウザへ同時ログインできます。後からログインしても先のログインは切断されません。", base),
          Spacer(1,4*mm),
          spec_table([
              ("ログイン","ログインごとに別のセッショントークンを発行。約12時間有効。"),
              ("コメント配信","同じ授業へ接続中の投影画面すべてに配信されます。"),
              ("授業設定","投稿ON/OFF、表示方法などは授業単位で共有されます。"),
              ("PDF","各端末で個別に選択します。ページ位置も同期しません。"),
              ("端末内cache","各端末・各browserの表示補助です。記録の正本はD1です。"),
              ("ログアウト","ログアウトしたブラウザだけ無効。他端末は継続します。"),
          ]),
          info_box("運用のおすすめ","CSVを保管する担当者と保存場所を決めてください。画面表示用cacheを正式記録として扱わないでください。",GREEN,colors.HexColor("#f0fdf4")), PageBreak()]

story += [P("11. 困ったとき", h1),
          spec_table([
              ("学生が参加できない","合言葉6文字、授業が進行中か、作成から6時間以内かを確認。"),
              ("送信ボタンが押せない","コメントが空でないか、投稿停止中でないか確認。"),
              ("連投制限と表示される","約10秒待ってから再送信。"),
              ("コメントが映らない","管理画面の「コメント表示」がONか、投影画面の接続表示を確認。Cキーで一時OFFになっていないか確認。"),
              ("接続中・再接続中のまま","ネットワークを確認し、30秒程度待つ。復旧しない場合は投影画面を再読み込みする。保存済みコメントはD1から復元されます。"),
              ("ログが管理画面にない","投影画面と管理画面が同じPC・同じブラウザか確認。投影画面が投稿時に開いていたか確認。"),
              ("PDFが開けない","PDF形式か確認し、別のPDFで試す。ページ更新後はPDFを選び直す。"),
              ("矢印キーが効かない","入力欄にカーソルがある場合は効きません。PDFを左クリックするか、‹ / › ボタンを使用。"),
              ("上部ボタンが狭い","画面幅が狭い場合は上部バーを横スクロール。ブラウザの表示倍率も確認。"),
          ]),
          Spacer(1,6*mm),
          info_box("授業前チェック","①先生ログイン ②授業作成 ③学生リンク確認 ④投影画面ログイン ⑤PDF選択 ⑥QR表示 ⑦テスト投稿 ⑧管理画面ログ反映確認",BLUE,SKY),
          Spacer(1,6*mm),
          info_box("授業後チェック","①投稿停止 ②ログ確認 ③CSV保存 ④授業終了 ⑤必要なら端末ログ消去 ⑥ログアウト",GREEN,colors.HexColor("#f0fdf4")), PageBreak()]

story += [P("12. 仕様一覧", h1),
          spec_table([
              ("サービス","Cloudflare Workers / Static Assets / Durable Objects / D1"),
              ("D1の用途","組織、認証、授業、コメント本文、投稿日時、監査情報を保存します。生IPは保存しません。"),
              ("コメント中継","D1の順序番号を正本とし、Durable Object WebSocket Hibernationで配信します。切断時はcatch-upします。"),
              ("ローカルcache","ブラウザIndexedDB。表示補助のみ。CSVはserver保存記録から出力します。"),
              ("PDF描画","PDF.js。ファイルは先生端末内だけで読み込み。"),
              ("コメント長","最大140字。改行等は整理して送信。URL禁止。"),
              ("投稿間隔","授業単位の匿名participant tokenごとに約10秒。"),
              ("授業時間","作成後6時間。"),
              ("先生セッション","約12時間。重複ログイン可。"),
              ("コメント表示","3件／5件／7件／横流れ。"),
              ("手動モデレーション","承認待ち。非表示。削除。二段階復元。一括操作は最大25件。"),
              ("Realtime復旧","一回限り接続ticket。順序番号。重複排除。自動catch-up。"),
              ("ログ即時更新","BroadcastChannel。補助として5秒ごとにローカル確認。"),
          ]),
          Spacer(1,7*mm),
          P("個人情報の取り扱い", h2),
          P("投稿内容と投稿日時は授業運営と不適切投稿対応のため一定期間D1へ保存されます。生IP、User-Agent、端末指紋は保存しません。CSVを共有・保管する場合は、アクセス権と保存場所に注意してください。"),
          Spacer(1,10*mm), P("以上", ParagraphStyle("end",parent=h1,alignment=TA_CENTER))]

doc=SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm,
                      topMargin=18*mm, bottomMargin=18*mm, title="Class PDF Comment Viewer 取扱説明書",
                      author="CPCV Project")
doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print(OUT)
