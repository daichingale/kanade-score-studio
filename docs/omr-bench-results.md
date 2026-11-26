# OMR 実測ベンチ（Verovio 刻譜ラスタ）

生成: `node scripts/omr-bench.mjs`（コーパス 15、clean / phone 劣化）

## 集計（`docs/omr-bench-results.json` より）

| 手法 | clean F1 | clean 音高 | clean 音価 | phone F1 | phone 音高 | phone 音価 |
|------|---------|-----------|-----------|---------|-----------|-----------|
| Kanade v2（solver 前） | 1.2% | 7.0% | 2.5% | 1.4% | 10.9% | 3.1% |
| Kanade v2（solver 後） | 1.2% | 7.0% | 2.5% | 1.3% | 10.9% | 3.1% |
| ML（onnxruntime-node） | 未集計¹ | — | — | — | — | — |
| oemer CLI | — | — | — | — | — | — |

## before → after（v2）

- **clean F1**: 約 −0.04pt（同一音高・音価率、solver は主に誤検出ノイズを整理）
- **phone F1**: ほぼ横ばい
- **前提修正**: Verovio→PNG は `resvg` の白背景必須（未指定だと RGB 全黒で五線検出不能）。刻譜向け五線クラスタを追加し、**以前の実測 0%（検出不能）から数値化可能に**。

## 外部エンジン（VM）

- **oemer**: ONNX `ConvTranspose` ShapeInferenceError（モデル×ORT 1.32）。CUDA なし環境でも CPU で同エラー。`--use-tf` 未検証。
- **Audiveris**: 本 VM 未導入（`docs/omr-setup.md` 参照）。

## 限界・次手

- v2 は Verovio 細線＋誤検出多発のため F1 は低い。音価・小節線・符頭の分離改善が必要。
- ¹ ML: `1st_model`/`2nd_model` を NHWC `uint8`（256×256 / 288×288）で推論可能に修正済み。直近フルベンチは次元エラー行が残るため再実行推奨。単票では推論完走するが音符 0 件となるケースあり（マスク→後処理要調整）。
- oemer CLI は ONNX `ConvTranspose` / CUDA なし環境でも CPU で同エラー。