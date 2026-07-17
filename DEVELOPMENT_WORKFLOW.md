# AIを併用した開発フロー

## 基本方針

GitHubをコードと作業履歴の中心に置き、作業内容ごとに実装担当AIを1つだけ選ぶ。

- GitHub Copilot：日常的な実装、小規模から中規模の変更
- Claude Code：大規模・複雑な変更、解析ロジックや複数ファイルの調査
- ChatGPT / Codex：仕様整理、説明、評価基準の検討、別視点でのレビュー
- 開発者：最終判断、実機確認、マージ、本番反映

CopilotとClaude Codeに同じブランチを同時編集させない。

## 1. 作業開始

```powershell
cd C:\Users\rsktk\jump-analyzer
git switch main
git pull
git switch -c feature/変更内容
```

例：

```powershell
git switch -c feature/username-registration
```

小さな修正を除き、作業ごとにブランチを作る。

## 2. 仕様整理

大きな変更や曖昧な変更は、実装前に次を決める。

- 目的
- 現在の問題
- 関連する画面・ファイル・エラー
- 変更してはいけない部分
- 完成条件
- 必要な確認

仕様が固まったら、必要に応じてGitHub Issueへ保存する。

## 3. 実装担当を選ぶ

| 作業 | 主担当 |
|---|---|
| CSS、文章、ボタン、小さなバグ | Copilot |
| 数ファイルにまたがる通常の機能 | Copilot Agent |
| トラッキング、評価、認証など複雑な変更 | Claude Code |
| 仕様・評価基準の整理 | ChatGPT / Codex |
| 完成後のレビュー | 実装していないAI |

AIには、目的・関連情報・制約・完了条件・確認方法を伝える。

## 4. 検証

```powershell
npm run lint
npm run test
npm run build
npm run dev
```

`npm run dev`で実際に操作し、必要に応じて次を確認する。

- 対象機能
- 既存機能
- PC・スマホ表示
- ログイン・新規登録
- Firestoreへの保存と権限
- 動画読み込み
- 解析結果
- ブラウザのコンソールエラー

## 5. 差分確認と保存

```powershell
git status
git diff
git add .
git commit -m "変更内容を簡潔に記述"
git push -u origin feature/変更内容
```

意図していない変更がある場合は、コミット前に原因を確認する。

## 6. Pull Request

Pull Requestには次を記載する。

- 目的
- 主な変更
- 変更していない範囲
- コマンドの実行結果
- 手動確認内容
- 未確認事項

実装担当とは別のAIまたは人が差分をレビューする。

## 7. マージと本番反映

確認後にPull Requestを`main`へマージし、ローカルを更新する。

```powershell
git switch main
git pull
npm run build
npx firebase-tools deploy --only hosting
```

デプロイ後は公開URLを開き、変更内容、ログイン、スマホ表示、コンソールエラー、キャッシュを確認する。

## 最重要ルール

1. GitHubを常に最新にする。
2. 実装担当AIは作業ごとに1つだけ選ぶ。
3. 不明な仕様をAIに推測させない。
4. AIの完了報告だけで完成と判断しない。
5. ビルドと実際の操作で確認する。
6. 問題がないことを確認してから`main`へマージする。
7. 本番反映は最新の`main`から行う。
