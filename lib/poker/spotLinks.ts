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
  careerLesson: PLACEHOLDER,
  tournamentGrid: PLACEHOLDER,
  whatsappGroup: PLACEHOLDER,
};

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
