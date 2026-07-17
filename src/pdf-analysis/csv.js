import { csvCell } from "../comments/csv.js";

export function buildAnalyticsCsv(snapshot) {
  const summary = snapshot.summary;
  const rows = [
    ["スナップショットID", snapshot.id],
    ["生成日時", snapshot.createdAt],
    ["集計基準時刻", snapshot.sourceCutoffAt],
    ["授業ID", snapshot.liveSessionId],
    ["PDF SHA-256", summary.documentSha256],
    ["PDFページ数", summary.pageCount],
    ["匿名化最小人数", snapshot.minimumGroupSize],
    ["チェックサム", snapshot.checksumSha256],
    [],
    [
      "ページ", "表示回数", "推定表示秒数", "コメント数", "表示中", "承認待ち", "非表示",
      "疑問符付きコメント", "匿名コメント参加者", "理解度回答数", "理解できた", "少し不明",
      "わからない", "理解度指数", "小人数抑制"
    ],
    ...snapshot.pages.map((page) => [
      page.pageNumber,
      page.viewCount,
      page.dwellSeconds,
      page.commentCount,
      page.visibleCommentCount,
      page.pendingCommentCount,
      page.hiddenCommentCount,
      page.questionMarkCommentCount,
      page.uniqueCommenters == null ? "" : page.uniqueCommenters,
      page.signalTotal,
      page.understoodCount == null ? "" : page.understoodCount,
      page.unsureCount == null ? "" : page.unsureCount,
      page.confusedCount == null ? "" : page.confusedCount,
      page.understandingScore == null ? "" : page.understandingScore,
      page.suppressed ? "yes" : "no"
    ])
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
