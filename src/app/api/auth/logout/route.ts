import { NextResponse } from 'next/server';
import { GATEWAY_FALLBACK_COOKIE } from '@/lib/auth/gateway-fallback';
import { getClientPortalUrl, getGatewayLogoutUrl } from '@/lib/portal-url';

function clearFallbackCookie(response: NextResponse) {
  response.cookies.set({
    name: GATEWAY_FALLBACK_COOKIE,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function POST(request: Request) {
  const fallbackCookie = request.headers.get('cookie')?.includes(`${GATEWAY_FALLBACK_COOKIE}=`) ?? false;
  const mode = process.env.APP_ENV === 'staging' && fallbackCookie ? 'gateway-fallback' : 'clerk';
  const response = NextResponse.json({
    ok: true,
    mode,
    redirectUrl: mode === 'gateway-fallback' ? getGatewayLogoutUrl() : getClientPortalUrl(),
  });
  clearFallbackCookie(response);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export function GET() {
  const response = NextResponse.redirect(getClientPortalUrl(), 303);
  clearFallbackCookie(response);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
