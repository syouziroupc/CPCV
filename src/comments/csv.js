export function buildCommentsCsv(session, comments) {
  const rows = [
    ["投稿日時", "コメントID", "PDFページ", "名前", "コメント", "状態", "授業名", "授業ID"],
    ...comments.map((comment) => [
      comment.createdAt,
      comment.id,
      comment.pdfPageNumber ?? "",
      comment.nickname,
      comment.message,
      comment.moderationState,
      session.title,
      session.id
    ])
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function csvCell(value) {
  let text = String(value ?? "");
  if (/^\s*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
