# ADR 063: SHA-256 から scrypt へのパスワードハッシュ移行

## ステータス

採用

## 日付

2026-03-23

## コンテキスト

bunterm の読み取り専用共有リンク機能（`bunterm share`）では、共有リンクにパスワードを設定できる。このパスワードのハッシュ化に SHA-256 を使用していた。

### 問題点

SHA-256 は暗号学的ハッシュ関数であるが、**パスワードハッシュには不適切**である：

| 特性 | SHA-256 | パスワードハッシュに必要な特性 |
|------|---------|------------------------------|
| 計算速度 | 極めて高速（GPU で数十億回/秒） | 意図的に低速であるべき |
| メモリ使用 | 少量 | 大量のメモリを使用すべき |
| ソルト | なし（手動で付与可能） | 組み込み |
| ストレッチング | なし | 組み込み |

SHA-256 は高速であるため、攻撃者が GPU を使用したブルートフォース攻撃で短時間にパスワードを解読できる。共有リンクのパスワードは短い文字列になりがちであり、リスクが高い。

## 決定

パスワードハッシュを **SHA-256 から scrypt に移行**する。

### scrypt の特徴

- **メモリハード**: 計算に大量のメモリを必要とし、GPU/ASIC による並列攻撃が困難
- **計算コスト調整可能**: N, r, p パラメータで計算コストを制御
- **ソルト内蔵**: ランダムソルトが自動的に生成・保存される

### 実装

```typescript
import { password } from 'bun';

// ハッシュ化（新規作成時）
const hash = await password.hash(plaintext, { algorithm: 'scrypt' });

// 検証
const isValid = await password.verify(plaintext, hash);
```

Bun の `password` API は scrypt をネイティブサポートしており、外部ライブラリ不要で利用できる。

### 移行戦略

既存の SHA-256 ハッシュを一括変換するのではなく、**次回バリデーション時に再ハッシュ**する方式を採用：

```typescript
async function verifyAndMigrate(
  plaintext: string,
  storedHash: string,
): Promise<{ valid: boolean; newHash?: string }> {
  if (isScryptHash(storedHash)) {
    // scrypt ハッシュ: そのまま検証
    const valid = await password.verify(plaintext, storedHash);
    return { valid };
  }

  // SHA-256 ハッシュ: 旧方式で検証
  const valid = verifySha256(plaintext, storedHash);
  if (valid) {
    // 検証成功時に scrypt で再ハッシュ
    const newHash = await password.hash(plaintext, { algorithm: 'scrypt' });
    return { valid: true, newHash };
  }
  return { valid: false };
}
```

### ハッシュ形式の判別

scrypt ハッシュは `$scrypt$` プレフィックスを持つため、既存の SHA-256 ハッシュ（hex 文字列）と容易に区別できる。

## 代替案

### 1. bcrypt

最も広く使われているパスワードハッシュアルゴリズム。

**採用しなかった理由**:
- bcrypt はメモリハードではなく、GPU 攻撃に対する耐性が scrypt より低い
- Bun の `password` API で scrypt と bcrypt の両方がサポートされているが、scrypt の方がセキュリティ特性に優れる

### 2. argon2id

Password Hashing Competition の勝者。最新のパスワードハッシュアルゴリズム。

**採用しなかった理由**:
- Bun の `password` API が argon2id をネイティブサポートしていない（2026-03 時点）
- 外部ライブラリ（`argon2`）が必要になり、ネイティブバイナリの依存が増える
- scrypt で十分なセキュリティ水準を確保できる

### 3. SHA-256 + salt + PBKDF2

SHA-256 ベースのまま、ソルトとストレッチングを追加する。

**採用しなかった理由**:
- PBKDF2 は CPU バウンドであり、GPU 攻撃への耐性が scrypt/bcrypt より低い
- scrypt への移行と実装コストが変わらない

## 影響

### Positive

- **ブルートフォース耐性**: scrypt のメモリハード特性により、GPU/ASIC 攻撃が実質的に不可能
- **ゼロ外部依存**: Bun の組み込み API のみで実装
- **透過的移行**: ユーザーは再設定不要。次回パスワード入力時に自動的に scrypt に移行
- **将来への備え**: パラメータ調整でハードウェアの進化に対応可能

### Negative

- **検証速度の低下**: scrypt は SHA-256 より意図的に遅い（~100ms vs ~0.01ms）。共有リンクのアクセス頻度では問題にならない
- **移行期間中の混在**: SHA-256 と scrypt のハッシュが混在する期間が発生
- **メモリ使用量の増加**: scrypt はハッシュ計算時に ~16MB のメモリを使用

## 関連

- ADR 030: Read-Only Share Links — 共有リンク機能の設計
- ADR 060: WebSocket Security and Session Validation — セキュリティ強化の一環
