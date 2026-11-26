# OMR セットアップ（PC エンジン・端末 ML）

## 自動の優先順位

1. **PC エンジン**（開発サーバー `HOST=0.0.0.0` + 同じ Wi‑Fi）
2. **端末高精度**（oemer ONNX 約 104MB を初回 DL）
3. **簡易パイプライン**（ブラウザ内古典 CV）

## PC エンジン（Audiveris / oemer CLI）

開発サーバーに `POST /__omr/recognize` を追加しています。LAN 上のスマホから「PCで読み取る」で利用します。

### Windows

1. **Audiveris（推奨・GPL）**: [公式リリース](https://github.com/Audiveris/audiveris/releases) をインストールし、`Audiveris.exe` を PATH に通すか、環境変数 `AUDIVERIS_CMD` にフルパスを設定。
2. **oemer（MIT）**: `pip install oemer` で CLI を導入。
3. `set HOST=0.0.0.0` のうえ `npm run dev`（または `Kanadeを開く.bat` 相当）。
4. スマホで `http://<PCのIP>:5173` を開き、取り込み → 写真。

### macOS

1. Audiveris を `/Applications/Audiveris.app` に配置、または `brew`/手動で `audiveris` コマンドを PATH に。
2. `pip install oemer`
3. `HOST=0.0.0.0 npm run dev`

### 制限

- リクエスト上限 **12MB**
- ループバック／同一 LAN からのみ（`dev.mjs` の `allowedClient`）
- 作業ディレクトリは OS の temp に作成し、処理後削除

## 端末高精度（oemer ONNX）

- **同梱しない**: `1st_model.onnx`（約 68MB）+ `2nd_model.onnx`（約 38MB）
- **取得元**: [BreezeWhite/oemer checkpoints リリース](https://github.com/BreezeWhite/oemer/releases/tag/checkpoints)（MIT）
- **実行時**: Cache Storage + `onnxruntime-web` WASM（`vendor/onnx/` に同梱）
- 初回は UI で「高精度モードを有効にする（約104MBダウンロード）」の同意後に DL

### モデルミラー（任意）

GitHub が遠い場合、同じファイル名で Release をミラーし `app/web/src/omr-ml-manifest.js` の URL を差し替えてください。

## PDF.js

`app/web/vendor/pdfjs/` に同梱。再取得: `node scripts/fetch-omr-vendor.mjs`