import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ShieldCheck, ShieldX, Loader2, Search, ArrowLeft, ScanLine, KeyRound, Lock, MapPin,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { formatMembershipDate } from "@/lib/membership";
import {
  readBarSession, saveBarSession, clearBarSession, normaliseBarCode, isBarAccessCode,
  normaliseMemberNumber, parseScannedCode,
} from "@/lib/barScanner";
import QrCameraScanner from "@/components/membership/QrCameraScanner";

// Bar scanner. Bar staff open /scan, enter the 8-digit code the RLT admin set
// in Admin → Store → Bar Scanner, then point the camera at a member's card.
// Signed-in admins and moderators skip the code.
//
// The member's QR is a short-lived signed token that only proves WHO. Whether
// they're a member right now is re-read from the database on every check, so
// a refunded or revoked card fails no matter what the phone is showing.
export default function Scan() {
  const [params, setParams] = useSearchParams();
  const { user, isLoadingAuth } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "moderator";

  const [bar, setBar] = useState(() => readBarSession());
  const [gateMessage, setGateMessage] = useState("");
  const authorised = isStaff || !!bar;

  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [manual, setManual] = useState("");
  const lastScanRef = useRef({ text: "", at: 0 });
  const token = params.get("t") || "";

  const lockScanner = useCallback((message = "") => {
    clearBarSession();
    setBar(null);
    setResult(null);
    setGateMessage(message);
  }, []);

  const check = useCallback(async (payload) => {
    setChecking(true);
    setResult(null);
    try {
      const { data } = await base44.functions.invoke("membershipCard", {
        action: "verify",
        ...payload,
        ...(isStaff ? {} : { bar_session: bar?.session }),
      });
      setResult(data);
      try { navigator.vibrate?.(data?.valid ? 80 : [60, 60, 60]); } catch { /* ignore */ }
    } catch (err) {
      if (err?.data?.code === "bar_session_invalid") {
        lockScanner(err.message);
        return;
      }
      setResult({ valid: false, reason: err?.message || "Couldn't reach the server" });
    } finally {
      setChecking(false);
    }
  }, [bar, isStaff, lockScanner]);

  // Opened from a phone camera scan: /scan?t=<token>.
  useEffect(() => {
    if (token && authorised && !isLoadingAuth) check({ token });
    // check changes identity with the session; only re-run for a new token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authorised, isLoadingAuth]);

  const onDetect = useCallback((text) => {
    // The same card stays in front of the camera for a second or two; don't
    // re-check it on every frame.
    const now = Date.now();
    if (text === lastScanRef.current.text && now - lastScanRef.current.at < 4000) return;
    lastScanRef.current = { text, at: now };
    const parsed = parseScannedCode(text);
    if (!parsed) {
      setResult({ valid: false, reason: "That isn't an RLT member card." });
      return;
    }
    check(parsed);
  }, [check]);

  const scanNext = () => {
    setResult(null);
    lastScanRef.current = { text: "", at: Date.now() };
    if (token) setParams({}, { replace: true });
  };

  if (isLoadingAuth) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!authorised) {
    return <AccessGate message={gateMessage} onUnlocked={(record) => { setBar(record); setGateMessage(""); }} />;
  }

  const valid = result?.valid === true;
  const decided = !!result && !checking;
  const perks = Array.isArray(result?.perks) ? result.perks : [];

  return (
    <main className="min-h-dvh bg-background px-5 py-8 text-foreground">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-primary">
            <ArrowLeft className="h-3 w-3" /> Site
          </Link>
          {!isStaff && (
            <button
              type="button"
              onClick={() => lockScanner()}
              className="inline-flex min-h-9 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-primary"
            >
              <Lock className="h-3 w-3" /> Lock scanner
            </button>
          )}
        </div>

        <h1 className="mt-4 font-display text-2xl uppercase tracking-wide">Member scanner</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Point the camera at the member's card in the RLT app.
        </p>

        {/* Kept mounted (just hidden) while a result shows, so the camera
            doesn't restart and re-prompt between members. */}
        <div className={decided ? "hidden" : "mt-5"}>
          <QrCameraScanner onDetect={onDetect} paused={checking || decided} />
        </div>

        {checking && (
          <div className="mt-4 flex items-center gap-2 border border-border/40 bg-card/30 p-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Checking…</span>
          </div>
        )}

        {decided && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`mt-5 border-2 p-6 text-center ${
              valid ? "border-emerald-500/60 bg-emerald-500/10" : "border-red-500/60 bg-red-500/10"
            }`}
          >
            {valid ? (
              <ShieldCheck className="mx-auto h-16 w-16 text-emerald-400" />
            ) : (
              <ShieldX className="mx-auto h-16 w-16 text-red-400" />
            )}
            <p className={`mt-3 font-display text-3xl uppercase tracking-wide ${valid ? "text-emerald-300" : "text-red-300"}`}>
              {valid ? "Valid member" : "Not valid"}
            </p>
            {result.member?.name && <p className="mt-2 text-lg font-bold text-foreground">{result.member.name}</p>}
            {result.member?.number && <p className="font-mono text-sm text-slate-400">{result.member.number}</p>}
            {valid && result.member?.expires_at && (
              <p className="mt-2 text-xs text-slate-400">Valid until {formatMembershipDate(result.member.expires_at)}</p>
            )}
            {!valid && result.reason && <p className="mt-2 text-sm text-red-200">{result.reason}</p>}

            {valid && perks.length > 0 && (
              <div className="mt-5 border-t border-emerald-500/30 pt-4 text-left">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Member perks</p>
                <ul className="mt-2 grid gap-2">
                  {perks.map((perk) => (
                    <li key={perk.id} className="border border-emerald-500/20 bg-black/20 p-2.5">
                      <p className="text-sm text-foreground">
                        <span className="font-bold">{perk.title}</span>
                        {perk.discount_label && <span className="text-emerald-300"> · {perk.discount_label}</span>}
                      </p>
                      {perk.description && <p className="mt-0.5 text-xs text-slate-400">{perk.description}</p>}
                      {perk.venue && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                          <MapPin className="h-3 w-3 shrink-0" /> {perk.venue}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={scanNext}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 border border-primary bg-primary px-4 text-[11px] font-bold uppercase tracking-[0.2em] text-primary-foreground"
            >
              <ScanLine className="h-4 w-4" /> Scan next member
            </button>
          </motion.div>
        )}

        <form
          className="mt-6 border border-border/40 bg-card/20 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const number = normaliseMemberNumber(manual);
            if (number) check({ number });
          }}
        >
          <label htmlFor="member-number" className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Card won't scan? Look up by member number
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="member-number"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="RLT-001234"
              autoCapitalize="characters"
              className="h-11 min-w-0 flex-1 border border-border/40 bg-secondary/35 px-3 font-mono text-base text-foreground focus-visible:border-primary/65 focus-visible:outline-none"
            />
            <button
              type="submit"
              disabled={checking || !manual.trim()}
              className="flex h-11 shrink-0 items-center gap-1.5 border border-primary bg-primary px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-50"
            >
              <Search className="h-3.5 w-3.5" /> Check
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            The result always reflects live membership, not what's on the card. Screenshots stop working after a few minutes.
          </p>
        </form>
      </div>
    </main>
  );
}

function AccessGate({ message, onUnlocked }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(message || "");

  useEffect(() => { setError(message || ""); }, [message]);

  const submit = async (e) => {
    e.preventDefault();
    if (!isBarAccessCode(code)) {
      setError("Enter the 8-digit code from the RLT team.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data } = await base44.functions.invoke("membershipCard", { action: "bar_login", code });
      onUnlocked(saveBarSession(data.session, data.expires_in));
    } catch (err) {
      setError(err?.message || "Couldn't check the code.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
      <form onSubmit={submit} className="w-full max-w-xs text-center">
        <KeyRound className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-3 font-display text-2xl uppercase tracking-wide">Bar scanner</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the 8-digit access code from the RLT team to start checking member cards.
        </p>
        <label htmlFor="bar-code" className="sr-only">Access code</label>
        <input
          id="bar-code"
          value={code}
          onChange={(e) => setCode(normaliseBarCode(e.target.value))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={8}
          placeholder="••••••••"
          autoFocus
          className="mt-5 h-14 w-full border border-border/50 bg-secondary/35 text-center font-mono text-2xl tracking-[0.4em] text-foreground focus-visible:border-primary/65 focus-visible:outline-none"
        />
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button
          type="submit"
          disabled={busy || code.length !== 8}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 border border-primary bg-primary px-4 text-[11px] font-bold uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
          Unlock scanner
        </button>
        <p className="mt-4 text-[11px] text-slate-500">
          RLT staff can <Link to="/login?next=%2Fscan" className="text-primary underline">sign in</Link> instead.
        </p>
      </form>
    </main>
  );
}
