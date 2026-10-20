"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { getMemberCheckInCodeAction } from "../actions/member-experience";

const RING = 2 * Math.PI * 18;

export default function CheckInCodePage({ memberName }: { memberName?: string | null } = {}) {
  const [code, setCode] = useState<{ image: string; expiresAt: number; ttl: number } | null>(null);
  const [now, setNow] = useState(Date.now);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef(0);
  const busy = useRef(false);
  const fetchCode = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; const sequence = ++request.current; const started = Date.now();
    setLoading(true); setError(""); setCode(null);
    try {
      const result = await getMemberCheckInCodeAction();
      if (sequence !== request.current) return;
      if (!result.success || !result.qrDataUrl || !result.expiresIn) { setError(result.error || "A check-in code couldn’t be issued. Ask the front desk to check you in."); return; }
      // Subtract request transit time rather than extending server-issued validity.
      const expiresAt = started + result.expiresIn * 1000;
      setCode({ image: result.qrDataUrl, expiresAt, ttl: result.expiresIn }); setNow(Date.now());
    } catch { if (sequence === request.current) setError("Your code couldn’t be refreshed. Check your connection, or ask the front desk to check you in."); }
    finally { if (sequence === request.current) { busy.current = false; setLoading(false); } }
  }, []);
  const invalidateRequest = useCallback(() => { request.current++; busy.current = false; }, []);
  useEffect(() => {
    void fetchCode();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => { if (document.visibilityState === "visible") void fetchCode(); }, 25000);
    const visible = () => { if (document.visibilityState === "visible") { setNow(Date.now()); void fetchCode(); } };
    document.addEventListener("visibilitychange", visible);
    return () => { invalidateRequest(); clearInterval(tick); clearInterval(refresh); document.removeEventListener("visibilitychange", visible); };
  }, [fetchCode, invalidateRequest]);
  const seconds = code ? Math.max(0, Math.floor((code.expiresAt - now) / 1000)) : 0;
  const valid = code && seconds > 0;
  const fraction = code && code.ttl > 0 ? Math.min(1, seconds / code.ttl) : 0;
  const status = loading ? "Refreshing" : valid ? "Ready to scan" : error ? "Unavailable" : "Expired";
  const tone = loading ? "neutral" : valid ? "ok" : "low";

  return <div className="sf-page"><div className="sf-wrap" style={{ maxWidth: "calc(480px + 2 * var(--sf-gutter))" }}>
    <Link href="/account" className="sf-crumb"><ArrowLeft aria-hidden="true" />Account</Link>
    <section className="sf-pass sf-on-night sf-rise" aria-labelledby="pass-title" aria-busy={loading}>
      <div className="sf-stack" data-gap="sm">
        <div className="sf-titleline">
          <h1 id="pass-title" className="sf-h2">Check-in code</h1>
          <span className="sf-state" data-tone={tone} role="status">{status}</span>
        </div>
        {memberName ? <p className="sf-text-2">{memberName}</p> : null}
      </div>
      <div className="sf-pass-qr" data-stale={(!loading && code && !valid) || undefined}>
        {loading ? <><span className="sf-skel-qr" aria-hidden="true" /><span className="sr-only">Getting a fresh code…</span></>
          : error ? <p role="alert" style={{ position: "static" }}>{error}</p>
          : code ? <div>
              <Image src={code.image} alt={valid ? "Current member check-in QR code" : "Expired check-in QR code"} width={280} height={280} unoptimized />
              {!valid ? <p>Expired. Get a fresh code.</p> : null}
            </div>
          : <p style={{ position: "static" }}>Expired. Get a fresh code.</p>}
      </div>
      <div className="sf-pass-timer">
        <svg className="sf-ring" viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="18" />
          <circle cx="22" cy="22" r="18" strokeDasharray={RING} strokeDashoffset={RING * (1 - fraction)} />
        </svg>
        <div>
          <strong>{valid ? `${seconds}s` : "–"}</strong>
          <span>{valid ? "Until this code expires" : "Only a current code scans"}</span>
        </div>
      </div>
      <button type="button" className="sf-btn" data-variant="light" data-size="lg" data-block onClick={() => void fetchCode()} disabled={loading}>
        <RefreshCw className={loading ? "sf-spin" : undefined} aria-hidden="true" />{loading ? "Refreshing…" : "Get a fresh code"}
      </button>
    </section>
  </div></div>;
}
