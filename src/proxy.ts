import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const clerkFrontendApiProxy = {
  enabled: true,
  path: '/clerk-proxy',
} as const;

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

export default clerkMiddleware(
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
  {
    frontendApiProxy: clerkFrontendApiProxy,
  },
);

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
