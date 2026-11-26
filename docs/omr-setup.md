# OMR セットアップ（PC エンジン・端末 ML）

## 自動の優先順位（アプリ既定）

1. **PC エンジン** — **Audiveris** → **homr** → oemer CLI（開発サーバー `HOST=0.0.0.0` + LAN）
2. **端末 ML** — oemer ONNX（約 104MB 初回 DL、現状 ORT 互換に注意）
3. **簡易 v2** — 最終フォールバック（古典 CV）

PC が使えない場合のみ 2→3 に落ちます。

## PC エンジン

`POST /__omr/recognize`（`scripts/dev.mjs`）。上限 **12MB**。

### Windows

1. **Audiveris 5.11+（GPL）**: [リリース](https://github.com/Audiveris/audiveris/releases) の `windowsConsole` MSI 等。
2. **homr（AGPL-3.0）**: `pip install homr` → CLI `homr`（初回モデル DL 約 150MB）。
3. **oemer（MIT）**: `pip install oemer`（本リポ VM では ONNX Runtime 1.32 とモデルが非互換のため未推奨）。
4. `HOST=0.0.0.0 npm run dev`

### Linux（Ubuntu 24.04 例）

```bash
sudo dpkg -i Audiveris-5.11.0-ubuntu24.04-x86_64.deb   # /opt/audiveris/bin/Audiveris
pip install --user homr
export AUDIVERIS_CMD=/opt/audiveris/bin/Audiveris   # 任意
HOST=0.0.0.0 npm run dev
```

### macOS

1. Audiveris を `/Applications/Audiveris.app` に配置。
2. `pip install homr`
3. `HOST=0.0.0.0 npm run dev`

### homr について

- トランスフォーマー系 OMR（[liebharc/homr](https://github.com/liebharc/homr)、**AGPL-3.0**）。
- PC サーバー経由での利用を想定（アプリにモデル同梱はしない）。
- 実測ベンチでは Verovio 刻譜で **homr が高 F1**（`docs/omr-bench-results.md` 参照）。

## 端末高精度（oemer ONNX）

- チェックポイント: [oemer releases/checkpoints](https://github.com/BreezeWhite/oemer/releases/tag/checkpoints)（MIT）
- ブラウザ: `onnxruntime-web` + `omr-ml-worker.js`
- **既知問題（2026-11-26）**
  - 公開 `unet_big.onnx` は ORT 1.32 で `ConvTranspose` の shape inference エラー。**`graphOptimizationLevel: 'disabled'`**（Node / WASM ともに設定済み）ならセッション作成までは通る。
  - **oemer CLI** は内部が最適化 ON のままのため、本 VM では 0/15 失敗。`ORT_DISABLE_ALL=1` も CLI には効かない（`oemer` 側が `SessionOptions` を渡していない）。
  - ベンチの `ml_node` は 15/15 パイプライン成功だが F1 は 0% — ラスタ→イベント後段は homr には劣る。

## ベンチマーク

```bash
npm install
node scripts/omr-bench.mjs --limit=15          # 全エンジン
node scripts/omr-bench.mjs --no-v2 --no-ml   # PC エンジンのみ（高速）
```

結果: `docs/omr-bench-results.json` / `.md`

## PDF.js

`node scripts/fetch-omr-vendor.mjs` で `app/web/vendor/pdfjs/` を取得。