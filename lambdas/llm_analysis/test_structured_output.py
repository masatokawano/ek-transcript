"""
LLMAnalysis Structured Output Tests

HEMS インタビュー構造化出力のテストコード。
第5原則: テストコードを先に作成し、ユーザーストーリーが妥当であることを確認する。
"""

import json
from typing import Optional

import pytest
from pydantic import BaseModel, Field, ValidationError

# Pydantic モデル定義（インタビュー設計書に基づく）


class BasicAttributes(BaseModel):
    """基本属性"""

    age: Optional[int] = Field(None, description="年齢")
    household_size: Optional[int] = Field(None, description="世帯人数")
    residence_type: Optional[str] = Field(
        None, description="住居形態（賃貸マンション/賃貸アパート/分譲/戸建て）"
    )
    area: Optional[str] = Field(None, description="居住エリア")
    residence_years: Optional[float] = Field(None, description="居住年数")
    layout: Optional[str] = Field(None, description="間取り")
    weekday_home_hours: Optional[float] = Field(None, description="平日在宅時間")
    weekend_home_hours: Optional[float] = Field(None, description="休日在宅時間")
    occupation_type: Optional[str] = Field(
        None, description="職業形態（会社員出社/会社員リモート/フリーランス/その他）"
    )


class ElectricityCost(BaseModel):
    """電気代関連"""

    recent_monthly_cost: Optional[int] = Field(None, description="直近の電気代（月額円）")
    summer_peak_cost: Optional[int] = Field(None, description="夏のピーク月電気代（円）")
    winter_peak_cost: Optional[int] = Field(None, description="冬のピーク月電気代（円）")
    power_company: Optional[str] = Field(None, description="電力会社名")
    has_switched_company: Optional[bool] = Field(None, description="電力会社切替経験")
    bill_check_frequency: Optional[str] = Field(
        None, description="明細確認頻度（毎月/数ヶ月に1回/ほぼ見ない）"
    )
    pain_score: Optional[int] = Field(None, ge=0, le=10, description="電気代の痛みスコア（0-10）")
    past_year_actions: Optional[list[str]] = Field(
        None, description="過去1年の電気代削減行動リスト"
    )
    saving_from_switch: Optional[int] = Field(None, description="切替による削減額（円）")
    purchased_items_for_saving: Optional[list[str]] = Field(
        None, description="節電のための購入物リスト"
    )


class DeviceInfo(BaseModel):
    """デバイス関連"""

    devices_used: Optional[list[str]] = Field(
        None, description="利用デバイス（Nature Remo/SwitchBot/AiSEG等）"
    )
    purchase_date: Optional[str] = Field(None, description="購入時期（YYYY-MM形式）")
    purchase_amount: Optional[int] = Field(None, description="購入金額（総額円）")
    purchase_channel: Optional[str] = Field(
        None, description="購入チャネル（Amazon/家電量販店/公式サイト/その他）"
    )
    app_usage_frequency: Optional[str] = Field(
        None, description="アプリ起動頻度（毎日/週数回/月数回/ほぼ開かない）"
    )
    connected_devices_count: Optional[int] = Field(None, description="連携家電数")
    automation_count: Optional[int] = Field(None, description="オートメーション設定数")
    most_used_feature: Optional[str] = Field(None, description="最頻使用機能")
    satisfaction_points: Optional[list[str]] = Field(None, description="満足ポイント（トップ3）")
    dissatisfaction_points: Optional[list[str]] = Field(None, description="不満ポイント（トップ3）")
    unused_features: Optional[list[str]] = Field(None, description="使わなくなった機能")
    initial_setup_time_minutes: Optional[int] = Field(None, description="初期設定時間（分）")
    replacement_intention: Optional[str] = Field(
        None, description="故障時買替意向（即買い直す/検討する/買い直さない）"
    )


class Scoring(BaseModel):
    """スコアリング"""

    electricity_interest_score: Optional[int] = Field(
        None, ge=0, le=10, description="電気代関心度スコア（0-10）"
    )
    engagement_score: Optional[int] = Field(
        None, ge=0, le=10, description="エンゲージメントスコア（0-10）"
    )
    crowdfunding_fit_score: Optional[int] = Field(
        None, ge=0, le=10, description="クラファン適合スコア（0-10）"
    )
    total_score: Optional[int] = Field(None, ge=0, le=30, description="総合スコア（0-30）")
    segment: Optional[str] = Field(
        None, description="セグメント（A:省エネ意識高/B:ガジェット好き/C:便利さ追求/D:ライト層）"
    )


class Insights(BaseModel):
    """重要インサイト"""

    most_impressive_quote: Optional[str] = Field(None, description="最も印象的だった発言（原文）")
    unexpected_findings: Optional[str] = Field(None, description="予想と違った点")
    non_negotiable_value: Optional[str] = Field(None, description="絶対に譲れない価値")
    reason_not_to_pay: Optional[str] = Field(None, description="絶対に払わない理由")
    suggestion_for_500_supporters: Optional[str] = Field(
        None, description="500人支援者獲得に向けた示唆"
    )


class CrowdfundingExperience(BaseModel):
    """クラウドファンディング経験"""

    monthly_subscription_total: Optional[int] = Field(None, description="月額サブスク総額（円）")
    has_crowdfunding_experience: Optional[bool] = Field(None, description="クラファン支援経験")
    crowdfunding_count: Optional[int] = Field(None, description="クラファン支援回数")
    average_support_amount: Optional[int] = Field(None, description="1回あたり平均支援額（円）")
    uses_point_sites: Optional[str] = Field(
        None, description="ポイントサイト利用（よく使う/たまに使う/使わない）"
    )
    ad_resistance: Optional[str] = Field(None, description="広告への抵抗感（高/中/低）")


class FamilyAndBarriers(BaseModel):
    """家族利用と導入障壁"""

    family_usage: Optional[bool] = Field(None, description="家族利用状況")
    non_usage_reason: Optional[str] = Field(None, description="非利用理由")
    rental_barriers: Optional[list[str]] = Field(
        None, description="賃貸での設置障壁（工事/配線/Wi-Fi/設置場所）"
    )
    abandoned_ideas: Optional[str] = Field(None, description="賃貸で諦めたアイデア")
    has_recommended: Optional[bool] = Field(None, description="他者への推奨経験")
    nps_score: Optional[int] = Field(None, ge=0, le=10, description="NPS（0-10）")


class HEMSInterviewData(BaseModel):
    """HEMS インタビューデータ（構造化出力のルートモデル）"""

    interview_id: Optional[str] = Field(None, description="インタビュー番号")
    basic_attributes: BasicAttributes = Field(default_factory=BasicAttributes)
    electricity_cost: ElectricityCost = Field(default_factory=ElectricityCost)
    device_info: DeviceInfo = Field(default_factory=DeviceInfo)
    crowdfunding_experience: CrowdfundingExperience = Field(
        default_factory=CrowdfundingExperience
    )
    family_and_barriers: FamilyAndBarriers = Field(default_factory=FamilyAndBarriers)
    scoring: Scoring = Field(default_factory=Scoring)
    insights: Insights = Field(default_factory=Insights)


class TestPydanticModels:
    """Pydantic モデルの単体テスト"""

    def test_basic_attributes_valid(self):
        """基本属性の正常値テスト"""
        data = BasicAttributes(
            age=35,
            household_size=2,
            residence_type="賃貸マンション",
            area="渋谷区",
            residence_years=3.5,
            layout="2LDK",
            weekday_home_hours=8,
            weekend_home_hours=16,
            occupation_type="会社員リモート",
        )
        assert data.age == 35
        assert data.household_size == 2
        assert data.residence_type == "賃貸マンション"

    def test_electricity_cost_pain_score_bounds(self):
        """電気代痛みスコアの境界値テスト"""
        # 正常範囲
        data = ElectricityCost(pain_score=5)
        assert data.pain_score == 5

        # 境界値
        data = ElectricityCost(pain_score=0)
        assert data.pain_score == 0

        data = ElectricityCost(pain_score=10)
        assert data.pain_score == 10

        # 範囲外はエラー
        with pytest.raises(ValidationError):
            ElectricityCost(pain_score=11)

        with pytest.raises(ValidationError):
            ElectricityCost(pain_score=-1)

    def test_scoring_bounds(self):
        """スコアリングの境界値テスト"""
        data = Scoring(
            electricity_interest_score=7,
            engagement_score=8,
            crowdfunding_fit_score=6,
            total_score=21,
            segment="A:省エネ意識高",
        )
        assert data.total_score == 21

        # total_score は 0-30
        with pytest.raises(ValidationError):
            Scoring(total_score=31)

    def test_hems_interview_data_full(self):
        """HEMSInterviewData のフル構造テスト"""
        data = HEMSInterviewData(
            interview_id="#001",
            basic_attributes=BasicAttributes(age=40, household_size=3),
            electricity_cost=ElectricityCost(
                recent_monthly_cost=12000,
                pain_score=7,
                past_year_actions=["電力会社切替", "LED照明導入"],
            ),
            device_info=DeviceInfo(
                devices_used=["Nature Remo", "SwitchBot"],
                connected_devices_count=8,
                automation_count=5,
            ),
            scoring=Scoring(
                electricity_interest_score=8,
                engagement_score=7,
                crowdfunding_fit_score=6,
                total_score=21,
                segment="A:省エネ意識高",
            ),
        )
        assert data.interview_id == "#001"
        assert data.basic_attributes.age == 40
        assert data.electricity_cost.pain_score == 7
        assert len(data.device_info.devices_used) == 2
        assert data.scoring.total_score == 21

    def test_hems_interview_data_partial(self):
        """HEMSInterviewData の部分データテスト（Optional フィールドのテスト）"""
        # 最小限のデータでもエラーにならない
        data = HEMSInterviewData()
        assert data.interview_id is None
        assert data.basic_attributes.age is None

    def test_json_serialization(self):
        """JSON シリアライズ・デシリアライズテスト"""
        data = HEMSInterviewData(
            interview_id="#002",
            basic_attributes=BasicAttributes(age=28),
            scoring=Scoring(total_score=15),
        )

        # シリアライズ
        json_str = data.model_dump_json()
        assert isinstance(json_str, str)

        # デシリアライズ
        parsed = HEMSInterviewData.model_validate_json(json_str)
        assert parsed.interview_id == "#002"
        assert parsed.basic_attributes.age == 28

    def test_json_schema_generation(self):
        """JSON Schema 生成テスト（OpenAI Structured Outputs 用）"""
        schema = HEMSInterviewData.model_json_schema()
        assert "properties" in schema
        assert "interview_id" in schema["properties"]
        assert "basic_attributes" in schema["properties"]


class TestStructuredOutputIntegration:
    """Structured Output 統合テスト（モックなし、スキーマ検証のみ）"""

    def test_openai_compatible_schema(self):
        """OpenAI Structured Outputs 互換スキーマテスト"""
        schema = HEMSInterviewData.model_json_schema()

        # OpenAI 要件: type が object
        assert schema.get("type") == "object"

        # OpenAI 要件: properties が存在
        assert "properties" in schema

        # ネストしたモデルも検証
        props = schema["properties"]
        assert "basic_attributes" in props
        assert "electricity_cost" in props
        assert "scoring" in props

    def test_sample_transcript_extraction(self):
        """サンプル文字起こしからのデータ抽出テスト（期待値定義）"""
        # 実際の文字起こしサンプル（テスト用）
        sample_transcript = """
        [インタビュアー] 今日はお時間いただきありがとうございます。まず簡単に、今のお住まいについて教えてください。
        [回答者] はい、渋谷区に住んでいて、3年くらいになります。2LDKの賃貸マンションです。
        [インタビュアー] お仕事は普段どんな感じですか？
        [回答者] 会社員で、週3日くらいリモートワークしています。平日は8時間くらい家にいます。
        [インタビュアー] 直近の電気代、だいたいいくらくらいですか？
        [回答者] 先月は1万2千円くらいでした。夏は1万8千円くらいまで行きましたね。
        [インタビュアー] 電気代の痛みを10点満点で言うとどのくらいですか？
        [回答者] 7点くらいですかね。結構気になっています。
        [インタビュアー] Nature Remoを使っているとのことですが、いつ頃買いましたか？
        [回答者] 2年前くらいです。Amazonで8千円くらいで買いました。
        [インタビュアー] アプリはどのくらいの頻度で開きますか？
        [回答者] 毎日開いています。オートメーションは5個くらい設定しています。
        [インタビュアー] クラウドファンディングで支援したことはありますか？
        [回答者] はい、3回くらいあります。平均1万5千円くらいですかね。ガジェット系が多いです。
        """

        # 期待される抽出結果
        expected = HEMSInterviewData(
            basic_attributes=BasicAttributes(
                residence_type="賃貸マンション",
                area="渋谷区",
                residence_years=3.0,
                layout="2LDK",
                weekday_home_hours=8.0,
                occupation_type="会社員リモート",
            ),
            electricity_cost=ElectricityCost(
                recent_monthly_cost=12000,
                summer_peak_cost=18000,
                pain_score=7,
            ),
            device_info=DeviceInfo(
                devices_used=["Nature Remo"],
                purchase_amount=8000,
                purchase_channel="Amazon",
                app_usage_frequency="毎日",
                automation_count=5,
            ),
            crowdfunding_experience=CrowdfundingExperience(
                has_crowdfunding_experience=True,
                crowdfunding_count=3,
                average_support_amount=15000,
            ),
        )

        # Pydantic モデルが正しく構築できることを確認
        assert expected.electricity_cost.pain_score == 7
        assert expected.crowdfunding_experience.crowdfunding_count == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
