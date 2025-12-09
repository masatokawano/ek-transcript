/**
 * connectGoogle リゾルバー
 * Google OAuth 認証コードをトークンに交換して保存（Lambda 経由）
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const input = ctx.args.input;
  const userId = ctx.identity.sub;
  const email = ctx.identity.claims?.email || "";

  return {
    operation: "Invoke",
    payload: {
      action: "exchange_code",
      user_id: userId,
      email: email,
      code: input.code,
      redirect_uri: input.redirect_uri,
      state: input.state,
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
    email: result.email || ctx.identity.claims?.email || null,
    error_message: null,
  };
}
