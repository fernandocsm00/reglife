"use client";

/**
 * HealthScoreBlock — Bloco grande do Health Score no /meu-plano.
 *
 * Fetch GET /api/health/me?diag=<id>. Renderiza:
 *   - número grande (0-100)
 *   - barra de progresso colorida por band
 *   - 3 pílulas: Resultado / Conclusão / Sentimento
 *
 * Se não houver snapshot ainda → empty state.
 */

import { useEffect, useState } from "react";

type Band = "green" | "yellow" | "orange" | "red";

interface Breakdown {
  resultado: number | null;
  conclusao: number | null;
  sentimento: number | null;
  leaksClosed?: number;
  leaksTotal?: number;
}

interface Snapshot {
  day: string;
  health: number;
  band: Band;
  breakdown: Breakdown | null;
}

interface Props {
  diagnosticId: string | undefined;
  mode?: "self" | "admin";
}

const BAND_LABEL: Record<Band, string> = {
  green:  "VERDE",
  yellow: "AMARELO",
  orange: "LARANJA",
  red:    "VERMELHO",
};

const BAND_BAR: Record<Band, string> = {
  green:  "bg-emerald-500",
  yellow: "bg-yellow-400",
  orange: "bg-orange-500",
  red:    "bg-red-500",
};

const BAND_TEXT: Record<Band, string> = {
  green:  "text-emerald-300",
  yellow: "text-yellow-300",
  orange: "text-orange-300",
  red:    "text-red-300",
};

export function HealthScoreBlock({ diagnosticId, mode = "self" }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null | undefined>(undefined);
  const [history, setHistory] = useState<Snapshot[]>([]);

  useEffect(() => {
    if (!diagnosticId) {
      setSnapshot(null);
      return;
    }
    let mounted = true;

    const url =
      mode === "admin"
        ? `/api/admin/health/${encodeURIComponent(diagnosticId)}`
        : `/api/health/me?diag=${encodeURIComponent(diagnosticId)}`;

    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted) return;
        if (mode === "admin") {
          setSnapshot((data?.snapshot as Snapshot | null) ?? null);
          setHistory((data?.history as Snapshot[]) ?? []);
        } else {
          setSnapshot((data?.snapshot as Snapshot | null) ?? null);
        }
      })
      .catch(() => {
        if (mounted) setSnapshot(null);
      });

    return () => {
      mounted = false;
    };
  }, [diagnosticId, mode]);

  if (snapshot === undefined) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-500 print:hidden">
        Carregando seu Health Score…
      </div>
    );
  }

  if (snapshot === null) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-400 print:hidden">
        <p className="font-semibold text-neutral-200">Health Score</p>
        <p className="mt-1 text-xs text-neutral-500">
          Seu Health Score aparece aqui depois do primeiro cálculo (cron diário 06h UTC).
        </p>
      </div>
    );
  }

  const { health, band, breakdown } = snapshot;
  const pct = Math.max(0, Math.min(100, Math.round(health)));

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5 print:hidden">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-widest text-neutral-500">
          Health Score
        </p>
        <p className={`text-[11px] uppercase tracking-widest ${BAND_TEXT[band]}`}>
          {BAND_LABEL[band]}
        </p>
      </div>

      <div className="mt-2 flex items-end gap-4">
        <div className={`text-5xl font-bold tabular-nums ${BAND_TEXT[band]}`}>{pct}</div>
        <div className="flex-1 pb-2">
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className={`h-full rounded-full ${BAND_BAR[band]}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <Pill label="Resultado"  value={breakdown?.resultado} />
        <Pill label="Conclusão"  value={breakdown?.conclusao} />
        <Pill label="Sentimento" value={breakdown?.sentimento} />
      </div>

      {breakdown?.leaksTotal != null && breakdown.leaksTotal > 0 && (
        <p className="mt-3 text-[11px] text-neutral-500">
          Leaks fechados: <span className="text-neutral-300">{breakdown.leaksClosed ?? 0}/{breakdown.leaksTotal}</span>
        </p>
      )}

      {mode === "admin" && history.length > 1 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">
            Últimos {history.length} dias
          </p>
          <Sparkline history={history} className="mt-1" />
        </div>
      )}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: number | null | undefined }) {
  const display =
    value === null || value === undefined ? "—" : Math.round(value).toString();
  const tone =
    value === null || value === undefined ? "text-neutral-500" : "text-neutral-200";
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${tone}`} title={display === "—" ? "Sem dados ainda" : undefined}>
        {display}
      </div>
    </div>
  );
}

function Sparkline({
  history,
  className = "",
}: {
  history: Snapshot[];
  className?: string;
}) {
  if (history.length < 2) return null;
  const w = 220;
  const h = 36;
  const values = history.map((s) => s.health);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = history.map((s, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = h - ((s.health - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg
      width={w}
      height={h}
      className={className}
      role="img"
      aria-label={`Health Score dos últimos ${history.length} dias`}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        points={points.join(" ")}
        className="text-emerald-300"
      />
    </svg>
  );
}
