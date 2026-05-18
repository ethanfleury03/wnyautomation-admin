import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { getClerkRuntimeProps } from '@/lib/clerk-proxy-config';
import { getClientPortalUrl } from '@/lib/portal-url';

const GATEWAY_FALLBACK_COOKIE = 'admin_gateway_fallback';

const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/gateway-fallback',
  '/not-authorized(.*)',
  '/clerk-proxy(.*)',
  '/favicon.ico',
  '/icon.svg',
  '/apple-icon',
  '/manifest.webmanifest',
  '/robots.txt',
]);

const isProtectedRoute = createRouteMatcher(['/admin(.*)', '/api/admin(.*)']);

const clerkMiddlewareOptions = getClerkRuntimeProps();

const clerkAuthMiddleware = clerkMiddleware(
  async (auth, req) => {
    if (isPublicRoute(req)) {
      if (process.env.APP_ENV === 'staging' && (req.nextUrl.pathname === '/sign-in' || req.nextUrl.pathname.startsWith('/sign-in/'))) {
        return NextResponse.redirect(getClientPortalUrl(), 307);
      }
      if (process.env.APP_ENV === 'staging' && (req.nextUrl.pathname === '/sign-up' || req.nextUrl.pathname.startsWith('/sign-up/'))) {
        return NextResponse.redirect(getClientPortalUrl(), 307);
      }
      return NextResponse.next();
    }

    if (isProtectedRoute(req)) {
      if (process.env.APP_ENV === 'staging' && req.cookies.has(GATEWAY_FALLBACK_COOKIE)) {
        return NextResponse.next();
      }

      const { userId } = await auth();
      if (!userId) {
        if (req.nextUrl.pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (process.env.APP_ENV === 'staging') {
          return NextResponse.redirect(getClientPortalUrl(), 307);
        }
        const url = req.nextUrl.clone();
        url.pathname = '/sign-in';
        url.searchParams.set('redirect_url', req.nextUrl.pathname + req.nextUrl.search);
        return NextResponse.redirect(url);
      }
    }

    return NextResponse.next();
  },
  Object.keys(clerkMiddlewareOptions).length > 0 ? clerkMiddlewareOptions : {},
);

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  return clerkAuthMiddleware(req, event);
}

export const config = {
  matcher: [
    '/clerk-proxy(.*)',
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
