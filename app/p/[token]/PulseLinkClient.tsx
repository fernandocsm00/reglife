"use client";

import { useState } from "react";

type Emoji = "sad" | "meh" | "smile" | "grin";

interface Props {
  token: string;
  weekIso: string;
  alreadyVoted: { emoji: string; source: string; at: string } | null;
}

const EMOJIS: Array<{ value: Emoji; label: string; glyph: string }> = [
  { value: "sad",   label: "Difícil",  glyph: "😣" },
  { value: "meh",   label: "Cansativa",glyph: "😐" },
  { value: "smile", label: "Boa",      glyph: "🙂" },
  { value: "grin",  label: "Excelente",glyph: "😄" },
];

export function PulseLinkClient({ token, weekIso, alreadyVoted }: Props) {
  const [submitted, setSubmitted] = useState<Emoji | null>(
    (alreadyVoted?.emoji as Emoji) ?? null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function vote(emoji: Emoji) {
    if (submitting || submitted) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, vote: emoji, source: "link" }),
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 py-12 text-neutral-100">
      <div className="w-full max-w-md text-center">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          EV · semana {weekIso}
        </p>
        <h1 className="mt-3 text-2xl font-bold">Como foi sua semana?</h1>
        <p className="mt-2 text-sm text-neutral-400">Um toque, sem texto. 1 segundo.</p>

        <div className="mt-10 grid grid-cols-4 gap-3">
          {EMOJIS.map((e) => {
            const selected = submitted === e.value;
            return (
              <button
                key={e.value}
                type="button"
                onClick={() => vote(e.value)}
                disabled={submitting || !!submitted}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition ${
                  selected
                    ? "border-amber-400/70 bg-amber-400/15"
                    : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                } ${(submitting || !!submitted) && !selected ? "opacity-30" : ""}`}
              >
                <span className="text-3xl">{e.glyph}</span>
                <span className="text-[11px] uppercase tracking-wide text-neutral-400">
                  {e.label}
                </span>
              </button>
            );
          })}
        </div>

        {submitted && (
          <p className="mt-8 text-sm text-emerald-300">
            Anotado! O EV vai usar isso pro próximo plano.
          </p>
        )}
        {error && (
          <p className="mt-6 text-sm text-red-400">Erro: {error}</p>
        )}
      </div>
    </div>
  );
}
