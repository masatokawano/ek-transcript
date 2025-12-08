"""
Google Auth Lambda テスト

OAuth 2.0 認証フロー、トークン管理、暗号化のテスト
"""

import json
import os
import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

# Lambda関数のパスを追加
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestGetAuthUrl:
    """get_auth_url アクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
            "GOOGLE_CLIENT_SECRET": "test-secret",
            "KMS_KEY_ID": "test-key-id",
            "TOKENS_TABLE": "test-tokens-table",
        },
    )
    @patch("lambda_function.Flow")
    def test_get_auth_url_returns_url(self, mock_flow_class):
        """認証URLが正しく生成される"""
        import lambda_function

        # Flowのモック設定
        mock_flow = MagicMock()
        mock_flow.authorization_url.return_value = (
            "https://accounts.google.com/o/oauth2/auth?client_id=test",
            "test-state",
        )
        mock_flow_class.from_client_config.return_value = mock_flow

        event = {
            "action": "get_auth_url",
            "redirect_uri": "https://example.com/callback",
            "state": "test-state-123",
        }

        result = lambda_function.lambda_handler(event, None)

        assert "auth_url" in result
        assert "accounts.google.com" in result["auth_url"]
        mock_flow.authorization_url.assert_called_once()

    @patch.dict(
        os.environ,
        {
            "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
            "GOOGLE_CLIENT_SECRET": "test-secret",
            "KMS_KEY_ID": "test-key-id",
            "TOKENS_TABLE": "test-tokens-table",
        },
    )
    @patch("lambda_function.Flow")
    def test_get_auth_url_includes_offline_access(self, mock_flow_class):
        """オフラインアクセス（refresh_token取得）が設定される"""
        import lambda_function

        mock_flow = MagicMock()
        mock_flow.authorization_url.return_value = ("https://example.com", "state")
        mock_flow_class.from_client_config.return_value = mock_flow

        event = {
            "action": "get_auth_url",
            "redirect_uri": "https://example.com/callback",
            "state": "test-state",
        }

        lambda_function.lambda_handler(event, None)

        # authorization_url が offline access_type で呼ばれたことを確認
        call_kwargs = mock_flow.authorization_url.call_args[1]
        assert call_kwargs.get("access_type") == "offline"
        assert call_kwargs.get("prompt") == "consent"


class TestExchangeCode:
    """exchange_code アクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
            "GOOGLE_CLIENT_SECRET": "test-secret",
            "KMS_KEY_ID": "test-key-id",
            "TOKENS_TABLE": "test-tokens-table",
        },
    )
    @patch("lambda_function.dynamodb")
    @patch("lambda_function.kms")
    @patch("lambda_function.Flow")
    def test_exchange_code_saves_encrypted_tokens(
        self, mock_flow_class, mock_kms, mock_dynamodb
    ):
        """認証コード交換後、暗号化されたトークンが保存される"""
        import lambda_function

        # Flowのモック
        mock_credentials = MagicMock()
        mock_credentials.token = "test-access-token"
        mock_credentials.refresh_token = "test-refresh-token"
        mock_credentials.expiry = datetime(2025, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
        mock_credentials.scopes = ["calendar.events", "drive.readonly"]

        mock_flow = MagicMock()
        mock_flow.credentials = mock_credentials
        mock_flow_class.from_client_config.return_value = mock_flow

        # KMSのモック
        mock_kms.encrypt.return_value = {
            "CiphertextBlob": b"encrypted-data"
        }

        # DynamoDBのモック
        mock_table = MagicMock()
        mock_dynamodb.Table.return_value = mock_table

        event = {
            "action": "exchange_code",
            "code": "auth-code-123",
            "redirect_uri": "https://example.com/callback",
            "user_id": "user-123",
            "email": "test@example.com",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        mock_flow.fetch_token.assert_called_once_with(code="auth-code-123")
        mock_kms.encrypt.assert_called()
        mock_table.put_item.assert_called_once()

    @patch.dict(
        os.environ,
        {
            "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
            "GOOGLE_CLIENT_SECRET": "test-secret",
            "KMS_KEY_ID": "test-key-id",
            "TOKENS_TABLE": "test-tokens-table",
        },
    )
    @patch("lambda_function.dynamodb")
    @patch("lambda_function.kms")
    @patch("lambda_function.Flow")
    def test_exchange_code_encryption_context(
        self, mock_flow_class, mock_kms, mock_dynamodb
    ):
        """KMS暗号化に正しいコンテキストが使用される"""
        import lambda_function

        mock_credentials = MagicMock()
        mock_credentials.token = "test-access-token"
        mock_credentials.refresh_token = "test-refresh-token"
        mock_credentials.expiry = datetime(2025, 12, 31, tzinfo=timezone.utc)
        mock_credentials.scopes = []

        mock_flow = MagicMock()
        mock_flow.credentials = mock_credentials
        mock_flow_class.from_client_config.return_value = mock_flow

        mock_kms.encrypt.return_value = {"CiphertextBlob": b"encrypted"}
        mock_dynamodb.Table.return_value = MagicMock()

        event = {
            "action": "exchange_code",
            "code": "auth-code",
            "redirect_uri": "https://example.com/callback",
            "user_id": "user-123",
            "email": "test@example.com",
        }

        lambda_function.lambda_handler(event, None)

        # 暗号化呼び出しの確認
        encrypt_calls = mock_kms.encrypt.call_args_list
        for call in encrypt_calls:
            assert call[1]["EncryptionContext"] == {"purpose": "google-oauth-token"}


class TestGetTokens:
    """get_tokens アクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
            "GOOGLE_CLIENT_SECRET": "test-secret",
            "KMS_KEY_ID": "test-key-id",
            "TOKENS_TABLE": "test-tokens-table",
        },
    )
    @patch("lambda_function.dynamodb")
    @patch("lambda_function.kms")
    def test_get_tokens_decrypts_successfully(self, mock_kms, mock_dynamodb):
        """保存されたトークンが正しく復号化される"""
        import lambda_function

        # DynamoDBのモック
        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "user_id": "user-123",
                "email": "test@example.com",
                "access_token": "656e6372797074656420746f6b656e",  # hex encoded
                "refresh_token": "656e6372797074656420726566726573685f746f6b656e",
                "scopes": ["calendar.events"],
                "expires_at": 1735689599,
            }
        }
        mock_dynamodb.Table.return_value = mock_table

        # KMSのモック
        mock_kms.decrypt.return_value = {"Plaintext": b"decrypted-token"}

        event = {
            "action": "get_tokens",
            "user_id": "user-123",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        assert "tokens" in result
        mock_kms.decrypt.assert_called()

    @patch.dict(
        os.environ,
        {
            "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
            "GOOGLE_CLIENT_SECRET": "test-secret",
            "KMS_KEY_ID": "test-key-id",
            "TOKENS_TABLE": "test-tokens-table",
        },
    )
    @patch("lambda_function.dynamodb")
    def test_get_tokens_user_not_found(self, mock_dynamodb):
        """存在しないユーザーの場合エラーを返す"""
        import lambda_function

        mock_table = MagicMock()
        mock_table.get_item.return_value = {}  # No Item
        mock_dynamodb.Table.return_value = mock_table

        event = {
            "action": "get_tokens",
            "user_id": "nonexistent-user",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is False
        assert "error" in result


class TestRevokeTokens:
    """revoke_tokens アクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
            "GOOGLE_CLIENT_SECRET": "test-secret",
            "KMS_KEY_ID": "test-key-id",
            "TOKENS_TABLE": "test-tokens-table",
        },
    )
    @patch("lambda_function.dynamodb")
    def test_revoke_tokens_deletes_from_dynamodb(self, mock_dynamodb):
        """トークン削除がDynamoDBから正しく行われる"""
        import lambda_function

        mock_table = MagicMock()
        mock_dynamodb.Table.return_value = mock_table

        event = {
            "action": "revoke_tokens",
            "user_id": "user-123",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        mock_table.delete_item.assert_called_once_with(Key={"user_id": "user-123"})


class TestUnknownAction:
    """不明なアクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
            "GOOGLE_CLIENT_SECRET": "test-secret",
            "KMS_KEY_ID": "test-key-id",
            "TOKENS_TABLE": "test-tokens-table",
        },
    )
    def test_unknown_action_returns_error(self):
        """不明なアクションでエラーを返す"""
        import lambda_function

        event = {
            "action": "unknown_action",
        }

        result = lambda_function.lambda_handler(event, None)

        assert "error" in result
        assert "Unknown action" in result["error"]


class TestScopes:
    """OAuth スコープのテスト"""

    @patch.dict(
        os.environ,
        {
            "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
            "GOOGLE_CLIENT_SECRET": "test-secret",
            "KMS_KEY_ID": "test-key-id",
            "TOKENS_TABLE": "test-tokens-table",
        },
    )
    def test_required_scopes_defined(self):
        """必要なスコープが定義されている"""
        import lambda_function

        required_scopes = [
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/meetings.space.settings",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
        ]

        for scope in required_scopes:
            assert scope in lambda_function.SCOPES, f"Missing scope: {scope}"
