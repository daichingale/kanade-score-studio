# 04. 入力・編集 UX

## 1. 原則
- **キーボードだけで全操作できる。** マウスは補助。
- **入力は「音価 → 音高」でも「音高 → 音価」でも可**（Sibelius 型 / Dorico 型の両方をモード切替）。
- 入力中にレイアウトが大きく動かない（差分再組版・段区切りの固定、docs/03 §4）。

## 2. Command 設計（UI → エンジン）
```ts
type Command =
  | { type: "InsertNote"; at: Caret; pitch: PitchInput; duration: DurInput; chordAdd?: boolean }
  | { type: "InsertRest"; at: Caret; duration: DurInput }
  | { type: "Delete"; selection: Selection }
  | { type: "Transpose"; selection: Selection; interval: Interval; mode: "diatonic" | "chromatic" }
  | { type: "AddSpanner"; kind: SpannerKind; selection: Selection }
  | { type: "SetProperty"; targets: ElementId[]; key: string; value: unknown }
  | { type: "AddConstraint"; constraint: Constraint }
  | { type: "Undo" } | { type: "Redo" };
```
- エンジンは Command → `Vec<Op>` に分解。Op は可逆（`invert()` を必ず実装）。
- 1 Command = 1 Undo ステップ。

## 3. 入力方法
| 方法 | 内容 |
|---|---|
| PCキーボード | A–G で音高、数字で音価（Sibelius/Dorico 互換キーマップを選択可） |
| MIDIキーボード（ステップ） | 鍵盤で音高、PC側で音価 |
| MIDI リアルタイム | 録音 → クオンタイズ（音楽的推定：連符・スウィング・装飾音の判定） |
| テキスト記法（KSL） | 横のペインに記法を打つと即座に譜面に反映（双方向同期）。docs/06 §3 |
| 手書き（タブレット） | 将来。ストローク → 記号認識 |

## 4. 選択モデル
- 選択は「要素ID集合」＋「時間範囲×譜表範囲（リスト選択）」の2種類。
- 範囲選択に対する操作（移調、音価半分、コピー）は時間範囲として扱い、小節をまたいでも壊れない。

## 5. コマンドパレット
- `Ctrl/Cmd+K` で全機能を検索実行（日本語・英語・ローマ字検索）。
- 「ポップオーバー入力」：`Shift+D` で強弱入力欄が出て `mf` `cresc.` 等をテキストで打つ（Dorico 型）。

## 6. インスペクタ
- 選択要素のプロパティ表示。スタイル由来の値は灰色、上書き値は太字＋「スタイルに戻す」ボタン。
- 「なぜ？」タブ：組版の判断理由（docs/03 §7）。

## 7. 診断パネル（リンタ）
- 常時、楽譜の問題を検出して一覧表示：音域外、演奏不能な重音（弦の重音、管の音域）、ページめくり位置が演奏中、タイの相手なし、孤立した制約など。
- 各診断には「修正案」を付け、ワンクリック適用（例：「この小節でめくり → 改頁を2小節前へ」）。
