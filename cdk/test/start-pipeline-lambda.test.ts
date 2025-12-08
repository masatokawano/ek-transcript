// Mock AWS SDK - must be before import
const mockSfnSend = jest.fn().mockResolvedValue({
  executionArn: "arn:aws:states:ap-northeast-1:123456789012:execution:test-state-machine:test-execution",
  startDate: new Date(),
});

const mockDynamoSend = jest.fn().mockImplementation((command) => {
  // Check if this is a GetCommand for upload metadata
  if (command.constructor.name === 'GetCommand' || command.input?.Key?.interview_id?.startsWith('upload_')) {
    return Promise.resolve({
      Item: {
        interview_id: "upload_uploads/user-123/2025-12-08/HEMS/test.mp4",
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
}));

import { handler } from "../lib/lambdas/start-pipeline";

describe("Start Pipeline Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    process.env.STATE_MACHINE_ARN = "arn:aws:states:ap-northeast-1:123456789012:stateMachine:test-state-machine";
    process.env.TABLE_NAME = "test-interviews-table";
    process.env.AWS_REGION = "ap-northeast-1";
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("should start Step Functions execution for valid S3 event", async () => {
    const event = {
      Records: [
        {
          s3: {
            bucket: {
              name: "test-bucket",
            },
            object: {
              key: "uploads/user-123/2025-12-07/HEMS/video.mp4",
              size: 1024000,
            },
          },
        },
      ],
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(mockSfnSend).toHaveBeenCalled();
    expect(mockDynamoSend).toHaveBeenCalled();
  });

  it("should extract user_id and segment from S3 key", async () => {
    const event = {
      Records: [
        {
          s3: {
            bucket: {
              name: "test-bucket",
            },
            object: {
              key: "uploads/user-456/2025-12-07/EV/interview.mp4",
              size: 2048000,
            },
          },
        },
      ],
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("user-456");
    expect(result.body).toContain("EV");
  });

  it("should read original filename from DynamoDB upload metadata", async () => {
    const event = {
      Records: [
        {
          s3: {
            bucket: {
              name: "test-bucket",
            },
            object: {
              key: "uploads/user-123/2025-12-08/HEMS/uuid-based-name.mp4",
              size: 1024000,
            },
          },
        },
      ],
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    // DynamoDB should be called for GetCommand (metadata) and PutCommand (interview record)
    expect(mockDynamoSend).toHaveBeenCalled();
  });

  it("should skip non-video files", async () => {
    const event = {
      Records: [
        {
          s3: {
            bucket: {
              name: "test-bucket",
            },
            object: {
              key: "uploads/user-123/2025-12-07/HEMS/document.txt",
              size: 1024,
            },
          },
        },
      ],
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("skipped");
  });

  it("should handle missing STATE_MACHINE_ARN", async () => {
    delete process.env.STATE_MACHINE_ARN;

    const event = {
      Records: [
        {
          s3: {
            bucket: {
              name: "test-bucket",
            },
            object: {
              key: "uploads/user-123/2025-12-07/HEMS/video.mp4",
              size: 1024000,
            },
          },
        },
      ],
    };

    await expect(handler(event)).rejects.toThrow("STATE_MACHINE_ARN");
  });

  it("should handle EventBridge S3 event format", async () => {
    const event = {
      source: "aws.s3",
      "detail-type": "Object Created",
      detail: {
        bucket: {
          name: "test-bucket",
        },
        object: {
          key: "uploads/user-789/2025-12-08/HEMS/video.mp4",
          size: 3072000,
        },
      },
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(mockSfnSend).toHaveBeenCalled();
    expect(mockDynamoSend).toHaveBeenCalled();
    expect(result.body).toContain("user-789");
  });

  it("should skip non-video files in EventBridge format", async () => {
    const event = {
      source: "aws.s3",
      "detail-type": "Object Created",
      detail: {
        bucket: {
          name: "test-bucket",
        },
        object: {
          key: "uploads/user-123/2025-12-08/HEMS/document.pdf",
          size: 1024,
        },
      },
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("skipped");
  });
});
