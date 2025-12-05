"""
pytest 共通設定とフィクスチャ
"""

import os
import sys
from pathlib import Path
from typing import Generator

import pytest

# lambdas ディレクトリをパスに追加
LAMBDAS_DIR = Path(__file__).parent.parent / "lambdas"
for lambda_dir in LAMBDAS_DIR.iterdir():
    if lambda_dir.is_dir() and not lambda_dir.name.startswith("_"):
        sys.path.insert(0, str(lambda_dir))


@pytest.fixture(autouse=True)
def set_env_vars() -> Generator[None, None, None]:
    """テスト用の環境変数を設定"""
    env_vars = {
        "INPUT_BUCKET": "test-input-bucket",
        "OUTPUT_BUCKET": "test-output-bucket",
        "WHISPER_MODEL": "tiny",  # テスト用に軽量モデル
        "OPENAI_MODEL": "gpt-5-mini",
        "AWS_DEFAULT_REGION": "ap-northeast-1",
    }

    original_env = {}
    for key, value in env_vars.items():
        original_env[key] = os.environ.get(key)
        os.environ[key] = value

    yield

    # 環境変数を元に戻す
    for key, original_value in original_env.items():
        if original_value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = original_value


@pytest.fixture
def sample_transcript() -> list[dict]:
    """サンプルの文字起こしデータ"""
    return [
        {
            "speaker": "SPEAKER_00",
            "start": 0.0,
            "end": 5.0,
            "text": "本日の会議を始めます。",
        },
        {
            "speaker": "SPEAKER_01",
            "start": 5.5,
            "end": 10.0,
            "text": "はい、よろしくお願いします。",
        },
        {
            "speaker": "SPEAKER_00",
            "start": 10.5,
            "end": 20.0,
            "text": "まず、先週のアクションアイテムの確認から始めましょう。",
        },
    ]


@pytest.fixture
def sample_segments() -> list[dict]:
    """サンプルのセグメントデータ"""
    return [
        {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00"},
        {"start": 5.5, "end": 10.0, "speaker": "SPEAKER_01"},
        {"start": 10.5, "end": 20.0, "speaker": "SPEAKER_00"},
    ]
