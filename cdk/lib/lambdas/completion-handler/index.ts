import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { SFNClient, GetExecutionHistoryCommand } from "@aws-sdk/client-sfn";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sfnClient = new SFNClient({});

interface StepFunctionsEvent {
  source: string;
  "detail-type": string;
  detail: {
    executionArn: string;
    stateMachineArn: string;
    status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "ABORTED";
    input: string;
    output?: string;
  };
}

interface ExecutionInput {
  interview_id?: string;
  user_id?: string;
  video_key?: string;
  bucket?: string;
  recording_name?: string;
}

export async function handler(event: StepFunctionsEvent): Promise<void> {
  const tableName = process.env.TABLE_NAME;
  const recordingsTableName = process.env.RECORDINGS_TABLE;

  if (!tableName) {
    throw new Error("TABLE_NAME environment variable is not set");
  }

  const { executionArn, status, input } = event.detail;

  // Parse execution input to get interview_id
  let executionInput: ExecutionInput = {};
  try {
    executionInput = JSON.parse(input);
  } catch {
    console.warn("Failed to parse execution input:", input);
  }

  const interviewId = executionInput.interview_id;

  if (!interviewId) {
    console.warn("No interview_id found in execution input, skipping update");
    return;
  }

  console.log(`Processing completion event for interview: ${interviewId}, status: ${status}`);

  const now = new Date().toISOString();

  if (status === "SUCCEEDED") {
    // Update to completed status
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { interview_id: interviewId },
        UpdateExpression:
          "SET #status = :status, #progress = :progress, #current_step = :current_step, #updated_at = :updated_at",
        ExpressionAttributeNames: {
          "#status": "status",
          "#progress": "progress",
          "#current_step": "current_step",
          "#updated_at": "updated_at",
        },
        ExpressionAttributeValues: {
          ":status": "completed",
          ":progress": 100,
          ":current_step": "completed",
          ":updated_at": now,
        },
      })
    );

    console.log(`Interview ${interviewId} marked as completed`);

    // Update recordings table if applicable
    if (recordingsTableName && executionInput.user_id) {
      await updateRecordingsTable(
        recordingsTableName,
        executionInput.user_id,
        interviewId,
        "ANALYZED"
      );
    }
  } else if (status === "FAILED" || status === "TIMED_OUT" || status === "ABORTED") {
    // Get error details from execution history
    let errorMessage = "";

    if (status === "TIMED_OUT") {
      errorMessage = "Execution timed out";
    } else if (status === "ABORTED") {
      errorMessage = "Execution was aborted";
    } else {
      try {
        const historyResponse = await sfnClient.send(
          new GetExecutionHistoryCommand({
            executionArn,
            reverseOrder: true,
            maxResults: 10,
          })
        );

        // Find the failure event
        for (const historyEvent of historyResponse.events || []) {
          if (historyEvent.type === "ExecutionFailed") {
            const details = historyEvent.executionFailedEventDetails;
            if (details) {
              errorMessage = `${details.error || "Unknown error"}: ${details.cause || "No details"}`;
            }
            break;
          }
          if (historyEvent.type === "LambdaFunctionFailed") {
            const details = historyEvent.lambdaFunctionFailedEventDetails;
            if (details) {
              errorMessage = `Lambda error: ${details.error || "Unknown"} - ${details.cause || "No details"}`;
            }
            break;
          }
          if (historyEvent.type === "TaskFailed") {
            const details = historyEvent.taskFailedEventDetails;
            if (details) {
              errorMessage = `Task error: ${details.error || "Unknown"} - ${details.cause || "No details"}`;
            }
            break;
          }
        }
      } catch (err) {
        console.error("Failed to get execution history:", err);
        errorMessage = "Failed to retrieve error details";
      }
    }

    if (!errorMessage) {
      errorMessage = `Execution ${status.toLowerCase()}`;
    }

    // Update to failed status with error message
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { interview_id: interviewId },
        UpdateExpression:
          "SET #status = :status, #error_message = :error_message, #updated_at = :updated_at",
        ExpressionAttributeNames: {
          "#status": "status",
          "#error_message": "error_message",
          "#updated_at": "updated_at",
        },
        ExpressionAttributeValues: {
          ":status": "failed",
          ":error_message": errorMessage,
          ":updated_at": now,
        },
      })
    );

    console.log(`Interview ${interviewId} marked as failed: ${errorMessage}`);

    // Update recordings table if applicable
    if (recordingsTableName && executionInput.user_id) {
      await updateRecordingsTable(
        recordingsTableName,
        executionInput.user_id,
        interviewId,
        "ERROR"
      );
    }
  }
}

/**
 * Update recordings table status based on interview_id
 * Searches for recordings with matching interview_id and updates their status
 */
async function updateRecordingsTable(
  tableName: string,
  userId: string,
  interviewId: string,
  newStatus: "ANALYZED" | "ERROR"
): Promise<void> {
  try {
    // Query recordings by user_id to find the one with matching interview_id
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "user_id = :uid",
        FilterExpression: "interview_id = :iid",
        ExpressionAttributeValues: {
          ":uid": userId,
          ":iid": interviewId,
        },
      })
    );

    if (!queryResult.Items || queryResult.Items.length === 0) {
      console.log(`No recording found with interview_id: ${interviewId}`);
      return;
    }

    const now = new Date().toISOString();

    // Update each matching recording
    for (const item of queryResult.Items) {
      const recordingName = item.recording_name as string;
      await docClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            user_id: userId,
            recording_name: recordingName,
          },
          UpdateExpression: "SET #status = :status, updated_at = :updated_at",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":status": newStatus,
            ":updated_at": now,
          },
        })
      );
      console.log(`Recording ${recordingName} marked as ${newStatus}`);
    }
  } catch (err) {
    console.error(`Failed to update recordings table:`, err);
    // Don't throw - this is a non-critical update
  }
}
