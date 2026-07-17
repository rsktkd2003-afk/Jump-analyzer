# リリースチェックリスト

## リリース前

- [ ] `main`からリリース用ブランチを作成した
- [ ] 意図しない差分や秘密情報がない
- [ ] 評価基準変更時に`ANALYSIS_VERSION`を更新した
- [ ] `npm ci`が成功した
- [ ] `npm run check`が成功した
- [ ] 基準動画で回帰確認した
- [ ] Googleログイン・ログアウトを確認した
- [ ] 履歴の保存・表示・削除と権限を確認した
- [ ] PCとスマホ幅で確認した
- [ ] ChromeとEdgeで確認した
- [ ] コンソールに新しいエラーがない
- [ ] PRレビューとCIが完了した

## デプロイ

```powershell
git switch main
git pull
npm ci
npm run check
npx firebase-tools deploy --only hosting
```

## デプロイ後

- [ ] `https://jump-analyzer.web.app`が開く
- [ ] 新規タブと既存タブの両方で新しい版が取得できる
- [ ] PWAに更新通知が表示され、ユーザー操作後に更新できる
- [ ] 動画読込・人物選択・解析・結果表示を確認した
- [ ] ログインと履歴保存を確認した
- [ ] スマホ表示を確認した
- [ ] 問題があればFirebase Hostingの直前バージョンへロールバックできる

## リリース記録

- リリース日時:
- Gitコミット:
- 解析バージョン:
- Firebase Hostingバージョン:
- 変更内容:
- 確認者:
- 未確認事項:
