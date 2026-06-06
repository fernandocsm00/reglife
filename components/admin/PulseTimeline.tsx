"use client";

/**
 * PulseTimeline — bloco "Timeline de Pulses" em /admin/resultado/[id].
 *
 * Fetch único em GET /api/admin/pulses/[diagnosticId]. Renderiza:
 *   - tira horizontal de emojis ordenada por createdAt ASC (ready)
 *   - rodapé com "última resposta · source"
 *   - empty / loading / error com retry
 */

import { useEffect, useState } from "react";
import { formatRelative } from "@/lib/poker/adminSpotTrack";
import type {
  PulseEmoji,
  PulseEntry,
} from "@/lib/poker/pulseTimeline";

type Response = {
  hasPulses: boolean;
  totalCount: number;
  pulses: PulseEntry[];
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; totalCount: number; pulses: PulseEntry[] }
  | { kind: "empty" }
  | { kind: "error" };

interface Props {
  diagnosticId: string;
}

const EMOJI_GLYPH: Record<PulseEmoji, string> = {
  sad:   "😣",
  meh:   "😐",
  smile: "🙂",
  grin:  "😄",
};

/**
 * "2026-W21" → "W21". Fallback ao iso bruto se formato inesperado.
 */
function shortWeek(iso: string): string {
  const parts = iso.split("-");
  const last = parts[parts.length - 1] ?? "";
  return /^W\d{1,2}$/.test(last) ? last : iso;
}

export function PulseTimeline({ diagnosticId }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/pulses/${encodeURIComponent(diagnosticId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`http ${r.status}`);
        return (await r.json()) as Response;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.hasPulses) {
          setState({ kind: "ready", totalCount: data.totalCount, pulses: data.pulses });
        } else {
          setState({ kind: "empty" });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[PulseTimeline]", err);
        setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [diagnosticId, reloadTick]);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5 print:hidden">
      {state.kind === "loading" && (
        <p className="text-sm text-neutral-500">Carregando timeline…</p>
      )}

      {state.kind === "empty" && (
        <>
          <p className="text-[11px] uppercase tracking-widest text-neutral-500">
            Timeline de pulses
          </p>
          <p className="mt-3 text-xs text-neutral-500">
            Aluno ainda não respondeu nenhum pulse.
          </p>
        </>
      )}

      {state.kind === "error" && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-neutral-400">
            Não foi possível carregar a timeline.
          </p>
          <button
            type="button"
            onClick={() => {
              setState({ kind: "loading" });
              setReloadTick((n) => n + 1);
            }}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-emerald-600 hover:text-emerald-400 transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {state.kind === "ready" && (
        <ReadyView totalCount={state.totalCount} pulses={state.pulses} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subcomponente ready
// ---------------------------------------------------------------------------

function ReadyView({
  totalCount,
  pulses,
}: {
  totalCount: number;
  pulses: PulseEntry[];
}) {
  const last = pulses[pulses.length - 1];
  const counterLabel = totalCount === 1 ? "1 resposta" : `${totalCount} respostas`;

  return (
    <>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-widest text-neutral-500">
          Timeline de pulses
        </p>
        <p className="text-xs text-neutral-500 tabular-nums">{counterLabel}</p>
      </div>

      <ol className="mt-3 flex gap-3 sm:gap-4 overflow-x-auto">
        {pulses.map((p) => (
          <li
            key={`${p.weekIso}-${p.createdAt}`}
            className="flex flex-col items-center min-w-[40px]"
            title={`${p.weekIso} · ${p.source} · ${p.createdAt}`}
          >
            <span className="text-2xl leading-none">{EMOJI_GLYPH[p.emoji]}</span>
            <span className="mt-1 text-[10px] text-neutral-500 tabular-nums">
              {shortWeek(p.weekIso)}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-xs text-neutral-500">
        Última resposta: há {formatRelative(last.createdAt)} · {last.source}
      </p>
    </>
  );
}
