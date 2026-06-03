"use client";

/**
 * AdminSpotTrack — bloco "Trilha de 30 dias" em /admin/resultado/[id].
 *
 * Fetch único de GET /api/admin/spot-track/[diagnosticId]. Renderiza:
 *   - tabela densa por spot (success)
 *   - 3 empty states (abandoned, no_saved_plan, elite_no_track)
 *   - loading / error com retry
 */

import { useCallback, useEffect, useState } from "react";
import {
  formatRelative,
  type AdminSpotEntry,
} from "@/lib/poker/adminSpotTrack";

type EmptyReason = "abandoned" | "no_saved_plan" | "elite_no_track";

type Response =
  | { hasTrack: true; spots: AdminSpotEntry[] }
  | { hasTrack: false; reason: EmptyReason };

type State =
  | { kind: "loading" }
  | { kind: "ready"; spots: AdminSpotEntry[] }
  | { kind: "empty"; reason: EmptyReason }
  | { kind: "error" };

interface Props {
  diagnosticId: string;
}

const EMPTY_MESSAGE: Record<EmptyReason, string> = {
  abandoned:      "Aluno não jogou nenhum spot.",
  no_saved_plan:  "Aluno não chegou a gerar plano (abandonou o quiz).",
  elite_no_track: "Aluno passou em todos os spots do diagnóstico — sem trilha.",
};

const STATE_LABEL: Record<AdminSpotEntry["state"], string> = {
  completed: "Concl.",
  active:    "Ativo",
  locked:    "Bloq.",
};

const STATE_DOT: Record<AdminSpotEntry["state"], string> = {
  completed: "bg-emerald-500",
  active:    "bg-yellow-400",
  locked:    "bg-neutral-600",
};

export function AdminSpotTrack({ diagnosticId }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetch(`/api/admin/spot-track/${encodeURIComponent(diagnosticId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`http ${r.status}`);
        return (await r.json()) as Response;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.hasTrack) setState({ kind: "ready", spots: data.spots });
        else setState({ kind: "empty", reason: data.reason });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[AdminSpotTrack] fetch", err);
        setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [diagnosticId]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-widest text-neutral-500">
        Trilha de 30 dias
      </p>

      {state.kind === "loading" && (
        <p className="mt-3 text-sm text-neutral-500">Carregando trilha…</p>
      )}

      {state.kind === "empty" && (
        <p className="mt-3 text-xs text-neutral-500">{EMPTY_MESSAGE[state.reason]}</p>
      )}

      {state.kind === "error" && (
        <div className="mt-3 flex items-center gap-3">
          <p className="text-sm text-neutral-400">Não foi possível carregar a trilha.</p>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-emerald-600 hover:text-emerald-400 transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {state.kind === "ready" && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-neutral-500">
              <tr className="border-b border-neutral-800">
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Spot</th>
                <th className="px-2 py-2 text-left">Estado</th>
                <th className="px-2 py-2 text-left">Mãos</th>
                <th className="px-2 py-2 text-left">%</th>
                <th className="px-2 py-2 text-left">Última</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {state.spots.map((s) => (
                <tr key={`${s.index}-${s.leakId ?? "empty"}`}>
                  <td className="px-2 py-2 text-neutral-600 tabular-nums">{s.index}</td>
                  <td className="px-2 py-2 text-neutral-200">{s.spotLabel}</td>
                  <td className="px-2 py-2 text-neutral-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[s.state]}`} />
                      {STATE_LABEL[s.state]}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-neutral-400 tabular-nums">
                    {s.handsPlayed}/50
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {s.accuracyPct === null ? (
                      <span className="text-neutral-600">—</span>
                    ) : s.accuracyPct >= 70 ? (
                      <span className="text-emerald-400">{s.accuracyPct}%</span>
                    ) : (
                      <span className="text-amber-400">{s.accuracyPct}%</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-neutral-500">
                    {formatRelative(s.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
