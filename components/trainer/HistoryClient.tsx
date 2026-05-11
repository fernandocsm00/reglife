"use client";

/**
 * /historico — histórico mensal de SharkScope do aluno.
 *
 * - Lista cada mês com Entries / Profit / ROI / ITM / FinalTables
 * - Permite "Sincronizar este mês" (backfill on-demand) pra meses
 *   que ainda não passaram pelo cron mensal
 * - Resumo no topo: total acumulado dos meses listados
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Logo } from "@/components/Logo";
import { getStoredPlan, type SavedPlan } from "@/lib/poker/planStorage";

interface MonthlyRow {
  year: number;
  month: number;
  source: string;
  subject_value: string;
  network: string;
  entries: number | null;
  count_sessions: number | null;
  avg_stake: number | null;
  profit: number | null;
  avg_roi: number | null;
  total_roi: number | null;
  itm: number | null;
  avg_entrants: number | null;
  final_tables: number | null;
  re_entries: number | null;
  created_at: string;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function HistoryClient() {
  const [plan, setPlan] = useState<SavedPlan | null | undefined>(undefined);
  const [rows, setRows] = useState<MonthlyRow[] | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [subject, setSubject] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [loadingRows, setLoadingRows] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null); // "YYYY-MM"
  const [error, setError] = useState("");

  useEffect(() => {
    setPlan(getStoredPlan());
  }, []);

  const diagnosticId = plan?.diagnosticId;

  const load = useCallback(async () => {
    if (!diagnosticId) {
      setLoadingRows(false);
      return;
    }
    setLoadingRows(true);
    try {
      const res = await fetch(`/api/plan/history?userId=diag:${diagnosticId}`);
      const data = await res.json();
      setRows(data.rows ?? []);
      setConnected(!!data.connected);
      setSubject(data.subject ?? null);
      setSource(data.source ?? null);
    } catch {
      setError("Falha ao carregar histórico.");
    } finally {
      setLoadingRows(false);
    }
  }, [diagnosticId]);

  useEffect(() => {
    load();
  }, [load]);

  async function syncMonth(year: number, month: number) {
    if (!diagnosticId) return;
    const key = `${year}-${month}`;
    setSyncing(key);
    setError("");
    try {
      const res = await fetch("/api/plan/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: `diag:${diagnosticId}`,
          year,
          month,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao sincronizar");
      } else {
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSyncing(null);
    }
  }

  const missingMonths = useMemo(
    () => buildMissingMonths(plan?.createdAt, rows ?? []),
    [plan?.createdAt, rows]
  );

  const totals = useMemo(() => sumTotals(rows ?? []), [rows]);

  // States --------------------------------------------------------------
  if (plan === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center text-neutral-100">
        <Logo size="lg" className="mb-6" />
        <h1 className="text-2xl font-bold">Você ainda não tem um plano</h1>
        <p className="mt-3 max-w-md text-sm text-neutral-400">
          Faça o nivelamento da reglife pra desbloquear seu histórico mensal.
        </p>
        <Link
          href="/diagnostico"
          className="mt-8 rounded-md bg-amber-300 px-6 py-2 text-sm font-bold text-neutral-950 transition hover:bg-amber-200"
        >
          Começar nivelamento →
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Top bar */}
        <div className="mb-2 flex items-center justify-between gap-4">
          <Link
            href="/meu-plano"
            className="text-xs text-neutral-500 transition hover:text-neutral-200"
          >
            ← Meu plano
          </Link>
          <span className="rounded-full border border-purple-400/30 bg-purple-400/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-purple-300">
            Histórico SharkScope
          </span>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Logo size="lg" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
            Seu histórico mensal.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-neutral-300">
            Todo dia 1 do mês a gente puxa do SharkScope o resumo do mês
            anterior. Aqui você acompanha sua evolução de profit, ROI e volume
            ao longo do ciclo — pra análise sua mesmo.
          </p>
        </motion.div>

        {/* Sem SharkScope conectado */}
        {!loadingRows && !connected && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm text-amber-100">
            <p className="font-semibold">SharkScope ainda não está conectado.</p>
            <p className="mt-1 text-amber-200/80">
              Vai no <Link href="/meu-plano" className="underline">/meu-plano</Link>{" "}
              ou peça pro admin conectar seu nick (ou Player Group) — o histórico
              começa a popular automaticamente.
            </p>
          </div>
        )}

        {/* Conectado: badge mostrando o que está conectado */}
        {connected && subject && (
          <div className="mb-4 flex items-center gap-2 text-xs">
            <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-emerald-300">
              ✓ Conectado
            </span>
            <span className="text-neutral-400">
              {source === "playergroup" ? "Group" : "Player"}{" "}
              <code className="text-neutral-200">{subject}</code>
            </span>
          </div>
        )}

        {/* Resumo acumulado dos meses visíveis */}
        {(rows?.length ?? 0) > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Torneios" value={totals.entries.toLocaleString("pt-BR")} />
            <SummaryCard
              label="Profit acumulado"
              value={formatProfitBR(totals.profit)}
              accent={totals.profit >= 0 ? "emerald" : "red"}
            />
            <SummaryCard
              label="ROI médio"
              value={totals.avgRoiWeighted != null ? formatRoi(totals.avgRoiWeighted) : "—"}
              accent={(totals.avgRoiWeighted ?? 0) >= 0 ? "emerald" : "red"}
            />
            <SummaryCard
              label="ITM médio"
              value={totals.itmAvg != null ? `${totals.itmAvg.toFixed(1)}%` : "—"}
            />
          </div>
        )}

        {/* Tabela mensal */}
        {loadingRows && (
          <p className="py-10 text-center text-sm text-neutral-500">
            Carregando histórico…
          </p>
        )}

        {!loadingRows && (rows?.length ?? 0) > 0 && (
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-3 text-left">Mês</th>
                  <th className="px-4 py-3 text-right">Torneios</th>
                  <th className="px-4 py-3 text-right">Buy-in médio</th>
                  <th className="px-4 py-3 text-right">Profit</th>
                  <th className="px-4 py-3 text-right">ROI</th>
                  <th className="px-4 py-3 text-right">ITM</th>
                  <th className="px-4 py-3 text-right">FT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {rows!.map((r) => (
                  <tr key={`${r.year}-${r.month}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">
                        {MONTH_NAMES[r.month - 1]} {r.year}
                      </div>
                      <div className="text-[11px] text-neutral-600">
                        {r.source === "playergroup" ? "Group" : "Player"} ·{" "}
                        {r.network}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.entries ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                      {r.avg_stake != null ? `$${r.avg_stake.toFixed(2)}` : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-semibold ${
                        (r.profit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatProfitBR(r.profit ?? 0)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-semibold ${
                        (r.avg_roi ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {r.avg_roi != null ? formatRoi(r.avg_roi) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-300">
                      {r.itm != null ? `${r.itm.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                      {r.final_tables ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Backfill manual de meses faltando */}
        {missingMonths.length > 0 && connected && (
          <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Meses pra sincronizar manualmente
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              O cron roda no dia 1 de cada mês. Se quiser puxar agora um mês
              específico, clica abaixo. Mês corrente só aparece depois que ele
              fechar.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {missingMonths.map(({ year, month }) => {
                const key = `${year}-${month}`;
                const busy = syncing === key;
                return (
                  <button
                    key={key}
                    onClick={() => syncMonth(year, month)}
                    disabled={busy || syncing !== null}
                    className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-amber-400/40 hover:text-amber-300 disabled:opacity-40"
                  >
                    {busy
                      ? "Sincronizando…"
                      : `${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        {!loadingRows && connected && (rows?.length ?? 0) === 0 && (
          <p className="py-10 text-center text-sm text-neutral-500">
            Sem histórico ainda. Use os botões acima pra puxar meses anteriores.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatProfitBR(v: number): string {
  const abs = Math.abs(v);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v >= 0 ? `+$${s}` : `-$${s}`;
}

function formatRoi(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

interface Totals {
  entries: number;
  profit: number;
  avgRoiWeighted: number | null;
  itmAvg: number | null;
}

function sumTotals(rows: MonthlyRow[]): Totals {
  let entries = 0;
  let profit = 0;
  let roiNum = 0;
  let roiDen = 0;
  let itmSum = 0;
  let itmCount = 0;
  for (const r of rows) {
    entries += r.entries ?? 0;
    profit += r.profit ?? 0;
    if (r.avg_roi != null && (r.entries ?? 0) > 0) {
      roiNum += r.avg_roi * (r.entries ?? 0);
      roiDen += r.entries ?? 0;
    }
    if (r.itm != null) {
      itmSum += r.itm;
      itmCount += 1;
    }
  }
  return {
    entries,
    profit,
    avgRoiWeighted: roiDen > 0 ? roiNum / roiDen : null,
    itmAvg: itmCount > 0 ? itmSum / itmCount : null,
  };
}

/**
 * Lista de meses desde a criação do plano até o mês ANTERIOR ao atual,
 * filtrando os que já têm linha em rows.
 */
function buildMissingMonths(
  createdAt: number | undefined,
  rows: MonthlyRow[]
): { year: number; month: number }[] {
  if (!createdAt) return [];
  const start = new Date(createdAt);
  const end = new Date();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() - 1); // mês anterior ao atual

  const have = new Set(rows.map((r) => `${r.year}-${r.month}`));
  const out: { year: number; month: number }[] = [];

  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
  );
  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    if (!have.has(`${y}-${m}`)) out.push({ year: y, month: m });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    if (out.length > 24) break; // safety: máx 2 anos
  }
  return out.reverse(); // mais recente primeiro
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "red";
}) {
  const valueColor =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "red"
        ? "text-red-400"
        : "text-neutral-100";
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}
