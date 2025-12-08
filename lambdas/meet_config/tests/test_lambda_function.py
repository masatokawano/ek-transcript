"""
Meet Config Lambda テスト

Google Meet Space の作成と auto-recording 設定のテスト
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

# Lambda関数のパスを追加
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestCreateMeetSpace:
    """create_meet_space アクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.build")
    def test_create_meet_space_with_auto_recording(
        self, mock_build, mock_get_credentials
    ):
        """auto-recording 有効で Space を作成"""
        import lambda_function

        # モック設定
        mock_credentials = MagicMock()
        mock_get_credentials.return_value = mock_credentials

        mock_service = MagicMock()
        mock_spaces = MagicMock()
        mock_create = MagicMock()
        mock_create.execute.return_value = {
            "name": "spaces/abc123",
            "meetingUri": "https://meet.google.com/abc-defg-hij",
            "meetingCode": "abc-defg-hij",
            "config": {
                "accessType": "TRUSTED",
                "artifactConfig": {
                    "recordingConfig": {"autoRecordingGeneration": "ON"}
                },
            },
        }
        mock_spaces.create.return_value = mock_create
        mock_service.spaces.return_value = mock_spaces
        mock_build.return_value = mock_service

        event = {
            "action": "create",
            "user_id": "user-123",
            "auto_recording": True,
            "auto_transcription": True,
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        assert "space" in result
        assert result["space"]["name"] == "spaces/abc123"

        # create が正しい設定で呼ばれたことを確認
        create_call = mock_spaces.create.call_args
        body = create_call[1]["body"]
        assert body["config"]["artifactConfig"]["recordingConfig"][
            "autoRecordingGeneration"
        ] == "ON"

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.build")
    def test_create_meet_space_without_auto_recording(
        self, mock_build, mock_get_credentials
    ):
        """auto-recording 無効で Space を作成"""
        import lambda_function

        mock_credentials = MagicMock()
        mock_get_credentials.return_value = mock_credentials

        mock_service = MagicMock()
        mock_spaces = MagicMock()
        mock_create = MagicMock()
        mock_create.execute.return_value = {
            "name": "spaces/xyz789",
            "meetingUri": "https://meet.google.com/xyz-uvw-rst",
            "meetingCode": "xyz-uvw-rst",
        }
        mock_spaces.create.return_value = mock_create
        mock_service.spaces.return_value = mock_spaces
        mock_build.return_value = mock_service

        event = {
            "action": "create",
            "user_id": "user-123",
            "auto_recording": False,
            "auto_transcription": False,
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        create_call = mock_spaces.create.call_args
        body = create_call[1]["body"]
        assert body["config"]["artifactConfig"]["recordingConfig"][
            "autoRecordingGeneration"
        ] == "OFF"


class TestUpdateMeetSpace:
    """update_meet_space アクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.build")
    def test_update_meet_space_enable_recording(
        self, mock_build, mock_get_credentials
    ):
        """既存 Space の auto-recording を有効化"""
        import lambda_function

        mock_credentials = MagicMock()
        mock_get_credentials.return_value = mock_credentials

        mock_service = MagicMock()
        mock_spaces = MagicMock()
        mock_patch = MagicMock()
        mock_patch.execute.return_value = {
            "name": "spaces/abc123",
            "config": {
                "artifactConfig": {
                    "recordingConfig": {"autoRecordingGeneration": "ON"}
                }
            },
        }
        mock_spaces.patch.return_value = mock_patch
        mock_service.spaces.return_value = mock_spaces
        mock_build.return_value = mock_service

        event = {
            "action": "update",
            "user_id": "user-123",
            "space_id": "spaces/abc123",
            "auto_recording": True,
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        mock_spaces.patch.assert_called_once()

        # updateMask が設定されていることを確認
        patch_call = mock_spaces.patch.call_args
        assert (
            "config.artifactConfig.recordingConfig.autoRecordingGeneration"
            in patch_call[1]["updateMask"]
        )


class TestGetMeetSpace:
    """get_meet_space アクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.build")
    def test_get_meet_space(self, mock_build, mock_get_credentials):
        """Space 情報を取得"""
        import lambda_function

        mock_credentials = MagicMock()
        mock_get_credentials.return_value = mock_credentials

        mock_service = MagicMock()
        mock_spaces = MagicMock()
        mock_get = MagicMock()
        mock_get.execute.return_value = {
            "name": "spaces/abc123",
            "meetingUri": "https://meet.google.com/abc-defg-hij",
            "meetingCode": "abc-defg-hij",
            "config": {
                "accessType": "TRUSTED",
                "artifactConfig": {
                    "recordingConfig": {"autoRecordingGeneration": "ON"}
                },
            },
        }
        mock_spaces.get.return_value = mock_get
        mock_service.spaces.return_value = mock_spaces
        mock_build.return_value = mock_service

        event = {
            "action": "get",
            "user_id": "user-123",
            "space_id": "spaces/abc123",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        assert result["space"]["name"] == "spaces/abc123"


class TestUnknownAction:
    """不明なアクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    def test_unknown_action_returns_error(self):
        """不明なアクションでエラーを返す"""
        import lambda_function

        event = {
            "action": "unknown_action",
            "user_id": "user-123",
        }

        result = lambda_function.lambda_handler(event, None)

        assert "error" in result
        assert "Unknown action" in result["error"]


class TestErrorHandling:
    """エラーハンドリングのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    def test_token_not_found_error(self, mock_get_credentials):
        """トークンが見つからない場合のエラー"""
        import lambda_function
        from shared.google_token_manager import TokenNotFoundError

        mock_get_credentials.side_effect = TokenNotFoundError("No tokens found")

        event = {
            "action": "create",
            "user_id": "nonexistent-user",
        }

        result = lambda_function.lambda_handler(event, None)

        assert "error" in result
        assert "No tokens found" in result["error"]

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.build")
    def test_google_api_error(self, mock_build, mock_get_credentials):
        """Google API エラーの処理"""
        import lambda_function

        mock_credentials = MagicMock()
        mock_get_credentials.return_value = mock_credentials

        mock_service = MagicMock()
        mock_spaces = MagicMock()
        mock_create = MagicMock()
        mock_create.execute.side_effect = Exception("API Error: Rate limit exceeded")
        mock_spaces.create.return_value = mock_create
        mock_service.spaces.return_value = mock_spaces
        mock_build.return_value = mock_service

        event = {
            "action": "create",
            "user_id": "user-123",
        }

        result = lambda_function.lambda_handler(event, None)

        assert "error" in result
        assert "Rate limit" in result["error"]
