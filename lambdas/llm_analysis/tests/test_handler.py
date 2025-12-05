"""
LLMAnalysis Lambda のテスト

第5原則: テストファースト
"""

import json
from unittest.mock import MagicMock, patch

import pytest


class TestLLMAnalysis:
    """LLM分析機能のテスト"""

    @pytest.fixture
    def mock_s3(self) -> MagicMock:
        """S3 クライアントのモック"""
        with patch("lambda_function.s3") as mock:
            mock.get_object.return_value = {
                "Body": MagicMock(
                    read=lambda: json.dumps(
                        [
                            {"speaker": "SPEAKER_00", "start": 0.0, "end": 5.0, "text": "こんにちは"},
                            {"speaker": "SPEAKER_01", "start": 5.5, "end": 10.0, "text": "はい、こんにちは"},
                        ]
                    ).encode()
                )
            }
            yield mock

    @pytest.fixture
    def mock_openai(self) -> MagicMock:
        """OpenAI クライアントのモック"""
        with patch("lambda_function.get_openai_client") as mock:
            client = MagicMock()
            response = MagicMock()
            response.choices = [MagicMock(message=MagicMock(content="これは要約です。"))]
            client.chat.completions.create.return_value = response
            mock.return_value = client
            yield mock

    def test_lambda_handler_success(
        self, mock_s3: MagicMock, mock_openai: MagicMock
    ) -> None:
        """正常系: LLM分析が成功すること"""
        from lambda_function import lambda_handler

        event = {
            "bucket": "test-bucket",
            "transcript_key": "transcripts/test_transcript.json",
        }
        context = MagicMock()

        result = lambda_handler(event, context)

        assert result["bucket"] == "test-bucket"
        assert "analysis_key" in result

    def test_lambda_handler_custom_prompt(
        self, mock_s3: MagicMock, mock_openai: MagicMock
    ) -> None:
        """カスタムプロンプトが使用されること"""
        from lambda_function import lambda_handler

        event = {
            "bucket": "test-bucket",
            "transcript_key": "transcripts/test_transcript.json",
            "prompt": "アクションアイテムを抽出してください",
        }
        context = MagicMock()

        result = lambda_handler(event, context)

        # OpenAI API が呼び出されたことを確認
        mock_openai.return_value.chat.completions.create.assert_called_once()
