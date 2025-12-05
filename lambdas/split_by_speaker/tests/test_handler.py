"""
SplitBySpeaker Lambda のテスト

第5原則: テストファースト
"""

import json
from unittest.mock import MagicMock, patch

import pytest


class TestSplitBySpeaker:
    """音声分割機能のテスト"""

    @pytest.fixture
    def mock_s3(self) -> MagicMock:
        """S3 クライアントのモック"""
        with patch("lambda_function.s3") as mock:
            # segments.json のモックデータ
            mock.get_object.return_value = {
                "Body": MagicMock(
                    read=lambda: json.dumps(
                        [
                            {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00"},
                            {"start": 5.5, "end": 10.0, "speaker": "SPEAKER_01"},
                        ]
                    ).encode()
                )
            }
            yield mock

    @pytest.fixture
    def mock_audio_segment(self) -> MagicMock:
        """AudioSegment のモック"""
        with patch("lambda_function.AudioSegment") as mock:
            audio = MagicMock()
            audio.__getitem__ = MagicMock(return_value=MagicMock())
            mock.from_wav.return_value = audio
            yield mock

    def test_lambda_handler_success(
        self, mock_s3: MagicMock, mock_audio_segment: MagicMock
    ) -> None:
        """正常系: 音声分割が成功すること"""
        from lambda_function import lambda_handler

        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/test.wav",
            "segments_key": "processed/test_segments.json",
        }
        context = MagicMock()

        result = lambda_handler(event, context)

        assert result["bucket"] == "test-bucket"
        assert "segment_files" in result
        assert len(result["segment_files"]) == 2

    def test_lambda_handler_empty_segments(
        self, mock_s3: MagicMock, mock_audio_segment: MagicMock
    ) -> None:
        """空のセグメントリストでも正常に動作すること"""
        mock_s3.get_object.return_value = {
            "Body": MagicMock(read=lambda: json.dumps([]).encode())
        }

        from lambda_function import lambda_handler

        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/test.wav",
            "segments_key": "processed/test_segments.json",
        }
        context = MagicMock()

        result = lambda_handler(event, context)

        assert result["segment_files"] == []
