# ADR 010: Version Auto-Generation

## Status

Accepted

## Context

`src/index.ts` で CLI のバージョン表示のために `package.json` をインポートしていた:

```typescript
import pkg from '../package.json' with { type: 'json' };
program.version(pkg.version);
```

これには以下の問題があった:

1. **パスエイリアスの例外**: `@/` エイリアスを導入したが、`package.json` は `src/` 外にあるため `../package.json` が残る
2. **JSON import の互換性**: `with { type: 'json' }` は環境によって `assert { type: 'json' }` が必要など差異がある
3. **バンドルサイズ**: `package.json` 全体がバンドルに含まれる（name, version 以外は不要）
4. **型安全性**: JSON import は型推論が弱い

## Decision

**version.ts 自動生成パターン**を採用する。

### 実装

**1. 生成スクリプト `scripts/gen-version.mjs`**

```javascript
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const outFile = new URL("../src/version.ts", import.meta.url);

const content = `// This file is auto-generated. Do not edit manually.
export const NAME = ${JSON.stringify(pkg.name)} as const;
export const VERSION = ${JSON.stringify(pkg.version)} as const;
`;

writeFileSync(outFile, content, "utf8");
```

**2. package.json の prebuild フック**

```json
{
  "scripts": {
    "prebuild": "node scripts/gen-version.mjs",
    "build": "tsc"
  }
}
```

**3. 使用側 `src/index.ts`**

```typescript
import { NAME, VERSION } from './version.js';

program
  .name(NAME)
  .version(VERSION);
```

**4. .gitignore に追加**

```
# Auto-generated
src/version.ts
```

## Consequences

### Positive

- **パスエイリアス統一**: `../` インポートが完全に消え、`@/` のみに
- **Tree-shaking**: 必要な値（name, version）のみがバンドルに含まれる
- **型安全**: `as const` により リテラル型として推論
- **環境差なし**: JSON import の互換性問題を回避
- **拡張可能**: 将来的に description, author 等も追加可能

### Negative

- **ビルド前提**: `bun run build` 前に `prebuild` が必要
- **開発時の注意**: version.ts が存在しない状態で `bun run src/index.ts` するとエラー
  - 対策: 初回は `node scripts/gen-version.mjs` を手動実行、または CI で自動生成

### 代替案（不採用）

| 案 | 不採用理由 |
|----|-----------|
| `#root/package.json` エイリアス | JSON import の互換性問題が残る |
| `../package.json` のまま | パスエイリアス統一の例外が残る |
| 手動で version.ts を管理 | バージョン更新時にズレるリスク |

## Notes

- `prebuild` は `npm run build` 時に自動実行される（npm のライフサイクルフック）
- CI/CD では `npm run build` を実行すれば version.ts が自動生成される
- ローカル開発で version.ts がない場合は `node scripts/gen-version.mjs` を実行
