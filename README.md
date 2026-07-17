# Jump Analyzer

バレーボールのジャンプ動作を動画から解析するWebアプリです。React、TypeScript、MediaPipeを使用し、動画は原則としてブラウザ内で処理します。Googleログイン時は、ユーザーが保存を選んだ解析結果だけをFirestoreへ保存します。

## 主な技術

- React 19 / TypeScript / Vite 8
- MediaPipe Tasks Vision
- Firebase Authentication / Firestore / Hosting
- vite-plugin-pwa
- Vitest

## 必要な環境

- Node.js 20
- npm
- Firebase CLI（本番へデプロイする場合）

## 初回セットアップ

```powershell
git clone https://github.com/rsktkd2003-afk/Jump-analyzer.git
cd Jump-analyzer
Copy-Item .env.example .env.local
npm ci
npm run dev
```

`.env.local`へFirebase Webアプリの設定値を入力してください。未設定でも動画解析は利用できますが、ログインと履歴保存は無効になります。

## 開発用コマンド

```powershell
npm run dev
npm run lint
npm run test
npm run build
npm run check
```

`npm run check`は、lint、単体テスト、ビルドを順番に実行します。

## 本番反映

`main`の最新状態で確認してから実行します。

```powershell
git switch main
git pull
npm ci
npm run check
npx firebase-tools deploy --only hosting
```

## 重要な資料

- [開発フロー](DEVELOPMENT_WORKFLOW.md)
- [解析・評価仕様](docs/ANALYSIS_SPEC.md)
- [精度検証ガイド](docs/VALIDATION_GUIDE.md)
- [リリースチェックリスト](docs/RELEASE_CHECKLIST.md)
- [運用・障害対応](docs/OPERATIONS.md)
- [セキュリティ方針](SECURITY.md)
- [プライバシーポリシー案](PRIVACY_POLICY.md)

## 現在の注意点

- 解析値とフォーム評価は、撮影角度・画質・遮蔽・フレームレートの影響を受けます。
- 評価は競技改善の参考情報であり、医療上の診断ではありません。
- 評価基準を変更する場合は、`ANALYSIS_VERSION`の更新と検証動画による回帰確認が必要です。
