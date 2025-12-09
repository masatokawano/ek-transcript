/**
 * getGoogleAuthUrl リゾルバー
 * Google OAuth 認証 URL を取得（Lambda 経由）
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const redirectUri = ctx.args.redirect_uri;
  const userId = ctx.identity.sub;

  // CSRF 防止用の state を生成
  const state = util.autoId();

  return {
    operation: "Invoke",
    payload: {
      action: "get_auth_url",
      user_id: userId,
      redirect_uri: redirectUri,
      state: state,
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  const result = ctx.result;

  if (result.error) {
    util.error(result.error, "GoogleAuthError");
  }

  return {
    auth_url: result.auth_url,
    state: ctx.args.state || result.state || util.autoId(),
  };
}
