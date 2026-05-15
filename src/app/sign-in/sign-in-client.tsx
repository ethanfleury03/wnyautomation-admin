'use client';

import { SignIn } from '@clerk/nextjs';
import { AuthMarketingShell } from '@/components/auth/auth-marketing-shell';
import { clerkMarketingAppearance } from '@/components/auth/clerk-marketing-appearance';

export function SignInClient({ redirectTo }: { redirectTo: string }) {
  return (
    <AuthMarketingShell subtitle="Sign in to continue">
      <SignIn
        routing="path"
        path="/sign-in"
        forceRedirectUrl={redirectTo}
        signUpForceRedirectUrl={redirectTo}
        appearance={clerkMarketingAppearance}
      />
    </AuthMarketingShell>
  );
}
