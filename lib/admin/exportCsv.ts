// lib/admin/exportCsv.ts — Exporta DiagnosticRow[] como CSV pra download.

import type { DiagnosticRow } from "@/lib/supabase";
import {
  ABI_OPTIONS,
  BANCA_OPTIONS,
  IDADE_OPTIONS,
  LEAD_CATEGORY_LABELS,
  OBJETIVO_OPTIONS,
  TEMPO_OPTIONS,
  VOLUME_OPTIONS,
  type QuizOption,
} from "@/lib/poker/leadScoring";

const STUDY_LABELS: Record<string, string> = {
  ate15: "Até 15h/sem",
  ate40: "Até 40h/sem",
  mais40: "Mais de 40h/sem",
};

const PROFIT_LABELS: Record<string, string> = {
  usd1k: "USD 1.000",
  usd10k: "USD 10.000",
  usd50k: "USD 50.000",
  usd100k: "USD 100.000",
};

function labelOf<T extends string>(
  options: QuizOption<T>[],
  value: string | null | undefined
): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? value;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function avgAccuracy(row: DiagnosticRow): number {
  if (!row.spot_summaries.length) return 0;
  return Math.round(
    row.spot_summaries.reduce((a, s) => a + s.pct, 0) /
      row.spot_summaries.length
  );
}

/** Escapa um valor pra um campo de CSV (RFC 4180). */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const HEADERS: string[] = [
  "Data",
  "Nome",
  "Email",
  "Telefone",
  "Categoria Lead",
  "Lead Score",
  "Stake Grade (USD)",
  "Objetivo",
  "Idade",
  "Tempo Jogando",
  "ABI",
  "Volume/mês",
  "Banca",
  "Meta de Profit",
  "Tempo de Estudo",
  "Volume Target (semana)",
  "Spots Jogados",
  "Spots Reprovados",
  "Média Acerto (%)",
  "Early Stop",
  "Sharkscope Nick",
  "Sharkscope Network",
  "Sharkscope Group",
  "ROI Médio (Sharkscope)",
  "Diagnostic ID",
];

function rowToCells(row: DiagnosticRow): string[] {
  const quiz = (row.quiz_answers ?? {}) as Record<string, string>;
  return [
    fmtDate(row.created_at),
    row.player_name ?? "",
    row.email ?? "",
    row.phone ?? "",
    row.lead_category ? LEAD_CATEGORY_LABELS[row.lead_category as keyof typeof LEAD_CATEGORY_LABELS] ?? row.lead_category : "",
    row.lead_score?.toString() ?? "",
    row.stake_grade?.toString() ?? "",
    labelOf(OBJETIVO_OPTIONS, quiz.objetivo),
    labelOf(IDADE_OPTIONS, quiz.idade),
    labelOf(TEMPO_OPTIONS, quiz.tempo),
    labelOf(ABI_OPTIONS, quiz.abi),
    labelOf(VOLUME_OPTIONS, quiz.volume),
    labelOf(BANCA_OPTIONS, quiz.banca),
    PROFIT_LABELS[row.profit_goal ?? ""] ?? row.profit_goal ?? "",
    STUDY_LABELS[row.study_time ?? ""] ?? row.study_time ?? "",
    row.volume_target_weekly?.toString() ?? "",
    row.spots_played?.toString() ?? "0",
    row.spots_failed?.toString() ?? "0",
    avgAccuracy(row).toString(),
    row.stopped_early ? "Sim" : "Não",
    row.sharkscope_username ?? "",
    row.sharkscope_network ?? "",
    row.sharkscope_playergroup_id ?? "",
    row.sharkscope_summary?.avgRoi != null
      ? `${row.sharkscope_summary.avgRoi.toFixed(1)}%`
      : "",
    row.id,
  ];
}

export function rowsToCsv(rows: DiagnosticRow[]): string {
  const lines = [HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(rowToCells(row).map(csvCell).join(","));
  }
  return lines.join("\n");
}

/**
 * Gera o CSV e dispara download no navegador.
 * Inclui BOM UTF-8 (﻿) pra o Excel reconhecer acentuação.
 */
export function downloadLeadsCsv(rows: DiagnosticRow[]): void {
  const csv = rowsToCsv(rows);
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `reglife-leads-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
