# 実装計画

## 1. フェーズ概要

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Implementation Phases                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Phase 1          Phase 2          Phase 3          Phase 4                 │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐            │
│  │  基盤   │─────▶│  認証   │─────▶│ コア機能 │─────▶│  統合   │            │
│  │  構築   │      │  連携   │      │  実装   │      │ テスト  │            │
│  └─────────┘      └─────────┘      └─────────┘      └─────────┘            │
│                                                                              │
│  - GCP設定        - OAuth実装      - Calendar API   - E2Eテスト            │
│  - CDKスタック    - Cognito統合    - Meet API       - 負荷テスト            │
│  - DynamoDB       - トークン管理   - Events API     - セキュリティテスト    │
│                                    - 録画処理                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1: 基盤構築

### 2.1 タスク一覧

| ID | タスク | 優先度 | 依存関係 | 担当 |
|----|--------|--------|---------|------|
| P1-01 | GCP プロジェクト作成 | 必須 | - | Infra |
| P1-02 | Google API 有効化 | 必須 | P1-01 | Infra |
| P1-03 | OAuth 認証情報作成 | 必須 | P1-02 | Infra |
| P1-04 | Cloud Pub/Sub 設定 | 必須 | P1-01 | Infra |
| P1-05 | CDK Google Meet Stack 作成 | 必須 | - | Backend |
| P1-06 | DynamoDB テーブル作成 | 必須 | P1-05 | Backend |
| P1-07 | KMS キー作成 | 必須 | P1-05 | Infra |
| P1-08 | Secrets Manager 設定 | 必須 | P1-03 | Infra |

### 2.2 詳細手順

#### P1-01: GCP プロジェクト作成

```bash
# プロジェクト作成
gcloud projects create ek-transcript-dev \
  --name="EK Transcript Development" \
  --organization=$ORG_ID

# 課金アカウントをリンク
gcloud beta billing projects link ek-transcript-dev \
  --billing-account=$BILLING_ACCOUNT_ID
```

#### P1-02: Google API 有効化

```bash
# 必要な API を有効化
gcloud services enable \
  calendar-json.googleapis.com \
  meet.googleapis.com \
  drive.googleapis.com \
  workspaceevents.googleapis.com \
  pubsub.googleapis.com \
  --project=ek-transcript-dev
```

#### P1-03: OAuth 認証情報作成

1. GCP Console → APIs & Services → Credentials
2. OAuth 2.0 クライアント ID を作成
3. アプリケーションタイプ: ウェブアプリケーション
4. 承認済みリダイレクト URI:
   - `https://localhost:3000/api/auth/callback/google`
   - `https://your-domain.com/api/auth/callback/google`

#### P1-04: Cloud Pub/Sub 設定

```bash
# トピック作成
gcloud pubsub topics create meet-events \
  --project=ek-transcript-dev

# サブスクリプション作成（Push）
gcloud pubsub subscriptions create meet-events-sub \
  --topic=meet-events \
  --push-endpoint=https://xxx.execute-api.ap-northeast-1.amazonaws.com/prod/webhook/meet-events \
  --push-auth-service-account=pubsub-invoker@ek-transcript-dev.iam.gserviceaccount.com \
  --project=ek-transcript-dev
```

#### P1-05: CDK Stack 作成

**ファイル構造:**
```
cdk/lib/stacks/
├── google-meet/
│   ├── google-auth-stack.ts
│   ├── google-meet-lambda-stack.ts
│   ├── google-meet-api-stack.ts
│   └── google-meet-storage-stack.ts
```

**google-meet-storage-stack.ts:**
```typescript
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface GoogleMeetStorageStackProps extends cdk.StackProps {
  environment: string;
}

export class GoogleMeetStorageStack extends cdk.Stack {
  public readonly meetingsTable: dynamodb.Table;
  public readonly googleTokensTable: dynamodb.Table;
  public readonly subscriptionsTable: dynamodb.Table;
  public readonly tokenEncryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props: GoogleMeetStorageStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // KMS Key for token encryption
    this.tokenEncryptionKey = new kms.Key(this, 'TokenEncryptionKey', {
      alias: `alias/ek-transcript-google-tokens-${environment}`,
      description: 'Key for encrypting Google OAuth tokens',
      enableKeyRotation: true,
    });

    // Meetings Table
    this.meetingsTable = new dynamodb.Table(this, 'MeetingsTable', {
      tableName: `ek-transcript-meetings-${environment}`,
      partitionKey: { name: 'meeting_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    });

    this.meetingsTable.addGlobalSecondaryIndex({
      indexName: 'user_id-start_time-index',
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'start_time', type: dynamodb.AttributeType.STRING },
    });

    // Google Tokens Table (with KMS encryption)
    this.googleTokensTable = new dynamodb.Table(this, 'GoogleTokensTable', {
      tableName: `ek-transcript-google-tokens-${environment}`,
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.tokenEncryptionKey,
      timeToLiveAttribute: 'expires_at',
    });

    // Subscriptions Table
    this.subscriptionsTable = new dynamodb.Table(this, 'SubscriptionsTable', {
      tableName: `ek-transcript-event-subscriptions-${environment}`,
      partitionKey: { name: 'subscription_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expire_time',
    });
  }
}
```

### 2.3 完了条件

- [ ] GCP プロジェクトが作成され、API が有効化されている
- [ ] OAuth クライアント ID/Secret が取得できる
- [ ] Pub/Sub トピックとサブスクリプションが作成されている
- [ ] CDK スタックがデプロイ可能
- [ ] DynamoDB テーブルが作成されている
- [ ] KMS キーが作成され、ポリシーが設定されている

---

## 3. Phase 2: 認証連携

### 3.1 タスク一覧

| ID | タスク | 優先度 | 依存関係 | 担当 |
|----|--------|--------|---------|------|
| P2-01 | OAuth 認証 Lambda 実装 | 必須 | P1-03 | Backend |
| P2-02 | トークン管理モジュール実装 | 必須 | P1-06, P1-07 | Backend |
| P2-03 | Cognito Google IdP 設定 | 必須 | P1-03 | Backend |
| P2-04 | フロントエンド Google ログイン | 必須 | P2-03 | Frontend |
| P2-05 | トークン更新ジョブ実装 | 必須 | P2-02 | Backend |
| P2-06 | 認証 E2E テスト | 必須 | P2-04 | QA |

### 3.2 詳細実装

#### P2-01: OAuth 認証 Lambda

**lambdas/google_auth/lambda_function.py:**
```python
"""
Google OAuth 認証 Lambda

OAuth 2.0 Authorization Code Flow を処理
"""

import json
import os
from datetime import datetime, timezone

import boto3
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

dynamodb = boto3.resource('dynamodb')
kms = boto3.client('kms')

GOOGLE_CLIENT_ID = os.environ['GOOGLE_CLIENT_ID']
GOOGLE_CLIENT_SECRET = os.environ['GOOGLE_CLIENT_SECRET']
KMS_KEY_ID = os.environ['KMS_KEY_ID']
TOKENS_TABLE = os.environ['TOKENS_TABLE']

SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/meetings.space.settings',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
]


def get_auth_url(redirect_uri: str, state: str) -> str:
    """OAuth 認証 URL を生成"""
    flow = Flow.from_client_config(
        {
            'web': {
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        },
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )

    auth_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',
        state=state,
    )

    return auth_url


def exchange_code(code: str, redirect_uri: str) -> dict:
    """認証コードをトークンに交換"""
    flow = Flow.from_client_config(
        {
            'web': {
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        },
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )

    flow.fetch_token(code=code)
    credentials = flow.credentials

    return {
        'access_token': credentials.token,
        'refresh_token': credentials.refresh_token,
        'expires_at': credentials.expiry.isoformat() if credentials.expiry else None,
        'scopes': list(credentials.scopes),
    }


def encrypt_token(token: str) -> str:
    """KMS でトークンを暗号化"""
    response = kms.encrypt(
        KeyId=KMS_KEY_ID,
        Plaintext=token.encode(),
        EncryptionContext={'purpose': 'google-oauth-token'},
    )
    return response['CiphertextBlob'].hex()


def save_tokens(user_id: str, email: str, tokens: dict) -> None:
    """トークンを DynamoDB に保存（暗号化）"""
    table = dynamodb.Table(TOKENS_TABLE)

    table.put_item(Item={
        'user_id': user_id,
        'email': email,
        'access_token': encrypt_token(tokens['access_token']),
        'refresh_token': encrypt_token(tokens['refresh_token']),
        'scopes': tokens['scopes'],
        'expires_at': int(datetime.fromisoformat(tokens['expires_at']).timestamp()),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    })


def lambda_handler(event: dict, context) -> dict:
    """Lambda ハンドラー"""
    action = event.get('action')

    if action == 'get_auth_url':
        redirect_uri = event['redirect_uri']
        state = event['state']
        auth_url = get_auth_url(redirect_uri, state)
        return {'auth_url': auth_url}

    elif action == 'exchange_code':
        code = event['code']
        redirect_uri = event['redirect_uri']
        user_id = event['user_id']
        email = event['email']

        tokens = exchange_code(code, redirect_uri)
        save_tokens(user_id, email, tokens)

        return {'success': True}

    else:
        return {'error': 'Unknown action'}
```

#### P2-02: トークン管理モジュール

**lambdas/shared/google_token_manager.py:**
```python
"""
Google OAuth トークン管理

トークンの取得、復号化、更新を担当
"""

import os
from datetime import datetime, timedelta, timezone

import boto3
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

dynamodb = boto3.resource('dynamodb')
kms = boto3.client('kms')

TOKENS_TABLE = os.environ.get('TOKENS_TABLE', '')
KMS_KEY_ID = os.environ.get('KMS_KEY_ID', '')


def decrypt_token(encrypted_token: str) -> str:
    """KMS でトークンを復号化"""
    response = kms.decrypt(
        CiphertextBlob=bytes.fromhex(encrypted_token),
        EncryptionContext={'purpose': 'google-oauth-token'},
    )
    return response['Plaintext'].decode()


def get_valid_credentials(user_id: str) -> Credentials:
    """
    有効な認証情報を取得

    必要に応じてトークンを更新
    """
    table = dynamodb.Table(TOKENS_TABLE)
    item = table.get_item(Key={'user_id': user_id}).get('Item')

    if not item:
        raise ValueError(f"No tokens found for user: {user_id}")

    access_token = decrypt_token(item['access_token'])
    refresh_token = decrypt_token(item['refresh_token'])

    credentials = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri='https://oauth2.googleapis.com/token',
        client_id=os.environ['GOOGLE_CLIENT_ID'],
        client_secret=os.environ['GOOGLE_CLIENT_SECRET'],
        scopes=item['scopes'],
    )

    # トークンが期限切れまたは5分以内に期限切れの場合、更新
    if credentials.expired or (
        credentials.expiry and
        credentials.expiry < datetime.now(timezone.utc) + timedelta(minutes=5)
    ):
        credentials.refresh(Request())

        # 更新されたトークンを保存
        _save_updated_tokens(user_id, credentials)

    return credentials


def _save_updated_tokens(user_id: str, credentials: Credentials) -> None:
    """更新されたトークンを保存"""
    table = dynamodb.Table(TOKENS_TABLE)

    def encrypt(token: str) -> str:
        response = kms.encrypt(
            KeyId=KMS_KEY_ID,
            Plaintext=token.encode(),
            EncryptionContext={'purpose': 'google-oauth-token'},
        )
        return response['CiphertextBlob'].hex()

    table.update_item(
        Key={'user_id': user_id},
        UpdateExpression='SET access_token = :at, expires_at = :exp, updated_at = :upd',
        ExpressionAttributeValues={
            ':at': encrypt(credentials.token),
            ':exp': int(credentials.expiry.timestamp()) if credentials.expiry else 0,
            ':upd': datetime.now(timezone.utc).isoformat(),
        },
    )
```

### 3.3 完了条件

- [ ] Google ログインボタンから認証フローが完了する
- [ ] トークンが KMS で暗号化されて DynamoDB に保存される
- [ ] トークンの自動更新が機能する
- [ ] ログアウト時にトークンが削除される
- [ ] 認証エラー時に適切なエラーメッセージが表示される

---

## 4. Phase 3: コア機能実装

### 4.1 タスク一覧

| ID | タスク | 優先度 | 依存関係 | 担当 |
|----|--------|--------|---------|------|
| P3-01 | Calendar Sync Lambda | 必須 | P2-02 | Backend |
| P3-02 | Meet Config Lambda | 必須 | P2-02 | Backend |
| P3-03 | Event Handler Lambda | 必須 | P1-04 | Backend |
| P3-04 | Download Recording Lambda | 必須 | P2-02 | Backend |
| P3-05 | AppSync スキーマ拡張 | 必須 | P3-01 | Backend |
| P3-06 | フロントエンド会議一覧 | 必須 | P3-05 | Frontend |
| P3-07 | フロントエンド会議作成 | 必須 | P3-05 | Frontend |
| P3-08 | Step Functions 統合 | 必須 | P3-04 | Backend |

### 4.2 主要 Lambda 実装

#### P3-02: Meet Config Lambda

**lambdas/meet_config/lambda_function.py:**
```python
"""
Google Meet Space 設定 Lambda

Meet Space の作成と auto-recording 設定を担当
"""

import json
import logging
import os
from datetime import datetime, timezone

import boto3
from googleapiclient.discovery import build

from shared.google_token_manager import get_valid_credentials

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
MEETINGS_TABLE = os.environ.get('MEETINGS_TABLE', '')


def create_meet_space(user_id: str, auto_recording: bool = True, auto_transcription: bool = True) -> dict:
    """
    Google Meet Space を作成し、auto-recording を設定

    Args:
        user_id: ユーザーID
        auto_recording: 自動録画を有効にするか
        auto_transcription: 自動文字起こしを有効にするか

    Returns:
        作成された Space 情報
    """
    credentials = get_valid_credentials(user_id)

    service = build('meet', 'v2', credentials=credentials)

    space_config = {
        'config': {
            'accessType': 'TRUSTED',
            'entryPointAccess': 'ALL',
            'artifactConfig': {
                'recordingConfig': {
                    'autoRecordingGeneration': 'ON' if auto_recording else 'OFF'
                },
                'transcriptionConfig': {
                    'autoTranscriptionGeneration': 'ON' if auto_transcription else 'OFF'
                }
            }
        }
    }

    logger.info(f"Creating Meet space with config: {json.dumps(space_config)}")

    space = service.spaces().create(body=space_config).execute()

    logger.info(f"Created Meet space: {space['name']}")

    return space


def update_meet_space(user_id: str, space_id: str, auto_recording: bool) -> dict:
    """
    既存の Meet Space の設定を更新

    Args:
        user_id: ユーザーID
        space_id: Space ID (spaces/xxx)
        auto_recording: 自動録画を有効にするか

    Returns:
        更新された Space 情報
    """
    credentials = get_valid_credentials(user_id)

    service = build('meet', 'v2', credentials=credentials)

    update_body = {
        'config': {
            'artifactConfig': {
                'recordingConfig': {
                    'autoRecordingGeneration': 'ON' if auto_recording else 'OFF'
                }
            }
        }
    }

    space = service.spaces().patch(
        name=space_id,
        body=update_body,
        updateMask='config.artifactConfig.recordingConfig.autoRecordingGeneration'
    ).execute()

    logger.info(f"Updated Meet space: {space['name']}")

    return space


def lambda_handler(event: dict, context) -> dict:
    """Lambda ハンドラー"""
    action = event.get('action')
    user_id = event.get('user_id')

    try:
        if action == 'create':
            auto_recording = event.get('auto_recording', True)
            auto_transcription = event.get('auto_transcription', True)

            space = create_meet_space(user_id, auto_recording, auto_transcription)

            return {
                'success': True,
                'space': space
            }

        elif action == 'update':
            space_id = event.get('space_id')
            auto_recording = event.get('auto_recording', True)

            space = update_meet_space(user_id, space_id, auto_recording)

            return {
                'success': True,
                'space': space
            }

        else:
            return {'error': 'Unknown action'}

    except Exception as e:
        logger.error(f"Error: {e}")
        return {'error': str(e)}
```

### 4.3 完了条件

- [ ] カレンダーイベントの同期が動作する
- [ ] 会議作成時に auto-recording が設定される
- [ ] 録画完了イベントを受信できる
- [ ] 録画ファイルがダウンロードされ S3 にアップロードされる
- [ ] 既存の Step Functions パイプラインが起動する
- [ ] フロントエンドで会議一覧が表示される

---

## 5. Phase 4: 統合テスト

### 5.1 タスク一覧

| ID | タスク | 優先度 | 依存関係 | 担当 |
|----|--------|--------|---------|------|
| P4-01 | E2E テストシナリオ作成 | 必須 | P3-08 | QA |
| P4-02 | E2E テスト実行 | 必須 | P4-01 | QA |
| P4-03 | 負荷テスト | 推奨 | P4-02 | QA |
| P4-04 | セキュリティテスト | 必須 | P4-02 | Security |
| P4-05 | ドキュメント更新 | 必須 | P4-02 | All |
| P4-06 | 本番デプロイ準備 | 必須 | P4-04 | Infra |

### 5.2 E2E テストシナリオ

#### シナリオ 1: 新規会議の自動録画設定

```gherkin
Feature: 新規会議の自動録画設定

Scenario: ユーザーが自動録画付き会議を作成する
  Given ユーザーが Google アカウントでログインしている
  When ユーザーが「新規会議作成」をクリック
  And 会議タイトル「HEMS インタビュー #8」を入力
  And 開始日時を「2025-12-20 14:00」に設定
  And 終了日時を「2025-12-20 15:00」に設定
  And 「自動録画を有効にする」をチェック
  And 「作成」をクリック
  Then 会議が作成される
  And Google Calendar にイベントが追加される
  And Meet Space に auto-recording が設定される
  And 会議一覧に新しい会議が表示される
```

#### シナリオ 2: 録画完了後の自動分析

```gherkin
Feature: 録画完了後の自動分析

Scenario: 会議終了後に録画が自動分析される
  Given 自動録画が設定された会議が終了した
  When 録画ファイルが生成される
  Then システムが Pub/Sub イベントを受信する
  And 録画ファイルがダウンロードされる
  And S3 にアップロードされる
  And Step Functions パイプラインが起動する
  And 分析が完了する
  And 結果が会議に紐付けられる
```

### 5.3 負荷テスト計画

| テスト項目 | 目標値 | ツール |
|-----------|--------|--------|
| 同時ユーザー数 | 100 | k6 |
| 会議作成スループット | 10 req/s | k6 |
| 録画ダウンロード並列数 | 10 | カスタムスクリプト |
| API レスポンス時間 | < 2秒 (p95) | k6 |

### 5.4 完了条件

- [ ] 全 E2E テストシナリオがパスする
- [ ] 負荷テストで目標値を達成する
- [ ] セキュリティスキャンで重大な脆弱性がない
- [ ] ドキュメントが更新されている
- [ ] 本番環境の設定が完了している

---

## 6. リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Google API のレート制限 | 高 | 指数バックオフ、キャッシング |
| Pub/Sub 通知の遅延 | 中 | ポーリングフォールバック |
| 大規模録画ファイル | 中 | マルチパートアップロード、タイムアウト延長 |
| トークン期限切れ | 中 | 自動更新、ユーザー通知 |
| Google API の仕様変更 | 低 | バージョン固定、監視 |

---

## 7. 成果物チェックリスト

### Phase 1 完了時
- [ ] GCP プロジェクト設定完了
- [ ] CDK スタック (Storage) デプロイ完了
- [ ] DynamoDB テーブル作成完了

### Phase 2 完了時
- [ ] OAuth 認証フロー実装完了
- [ ] トークン管理モジュール実装完了
- [ ] 認証 E2E テスト完了

### Phase 3 完了時
- [ ] 全 Lambda 関数実装完了
- [ ] AppSync スキーマ拡張完了
- [ ] フロントエンド UI 実装完了
- [ ] Step Functions 統合完了

### Phase 4 完了時
- [ ] 全テスト完了
- [ ] ドキュメント更新完了
- [ ] 本番デプロイ完了

---

## 8. 参考リンク

- [Google Meet REST API](https://developers.google.com/workspace/meet/api/guides/overview)
- [Google Workspace Events API](https://developers.google.com/workspace/events)
- [Google Calendar API](https://developers.google.com/calendar/api)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [AWS AppSync](https://docs.aws.amazon.com/appsync/)
