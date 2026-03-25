# ADR 016: Toolbar Configuration and Persistence

## Status

Accepted

## Context

ツールバーには以下の設定値がハードコードされていた:

```typescript
// 変更したい値がコード内に固定
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 48;
const FONT_SIZE_DEFAULT_MOBILE = 32;
const FONT_SIZE_DEFAULT_PC = 14;
const DOUBLE_TAP_DELAY = 300;
```

また、以下の状態がページリロードで失われていた:

- フォントサイズ
- Auto モードの ON/OFF

## Decision

### 1. 設定値を config.yaml に移動

**config.yaml:**
```yaml
toolbar:
  font_size_default_mobile: 32  # モバイルのデフォルトフォントサイズ
  font_size_default_pc: 14      # PCのデフォルトフォントサイズ
  font_size_min: 10             # 最小フォントサイズ
  font_size_max: 48             # 最大フォントサイズ
  double_tap_delay: 300         # ダブルタップ判定時間(ms)
```

**Zod スキーマ:**
```typescript
export const ToolbarConfigSchema = z.object({
  font_size_default_mobile: z.number().int().min(8).max(72).default(32),
  font_size_default_pc: z.number().int().min(8).max(72).default(14),
  font_size_min: z.number().int().min(6).max(20).default(10),
  font_size_max: z.number().int().min(24).max(96).default(48),
  double_tap_delay: z.number().int().min(100).max(1000).default(300)
});
```

### 2. スクリプト生成時に設定を注入

```typescript
export function getToolbarScript(config: ToolbarConfig): string {
  const { font_size_min, font_size_max, ... } = config;

  return `(function() {
    const FONT_SIZE_MIN = ${font_size_min};
    const FONT_SIZE_MAX = ${font_size_max};
    ...
  })();`;
}
```

### 3. localStorage による状態永続化

| キー | 値 | 用途 |
|-----|-----|------|
| `ttyd-toolbar-font-size` | 数値 | フォントサイズ |
| `ttyd-toolbar-auto-run` | `'0'` / `'1'` | Auto モード状態 |
| `ttyd-toolbar-onboarding-shown` | `'1'` | オンボーディング表示済み |

**保存:**
```javascript
function saveFontSize(size) {
  localStorage.setItem('ttyd-toolbar-font-size', String(size));
}

function saveAutoRun(enabled) {
  localStorage.setItem('ttyd-toolbar-auto-run', enabled ? '1' : '0');
}
```

**復元:**
```javascript
function applyStoredFontSize() {
  const stored = localStorage.getItem('ttyd-toolbar-font-size');
  if (stored) {
    term.options.fontSize = parseInt(stored, 10);
  }
}

function applyStoredAutoRun() {
  const stored = localStorage.getItem('ttyd-toolbar-auto-run');
  if (stored === '1') {
    autoRunActive = true;
    autoBtn.classList.add('active');
  }
}
```

### 4. 定数の分類

| 種類 | 場所 | 例 |
|------|------|-----|
| ユーザー設定 | config.yaml | `font_size_default_mobile` |
| 内部キー | toolbar/config.ts | `STORAGE_KEY` |
| デフォルト値 | config/types.ts | `DEFAULT_TOOLBAR_CONFIG` |

## Consequences

### Positive

- **カスタマイズ可能**: ユーザーが好みのフォントサイズを設定可能
- **状態永続化**: リロードしても設定が維持される
- **部分オーバーライド**: 一部の値だけ変更可能（残りはデフォルト）
- **バリデーション**: Zod による型安全な設定読み込み

### Negative

- **localStorage 依存**: プライベートブラウジングでは永続化されない
- **設定の複雑化**: config.yaml の項目が増加

### Neutral

- **キャッシュとの関係**: config 変更後は toolbar.js のキャッシュクリアが必要

## Notes

### 設定例

```yaml
# 高齢者向け（大きいフォント）
toolbar:
  font_size_default_mobile: 40
  font_size_default_pc: 20
  font_size_min: 16

# 開発者向け（小さいフォント、高速ダブルタップ）
toolbar:
  font_size_default_mobile: 24
  font_size_default_pc: 12
  double_tap_delay: 200
```

### localStorage のクリア

設定をリセットしたい場合:
```javascript
localStorage.removeItem('ttyd-toolbar-font-size');
localStorage.removeItem('ttyd-toolbar-auto-run');
localStorage.removeItem('ttyd-toolbar-onboarding-shown');
```

### 関連コミット

- `2bdeb2a feat: add localStorage persistence for terminal font size`
- `47a6c9d feat: add mobile scroll, auto persistence, toolbar config, and doctor command`

### 関連 ADR

- ADR 015: Toolbar Module Architecture - ツールバーの構造
