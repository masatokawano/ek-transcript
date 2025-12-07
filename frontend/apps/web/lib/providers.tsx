"use client";

import { AmplifyProvider } from "./amplify-provider";
import { AuthProvider } from "./auth-context";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <AmplifyProvider>
      <AuthProvider>{children}</AuthProvider>
    </AmplifyProvider>
  );
}
