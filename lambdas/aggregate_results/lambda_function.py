"""
AggregateResults Lambda Function

文字起こし結果を統合して1つのJSONファイルにまとめる。

Version: 2.0 - Python 3.12 compatible
"""

import json
import logging
import os
from typing import Any

import boto3

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# S3 クライアント
s3 = boto3.client("s3")

# 環境変数
OUTPUT_BUCKET = os.environ.get("OUTPUT_BUCKET", "")


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    Args:
        event: Lambda イベント
            - bucket: S3 バケット名
            - transcription_results: 文字起こし結果のリスト
            - audio_key: 元の音声ファイルのキー
        context: Lambda コンテキスト

    Returns:
        処理結果
            - bucket: 出力バケット名
            - transcript_key: 統合された文字起こしファイルのキー
    """
    logger.info(f"Event: {event}")

    bucket = event["bucket"]
    transcription_results = event["transcription_results"]
    audio_key = event.get("audio_key", "unknown")

    # 時系列でソート
    sorted_results = sorted(transcription_results, key=lambda x: x["start"])

    logger.info(f"Aggregating {len(sorted_results)} transcription results")

    # 出力キーを生成
    base_key = audio_key.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    transcript_key = f"transcripts/{base_key}_transcript.json"

    # 出力バケットを決定
    output_bucket = OUTPUT_BUCKET if OUTPUT_BUCKET else bucket

    # JSON としてアップロード
    logger.info(f"Uploading to s3://{output_bucket}/{transcript_key}")
    s3.put_object(
        Bucket=output_bucket,
        Key=transcript_key,
        Body=json.dumps(sorted_results, ensure_ascii=False, indent=2),
        ContentType="application/json",
    )

    return {
        "bucket": output_bucket,
        "transcript_key": transcript_key,
        "segment_count": len(sorted_results),
    }
