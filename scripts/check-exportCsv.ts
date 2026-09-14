// Verificação pura — roda com: npx tsx scripts/check-exportCsv.ts
import type { DiagnosticRow } from "../lib/supabase";
import { rowsToCsv } from "../lib/admin/exportCsv";

let failed = 0;
function expect(name: string, cond: boolean, detail = "") {
  if (!cond) {
    console.error(`FAIL ${name} ${detail}`);
    failed++;
  }
}

const baseRow = {
  id: "abc",
  created_at: "2026-09-13T12:00:00Z",
  player_name: "Léo",
  email: "leo@x.com",
  phone: "+5511999999999",
  study_time: "ate40",
  profit_goal: "usd10k",
  stopped_early: false,
  spots_played: 2,
  spots_failed: 0,
  spot_summaries: [],
  results: [],
  sharkscope_username: null,
  sharkscope_network: null,
  sharkscope_playergroup_id: null,
  sharkscope_last_sync: null,
  sharkscope_summary: null,
  volume_target_weekly: 38,
  lead_score: null,
  lead_category: null,
  stake_grade: 2.5,
  product_profile: null,
  product_test: null,
  product_final: null,
  previous_diagnostic_id: null,
  quiz_answers: {
    idade: "25_34",
    tempoJogo: "gt_5",
    objetivo: "profissional",
    abi: "lt_5",
    torneiosMes: "100_200",
    banca: "875_2000",
  },
} as unknown as DiagnosticRow;

const csv = rowsToCsv([baseRow]);
const [header, line] = csv.split("\n");
const cols = header.split(",");

for (const h of ["Idade", "Tempo de jogo", "Objetivo", "ABI", "Torneios/mês", "Banca"]) {
  expect(`header has ${h}`, cols.includes(h), header);
}
for (const h of ["Categoria Lead", "Lead Score", "Tempo Jogando", "Volume/mês"]) {
  expect(`header dropped ${h}`, !cols.includes(h), header);
}
expect("row has idade label", line.includes("25 a 34 anos"), line);
expect("row has tempo label", line.includes("Há mais de 5 anos"), line);
expect("row has objetivo label", line.includes("Ser profissional, ter o jogo como renda principal"), line);
expect("row has banca label", line.includes("$875 a $2.000"), line);
expect("row has torneios label", line.includes("Entre 100 e 200 torneios"), line);

// Lead do quiz v1 (valores antigos) não quebra: cai no valor cru.
const legacy = {
  ...baseRow,
  quiz_answers: { idade: "55_plus", tempo: "mais_5", objetivo: "competitivo", volume: "gt_300", banca: "876_2000" },
} as unknown as DiagnosticRow;
const legacyLine = rowsToCsv([legacy]).split("\n")[1];
expect("legacy objetivo raw", legacyLine.includes("competitivo"), legacyLine);
expect("legacy idade raw", legacyLine.includes("55_plus"), legacyLine);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("All exportCsv checks passed");
