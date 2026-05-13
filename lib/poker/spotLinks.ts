// lib/poker/spotLinks.ts — Mapeamento estático de leak_id → URL da aula/treino.
//
// Por enquanto, todas as URLs são placeholders. Quando você tiver os links
// reais, basta substituir os valores deste arquivo. O leak_id segue o
// formato gerado em leakAnalysis.ts: `${action}-${position}-${stackBand}`.
//
// Exemplos de chaves: "RFI-LJ-100", "vsOpen-BB-25", "cBet-BTN-30".
//
// Os 3 links FIXOS (carreira / grade / grupo) também ficam aqui pra você
// trocar num só lugar.

const PLACEHOLDER = "https://reglife.com.br/aula-em-breve";

/** Links fixos do "Desafio Profissão Poker" — substitua aqui quando tiver as URLs reais. */
export const FIXED_LINKS = {
  /** Aula de construção de carreira (página WBN). */
  careerLesson: PLACEHOLDER,
  /** Grade de torneios (página com a grade da reglife). */
  tournamentGrid: PLACEHOLDER,
  /** Grupo exclusivo no WhatsApp pra receber mais conteúdos. */
  whatsappGroup: PLACEHOLDER,
};

/**
 * Map estático de leak_id → URL da aula/treino do spot.
 * Substitua os valores quando os links reais estiverem prontos.
 *
 * Estrutura: `${action}-${position}-${stackBand}`. Veja `leakAnalysis.ts`
 * pra a lista completa das chaves possíveis.
 */
export const SPOT_LINK_MAP: Record<string, string> = {
  // Pré-flop — RFI
  "RFI-LJ-15": PLACEHOLDER,
  "RFI-LJ-25": PLACEHOLDER,
  "RFI-LJ-100": PLACEHOLDER,
  "RFI-UTG-10": PLACEHOLDER,
  "RFI-UTG-25": PLACEHOLDER,
  "RFI-UTG-50": PLACEHOLDER,
  "RFI-HJ-25": PLACEHOLDER,
  "RFI-HJ-100": PLACEHOLDER,
  "RFI-CO-10": PLACEHOLDER,
  "RFI-CO-15": PLACEHOLDER,
  "RFI-CO-100": PLACEHOLDER,
  "RFI-BTN-10": PLACEHOLDER,
  "RFI-BTN-15": PLACEHOLDER,
  "RFI-BTN-50": PLACEHOLDER,

  // Pré-flop — Vs RFI (open de alguém)
  "vsOpen-UTG1-25": PLACEHOLDER,
  "vsOpen-UTG1-50": PLACEHOLDER,
  "vsOpen-UTG1-100": PLACEHOLDER,
  "vsOpen-HJ-15": PLACEHOLDER,
  "vsOpen-HJ-25": PLACEHOLDER,
  "vsOpen-HJ-100": PLACEHOLDER,
  "vsOpen-BTN-25": PLACEHOLDER,
  "vsOpen-BTN-50": PLACEHOLDER,
  "vsOpen-SB-15": PLACEHOLDER,
  "vsOpen-SB-25": PLACEHOLDER,
  "vsOpen-SB-50": PLACEHOLDER,
  "vsOpen-BB-15": PLACEHOLDER,
  "vsOpen-BB-25": PLACEHOLDER,
  "vsOpen-BB-100": PLACEHOLDER,

  // Pré-flop — Blind War (SB GAP / SB vs ISO / BB vs limp / BB vs raise)
  "blindWar-SB-15": PLACEHOLDER,
  "blindWar-SB-30": PLACEHOLDER,
  "blindWar-SB-50": PLACEHOLDER,
  "blindWar-SB-60": PLACEHOLDER,
  "blindWar-BB-15": PLACEHOLDER,
  "blindWar-BB-30": PLACEHOLDER,
  "blindWar-BB-50": PLACEHOLDER,

  // Pré-flop — Vs 3-bet
  "vs3Bet-UTG-25": PLACEHOLDER,
  "vs3Bet-UTG-50": PLACEHOLDER,
  "vs3Bet-CO-25": PLACEHOLDER,
  "vs3Bet-CO-50": PLACEHOLDER,
  "vs3Bet-BTN-25": PLACEHOLDER,
  "vs3Bet-BTN-50": PLACEHOLDER,

  // Pré-flop — Multiway BB
  "multiway-BB-25": PLACEHOLDER,
  "multiway-BB-100": PLACEHOLDER,

  // Pós-flop — C-Bet flop
  "cBet-UTG1-20": PLACEHOLDER,
  "cBet-BTN-20": PLACEHOLDER,
  "cBet-CO-30": PLACEHOLDER,
  "cBet-UTG-30": PLACEHOLDER,

  // Pós-flop — Vs C-Bet flop
  "vsCbet-BB-30": PLACEHOLDER,
  "vsCbet-BTN-30": PLACEHOLDER,
  "vsCbet-BTN-40": PLACEHOLDER,

  // C-Bet turn / river
  "cbetTurn-BTN-30": PLACEHOLDER,
  "cbetTurn-BTN-100": PLACEHOLDER,
  "cbetRiver-BTN-30": PLACEHOLDER,
  "cbetRiver-BTN-100": PLACEHOLDER,
};

/**
 * Retorna a URL da aula/treino pro leak. Faz fallback pra placeholder
 * genérico se o leak_id ainda não foi cadastrado no map acima.
 */
export function getSpotLink(leakId: string): string {
  return SPOT_LINK_MAP[leakId] ?? PLACEHOLDER;
}
