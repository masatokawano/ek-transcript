"""
LLMAnalysis Lambda Function

OpenAI API (gpt-5-mini) を使用して文字起こし結果を分析する。
"""

import json
import logging
import os
from typing import Any

import boto3
import openai
from tenacity import retry, stop_after_attempt, wait_exponential

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS クライアント
s3 = boto3.client("s3")
secrets_client = boto3.client("secretsmanager")

# 環境変数
OUTPUT_BUCKET = os.environ.get("OUTPUT_BUCKET", "")
OPENAI_SECRET_ARN = os.environ.get("OPENAI_SECRET_ARN", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5-mini")

# グローバル変数（コールドスタート対策）
_openai_client = None

# デフォルトプロンプト
DEFAULT_PROMPT = """以下の会議の文字起こしを分析し、次の形式で要約してください：

1. 会議の概要（3文以内）
2. 主な議題（箇条書き）
3. 決定事項（箇条書き）
4. アクションアイテム（担当者・期限があれば含む）
5. 次回までの課題"""


def get_openai_client() -> openai.OpenAI:
    """OpenAI クライアントを取得（シングルトン）"""
    global _openai_client

    if _openai_client is None:
        if not OPENAI_SECRET_ARN:
            raise ValueError("OPENAI_SECRET_ARN environment variable not set")

        logger.info("Getting OpenAI API key from Secrets Manager...")
        secret = secrets_client.get_secret_value(SecretId=OPENAI_SECRET_ARN)
        secret_data = json.loads(secret["SecretString"])
        api_key = secret_data.get("api_key", secret_data.get("OPENAI_API_KEY", ""))

        _openai_client = openai.OpenAI(api_key=api_key)
        logger.info("OpenAI client initialized")

    return _openai_client


@retry(
    wait=wait_exponential(multiplier=1, min=4, max=60),
    stop=stop_after_attempt(3),
)
def analyze_transcript(transcript: list[dict], prompt: str) -> str:
    """
    文字起こしを分析

    Args:
        transcript: 文字起こし結果のリスト
        prompt: 分析プロンプト

    Returns:
        分析結果
    """
    # 話者ごとの発言を整形
    full_text = "\n".join([f"[{t['speaker']}] {t['text']}" for t in transcript])

    logger.info(f"Analyzing transcript with {len(transcript)} segments...")

    client = get_openai_client()
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": "あなたは会議分析の専門家です。正確で簡潔な分析を提供してください。",
            },
            {"role": "user", "content": f"{prompt}\n\n文字起こし:\n{full_text}"},
        ],
        max_tokens=4096,
        temperature=0.3,
    )

    return response.choices[0].message.content or ""


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    Args:
        event: Lambda イベント
            - bucket: S3 バケット名
            - transcript_key: 文字起こしファイルのキー
            - prompt: 分析プロンプト（オプション）
        context: Lambda コンテキスト

    Returns:
        処理結果
            - bucket: 出力バケット名
            - analysis_key: 分析結果ファイルのキー
    """
    logger.info(f"Event: {event}")

    bucket = event["bucket"]
    transcript_key = event["transcript_key"]
    prompt = event.get("prompt", DEFAULT_PROMPT)

    # S3 から文字起こしを取得
    logger.info(f"Getting transcript from s3://{bucket}/{transcript_key}")
    response = s3.get_object(Bucket=bucket, Key=transcript_key)
    transcript = json.loads(response["Body"].read().decode("utf-8"))

    # LLM 分析を実行
    result = analyze_transcript(transcript, prompt)

    # 出力キーを生成
    base_key = transcript_key.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    analysis_key = f"analysis/{base_key.replace('_transcript', '')}_analysis.txt"

    # 出力バケットを決定
    output_bucket = OUTPUT_BUCKET if OUTPUT_BUCKET else bucket

    # 結果をアップロード
    logger.info(f"Uploading analysis to s3://{output_bucket}/{analysis_key}")
    s3.put_object(
        Bucket=output_bucket,
        Key=analysis_key,
        Body=result.encode("utf-8"),
        ContentType="text/plain; charset=utf-8",
    )

    return {
        "bucket": output_bucket,
        "analysis_key": analysis_key,
        "status": "completed",
    }
