/**
 * syncMeetRecordings リゾルバー
 * Google Meet REST API v2 から録画を同期（Lambda 経由）
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const input = ctx.args.input || {};
  const userId = ctx.identity.sub;

  return {
    operation: "Invoke",
    payload: {
      action: "sync_meet_recordings",
      user_id: userId,
      days_back: input.days_back || 30,
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}
