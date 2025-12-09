/**
 * disconnectGoogle リゾルバー
 * Google アカウント接続解除（Lambda 経由）
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const userId = ctx.identity.sub;

  return {
    operation: "Invoke",
    payload: {
      action: "revoke_tokens",
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
    return {
      success: false,
      email: null,
      error_message: result.error,
    };
  }

  return {
    success: result.success || true,
    email: null,
    error_message: null,
  };
}
