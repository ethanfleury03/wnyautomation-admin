import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { getClerkProxyUrl } from '@/lib/clerk-proxy-config';

const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/not-authorized(.*)',
  '/clerk-proxy(.*)',
  '/favicon.ico',
  '/icon.svg',
  '/apple-icon',
  '/manifest.webmanifest',
  '/robots.txt',
]);

const isProtectedRoute = createRouteMatcher(['/admin(.*)', '/api/admin(.*)']);

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
  return clerkAuthMiddleware(req, event);
}

export const config = {
  matcher: [
    '/clerk-proxy(.*)',
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
