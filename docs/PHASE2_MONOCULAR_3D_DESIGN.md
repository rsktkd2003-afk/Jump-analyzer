# Phase 2: 単眼3D解析基盤 設計

## 目的

既存の2D解析・人物追跡・左右補正・信頼度算出を維持したまま、単眼動画から得られる3D姿勢情報を解析パイプラインへ追加する。

Phase 2Aでは、新規AIモデルを導入せず、現在利用している`@mediapipe/tasks-vision`のPose Landmarkerが返す`worldLandmarks`を利用する。

## 採用方針

### 採用

- MediaPipe Pose Landmarkerの`worldLandmarks`
- 既存の33関節インデックスとの対応を維持
- 2Dランドマークと3Dランドマークを同一フレームに保持
- Feature Flagで3D処理を無効化可能にする
- 3D欠損時は既存2D解析へフォールバックする

### Phase 2Aで導入しないもの

- MotionBERT等の追加3Dリフティングモデル
- サーバー推論
- Pythonバックエンド
- WebGPU必須化
- 既存スコアへの即時反映
- Firestoreの破壊的スキーマ変更

## 理由

- 現在の依存関係だけで実装できる
- ブラウザ/PWA構成を維持できる
- モデルの二重実行を避けられる
- 既存の2D解析を壊さず段階導入できる
- 追加モデル導入前に、3D情報が実動画でどこまで有効か検証できる

## 実装スコープ

### 1. 型定義

追加候補:

```ts
export interface PoseWorldLandmark {
  x: number
  y: number
  z: number
  visibility?: number
  presence?: number
}

export interface TrackedPoseFrame {
  timestampMs: number
  landmarks2D: PoseLandmark[]
  worldLandmarks3D?: PoseWorldLandmark[]
  // 既存メタデータ
}
```

既存型を直接破壊せず、optionalとして追加する。

### 2. Pose Landmarker結果の取得

Pose Landmarkerの結果から以下を同じ人物インデックスで取得する。

- `landmarks[poseIndex]`
- `worldLandmarks[poseIndex]`

人物トラッカーが選択したposeIndexと3DランドマークのposeIndexを必ず一致させる。

### 3. 左右補正

2D側で左右入れ替わり補正が発生した場合、対応する3Dランドマークにも同じ左右交換を適用する。

2Dと3Dで別々に補正判定しない。

### 4. 欠損・品質管理

3Dランドマークが次の条件を満たさない場合は、そのフレームの3D値を無効とする。

- 33点未満
- 非有限値を含む
- 主要関節のvisibility/presenceが不足
- 体幹長または肩幅が極端に小さい
- 前フレームからの移動量が異常

無効時も2D解析は継続する。

### 5. 3D座標の正規化

評価用には生のworldLandmarksを直接使わず、以下の正規化ビューを生成する。

- 原点: 左右股関節の中点
- スケール: 肩幅または体幹長
- 軸: MediaPipe座標を保持し、表示層で必要に応じて変換

候補型:

```ts
export interface NormalizedPose3D {
  landmarks: PoseWorldLandmark[]
  origin: { x: number; y: number; z: number }
  scale: number
  quality: number
}
```

### 6. 3D平滑化

Phase 1の時系列処理と整合させ、以下を優先する。

- One Euro Filterまたは速度制限付きEMA
- visibility/presenceに応じた可変平滑化
- 欠損中は短時間のみ補間
- 長時間欠損は値を保持せずunknownにする

Phase 2Aでは既存2D平滑化を流用可能か先に評価し、不要な新規実装を避ける。

### 7. 3D品質シグナル

最低限、以下を算出する。

```ts
export interface Pose3DQualitySignals {
  availableFrameRatio: number
  lowConfidenceFrameRatio: number
  interpolatedFrameRatio: number
  abnormalMotionFrameRatio: number
  meanVisibility: number
}
```

Phase 2Aでは既存総合スコアを変更せず、解析結果のデバッグ情報として保持する。

## 初期3D指標

Phase 2Aでは、既存採点を変えず次の値を計測・表示可能にする。

1. 肩と骨盤の相対回旋角
2. 体幹の前後傾・左右傾
3. 打撃側肩から反対側足先までの3D直線性
4. 両膝・両足首の奥行き差
5. 空中での体幹軸の変動量
6. 最高点付近の肩・骨盤分離角

これらの有効性を実動画で確認した後、Phase 2Bで採点へ反映する。

## Feature Flag

```ts
ENABLE_WORLD_LANDMARKS_3D
ENABLE_3D_SMOOTHING
ENABLE_3D_METRICS
```

初期状態:

- `ENABLE_WORLD_LANDMARKS_3D = true`
- `ENABLE_3D_SMOOTHING = true`
- `ENABLE_3D_METRICS = false`

3D指標は検証完了まで採点へ影響させない。

## 互換性要件

- `worldLandmarks`がない旧解析データを読み込める
- 既存の2Dスコアが同じ入力で大きく変化しない
- Firestore保存はoptionalフィールドのみ
- Feature Flag OFF時はPhase 1と同じ結果になる
- モバイルブラウザとPWAで動作する

## 必須テスト

### 単体テスト

- 2D/3DのposeIndex対応
- 2D左右補正時の3D左右交換
- 非有限値・33点未満の拒否
- 3D原点・スケール正規化
- 3D角度計算
- Feature Flag OFF時の互換性

### 統合テスト

- 3Dありフレームが解析結果まで到達する
- 3Dなしフレームでも2D解析が成功する
- coasting・再取得後も2D/3D人物対応がずれない
- 保存済み旧データを読み込める

### 実動画E2E

- 正面動画
- 斜め動画
- 横動画
- 大きな体幹回旋
- 他選手との交差
- 一時的な遮蔽

確認項目:

- 3D骨格の急反転がない
- 人物乗り換え時に3Dだけ別人にならない
- 左右補正後も2D/3Dが一致する
- 既存2Dイベント検出が悪化しない
- 解析時間が許容範囲内

## 実装順序

1. 型とFeature Flag
2. Pose Landmarker結果からworldLandmarksを取得
3. 人物選択インデックスとの同期
4. 左右補正同期
5. バリデーションと正規化
6. 3D平滑化
7. 品質シグナル
8. 初期3D指標
9. テスト
10. 実動画E2E

## 完了条件

- 全既存テスト成功
- 新規3Dテスト成功
- lint/check/build成功
- Feature Flag OFFでPhase 1互換
- 実動画で2D/3D人物対応の破綻なし
- 既存スコアへの重大な回帰なし
- 3D指標を採点へ反映する前に検証結果を記録
