import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { supabaseConfig } from '@/lib/supabase/config';
import { safeAuthNext } from '@/shared/project-rooms';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const protocol = request.headers.get('x-forwarded-proto') === 'https' ? 'https:' : url.protocol;
  const origin = process.env.SITE_URL ?? `${protocol}//${request.headers.get('host') ?? url.host}`;
  const next = safeAuthNext(url.searchParams.get('next'));
  if (!supabaseConfig()) return NextResponse.redirect(new URL('/?auth_error=configuration', origin));
  const supabase = await getSupabaseServer();
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (tokenHash && (type === 'email' || type === 'recovery')) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) throw error;
    } else { throw new Error('Missing confirmation code'); }
    const response = NextResponse.redirect(new URL(type === 'recovery' ? '/reset-password' : next, origin));
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return NextResponse.redirect(new URL('/?auth_error=link', origin));
  }
}
