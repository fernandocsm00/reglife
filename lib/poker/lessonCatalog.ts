// Catálogo completo de aulas da comunidade reglife, extraído do inventário
// "997 + Inventário.xlsx". Cada bloco mapeia para um action type do trainer.
//
// URLs usam o padrão curseduca. Se o slug exato mudar, basta atualizar aqui.
// Aulas ao vivo (COM/Raio X PRO) usam o mesmo padrão.

export interface LessonRef {
  title: string;
  url: string;
  module: string;
  type: "video" | "treino" | "texto" | "arquivo";
}

export interface Lesson extends LessonRef {
  tags: {
    action: LessonAction;
    positions?: string[];
    stackBands?: StackBand[];
  };
}

export type LessonAction =
  | "RFI"
  | "cBet"
  | "vsOpen"
  | "bbDefense"
  | "blindWar"
  | "vsCbet"
  | "cbetTurn"
  | "cbetRiver"
  | "multiway"
  | "vs3Bet"
  | "cbetOOP"
  | "playingIP"
  | "squeeze"
  | "probeRiver"
  | "probeTurn"
  | "vsCheckRaise"
  | "delayCbet"
  | "pote3bet"
  | "cbetVsSB"
  | "geral";

export type StackBand = "≤10bb" | "11-15bb" | "16-25bb" | "26-50bb" | "50bb+";

export function stackBandFor(stack: number): StackBand {
  if (stack <= 10) return "≤10bb";
  if (stack <= 15) return "11-15bb";
  if (stack <= 25) return "16-25bb";
  if (stack <= 50) return "26-50bb";
  return "50bb+";
}

// ---------------------------------------------------------------------------
// Helper: gera URL curseduca padrão
// ---------------------------------------------------------------------------
const BASE = "https://reglife.curseduca.pro/m/lessons";
function u(slug: string): string {
  return `${BASE}/${slug}`;
}

// ---------------------------------------------------------------------------
// BLOCO 1 — RFI
// ---------------------------------------------------------------------------
const RFI_LESSONS: Lesson[] = [
  // BASES 2.0
  { title: "Apresentação dos Ranges e Sizes de abertura cEV (50, 25, 15, 10bb)", module: "BASES 2.0", type: "video", url: u("rfi-ranges-sizes-cev"), tags: { action: "RFI" } },
  { title: "Porque abrimos menos de posições iniciais e mais de posições finais", module: "BASES 2.0", type: "video", url: u("rfi-ep-vs-lp"), tags: { action: "RFI", positions: ["UTG", "UTG1", "LJ"] } },
  { title: "Entendendo as diferenças do jogo Deepstack e Shortstack", module: "BASES 2.0", type: "video", url: u("rfi-deep-vs-short"), tags: { action: "RFI" } },
  { title: "A dinâmica dos all ins pré flop", module: "BASES 2.0", type: "video", url: u("rfi-all-in-preflop"), tags: { action: "RFI", stackBands: ["≤10bb", "11-15bb"] } },
  { title: "Entenda o jogo shortstack: All in reto, Bet/Fold ou Bet/Call? (15bb)", module: "BASES 2.0", type: "video", url: u("rfi-shortstack-15bb"), tags: { action: "RFI", stackBands: ["11-15bb"] } },
  { title: "Não seja o Limper, puna o Limp!", module: "BASES 2.0", type: "video", url: u("rfi-puna-o-limp"), tags: { action: "RFI" } },
  { title: "Seja sólido nas posições iniciais", module: "BASES 2.0", type: "video", url: u("rfi-solido-ep"), tags: { action: "RFI", positions: ["UTG", "UTG1", "LJ"] } },
  { title: "Seja agressivo nas posições finais", module: "BASES 2.0", type: "video", url: u("rfi-agressivo-lp"), tags: { action: "RFI", positions: ["CO", "BTN"] } },
  { title: "Adapte-se à esquerda", module: "BASES 2.0", type: "video", url: u("rfi-adapte-esquerda"), tags: { action: "RFI" } },
  // Modo Carreira
  { title: "Regra de Bolso — RFI", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-rfi"), tags: { action: "RFI" } },
  { title: "Treino RFI (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-rfi"), tags: { action: "RFI" } },
  // Camadas do Conhecimento
  { title: "Ranges de open raise em ChipEV + Treino GTO", module: "MTT Fundamental", type: "video", url: u("mtt-fund-ranges-cev"), tags: { action: "RFI", stackBands: ["26-50bb", "50bb+"] } },
  { title: "Jogando shortstack em cEV + Treino GTO", module: "MTT Fundamental", type: "video", url: u("mtt-fund-shortstack-cev"), tags: { action: "RFI", stackBands: ["≤10bb", "11-15bb"] } },
  // Aulas Ao Vivo
  { title: "COM #1 — Analisando situações de RFI no Desafio 10K", module: "Aulas Ao Vivo", type: "video", url: u("com-1-rfi-desafio-10k"), tags: { action: "RFI" } },
  { title: "COM #38 — Mesa Final Torneios Bounty: RFI", module: "Aulas Ao Vivo", type: "video", url: u("com-38-mf-bounty-rfi"), tags: { action: "RFI" } },
  { title: "COM #76 — RFI shortstack em torneios PKO", module: "Aulas Ao Vivo", type: "video", url: u("com-76-rfi-short-pko"), tags: { action: "RFI", stackBands: ["≤10bb", "11-15bb"] } },
  { title: "COM #77 — RFI shortstack em torneios Vanilla", module: "Aulas Ao Vivo", type: "video", url: u("com-77-rfi-short-vanilla"), tags: { action: "RFI", stackBands: ["≤10bb", "11-15bb"] } },
  { title: "Raio X PRO #19 — RFI de Late Position", module: "Raio X PRO", type: "video", url: u("rxpro-19-rfi-lp"), tags: { action: "RFI", positions: ["CO", "BTN"] } },
];

// ---------------------------------------------------------------------------
// BLOCO 2 — C-BET EM POSIÇÃO VS BB
// ---------------------------------------------------------------------------
const CBET_LESSONS: Lesson[] = [
  { title: "Apresentação das frequências teóricas de Cbet vs BB", module: "BASES 2.0", type: "video", url: u("cbet-frequencias-teoricas"), tags: { action: "cBet" } },
  { title: "Porque Cbetamos muito contra o Big Blind?", module: "BASES 2.0", type: "video", url: u("cbet-porque-muito-vs-bb"), tags: { action: "cBet", positions: ["BTN", "CO", "UTG1"] } },
  { title: "Entendendo os boards que precisamos ter cuidado", module: "BASES 2.0", type: "video", url: u("cbet-boards-cuidado"), tags: { action: "cBet" } },
  { title: "Simplificando as sizes de C-Bet", module: "BASES 2.0", type: "video", url: u("cbet-simplificando-sizes"), tags: { action: "cBet" } },
  { title: "Explorando o Big Blind: Facilite sua agressividade!", module: "BASES 2.0", type: "video", url: u("cbet-explorando-bb"), tags: { action: "cBet" } },
  { title: "Regra de Bolso — C-bet vs BB", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-cbet-bb"), tags: { action: "cBet" } },
  { title: "Treino Cbet vs BB (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-cbet-bb"), tags: { action: "cBet" } },
  { title: "Cbet em posição (contra o BB) + Trainer", module: "MTT Profissional", type: "video", url: u("mtt-pro-cbet-ip-bb"), tags: { action: "cBet" } },
  { title: "COM #34 — Cbet no Flop vs BB (Deepstack)", module: "Aulas Ao Vivo", type: "video", url: u("com-34-cbet-flop-deep"), tags: { action: "cBet", stackBands: ["26-50bb", "50bb+"] } },
  { title: "COM #75 — Cbet Flop, Turn e River vs BB", module: "Aulas Ao Vivo", type: "video", url: u("com-75-cbet-ftr-bb"), tags: { action: "cBet" } },
];

// ---------------------------------------------------------------------------
// BLOCO 3 — CBET TURN E RIVER IP
// ---------------------------------------------------------------------------
const CBET_TURN_RIVER_LESSONS: Lesson[] = [
  { title: "O que pensar ao aplicar Cbet Turn? Polarização!", module: "BASES 2.0", type: "video", url: u("cbet-turn-polarizacao"), tags: { action: "cbetTurn" } },
  { title: "Entendendo os Turns — Leitura de Range: Aplicando filtros", module: "BASES 2.0", type: "video", url: u("cbet-turn-leitura-range"), tags: { action: "cbetTurn" } },
  { title: "Guia de Sizes Turn e River", module: "BASES 2.0", type: "video", url: u("cbet-turn-river-sizes"), tags: { action: "cbetTurn" } },
  { title: "Polarização na prática: Não seja pessimista", module: "BASES 2.0", type: "video", url: u("cbet-turn-polarizacao-pratica"), tags: { action: "cbetTurn" } },
  { title: "Não faça Slowplays!", module: "BASES 2.0", type: "video", url: u("cbet-turn-nao-slowplay"), tags: { action: "cbetTurn" } },
  { title: "Cresça o pote para enriquecer no River!", module: "BASES 2.0", type: "video", url: u("cbet-cresca-pote-river"), tags: { action: "cbetRiver" } },
  { title: "E as equidades médias que deram check turn? O que fazer no river?", module: "BASES 2.0", type: "video", url: u("cbet-river-check-turn"), tags: { action: "cbetRiver" } },
  { title: "Regra de Bolso — Cbet Turn", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-cbet-turn"), tags: { action: "cbetTurn" } },
  { title: "Regra de Bolso — Cbet River", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-cbet-river"), tags: { action: "cbetRiver" } },
  { title: "Treino Cbet Turn (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-cbet-turn"), tags: { action: "cbetTurn" } },
  { title: "Treino Cbet River (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-cbet-river"), tags: { action: "cbetRiver" } },
  { title: "Cbet no Turn apenas contra o BB + Trainer", module: "MTT Elite", type: "video", url: u("mtt-elite-cbet-turn-bb"), tags: { action: "cbetTurn" } },
  { title: "Cbet no River apenas contra o BB + Trainer", module: "MTT Elite", type: "video", url: u("mtt-elite-cbet-river-bb"), tags: { action: "cbetRiver" } },
  { title: "COM #26 — Cbet Turn e River vs BB", module: "Aulas Ao Vivo", type: "video", url: u("com-26-cbet-turn-river"), tags: { action: "cbetTurn" } },
  { title: "Raio X PRO #2 — Cbet Turn IP", module: "Raio X PRO", type: "video", url: u("rxpro-2-cbet-turn-ip"), tags: { action: "cbetTurn" } },
];

// ---------------------------------------------------------------------------
// BLOCO 4 — VS RFI (Enfrentando Open Raise)
// ---------------------------------------------------------------------------
const VS_RFI_LESSONS: Lesson[] = [
  { title: "Apresentação dos Ranges de Flat e 3bet cEV (50, 25, 15bb)", module: "BASES 2.0", type: "video", url: u("vs-rfi-ranges-flat-3bet"), tags: { action: "vsOpen" } },
  { title: "Por que queremos jogar uma mão?", module: "BASES 2.0", type: "video", url: u("vs-rfi-porque-jogar"), tags: { action: "vsOpen" } },
  { title: "Dinâmica das posições: Range linear vs Range polarizado", module: "BASES 2.0", type: "video", url: u("vs-rfi-linear-vs-polarizado"), tags: { action: "vsOpen" } },
  { title: "Compreendendo as dinâmicas Shortstack: 3bet All-ins e Vs All-ins", module: "BASES 2.0", type: "video", url: u("vs-rfi-shortstack-3bet"), tags: { action: "vsOpen", stackBands: ["≤10bb", "11-15bb"] } },
  { title: "Jogando de EP/MP: Seja linear e tight!", module: "BASES 2.0", type: "video", url: u("vs-rfi-ep-mp-linear"), tags: { action: "vsOpen", positions: ["UTG1", "HJ"] } },
  { title: "Jogando do BTN: Seja polarizado e agressivo!", module: "BASES 2.0", type: "video", url: u("vs-rfi-btn-polarizado"), tags: { action: "vsOpen", positions: ["BTN"] } },
  { title: "Jogando do SB: Roubando o ladrão — Resteal", module: "BASES 2.0", type: "video", url: u("vs-rfi-sb-resteal"), tags: { action: "vsOpen", positions: ["SB"] } },
  { title: "Regra de Bolso — BTN vs CO", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-btn-vs-co"), tags: { action: "vsOpen", positions: ["BTN"] } },
  { title: "Regra de Bolso — SB vs BTN", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-sb-vs-btn"), tags: { action: "vsOpen", positions: ["SB"] } },
  { title: "Treino BTN vs CO (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-btn-vs-co"), tags: { action: "vsOpen", positions: ["BTN"] } },
  { title: "Treino SB vs BTN (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-sb-vs-btn"), tags: { action: "vsOpen", positions: ["SB"] } },
  { title: "Enfrentando Open Raise + Trainer", module: "MTT Profissional", type: "video", url: u("mtt-pro-enfrentando-open"), tags: { action: "vsOpen" } },
  { title: "COM #61 — Jogando SB vs RFI em torneios PKO", module: "Aulas Ao Vivo", type: "video", url: u("com-61-sb-vs-rfi-pko"), tags: { action: "vsOpen", positions: ["SB"] } },
  { title: "COM #67 — Jogando BTN vs RFI em torneios PKO", module: "Aulas Ao Vivo", type: "video", url: u("com-67-btn-vs-rfi-pko"), tags: { action: "vsOpen", positions: ["BTN"] } },
  { title: "COM #69 — Enfrentando Open Raise em Mesas Finais", module: "Aulas Ao Vivo", type: "video", url: u("com-69-vs-rfi-mf"), tags: { action: "vsOpen" } },
  { title: "Raio X PRO #16 — Flat/3bet do BTN em PKO", module: "Raio X PRO", type: "video", url: u("rxpro-16-flat-3bet-btn"), tags: { action: "vsOpen", positions: ["BTN"] } },
];

// ---------------------------------------------------------------------------
// BLOCO 5 — JOGANDO DO BB (Defesa de BB)
// ---------------------------------------------------------------------------
const BB_DEFENSE_LESSONS: Lesson[] = [
  { title: "Apresentação dos Ranges de Defesa e 3bet do BB (50, 25, 15bb)", module: "BASES 2.0", type: "video", url: u("bb-ranges-defesa-3bet"), tags: { action: "bbDefense" } },
  { title: "Porque defendemos muitas mãos do Big Blind?", module: "BASES 2.0", type: "video", url: u("bb-porque-defendemos"), tags: { action: "bbDefense", positions: ["BB"] } },
  { title: "Entendendo os ranges de 3bet não all-in e all-in", module: "BASES 2.0", type: "video", url: u("bb-ranges-3bet-allin"), tags: { action: "bbDefense", positions: ["BB"] } },
  { title: "Usando a polarização a seu favor", module: "BASES 2.0", type: "video", url: u("bb-polarizacao-favor"), tags: { action: "bbDefense", positions: ["BB"] } },
  { title: "Adaptando-se a diferentes perfis", module: "BASES 2.0", type: "video", url: u("bb-adaptando-perfis"), tags: { action: "bbDefense", positions: ["BB"] } },
  { title: "Regra de Bolso — BB vs BTN", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-bb-vs-btn"), tags: { action: "bbDefense", positions: ["BB"] } },
  { title: "Treino BB vs BTN (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-bb-vs-btn"), tags: { action: "bbDefense", positions: ["BB"] } },
  { title: "Defesa de BB + Trainer GTO", module: "MTT Fundamental", type: "video", url: u("mtt-fund-defesa-bb-gto"), tags: { action: "bbDefense", positions: ["BB"] } },
  { title: "COM #18 — PKO vs Vanilla: Defesa dos Blinds", module: "Aulas Ao Vivo", type: "video", url: u("com-18-defesa-blinds"), tags: { action: "bbDefense", positions: ["BB"] } },
  { title: "COM #63 — Defesa de BB em PKO", module: "Aulas Ao Vivo", type: "video", url: u("com-63-defesa-bb-pko"), tags: { action: "bbDefense", positions: ["BB"] } },
  { title: "COM #64 — Defesa de BB em Vanilla", module: "Aulas Ao Vivo", type: "video", url: u("com-64-defesa-bb-vanilla"), tags: { action: "bbDefense", positions: ["BB"] } },
  { title: "Raio X PRO #1 — Defesa de BB e Check-raise do BB", module: "Raio X PRO", type: "video", url: u("rxpro-1-defesa-bb-xr"), tags: { action: "bbDefense", positions: ["BB"] } },
  { title: "Raio X PRO #10 — 3bet do BB", module: "Raio X PRO", type: "video", url: u("rxpro-10-3bet-bb"), tags: { action: "bbDefense", positions: ["BB"] } },
];

// ---------------------------------------------------------------------------
// BLOCO 6 — BLIND WAR PRÉ-FLOP
// ---------------------------------------------------------------------------
const BLIND_WAR_LESSONS: Lesson[] = [
  { title: "Apresentação dos Ranges e sizes do SB e BB (50, 25, 15bb)", module: "BASES 2.0", type: "video", url: u("bw-ranges-sizes"), tags: { action: "blindWar" } },
  { title: "Porque evitamos os Walks", module: "BASES 2.0", type: "video", url: u("bw-evitamos-walks"), tags: { action: "blindWar", positions: ["SB"] } },
  { title: "Entendendo a lógica do RFI do SB: Deep vs Short", module: "BASES 2.0", type: "video", url: u("bw-rfi-sb-deep-short"), tags: { action: "blindWar", positions: ["SB"] } },
  { title: "Compreendendo a dinâmica do BB: ISO, FLAT e 3bet", module: "BASES 2.0", type: "video", url: u("bw-bb-iso-flat-3bet"), tags: { action: "blindWar", positions: ["BB"] } },
  { title: "Limp e Bet do SB", module: "BASES 2.0", type: "video", url: u("bw-limp-bet-sb"), tags: { action: "blindWar", positions: ["SB"] } },
  { title: "Raise e Cbet do BB", module: "BASES 2.0", type: "video", url: u("bw-raise-cbet-bb"), tags: { action: "blindWar", positions: ["BB"] } },
  { title: "Explorando o BB através do RFI (Short e Deep)", module: "BASES 2.0", type: "video", url: u("bw-explorando-bb-rfi"), tags: { action: "blindWar" } },
  { title: "Regra de Bolso — Blind War SB RFI", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-bw-sb-rfi"), tags: { action: "blindWar", positions: ["SB"] } },
  { title: "Regra de Bolso — Blind War BB vs SB Limp", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-bw-bb-limp"), tags: { action: "blindWar", positions: ["BB"] } },
  { title: "Treino BW — SB RFI (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-bw-sb-rfi"), tags: { action: "blindWar", positions: ["SB"] } },
  { title: "Treino BW — BB vs SB Limp (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-bw-bb-limp"), tags: { action: "blindWar", positions: ["BB"] } },
  { title: "Blind War: Jogando no Small Blind + Treino GTO", module: "MTT Profissional", type: "video", url: u("mtt-pro-bw-sb"), tags: { action: "blindWar", positions: ["SB"] } },
  { title: "Blind War: Jogando no Big Blind + Treino GTO", module: "MTT Profissional", type: "video", url: u("mtt-pro-bw-bb"), tags: { action: "blindWar", positions: ["BB"] } },
  { title: "COM #54 — BlindWar: SB Pré Flop PKO", module: "Aulas Ao Vivo", type: "video", url: u("com-54-bw-sb-pko"), tags: { action: "blindWar", positions: ["SB"] } },
  { title: "COM #56 — BlindWar: BB Pré Flop PKO", module: "Aulas Ao Vivo", type: "video", url: u("com-56-bw-bb-pko"), tags: { action: "blindWar", positions: ["BB"] } },
  { title: "Raio X PRO #5 — Diminuindo Walks do SB", module: "Raio X PRO", type: "video", url: u("rxpro-5-walks-sb"), tags: { action: "blindWar", positions: ["SB"] } },
  { title: "Raio X PRO #6 — BB vs SB", module: "Raio X PRO", type: "video", url: u("rxpro-6-bb-vs-sb"), tags: { action: "blindWar", positions: ["BB"] } },
  { title: "Raio X PRO #14 — ISO BB vs SB", module: "Raio X PRO", type: "video", url: u("rxpro-14-iso-bb-sb"), tags: { action: "blindWar", positions: ["BB"] } },
];

// ---------------------------------------------------------------------------
// BLOCO 7 — VS CBET DO BB
// ---------------------------------------------------------------------------
const VS_CBET_LESSONS: Lesson[] = [
  { title: "Entendendo os ranges de check-raise", module: "BASES 2.0", type: "video", url: u("vs-cbet-ranges-xr"), tags: { action: "vsCbet", positions: ["BB"] } },
  { title: "Entendendo os ranges de check-call", module: "BASES 2.0", type: "video", url: u("vs-cbet-ranges-xc"), tags: { action: "vsCbet", positions: ["BB"] } },
  { title: "Porque x-r é importante", module: "BASES 2.0", type: "video", url: u("vs-cbet-xr-importante"), tags: { action: "vsCbet", positions: ["BB"] } },
  { title: "O Pré Flop te ajuda no Pós Flop!", module: "BASES 2.0", type: "video", url: u("vs-cbet-preflop-posflop"), tags: { action: "vsCbet" } },
  { title: "Usando a polaridade a seu favor", module: "BASES 2.0", type: "video", url: u("vs-cbet-polaridade"), tags: { action: "vsCbet" } },
  { title: "O que fazer com os flush draws?", module: "BASES 2.0", type: "video", url: u("vs-cbet-flush-draws"), tags: { action: "vsCbet" } },
  { title: "Um plano para o river", module: "BASES 2.0", type: "video", url: u("vs-cbet-plano-river"), tags: { action: "vsCbet" } },
  { title: "Jogando contra Cbet no BB + Treino GTO", module: "MTT Profissional", type: "video", url: u("mtt-pro-vs-cbet-bb"), tags: { action: "vsCbet", positions: ["BB"] } },
  { title: "COM #29 — Check-Raise no Flop vs Cbet em Posição", module: "Aulas Ao Vivo", type: "video", url: u("com-29-xr-flop-vs-cbet"), tags: { action: "vsCbet" } },
  { title: "COM #65 — BB vs BTN Cbet", module: "Aulas Ao Vivo", type: "video", url: u("com-65-bb-vs-btn-cbet"), tags: { action: "vsCbet", positions: ["BB"] } },
  { title: "Raio X PRO #4 — Check-Raise do BB", module: "Raio X PRO", type: "video", url: u("rxpro-4-xr-bb"), tags: { action: "vsCbet", positions: ["BB"] } },
];

// ---------------------------------------------------------------------------
// BLOCO 8 — ENFRENTANDO UMA 3BET
// ---------------------------------------------------------------------------
const VS_3BET_LESSONS: Lesson[] = [
  { title: "Apresentação dos Ranges de FLAT/4bet (50, 25, 15bb)", module: "BASES 2.0", type: "video", url: u("vs-3bet-ranges-flat-4bet"), tags: { action: "vs3Bet" } },
  { title: "O que consideramos ao enfrentar uma 3bet?", module: "BASES 2.0", type: "video", url: u("vs-3bet-consideracoes"), tags: { action: "vs3Bet" } },
  { title: "Entendendo as 4bets", module: "BASES 2.0", type: "video", url: u("vs-3bet-4bets"), tags: { action: "vs3Bet" } },
  { title: "Atenção às sizes", module: "BASES 2.0", type: "video", url: u("vs-3bet-sizes"), tags: { action: "vs3Bet" } },
  { title: "4Bet na prática", module: "BASES 2.0", type: "video", url: u("vs-3bet-4bet-pratica"), tags: { action: "vs3Bet" } },
  { title: "Enfrentando uma 3-Bet + Treino GTO", module: "MTT Profissional", type: "video", url: u("mtt-pro-vs-3bet"), tags: { action: "vs3Bet" } },
  { title: "COM #25 — Enfrentando 3-bet em PKO", module: "Aulas Ao Vivo", type: "video", url: u("com-25-vs-3bet-pko"), tags: { action: "vs3Bet" } },
  { title: "COM #48 — Pré-Flop: Vs 3bet 40bb's", module: "Aulas Ao Vivo", type: "video", url: u("com-48-vs-3bet-40bb"), tags: { action: "vs3Bet", stackBands: ["26-50bb"] } },
  { title: "Raio X PRO #21 — 4-Bet", module: "Raio X PRO", type: "video", url: u("rxpro-21-4bet"), tags: { action: "vs3Bet" } },
];

// ---------------------------------------------------------------------------
// DEFESA BB MULTIWAY
// ---------------------------------------------------------------------------
const MULTIWAY_LESSONS: Lesson[] = [
  { title: "Defesa de Big Blind Multiway", module: "MTT Elite", type: "video", url: u("mtt-elite-bb-multiway"), tags: { action: "multiway", positions: ["BB"] } },
  { title: "COM #46 — Defesa de BB vs BTN e CO/EP", module: "Aulas Ao Vivo", type: "video", url: u("com-46-bb-vs-btn-co"), tags: { action: "multiway", positions: ["BB"] } },
  { title: "COM #47 — Defesa de BB vs SB e BTN/EP", module: "Aulas Ao Vivo", type: "video", url: u("com-47-bb-vs-sb-btn"), tags: { action: "multiway", positions: ["BB"] } },
  { title: "Raio X PRO #3 — Defesa de BB em Pots Multiways", module: "Raio X PRO", type: "video", url: u("rxpro-3-bb-multiway"), tags: { action: "multiway", positions: ["BB"] } },
];

// ---------------------------------------------------------------------------
// BLOCO 9 — CBET FORA DE POSIÇÃO (OOP)
// ---------------------------------------------------------------------------
const CBET_OOP_LESSONS: Lesson[] = [
  { title: "Apresentação das frequências de Cbet EP vs BTN e CO vs BTN", module: "BASES 2.0", type: "video", url: u("cbet-oop-frequencias"), tags: { action: "cbetOOP" } },
  { title: "Entenda a interação de range: Quanto mais distante mais cbet!", module: "BASES 2.0", type: "video", url: u("cbet-oop-interacao-range"), tags: { action: "cbetOOP" } },
  { title: "O que procuramos fora de posição? Equidade!", module: "BASES 2.0", type: "video", url: u("cbet-oop-equidade"), tags: { action: "cbetOOP" } },
  { title: "Simplificando as sizes OOP", module: "BASES 2.0", type: "video", url: u("cbet-oop-sizes"), tags: { action: "cbetOOP" } },
  { title: "Regra de Bolso — Cbet vs BTN", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-cbet-btn"), tags: { action: "cbetOOP" } },
  { title: "Treino Cbet vs BTN (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-cbet-btn"), tags: { action: "cbetOOP" } },
  { title: "Cbet fora de posição + Treino GTO", module: "MTT Profissional", type: "video", url: u("mtt-pro-cbet-oop"), tags: { action: "cbetOOP" } },
  { title: "COM #58 — Ataque OOP: Cbet OOP", module: "Aulas Ao Vivo", type: "video", url: u("com-58-cbet-oop"), tags: { action: "cbetOOP" } },
  { title: "Raio X PRO #8 — Cbet OOP", module: "Raio X PRO", type: "video", url: u("rxpro-8-cbet-oop"), tags: { action: "cbetOOP" } },
];

// ---------------------------------------------------------------------------
// BLOCO 10 — JOGANDO EM POSIÇÃO (VS CBET IP + BET VS MISSED)
// ---------------------------------------------------------------------------
const PLAYING_IP_LESSONS: Lesson[] = [
  { title: "Apresentação: Call do BTN vs HJ e Bet vs Missed", module: "BASES 2.0", type: "video", url: u("ip-call-btn-bet-missed"), tags: { action: "playingIP" } },
  { title: "Porque foldamos muito pouco?", module: "BASES 2.0", type: "video", url: u("ip-fold-pouco"), tags: { action: "playingIP" } },
  { title: "O pré-flop te ajuda no pós flop", module: "BASES 2.0", type: "video", url: u("ip-preflop-posflop"), tags: { action: "playingIP" } },
  { title: "Entendendo as razões para apostar flop vs check (Bet vs Missed)", module: "BASES 2.0", type: "video", url: u("ip-bet-vs-missed-razoes"), tags: { action: "playingIP" } },
  { title: "Compreendendo a Polarização Turn", module: "BASES 2.0", type: "video", url: u("ip-polarizacao-turn"), tags: { action: "playingIP" } },
  { title: "Regra de Bolso — Bet vs Missed Cbet", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-bet-missed"), tags: { action: "playingIP" } },
  { title: "Regra de Bolso — Float IP", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-float-ip"), tags: { action: "playingIP" } },
  { title: "Treino Bet vs Missed (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-bet-missed"), tags: { action: "playingIP" } },
  { title: "Treino Float IP (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-float-ip"), tags: { action: "playingIP" } },
  { title: "Jogando contra Cbet em Posição + Treino GTO", module: "MTT Profissional", type: "video", url: u("mtt-pro-vs-cbet-ip"), tags: { action: "playingIP" } },
  { title: "Bet vs Missed C-bet + Treino GTO", module: "MTT Profissional", type: "video", url: u("mtt-pro-bet-missed"), tags: { action: "playingIP" } },
  { title: "COM #59 — Defesa IP: vs Cbet", module: "Aulas Ao Vivo", type: "video", url: u("com-59-defesa-ip-vs-cbet"), tags: { action: "playingIP" } },
  { title: "COM #60 — Defesa IP: Bet vs Missed Cbet + Turns", module: "Aulas Ao Vivo", type: "video", url: u("com-60-bet-missed-turns"), tags: { action: "playingIP" } },
  { title: "Raio X PRO #27 — Jogando IP: Bet vs Missed Cbet", module: "Raio X PRO", type: "video", url: u("rxpro-27-bet-missed"), tags: { action: "playingIP" } },
];

// ---------------------------------------------------------------------------
// TEMAS AVANÇADOS (Tier 3)
// ---------------------------------------------------------------------------
const SQUEEZE_LESSONS: Lesson[] = [
  { title: "Aplicando um Squeeze + Treino GTO", module: "MTT Elite", type: "video", url: u("mtt-elite-squeeze"), tags: { action: "squeeze" } },
  { title: "COM #73 — Squeeze em torneios Vanilla", module: "Aulas Ao Vivo", type: "video", url: u("com-73-squeeze-vanilla"), tags: { action: "squeeze" } },
  { title: "COM #74 — Squeeze em torneios PKO", module: "Aulas Ao Vivo", type: "video", url: u("com-74-squeeze-pko"), tags: { action: "squeeze" } },
  { title: "Raio X PRO #12 — Squeeze", module: "Raio X PRO", type: "video", url: u("rxpro-12-squeeze"), tags: { action: "squeeze" } },
];

const PROBE_RIVER_LESSONS: Lesson[] = [
  { title: "Regra de Bolso — Probe River do BB", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-probe-river"), tags: { action: "probeRiver", positions: ["BB"] } },
  { title: "Treino Probe River do BB (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-probe-river"), tags: { action: "probeRiver", positions: ["BB"] } },
  { title: "COM #9 — Explorando conceitos: Probe River", module: "Aulas Ao Vivo", type: "video", url: u("com-9-probe-river"), tags: { action: "probeRiver" } },
];

const PROBE_TURN_LESSONS: Lesson[] = [
  { title: "Regra de Bolso — Probe Turn do BB", module: "Modo Carreira", type: "video", url: u("mc-regra-bolso-probe-turn"), tags: { action: "probeTurn", positions: ["BB"] } },
  { title: "Treino Probe Turn do BB (Simulador MDA)", module: "Modo Carreira", type: "treino", url: u("mc-treino-probe-turn"), tags: { action: "probeTurn", positions: ["BB"] } },
  { title: "Probe Bet Turn no BB + Treino GTO", module: "MTT Elite", type: "video", url: u("mtt-elite-probe-turn"), tags: { action: "probeTurn", positions: ["BB"] } },
  { title: "COM #66 — Probe Turn", module: "Aulas Ao Vivo", type: "video", url: u("com-66-probe-turn"), tags: { action: "probeTurn" } },
  { title: "Raio X PRO #9 — Probe Turn", module: "Raio X PRO", type: "video", url: u("rxpro-9-probe-turn"), tags: { action: "probeTurn" } },
];

const VS_CHECK_RAISE_LESSONS: Lesson[] = [
  { title: "Enfrentando um Check-Raise + Treino GTO", module: "MTT Elite", type: "video", url: u("mtt-elite-vs-xr"), tags: { action: "vsCheckRaise" } },
  { title: "COM #31 — Enfrentando um Check-Raise Flop", module: "Aulas Ao Vivo", type: "video", url: u("com-31-vs-xr-flop"), tags: { action: "vsCheckRaise" } },
];

const DELAY_CBET_LESSONS: Lesson[] = [
  { title: "Delayed Cbet + Treino GTO", module: "MTT Elite", type: "video", url: u("mtt-elite-delay-cbet"), tags: { action: "delayCbet" } },
  { title: "Delayed Cbet IP — Koscky", module: "Aulas Ao Vivo", type: "video", url: u("cdp-delay-cbet-ip"), tags: { action: "delayCbet" } },
  { title: "Delayed Cbet OOP — Koscky", module: "Aulas Ao Vivo", type: "video", url: u("cdp-delay-cbet-oop"), tags: { action: "delayCbet" } },
];

const POTE_3BET_LESSONS: Lesson[] = [
  { title: "Pós Flop em Pot 3betado + Treino GTO", module: "MTT Elite", type: "video", url: u("mtt-elite-pote-3bet"), tags: { action: "pote3bet" } },
  { title: "COM #49 — 3Bet Pot IP: BTN vs CO", module: "Aulas Ao Vivo", type: "video", url: u("com-49-3bet-pot-btn-co"), tags: { action: "pote3bet" } },
  { title: "COM #50 — 3Bet Pot IP: HJ vs LJ", module: "Aulas Ao Vivo", type: "video", url: u("com-50-3bet-pot-hj-lj"), tags: { action: "pote3bet" } },
  { title: "COM #52 — 3Bet Pot OOP: SB vs BTN", module: "Aulas Ao Vivo", type: "video", url: u("com-52-3bet-pot-sb-btn"), tags: { action: "pote3bet" } },
  { title: "COM #53 — 3Bet Pot OOP: BB vs BTN", module: "Aulas Ao Vivo", type: "video", url: u("com-53-3bet-pot-bb-btn"), tags: { action: "pote3bet" } },
];

const CBET_VS_SB_LESSONS: Lesson[] = [
  { title: "Cbet em Posição (Contra o SB) + Treino GTO", module: "MTT Profissional", type: "video", url: u("mtt-pro-cbet-vs-sb"), tags: { action: "cbetVsSB" } },
  { title: "COM #71 — Estratégias Pós Flop BTN vs SB (Vanilla)", module: "Aulas Ao Vivo", type: "video", url: u("com-71-btn-vs-sb-vanilla"), tags: { action: "cbetVsSB" } },
  { title: "COM #72 — Estratégias Pós Flop BTN vs SB (PKO)", module: "Aulas Ao Vivo", type: "video", url: u("com-72-btn-vs-sb-pko"), tags: { action: "cbetVsSB" } },
];

// ---------------------------------------------------------------------------
// GERAL
// ---------------------------------------------------------------------------
const GENERAL_LESSONS: Lesson[] = [
  { title: "Princípios do Poker — EV, frequência e equity", module: "Princípios do Poker", type: "video", url: u("principios-do-poker"), tags: { action: "geral" } },
];

// ---------------------------------------------------------------------------
// CATÁLOGO COMPLETO
// ---------------------------------------------------------------------------
export const LESSON_CATALOG: Lesson[] = [
  ...RFI_LESSONS,
  ...CBET_LESSONS,
  ...CBET_TURN_RIVER_LESSONS,
  ...VS_RFI_LESSONS,
  ...BB_DEFENSE_LESSONS,
  ...BLIND_WAR_LESSONS,
  ...VS_CBET_LESSONS,
  ...VS_3BET_LESSONS,
  ...MULTIWAY_LESSONS,
  ...CBET_OOP_LESSONS,
  ...PLAYING_IP_LESSONS,
  ...SQUEEZE_LESSONS,
  ...PROBE_RIVER_LESSONS,
  ...PROBE_TURN_LESSONS,
  ...VS_CHECK_RAISE_LESSONS,
  ...DELAY_CBET_LESSONS,
  ...POTE_3BET_LESSONS,
  ...CBET_VS_SB_LESSONS,
  ...GENERAL_LESSONS,
];
