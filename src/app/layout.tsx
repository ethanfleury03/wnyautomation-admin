import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { IBM_Plex_Mono, Manrope } from 'next/font/google';
import { PwaRegister } from '@/components/pwa-register';
import { getClerkRuntimeProps } from '@/lib/clerk-proxy-config';
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
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'WNY Admin',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/assets/pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/assets/pwa-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#10251d',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clientPortalUrl = getClientPortalUrl();
  const clerkRuntimeProps = getClerkRuntimeProps();
  const signInUrl = process.env.APP_ENV === 'staging' ? clientPortalUrl : '/sign-in';

  return (
    <html lang="en">
      <body className={`${appSans.variable} ${appMono.variable} min-h-screen bg-[var(--ops-bg)] antialiased`}>
        <ClerkProvider
          signInUrl={signInUrl}
          signUpUrl={signInUrl}
          afterSignOutUrl={clientPortalUrl}
          localization={clerkLocalization}
          {...clerkRuntimeProps}
        >
          <PwaRegister />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
