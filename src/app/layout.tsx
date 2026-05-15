import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { IBM_Plex_Mono, Manrope } from 'next/font/google';
import { getClientPortalUrl } from '@/lib/portal-url';
import './globals.css';

const clerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in to WNY Automation Admin',
      subtitle: 'Owner access only.',
      titleCombined: 'Sign in to WNY Automation Admin',
      subtitleCombined: 'Owner access only.',
    },
    password: {
      title: 'Enter your admin password',
      subtitle: 'Continue to the central command station.',
    },
  },
} as const;

const defaultProductionClerkProxyUrl = 'https://wnyautomation.com/clerk-proxy';

function getClerkProxyUrl() {
  return (
    process.env.NEXT_PUBLIC_CLERK_PROXY_URL ||
    process.env.CLERK_PROXY_URL ||
    (process.env.NODE_ENV === 'production' ? defaultProductionClerkProxyUrl : undefined)
  );
}

const appSans = Manrope({
  variable: '--font-app-sans',
  subsets: ['latin'],
});

const appMono = IBM_Plex_Mono({
  variable: '--font-app-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'WNY Automation Admin',
  description: 'Private WNY Automation command station.',
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#10251d',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clientPortalUrl = getClientPortalUrl();
  const clerkProxyUrl = getClerkProxyUrl();

  return (
    <html lang="en">
      <body className={`${appSans.variable} ${appMono.variable} min-h-screen bg-[var(--ops-bg)] antialiased`}>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-in"
          afterSignOutUrl={clientPortalUrl}
          localization={clerkLocalization}
          {...(clerkProxyUrl ? { proxyUrl: clerkProxyUrl } : {})}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
