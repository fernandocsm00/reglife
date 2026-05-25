"use client";

/**
 * PulseCard — Card semanal de pulse no /meu-plano.
 *
 * Aparece apenas se há uma notification pulse_request aberta desta semana
 * sem resposta. Após o aluno votar, some.
 *
 * Lê o token via GET /api/profile/notifications. Vota via POST /api/pulse
 * com source=in_app.
 */

import { useEffect, useState } from "react";

type Emoji = "sad" | "meh" | "smile" | "grin";

interface Props {
  diagnosticId: string | undefined;
}

interface PulseState {
  token: string;
  weekIso: string;
  alreadyVoted: boolean;
}

const EMOJIS: Array<{ value: Emoji; glyph: string; label: string }> = [
  { value: "sad",   glyph: "😣", label: "Difícil" },
  { value: "meh",   glyph: "😐", label: "Cansou" },
  { value: "smile", glyph: "🙂", label: "Boa" },
  { value: "grin",  glyph: "😄", label: "Top" },
];

export function PulseCard({ diagnosticId }: Props) {
  const [state, setState] = useState<PulseState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Emoji | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!diagnosticId) return;
    let mounted = true;
    fetch(`/api/profile/notifications?diagnosticId=${diagnosticId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        const items: Array<{ kind: string; payload: { token?: string; weekIso?: string } | null; created_at: string }> =
          data?.notifications ?? [];
        const pulse = items
          .filter((n) => n.kind === "pulse_request" && n.payload?.token && n.payload?.weekIso)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (!pulse?.payload?.token || !pulse.payload.weekIso) return;
        fetch(`/api/pulse?token=${encodeURIComponent(pulse.payload.token)}`)
          .then((r) => r.json())
          .then((p) => {
            if (!mounted) return;
            if (p?.error) return;
            setState({
              token: pulse.payload!.token!,
              weekIso: pulse.payload!.weekIso!,
              alreadyVoted: !!p.alreadyVoted,
            });
            if (p.alreadyVoted) setSubmitted(p.alreadyVoted.emoji);
          })
          .catch(() => {});
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [diagnosticId]);

  async function vote(emoji: Emoji) {
    if (!state || submitting || submitted) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: state.token, vote: emoji, source: "in_app" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? `http_${res.status}`);
        return;
      }
      setSubmitted(emoji);
    } catch (err) {
      setError(err instanceof Error ? err.message : "network");
    } finally {
      setSubmitting(false);
    }
  }

  if (!state) return null;
  if (state.alreadyVoted) return null;

  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 print:hidden">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-amber-200">Como foi sua semana?</h3>
        <span className="text-[10px] uppercase text-amber-300/60">{state.weekIso}</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {EMOJIS.map((e) => {
          const selected = submitted === e.value;
          return (
            <button
              key={e.value}
              type="button"
              onClick={() => vote(e.value)}
              disabled={submitting || !!submitted}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition ${
                selected
                  ? "border-amber-400 bg-amber-400/20"
                  : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-700"
              } ${(submitting || !!submitted) && !selected ? "opacity-30" : ""}`}
            >
              <span className="text-2xl">{e.glyph}</span>
              <span className="text-[10px] text-neutral-400">{e.label}</span>
            </button>
          );
        })}
      </div>
      {submitted && (
        <p className="mt-3 text-xs text-emerald-300">Anotado.</p>
      )}
      {error && (
        <p className="mt-3 text-xs text-red-400">Erro: {error}</p>
      )}
    </div>
  );
}
