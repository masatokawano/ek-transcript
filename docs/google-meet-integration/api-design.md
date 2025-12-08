# API設計書

## 1. Google API

### 1.1 Google Calendar API

#### イベント一覧取得

```http
GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
```

**パラメータ:**
| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| calendarId | string | Yes | カレンダーID（通常は "primary"） |
| timeMin | datetime | No | 開始日時（RFC3339形式） |
| timeMax | datetime | No | 終了日時（RFC3339形式） |
| singleEvents | boolean | No | 繰り返しイベントを展開 |
| orderBy | string | No | ソート順（startTime） |

**レスポンス例:**
```json
{
  "kind": "calendar#events",
  "items": [
    {
      "id": "abc123",
      "summary": "HEMS インタビュー #6",
      "start": {
        "dateTime": "2025-12-10T14:00:00+09:00"
      },
      "end": {
        "dateTime": "2025-12-10T15:00:00+09:00"
      },
      "attendees": [
        {"email": "user@example.com", "responseStatus": "accepted"}
      ],
      "conferenceData": {
        "conferenceId": "abc-defg-hij",
        "conferenceSolution": {
          "key": {"type": "hangoutsMeet"}
        },
        "entryPoints": [
          {
            "entryPointType": "video",
            "uri": "https://meet.google.com/abc-defg-hij"
          }
        ]
      }
    }
  ]
}
```

#### イベント作成（Meet リンク付き）

```http
POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events?conferenceDataVersion=1
```

**リクエストボディ:**
```json
{
  "summary": "HEMS インタビュー #7",
  "start": {
    "dateTime": "2025-12-15T14:00:00+09:00",
    "timeZone": "Asia/Tokyo"
  },
  "end": {
    "dateTime": "2025-12-15T15:00:00+09:00",
    "timeZone": "Asia/Tokyo"
  },
  "attendees": [
    {"email": "participant@example.com"}
  ],
  "conferenceData": {
    "createRequest": {
      "requestId": "unique-request-id-12345",
      "conferenceSolutionKey": {
        "type": "hangoutsMeet"
      }
    }
  }
}
```

**重要:** `conferenceDataVersion=1` をクエリパラメータとして指定する必要があります。

---

### 1.2 Google Meet REST API

#### Space 作成

```http
POST https://meet.googleapis.com/v2/spaces
```

**リクエストボディ:**
```json
{
  "config": {
    "accessType": "TRUSTED",
    "entryPointAccess": "ALL",
    "moderation": "OFF",
    "artifactConfig": {
      "recordingConfig": {
        "autoRecordingGeneration": "ON"
      },
      "transcriptionConfig": {
        "autoTranscriptionGeneration": "ON"
      },
      "smartNotesConfig": {
        "autoSmartNotesGeneration": "ON"
      }
    }
  }
}
```

**レスポンス:**
```json
{
  "name": "spaces/abc123xyz",
  "meetingUri": "https://meet.google.com/abc-defg-hij",
  "meetingCode": "abc-defg-hij",
  "config": {
    "accessType": "TRUSTED",
    "artifactConfig": {
      "recordingConfig": {
        "autoRecordingGeneration": "ON"
      }
    }
  }
}
```

#### Space 設定更新

```http
PATCH https://meet.googleapis.com/v2/spaces/{space}
```

**リクエストボディ:**
```json
{
  "config": {
    "artifactConfig": {
      "recordingConfig": {
        "autoRecordingGeneration": "ON"
      }
    }
  }
}
```

**更新マスク:**
```
updateMask=config.artifactConfig.recordingConfig.autoRecordingGeneration
```

#### 録画一覧取得

```http
GET https://meet.googleapis.com/v2/conferenceRecords/{conferenceRecord}/recordings
```

**レスポンス:**
```json
{
  "recordings": [
    {
      "name": "conferenceRecords/abc123/recordings/rec456",
      "state": "FILE_GENERATED",
      "startTime": "2025-12-10T14:00:00Z",
      "endTime": "2025-12-10T14:55:00Z",
      "driveDestination": {
        "file": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
        "exportUri": "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view"
      }
    }
  ]
}
```

---

### 1.3 Google Workspace Events API

#### 購読作成

```http
POST https://workspaceevents.googleapis.com/v1/subscriptions
```

**リクエストボディ:**
```json
{
  "targetResource": "//meet.googleapis.com/spaces/abc123xyz",
  "eventTypes": [
    "google.workspace.meet.conference.v2.started",
    "google.workspace.meet.conference.v2.ended",
    "google.workspace.meet.recording.v2.fileGenerated",
    "google.workspace.meet.participant.v2.joined",
    "google.workspace.meet.participant.v2.left"
  ],
  "notificationEndpoint": {
    "pubsubTopic": "projects/ek-transcript-dev/topics/meet-events"
  },
  "payloadOptions": {
    "includeResource": true
  },
  "ttl": "604800s"
}
```

**レスポンス:**
```json
{
  "name": "subscriptions/sub123",
  "uid": "abc-def-ghi",
  "targetResource": "//meet.googleapis.com/spaces/abc123xyz",
  "eventTypes": ["google.workspace.meet.recording.v2.fileGenerated"],
  "state": "ACTIVE",
  "expireTime": "2025-12-15T00:00:00Z"
}
```

#### イベントペイロード例（録画完了）

```json
{
  "subscription": "subscriptions/sub123",
  "eventType": "google.workspace.meet.recording.v2.fileGenerated",
  "eventTime": "2025-12-10T15:05:00Z",
  "data": {
    "recording": {
      "name": "conferenceRecords/conf123/recordings/rec456"
    }
  }
}
```

---

### 1.4 Google Drive API

#### ファイルダウンロード

```http
GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media
```

**パラメータ:**
| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| fileId | string | Yes | ファイルID |
| alt | string | Yes | "media" でバイナリ取得 |

**レスポンス:** ファイルバイナリ（MP4）

#### ファイルメタデータ取得

```http
GET https://www.googleapis.com/drive/v3/files/{fileId}?fields=id,name,size,mimeType
```

**レスポンス:**
```json
{
  "id": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
  "name": "HEMS インタビュー #6 - 2025-12-10.mp4",
  "size": "524288000",
  "mimeType": "video/mp4"
}
```

---

## 2. AWS AppSync GraphQL API

### 2.1 スキーマ定義

```graphql
# ============================================
# Types
# ============================================

type Meeting {
  meeting_id: ID!
  user_id: String!
  calendar_event_id: String!
  meet_space_id: String
  meet_uri: String
  title: String!
  description: String
  start_time: AWSDateTime!
  end_time: AWSDateTime!
  attendees: [Attendee]
  auto_recording_enabled: Boolean!
  auto_transcription_enabled: Boolean!
  recording_status: RecordingStatus!
  recording_file_id: String
  interview_id: String
  created_at: AWSDateTime!
  updated_at: AWSDateTime!
}

type Attendee {
  email: String!
  name: String
  response_status: ResponseStatus
}

enum RecordingStatus {
  PENDING
  SCHEDULED
  RECORDING
  PROCESSING
  COMPLETED
  FAILED
  DISABLED
}

enum ResponseStatus {
  NEEDS_ACTION
  DECLINED
  TENTATIVE
  ACCEPTED
}

type MeetingConnection {
  items: [Meeting]!
  nextToken: String
}

type GoogleAuthStatus {
  user_id: ID!
  connected: Boolean!
  email: String
  scopes: [String]
  expires_at: AWSDateTime
}

type SyncResult {
  success: Boolean!
  synced_count: Int!
  created_count: Int!
  updated_count: Int!
  deleted_count: Int!
  errors: [String]
}

# ============================================
# Inputs
# ============================================

input CreateMeetingInput {
  title: String!
  description: String
  start_time: AWSDateTime!
  end_time: AWSDateTime!
  attendees: [AttendeeInput]
  auto_recording_enabled: Boolean
  auto_transcription_enabled: Boolean
}

input AttendeeInput {
  email: String!
  name: String
}

input UpdateMeetingInput {
  meeting_id: ID!
  title: String
  description: String
  start_time: AWSDateTime
  end_time: AWSDateTime
  attendees: [AttendeeInput]
  auto_recording_enabled: Boolean
  auto_transcription_enabled: Boolean
}

input MeetingFilterInput {
  start_date: AWSDateTime
  end_date: AWSDateTime
  recording_status: RecordingStatus
  has_interview: Boolean
}

# ============================================
# Queries
# ============================================

type Query {
  # Meeting queries
  getMeeting(meeting_id: ID!): Meeting
  listMeetings(
    user_id: String!
    filter: MeetingFilterInput
    limit: Int
    nextToken: String
  ): MeetingConnection

  # Google auth queries
  getGoogleAuthStatus: GoogleAuthStatus
  getGoogleAuthUrl(redirect_uri: String!): String!
}

# ============================================
# Mutations
# ============================================

type Mutation {
  # Meeting mutations
  createMeeting(input: CreateMeetingInput!): Meeting
  updateMeeting(input: UpdateMeetingInput!): Meeting
  deleteMeeting(meeting_id: ID!): Boolean

  # Bulk operations
  enableAutoRecordingBulk(meeting_ids: [ID!]!): [Meeting]
  disableAutoRecordingBulk(meeting_ids: [ID!]!): [Meeting]

  # Calendar sync
  syncCalendar: SyncResult

  # Google auth mutations
  linkGoogleAccount(code: String!, redirect_uri: String!): GoogleAuthStatus
  unlinkGoogleAccount: Boolean
  refreshGoogleToken: GoogleAuthStatus
}

# ============================================
# Subscriptions
# ============================================

type Subscription {
  onMeetingCreated(user_id: String!): Meeting
    @aws_subscribe(mutations: ["createMeeting"])

  onMeetingUpdated(user_id: String!): Meeting
    @aws_subscribe(mutations: ["updateMeeting"])

  onRecordingStatusChanged(user_id: String!): Meeting
    @aws_subscribe(mutations: ["updateMeeting"])
}
```

### 2.2 リゾルバー設計

#### getMeeting

**VTL Request Mapping:**
```velocity
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "meeting_id": $util.dynamodb.toDynamoDBJson($ctx.args.meeting_id)
  }
}
```

#### listMeetings

**VTL Request Mapping:**
```velocity
#set($filter = {})
#if($ctx.args.filter)
  #if($ctx.args.filter.start_date)
    $util.qr($filter.put("start_time", {"ge": $ctx.args.filter.start_date}))
  #end
  #if($ctx.args.filter.end_date)
    $util.qr($filter.put("end_time", {"le": $ctx.args.filter.end_date}))
  #end
#end

{
  "version": "2018-05-29",
  "operation": "Query",
  "index": "user_id-start_time-index",
  "query": {
    "expression": "user_id = :user_id",
    "expressionValues": {
      ":user_id": $util.dynamodb.toDynamoDBJson($ctx.args.user_id)
    }
  },
  "scanIndexForward": false,
  "limit": $util.defaultIfNull($ctx.args.limit, 20),
  "nextToken": $util.toJson($ctx.args.nextToken)
}
```

#### createMeeting (Lambda リゾルバー)

**Lambda Handler:**
```python
async def create_meeting(event: dict) -> dict:
    """
    1. Google Calendar にイベント作成
    2. Meet Space 設定
    3. DynamoDB 保存
    4. Workspace Events 購読
    """
    input_data = event["arguments"]["input"]
    user_id = event["identity"]["sub"]

    # Google Calendar イベント作成
    calendar_event = await create_calendar_event(
        user_id=user_id,
        title=input_data["title"],
        start_time=input_data["start_time"],
        end_time=input_data["end_time"],
        attendees=input_data.get("attendees", [])
    )

    # Meet Space 取得・設定
    meet_space = await configure_meet_space(
        space_id=calendar_event["conferenceData"]["conferenceId"],
        auto_recording=input_data.get("auto_recording_enabled", True),
        auto_transcription=input_data.get("auto_transcription_enabled", True)
    )

    # DynamoDB 保存
    meeting = await save_meeting(
        meeting_id=str(uuid.uuid4()),
        user_id=user_id,
        calendar_event_id=calendar_event["id"],
        meet_space_id=meet_space["name"],
        meet_uri=meet_space["meetingUri"],
        **input_data
    )

    # Workspace Events 購読
    await create_event_subscription(
        space_id=meet_space["name"],
        user_id=user_id
    )

    return meeting
```

---

## 3. AWS Lambda Webhook API

### 3.1 Pub/Sub Push エンドポイント

```http
POST https://{api-id}.execute-api.{region}.amazonaws.com/prod/webhook/meet-events
```

**リクエストヘッダー:**
```
Content-Type: application/json
Authorization: Bearer {google-push-token}
```

**リクエストボディ:**
```json
{
  "message": {
    "data": "eyJzdWJzY3JpcHRpb24iOiAic3Vic...",  // Base64 encoded
    "messageId": "123456789",
    "publishTime": "2025-12-10T15:05:00.000Z"
  },
  "subscription": "projects/ek-transcript-dev/subscriptions/meet-events-sub"
}
```

**デコード後のデータ:**
```json
{
  "subscription": "subscriptions/sub123",
  "eventType": "google.workspace.meet.recording.v2.fileGenerated",
  "eventTime": "2025-12-10T15:05:00Z",
  "data": {
    "recording": {
      "name": "conferenceRecords/conf123/recordings/rec456"
    }
  }
}
```

**レスポンス:**
```json
{
  "status": "accepted",
  "message_id": "123456789"
}
```

**ステータスコード:**
| コード | 意味 |
|--------|------|
| 200/204 | 成功（Pub/Sub はメッセージを削除） |
| 4xx | 永続的エラー（リトライなし） |
| 5xx | 一時的エラー（リトライあり） |

---

## 4. エラーレスポンス

### 4.1 GraphQL エラー形式

```json
{
  "data": null,
  "errors": [
    {
      "message": "Google Calendar API error: Rate limit exceeded",
      "locations": [{"line": 2, "column": 3}],
      "path": ["createMeeting"],
      "extensions": {
        "code": "GOOGLE_API_ERROR",
        "subCode": "RATE_LIMIT_EXCEEDED",
        "retryable": true,
        "retryAfter": 60
      }
    }
  ]
}
```

### 4.2 エラーコード一覧

| コード | 説明 | 対処法 |
|--------|------|--------|
| UNAUTHORIZED | 認証エラー | 再ログイン |
| GOOGLE_AUTH_EXPIRED | Google トークン期限切れ | トークン更新 |
| GOOGLE_API_ERROR | Google API エラー | リトライ |
| MEETING_NOT_FOUND | 会議が見つからない | 入力確認 |
| SPACE_CONFIG_FAILED | Meet Space 設定失敗 | 権限確認 |
| RECORDING_DOWNLOAD_FAILED | 録画ダウンロード失敗 | リトライ |
| INTERNAL_ERROR | 内部エラー | サポート連絡 |
