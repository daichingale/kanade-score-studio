# OMR 実測ベンチ（15 譜・Verovio ラスタ 2000px + phone 劣化）

再現: `node scripts/omr-bench.mjs --limit=15`  
詳細: `docs/omr-bench-results.json`（2026-11-26 マージ版）

## 整列の健全性

| 検査 | F1 | 音高 | 音価 | n |
|------|-----|------|------|---|
| 真値 ↔ 真値（ground_truth） | **100%** | 100% | 100% | 15 |

## エンジン別（成功サンプル上の平均）

| エンジン | clean F1 | clean 音高 | clean 音価 | phone F1 | phone 音高 | phone 音価 | 成功数/15 |
|---------|----------|-----------|-----------|----------|-----------|-----------|-----------|
| **homr**（PC 既定） | **97.5%** | 97.5% | 97.5% | **100%** | 100% | 100% | 8 / 8 |
| **Audiveris** | **100%**¹ | 100% | 100% | 78.6% | 85.7% | 78.6% | 2 / 2 |
| Kanade v2（solver 前） | 0%² | 0% | 0% | 0% | 7.8% | 0% | 6 / 15 clean |
| Kanade v2（solver 後） | 0%² | 0% | 0% | 0% | 7.8% | 0% | 同上 |
| oemer CLI | — | — | — | — | — | — | 0（ORT ConvTranspose） |
| ML（onnxruntime-node） | — | — | — | — | — | — | 未計測（別 run） |

¹ Audiveris は Verovio の小さな 1 行カット譜で **No system found** が多く、成功 2 譜のみ集計。  
² clean で一部譜が五線未検出（6/15）。以前の ~1.2% F1 は小サンプル時の値；今回も実質 0% 帯。

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

- oemer: 公開 ONNX × ORT 1.32 で推論失敗（VM 実測）。
- Audiveris: 刻譜 PNG の高さが低いと系統検出失敗しやすい。
- homr: 7/15 は MusicXML 取り込み検証（声部の拍超過など）でベンチ集計外。
- v2: 刻譜ラスタ向けには精度不足（フォ