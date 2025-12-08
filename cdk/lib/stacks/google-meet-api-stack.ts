import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export interface GoogleMeetApiStackProps extends cdk.StackProps {
  environment: string;
  eventHandlerLambda: lambda.IFunction;
}

/**
 * Google Meet 連携用 API スタック
 *
 * 以下のリソースを作成:
 * - API Gateway: Pub/Sub Webhook 受信用
 * - /webhook/meet-events エンドポイント
 */
export class GoogleMeetApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly webhookUrl: string;

  constructor(scope: Construct, id: string, props: GoogleMeetApiStackProps) {
    super(scope, id, props);

    const { environment, eventHandlerLambda } = props;

    // ========================================
    // API Gateway REST API
    // ========================================
    this.api = new apigateway.RestApi(this, "GoogleMeetWebhookApi", {
      restApiName: `ek-transcript-google-meet-webhook-${environment}`,
      description:
        "Google Workspace Events (Pub/Sub) webhook receiver for Meet integration",
      deployOptions: {
        stageName: "prod",
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: environment !== "prod",
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ["POST", "OPTIONS"],
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
          "X-Goog-Channel-ID",
          "X-Goog-Channel-Token",
          "X-Goog-Resource-ID",
          "X-Goog-Resource-URI",
        ],
      },
    });

    // ========================================
    // /webhook resource
    // ========================================
    const webhookResource = this.api.root.addResource("webhook");

    // ========================================
    // /webhook/meet-events resource
    // ========================================
    const meetEventsResource = webhookResource.addResource("meet-events");

    // Lambda integration
    const eventHandlerIntegration = new apigateway.LambdaIntegration(
      eventHandlerLambda,
      {
        proxy: true,
        allowTestInvoke: environment !== "prod",
      }
    );

    // POST method for receiving Pub/Sub push notifications
    meetEventsResource.addMethod("POST", eventHandlerIntegration, {
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Origin": true,
          },
        },
        {
          statusCode: "400",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Origin": true,
          },
        },
        {
          statusCode: "500",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Origin": true,
          },
        },
      ],
    });

    // Store webhook URL
    this.webhookUrl = `${this.api.url}webhook/meet-events`;

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, "WebhookApiEndpoint", {
      value: this.api.url,
      exportName: `${id}-WebhookApiEndpoint`,
      description: "API Gateway endpoint URL",
    });

    new cdk.CfnOutput(this, "WebhookApiId", {
      value: this.api.restApiId,
      exportName: `${id}-WebhookApiId`,
      description: "API Gateway REST API ID",
    });

    new cdk.CfnOutput(this, "MeetEventsWebhookUrl", {
      value: this.webhookUrl,
      exportName: `${id}-MeetEventsWebhookUrl`,
      description:
        "Full webhook URL for Google Pub/Sub push subscription configuration",
    });
  }
}
