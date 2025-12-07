import { ResourcesConfig } from "aws-amplify";

export const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: "ap-northeast-1_y7WmeLyxS",
      userPoolClientId: "3lrm15d2u4ivdpegslcpp4isac",
      signUpVerificationMethod: "code",
      loginWith: {
        email: true,
      },
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
      },
    },
  },
  API: {
    GraphQL: {
      endpoint:
        "https://l6bhqtwnbbgd7aldhuvl6anjou.appsync-api.ap-northeast-1.amazonaws.com/graphql",
      region: "ap-northeast-1",
      defaultAuthMode: "userPool",
    },
  },
};

export default amplifyConfig;
