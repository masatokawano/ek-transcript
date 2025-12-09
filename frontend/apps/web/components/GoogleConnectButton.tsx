"use client";

import { useState, useEffect, useCallback } from "react";
import { graphqlClient } from "../lib/graphql/client";
import {
  GET_GOOGLE_AUTH_URL,
  GET_GOOGLE_CONNECTION_STATUS,
} from "../lib/graphql/queries";
import { DISCONNECT_GOOGLE } from "../lib/graphql/mutations";
import type {
  GetGoogleAuthUrlResponse,
  GetGoogleConnectionStatusResponse,
  DisconnectGoogleResponse,
  GoogleConnectionStatus,
} from "../lib/graphql/types";

interface GoogleConnectButtonProps {
  onConnectionChange?: (connected: boolean) => void;
}

const styles = {
  container: {
    padding: "12px 16px",
    backgroundColor: "#f9fafb",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  } as React.CSSProperties,
  flexRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  } as React.CSSProperties,
  leftSection: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  } as React.CSSProperties,
  googleIcon: {
    width: "20px",
    height: "20px",
    flexShrink: 0,
  } as React.CSSProperties,
  textSection: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  } as React.CSSProperties,
  title: {
    fontSize: "14px",
    fontWeight: 500,
    color: "#111827",
    margin: 0,
  } as React.CSSProperties,
  statusConnected: {
    fontSize: "12px",
    color: "#059669",
    margin: 0,
  } as React.CSSProperties,
  statusDisconnected: {
    fontSize: "12px",
    color: "#6b7280",
    margin: 0,
  } as React.CSSProperties,
  connectButton: {
    padding: "6px 12px",
    fontSize: "13px",
    fontWeight: 500,
    color: "#ffffff",
    backgroundColor: "#2563eb",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  } as React.CSSProperties,
  disconnectButton: {
    padding: "6px 12px",
    fontSize: "13px",
    fontWeight: 500,
    color: "#dc2626",
    backgroundColor: "#ffffff",
    border: "1px solid #fca5a5",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  } as React.CSSProperties,
  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed",
  } as React.CSSProperties,
  errorBox: {
    marginTop: "8px",
    padding: "8px 12px",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "6px",
  } as React.CSSProperties,
  errorText: {
    fontSize: "12px",
    color: "#dc2626",
    margin: 0,
  } as React.CSSProperties,
  warningBox: {
    marginTop: "8px",
    padding: "8px 12px",
    backgroundColor: "#fefce8",
    border: "1px solid #fde047",
    borderRadius: "6px",
  } as React.CSSProperties,
  warningText: {
    fontSize: "12px",
    color: "#a16207",
    margin: 0,
  } as React.CSSProperties,
  loadingContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 16px",
    backgroundColor: "#f9fafb",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  } as React.CSSProperties,
  spinner: {
    width: "16px",
    height: "16px",
    border: "2px solid #e5e7eb",
    borderTop: "2px solid #2563eb",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  } as React.CSSProperties,
  loadingText: {
    fontSize: "13px",
    color: "#6b7280",
  } as React.CSSProperties,
};

export function GoogleConnectButton({
  onConnectionChange,
}: GoogleConnectButtonProps) {
  const [status, setStatus] = useState<GoogleConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkConnectionStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await graphqlClient.query<GetGoogleConnectionStatusResponse>(
        GET_GOOGLE_CONNECTION_STATUS
      );
      setStatus(response.getGoogleConnectionStatus);
      onConnectionChange?.(response.getGoogleConnectionStatus.connected);
    } catch (err) {
      console.error("Failed to check Google connection status:", err);
      setStatus({ connected: false });
      onConnectionChange?.(false);
    } finally {
      setLoading(false);
    }
  }, [onConnectionChange]);

  useEffect(() => {
    checkConnectionStatus();
  }, [checkConnectionStatus]);

  const handleConnect = async () => {
    try {
      setActionLoading(true);
      setError(null);

      const redirectUri = `${window.location.origin}/auth/google/callback`;

      const response = await graphqlClient.query<GetGoogleAuthUrlResponse>(
        GET_GOOGLE_AUTH_URL,
        { redirect_uri: redirectUri }
      );

      // state を localStorage に保存（CSRF 対策）
      localStorage.setItem("google_oauth_state", response.getGoogleAuthUrl.state);

      // Google OAuth ページにリダイレクト
      window.location.href = response.getGoogleAuthUrl.auth_url;
    } catch (err) {
      console.error("Failed to get Google auth URL:", err);
      setError("Google 認証 URL の取得に失敗しました");
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Google アカウントの接続を解除しますか？")) {
      return;
    }

    try {
      setActionLoading(true);
      setError(null);

      const response = await graphqlClient.mutate<DisconnectGoogleResponse>(
        DISCONNECT_GOOGLE
      );

      if (response.disconnectGoogle.success) {
        setStatus({ connected: false });
        onConnectionChange?.(false);
      } else {
        setError(response.disconnectGoogle.error_message || "接続解除に失敗しました");
      }
    } catch (err) {
      console.error("Failed to disconnect Google:", err);
      setError("接続解除に失敗しました");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <span style={styles.loadingText}>読み込み中...</span>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.flexRow}>
        <div style={styles.leftSection}>
          <svg
            style={styles.googleIcon}
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>

          <div style={styles.textSection}>
            <h3 style={styles.title}>Google アカウント</h3>
            {status?.connected ? (
              <p style={styles.statusConnected}>
                接続済み: {status.email}
              </p>
            ) : (
              <p style={styles.statusDisconnected}>未接続</p>
            )}
          </div>
        </div>

        <div>
          {status?.connected ? (
            <button
              onClick={handleDisconnect}
              disabled={actionLoading}
              style={{
                ...styles.disconnectButton,
                ...(actionLoading ? styles.disabledButton : {}),
              }}
            >
              {actionLoading ? "処理中..." : "接続解除"}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={actionLoading}
              style={{
                ...styles.connectButton,
                ...(actionLoading ? styles.disabledButton : {}),
              }}
            >
              {actionLoading ? "処理中..." : "Google で接続"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={styles.errorBox}>
          <p style={styles.errorText}>{error}</p>
        </div>
      )}

      {status?.connected && status.is_expired && (
        <div style={styles.warningBox}>
          <p style={styles.warningText}>
            トークンが期限切れです。再接続してください。
          </p>
        </div>
      )}
    </div>
  );
}
