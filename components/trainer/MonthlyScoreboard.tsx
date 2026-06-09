"use client";

/**
 * MonthlyScoreboard — placar mensal em /meu-plano (substitui EvHud).
 *
 * Fetch único em GET /api/plan/scoreboard/[diagnosticId]. Renderiza:
 *   - 4 cards de meta (score / spots / volume / mãos) com cores por progresso
 *   - mini-resumo dos spots com mini-barra de progresso por linha
 *   - 3 empty states + loading + error com retry
 */

import { useEffect, useState } from "react";
import type {
  ScoreboardData,
  SpotProgressEntry,
} from "@/lib/poker/monthlyScoreboard";
import { getTierCopy } from "@/lib/poker/tierCopy";

type EmptyReason = "abandoned" | "no_saved_plan" | "elite_no_track";

type Response =
  | ({ hasScoreboard: true } & ScoreboardData)
  | { hasScoreboard: false; reason: EmptyReason };

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: ScoreboardData }
  | { kind: "empty"; reason: EmptyReason }
  | { kind: "error" };

interface Props {
  diagnosticId: string;
  /** Tier do aluno (1..3) vindo do nivelamento. Opcional pra back-compat
   *  com callers que ainda não passam — sem prop, scoreboardContext não
   *  renderiza. */
  playerTier?: number | null;
}

const EMPTY_MESSAGE: Record<EmptyReason, string> = {
  abandoned:      "Você ainda não jogou nenhum spot.",
  no_saved_plan:  "Plano ainda não gerado.",
  elite_no_track: "Sem trilha esse ciclo — fala com seu EV.",
};

const STATE_LABEL: Record<SpotProgressEntry["state"], string> = {
  completed: "Concl.",
  active:    "Ativo",
  locked:    "Bloq.",
};

const STATE_DOT: Record<SpotProgressEntry["state"], string> = {
  completed: "bg-emerald-500",
  active:    "bg-yellow-400",
  locked:    "bg-neutral-600",
};

const STATE_BAR: Record<SpotProgressEntry["state"], string> = {
  completed: "bg-emerald-500",
  active:    "bg-amber-400",
  locked:    "bg-neutral-700",
};

export function MonthlyScoreboard({ diagnosticId, playerTier }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/plan/scoreboard/${encodeURIComponent(diagnosticId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`http ${r.status}`);
        return (await r.json()) as Response;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.hasScoreboard) {
          setState({ kind: "ready", data });
        } else {
          setState({ kind: "empty", reason: data.reason });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[MonthlyScoreboard] fetch", err);
        setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [diagnosticId, reloadTick]);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 sm:p-4 print:hidden">
      {state.kind === "loading" && (
        <p className="text-sm text-neutral-500">Carregando seu placar…</p>
      )}

      {state.kind === "empty" && (
        <>
          <p className="text-[11px] uppercase tracking-widest text-neutral-500">
            Placar mensal
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            {EMPTY_MESSAGE[state.reason]}
          </p>
        </>
      )}

      {state.kind === "error" && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-neutral-400">
            Não foi possível carregar o placar.
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
        <ReadyView data={state.data} playerTier={playerTier} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes do estado ready
// ---------------------------------------------------------------------------

function ReadyView({
  data,
  playerTier,
}: {
  data: ScoreboardData;
  playerTier?: number | null;
}) {
  const monthLabel = data.month.label.toUpperCase();
  return (
    <>
      <p className="text-[11px] uppercase tracking-widest text-neutral-500">
        Metas do mês · {monthLabel}
      </p>
      {playerTier != null && (
        <p className="text-xs text-neutral-500" style={{ marginTop: 4 }}>
          {getTierCopy(playerTier).scoreboardContext}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ScoreCard score={data.score} />
        <GoalCard
          icon="🎯"
          label="Spots"
          value={`${data.spots.completed} / ${data.spots.goal}`}
          sub={
            data.spots.goal > 0
              ? `${Math.min(100, Math.round((data.spots.completed / data.spots.goal) * 100))}%`
              : "—"
          }
          accent={
            data.spots.goal === 0
              ? "neutral"
              : data.spots.completed >= data.spots.goal
                ? "emerald"
                : data.spots.completed > 0
                  ? "amber"
                  : "neutral"
          }
        />
        <VolumeCard volume={data.volume} />
        <GoalCard
          icon="🃏"
          label="Mãos"
          value={`— / ${data.hands.goal}`}
          sub="em breve"
          accent="neutral"
        />
      </div>

      <div className="mt-3 border-t border-neutral-800/60 pt-3">
        <p className="text-[11px] uppercase tracking-widest text-neutral-500">
          Evolução por spot
        </p>
        <ul className="mt-2 space-y-3">
          {data.spotProgress.map((s) => (
            <SpotRow key={`${s.index}-${s.leakId ?? "empty"}`} s={s} />
          ))}
        </ul>
      </div>
    </>
  );
}

function GoalCard({
  icon, label, value, sub, accent,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  accent: "emerald" | "amber" | "neutral";
}) {
  const valueColor =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "amber"
        ? "text-amber-300"
        : "text-neutral-200";
  return (
    <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/40 p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
          {label}
        </span>
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${valueColor}`}>
        {value}
      </div>
      <div className="text-[11px] text-neutral-500 truncate" title={sub}>
        {sub}
      </div>
    </div>
  );
}

function VolumeCard({
  volume,
}: {
  volume: { goal: number | null; current: number | null; hasSharkscope: boolean };
}) {
  // 3 estados especiais antes de cair no card padrão.
  if (volume.goal === null) {
    return (
      <GoalCard
        icon="⚡"
        label="Volume"
        value="— / —"
        sub="sem meta"
        accent="neutral"
      />
    );
  }
  if (volume.current === null && !volume.hasSharkscope) {
    return (
      <GoalCard
        icon="⚡"
        label="Volume"
        value={`— / ${volume.goal}`}
        sub="Conecte SharkScope"
        accent="neutral"
      />
    );
  }
  if (volume.current === null) {
    return (
      <GoalCard
        icon="⚡"
        label="Volume"
        value={`0 / ${volume.goal}`}
        sub="sem dados do mês"
        accent="neutral"
      />
    );
  }
  const pct = Math.min(100, Math.round((volume.current / volume.goal) * 100));
  const accent: "emerald" | "amber" | "neutral" =
    volume.current >= volume.goal
      ? "emerald"
      : volume.current > 0
        ? "amber"
        : "neutral";
  return (
    <GoalCard
      icon="⚡"
      label="Volume"
      value={`${volume.current} / ${volume.goal}`}
      sub={`${pct}%`}
      accent={accent}
    />
  );
}

function ScoreCard({
  score,
}: {
  score: { goal: number; current: number | null };
}) {
  if (score.current === null) {
    return (
      <GoalCard
        icon="❤️"
        label="Score"
        value={`— / ${score.goal}`}
        sub="calculando"
        accent="neutral"
      />
    );
  }
  const accent: "emerald" | "amber" | "neutral" =
    score.current >= score.goal
      ? "emerald"
      : score.current > 0
        ? "amber"
        : "neutral";
  const sub =
    score.current >= score.goal ? "acima da meta" : "abaixo da meta";
  return (
    <GoalCard
      icon="❤️"
      label="Score"
      value={`${score.current} / ${score.goal}`}
      sub={sub}
      accent={accent}
    />
  );
}

function SpotRow({ s }: { s: SpotProgressEntry }) {
  const accuracyColor =
    s.accuracyPct === null
      ? "text-neutral-600"
      : s.accuracyPct >= 70
        ? "text-emerald-400"
        : "text-amber-400";
  const accuracyText =
    s.accuracyPct === null ? "—" : `${s.accuracyPct}%`;
  return (
    <li>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-neutral-600 tabular-nums w-5">{s.index}.</span>
        <span className="flex-1 truncate text-neutral-200">{s.spotLabel}</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-300">
          <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[s.state]}`} />
          {STATE_LABEL[s.state]}
        </span>
        <span className="text-neutral-400 tabular-nums text-xs">
          {s.handsPlayed}/{s.handsTarget}
        </span>
        <span className={`tabular-nums text-xs ${accuracyColor}`}>
          · {accuracyText}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full ${STATE_BAR[s.state]}`}
          style={{ width: `${s.progressPct}%` }}
        />
      </div>
    </li>
  );
}
