# Google Meet 自動録画・自動分析 統合設計書

## 概要

本ドキュメントは、Google Meet と ek-transcript システムを統合し、会議の自動録画と自動分析を実現するための設計書です。

### プロジェクト目標

1. Google Calendar で設定した会議を自動的に録画
2. 録画完了後、自動的に既存の分析パイプライン（文字起こし → LLM分析）を実行
3. 分析結果をダッシュボードで確認可能にする

### 調査日

2025年12月8日

### 技術的実現性

2025年4月に Google Meet REST API に追加された **Auto-Recording 機能**（`ArtifactConfig.autoRecordingGeneration`）により、会議スペースに対して事前に自動録画を設定することが可能になりました。

---

## ドキュメント構成

| ファイル | 内容 |
|----------|------|
| [requirements.md](./requirements.md) | 要件定義書（機能要件・非機能要件） |
| [architecture.md](./architecture.md) | アーキテクチャ設計書 |
| [api-design.md](./api-design.md) | API設計書（Google API・AWS API） |
| [data-model.md](./data-model.md) | データモデル定義 |
| [security.md](./security.md) | セキュリティ要件 |
| [implementation-plan.md](./implementation-plan.md) | 実装計画・フェーズ |

---

## システム概要図

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              ユーザー                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          フロントエンド                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Google     │  │   会議      │  │  録画      │  │  分析結果   │    │
│  │  OAuth     │  │  一覧/作成  │  │  状況      │  │  ダッシュ   │    │
│  │  ログイン   │  │             │  │             │  │  ボード    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐
│     Google Cloud      │  │         AWS           │  │   既存システム   │
│  ┌─────────────────┐  │  │  ┌─────────────────┐  │  │                 │
│  │  Calendar API   │  │  │  │    AppSync      │  │  │  ek-transcript  │
│  │  Meet API       │  │  │  │    GraphQL      │  │  │  パイプライン    │
│  │  Drive API      │  │  │  └─────────────────┘  │  │                 │
│  │  Workspace      │  │  │  ┌─────────────────┐  │  │  - 文字起こし   │
│  │  Events API     │  │  │  │    Lambda       │  │  │  - 話者分離     │
│  │  Pub/Sub        │  │  │  │    Functions    │  │  │  - LLM分析      │
│  └─────────────────┘  │  │  └─────────────────┘  │  │                 │
└───────────────────────┘  │  ┌─────────────────┐  │  └─────────────────┘
                           │  │  Step Functions │  │
                           │  │  (既存)         │  │
                           │  └─────────────────┘  │
                           │  ┌─────────────────┐  │
                           │  │    DynamoDB     │  │
                           │  │    S3           │  │
                           │  └─────────────────┘  │
                           └───────────────────────┘
```

---

## 主要コンポーネント

### Google Cloud 側

| コンポーネント | 役割 |
|---------------|------|
| Google Calendar API | 会議スケジュールの取得・作成 |
| Google Meet REST API | 会議スペース作成、Auto-Recording設定 |
| Google Drive API | 録画ファイルのダウンロード |
| Google Workspace Events API | 録画完了イベントの通知 |
| Cloud Pub/Sub | イベント配信 |

### AWS 側

| コンポーネント | 役割 |
|---------------|------|
| Lambda (Calendar Sync) | カレンダー同期、Meet Space設定 |
| Lambda (Recording Download) | 録画ファイルダウンロード、S3アップロード |
| EventBridge | Pub/Subからのイベント受信 |
| Step Functions (既存) | 文字起こし・分析パイプライン |
| DynamoDB | 会議・録画メタデータ管理 |
| S3 | 録画ファイル保存 |

---

## 関連リンク

- [Google Meet REST API](https://developers.google.com/workspace/meet/api/guides/overview)
- [Google Workspace Events API](https://developers.google.com/workspace/events)
- [Google Calendar API](https://developers.google.com/calendar/api)
- [Google Drive API](https://developers.google.com/drive/api)
