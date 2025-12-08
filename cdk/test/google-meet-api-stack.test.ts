import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { GoogleMeetApiStack } from "../lib/stacks/google-meet-api-stack";

describe("GoogleMeetApiStack", () => {
  let app: cdk.App;
  let stack: GoogleMeetApiStack;
  let template: Template;

  // Mock resources
  let eventHandlerLambda: lambda.Function;
  let mockStack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();

    // Create mock resources in a separate stack
    mockStack = new cdk.Stack(app, "MockStack", {
      env: {
        account: "123456789012",
        region: "ap-northeast-1",
      },
    });

    eventHandlerLambda = new lambda.Function(mockStack, "MockEventHandler", {
      functionName: "mock-event-handler",
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "index.handler",
      code: lambda.Code.fromInline("def handler(event, context): pass"),
    });

    stack = new GoogleMeetApiStack(app, "TestGoogleMeetApiStack", {
      environment: "test",
      eventHandlerLambda,
      env: {
        account: "123456789012",
        region: "ap-northeast-1",
      },
    });
    template = Template.fromStack(stack);
  });

  describe("API Gateway", () => {
    test("creates REST API", () => {
      template.hasResourceProperties("AWS::ApiGateway::RestApi", {
        Name: Match.stringLikeRegexp("google-meet-webhook"),
      });
    });

    test("creates /webhook resource", () => {
      template.hasResourceProperties("AWS::ApiGateway::Resource", {
        PathPart: "webhook",
      });
    });

    test("creates /webhook/meet-events resource", () => {
      template.hasResourceProperties("AWS::ApiGateway::Resource", {
        PathPart: "meet-events",
      });
    });

    test("creates POST method for webhook", () => {
      template.hasResourceProperties("AWS::ApiGateway::Method", {
        HttpMethod: "POST",
      });
    });

    test("creates deployment stage", () => {
      template.hasResourceProperties("AWS::ApiGateway::Stage", {
        StageName: "prod",
      });
    });
  });

  describe("Lambda Integration", () => {
    test("integrates Event Handler Lambda with API Gateway", () => {
      template.hasResourceProperties("AWS::ApiGateway::Method", {
        HttpMethod: "POST",
        Integration: Match.objectLike({
          Type: "AWS_PROXY",
          IntegrationHttpMethod: "POST",
        }),
      });
    });

    test("grants API Gateway permission to invoke Lambda", () => {
      template.hasResourceProperties("AWS::Lambda::Permission", {
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
      });
    });
  });

  describe("CORS Configuration", () => {
    test("configures CORS headers", () => {
      // OPTIONS method for CORS preflight
      template.hasResourceProperties("AWS::ApiGateway::Method", {
        HttpMethod: "OPTIONS",
      });
    });
  });

  describe("Outputs", () => {
    test("exports API endpoint URL", () => {
      template.hasOutput("WebhookApiEndpoint", {});
    });

    test("exports API ID", () => {
      template.hasOutput("WebhookApiId", {});
    });

    test("exports webhook URL for Pub/Sub", () => {
      template.hasOutput("MeetEventsWebhookUrl", {});
    });
  });
});
