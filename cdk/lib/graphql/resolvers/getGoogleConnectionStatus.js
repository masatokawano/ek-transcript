/**
 * getGoogleConnectionStatus リゾルバー
 * Google 接続状態を確認（Lambda 経由）
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const userId = ctx.identity.sub;

  return {
    operation: "Invoke",
    payload: {
      action: "check_status",
      user_id: userId,
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  const result = ctx.result;

  if (result.error) {
    // トークンが見つからない場合は未接続として扱う
    return {
      connected: false,
      email: null,
      scopes: [],
      expires_at: null,
      is_expired: null,
    };
  }

  return {
    connected: result.connected || false,
    email: result.email || null,
    scopes: result.scopes || [],
    expires_at: result.expires_at || null,
    is_expired: result.is_expired || null,
  };
}
