"""
ChunkAudio Lambda のテスト

第5原則: テストファースト
TDD に基づき、実装前にテストを作成する。
"""

import importlib.util
import json
import sys
from collections.abc import Generator
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# このLambdaのlambda_function.pyを動的にインポート
LAMBDA_DIR = Path(__file__).parent.parent
spec = importlib.util.spec_from_file_location(
    "chunk_audio_lambda", LAMBDA_DIR / "lambda_function.py"
)
if spec and spec.loader:
    lambda_module = importlib.util.module_from_spec(spec)
    sys.modules["chunk_audio_lambda"] = lambda_module
    spec.loader.exec_module(lambda_module)


class TestGetAudioDuration:
    """音声長取得機能のテスト"""

    def test_get_audio_duration_returns_float(self, tmp_path: Path) -> None:
        """ffprobe の結果から音声長を float で返す"""
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"format": {"duration": "120.5"}})

        with patch.object(lambda_module.subprocess, "run", return_value=mock_result):
            duration = lambda_module.get_audio_duration(str(tmp_path / "test.wav"))

        assert duration == 120.5

    def test_get_audio_duration_handles_integer(self, tmp_path: Path) -> None:
        """整数の音声長も正しく処理"""
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"format": {"duration": "300"}})

        with patch.object(lambda_module.subprocess, "run", return_value=mock_result):
            duration = lambda_module.get_audio_duration(str(tmp_path / "test.wav"))

        assert duration == 300.0


class TestSplitAudioToChunks:
    """チャンク分割機能のテスト"""

    @pytest.fixture
    def mock_get_duration(self) -> Generator[MagicMock, None, None]:
        """get_audio_duration のモック"""
        with patch.object(lambda_module, "get_audio_duration") as mock:
            yield mock

    @pytest.fixture
    def mock_subprocess(self) -> Generator[MagicMock, None, None]:
        """subprocess.run のモック"""
        with patch.object(lambda_module.subprocess, "run") as mock:
            mock.return_value = MagicMock(returncode=0)
            yield mock

    def test_split_creates_correct_number_of_chunks_short_audio(
        self,
        mock_get_duration: MagicMock,
        mock_subprocess: MagicMock,
        tmp_path: Path,
    ) -> None:
        """短い音声（10分）は2チャンクに分割"""
        mock_get_duration.return_value = 600.0  # 10分

        chunks = lambda_module.split_audio_to_chunks(
            str(tmp_path / "input.wav"),
            str(tmp_path / "output"),
            "test",
            chunk_duration=480,
            overlap_duration=30,
        )

        # 10分 = 600秒 → step=450秒 → チャンク0: 0-510, チャンク1: 450-600
        assert len(chunks) == 2

    def test_split_creates_correct_number_of_chunks_long_audio(
        self,
        mock_get_duration: MagicMock,
        mock_subprocess: MagicMock,
        tmp_path: Path,
    ) -> None:
        """長い音声（40分）は6チャンクに分割"""
        mock_get_duration.return_value = 2400.0  # 40分

        chunks = lambda_module.split_audio_to_chunks(
            str(tmp_path / "input.wav"),
            str(tmp_path / "output"),
            "test",
            chunk_duration=480,
            overlap_duration=30,
        )

        # 40分 = 2400秒 → step=450秒
        # チャンク0: 0-510 (effective: 0-480)
        # チャンク1: 450-960 (effective: 480-960)
        # チャンク2: 900-1410 (effective: 960-1440)
        # チャンク3: 1350-1860 (effective: 1440-1920)
        # チャンク4: 1800-2310 (effective: 1920-2280)
        # チャンク5: 2250-2400 (effective: 2280-2400)
        assert len(chunks) == 6

    def test_split_handles_exact_chunk_boundary(
        self,
        mock_get_duration: MagicMock,
        mock_subprocess: MagicMock,
        tmp_path: Path,
    ) -> None:
        """チャンク境界ちょうどの音声長の処理"""
        mock_get_duration.return_value = 960.0  # 16分 = 2 * step + overlap

        chunks = lambda_module.split_audio_to_chunks(
            str(tmp_path / "input.wav"),
            str(tmp_path / "output"),
            "test",
            chunk_duration=480,
            overlap_duration=30,
        )

        # 960秒 → step=450秒
        # チャンク0: 0-510 (effective: 0-480)
        # チャンク1: 450-960 (effective: 480-930)
        # チャンク2: 900-960 (effective: 930-960) → 60秒 ≥ MIN_CHUNK_DURATION
        assert len(chunks) >= 2

    def test_split_chunk_has_correct_structure(
        self,
        mock_get_duration: MagicMock,
        mock_subprocess: MagicMock,
        tmp_path: Path,
    ) -> None:
        """チャンクが正しい構造を持つ"""
        mock_get_duration.return_value = 600.0  # 10分

        chunks = lambda_module.split_audio_to_chunks(
            str(tmp_path / "input.wav"),
            str(tmp_path / "output"),
            "test",
            chunk_duration=480,
            overlap_duration=30,
        )

        chunk = chunks[0]
        assert "chunk_index" in chunk
        assert "local_path" in chunk
        assert "offset" in chunk
        assert "duration" in chunk
        assert "effective_start" in chunk
        assert "effective_end" in chunk

    def test_first_chunk_starts_at_zero(
        self,
        mock_get_duration: MagicMock,
        mock_subprocess: MagicMock,
        tmp_path: Path,
    ) -> None:
        """最初のチャンクは0秒から開始"""
        mock_get_duration.return_value = 600.0

        chunks = lambda_module.split_audio_to_chunks(
            str(tmp_path / "input.wav"),
            str(tmp_path / "output"),
            "test",
            chunk_duration=480,
            overlap_duration=30,
        )

        assert chunks[0]["offset"] == 0.0
        assert chunks[0]["effective_start"] == 0.0
        assert chunks[0]["effective_end"] == 480.0

    def test_overlap_is_correct(
        self,
        mock_get_duration: MagicMock,
        mock_subprocess: MagicMock,
        tmp_path: Path,
    ) -> None:
        """オーバーラップが正しく設定される"""
        mock_get_duration.return_value = 1200.0  # 20分

        chunks = lambda_module.split_audio_to_chunks(
            str(tmp_path / "input.wav"),
            str(tmp_path / "output"),
            "test",
            chunk_duration=480,
            overlap_duration=30,
        )

        # チャンク1の開始 = チャンク0の effective_end - overlap
        # step = 480 - 30 = 450
        # chunk1.offset = 450
        # chunk0.effective_end = 480
        # overlap = 480 - 450 = 30
        assert chunks[1]["offset"] == 450.0
        assert chunks[0]["effective_end"] - chunks[1]["offset"] == 30.0

    def test_short_last_chunk_extends_previous(
        self,
        mock_get_duration: MagicMock,
        mock_subprocess: MagicMock,
        tmp_path: Path,
    ) -> None:
        """最後のチャンクが短すぎる場合、前のチャンクの effective_end を延長"""
        mock_get_duration.return_value = 950.0  # 最後のチャンクが50秒になるケース

        chunks = lambda_module.split_audio_to_chunks(
            str(tmp_path / "input.wav"),
            str(tmp_path / "output"),
            "test",
            chunk_duration=480,
            overlap_duration=30,
        )

        # 950秒 → step=450秒
        # チャンク0: 0-510 (effective: 0-480)
        # チャンク1: 450-950 (effective: 480-930)
        # 残り: 950-900=50秒 < MIN_CHUNK_DURATION(60秒) → チャンク1のeffective_endを延長
        assert chunks[-1]["effective_end"] == 950.0


class TestLambdaHandler:
    """Lambda ハンドラーのテスト"""

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            yield mock

    @pytest.fixture
    def mock_split_audio(self) -> Generator[MagicMock, None, None]:
        """split_audio_to_chunks のモック"""
        with patch.object(lambda_module, "split_audio_to_chunks") as mock:
            mock.return_value = [
                {
                    "chunk_index": 0,
                    "local_path": "/tmp/chunks/test_chunk_00.wav",
                    "offset": 0.0,
                    "duration": 510.0,
                    "effective_start": 0.0,
                    "effective_end": 480.0,
                },
                {
                    "chunk_index": 1,
                    "local_path": "/tmp/chunks/test_chunk_01.wav",
                    "offset": 450.0,
                    "duration": 510.0,
                    "effective_start": 450.0,
                    "effective_end": 930.0,
                },
            ]
            yield mock

    @pytest.fixture
    def mock_get_duration(self) -> Generator[MagicMock, None, None]:
        """get_audio_duration のモック"""
        with patch.object(lambda_module, "get_audio_duration") as mock:
            mock.return_value = 960.0  # 16分
            yield mock

    @pytest.fixture
    def mock_os(self) -> Generator[None, None, None]:
        """os のモック"""
        with patch.object(lambda_module.os.path, "exists", return_value=True):
            with patch.object(lambda_module.os, "remove"):
                with patch.object(lambda_module.os, "makedirs"):
                    with patch.object(lambda_module.os, "listdir", return_value=[]):
                        yield None

    def test_lambda_handler_success(
        self,
        mock_s3: MagicMock,
        mock_split_audio: MagicMock,
        mock_get_duration: MagicMock,
        mock_os: None,
    ) -> None:
        """正常系: S3からダウンロード→分割→S3アップロードが成功"""
        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["bucket"] == "test-bucket"
        assert result["audio_key"] == "processed/test.wav"
        assert "chunks" in result
        assert "total_chunks" in result
        assert "chunk_config" in result
        mock_s3.download_file.assert_called_once()

    def test_lambda_handler_returns_correct_chunks(
        self,
        mock_s3: MagicMock,
        mock_split_audio: MagicMock,
        mock_get_duration: MagicMock,
        mock_os: None,
    ) -> None:
        """チャンク情報が正しく返される"""
        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/interview.wav",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["total_chunks"] == 2
        assert len(result["chunks"]) == 2
        assert "chunk_key" in result["chunks"][0]

    def test_lambda_handler_chunk_config(
        self,
        mock_s3: MagicMock,
        mock_split_audio: MagicMock,
        mock_get_duration: MagicMock,
        mock_os: None,
    ) -> None:
        """チャンク設定が正しく返される"""
        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/interview.wav",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert "chunk_config" in result
        assert "chunk_duration" in result["chunk_config"]
        assert "overlap_duration" in result["chunk_config"]

    def test_lambda_handler_missing_bucket(self) -> None:
        """bucket が指定されていない場合にエラー"""
        event = {"audio_key": "processed/test.wav"}
        context = MagicMock()

        with pytest.raises(KeyError):
            lambda_module.lambda_handler(event, context)

    def test_lambda_handler_missing_audio_key(self) -> None:
        """audio_key が指定されていない場合にエラー"""
        event = {"bucket": "test-bucket"}
        context = MagicMock()

        with pytest.raises(KeyError):
            lambda_module.lambda_handler(event, context)


class TestEdgeCases:
    """エッジケースのテスト"""

    @pytest.fixture
    def mock_get_duration(self) -> Generator[MagicMock, None, None]:
        """get_audio_duration のモック"""
        with patch.object(lambda_module, "get_audio_duration") as mock:
            yield mock

    @pytest.fixture
    def mock_subprocess(self) -> Generator[MagicMock, None, None]:
        """subprocess.run のモック"""
        with patch.object(lambda_module.subprocess, "run") as mock:
            mock.return_value = MagicMock(returncode=0)
            yield mock

    def test_very_short_audio_single_chunk(
        self,
        mock_get_duration: MagicMock,
        mock_subprocess: MagicMock,
        tmp_path: Path,
    ) -> None:
        """非常に短い音声は1チャンク"""
        mock_get_duration.return_value = 120.0  # 2分

        chunks = lambda_module.split_audio_to_chunks(
            str(tmp_path / "input.wav"),
            str(tmp_path / "output"),
            "test",
            chunk_duration=480,
            overlap_duration=30,
        )

        assert len(chunks) == 1
        assert chunks[0]["offset"] == 0.0
        assert chunks[0]["effective_end"] == 120.0

    def test_exact_chunk_duration(
        self,
        mock_get_duration: MagicMock,
        mock_subprocess: MagicMock,
        tmp_path: Path,
    ) -> None:
        """ちょうど1チャンク分の音声"""
        mock_get_duration.return_value = 480.0  # 8分

        chunks = lambda_module.split_audio_to_chunks(
            str(tmp_path / "input.wav"),
            str(tmp_path / "output"),
            "test",
            chunk_duration=480,
            overlap_duration=30,
        )

        assert len(chunks) == 1
        assert chunks[0]["effective_end"] == 480.0

    def test_42_minute_audio(
        self,
        mock_get_duration: MagicMock,
        mock_subprocess: MagicMock,
        tmp_path: Path,
    ) -> None:
        """42分音声（実際のテストケース hems-user-interview.mp4 相当）"""
        mock_get_duration.return_value = 2520.0  # 42分

        chunks = lambda_module.split_audio_to_chunks(
            str(tmp_path / "input.wav"),
            str(tmp_path / "output"),
            "test",
            chunk_duration=480,
            overlap_duration=30,
        )

        # 2520秒 → step=450秒
        # チャンク数: ceil((2520 - overlap) / step) = ceil(2490/450) ≈ 6
        assert len(chunks) == 6

        # 最後のチャンクが音声の終端まで
        assert chunks[-1]["effective_end"] == 2520.0


class TestIntegration:
    """統合テスト（実際のffmpegが必要）"""

    @pytest.mark.integration
    def test_real_audio_split(self, tmp_path: Path) -> None:
        """実際の音声ファイルを分割"""
        pytest.skip("Integration test - requires test audio file")
