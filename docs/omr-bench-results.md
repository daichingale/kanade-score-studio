# OMR 実測ベンチ

再現: `node scripts/omr-bench.mjs --limit=15`（legacy 15 譜）  
拡張: `node scripts/omr-bench.mjs --limit=18 --extended --out=docs/omr-bench-results-extended.json`

詳細 JSON: `docs/omr-bench-results.json`（2026-11-26 homr 認識強化 PR）

## before → after（homr・legacy 15）

基準: **main@7245c61**（PR #13: homr F1 **80.2% / 80.5%**、音価 **77.6% / 78.1%**、15/15）

| 指標 | before | after | Δ |
|------|--------|-------|---|
| homr F1 clean / phone | 80.2% / 80.5% | **85.8% / 81.8%** | **+5.6 / +1.3 pt** |
| homr 音価 clean / phone | 77.6% / 78.1% | **83.4% / 79.4%** | **+5.8 / +1.3 pt** |
| homr 成功 clean / phone | 15 / 15 | 15 / 15 | — |
| Audiveris 成功 | 2 / 15 | 2 / 15 | — |
| Audiveris phone F1（成功分） | 77.8% | 77.8% | — |

## homr 改善の内訳（ablation）

| 設定 | clean F1 | phone F1 | 備考 |
|------|----------|----------|------|
| **homr_cli**（2.5MP 正規化 + `--no-title` + post-correction） | **85.8%** | **81.8%** | **本番既定** |
| homr_legacy（生画像・post-correction のみ） | 85.8% | 84.8%（14/15） | phone で一部再現性 |

**post-correction**（`omr-musicxml-post.js`）は XML 取り込み後に全経路で適用。クリーン譜では legacy と同程度だが、**音価ベンチ全体**は post + 2.5MP 入力で音価・F1 が基準より改善。

**マルチスケール homr**（0.96/1/1.04 × 3 回）は 15 譜フルでは未計測（`--homr-ms` で有効）。3 倍遅延のため既定オフ。

## homr 残差の内訳（clean、F1 未達イベント分類）

| 種別 | 件数（15 譜×clean 集計） |
|------|--------------------------|
| 一致 | 109 |
| **見逃し** | **13** |
| **音価不一致** | **6** |
| **音高不一致** | **2** |
| 余分検出 | 5 |

優先: 見逃し・付点/休符/音価 → 今後のリズム prior / beam 整合。

## 拡張コーパス（`--extended`、18 譜）

Verovio **2〜3 段組**（フルート+チューバ、クラリネット+ホルン、ピアノ大譜表）を 3 譜追加。

| homr_cli | clean | phone |
|----------|-------|-------|
| F1 / 音価 | **84.0% / 86.2%** | **82.7% / 82.9%** |
| 成功 | 18 / 18 | 18 / 18 |

多段組を含むと F1 は legacy 15 のみより **約 1.8pt 低下**（段組・ホルン移調などが難所）。JSON: `docs/omr-bench-results-extended.json`。

## 他エンジン調査（簡潔）

| 候補 | ライセンス | 本リポでの扱い |
|------|-----------|----------------|
| **homr** | AGPL-3.0 | PC 既定・今回強化 |
| Audiveris | GPLv2 | 2/15 成功率・phone 前処理で F1 維持 |
| oemer ONNX | MIT | ORT ConvTranspose 未解決 |
| ihy / TrOMR 系 | 各種 | homr 内蔵 TrOMR が実質 SOTA クラス；別経路の組み込みは AGPL 境界が重いため未統合 |

## 主な実装

- `scripts/omr-homr-prep.mjs` — ~2.5MP スケール正規化（homr 文献どおり）
- `omr-musicxml-post.js` — 調号整合・小節リズム snap・タイ推定
- `omr-align.js` `categorize()` — ベンチ誤差分類
- Audiveris: 低解像度 clean 画像のみ段階 upscale

## 既知の限界

- Audiveris **2/15**（単行刻譜以外は系統検出失敗が多い）
- phone で homr 2.5MP 正規化は legacy より F1 が下がる譜があり（sharp 前処理は homr 向け無効化を維持）
- 真のマルチページ吹奏楽スキャンは未計測（Verovio 合成のみ）