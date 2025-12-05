"""
AggregateResults Lambda のテスト

第5原則: テストファースト
"""

from unittest.mock import MagicMock, patch

import pytest


class TestAggregateResults:
    """結果統合機能のテスト"""

    @pytest.fixture
    def mock_s3(self) -> MagicMock:
        """S3 クライアントのモック"""
        with patch("lambda_function.s3") as mock:
            yield mock

    def test_lambda_handler_success(self, mock_s3: MagicMock) -> None:
        """正常系: 結果が正しく統合されること"""
        from lambda_function import lambda_handler

        event = {
            "bucket": "test-bucket",
            "transcription_results": [
                {"speaker": "SPEAKER_00", "start": 0.0, "end": 5.0, "text": "こんにちは"},
                {"speaker": "SPEAKER_01", "start": 5.5, "end": 10.0, "text": "はい、こんにちは"},
            ],
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        result = lambda_handler(event, context)

        assert result["bucket"] == "test-bucket"
        assert "transcript_key" in result

    def test_lambda_handler_sorts_by_time(self, mock_s3: MagicMock) -> None:
        """結果が時系列でソートされること"""
        from lambda_function import lambda_handler

        event = {
            "bucket": "test-bucket",
            "transcription_results": [
                {"speaker": "SPEAKER_01", "start": 5.5, "end": 10.0, "text": "2番目"},
                {"speaker": "SPEAKER_00", "start": 0.0, "end": 5.0, "text": "1番目"},
            ],
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        result = lambda_handler(event, context)

        # put_object が呼ばれた時のデータを検証
        call_args = mock_s3.put_object.call_args
        import json

        body = json.loads(call_args.kwargs["Body"])
        assert body[0]["text"] == "1番目"
        assert body[1]["text"] == "2番目"
