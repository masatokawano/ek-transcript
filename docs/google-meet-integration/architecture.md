# アーキテクチャ設計書

## 1. システムアーキテクチャ概要

### 1.1 全体構成図

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    ユーザー                                          │
│                              (Webブラウザ)                                           │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTPS
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              AWS CloudFront                                          │
│                           (CDN + WAF Protection)                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────────────┐
│         S3 (Static Hosting)       │   │              AWS AppSync                   │
│         Next.js Frontend          │   │           (GraphQL API)                    │
└───────────────────────────────────┘   └─────────────────┬─────────────────────────┘
                                                          │
                                        ┌─────────────────┼─────────────────┐
                                        ▼                 ▼                 ▼
                              ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
                              │  Lambda         │ │  Lambda         │ │  Lambda         │
                              │  Resolvers      │ │  Calendar Sync  │ │  Meet Config    │
                              └─────────────────┘ └─────────────────┘ └─────────────────┘
                                        │                 │                 │
                                        ▼                 ▼                 ▼
                              ┌─────────────────────────────────────────────────────────┐
                              │                      DynamoDB                            │
                              │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
                              │  │ Interviews  │  │  Meetings   │  │ GoogleTokens│      │
                              │  └─────────────┘  └─────────────┘  └─────────────┘      │
                              └─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            イベント駆動アーキテクチャ                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────┐                      ┌─────────────────────────────────────┐   │
│  │  Google Cloud   │                      │              AWS                     │   │
│  │                 │                      │                                      │   │
│  │  ┌───────────┐  │   Webhook/Push       │  ┌─────────────┐                    │   │
│  │  │  Pub/Sub  │──┼─────────────────────▶│  │ API Gateway │                    │   │
│  │  │  Topic    │  │                      │  │  (Webhook)  │                    │   │
│  │  └───────────┘  │                      │  └──────┬──────┘                    │   │
│  │        ▲        │                      │         │                           │   │
│  │        │        │                      │         ▼                           │   │
│  │  ┌───────────┐  │                      │  ┌─────────────┐                    │   │
│  │  │ Workspace │  │                      │  │   Lambda    │                    │   │
│  │  │ Events    │  │                      │  │   Event     │                    │   │
│  │  │ API       │  │                      │  │   Handler   │                    │   │
│  │  └───────────┘  │                      │  └──────┬──────┘                    │   │
│  │        ▲        │                      │         │                           │   │
│  │        │        │                      │         ▼                           │   │
│  │  ┌───────────┐  │                      │  ┌─────────────┐   ┌─────────────┐  │   │
│  │  │  Google   │  │                      │  │   Lambda    │──▶│     S3      │  │   │
│  │  │   Meet    │  │                      │  │  Download   │   │   (Input)   │  │   │
│  │  │  Events   │  │                      │  │  Recording  │   └──────┬──────┘  │   │
│  │  └───────────┘  │                      │  └─────────────┘          │         │   │
│  │                 │                      │                           │         │   │
│  └─────────────────┘                      │                           ▼         │   │
│                                           │  ┌─────────────────────────────────┐│   │
│                                           │  │       Step Functions            ││   │
│                                           │  │    (既存パイプライン)            ││   │
│                                           │  │                                  ││   │
│                                           │  │  Extract → Diarize → Transcribe ││   │
│                                           │  │       → Aggregate → LLM Analysis││   │
│                                           │  │                                  ││   │
│                                           │  └─────────────────────────────────┘│   │
│                                           └──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. コンポーネント詳細

### 2.1 フロントエンド層

#### Next.js Frontend (既存拡張)

| 項目 | 詳細 |
|------|------|
| 技術 | Next.js 15, React 19, TypeScript |
| ホスティング | AWS S3 + CloudFront |
| 認証 | AWS Cognito + Google OAuth |

**追加ページ:**
```
/app
├── calendar/              # カレンダー連携
│   ├── page.tsx          # カレンダービュー
│   └── [eventId]/
│       └── page.tsx      # 会議詳細
├── settings/
│   └── google/
│       └── page.tsx      # Google連携設定
└── (existing pages)
```

### 2.2 API層

#### AWS AppSync (既存拡張)

**追加 GraphQL スキーマ:**

```graphql
# 会議 (Google Meet)
type Meeting {
  meeting_id: ID!
  user_id: String!
  calendar_event_id: String!
  meet_space_id: String
  title: String!
  start_time: AWSDateTime!
  end_time: AWSDateTime!
  attendees: [String]
  auto_recording_enabled: Boolean!
  recording_status: RecordingStatus
  interview_id: String  # 分析結果との紐付け
  created_at: AWSDateTime!
  updated_at: AWSDateTime!
}

enum RecordingStatus {
  PENDING      # 会議前
  RECORDING    # 録画中
  PROCESSING   # ファイル生成中
  COMPLETED    # 完了
  FAILED       # 失敗
}

# Google 認証トークン
type GoogleToken {
  user_id: ID!
  access_token: String!  # 暗号化
  refresh_token: String! # 暗号化
  expires_at: AWSDateTime!
  scopes: [String]!
}

type Query {
  getMeeting(meeting_id: ID!): Meeting
  listMeetings(user_id: String!, start_date: AWSDateTime, end_date: AWSDateTime): MeetingConnection
  getGoogleAuthStatus(user_id: ID!): GoogleAuthStatus
}

type Mutation {
  createMeeting(input: CreateMeetingInput!): Meeting
  updateMeetingAutoRecording(meeting_id: ID!, enabled: Boolean!): Meeting
  syncCalendar(user_id: ID!): SyncResult
  linkGoogleAccount(user_id: ID!, code: String!): GoogleAuthStatus
  unlinkGoogleAccount(user_id: ID!): Boolean
}

type Subscription {
  onMeetingUpdated(user_id: String!): Meeting
  onRecordingCompleted(user_id: String!): Meeting
}
```

### 2.3 Lambda 関数

#### 2.3.1 Calendar Sync Lambda

| 項目 | 詳細 |
|------|------|
| ランタイム | Python 3.12 |
| メモリ | 512 MB |
| タイムアウト | 5分 |
| トリガー | AppSync, EventBridge (定期実行) |

**責務:**
1. Google Calendar API からイベント取得
2. DynamoDB Meetings テーブルと同期
3. 新規/更新/削除の検出

#### 2.3.2 Meet Config Lambda

| 項目 | 詳細 |
|------|------|
| ランタイム | Python 3.12 |
| メモリ | 256 MB |
| タイムアウト | 30秒 |
| トリガー | AppSync, Calendar Sync Lambda |

**責務:**
1. Google Meet Space 作成/取得
2. Auto-recording 設定の適用
3. Workspace Events 購読の管理

#### 2.3.3 Event Handler Lambda

| 項目 | 詳細 |
|------|------|
| ランタイム | Python 3.12 |
| メモリ | 256 MB |
| タイムアウト | 30秒 |
| トリガー | API Gateway (Webhook) |

**責務:**
1. Google Pub/Sub からの Push 通知受信
2. イベントタイプの判別
3. 適切な処理 Lambda の起動

#### 2.3.4 Download Recording Lambda

| 項目 | 詳細 |
|------|------|
| ランタイム | Python 3.12 |
| メモリ | 3008 MB |
| タイムアウト | 15分 |
| エフェメラルストレージ | 10 GB |
| トリガー | Event Handler Lambda |

**責務:**
1. Google Drive から録画ファイルダウンロード
2. S3 へのアップロード（マルチパート）
3. DynamoDB メタデータ更新
4. Step Functions パイプライン起動

---

## 3. データフロー

### 3.1 会議作成フロー

```
┌────────┐     ┌─────────┐     ┌──────────┐     ┌─────────────┐     ┌─────────────┐
│ユーザー│────▶│Frontend │────▶│ AppSync  │────▶│   Lambda    │────▶│   Google    │
│        │     │         │     │          │     │ Meet Config │     │ Calendar/   │
│        │     │         │     │          │     │             │     │ Meet API    │
└────────┘     └─────────┘     └──────────┘     └─────────────┘     └─────────────┘
                                                       │
                                                       ▼
                                               ┌─────────────┐
                                               │  DynamoDB   │
                                               │  Meetings   │
                                               └─────────────┘
```

**シーケンス:**
1. ユーザーが会議作成フォームを送信
2. AppSync が createMeeting mutation を処理
3. Lambda が Google Calendar にイベント作成
4. Lambda が Meet Space を作成し auto-recording を設定
5. DynamoDB に会議情報を保存
6. 結果をフロントエンドに返却

### 3.2 録画処理フロー

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Google Meet │────▶│  Workspace  │────▶│  Pub/Sub    │────▶│ API Gateway │
│ (録画完了)  │     │  Events     │     │             │     │  (Webhook)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                   │
                                                                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│Step Functions│◀───│     S3      │◀───│   Lambda    │◀───│   Lambda    │
│  Pipeline   │     │   (Input)   │     │  Download   │     │Event Handler│
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       ▼                                       ▼
┌─────────────┐                         ┌─────────────┐
│  DynamoDB   │                         │Google Drive │
│ Interviews  │                         │    API      │
└─────────────┘                         └─────────────┘
```

**シーケンス:**
1. 会議終了後、録画ファイル生成完了
2. Workspace Events が fileGenerated イベントを発火
3. Pub/Sub 経由で AWS API Gateway にプッシュ
4. Event Handler が録画情報を解析
5. Download Lambda が Drive から録画を取得
6. S3 にアップロード、DynamoDB 更新
7. Step Functions パイプラインを起動
8. 分析完了後、結果を DynamoDB に保存

---

## 4. 認証・認可

### 4.1 認証フロー

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                            OAuth 2.0 Authorization Code Flow                   │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌────────┐  1. Login   ┌─────────┐  2. Redirect   ┌─────────────────────┐    │
│  │ユーザー│────────────▶│Frontend │──────────────▶│ Google OAuth Server │    │
│  │        │             │         │               │                      │    │
│  └────────┘             └─────────┘               └──────────┬──────────┘    │
│       ▲                      ▲                                │               │
│       │                      │                                │ 3. Auth Code  │
│       │                      │ 4. Callback                    │               │
│       │                      └────────────────────────────────┘               │
│       │                                                                        │
│       │                 ┌─────────┐  5. Exchange   ┌─────────────────────┐    │
│       │                 │ Lambda  │───────────────▶│ Google OAuth Server │    │
│       │                 │         │◀───────────────│                      │    │
│       │                 └────┬────┘  6. Tokens     └─────────────────────┘    │
│       │                      │                                                 │
│       │                      │ 7. Store (encrypted)                           │
│       │                      ▼                                                 │
│       │                 ┌─────────┐                                           │
│       │                 │Secrets  │                                           │
│       │ 8. Success      │Manager  │                                           │
│       └─────────────────│         │                                           │
│                         └─────────┘                                           │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 OAuth スコープ

| スコープ | 用途 | 権限レベル |
|----------|------|-----------|
| `calendar.events` | カレンダーイベント管理 | 読み書き |
| `meetings.space.settings` | Meet Space 設定 | 設定変更 |
| `drive.readonly` | 録画ファイル取得 | 読み取り |

### 4.3 サービスアカウント vs ユーザー認証

| シナリオ | 認証方式 | 理由 |
|----------|----------|------|
| カレンダー同期 | ユーザー OAuth | ユーザー固有のカレンダーへのアクセス |
| Meet Space 設定 | ユーザー OAuth | ユーザーの会議への設定適用 |
| イベント購読 | サービスアカウント | バックグラウンド処理 |
| 録画ダウンロード | ユーザー OAuth | ユーザーの Drive へのアクセス |

---

## 5. エラーハンドリング

### 5.1 リトライ戦略

| コンポーネント | リトライ回数 | バックオフ | 対象エラー |
|---------------|-------------|-----------|-----------|
| Google API 呼び出し | 3回 | 指数関数 (1, 2, 4秒) | 429, 500, 503 |
| S3 アップロード | 3回 | 固定 (5秒) | ネットワークエラー |
| Lambda 起動 | 2回 | なし | タイムアウト |

### 5.2 Dead Letter Queue

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Lambda    │────▶│    SQS      │────▶│   Lambda    │
│  (失敗時)   │     │    DLQ      │     │  (再処理)   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ CloudWatch  │
                    │   Alarm     │
                    └─────────────┘
```

### 5.3 監視・アラート

| メトリクス | 閾値 | アクション |
|-----------|------|-----------|
| Lambda エラー率 | > 5% | Slack 通知 |
| API レイテンシ | > 10秒 | ログ調査 |
| DLQ メッセージ数 | > 0 | 即座に通知 |
| トークン期限切れ | 残り1日 | ユーザー通知 |

---

## 6. スケーラビリティ

### 6.1 Lambda 同時実行数

| Lambda | 予約同時実行数 | 理由 |
|--------|--------------|------|
| Calendar Sync | 10 | ユーザー数に比例 |
| Meet Config | 20 | 会議作成頻度 |
| Event Handler | 100 | イベント急増対応 |
| Download Recording | 10 | リソース集中型 |

### 6.2 DynamoDB キャパシティ

| テーブル | モード | 理由 |
|----------|--------|------|
| Meetings | オンデマンド | 予測困難なアクセスパターン |
| GoogleTokens | プロビジョニング (5 RCU/WCU) | 低頻度アクセス |

---

## 7. デプロイメント

### 7.1 CDK スタック構成

```
ek-transcript-google-meet/
├── GoogleAuthStack           # OAuth 関連リソース
│   ├── Cognito User Pool (既存拡張)
│   ├── Secrets Manager
│   └── Lambda (Auth)
│
├── GoogleMeetLambdaStack     # Lambda 関数
│   ├── CalendarSyncFn
│   ├── MeetConfigFn
│   ├── EventHandlerFn
│   └── DownloadRecordingFn
│
├── GoogleMeetApiStack        # API 層
│   ├── API Gateway (Webhook)
│   └── AppSync (既存拡張)
│
└── GoogleMeetEventStack      # イベント処理
    ├── SQS (DLQ)
    └── EventBridge Rules
```

### 7.2 環境分離

| 環境 | 用途 | Google Project |
|------|------|----------------|
| dev | 開発・テスト | ek-transcript-dev |
| staging | ステージング | ek-transcript-staging |
| prod | 本番 | ek-transcript-prod |
