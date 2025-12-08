"""
Google Token Manager テスト
"""

import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

# 共有モジュールのパスを追加
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestDecryptToken:
    """decrypt_token のテスト"""

    @patch.dict(
        os.environ,
        {
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("google_token_manager.kms")
    def test_decrypt_token_success(self, mock_kms):
        """トークンが正しく復号化される"""
        import google_token_manager

        mock_kms.decrypt.return_value = {"Plaintext": b"decrypted-token"}

        result = google_token_manager.decrypt_token("656e637279707465642d746f6b656e")

        assert result == "decrypted-token"
        mock_kms.decrypt.assert_called_once()

    @patch.dict(
        os.environ,
        {
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("google_token_manager.kms")
    def test_decrypt_uses_correct_context(self, mock_kms):
        """正しい暗号化コンテキストが使用される"""
        import google_token_manager

        mock_kms.decrypt.return_value = {"Plaintext": b"token"}

        google_token_manager.decrypt_token("746f6b656e")

        call_kwargs = mock_kms.decrypt.call_args[1]
        assert call_kwargs["EncryptionContext"] == {"purpose": "google-oauth-token"}


class TestEncryptToken:
    """encrypt_token のテスト"""

    @patch.dict(
        os.environ,
        {
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("google_token_manager.kms")
    def test_encrypt_token_success(self, mock_kms):
        """トークンが正しく暗号化される"""
        import google_token_manager

        mock_kms.encrypt.return_value = {"CiphertextBlob": b"encrypted"}

        result = google_token_manager.encrypt_token("plain-token")

        assert result == "656e63727970746564"  # hex of "encrypted"
        mock_kms.encrypt.assert_called_once()

    @patch.dict(
        os.environ,
        {
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("google_token_manager.kms")
    def test_encrypt_uses_correct_key(self, mock_kms):
        """正しい KMS キーが使用される"""
        import google_token_manager

        mock_kms.encrypt.return_value = {"CiphertextBlob": b"enc"}

        google_token_manager.encrypt_token("token")

        call_kwargs = mock_kms.encrypt.call_args[1]
        assert call_kwargs["KeyId"] == "test-key-id"
        assert call_kwargs["EncryptionContext"] == {"purpose": "google-oauth-token"}


class TestGetStoredToken:
    """get_stored_token のテスト"""

    @patch.dict(
        os.environ,
        {
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("google_token_manager.dynamodb")
    def test_get_stored_token_found(self, mock_dynamodb):
        """トークンが存在する場合に返される"""
        import google_token_manager

        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "user_id": "user-123",
                "access_token": "encrypted-access",
                "refresh_token": "encrypted-refresh",
            }
        }
        mock_dynamodb.Table.return_value = mock_table

        result = google_token_manager.get_stored_token("user-123")

        assert result is not None
        assert result["user_id"] == "user-123"

    @patch.dict(
        os.environ,
        {
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("google_token_manager.dynamodb")
    def test_get_stored_token_not_found(self, mock_dynamodb):
        """トークンが存在しない場合に None を返す"""
        import google_token_manager

        mock_table = MagicMock()
        mock_table.get_item.return_value = {}
        mock_dynamodb.Table.return_value = mock_table

        result = google_token_manager.get_stored_token("nonexistent-user")

        assert result is None


class TestGetValidCredentials:
    """get_valid_credentials のテスト"""

    @patch.dict(
        os.environ,
        {
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("google_token_manager.dynamodb")
    @patch("google_token_manager.kms")
    def test_get_valid_credentials_not_expired(self, mock_kms, mock_dynamodb):
        """期限切れでないトークンはそのまま返される"""
        import google_token_manager

        # 1時間後に期限切れのトークン
        future_time = datetime.now(timezone.utc) + timedelta(hours=1)

        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "user_id": "user-123",
                "access_token": "656e63727970746564",  # hex
                "refresh_token": "726566726573685f746f6b656e",  # hex
                "scopes": ["calendar.events"],
                "expires_at": int(future_time.timestamp()),
            }
        }
        mock_dynamodb.Table.return_value = mock_table
        mock_kms.decrypt.return_value = {"Plaintext": b"decrypted-token"}

        credentials = google_token_manager.get_valid_credentials("user-123")

        assert credentials is not None
        assert credentials.token == "decrypted-token"

    @patch.dict(
        os.environ,
        {
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("google_token_manager.dynamodb")
    def test_get_valid_credentials_user_not_found(self, mock_dynamodb):
        """ユーザーが見つからない場合に例外を発生"""
        import google_token_manager
        from google_token_manager import TokenNotFoundError

        mock_table = MagicMock()
        mock_table.get_item.return_value = {}
        mock_dynamodb.Table.return_value = mock_table

        with pytest.raises(TokenNotFoundError):
            google_token_manager.get_valid_credentials("nonexistent-user")


class TestCheckTokenStatus:
    """check_token_status のテスト"""

    @patch.dict(
        os.environ,
        {
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("google_token_manager.dynamodb")
    def test_check_token_status_connected(self, mock_dynamodb):
        """接続済みユーザーの状態を返す"""
        import google_token_manager

        future_time = datetime.now(timezone.utc) + timedelta(hours=1)

        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "user_id": "user-123",
                "email": "test@example.com",
                "access_token": "enc",
                "refresh_token": "enc",
                "scopes": ["calendar.events"],
                "expires_at": int(future_time.timestamp()),
            }
        }
        mock_dynamodb.Table.return_value = mock_table

        status = google_token_manager.check_token_status("user-123")

        assert status["connected"] is True
        assert status["email"] == "test@example.com"
        assert status["is_expired"] is False
        assert status["has_refresh_token"] is True

    @patch.dict(
        os.environ,
        {
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("google_token_manager.dynamodb")
    def test_check_token_status_not_connected(self, mock_dynamodb):
        """未接続ユーザーの状態を返す"""
        import google_token_manager

        mock_table = MagicMock()
        mock_table.get_item.return_value = {}
        mock_dynamodb.Table.return_value = mock_table

        status = google_token_manager.check_token_status("new-user")

        assert status["connected"] is False
        assert status["email"] is None
        assert status["scopes"] == []

    @patch.dict(
        os.environ,
        {
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("google_token_manager.dynamodb")
    def test_check_token_status_expired(self, mock_dynamodb):
        """期限切れトークンの状態を返す"""
        import google_token_manager

        past_time = datetime.now(timezone.utc) - timedelta(hours=1)

        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "user_id": "user-123",
                "email": "test@example.com",
                "access_token": "enc",
                "scopes": [],
                "expires_at": int(past_time.timestamp()),
            }
        }
        mock_dynamodb.Table.return_value = mock_table

        status = google_token_manager.check_token_status("user-123")

        assert status["connected"] is True
        assert status["is_expired"] is True


class TestExceptions:
    """カスタム例外のテスト"""

    def test_token_not_found_error(self):
        """TokenNotFoundError が正しく定義されている"""
        from google_token_manager import TokenNotFoundError

        error = TokenNotFoundError("test message")
        assert str(error) == "test message"

    def test_token_refresh_error(self):
        """TokenRefreshError が正しく定義されている"""
        from google_token_manager import TokenRefreshError

        error = TokenRefreshError("refresh failed")
        assert str(error) == "refresh failed"
