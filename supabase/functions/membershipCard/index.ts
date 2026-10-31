// Membership card: issue the signed payload a member shows at the bar, and
// verify one that's been scanned.
//
// The card's QR carries a SHORT-LIVED SIGNED TOKEN, not a bare member number.
// A bare number is trivially copied off a photo of someone else's card and
// stays valid forever; a token that expires and is signed with a server secret
// can be checked offline-ish by staff and can't be forged or replayed for long.
// Membership itself is always re-read from the database at verify time, so a
// refunded or revoked member fails the check immediately regardless of what
// their phone is showing.
//
// Actions:
//   issue              — (member, authenticated) mint a token for MY card
//   verify             — (staff: admin/moderator, OR a bar device holding a
//                         bar_session) check a scanned token or member number
//   bar_login          — (anyone) trade the admin-set 8-digit bar code for a
//                         signed bar_session; throttled per IP
//   bar_settings       — (admin) read the bar code and on/off switch
//   bar_settings_save  — (admin) set, generate or switch off the bar code
import { json, preflight, serviceClient, getCaller, trimToLength, resolveClientIp } from './shared.ts';

// Long enough to walk from the door to the bar with a screenshot-proof margin,
// short enough that a photographed code is useless by the time it's shared.
const TOKEN_TTL_SECONDS = 15 * 60;

// A bar device stays signed in for a full night (doors to close plus margin),
// then has to re-enter the code. Changing the code ends it sooner.
const BAR_SESSION_TTL_SECONDS = 16 * 60 * 60;

// Guessing limits for the 8-digit code. Per IP, plus a global ceiling so a
// spread-out attack still can't grind through the code space.
const BAR_LOGIN_WINDOW_MINUTES = 15;
const BAR_LOGIN_MAX_FAILURES_PER_IP = 8;
const BAR_LOGIN_MAX_FAILURES_GLOBAL = 300;

const encoder = new TextEncoder();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

function cardSecret() {
  // Falls back to the service-role key so the feature works before a dedicated
  // secret is configured — it is server-only and never leaves the function.
  const secret = Deno.env.get('MEMBERSHIP_CARD_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('Membership cards are not configured');
  return secret;
}

async function hmac(payload: string) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(cardSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return b64url(new Uint8Array(sig));
}

// Constant-time compare — a length-sensitive early return leaks signature
// bytes to anyone willing to time the endpoint.
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const isActive = (expiresAt: string | null) =>
  !!expiresAt && new Date(expiresAt).getTime() > Date.now();

async function issueToken(profileId: string, memberNumber: string) {
  const body = b64url(encoder.encode(JSON.stringify({
    v: 1,
    id: profileId,
    n: memberNumber,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  })));
  return `${body}.${await hmac(body)}`;
}

async function readToken(token: string) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return { error: 'Not an RLT membership code' };
  if (!safeEqual(signature, await hmac(body))) return { error: 'This code has been altered' };
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    return { error: 'Not an RLT membership code' };
  }
  if (!payload?.id) return { error: 'Not an RLT membership code' };
  if (Number(payload.exp) * 1000 <= Date.now()) {
    return { error: 'This code has expired — ask them to refresh their card' };
  }
  return { payload };
}

// ── Bar scanner access ──────────────────────────────────────────────────────

const isBarCode = (value: string) => /^[0-9]{8}$/.test(value);

function randomBarCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 100000000).padStart(8, '0');
}

// deno-lint-ignore no-explicit-any
async function readBarAccess(svc: any) {
  const { data, error } = await svc
    .from('bar_scanner_access')
    .select('access_code, enabled, code_version, updated_date')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw new Error('Bar scanner is not set up yet (run migration 0040)');
  return data || { access_code: null, enabled: false, code_version: 0, updated_date: null };
}

async function issueBarSession(codeVersion: number) {
  const body = b64url(encoder.encode(JSON.stringify({
    v: 1,
    k: 'bar',
    cv: codeVersion,
    exp: Math.floor(Date.now() / 1000) + BAR_SESSION_TTL_SECONDS,
  })));
  return `${body}.${await hmac(body)}`;
}

// deno-lint-ignore no-explicit-any
async function barSessionValid(svc: any, session: string) {
  const [body, signature] = String(session || '').split('.');
  if (!body || !signature) return false;
  if (!safeEqual(signature, await hmac(body))) return false;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    return false;
  }
  // k === 'bar' keeps a member card token from ever passing as a bar session.
  if (payload?.k !== 'bar' || Number(payload.exp) * 1000 <= Date.now()) return false;
  const access = await readBarAccess(svc);
  return !!access.enabled && !!access.access_code && Number(payload.cv) === Number(access.code_version);
}

// Live perks to show alongside a valid card (migration 0038). Optional: if the
// table isn't there yet the check still works, just without perks.
// deno-lint-ignore no-explicit-any
async function livePerks(svc: any) {
  const nowIso = new Date().toISOString();
  const { data, error } = await svc
    .from('membership_discounts')
    .select('id, title, discount_label, description, venue, how_to_redeem, sort_order, ends_at, starts_at')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(50);
  if (error || !Array.isArray(data)) return [];
  return data
    .filter((row) => (!row.starts_at || row.starts_at <= nowIso) && (!row.ends_at || row.ends_at > nowIso))
    .map(({ starts_at: _s, sort_order: _o, ...rest }) => rest);
}

const isStaffRole = (role: unknown) => role === 'admin' || role === 'moderator';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const svc = serviceClient();
    const input = await req.json().catch(() => ({}));
    const action = trimToLength(input?.action, 20) || 'issue';
    const me = await getCaller(req, svc);

    if (action === 'bar_login') {
      const ip = resolveClientIp(req) || 'unknown';
      const since = new Date(Date.now() - BAR_LOGIN_WINDOW_MINUTES * 60000).toISOString();
      const [{ count: ipFailures }, { count: allFailures }] = await Promise.all([
        svc.from('bar_scanner_attempts').select('id', { count: 'exact', head: true })
          .eq('ip', ip).eq('succeeded', false).gte('attempted_at', since),
        svc.from('bar_scanner_attempts').select('id', { count: 'exact', head: true })
          .eq('succeeded', false).gte('attempted_at', since),
      ]);
      if ((ipFailures || 0) >= BAR_LOGIN_MAX_FAILURES_PER_IP || (allFailures || 0) >= BAR_LOGIN_MAX_FAILURES_GLOBAL) {
        return json({ error: `Too many wrong codes. Try again in ${BAR_LOGIN_WINDOW_MINUTES} minutes.`, code: 'rate_limited' }, 429);
      }
      const code = trimToLength(input?.code, 20).replace(/\s+/g, '');
      const access = await readBarAccess(svc);
      const ok = isBarCode(code) && !!access.enabled && !!access.access_code && safeEqual(code, access.access_code);
      await svc.from('bar_scanner_attempts').insert({ ip, succeeded: ok });
      if (!ok) {
        return json({
          error: access.enabled && access.access_code
            ? 'That code is not right. Check it with the RLT team.'
            : 'The bar scanner is switched off right now.',
          code: 'bad_code',
        }, 403);
      }
      return json({ ok: true, session: await issueBarSession(Number(access.code_version)), expires_in: BAR_SESSION_TTL_SECONDS });
    }

    if (action === 'bar_settings' || action === 'bar_settings_save') {
      if (me?.role !== 'admin') return json({ error: 'Admins only' }, 403);
      if (action === 'bar_settings_save') {
        const patch: Record<string, unknown> = { updated_by: me.id };
        if (input?.generate === true) {
          patch.access_code = randomBarCode();
        } else if (input?.code !== undefined) {
          const code = trimToLength(input.code, 20).replace(/\s+/g, '');
          if (!isBarCode(code)) return json({ error: 'The code must be exactly 8 digits.' }, 400);
          patch.access_code = code;
        }
        if (typeof input?.enabled === 'boolean') patch.enabled = input.enabled;
        const { error } = await svc.from('bar_scanner_access')
          .upsert({ id: 'default', ...patch }, { onConflict: 'id' });
        if (error) throw new Error(error.message);
      }
      const access = await readBarAccess(svc);
      return json({
        ok: true,
        code: access.access_code || '',
        enabled: !!access.enabled,
        updated_date: access.updated_date,
      });
    }

    if (action === 'issue') {
      if (!me) return json({ error: 'Sign in required' }, 401);
      const { data: profile } = await svc
        .from('profiles')
        .select('id, full_name, membership_number, membership_started_at, membership_expires_at')
        .eq('id', me.id)
        .maybeSingle();
      if (!profile) return json({ error: 'Profile not found' }, 404);
      if (!isActive(profile.membership_expires_at)) {
        return json({ error: 'No active membership', code: 'not_a_member' }, 403);
      }
      // A member who predates the number allocator (or an admin comp) may not
      // have one yet — mint it on first card view rather than failing.
      let memberNumber = String(profile.membership_number || '').trim();
      if (!memberNumber) {
        // ensure_membership_number, NOT grant_membership — the latter clamps
        // months to a minimum of 1 and would quietly extend their term.
        const { data: assigned } = await svc.rpc('ensure_membership_number', { p_profile_id: profile.id });
        memberNumber = String(assigned || '').trim();
      }
      return json({
        ok: true,
        token: await issueToken(profile.id, memberNumber),
        expires_in: TOKEN_TTL_SECONDS,
        member: {
          name: profile.full_name || 'RLT Member',
          number: memberNumber,
          started_at: profile.membership_started_at,
          expires_at: profile.membership_expires_at,
        },
      });
    }

    if (action === 'verify') {
      // Bar-side check. Staff or a bar device only — this reveals whether a
      // given person is a paying member, which is not public information.
      if (!isStaffRole(me?.role)) {
        const barSession = trimToLength(input?.bar_session, 2000);
        if (!barSession) return json({ error: 'Staff only', code: 'staff_only' }, 403);
        if (!(await barSessionValid(svc, barSession))) {
          return json({ error: 'The bar access code has changed. Enter the new code.', code: 'bar_session_invalid' }, 401);
        }
      }
      // Two ways in: a scanned token, or a member number typed by hand when a
      // code won't scan. Both resolve to the same live database check.
      const memberNumber = trimToLength(input?.number, 40).toUpperCase();
      let profileId = '';
      if (memberNumber) {
        const { data: byNumber } = await svc
          .from('profiles')
          .select('id')
          .eq('membership_number', memberNumber)
          .maybeSingle();
        if (!byNumber) return json({ ok: true, valid: false, reason: 'No member with that number' });
        profileId = byNumber.id;
      } else {
        const { payload, error } = await readToken(trimToLength(input?.token, 2000));
        if (error) return json({ ok: true, valid: false, reason: error });
        profileId = payload.id;
      }

      // The token proves WHO, never WHETHER — membership is re-read live so a
      // revoked or refunded card stops working the moment it's revoked.
      const { data: profile } = await svc
        .from('profiles')
        .select('id, full_name, membership_number, membership_expires_at, disabled')
        .eq('id', profileId)
        .maybeSingle();
      if (!profile || profile.disabled) {
        return json({ ok: true, valid: false, reason: 'No such member' });
      }
      if (!isActive(profile.membership_expires_at)) {
        return json({
          ok: true,
          valid: false,
          reason: 'Membership expired',
          member: { name: profile.full_name, number: profile.membership_number, expires_at: profile.membership_expires_at },
        });
      }
      return json({
        ok: true,
        valid: true,
        member: {
          name: profile.full_name || 'RLT Member',
          number: profile.membership_number,
          expires_at: profile.membership_expires_at,
        },
        perks: await livePerks(svc),
      });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('membershipCard error:', error);
    return json({ error: (error as Error).message }, 500);
  }
});
