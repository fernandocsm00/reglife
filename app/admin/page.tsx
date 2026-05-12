"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { DiagnosticRow } from "@/lib/supabase";

const SECRET = "reglife2024";

const SS_NETWORKS = [
  "PokerStars",
  "GGPoker",
  "PartyPoker",
  "888Poker",
  "WPN",
  "iPoker",
] as const;
type SsNetwork = (typeof SS_NETWORKS)[number];

function formatRoi(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

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

const LEAD_BADGE: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  super_quente: { label: "Super Quente", bg: "bg-red-500/20",     text: "text-red-300" },
  quente:       { label: "Quente",       bg: "bg-amber-500/20",   text: "text-amber-300" },
  morno:        { label: "Morno",        bg: "bg-yellow-500/15",  text: "text-yellow-300" },
  frio:         { label: "Frio",         bg: "bg-sky-500/15",     text: "text-sky-300" },
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
  const [ssTarget, setSsTarget] = useState<DiagnosticRow | null>(null);

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

  function handleSsUpdated(updated: DiagnosticRow) {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSsTarget(updated);
  }

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
                  <th className="px-4 py-3 text-center">Lead</th>
                  <th className="px-4 py-3 text-left">Meta / Dedicação</th>
                  <th className="px-4 py-3 text-center">Spots</th>
                  <th className="px-4 py-3 text-center">Média</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-left">Shark</th>
                  <th className="px-4 py-3 text-left">Realizado em</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-neutral-600">
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
                    <td className="px-4 py-3 text-center">
                      {row.lead_category && LEAD_BADGE[row.lead_category] ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEAD_BADGE[row.lead_category].bg} ${LEAD_BADGE[row.lead_category].text}`}
                          >
                            {LEAD_BADGE[row.lead_category].label}
                          </span>
                          {row.lead_score != null && (
                            <span className="text-[10px] text-neutral-600 tabular-nums">
                              {row.lead_score}/25
                              {row.stake_grade != null && ` · $${row.stake_grade}`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-700">—</span>
                      )}
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
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSsTarget(row)}
                        className="text-left"
                        title="Conectar / atualizar SharkScope"
                      >
                        {row.sharkscope_playergroup_id || row.sharkscope_username ? (
                          <div className="text-xs">
                            <div className="flex items-center gap-1.5 font-mono text-neutral-200 hover:text-amber-300 transition-colors">
                              {row.sharkscope_playergroup_id ? (
                                <>
                                  <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-purple-300">
                                    Group
                                  </span>
                                  <span>{row.sharkscope_playergroup_id}</span>
                                </>
                              ) : (
                                row.sharkscope_username
                              )}
                            </div>
                            <div className="text-neutral-600">
                              {row.sharkscope_network ?? "—"}
                              {row.sharkscope_summary?.avgRoi != null && (
                                <span
                                  className={`ml-2 ${
                                    row.sharkscope_summary.avgRoi >= 0
                                      ? "text-emerald-400"
                                      : "text-red-400"
                                  }`}
                                >
                                  ROI {formatRoi(row.sharkscope_summary.avgRoi)}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="rounded-md border border-dashed border-neutral-700 px-2 py-1 text-xs text-neutral-500 hover:border-amber-500 hover:text-amber-400 transition-colors">
                            + Conectar
                          </span>
                        )}
                      </button>
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

      {ssTarget && (
        <SharkscopeModal
          row={ssTarget}
          onClose={() => setSsTarget(null)}
          onUpdated={handleSsUpdated}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal: conectar / atualizar SharkScope de um aluno
// ---------------------------------------------------------------------------
function SharkscopeModal({
  row,
  onClose,
  onUpdated,
}: {
  row: DiagnosticRow;
  onClose: () => void;
  onUpdated: (row: DiagnosticRow) => void;
}) {
  const [mode, setMode] = useState<"player" | "playergroup">(
    row.sharkscope_playergroup_id ? "playergroup" : "player"
  );
  const [username, setUsername] = useState(row.sharkscope_username ?? "");
  const [playergroupId, setPlayergroupId] = useState(
    row.sharkscope_playergroup_id ?? ""
  );
  const [network, setNetwork] = useState<SsNetwork>(
    (row.sharkscope_network as SsNetwork) ?? "PokerStars"
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function sync() {
    setBusy(true);
    setErr("");
    try {
      // Em "player" mode, limpa o group id (manda string vazia pro endpoint).
      // Em "playergroup" mode, mantém o username (pode ser útil pra fallback)
      // mas o sync usa o group.
      const res = await fetch("/api/sharkscope/sync-diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosticId: row.id,
          username: username.trim(),
          playergroupId: mode === "playergroup" ? playergroupId.trim() : "",
          network,
          secret: SECRET,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErr(data.error ?? `HTTP ${res.status}`);
        return;
      }
      onUpdated({
        ...row,
        sharkscope_username: data.username,
        sharkscope_playergroup_id: data.playergroupId ?? null,
        sharkscope_network: data.network,
        sharkscope_last_sync: new Date().toISOString(),
        sharkscope_summary: data.summary,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setBusy(false);
    }
  }

  const summary = row.sharkscope_summary;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-6 text-neutral-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">SharkScope</h2>
            <p className="text-xs text-neutral-500">{row.player_name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-200"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Toggle modo */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Origem dos dados
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("player")}
                className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
                  mode === "player"
                    ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                Player único
              </button>
              <button
                type="button"
                onClick={() => setMode("playergroup")}
                className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
                  mode === "playergroup"
                    ? "border-purple-400/60 bg-purple-400/10 text-purple-300"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                PlayerGroup (consolidado)
              </button>
            </div>
            <p className="mt-2 text-[11px] text-neutral-600">
              {mode === "playergroup"
                ? "Use quando o aluno tem várias contas / multi-skin. O identificador é o nome do Player Group exibido no SharkScope (ex: rafaelbsoave-COM)."
                : "Padrão: usa o nick público do jogador no site escolhido."}
            </p>
          </div>

          {mode === "player" ? (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Nick no site
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: hero123"
                className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-amber-400/60"
                autoFocus
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Nome do Player Group
              </label>
              <input
                type="text"
                value={playergroupId}
                onChange={(e) => setPlayergroupId(e.target.value)}
                placeholder="Ex: rafaelbsoave-COM"
                className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-purple-400/60"
                autoFocus
              />
              <p className="mt-1 text-[11px] text-neutral-600">
                No SharkScope: dropdown &quot;Grupo de Jogadores&quot; → o nome
                exato exibido (ex: <code>rafaelbsoave-COM</code>). É o que vai
                no path da API: <code>/playergroups/&lt;nome&gt;</code>.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Network
            </label>
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value as SsNetwork)}
              className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-amber-400/60"
            >
              {SS_NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {err && (
            <p className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {err}
            </p>
          )}

          {summary && (
            <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-3 text-xs">
              <p className="mb-2 font-semibold text-neutral-400">Último snapshot</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-neutral-500">Torneios</div>
                  <div className="font-bold tabular-nums">
                    {summary.entries ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500">ROI médio</div>
                  <div
                    className={`font-bold tabular-nums ${
                      (summary.avgRoi ?? 0) >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {formatRoi(summary.avgRoi)}
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500">ITM</div>
                  <div className="font-bold tabular-nums">
                    {summary.itm != null ? `${summary.itm.toFixed(1)}%` : "—"}
                  </div>
                </div>
              </div>
              {row.sharkscope_last_sync && (
                <p className="mt-2 text-center text-[11px] text-neutral-600">
                  Atualizado{" "}
                  {new Date(row.sharkscope_last_sync).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          )}

          <button
            onClick={sync}
            disabled={
              busy ||
              (mode === "player"
                ? username.trim().length < 2
                : playergroupId.trim().length < 1)
            }
            className="w-full rounded-md bg-amber-300 px-4 py-2.5 text-sm font-bold text-neutral-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Sincronizando…" : "Salvar e sincronizar"}
          </button>
        </div>
      </div>
    </div>
  );
}
