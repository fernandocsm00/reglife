"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { DiagnosticRow } from "@/lib/supabase";

const SECRET = "reglife2024";

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

export default function AdminPage() {
  const [rows, setRows] = useState<DiagnosticRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`/api/results?secret=${SECRET}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRows(data);
        else setError(data.error ?? "Erro ao carregar");
      })
      .catch(() => setError("Erro de rede"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) =>
    r.player_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const passed  = (r: DiagnosticRow) => r.spot_summaries.filter((s) => s.passed).length;
  const total   = (r: DiagnosticRow) => r.spot_summaries.length;
  const avgPct  = (r: DiagnosticRow) => {
    if (!r.spot_summaries.length) return 0;
    return Math.round(r.spot_summaries.reduce((a, s) => a + s.pct, 0) / r.spot_summaries.length);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Header */}
      <div className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Logo size="md" />
          <span className="text-neutral-500 text-sm">/ Admin</span>
        </div>
        <span className="text-xs text-neutral-600">
          {rows.length} diagnóstico{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* Search */}
        <input
          type="text"
          placeholder="Buscar por nome ou e-mail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-600 focus:outline-none"
        />

        {/* Stats bar */}
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total de alunos",    value: rows.length },
              { label: "Concluíram tudo",    value: rows.filter((r) => !r.stopped_early).length },
              { label: "Early stop",         value: rows.filter((r) => r.stopped_early).length },
              { label: "Média de acerto",    value: rows.length
                  ? Math.round(rows.reduce((a, r) => a + avgPct(r), 0) / rows.length) + "%"
                  : "—" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center">
                <div className="text-2xl font-black text-emerald-400">{s.value}</div>
                <div className="text-xs text-neutral-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* States */}
        {loading && (
          <p className="text-center text-neutral-500 py-12">Carregando…</p>
        )}
        {error && (
          <p className="text-center text-red-400 py-12">{error}</p>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900/60 text-xs text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Jogador</th>
                  <th className="px-4 py-3 text-left">Contato</th>
                  <th className="px-4 py-3 text-left">Meta / Dedicação</th>
                  <th className="px-4 py-3 text-center">Spots</th>
                  <th className="px-4 py-3 text-center">Média</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-left">Realizado em</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-neutral-600">
                      Nenhum resultado encontrado
                    </td>
                  </tr>
                )}
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-neutral-900/40 transition-colors">
                    <td className="px-4 py-3 font-medium">{row.player_name}</td>
                    <td className="px-4 py-3 text-neutral-400">
                      <div>{row.email ?? "—"}</div>
                      {row.phone && <div className="text-xs text-neutral-600">{row.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">
                      <div>{PROFIT_LABELS[row.profit_goal ?? ""] ?? row.profit_goal ?? "—"}</div>
                      <div className="text-neutral-600">{STUDY_LABELS[row.study_time ?? ""] ?? row.study_time ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">
                      <span className="text-emerald-400 font-semibold">{passed(row)}</span>
                      <span className="text-neutral-600">/{total(row)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${avgPct(row) >= 70 ? "text-emerald-400" : "text-amber-400"}`}>
                        {avgPct(row)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.stopped_early ? (
                        <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs text-red-400">
                          Early stop
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-400">
                          Completo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-500 text-xs whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/resultado/${row.id}`}
                        className="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-emerald-600 hover:text-emerald-400 transition-colors"
                      >
                        Ver detalhe →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
