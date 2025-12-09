/**
 * analyzeRecording リゾルバー
 * Drive から録画をダウンロードして分析を開始（Lambda 経由）
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const { drive_file_id, recording_name } = ctx.args;
  const userId = ctx.identity.sub;

  return {
    operation: "Invoke",
    payload: {
      action: "analyze_recording",
      user_id: userId,
      drive_file_id: drive_file_id,
      recording_name: recording_name,
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}
