# ADR 072: ESLint から Biome への移行

## ステータス

採用

## コンテキスト

bunterm は当初カスタム ESLint ルールと Prettier を使用してコード品質を管理していた。しかし、いくつかの問題が顕在化した。

### 問題点

1. **実行速度**: ESLint + Prettier の組み合わせは大規模プロジェクトで遅い
2. **設定の複雑さ**: ESLint の設定ファイル（プラグイン、パーサー、ルール）が肥大化
3. **ツールの分離**: リンターとフォーマッターが別ツールで、設定の整合性維持が負担
4. **Bun との相性**: ESLint は Node.js エコシステム向けに最適化されており、Bun 固有の機能への対応が遅い

## 決定

### Biome への移行

[Biome](https://biomejs.dev/) をリンターおよびフォーマッターとして採用する。ESLint と Prettier を完全に置換する。

#### Strict モード

初期導入時からすべてのルールを有効にした strict モードを適用した。

```json
// biome.json
{
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": { "all": true },
      "style": { "all": true },
      "suspicious": { "all": true },
      "complexity": { "all": true },
      "security": { "all": true }
    }
  }
}
```

#### GritQL プラグイン

後に Biome v2.4.8 へのアップグレードに伴い、[GritQL](https://docs.grit.io/) プラグインを追加した（コミット 87a2aa2）。GritQL により AST ベースのカスタムリントルールを宣言的に記述できる。

### コマンド体系

```bash
bun run check      # リント + フォーマットチェック
bun run check:fix  # 自動修正
bun run format     # フォーマットのみ
```

## 代替案

### ESLint + Prettier 維持

**採用しなかった理由**:
- 実行速度の問題が開発体験を損なっていた
- 2 つのツールの設定同期コストが継続的に発生
- Biome は Rust 製で ESLint 比で 10-30 倍高速

### dprint

**採用しなかった理由**:
- フォーマッター特化でリンター機能がない
- ESLint の代替にならず、ツール数が減らない

### oxlint

**採用しなかった理由**:
- 検討時点ではフォーマッター機能がなく Prettier との併用が必要
- Biome はリンター + フォーマッターの統合ツール

## 影響

### Positive

- **高速化**: リント + フォーマットが数十ミリ秒で完了
- **統合ツール**: 1 つの設定ファイル（biome.json）でリンターとフォーマッターを管理
- **Bun 親和性**: Bun のネイティブ TypeScript サポートと相性が良い
- **GritQL**: AST ベースのカスタムルールにより、プロジェクト固有のパターン検出が可能

### Negative

- **ESLint プラグインの喪失**: 一部の ESLint プラグイン（特定のフレームワーク向け等）に相当する機能がない場合がある
- **エコシステムの成熟度**: ESLint に比べサードパーティルールのエコシステムが小さい

## 関連

- ADR 071: パスエイリアス @/ 規約
