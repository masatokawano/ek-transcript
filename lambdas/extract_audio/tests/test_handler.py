"""
ExtractAudio Lambda のテスト

第5原則: テストファースト
"""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Lambda handler をインポート（実装後）
# from lambda_function import lambda_handler, extract_audio


class TestExtractAudio:
    """音声抽出機能のテスト"""

    def test_extract_audio_creates_wav_file(self, tmp_path: Path) -> None:
        """MP4からWAVファイルが正しく作成されること"""
        from lambda_function import extract_audio

        # Given: テスト用の入力パスと出力パス
        input_path = str(tmp_path / "input.mp4")
        output_path = str(tmp_path / "output.wav")

        # ダミーファイルを作成（実際のテストではテスト用動画を使用）
        Path(input_path).touch()

        # When: extract_audio を実行
        # Note: 実際のテストでは ffmpeg が必要
        # extract_audio(input_path, output_path)

        # Then: WAV ファイルが作成される（実装後に有効化）
        # assert Path(output_path).exists()
        pass  # 実装後にテストを有効化

    def test_extract_audio_output_is_16khz_mono(self, tmp_path: Path) -> None:
        """出力音声が16kHz、モノラルであること"""
        # このテストは実際の音声ファイルで検証
        # 実装後に有効化
        pass

    def test_extract_audio_handles_invalid_input(self, tmp_path: Path) -> None:
        """存在しないファイルでエラーが発生すること"""
        from lambda_function import extract_audio

        input_path = str(tmp_path / "nonexistent.mp4")
        output_path = str(tmp_path / "output.wav")

        with pytest.raises(Exception):
            extract_audio(input_path, output_path)


class TestLambdaHandler:
    """Lambda ハンドラーのテスト"""

    @pytest.fixture
    def mock_s3(self) -> MagicMock:
        """S3 クライアントのモック"""
        with patch("lambda_function.s3") as mock:
            yield mock

    @pytest.fixture
    def mock_ffmpeg(self) -> MagicMock:
        """ffmpeg のモック"""
        with patch("lambda_function.ffmpeg") as mock:
            # ffmpeg チェーンのモック
            mock.input.return_value.output.return_value.overwrite_output.return_value.run.return_value = (
                None
            )
            yield mock

    def test_lambda_handler_success(
        self, mock_s3: MagicMock, mock_ffmpeg: MagicMock
    ) -> None:
        """正常系: S3からダウンロード→処理→S3アップロードが成功すること"""
        from lambda_function import lambda_handler

        # Given
        event = {
            "bucket": "test-bucket",
            "key": "videos/test.mp4",
        }
        context = MagicMock()

        # When
        result = lambda_handler(event, context)

        # Then
        assert result["bucket"] == "test-bucket"
        assert "audio_key" in result
        assert result["audio_key"].endswith(".wav")
        mock_s3.download_file.assert_called_once()
        mock_s3.upload_file.assert_called_once()

    def test_lambda_handler_missing_bucket(self) -> None:
        """bucket が指定されていない場合にエラー"""
        from lambda_function import lambda_handler

        event = {"key": "videos/test.mp4"}
        context = MagicMock()

        with pytest.raises(KeyError):
            lambda_handler(event, context)

    def test_lambda_handler_missing_key(self) -> None:
        """key が指定されていない場合にエラー"""
        from lambda_function import lambda_handler

        event = {"bucket": "test-bucket"}
        context = MagicMock()

        with pytest.raises(KeyError):
            lambda_handler(event, context)

    def test_lambda_handler_returns_correct_output_key(
        self, mock_s3: MagicMock, mock_ffmpeg: MagicMock
    ) -> None:
        """出力キーが正しい形式であること"""
        from lambda_function import lambda_handler

        event = {
            "bucket": "test-bucket",
            "key": "videos/meeting_2024.mp4",
        }
        context = MagicMock()

        result = lambda_handler(event, context)

        # processed/ プレフィックスが付き、拡張子が .wav に変わる
        assert result["audio_key"] == "processed/videos/meeting_2024.wav"


class TestIntegration:
    """統合テスト（実際のffmpegが必要）"""

    @pytest.mark.integration
    def test_extract_real_audio(self, tmp_path: Path) -> None:
        """実際の動画ファイルから音声を抽出"""
        # 統合テストは別途実行
        pytest.skip("Integration test - requires test video file")
