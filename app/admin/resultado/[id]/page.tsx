"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { HealthScoreBlock } from "@/components/trainer/HealthScoreBlock";
import type { DiagnosticRow } from "@/lib/supabase";

const STUDY_LABELS: Record<string, string> = {
  ate15:  "Até 15h/sem",
  ate30:  "Até 30h/sem",
  ate50:  "Até 50h/sem",
  mais50: "50h+/sem",
};
const PROFIT_LABELS: Record<string, string> = {
  usd1k:   "U$1.000",
  usd10k:  "U$10.000",
  usd50k:  "U$50.000",
  usd100k: "U$100.000",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export default function ResultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [row, setRow] = useState<DiagnosticRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSpot, setActiveSpot] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/results`)
      .then((r) => r.json())
      .then((data: DiagnosticRow[]) => {
        const found = data.find((d) => d.id === id);
        if (found) {
          setRow(found);
          setActiveSpot(found.spot_summaries[0]?.label ?? null);
        } else {
          router.replace("/admin");
        }
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading || !row) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        Carregando…
      </div>
    );
  }

  const overallPct = row.spot_summaries.length
    ? Math.round(row.spot_summaries.reduce((a, s) => a + s.pct, 0) / row.spot_summaries.length)
    : 0;

  // Group results by spot label
  const bySpot: Record<string, typeof row.results> = {};
  for (const r of row.results) {
    (bySpot[r.spotLabel] ??= []).push(r);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Header */}
      <div className="border-b border-neutral-800 px-6 py-4 flex items-center gap-4">
        <Logo size="md" />
        <span className="text-neutral-500 text-sm">/ Admin /</span>
        <Link href="/admin" className="text-neutral-400 hover:text-neutral-200 text-sm transition-colors">
          Lista
        </Link>
        <span className="text-neutral-700">/</span>
        <span className="text-neutral-200 text-sm">{row.player_name}</span>
        {/* Só mostra pra quem completou e tem plano — abandonado e elite
            (passou em todos) não têm saved_plan, /r daria 404. */}
        {row.spots_played > 0 && !row.spot_summaries.every((s) => s.passed) && (
          <a
            href={`/r/${row.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 hover:border-amber-400 transition-colors"
          >
            ↓ Baixar PDF
          </a>
        )}
      </div>

      <div className="mx-auto max-w-6xl px-6 pt-6">
        <HealthScoreBlock diagnosticId={row.id} mode="admin" />
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">

        {/* Player card */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Jogador</p>
            <p className="font-bold text-lg">{row.player_name}</p>
            <p className="text-sm text-neutral-400">{row.email ?? "—"}</p>
            {row.phone && <p className="text-xs text-neutral-600">{row.phone}</p>}
          </div>
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Meta</p>
            <p className="font-semibold">{PROFIT_LABELS[row.profit_goal ?? ""] ?? "—"}</p>
            <p className="text-xs text-neutral-500">{STUDY_LABELS[row.study_time ?? ""] ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Resultado</p>
            <p className="text-2xl font-black" style={{ color: overallPct >= 70 ? "#34d399" : "#fbbf24" }}>
              {overallPct}%
            </p>
            <p className="text-xs text-neutral-500">média geral</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Status</p>
            {row.spots_played === 0 ? (
              <span className="inline-block rounded-full bg-neutral-800 px-3 py-1 text-sm text-neutral-400">
                Abandonou
              </span>
            ) : row.stopped_early ? (
              <span className="inline-block rounded-full bg-red-900/40 px-3 py-1 text-sm text-red-400">
                Early stop ({row.spots_failed} falhas)
              </span>
            ) : row.spot_summaries.every((s) => s.passed) ? (
              <span className="inline-block rounded-full bg-amber-500/20 px-3 py-1 text-sm font-semibold text-amber-300">
                Elite — passou em tudo
              </span>
            ) : (
              <span className="inline-block rounded-full bg-emerald-900/40 px-3 py-1 text-sm text-emerald-400">
                Completo
              </span>
            )}
            <p className="text-xs text-neutral-500 mt-1">{formatDate(row.created_at)}</p>
          </div>
        </div>

        {/* Spot summary grid */}
        <div>
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">
            Resultado por spot
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {row.spot_summaries.map((s) => (
              <button
                key={s.label}
                onClick={() => setActiveSpot(activeSpot === s.label ? null : s.label)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  activeSpot === s.label
                    ? "border-emerald-600 bg-emerald-900/20"
                    : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${s.passed ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="text-xs text-neutral-600">Tier {s.tier}</span>
                </div>
                <p className="text-xs font-medium text-neutral-300 leading-tight mb-2">{s.label}</p>
                <div className="flex items-baseline gap-1">
                  <span className={`text-xl font-black ${s.passed ? "text-emerald-400" : "text-red-400"}`}>
                    {s.pct}%
                  </span>
                  <span className="text-xs text-neutral-600">{s.correct}/{s.total}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Hand-by-hand detail for selected spot */}
        {activeSpot && bySpot[activeSpot] && (
          <div>
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">
              Mãos — {activeSpot}
            </h2>
            <div className="rounded-xl border border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-800 bg-neutral-900/60 text-xs text-neutral-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">Posição</th>
                    <th className="px-4 py-2 text-left">Stack</th>
                    <th className="px-4 py-2 text-left">Board</th>
                    <th className="px-4 py-2 text-left">Mão</th>
                    <th className="px-4 py-2 text-left">Resposta</th>
                    <th className="px-4 py-2 text-left">Esperado</th>
                    <th className="px-4 py-2 text-center">✓</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {bySpot[activeSpot].map((r, i) => (
                    <tr
                      key={i}
                      className={`${r.isCorrect ? "" : "bg-red-950/20"} text-xs`}
                    >
                      <td className="px-4 py-2 text-neutral-600">{i + 1}</td>
                      <td className="px-4 py-2 font-semibold">{r.position}</td>
                      <td className="px-4 py-2 text-neutral-400">{r.stackSize}bb</td>
                      <td className="px-4 py-2 font-mono text-neutral-400">
                        {r.board || <span className="text-neutral-700">—</span>}
                      </td>
                      <td className="px-4 py-2 font-mono font-bold">{r.hand}</td>
                      <td className={`px-4 py-2 font-medium ${r.isCorrect ? "text-emerald-400" : "text-red-400"}`}>
                        {r.picked}
                      </td>
                      <td className="px-4 py-2 text-neutral-400">
                        {r.expected.join(" / ")}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {r.isCorrect ? (
                          <span className="text-emerald-400">✓</span>
                        ) : (
                          <span className="text-red-400">✗</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
