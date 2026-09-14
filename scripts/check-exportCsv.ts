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

/**
 * Parser RFC 4180 mínimo pra uma linha de CSV (sem suporte a campo
 * multilinha): respeita campos entre aspas duplas e o escape `""`. Usado só
 * nas asserções que dependem de posição de coluna — campos como a Data
 * (vírgula do `Intl.DateTimeFormat` pt-BR) e o Objetivo (vírgula no label)
 * ficam entre aspas no CSV, então um `split(",")` ingênuo quebra o
 * alinhamento das colunas seguintes.
 */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
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

// ---- Produto -----------------------------------------------------------------
const productRow = {
  ...baseRow,
  product_profile: "time",
  product_test: "comunidade",
  product_final: "comunidade",
} as unknown as DiagnosticRow;
const [pHeader, pLine] = rowsToCsv([productRow]).split("\n");
const pCols = parseCsvLine(pHeader);
const pCells = parseCsvLine(pLine);
for (const h of ["Produto perfil", "Produto teste", "Produto final"]) {
  expect(`header has ${h}`, pCols.includes(h), pHeader);
}
expect("cell produto perfil", pCells[pCols.indexOf("Produto perfil")] === "Time", pLine);
expect("cell produto teste", pCells[pCols.indexOf("Produto teste")] === "Comunidade (50–69%)", pLine);
expect("cell produto final", pCells[pCols.indexOf("Produto final")] === "Comunidade", pLine);

const emptyCells = parseCsvLine(rowsToCsv([baseRow]).split("\n")[1]);
expect("empty produto final", emptyCells[pCols.indexOf("Produto final")] === "", emptyCells.join(","));

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("All exportCsv checks passed");
