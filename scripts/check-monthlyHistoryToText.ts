// Verificação pura — roda com: npx tsx scripts/check-monthlyHistoryToText.ts
import {
  monthlyHistoryToText,
  type MonthlyStatsRow,
} from "../lib/sharkscope";

let failed = 0;
function expect(name: string, cond: boolean, debug?: unknown) {
  if (!cond) {
    console.error(`FAIL ${name}`, debug !== undefined ? `→ ${JSON.stringify(debug)}` : "");
    failed++;
  }
}

// --- Caso 1: 3 meses, mês corrente em andamento (maio/2026) ---
const rows3: MonthlyStatsRow[] = [
  { year: 2026, month: 5, entries: 142, profit: 340,  avg_roi: 8.2,  itm: 14.1, final_tables: 3 },
  { year: 2026, month: 4, entries: 287, profit: -120, avg_roi: -3.4, itm: 11.8, final_tables: 6 },
  { year: 2026, month: 3, entries: 198, profit: 520,  avg_roi: 12.1, itm: 15.6, final_tables: 5 },
];
const out3 = monthlyHistoryToText(rows3, { currentYear: 2026, currentMonth: 5 });

expect("inclui cabeçalho", out3.includes("=== ÚLTIMOS MESES (SharkScope) ==="), out3);
expect("inclui Maio/2026 com sufixo (em andamento)", out3.includes("Maio/2026 (em andamento)"), out3);
expect("inclui Abril/2026 sem sufixo (em andamento)", out3.includes("Abril/2026:") && !out3.includes("Abril/2026 (em andamento)"), out3);
expect("inclui Março/2026 sem sufixo", out3.includes("Março/2026:") && !out3.includes("Março/2026 (em andamento)"), out3);
expect("formata profit positivo com +", out3.includes("+$340"), out3);
expect("formata profit negativo com -", out3.includes("-$120"), out3);
expect("formata ROI positivo com +", out3.includes("+8.2%"), out3);
expect("formata ROI negativo com -", out3.includes("-3.4%"), out3);
expect("inclui ITM", out3.includes("14.1%"), out3);

// --- Caso 2: lista vazia → string vazia ---
const outEmpty = monthlyHistoryToText([], { currentYear: 2026, currentMonth: 5 });
expect("lista vazia devolve string vazia", outEmpty === "", outEmpty);

// --- Caso 3: 1 mês só, sem opts (sem marcação "em andamento") ---
const rows1: MonthlyStatsRow[] = [
  { year: 2026, month: 4, entries: 80, profit: 0, avg_roi: 0, itm: 10, final_tables: 0 },
];
const out1 = monthlyHistoryToText(rows1);
expect("1 mês sem opts: aparece linha do mês", out1.includes("Abril/2026:"), out1);
expect("1 mês sem opts: NÃO aparece (em andamento)", !out1.includes("(em andamento)"), out1);

// --- Caso 4: aluno sem volume no mês corrente → 0 torneios (não 'N/A') ---
const rowsZero: MonthlyStatsRow[] = [
  { year: 2026, month: 5, entries: 0, profit: 0, avg_roi: null, itm: null, final_tables: null },
];
const outZero = monthlyHistoryToText(rowsZero, { currentYear: 2026, currentMonth: 5 });
expect("entries=0 mostra '0 torneios'", outZero.includes("0 torneios"), outZero);
expect("entries=0 NÃO mostra 'N/A torneios'", !outZero.includes("N/A torneios"), outZero);
expect("entries=0 do mês corrente mantém '(em andamento)'", outZero.includes("(em andamento)"), outZero);

// --- Caso 5: avg_roi null → 'N/A' no ROI (não bloqueia render) ---
const rowsNullRoi: MonthlyStatsRow[] = [
  { year: 2026, month: 4, entries: 50, profit: 100, avg_roi: null, itm: null, final_tables: null },
];
const outNullRoi = monthlyHistoryToText(rowsNullRoi);
expect("avg_roi null: linha aparece", outNullRoi.includes("Abril/2026:"), outNullRoi);
expect("avg_roi null: ROI mostra N/A", outNullRoi.includes("ROI N/A"), outNullRoi);

// --- Caso 6: meses pt-BR corretos ---
const monthsMap: Array<[number, string]> = [
  [1, "Janeiro"], [2, "Fevereiro"], [3, "Março"], [4, "Abril"],
  [5, "Maio"], [6, "Junho"], [7, "Julho"], [8, "Agosto"],
  [9, "Setembro"], [10, "Outubro"], [11, "Novembro"], [12, "Dezembro"],
];
for (const [m, label] of monthsMap) {
  const r: MonthlyStatsRow[] = [
    { year: 2026, month: m, entries: 10, profit: 0, avg_roi: 0, itm: 0, final_tables: 0 },
  ];
  const o = monthlyHistoryToText(r);
  expect(`mês ${m} → '${label}'`, o.includes(`${label}/2026`), o);
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("All monthlyHistoryToText checks passed");
