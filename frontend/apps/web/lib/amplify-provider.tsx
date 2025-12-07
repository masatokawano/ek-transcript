"use client";

import { Amplify } from "aws-amplify";
import { amplifyConfig } from "./amplify-config";

// Configure Amplify on the client side
Amplify.configure(amplifyConfig, { ssr: true });

interface AmplifyProviderProps {
  children: React.ReactNode;
}

export function AmplifyProvider({ children }: AmplifyProviderProps) {
  return <>{children}</>;
}
