"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { DiagnosticRow } from "@/lib/supabase";
import { downloadLeadsCsv } from "@/lib/admin/exportCsv";
import { HealthTable } from "@/components/admin/HealthTable";

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
  const [tab, setTab] = useState<"leads" | "health">("leads");

  useEffect(() => {
    fetch(`/api/results`)
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
        {/* Tabs */}
        <div className="flex gap-2 border-b border-zinc-800 mb-6">
          <button
            onClick={() => setTab("leads")}
            className={`px-3 py-2 text-sm ${tab === "leads" ? "border-b-2 border-emerald-400 text-emerald-300" : "text-zinc-400"}`}
          >
            Leads
          </button>
          <button
            onClick={() => setTab("health")}
            className={`px-3 py-2 text-sm ${tab === "health" ? "border-b-2 border-emerald-400 text-emerald-300" : "text-zinc-400"}`}
          >
            Saúde da turma
          </button>
        </div>

        {tab === "health" ? (
          <HealthTable />
        ) : (
        <>
        {/* Search + actions */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => downloadLeadsCsv(filtered)}
            disabled={loading || filtered.length === 0}
            className="shrink-0 rounded-lg border border-emerald-700/50 bg-emerald-700/20 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-700/30 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              search
                ? `Exporta os ${filtered.length} leads filtrados`
                : `Exporta todos os ${rows.length} leads`
            }
          >
            📥 Exportar CSV
            {search && filtered.length !== rows.length && (
              <span className="ml-1 text-xs opacity-70">
                ({filtered.length})
              </span>
            )}
          </button>
        </div>

        {/* Stats bar */}
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { label: "Total de alunos",    value: rows.length },
              { label: "Concluíram tudo",    value: rows.filter((r) => !r.stopped_early && r.spots_played > 0).length },
              { label: "Early stop",         value: rows.filter((r) => r.stopped_early).length },
              { label: "Abandonaram",        value: rows.filter((r) => r.spots_played === 0).length },
              { label: "Média de acerto",    value: (() => {
                  const played = rows.filter((r) => r.spots_played > 0);
                  return played.length
                    ? Math.round(played.reduce((a, r) => a + avgPct(r), 0) / played.length) + "%"
                    : "—";
                })() },
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
                      {row.spots_played === 0 ? (
                        // Lead capturado pelo /api/leads no fim do quiz mas o
                        // /api/results UPDATE nunca rodou — abandono no teste
                        // técnico (ou falha na rota). Sem isso aparecia como
                        // "Completo" porque stopped_early default é false.
                        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                          Abandonou
                        </span>
                      ) : row.stopped_early ? (
                        <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs text-red-400">
                          Early stop
                        </span>
                      ) : row.spot_summaries.every((s) => s.passed) ? (
                        // Passou em TODOS os spots — foi roteado pra
                        // /reg-life-team em vez do plano. saved_plan é null.
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                          Elite
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
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/resultado/${row.id}`}
                          className="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-emerald-600 hover:text-emerald-400 transition-colors"
                        >
                          Ver detalhe →
                        </Link>
                        {row.spots_played > 0 &&
                          !row.spot_summaries.every((s) => s.passed) && (
                            // Só pra quem completou (ou early-stop) — abandonado
                            // e elite não tem saved_plan no banco, /r/[id] daria 404.
                            <a
                              href={`/r/${row.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Baixar PDF do plano em nova aba"
                              className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-amber-500 hover:text-amber-300 transition-colors"
                            >
                              PDF
                            </a>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>
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

  // Valores que NÃO devem ser submetidos — são exemplos pedagógicos que
  // historicamente foram copiados como se fossem nick válido. Inclui
  // variações de caixa pra pegar copy-paste literal do tooltip antigo.
  const FORBIDDEN_PLACEHOLDERS = new Set([
    "rafaelbsoave-com",
    "hero123",
  ]);

  function isPlaceholderValue(v: string): boolean {
    return FORBIDDEN_PLACEHOLDERS.has(v.trim().toLowerCase());
  }

  async function sync() {
    setBusy(true);
    setErr("");

    // Guard: bloqueia exemplos copiados literalmente do tooltip
    const currentValue =
      mode === "playergroup" ? playergroupId.trim() : username.trim();
    if (isPlaceholderValue(currentValue)) {
      setErr(
        `"${currentValue}" é só um exemplo do tooltip — não é um identificador real. ` +
          `Cole o nick/group do aluno no SharkScope.`
      );
      setBusy(false);
      return;
    }

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
                ? "PlayerGroup é um RECURSO ESPECÍFICO do SharkScope — só funciona se o aluno já criou um grupo lá agregando contas multi-skin. NÃO é onde você cola o nick. Se em dúvida, use Player único."
                : "Padrão: o nick público do jogador no site escolhido. É o que aparece na URL do perfil dele no SharkScope."}
            </p>
            {mode === "playergroup" && (
              <p className="mt-2 rounded border border-amber-700/40 bg-amber-900/20 px-2 py-1.5 text-[11px] text-amber-300">
                ⚠️ Errado mais comum: colar o nick do jogador aqui. Nick vai em <b>Player único</b>.
              </p>
            )}
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
                placeholder="Nick do jogador no SharkScope"
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
                placeholder="Nome do grupo no SharkScope"
                className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-purple-400/60"
                autoFocus
              />
              <p className="mt-1 text-[11px] text-neutral-600">
                Vai no path da API <code>/playergroups/&lt;nome&gt;</code>. Se o
                jogador não tem um Grupo de Jogadores configurado lá no painel
                do SharkScope, esse modo NÃO vai funcionar — volte pra Player
                único.
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
