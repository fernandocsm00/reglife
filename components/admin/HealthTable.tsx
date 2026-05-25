"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { HealthBand } from "@/lib/health/types";

type Band = HealthBand;

interface HealthRow {
  diagnosticId: string;
  playerName: string;
  cycleDay: number | null;
  day: string;
  health: number;
  band: Band;
  leaksClosed: number;
  leaksTotal: number;
}

interface Kpis {
  total: number;
  by_band: Record<Band, number>;
  avg_health: number | null;
}

const BAND_BG: Record<Band, string> = {
  red:    "bg-red-500/20    text-red-300",
  orange: "bg-orange-500/20 text-orange-300",
  yellow: "bg-yellow-500/20 text-yellow-300",
  green:  "bg-emerald-500/20 text-emerald-300",
};

const BAND_LABEL: Record<Band, string> = {
  red: "Vermelho", orange: "Laranja", yellow: "Amarelo", green: "Verde",
};

export function HealthTable() {
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bandFilter, setBandFilter] = useState<Band | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/health")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setRows(data.rows ?? []);
        setKpis(data.kpis ?? null);
      })
      .catch(() => setError("Erro de rede"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) => {
    if (bandFilter !== "all" && r.band !== bandFilter) return false;
    if (search && !r.playerName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <p className="text-sm text-zinc-400">Carregando saúde da turma…</p>;
  if (error)   return <p className="text-sm text-red-400">Erro: {error}</p>;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Kpi label="Total" value={kpis.total} />
          <Kpi label="HS médio" value={kpis.avg_health ?? "—"} />
          <Kpi label="Verde" value={kpis.by_band.green} className="text-emerald-400" />
          <Kpi label="Amarelo" value={kpis.by_band.yellow} className="text-yellow-400" />
          <Kpi label="Laranja" value={kpis.by_band.orange} className="text-orange-400" />
          <Kpi label="Vermelho" value={kpis.by_band.red} className="text-red-400" />
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={bandFilter}
          onChange={(e) => setBandFilter(e.target.value as Band | "all")}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"
        >
          <option value="all">Todas as faixas</option>
          <option value="red">Vermelho</option>
          <option value="orange">Laranja</option>
          <option value="yellow">Amarelo</option>
          <option value="green">Verde</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome…"
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm flex-1 max-w-xs"
        />
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-zinc-400 text-left">
            <tr>
              <th className="py-2">Aluno</th>
              <th className="py-2">HS</th>
              <th className="py-2">Faixa</th>
              <th className="py-2">Leaks</th>
              <th className="py-2">Ciclo</th>
              <th className="py-2">Atualizado</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.diagnosticId} className="border-t border-zinc-800">
                <td className="py-2">{r.playerName}</td>
                <td className="py-2 font-mono">{r.health.toFixed(0)}</td>
                <td className="py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${BAND_BG[r.band]}`}>
                    {BAND_LABEL[r.band]}
                  </span>
                </td>
                <td className="py-2 font-mono">
                  {r.leaksClosed}/{r.leaksTotal}
                </td>
                <td className="py-2">{r.cycleDay ?? "—"}/90</td>
                <td className="py-2 text-zinc-500">{r.day}</td>
                <td className="py-2">
                  <Link
                    href={`/admin/resultado/${r.diagnosticId}`}
                    className="text-emerald-400 hover:underline"
                  >
                    abrir →
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-zinc-500">
                  Sem alunos nessa faixa ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  className = "",
}: {
  label: string;
  value: number | string;
  className?: string;
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded p-3">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`text-2xl font-semibold ${className}`}>{value}</div>
    </div>
  );
}
