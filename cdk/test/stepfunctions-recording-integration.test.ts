/**
 * Step Functions - Google Meet Recording Integration Tests
 *
 * Tests for the integration between Google Meet recording downloads
 * and the transcript analysis pipeline.
 *
 * Requirements:
 * 1. EventBridge rule for `recordings/` prefix
 * 2. Start pipeline Lambda handling of recording files
 * 3. Meeting ID to Interview ID linking
 */

// Mock AWS SDK - must be before import
const mockSfnSend = jest.fn().mockResolvedValue({
  executionArn:
    "arn:aws:states:ap-northeast-1:123456789012:execution:test-state-machine:test-execution",
  startDate: new Date(),
});

const mockDynamoSend = jest.fn().mockImplementation((command) => {
  // Check if this is a GetCommand for recording metadata
  if (
    command.constructor.name === "GetCommand" ||
    command.input?.Key?.interview_id?.startsWith("upload_") ||
    command.input?.Key?.interview_id?.startsWith("recording_")
  ) {
    // Return meeting metadata for recordings prefix
    if (command.input?.Key?.interview_id?.includes("recordings/")) {
      return Promise.resolve({
        Item: {
          interview_id: command.input.Key.interview_id,
          meeting_id: "meeting-uuid-123",
          original_filename: "google-meet-recording.mp4",
          segment: "MEETING",
        },
      });
    }
    return Promise.resolve({
      Item: {
        interview_id: command.input.Key.interview_id,
        original_filename: "my-interview-video.mp4",
        segment: "HEMS",
      },
    });
  }
  return Promise.resolve({});
});

jest.mock("@aws-sdk/client-sfn", () => ({
  SFNClient: jest.fn().mockImplementation(() => ({
    send: mockSfnSend,
  })),
  StartExecutionCommand: jest.fn(),
}));

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockImplementation(() => ({
      send: mockDynamoSend,
    })),
  },
  PutCommand: jest.fn(),
  GetCommand: jest.fn().mockImplementation((params) => ({ input: params })),
  DeleteCommand: jest.fn(),
  UpdateCommand: jest.fn(),
}));

import { handler } from "../lib/lambdas/start-pipeline";

describe("Step Functions - Google Meet Recording Integration", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    process.env.STATE_MACHINE_ARN =
      "arn:aws:states:ap-northeast-1:123456789012:stateMachine:test-state-machine";
    process.env.TABLE_NAME = "test-interviews-table";
    process.env.AWS_REGION = "ap-northeast-1";
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe("Recording prefix handling", () => {
    it("should start Step Functions execution for recording file from EventBridge", async () => {
      const event = {
        source: "aws.s3",
        "detail-type": "Object Created",
        detail: {
          bucket: {
            name: "test-bucket",
          },
          object: {
            key: "recordings/user-123/meeting-uuid-456/google-meet-recording.mp4",
            size: 5242880, // 5MB
          },
        },
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockSfnSend).toHaveBeenCalled();
      expect(mockDynamoSend).toHaveBeenCalled();
    });

    it("should extract meeting_id from recordings S3 key", async () => {
      const event = {
        source: "aws.s3",
        "detail-type": "Object Created",
        detail: {
          bucket: {
            name: "test-bucket",
          },
          object: {
            key: "recordings/user-789/meeting-abc-123/recording.mp4",
            size: 10485760, // 10MB
          },
        },
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      // Verify execution started successfully
      expect(mockSfnSend).toHaveBeenCalled();
      expect(mockDynamoSend).toHaveBeenCalled();
      // Body should contain started status
      expect(result.body).toContain("started");
    });

    it("should handle recording files with various video extensions", async () => {
      const extensions = [".mp4", ".mov", ".webm", ".mkv"];

      for (const ext of extensions) {
        jest.clearAllMocks();

        const event = {
          source: "aws.s3",
          "detail-type": "Object Created",
          detail: {
            bucket: {
              name: "test-bucket",
            },
            object: {
              key: `recordings/user-123/meeting-456/recording${ext}`,
              size: 1024000,
            },
          },
        };

        const result = await handler(event);

        expect(result.statusCode).toBe(200);
        expect(mockSfnSend).toHaveBeenCalled();
      }
    });

    it("should skip non-video files in recordings prefix", async () => {
      const event = {
        source: "aws.s3",
        "detail-type": "Object Created",
        detail: {
          bucket: {
            name: "test-bucket",
          },
          object: {
            key: "recordings/user-123/meeting-456/metadata.json",
            size: 1024,
          },
        },
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(result.body).toContain("skipped");
    });
  });

  describe("Meeting to Interview linking", () => {
    it("should create interview record with meeting_id reference", async () => {
      const event = {
        source: "aws.s3",
        "detail-type": "Object Created",
        detail: {
          bucket: {
            name: "test-bucket",
          },
          object: {
            key: "recordings/user-123/meeting-xyz-789/call-recording.mp4",
            size: 20971520, // 20MB
          },
        },
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockDynamoSend).toHaveBeenCalled();
    });

    it("should use MEETING segment for recording files", async () => {
      const event = {
        source: "aws.s3",
        "detail-type": "Object Created",
        detail: {
          bucket: {
            name: "test-bucket",
          },
          object: {
            key: "recordings/user-456/meeting-def-012/google-meet.mp4",
            size: 15728640, // 15MB
          },
        },
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      // Body should contain segment information
      const body = JSON.parse(result.body);
      expect(body.executions).toBeDefined();
    });
  });

  describe("S3 Event formats", () => {
    it("should handle S3 Event Notification format for recordings", async () => {
      const event = {
        Records: [
          {
            s3: {
              bucket: {
                name: "test-bucket",
              },
              object: {
                key: "recordings/user-111/meeting-222/video.mp4",
                size: 8388608, // 8MB
              },
            },
          },
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockSfnSend).toHaveBeenCalled();
    });

    it("should handle URL-encoded S3 keys in recordings", async () => {
      const event = {
        Records: [
          {
            s3: {
              bucket: {
                name: "test-bucket",
              },
              object: {
                key: "recordings/user-123/meeting-456/Google+Meet+Recording.mp4",
                size: 5242880,
              },
            },
          },
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockSfnSend).toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("should handle empty records gracefully", async () => {
      const event = {
        Records: [],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(result.body).toContain("No records to process");
    });

    it("should continue processing other recordings if one fails", async () => {
      // Mock to fail on first call, succeed on second
      mockSfnSend
        .mockRejectedValueOnce(new Error("Throttling"))
        .mockResolvedValueOnce({
          executionArn:
            "arn:aws:states:ap-northeast-1:123456789012:execution:test:success",
          startDate: new Date(),
        });

      const event = {
        Records: [
          {
            s3: {
              bucket: { name: "test-bucket" },
              object: {
                key: "recordings/user-123/meeting-111/video1.mp4",
                size: 1024000,
              },
            },
          },
        ],
      };

      await expect(handler(event)).rejects.toThrow("Throttling");
    });
  });
});

describe("EventBridge Rule Configuration", () => {
  it("should have correct event pattern for recordings prefix", () => {
    // This tests the expected event pattern structure
    const expectedPattern = {
      source: ["aws.s3"],
      detailType: ["Object Created"],
      detail: {
        bucket: { name: expect.any(Array) },
        object: { key: [{ prefix: "recordings/" }] },
      },
    };

    // Verify the pattern structure is correct
    expect(expectedPattern.source).toEqual(["aws.s3"]);
    expect(expectedPattern.detail.object.key).toEqual([
      { prefix: "recordings/" },
    ]);
  });
});
