import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';

const clerkProxyPath = '/clerk-proxy';
const defaultProductionClerkProxyUrl = 'https://wnyautomation.com/clerk-proxy';

function getClerkProxyUrl() {
  return (
    process.env.NEXT_PUBLIC_CLERK_PROXY_URL ||
    process.env.CLERK_PROXY_URL ||
    (process.env.NODE_ENV === 'production' ? defaultProductionClerkProxyUrl : undefined)
  );
}

const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/not-authorized(.*)',
  '/favicon.ico',
  '/icon.svg',
  '/apple-icon',
  '/manifest.webmanifest',
  '/robots.txt',
]);

const isProtectedRoute = createRouteMatcher(['/admin(.*)', '/api/admin(.*)']);

function getPrimaryClerkProxyUrl(req: NextRequest) {
  const clerkProxyUrl = getClerkProxyUrl();
  if (!clerkProxyUrl) return null;
  const url = new URL(clerkProxyUrl);
  const basePath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  url.pathname = `${basePath}${req.nextUrl.pathname.slice(clerkProxyPath.length)}`;
  url.search = req.nextUrl.search;
  return url;
}

const clerkAuthMiddleware = clerkMiddleware(
  async (auth, req) => {
    if (isPublicRoute(req)) {
      return NextResponse.next();
    }

    if (isProtectedRoute(req)) {
      const { userId } = await auth();
      if (!userId) {
        if (req.nextUrl.pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const url = req.nextUrl.clone();
        url.pathname = '/sign-in';
        url.searchParams.set('redirect_url', req.nextUrl.pathname + req.nextUrl.search);
        return NextResponse.redirect(url);
      }
    }

    return NextResponse.next();
  },
  getClerkProxyUrl() ? { proxyUrl: getClerkProxyUrl() } : {},
);

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (req.nextUrl.pathname === clerkProxyPath || req.nextUrl.pathname.startsWith(`${clerkProxyPath}/`)) {
    const proxyUrl = getPrimaryClerkProxyUrl(req);
    if (proxyUrl) return NextResponse.redirect(proxyUrl, 307);
  }

  return clerkAuthMiddleware(req, event);
}

export const config = {
  matcher: [
    '/clerk-proxy(.*)',
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
