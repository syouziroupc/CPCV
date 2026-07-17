# Codex復旧後の実行順序

## 原則

- 一度に一段階だけ渡す。
- 各段階は新branch、新patch、新commit。
- 前段階の試験が0 failureになるまで次へ進まない。
- Codexへ毎回リポジトリ全体の設計判断をさせない。
- 各指示書に対象ファイル、禁止ファイル、テストコマンドを固定する。

## 実行順

### 1. Stage 2仕上げ

使用文書:

```text
docs/codex-stage-02-finish.md
```

目的:

- 元Gitへ反映
- remote D1作成
- 実UUID設定
- remote migration
- Bootstrap
- commit

### 2. Stage 3実装

使用文書:

```text
docs/stage-03-spec.md
docs/codex-stage-03-implementation.md
docs/stage-03-test-spec.md
docs/stage-03-review-checklist.md
```

Stage 3を次の内部unit順で行う。

1. migration
2. auth純粋utility
3. middleware
4. login/session
5. password
6. organization permission
7. live session projection
8. UI token撤去
9. legacy endpoint無効化
10. 全試験

### 3. Stage 3レビュー修正

新機能を追加しない。checklist不合格だけを修正する。別commitにする。

### 4. Stage 4正式設計

骨子から正式仕様へ展開する。Stage 3実装結果を反映する。設計commitだけを作る。

### 5. Stage 4実装

以降も「正式設計 -> 実装 -> 厳格レビュー」の3回に分ける。

## 利用量節約策

- 初回指示に正確な基準commitを記載
- `git diff --name-only <baseline>`で対象を限定
- 既存のarchitecture説明を指示書へ含める
- 再調査対象を`src/index.js`全体ではなく関連moduleへ限定
- 自動テストscriptを前段階から再利用
- UI screenshotはUI変更段階だけ
- remote操作はlocal完了後に一度だけ
- 大規模rename、format、dependency更新を禁止
