"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { graphqlClient } from "../../../../lib/graphql/client";
import { CONNECT_GOOGLE } from "../../../../lib/graphql/mutations";
import type { ConnectGoogleResponse } from "../../../../lib/graphql/types";

type CallbackStatus = "processing" | "success" | "error";

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");

      // エラーチェック
      if (error) {
        setStatus("error");
        setErrorMessage(
          error === "access_denied"
            ? "アクセスが拒否されました"
            : `エラー: ${error}`
        );
        return;
      }

      if (!code) {
        setStatus("error");
        setErrorMessage("認証コードが見つかりません");
        return;
      }

      // CSRF 対策: state の検証
      const savedState = localStorage.getItem("google_oauth_state");
      if (!state || state !== savedState) {
        setStatus("error");
        setErrorMessage("セキュリティ検証に失敗しました。もう一度お試しください。");
        return;
      }

      // state を削除
      localStorage.removeItem("google_oauth_state");

      try {
        const redirectUri = `${window.location.origin}/auth/google/callback`;

        const response = await graphqlClient.mutate<ConnectGoogleResponse>(
          CONNECT_GOOGLE,
          {
            input: {
              code,
              redirect_uri: redirectUri,
              state,
            },
          }
        );

        if (response.connectGoogle.success) {
          setStatus("success");
          // 2秒後にダッシュボードにリダイレクト
          setTimeout(() => {
            router.push("/dashboard");
          }, 2000);
        } else {
          setStatus("error");
          setErrorMessage(
            response.connectGoogle.error_message || "接続に失敗しました"
          );
        }
      } catch (err) {
        console.error("Failed to connect Google:", err);
        setStatus("error");
        setErrorMessage("Google アカウントの接続に失敗しました");
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
      {status === "processing" && (
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Google アカウントを接続中...
          </h1>
          <p className="text-gray-600">しばらくお待ちください</p>
        </div>
      )}

      {status === "success" && (
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            接続が完了しました
          </h1>
          <p className="text-gray-600 mb-4">
            Google アカウントが正常に接続されました
          </p>
          <p className="text-sm text-gray-500">
            ダッシュボードにリダイレクトします...
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            接続に失敗しました
          </h1>
          <p className="text-red-600 mb-4">{errorMessage}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            ダッシュボードに戻る
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          読み込み中...
        </h1>
      </div>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Suspense fallback={<LoadingFallback />}>
        <GoogleCallbackContent />
      </Suspense>
    </div>
  );
}
