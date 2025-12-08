# セキュリティ要件

## 1. 概要

本ドキュメントでは、Google Meet 連携機能のセキュリティ要件と実装ガイドラインを定義します。

### 1.1 セキュリティ原則

1. **最小権限の原則**: 必要最小限の権限のみを要求
2. **多層防御**: 複数のセキュリティレイヤーを実装
3. **暗号化**: 保存時・転送時の暗号化を徹底
4. **監査可能性**: 全アクションのログ記録

---

## 2. 認証・認可

### 2.1 OAuth 2.0 実装

#### 2.1.1 認可フロー

| フロー | 使用場面 | セキュリティレベル |
|--------|----------|------------------|
| Authorization Code + PKCE | Webアプリ（フロントエンド） | 高 |
| Refresh Token | バックグラウンド処理 | 高 |

#### 2.1.2 PKCE 実装

```
Code Verifier: 43-128文字のランダム文字列
Code Challenge: SHA256(code_verifier) → Base64URL

フロー:
1. クライアントが code_verifier を生成
2. code_challenge = BASE64URL(SHA256(code_verifier))
3. 認可リクエストに code_challenge を含める
4. トークンリクエストに code_verifier を含める
5. サーバーが検証
```

#### 2.1.3 OAuth スコープ（最小権限）

| スコープ | 用途 | 必要性 |
|----------|------|--------|
| `calendar.events` | カレンダー読み書き | 必須 |
| `meetings.space.settings` | Meet 設定変更 | 必須 |
| `drive.readonly` | 録画ファイル取得 | 必須 |
| `userinfo.email` | ユーザー識別 | 推奨 |

**注意**: `drive` (フルアクセス) ではなく `drive.readonly` を使用

### 2.2 トークン管理

#### 2.2.1 トークン保存

```
┌─────────────────────────────────────────────────────────────────┐
│                      Token Storage Architecture                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────┐   │
│  │   Lambda    │────▶│   DynamoDB  │────▶│   KMS Key       │   │
│  │   Function  │     │   Table     │     │   (Encryption)  │   │
│  └─────────────┘     └─────────────┘     └─────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│                      ┌─────────────────┐                        │
│                      │  Encrypted      │                        │
│                      │  access_token   │                        │
│                      │  refresh_token  │                        │
│                      └─────────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.2.2 暗号化仕様

| 項目 | 仕様 |
|------|------|
| 暗号化方式 | AWS KMS (CMK) |
| キータイプ | SYMMETRIC_DEFAULT (AES-256-GCM) |
| キーローテーション | 自動 (年1回) |
| キーポリシー | Lambda ロールのみ許可 |

#### 2.2.3 トークンライフサイクル

```python
# トークン更新ロジック
def refresh_token_if_needed(user_id: str) -> str:
    token = get_token(user_id)

    # 有効期限の5分前に更新
    if token.expires_at < datetime.now() + timedelta(minutes=5):
        new_token = refresh_google_token(token.refresh_token)
        save_encrypted_token(user_id, new_token)
        return new_token.access_token

    return decrypt_token(token.access_token)
```

### 2.3 Cognito 統合

#### 2.3.1 Identity Provider 設定

```typescript
// Cognito User Pool に Google IdP を追加
const googleIdp = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleIdP', {
  clientId: googleClientId,
  clientSecretValue: googleClientSecret,
  userPool: userPool,
  scopes: ['email', 'profile', 'openid'],
  attributeMapping: {
    email: cognito.ProviderAttribute.GOOGLE_EMAIL,
    fullname: cognito.ProviderAttribute.GOOGLE_NAME,
  },
});
```

---

## 3. データ保護

### 3.1 保存時の暗号化 (At Rest)

| データ | 暗号化方式 | キー管理 |
|--------|-----------|---------|
| DynamoDB | AWS Managed Key | AWS |
| S3 (録画ファイル) | SSE-S3 | AWS |
| OAuth トークン | AWS KMS CMK | Customer Managed |
| Secrets Manager | AWS Managed Key | AWS |

### 3.2 転送時の暗号化 (In Transit)

| 通信経路 | プロトコル | 最小バージョン |
|----------|-----------|--------------|
| クライアント ↔ CloudFront | HTTPS | TLS 1.2 |
| CloudFront ↔ API Gateway | HTTPS | TLS 1.2 |
| Lambda ↔ Google API | HTTPS | TLS 1.2 |
| Lambda ↔ DynamoDB | HTTPS | TLS 1.2 |

### 3.3 機密データの取り扱い

#### 3.3.1 機密データ分類

| 分類 | データ例 | 保護レベル |
|------|---------|-----------|
| 機密 | OAuth トークン、API キー | KMS 暗号化 + アクセス制限 |
| 個人情報 | メールアドレス、名前 | 暗号化 + 監査ログ |
| 業務データ | 録画内容、分析結果 | 暗号化 + アクセス制御 |
| 公開 | 会議タイトル | 標準保護 |

#### 3.3.2 データマスキング（ログ出力時）

```python
def mask_sensitive_data(data: dict) -> dict:
    """機密データをマスキング"""
    masked = data.copy()

    sensitive_fields = ['access_token', 'refresh_token', 'email']

    for field in sensitive_fields:
        if field in masked:
            if field == 'email':
                # メールは一部表示
                parts = masked[field].split('@')
                masked[field] = f"{parts[0][:2]}***@{parts[1]}"
            else:
                # トークンは完全マスク
                masked[field] = "***MASKED***"

    return masked
```

---

## 4. アクセス制御

### 4.1 IAM ポリシー

#### 4.1.1 Lambda 実行ロール（最小権限）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/ek-transcript-meetings-*",
        "arn:aws:dynamodb:*:*:table/ek-transcript-google-tokens-*",
        "arn:aws:dynamodb:*:*:table/ek-transcript-google-tokens-*/index/*"
      ]
    },
    {
      "Sid": "KMSAccess",
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:*:*:key/google-tokens-key-*",
      "Condition": {
        "StringEquals": {
          "kms:EncryptionContext:purpose": "google-oauth-token"
        }
      }
    },
    {
      "Sid": "S3Access",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::ek-transcript-input-*/uploads/*"
    },
    {
      "Sid": "SecretsManagerAccess",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:*:*:secret:ek-transcript/google-oauth-*"
    }
  ]
}
```

### 4.2 リソースベースポリシー

#### 4.2.1 API Gateway リソースポリシー

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:*:*:*/prod/POST/webhook/*",
      "Condition": {
        "IpAddress": {
          "aws:SourceIp": [
            "64.233.160.0/19",
            "66.102.0.0/20",
            "66.249.80.0/20",
            "72.14.192.0/18",
            "74.125.0.0/16",
            "108.177.8.0/21",
            "173.194.0.0/16",
            "207.126.144.0/20",
            "209.85.128.0/17",
            "216.58.192.0/19",
            "216.239.32.0/19"
          ]
        }
      }
    }
  ]
}
```

**注意**: Google Cloud の IP 範囲に制限（Pub/Sub Push 用）

---

## 5. 監査・ログ

### 5.1 監査ログ要件

| イベント | ログレベル | 保持期間 |
|----------|-----------|---------|
| OAuth 認証成功/失敗 | INFO/WARN | 90日 |
| トークン更新 | INFO | 30日 |
| 会議作成/更新/削除 | INFO | 90日 |
| 録画ダウンロード | INFO | 90日 |
| API エラー | ERROR | 90日 |
| 不正アクセス試行 | WARN | 1年 |

### 5.2 CloudWatch Logs 構造

```json
{
  "timestamp": "2025-12-10T14:30:00.000Z",
  "level": "INFO",
  "message": "OAuth token refreshed",
  "context": {
    "user_id": "27a49a78-90f1-70a3-4075-af8dfe627a76",
    "action": "REFRESH_TOKEN",
    "ip_address": "203.0.113.50",
    "user_agent": "Mozilla/5.0...",
    "request_id": "abc123-def456"
  }
}
```

### 5.3 アラート設定

| メトリクス | 閾値 | 重要度 | アクション |
|-----------|------|--------|-----------|
| 認証失敗率 | > 10% / 5分 | High | Slack + PagerDuty |
| トークン更新失敗 | > 5回 / 1時間 | Medium | Slack |
| 不正 IP からのアクセス | 1回以上 | Critical | Slack + 自動ブロック |
| API レート制限超過 | 1回以上 | Medium | Slack |

---

## 6. Webhook セキュリティ

### 6.1 Pub/Sub Push 認証

#### 6.1.1 JWT トークン検証

```python
from google.auth import jwt
from google.auth.transport import requests

def verify_push_token(token: str, audience: str) -> dict:
    """Google Pub/Sub Push トークンを検証"""
    try:
        # Google の公開鍵で JWT を検証
        claims = jwt.decode(
            token,
            request=requests.Request(),
            audience=audience
        )

        # 発行者を確認
        if claims.get('iss') not in [
            'accounts.google.com',
            'https://accounts.google.com'
        ]:
            raise ValueError("Invalid issuer")

        return claims

    except Exception as e:
        logger.warning(f"Token verification failed: {e}")
        raise
```

#### 6.1.2 リプレイ攻撃防止

```python
import hashlib
from datetime import datetime, timedelta

# 処理済みメッセージ ID キャッシュ（TTL: 1時間）
processed_messages = TTLCache(maxsize=10000, ttl=3600)

def is_duplicate_message(message_id: str) -> bool:
    """リプレイ攻撃を防止"""
    if message_id in processed_messages:
        logger.warning(f"Duplicate message detected: {message_id}")
        return True

    processed_messages[message_id] = datetime.now()
    return False
```

### 6.2 レート制限

```python
from functools import lru_cache
from datetime import datetime

class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = {}

    def is_allowed(self, key: str) -> bool:
        now = datetime.now()
        window_start = now - timedelta(seconds=self.window_seconds)

        # 古いリクエストを削除
        self.requests[key] = [
            t for t in self.requests.get(key, [])
            if t > window_start
        ]

        if len(self.requests[key]) >= self.max_requests:
            return False

        self.requests[key].append(now)
        return True

# 1分間に100リクエストまで
rate_limiter = RateLimiter(max_requests=100, window_seconds=60)
```

---

## 7. インシデント対応

### 7.1 インシデント分類

| レベル | 定義 | 対応時間 |
|--------|------|---------|
| P1 (Critical) | データ漏洩、サービス完全停止 | 即時 |
| P2 (High) | 認証システム障害、部分的データアクセス | 1時間以内 |
| P3 (Medium) | 機能障害、パフォーマンス低下 | 4時間以内 |
| P4 (Low) | 軽微な問題、改善要望 | 1営業日 |

### 7.2 対応手順

#### 7.2.1 トークン漏洩時

```
1. 即座に Google Cloud Console でクライアント ID を無効化
2. 全ユーザーのトークンを無効化（DynamoDB TTL を即時に設定）
3. CloudWatch Logs でアクセス履歴を確認
4. 影響範囲の特定
5. ユーザーへの通知
6. 再認証フローの実施
7. インシデントレポート作成
```

#### 7.2.2 不正アクセス検知時

```
1. WAF でソース IP をブロック
2. 該当ユーザーのセッション無効化
3. アクセスログの詳細分析
4. 影響を受けたデータの特定
5. 必要に応じてユーザー通知
6. 再発防止策の実施
```

---

## 8. コンプライアンス

### 8.1 データ保護規制

| 規制 | 対応状況 | 備考 |
|------|---------|------|
| 個人情報保護法 | 対応済み | プライバシーポリシー更新 |
| GDPR（参考） | 一部対応 | EU ユーザーがいる場合 |

### 8.2 Google API 利用規約

- [Google API Terms of Service](https://developers.google.com/terms)
- [Google Meet REST API acceptable use policy](https://developers.google.com/workspace/meet/api/guides/overview#acceptable_use_policy)

**重要制限:**
> The API is not intended for performance tracking or user evaluation within your domain. Meet data shouldn't be collected for this purpose.

### 8.3 データ保持ポリシー

| データ | 保持期間 | 削除方法 |
|--------|---------|---------|
| OAuth トークン | 無期限（手動削除まで） | ユーザー解除時 |
| 会議メタデータ | 1年 | 自動削除 |
| 録画ファイル（S3） | 90日 | S3 ライフサイクル |
| 分析結果 | 1年 | 自動削除 |
| 監査ログ | 90日〜1年 | CloudWatch 保持設定 |
