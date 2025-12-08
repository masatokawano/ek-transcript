# データモデル定義

## 1. DynamoDB テーブル設計

### 1.1 テーブル一覧

| テーブル名 | 目的 | パーティションキー | ソートキー |
|-----------|------|------------------|-----------|
| ek-transcript-meetings-{env} | 会議情報管理 | meeting_id | - |
| ek-transcript-google-tokens-{env} | OAuth トークン | user_id | - |
| ek-transcript-event-subscriptions-{env} | イベント購読管理 | subscription_id | - |
| ek-transcript-interviews-{env} (既存) | 分析結果 | interview_id | - |

---

## 2. Meetings テーブル

### 2.1 スキーマ

```
Table: ek-transcript-meetings-{env}

Primary Key:
  - Partition Key: meeting_id (String)

Global Secondary Indexes:
  - user_id-start_time-index
      Partition Key: user_id (String)
      Sort Key: start_time (String)
      Projection: ALL

  - calendar_event_id-index
      Partition Key: calendar_event_id (String)
      Projection: KEYS_ONLY

  - meet_space_id-index
      Partition Key: meet_space_id (String)
      Projection: KEYS_ONLY
```

### 2.2 属性定義

| 属性名 | 型 | 必須 | 説明 |
|--------|-----|------|------|
| meeting_id | String (UUID) | Yes | 会議の一意識別子 |
| user_id | String | Yes | ユーザーID (Cognito sub) |
| calendar_event_id | String | Yes | Google Calendar イベントID |
| meet_space_id | String | No | Google Meet Space ID |
| meet_uri | String | No | Meet 参加URL |
| meet_code | String | No | Meet コード (xxx-yyyy-zzz) |
| title | String | Yes | 会議タイトル |
| description | String | No | 会議説明 |
| start_time | String (ISO8601) | Yes | 開始日時 |
| end_time | String (ISO8601) | Yes | 終了日時 |
| timezone | String | No | タイムゾーン |
| attendees | List | No | 参加者リスト |
| auto_recording_enabled | Boolean | Yes | 自動録画設定 |
| auto_transcription_enabled | Boolean | Yes | 自動文字起こし設定 |
| recording_status | String | Yes | 録画状態 |
| recording_file_id | String | No | Google Drive ファイルID |
| recording_size_bytes | Number | No | 録画ファイルサイズ |
| interview_id | String | No | 紐付いた分析結果ID |
| subscription_id | String | No | Workspace Events 購読ID |
| error_message | String | No | エラーメッセージ |
| created_at | String (ISO8601) | Yes | 作成日時 |
| updated_at | String (ISO8601) | Yes | 更新日時 |

### 2.3 attendees 属性の構造

```json
{
  "attendees": [
    {
      "email": "user@example.com",
      "name": "山田太郎",
      "response_status": "ACCEPTED",
      "organizer": false
    }
  ]
}
```

### 2.4 recording_status の値

| 値 | 説明 |
|----|------|
| PENDING | 会議前（録画未開始） |
| SCHEDULED | 自動録画設定済み |
| RECORDING | 録画中 |
| PROCESSING | ファイル生成中 |
| DOWNLOADING | ダウンロード中 |
| UPLOADING | S3 アップロード中 |
| COMPLETED | 完了 |
| FAILED | 失敗 |
| DISABLED | 録画無効 |

### 2.5 サンプルアイテム

```json
{
  "meeting_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "27a49a78-90f1-70a3-4075-af8dfe627a76",
  "calendar_event_id": "abc123xyz",
  "meet_space_id": "spaces/abc123xyz",
  "meet_uri": "https://meet.google.com/abc-defg-hij",
  "meet_code": "abc-defg-hij",
  "title": "HEMS インタビュー #7",
  "description": "ユーザーインタビュー実施",
  "start_time": "2025-12-15T14:00:00+09:00",
  "end_time": "2025-12-15T15:00:00+09:00",
  "timezone": "Asia/Tokyo",
  "attendees": [
    {
      "email": "interviewer@example.com",
      "name": "インタビュアー",
      "response_status": "ACCEPTED",
      "organizer": true
    },
    {
      "email": "participant@example.com",
      "name": "参加者",
      "response_status": "ACCEPTED",
      "organizer": false
    }
  ],
  "auto_recording_enabled": true,
  "auto_transcription_enabled": true,
  "recording_status": "COMPLETED",
  "recording_file_id": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
  "recording_size_bytes": 524288000,
  "interview_id": "660e8400-e29b-41d4-a716-446655440001",
  "subscription_id": "subscriptions/sub123",
  "created_at": "2025-12-10T10:00:00Z",
  "updated_at": "2025-12-15T15:30:00Z"
}
```

---

## 3. Google Tokens テーブル

### 3.1 スキーマ

```
Table: ek-transcript-google-tokens-{env}

Primary Key:
  - Partition Key: user_id (String)

TTL:
  - expires_at (Number) - トークン有効期限
```

### 3.2 属性定義

| 属性名 | 型 | 必須 | 説明 |
|--------|-----|------|------|
| user_id | String | Yes | ユーザーID (Cognito sub) |
| email | String | Yes | Google アカウントメール |
| access_token | String | Yes | アクセストークン（暗号化） |
| refresh_token | String | Yes | リフレッシュトークン（暗号化） |
| token_type | String | Yes | トークンタイプ ("Bearer") |
| scopes | List | Yes | 許可されたスコープ |
| expires_at | Number | Yes | 有効期限（Unix timestamp） |
| created_at | String (ISO8601) | Yes | 作成日時 |
| updated_at | String (ISO8601) | Yes | 更新日時 |

### 3.3 暗号化

**使用する AWS KMS キー:**
```
arn:aws:kms:{region}:{account}:key/{key-id}
```

**暗号化対象フィールド:**
- access_token
- refresh_token

### 3.4 サンプルアイテム

```json
{
  "user_id": "27a49a78-90f1-70a3-4075-af8dfe627a76",
  "email": "user@example.com",
  "access_token": "AQIDBAUGBwgJCgsM...",
  "refresh_token": "AQIDBAUGBwgJCgsM...",
  "token_type": "Bearer",
  "scopes": [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/meetings.space.settings",
    "https://www.googleapis.com/auth/drive.readonly"
  ],
  "expires_at": 1734300000,
  "created_at": "2025-12-10T10:00:00Z",
  "updated_at": "2025-12-15T14:00:00Z"
}
```

---

## 4. Event Subscriptions テーブル

### 4.1 スキーマ

```
Table: ek-transcript-event-subscriptions-{env}

Primary Key:
  - Partition Key: subscription_id (String)

Global Secondary Indexes:
  - meet_space_id-index
      Partition Key: meet_space_id (String)
      Projection: ALL

  - user_id-index
      Partition Key: user_id (String)
      Projection: ALL

TTL:
  - expire_time (Number) - 購読有効期限
```

### 4.2 属性定義

| 属性名 | 型 | 必須 | 説明 |
|--------|-----|------|------|
| subscription_id | String | Yes | Google 購読ID |
| user_id | String | Yes | ユーザーID |
| meet_space_id | String | Yes | Meet Space ID |
| meeting_id | String | Yes | 関連する会議ID |
| event_types | List | Yes | 購読イベントタイプ |
| state | String | Yes | 購読状態 |
| expire_time | Number | Yes | 有効期限（Unix timestamp） |
| created_at | String (ISO8601) | Yes | 作成日時 |

### 4.3 state の値

| 値 | 説明 |
|----|------|
| ACTIVE | 有効 |
| SUSPENDED | 一時停止 |
| DELETED | 削除済み |

---

## 5. Interviews テーブル（既存・拡張）

### 5.1 追加属性

| 属性名 | 型 | 必須 | 説明 |
|--------|-----|------|------|
| meeting_id | String | No | 紐付いた会議ID |
| source | String | No | ソース ("upload" / "google_meet") |
| google_recording_id | String | No | Google 録画ID |

### 5.2 サンプルアイテム（拡張後）

```json
{
  "interview_id": "660e8400-e29b-41d4-a716-446655440001",
  "segment": "HEMS",
  "user_id": "27a49a78-90f1-70a3-4075-af8dfe627a76",
  "status": "completed",
  "progress": 100,
  "current_step": "completed",
  "file_name": "HEMS インタビュー #7 - 2025-12-15.mp4",
  "file_size": 524288000,
  "video_key": "uploads/27a49a78.../video.mp4",
  "analysis_key": "analysis/abc123_structured.json",
  "transcript_key": "transcripts/abc123_transcript.json",
  "total_score": 23,
  "meeting_id": "550e8400-e29b-41d4-a716-446655440000",
  "source": "google_meet",
  "google_recording_id": "conferenceRecords/conf123/recordings/rec456",
  "created_at": "2025-12-15T15:30:00Z",
  "updated_at": "2025-12-15T16:45:00Z"
}
```

---

## 6. リレーション図

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Entity Relationship                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐  │
│  │   GoogleToken   │        │     Meeting     │        │   Interview     │  │
│  ├─────────────────┤        ├─────────────────┤        ├─────────────────┤  │
│  │ user_id (PK)    │───┐    │ meeting_id (PK) │───┐    │ interview_id(PK)│  │
│  │ email           │   │    │ user_id (FK)    │◀──┼────│ meeting_id (FK) │  │
│  │ access_token    │   │    │ interview_id(FK)│───┼───▶│ user_id (FK)    │  │
│  │ refresh_token   │   │    │ calendar_evt_id │   │    │ source          │  │
│  │ expires_at      │   │    │ meet_space_id   │   │    │ status          │  │
│  └─────────────────┘   │    │ title           │   │    │ analysis_key    │  │
│                        │    │ start_time      │   │    │ total_score     │  │
│                        │    │ recording_status│   │    └─────────────────┘  │
│                        │    │ subscription_id │   │                         │
│                        │    └────────┬────────┘   │                         │
│                        │             │            │                         │
│                        │             │            │                         │
│                        │    ┌────────▼────────┐   │                         │
│                        │    │  Subscription   │   │                         │
│                        │    ├─────────────────┤   │                         │
│                        └───▶│ subscription_id │   │                         │
│                             │ user_id (FK)    │◀──┘                         │
│                             │ meet_space_id   │                             │
│                             │ meeting_id (FK) │                             │
│                             │ event_types     │                             │
│                             │ state           │                             │
│                             └─────────────────┘                             │
│                                                                              │
│  Legend:                                                                     │
│  ───▶  One-to-One                                                           │
│  ◀───  Foreign Key Reference                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. アクセスパターン

### 7.1 Meetings テーブル

| パターン | オペレーション | キー/インデックス |
|----------|--------------|------------------|
| 会議ID で取得 | GetItem | meeting_id (PK) |
| ユーザーの会議一覧 | Query | user_id-start_time-index |
| カレンダーイベントで検索 | Query | calendar_event_id-index |
| Meet Space で検索 | Query | meet_space_id-index |
| 期間で絞り込み | Query (Filter) | start_time (SK in GSI) |

### 7.2 Google Tokens テーブル

| パターン | オペレーション | キー/インデックス |
|----------|--------------|------------------|
| ユーザーのトークン取得 | GetItem | user_id (PK) |
| トークン更新 | UpdateItem | user_id (PK) |
| 期限切れトークン削除 | TTL | expires_at |

### 7.3 Event Subscriptions テーブル

| パターン | オペレーション | キー/インデックス |
|----------|--------------|------------------|
| 購読ID で取得 | GetItem | subscription_id (PK) |
| Space の購読検索 | Query | meet_space_id-index |
| ユーザーの購読一覧 | Query | user_id-index |
| 期限切れ購読削除 | TTL | expire_time |

---

## 8. CDK 定義例

```typescript
// DynamoDB Tables for Google Meet Integration

const meetingsTable = new dynamodb.Table(this, 'MeetingsTable', {
  tableName: `ek-transcript-meetings-${environment}`,
  partitionKey: { name: 'meeting_id', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecoveryEnabled: true,
  encryption: dynamodb.TableEncryption.AWS_MANAGED,
});

meetingsTable.addGlobalSecondaryIndex({
  indexName: 'user_id-start_time-index',
  partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'start_time', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});

meetingsTable.addGlobalSecondaryIndex({
  indexName: 'calendar_event_id-index',
  partitionKey: { name: 'calendar_event_id', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.KEYS_ONLY,
});

meetingsTable.addGlobalSecondaryIndex({
  indexName: 'meet_space_id-index',
  partitionKey: { name: 'meet_space_id', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.KEYS_ONLY,
});

const googleTokensTable = new dynamodb.Table(this, 'GoogleTokensTable', {
  tableName: `ek-transcript-google-tokens-${environment}`,
  partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PROVISIONED,
  readCapacity: 5,
  writeCapacity: 5,
  encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
  encryptionKey: kmsKey,
  timeToLiveAttribute: 'expires_at',
});

const subscriptionsTable = new dynamodb.Table(this, 'SubscriptionsTable', {
  tableName: `ek-transcript-event-subscriptions-${environment}`,
  partitionKey: { name: 'subscription_id', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expire_time',
});

subscriptionsTable.addGlobalSecondaryIndex({
  indexName: 'meet_space_id-index',
  partitionKey: { name: 'meet_space_id', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});

subscriptionsTable.addGlobalSecondaryIndex({
  indexName: 'user_id-index',
  partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});
```
