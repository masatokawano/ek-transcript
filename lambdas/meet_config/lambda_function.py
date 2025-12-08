"""
Google Meet Space 設定 Lambda

Meet Space の作成と auto-recording 設定を担当。

Version: 1.0
"""

import json
import logging
import os
import sys

import boto3
from googleapiclient.discovery import build

# 共有モジュールのパスを追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from google_token_manager import get_valid_credentials  # noqa: E402

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS クライアント
dynamodb = boto3.resource("dynamodb")

# 環境変数
MEETINGS_TABLE = os.environ.get("MEETINGS_TABLE", "")


def create_meet_space(
    user_id: str, auto_recording: bool = True, auto_transcription: bool = True
) -> dict:
    """
    Google Meet Space を作成し、auto-recording を設定

    Args:
        user_id: ユーザー ID
        auto_recording: 自動録画を有効にするか
        auto_transcription: 自動文字起こしを有効にするか

    Returns:
        作成された Space 情報
    """
    logger.info(
        f"Creating Meet space for user: {user_id}, "
        f"auto_recording: {auto_recording}, auto_transcription: {auto_transcription}"
    )

    credentials = get_valid_credentials(user_id)
    service = build("meet", "v2", credentials=credentials)

    space_config = {
        "config": {
            "accessType": "TRUSTED",
            "entryPointAccess": "ALL",
            "artifactConfig": {
                "recordingConfig": {
                    "autoRecordingGeneration": "ON" if auto_recording else "OFF"
                },
                "transcriptionConfig": {
                    "autoTranscriptionGeneration": "ON" if auto_transcription else "OFF"
                },
            },
        }
    }

    logger.info(f"Creating Meet space with config: {json.dumps(space_config)}")

    space = service.spaces().create(body=space_config).execute()

    logger.info(f"Created Meet space: {space.get('name')}")

    return space


def update_meet_space(user_id: str, space_id: str, auto_recording: bool) -> dict:
    """
    既存の Meet Space の設定を更新

    Args:
        user_id: ユーザー ID
        space_id: Space ID (spaces/xxx)
        auto_recording: 自動録画を有効にするか

    Returns:
        更新された Space 情報
    """
    logger.info(
        f"Updating Meet space {space_id} for user: {user_id}, "
        f"auto_recording: {auto_recording}"
    )

    credentials = get_valid_credentials(user_id)
    service = build("meet", "v2", credentials=credentials)

    update_body = {
        "config": {
            "artifactConfig": {
                "recordingConfig": {
                    "autoRecordingGeneration": "ON" if auto_recording else "OFF"
                }
            }
        }
    }

    space = (
        service.spaces()
        .patch(
            name=space_id,
            body=update_body,
            updateMask="config.artifactConfig.recordingConfig.autoRecordingGeneration",
        )
        .execute()
    )

    logger.info(f"Updated Meet space: {space.get('name')}")

    return space


def get_meet_space(user_id: str, space_id: str) -> dict:
    """
    Meet Space の情報を取得

    Args:
        user_id: ユーザー ID
        space_id: Space ID (spaces/xxx)

    Returns:
        Space 情報
    """
    logger.info(f"Getting Meet space {space_id} for user: {user_id}")

    credentials = get_valid_credentials(user_id)
    service = build("meet", "v2", credentials=credentials)

    space = service.spaces().get(name=space_id).execute()

    logger.info(f"Got Meet space: {space.get('name')}")

    return space


def lambda_handler(event: dict, context) -> dict:
    """
    Lambda ハンドラー

    サポートするアクション:
    - create: 新規 Meet Space を作成
    - update: 既存 Space の設定を更新
    - get: Space 情報を取得
    """
    action = event.get("action")
    user_id = event.get("user_id")

    logger.info(f"Processing action: {action} for user: {user_id}")

    try:
        if action == "create":
            auto_recording = event.get("auto_recording", True)
            auto_transcription = event.get("auto_transcription", True)

            space = create_meet_space(user_id, auto_recording, auto_transcription)

            return {"success": True, "space": space}

        elif action == "update":
            space_id = event.get("space_id")
            auto_recording = event.get("auto_recording", True)

            space = update_meet_space(user_id, space_id, auto_recording)

            return {"success": True, "space": space}

        elif action == "get":
            space_id = event.get("space_id")

            space = get_meet_space(user_id, space_id)

            return {"success": True, "space": space}

        else:
            return {"error": f"Unknown action: {action}"}

    except Exception as e:
        logger.error(f"Error processing action {action}: {e}", exc_info=True)
        return {"error": str(e)}
