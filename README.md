# ek-transcript

AWS サーバーレスアーキテクチャによる話者分離付き文字起こしパイプライン

## 概要

長時間の録画動画（最大8時間）から話者分離付き文字起こしを行い、LLM で分析するパイプラインです。

### 主要技術

| コンポーネント | 技術 |
|---------------|------|
| オーケストレーション | AWS Step Functions |
| 音声抽出 | ffmpeg |
| 話者分離 | pyannote.audio |
| 文字起こし | faster-whisper |
| LLM分析 | OpenAI API (gpt-5-mini) |
| インフラ | AWS CDK (TypeScript) |

## セットアップ

### 前提条件

- Python 3.11+
- Node.js 20+
- Docker
- AWS CLI (設定済み)
- AWS CDK

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/ekusiadadus/ek-transcript.git
cd ek-transcript

# Python仮想環境をセットアップ
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 開発用依存関係をインストール
pip install -e ".[dev]"

# pre-commit フックをインストール
pre-commit install

# CDK 依存関係をインストール
cd cdk && npm ci && cd ..
```

## 開発

### テスト実行

```bash
# 全テスト実行
./scripts/test_local.sh all

# 単体テストのみ
./scripts/test_local.sh unit

# 特定のLambdaのテスト
./scripts/test_local.sh lambda extract_audio

# リント
./scripts/test_local.sh lint

# フォーマット
./scripts/test_local.sh format
```

### デプロイ

```bash
# 前提条件の確認
./scripts/deploy.sh check

# 開発環境へデプロイ
./scripts/deploy.sh deploy dev

# 本番環境へデプロイ
./scripts/deploy.sh deploy prod
```

## アーキテクチャ

```
[S3 Upload]
    ↓ (S3 Event)
[Step Functions State Machine]
    ├── ExtractAudio (Lambda) - ffmpeg
    ├── Diarize (Lambda/Fargate) - pyannote.audio
    ├── SplitBySpeaker (Lambda) - pydub
    ├── Transcribe (Lambda - Map State) - faster-whisper
    ├── AggregateResults (Lambda)
    └── LLMAnalysis (Lambda) - OpenAI API
    ↓
[S3 Output] → [EventBridge Notification]
```

## ドキュメント

- [アーキテクチャ設計](./ARCHITECTURE.md)
- [実装計画](./docs/IMPLEMENTATION_PLAN.md)
- [ADR (Architecture Decision Records)](./docs/adr/)

## ライセンス

MIT
