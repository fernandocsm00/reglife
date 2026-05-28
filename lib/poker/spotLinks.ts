// lib/poker/spotLinks.ts — Mapeia leak_id → URL da aula correspondente.
//
// O leak_id tem formato `${action}-${position}-${stackSize}` (ex.: "RFI-BTN-15",
// "vsOpen-BB-25", "cBet-CO-30"). Em vez de cadastrar uma URL por leak, usamos
// uma função que despacha por action+position+stack, porque a Comunidade Reg
// Life agrupa as aulas por TEMA (a mesma aula serve pra todas as variações
// de stack/posição daquele spot).
//
// Quando precisar de override fino (uma combinação específica que vai pra um
// URL diferente do default da action), adiciona em SPOT_LINK_OVERRIDES abaixo.

const PLACEHOLDER = "https://reglife.com.br/aula-em-breve";

/** Links fixos do "Desafio Profissão Poker". */
export const FIXED_LINKS = {
  careerLesson: "https://social.reglife.com.br/com19-wbn",
  tournamentGrid: PLACEHOLDER, // default — substituído por GRADE_LINKS quando há banca declarada
  whatsappGroup: PLACEHOLDER,
};

/**
 * Link da grade de torneios por stake (ABI USD). A grade é definida pelo
 * `stakeGrade` derivado da banca declarada no quiz (BANCA_GRADE em
 * lib/poker/leadScoring.ts). Quando o aluno não tem banca declarada,
 * cai no FIXED_LINKS.tournamentGrid (placeholder neutro).
 */
export const GRADE_LINKS: Record<number, string> = {
  1:    "https://reglife.com.br/abi-1",
  2.5:  "https://reglife.com.br/abi-2",
  4:    "https://reglife.com.br/abi-4",
  7:    "https://reglife.com.br/abi-7",
  10:   "https://reglife.com.br/abi-10",
  13:   "https://reglife.com.br/abi-13",
  19:   "https://reglife.com.br/abi-19",
  28:   "https://reglife.com.br/abi-28",
};

/**
 * Retorna a URL da grade pra um stakeGrade específico. Se o grade não
 * existir no mapa (raro), cai no link genérico.
 */
export function getGradeLink(stakeGrade: number | null | undefined): string {
  if (stakeGrade == null) return FIXED_LINKS.tournamentGrid;
  return GRADE_LINKS[stakeGrade] ?? FIXED_LINKS.tournamentGrid;
}

/** URLs canônicas por tema de spot. */
const THEME = {
  rfi:                 "https://reglife.com.br/rfi",
  vsRfi:               "https://reglife.com.br/vs-rfi",
  defesaBb:            "https://reglife.com.br/defesa-de-bb",
  blindWar:            "https://reglife.com.br/blind-war",
  cbetIp:              "https://reglife.com.br/cbet-ip",
  cbetOop:             "https://reglife.com.br/cbet-oop",
  cbetTurnRiverIp:     "https://reglife.com.br/cbet-turn-e-river-ip",
  vsCbetBb:            "https://reglife.com.br/vs-cbet-do-bb",
  vsCbetIpEBetMissed:  "https://reglife.com.br/vs-cbet-ip-e-bet-vs-missed-cbet",
  multiwayBb:          "https://reglife.com.br/defesa-de-bb-multiway",
  vs3Bet:              "https://reglife.com.br/vs-3bet",
  // TIER 3 — aulas existem mas spots correspondentes ainda não foram criados
  squeeze:             "https://reglife.com.br/squeeze",
  probeTurn:           "https://reglife.com.br/probe-turn",
  probeRiver:          "https://reglife.com.br/probe-river",
  vsCheckRaise:        "https://reglife.com.br/vs-check-raise",
  delayCbet:           "https://reglife.com.br/delay-cbet",
  pot3bet:             "https://reglife.com.br/pot-tribetado",
  cbetVsSb:            "https://reglife.com.br/cbet-vs-sb",
};

/**
 * Overrides finos por leak_id exato. Caso uma combinação específica caia em
 * um URL diferente do default da action, registre aqui.
 */
const SPOT_LINK_OVERRIDES: Record<string, string> = {
  // C-Bet do BTN em 40bb é o spot "Bet vs Missed Cbet"
  // (reglife-cbet-flop-btn-missed.json) — não é cbet vs BB.
  "cBet-BTN-40": THEME.vsCbetIpEBetMissed,
};

/**
 * Retorna a URL da aula recomendada pro leak.
 *
 * Lógica de roteamento por action:
 *  - RFI                          → /rfi
 *  - vsOpen + hero BB             → /defesa-de-bb
 *  - vsOpen + outras posições     → /vs-rfi
 *  - blindWar / vsBBISO           → /blind-war
 *  - cBet hero BTN/UTG1 (vs BB)   → /cbet-ip
 *  - cBet hero CO/UTG (vs BTN)    → /cbet-oop
 *  - cbetTurn / cbetRiver         → /cbet-turn-e-river-ip
 *  - vsCbet + hero BB             → /vs-cbet-do-bb
 *  - vsCbet + hero BTN/CO/UTG     → /vs-cbet-ip-e-bet-vs-missed-cbet
 *  - multiway                     → /defesa-de-bb-multiway
 *  - vs3Bet                       → /vs-3bet
 *
 * Fallback (action desconhecida): PLACEHOLDER.
 */
export function getSpotLink(leakId: string): string {
  if (SPOT_LINK_OVERRIDES[leakId]) return SPOT_LINK_OVERRIDES[leakId];

  const parts = leakId.split("-");
  if (parts.length < 2) return PLACEHOLDER;
  const [action, position] = parts;

  switch (action) {
    case "RFI":
      return THEME.rfi;

    case "vsOpen":
      return position === "BB" ? THEME.defesaBb : THEME.vsRfi;

    case "vsBBISO":
    case "blindWar":
      return THEME.blindWar;

    case "cBet":
      // BTN/UTG1 c-betando vs BB = IP
      // CO/UTG c-betando vs BTN  = OOP
      return position === "BTN" || position === "UTG1"
        ? THEME.cbetIp
        : THEME.cbetOop;

    case "cbetTurn":
    case "cbetRiver":
      return THEME.cbetTurnRiverIp;

    case "vsCbet":
      return position === "BB" ? THEME.vsCbetBb : THEME.vsCbetIpEBetMissed;

    case "multiway":
      return THEME.multiwayBb;

    case "vs3Bet":
      return THEME.vs3Bet;

    default:
      return PLACEHOLDER;
  }
}

/**
 * Ordem canônica de ESTUDO dos spots, conforme a sequência da Comunidade
 * Reg Life. Usada pra ordenar os 3 spots no Plano de Ação independente de
 * quais leaks o aluno teve. Quanto menor o número, mais cedo o spot
 * aparece no plano (mesmo que outro tenha sido leak pior).
 *
 *  1  RFI
 *  2  Cbet em posição vs BB (cbet flop IP)
 *  3  Cbet Turn e River em Posição vs BB
 *  4  Vs RFI
 *  5  Jogando do BB (defesa do BB pré-flop)
 *  6  Blind War Pré-Flop
 *  7  Jogando vs Cbet do BB
 *  8  Defesa de BB Multiway
 *  9  Enfrentando uma 3-bet
 *  10 Cbet Fora de Posição
 *  11 Jogando em Posição (vs cbet IP + bet vs missed)
 *  99 fallback — spot que não bate em nenhum tema
 */
export function canonicalSlotForLeak(leakId: string): number {
  const parts = leakId.split("-");
  if (parts.length < 2) return 99;
  const [action, position] = parts;

  switch (action) {
    case "RFI":
      return 1;
    case "cBet":
      return position === "BTN" || position === "UTG1" ? 2 : 10;
    case "cbetTurn":
    case "cbetRiver":
      return 3;
    case "vsOpen":
      return position === "BB" ? 5 : 4;
    case "vsBBISO":
    case "blindWar":
      return 6;
    case "vsCbet":
      return position === "BB" ? 7 : 11;
    case "multiway":
      return 8;
    case "vs3Bet":
      return 9;
    default:
      return 99;
  }
}

/**
 * Mapa de leak action → slug do spot interno em /public/spots/<slug>.json.
 * Cobertura confirmada por inspeção dos arquivos reais em /public/spots/
 * (16 arquivos no momento). Actions Tier 3 (squeeze, probeTurn, etc.) não
 * têm spot interno → slugForLeak devolve null e a UI mostra fallback manual.
 *
 * Actions com uma única destinação ficam no mapa simples. Actions com
 * roteamento por posição (cBet, vsOpen, vsCbet, vs3Bet, blindWar) usam
 * o switch em slugForLeak abaixo.
 */
const ACTION_TO_SLUG: Partial<Record<string, string>> = {
  RFI:        "reglife-rfi-prioridades",
  cbetTurn:   "reglife-cbet-turn-river-vs-bb",
  cbetRiver:  "reglife-cbet-turn-river-vs-bb",
  multiway:   "reglife-multiway-bb",
};

/**
 * Overrides por leakId exato — quando uma combinação específica de
 * action+position+stack cai num spot diferente do default da action.
 */
const LEAK_TO_SLUG_OVERRIDES: Record<string, string> = {
  // Cbet do BTN em 40bb = Bet vs Missed (não cbet vs BB)
  "cBet-BTN-40": "reglife-cbet-flop-btn-missed",
};

/**
 * Retorna o slug do spot interno pra esse leak, ou null se não houver.
 * O slug é o nome do arquivo em /public/spots/<slug>.json (sem extensão).
 *
 * Esta função é puramente um lookup — não toca disco. A rota de trainer
 * single-spot (`app/trainer/spot/[leakId]/page.tsx`) deve usar
 * `loadSpotConfig(slug)` para confirmar que o arquivo existe e tratar 404.
 */
export function slugForLeak(leakId: string): string | null {
  if (LEAK_TO_SLUG_OVERRIDES[leakId]) return LEAK_TO_SLUG_OVERRIDES[leakId];

  const parts = leakId.split("-");
  if (parts.length < 2) return null;
  const [action, position] = parts;

  if (ACTION_TO_SLUG[action]) return ACTION_TO_SLUG[action]!;

  switch (action) {
    case "vsOpen":
      // BB defesa pré-flop é spot próprio; outras posições caem em vs-rfi.
      return position === "BB" ? "reglife-defesa-bb" : "reglife-vs-rfi";

    case "cBet":
      // BTN/UTG1 cbetando vs BB = IP (cbet flop vs BB).
      // Outras posições cbetam OOP (cbet vs BTN).
      return position === "BTN" || position === "UTG1"
        ? "reglife-cbet-flop-vs-bb"
        : "reglife-cbet-vs-btn";

    case "vsCbet":
      // BB enfrentando cbet → vs-cbet-flop-bb.
      // BTN/outros IP → vs-cbet-flop-btn (default IP).
      return position === "BB"
        ? "reglife-vs-cbet-flop-bb"
        : "reglife-vs-cbet-flop-btn";

    case "vs3Bet":
      // Posições iniciais → vs-3bet-ep; resto (BTN/CO/SB) → vs-3bet-btn.
      return position === "UTG" || position === "UTG1" || position === "HJ" || position === "LJ"
        ? "reglife-vs-3bet-ep"
        : "reglife-vs-3bet-btn";

    case "vsBBISO":
    case "blindWar":
      // BB defendendo vs SB → bb-vs-raise (default).
      // SB jogando blind war → sb-gap.
      return position === "BB"
        ? "reglife-blind-war-bb-vs-raise"
        : "reglife-blind-war-sb-gap";

    default:
      // Tier 3 (squeeze, probeTurn, probeRiver, vsCheckRaise, delayCbet,
      // pot3bet, cbetVsSb) intencionalmente cai aqui — sem spot interno.
      return null;
  }
}

/**
 * Quick check — esse leak tem um trainer interno jogável?
 * Pra Tier 3, false → UI mostra fallback manual.
 */
export function hasInternalTrainer(leakId: string): boolean {
  return slugForLeak(leakId) !== null;
}
