"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { getMemberCheckInCodeAction } from "../actions/member-experience";
export default function CheckInCodePage() {
  const [code, setCode] = useState<{ image: string; expiresAt: number } | null>(null);
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
      if (!result.success || !result.qrDataUrl || !result.expiresIn) { setError(result.error || "A check-in code could not be issued. Ask the front desk for help."); return; }
      // Subtract request transit time rather than extending server-issued validity.
      const expiresAt = started + result.expiresIn * 1000;
      setCode({ image: result.qrDataUrl, expiresAt }); setNow(Date.now());
    } catch { if (sequence === request.current) setError("We couldn’t refresh your code. Check your connection and try again, or ask the front desk to check you in."); }
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
  return <div className="sf-page"><div className="sf-container"><Link href="/account" className="sf-link">← Your account</Link><div className="sf-join-grid mt-8"><header><p className="sf-eyebrow">Ready for your visit</p><h1 className="sf-display text-[var(--text-display-s)] mt-4">Your check-in code</h1><p className="sf-lead mt-5">Show the current code to the front desk scanner when you arrive.</p><div className="sf-notice mt-6"><strong>Keep this page open at check-in.</strong><p>The code expires quickly and refreshes automatically. A screenshot may expire before you arrive.</p></div><p className="sf-muted mt-5">If a code is unavailable or the scanner cannot read it, ask staff to check you in. Your membership and participation requirements still apply.</p><Link href="/account/participation" className="sf-link mt-5 inline-flex">Review participation requirements →</Link></header><section className="sf-panel" aria-label="Entrance code" aria-busy={loading}><div className="sf-section-heading"><h2>Entrance code</h2><span className="sf-badge">{loading ? "Refreshing" : valid ? "Ready to scan" : "Not ready"}</span></div><div className="mx-auto grid aspect-square w-full max-w-72 place-items-center border border-[var(--sf-border)] p-4 text-center">{loading ? <p role="status">Getting a fresh code…</p> : error ? <p role="alert">{error}</p> : valid ? <Image src={code.image} alt="Current member check-in QR code" width={280} height={280} unoptimized className="w-full bg-white" /> : <p role="status">This code has expired. Refresh to get a new code.</p>}</div><p className="sf-muted text-center my-5">{valid ? `Expires in ${seconds} seconds` : "Only a current code can be scanned"}</p><button type="button" className="sf-btn-primary w-full" onClick={() => void fetchCode()} disabled={loading}>{loading ? "Refreshing…" : "Get a fresh code"}</button></section></div></div></div>;
}
