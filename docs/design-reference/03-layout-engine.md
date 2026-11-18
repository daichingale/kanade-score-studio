# 03. 組版エンジン（kanade-layout）

## 1. 入出力
```rust
pub fn layout(project: &Project, layout_id: LayoutId, fonts: &FontSet, cache: &mut LayoutCache)
    -> LayoutResult;

pub struct LayoutResult {
    pub pages: Vec<PageDisplayList>,
    pub changed_pages: Vec<usize>,   // 差分再組版で変わったページ
    pub diagnostics: Vec<Diagnostic>,// 音域外, 衝突解消できず, 等
    pub explain: ExplainIndex,       // 各要素の配置理由（§7）
}

pub struct PageDisplayList {
    pub size_mm: (f32, f32),
    pub items: Vec<DisplayItem>,
}
pub enum DisplayItem {
    Glyph { smufl: GlyphName, pos: Pt, size: f32, owner: Option<ElementId> },
    Line  { from: Pt, to: Pt, width: f32, owner: Option<ElementId> },
    Path  { path: BezPath, fill: bool, width: f32, owner: Option<ElementId> }, // スラー, 連桁
    Text  { run: ShapedRun, pos: Pt, owner: Option<ElementId> },
}
```
- `owner` を必ず埋める（クリック選択・ハイライト・説明表示に使う）。

## 2. パイプライン（段階を分け、各段の出力をキャッシュ）
1. **Normalize**: レイアウト対象の奏者・移調・マルチレスト化を適用した「表示用イベント列」を作る。
2. **Notation decisions（小節内）**: 音符の分割とタイ、連桁グルーピング（拍子ごとの規則）、符尾方向、臨時記号の要否、休符の位置、声部の衝突配置（和音のずらし）。
3. **Horizontal spacing**: 全譜表の同時刻を縦に揃えた「列（Column）」を作り、各列に最小幅と伸縮性（ばね）を与える。
4. **Line breaking（改段）**: Knuth-Plass 型の最適化で段の区切りを決める（§4）。
5. **Vertical spacing**: 譜表間・段間の距離を、スカイライン（各譜表の上下の輪郭）から計算（§5）。
6. **Page breaking**: 段をページに詰める。同じく最適化。
7. **Engraving（細部）**: 連桁の傾き、スラー/タイのベジェ、アーティキュレーション配置、強弱記号の揃え、歌詞配置、衝突回避。
8. **Emit**: DisplayList 生成。

## 3. 横方向の間隔（spacing）
- 基本式: 音符幅 = `base * (1 + log2(duration / shortest_in_system) * k)`。`k` はスタイルで調整（Gould 推奨値を初期値に）。
- 臨時記号・付点・歌詞・装飾音の幅は列の「最小幅（rod）」として加算。
- 列の間は「ばね（spring）」: 段を両端揃えするとき、ばね定数に比例して伸縮。
- 歌詞が長いときは音符間隔を広げる（歌詞優先モードあり）。日本語歌詞は文字幅が均一なので専用規則（§8）。

## 4. 改段（Line breaking）
- 小節（または許可された区切り点）ごとに「その段に詰めたときの醜さ」をコスト化し、動的計画法で全体最小を求める。
  - コスト = 伸縮率の偏り² + 段末の不揃い + ページめくり位置の悪さ（パート譜では休符位置にめくりが来るよう重みづけ）。
- ユーザーの `BreakHint`（改段固定、この範囲を1段に）はハード制約として扱う。
- **差分再組版**: 編集箇所より前の段の区切りは、コストがしきい値以上変わらない限り固定する（編集のたびに全体がガタガタ動かないことが重要）。

## 5. 縦方向（スカイライン）
- 各譜表について、上方向・下方向の輪郭を区間リスト（x区間 → 高さ）で持つ。
- 隣接譜表の「下輪郭」と「上輪郭」の最小距離 ≥ スタイルの最小間隔、となるよう配置。
- 段内の全譜表を揃える「全段同間隔」モードと「詰める」モードを選べる。

## 6. 手動調整は「制約」で保存する（独自要素の核）
既存ソフトは手動調整を「この記号を x=+2.3 ずらす」のようなオフセットで保存するため、音符を1つ足すと調整がずれて壊れる。本エンジンでは**意図**を保存する。

```rust
pub enum Constraint {
    // 「この強弱記号は、この音符の真下で、譜表から 2sp 下」
    Place { target: ElementId, relative_to: ElementId, side: Side, gap: Sp },
    // 「この2つの記号を同じ高さに揃える」
    AlignBaseline { targets: Vec<ElementId> },
    // 「このスラーは上向き、カーブを浅めに」
    SlurShape { target: ElementId, direction: Up|Down, height_bias: f32 },
    // 「この小節群はこの段に収める」
    KeepInSystem { from: Rational, to: Rational },
    // 「この要素を他と衝突しても動かさない」
    Pin { target: ElementId },
    // 最終手段：オフセット（ただし基準点は要素自身の自動位置）
    Nudge { target: ElementId, dx: Sp, dy: Sp },
}
```
- 自動配置 → 制約適用 → 衝突回避の順で解く。
- 制約が満たせない場合（参照先が消えた等）は消さずに `Diagnostic::OrphanConstraint` として残し、UI で通知する。
- UI でドラッグしたとき、エンジンは**最も意味の近い制約を推定**して作る（例: 強弱記号を横にドラッグ → 一番近い音符へ `Place` を作る）。

## 7. 説明可能な組版（Explain）
- 各配置決定に「理由」を記録: `ExplainEntry { element, rule: RuleId, inputs, alternatives_rejected }`。
- UI の「なぜ？」ボタンで表示: 例「符尾が下向き：第3線より上の音が多いため（Gould p.13 規則）。上向きにするには…」。
- 規則IDは `docs/rules/` に一覧化し、スタイル設定項目へのリンクを持つ。

## 8. 日本語・邦楽対応（組版側）
- 歌詞：1音符に複数モーラ（「きゃ」等の拗音、促音「っ」、長音「ー」）の扱いを規則化。ルビ（振り仮名）付き歌詞、縦書き歌詞（邦楽譜）対応。
- 数字譜（簡譜/Jianpu）、箏の縦譜、尺八の譜、三味線の文化譜は `NotationKind` ごとに別の「レンダラ戦略」で組む。モデル（音高・時間）は共通、組み方だけ差し替える。
- 和文フォントのテキスト（曲名・発想記号の日本語表記）は `rustybuzz` で正しく整形し、禁則処理を行う。

## 9. 衝突回避
- 要素を優先度順（符頭 > 臨時記号 > 符尾/連桁 > アーティキュレーション > スラー > 強弱 > テキスト）に配置。
- 後から置く要素は、既に置いた要素のバウンディング形状（SMuFL の `cutOut` / 字形アウトライン）と交差しない最小移動を探す。
- 解消できなければ警告を出し、重ねて置く（勝手に消さない）。

## 10. 性能目標
| 対象 | 全体組版 | 1音符編集の差分組版 |
|---|---|---|
| 単旋律 4ページ | < 20ms | < 2ms |
| ピアノ 20ページ | < 150ms | < 5ms |
| 管弦楽 30段×100ページ | < 2s（バックグラウンド） | < 16ms（表示ページ） |
