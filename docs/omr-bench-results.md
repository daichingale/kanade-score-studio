# OMR 実測ベンチ（15 譜・Verovio ラスタ 2000px + phone 劣化）

再現: `node scripts/omr-bench.mjs --limit=15`  
詳細: `docs/omr-bench-results.json`（2026-11-26 第2ラウンド・MusicXML 取り込み修復後）

## 整列の健全性

| 検査 | F1 | 音高 | 音価 | n |
|------|-----|------|------|---|
| 真値 ↔ 真値（ground_truth） | **100%** | 100% | 100% | 15 |

## homr 取り込み修復 — before / after

MusicXML が homr で生成できても、従来は Kanade の `validateScore` などで **7/15 が throw** しベンチ集計外だった。  
`musicxml-import.js` の修復（backup/forward・多声部統合・拍超過/不足の休符補正・警告のみ）後に再計測。

| 指標 | 修復前（成功分のみ） | 修復後（全 15 譜） |
|------|----------------------|---------------------|
| **成功数 clean / phone** | **8 / 15** | **15 / 15** |
| **F1 clean** | **97.5%** | **80.2%** |
| **F1 phone** | **100%** | **80.5%** |
| 音高 clean / phone | 97.5% / 100% | 83.2% / 87.7% |
| 音価 clean / phone | 97.5% / 100% | 77.6% / 78.1% |

※ 修復後の F1 は「取り込みは通るが修復で音価がずれた譜」も含む全件平均。成功 8 件だけなら従来どおり高 F1。

## エンジン別（現行ベンチ）

| エンジン | clean F1 | phone F1 | 成功 clean/phone | 備考 |
|---------|----------|----------|------------------|------|
| **homr**（PC 既定） | **80.2%** | **80.5%** | **15 / 15** | 取り込み 100% 通過 |
| **Audiveris** | 91.2% | 73.5% | 2 / 2 | 小 PNG で No system が多い |
| Kanade v2（solver 前/後） | 0% | 0% | 6 / 15 clean | phone は音高のみ ~7.8% |
| oemer CLI | — | — | 0 / 0 | ORT ConvTranspose（下記） |
| ML（onnxruntime-node） | 0% | 0% | 15 / 15 | セッション起動可・後段 F1 未達 |

## アプリ既定（この PR）

| 環境 | 優先 |
|------|------|
| **PC（dev サーバー）** | **homr** → Audiveris → oemer → v2 |
| **端末のみ** | oemer ONNX ML（互換環境）→ **v2 簡易** |

homr は **AGPL-3.0** のためサーバー経由利用を推奨（モデル約 150MB、同梱なし）。

## ユーザーが入れるもの

- **高精度 PC**: Java 17+、`pip install homr`、任意で [Audiveris 5.11 deb/msi](https://github.com/Audiveris/audiveris/releases)
- **LAN**: `HOST=0.0.0.0 npm run dev`
- **端末 ML**: 初回 ~104MB DL（oemer ONNX）

## 既知の限界

- **oemer CLI**: `unet_big.onnx` の `ConvTranspose` が ORT 1.32 の shape inference と非互換。Python で `SessionOptions.graph_optimization_level = ORT_DISABLE_ALL` なら**モデル単体はロード可能**だが、**pip の `oemer` CLI は SessionOptions 未設定**のため依然失敗。`ORT_DISABLE_ALL=1` 環境変数も CLI では効かず（VM 確認）。再エクスポートか upstream パッチが必要。
- **端末 ML**: `omr-ml-node.mjs` / `omr-ml-worker.js` は `graphOptimizationLevel: 'disabled'` でセッション作成まで成功するが、ベンチ上の認識 F1 は 0%（後処理・ラベル変換が未完成に近い）。
- **Audiveris**: 刻譜 PNG の高さが低いと系統検出失敗しやすい。
- **homr 取り込み**: 第1声部へマージするため、二部以上の譜はベンチ整列で音価ノイズが乗ることがある（レビュー画面に import 警告を表示）。
- **v2**: 刻譜ラスタ向けには精度不足（フォールバック専用）。