# OMR 実測ベンチ（15 譜・Verovio ラスタ 2000px + phone 劣化）

再現: `node scripts/omr-bench.mjs --limit=15`  
詳細: `docs/omr-bench-results.json`（2026-11-26 import/前処理 PR）

## 整列の健全性

| 検査 | F1 | n |
|------|-----|---|
| 真値 ↔ 真値 | **100%** | 15 |

## before → after（homr・取り込み修復後基準）

基準行は **main@4ff62e4**（PR #12 マージ直後: homr **15/15**、F1 clean **80.2%** / phone **80.5%**）。

| 指標 | before（基準） | after（本 PR） | Δ |
|------|----------------|--------------|---|
| homr 成功 clean / phone | 15 / 15 | 15 / 15 | — |
| homr F1 clean / phone | 80.2% / 80.5% | **80.2% / 80.5%** | ≈0 |
| homr 音価 clean / phone | 77.6% / 78.1% | 77.6% / 78.1% | ≈0 |
| **pc_best_of** F1 clean / phone | — | **80.1% / 78.7%** | — |
| **pc_best_of 音価 clean** | — | **79.5%** | **+1.9pt** |
| Audiveris 成功 clean / phone | 2 / 2 | 2 / 2 | — |
| Audiveris F1 clean / phone（成功分） | 91.2% / 73.5% | 91.2% / **77.8%** | phone +4.3pt |

homr 単体 F1 は homr 出力が同じため横ばい。**音価ノイズ低減**は `pc_best_of`（取り込み修復ペナルティで homr / Audiveris を選択）の clean **音価 79.5%** で確認。Phone 向け **Audiveris のみ** sharp 前処理（アップスケール・コントラスト）。

## エンジン別（after）

| エンジン | clean F1 | phone F1 | 成功 |
|---------|----------|----------|------|
| **homr** | 80.2% | 80.5% | 15/15 |
| **pc_best_of** | 80.1% | 78.7% | 15/15 |
| Audiveris | 91.2%¹ | 77.8%¹ | 2/15 |
| Kanade v2 | ~0% | ~0% | フォールバック |
| oemer / ML node | — | — | 別途（PR #12 記載） |

¹ Audiveris は Verovio 1 行刻譜で **No system** が多い。clean は前処理なし、phone は `scripts/omr-engine-prep.mjs` でアップスケール。

## 本 PR の変更と計測への影響

| 変更 | 内容 | ベンチ上の効果 |
|------|------|----------------|
| MusicXML | 主メロディ声部の自動選択、末尾切り詰めより音価調整 | homr F1 ほぼ不変（修復ログは減少方向） |
| `pc_best_of` | homr + Audiveris、import 警告ペナルティで選択 | clean **音価 +1.9pt** |
| phone 前処理 | Audiveris 向けのみ（homr は RAW JPEG） | Audiveris phone F1 上昇、homr は維持 |
| Audiveris upscale | clean では過大リサイズを避け 2/15 維持 | clean 0/15 化を回避 |

## 既知の限界

- **homr F1**: OMR モデル出力が支配的で、取り込み改善だけでは F1 を大きく動かしにくい。
- **pc_best_of phone**: Audiveris 失敗谱が多く、ペナルティ選択が homr 単体より F1 を下げる場合あり。
- **Audiveris**: 成功率 2/15 のまま（画像レイアウト依存）。
- **多声部**: 第1声部＋必要なら第2声部のみ保持。