"""
SplitBySpeaker Lambda Function

話者分離結果に基づいて音声ファイルをセグメントに分割する。
"""

import json
import logging
import os
from typing import Any

import boto3
from pydub import AudioSegment

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
            - audio_key: 音声ファイルのキー
            - segments_key: セグメント情報のキー
        context: Lambda コンテキスト

    Returns:
        処理結果
            - bucket: 出力バケット名
            - segment_files: セグメントファイルのリスト
    """
    logger.info(f"Event: {event}")

    bucket = event["bucket"]
    audio_key = event["audio_key"]
    segments_key = event["segments_key"]

    local_audio = "/tmp/audio.wav"
    local_segment_prefix = "/tmp/seg_"

    try:
        # S3 から音声をダウンロード
        logger.info(f"Downloading s3://{bucket}/{audio_key}")
        s3.download_file(bucket, audio_key, local_audio)

        # セグメント情報を取得
        logger.info(f"Getting segments from s3://{bucket}/{segments_key}")
        response = s3.get_object(Bucket=bucket, Key=segments_key)
        segments = json.loads(response["Body"].read().decode("utf-8"))

        logger.info(f"Processing {len(segments)} segments")

        # 音声を読み込み
        audio = AudioSegment.from_wav(local_audio)

        # 出力バケットを決定
        output_bucket = OUTPUT_BUCKET if OUTPUT_BUCKET else bucket

        # ベースキーを取得
        base_key = audio_key.rsplit("/", 1)[-1].rsplit(".", 1)[0]

        segment_files = []
        for i, seg in enumerate(segments):
            start_ms = int(seg["start"] * 1000)
            end_ms = int(seg["end"] * 1000)
            speaker = seg["speaker"]

            # セグメントを切り出し
            clip = audio[start_ms:end_ms]

            # ローカルに保存
            local_path = f"{local_segment_prefix}{i:04d}.wav"
            clip.export(local_path, format="wav")

            # S3 にアップロード
            segment_key = f"segments/{base_key}_{i:04d}_{speaker}.wav"
            s3.upload_file(local_path, output_bucket, segment_key)

            segment_files.append(
                {
                    "key": segment_key,
                    "speaker": speaker,
                    "start": seg["start"],
                    "end": seg["end"],
                }
            )

            # ローカルファイルを削除
            if os.path.exists(local_path):
                os.remove(local_path)

        logger.info(f"Created {len(segment_files)} segment files")

        return {
            "bucket": output_bucket,
            "segment_files": segment_files,
        }

    finally:
        # 一時ファイルをクリーンアップ
        if os.path.exists(local_audio):
            os.remove(local_audio)
