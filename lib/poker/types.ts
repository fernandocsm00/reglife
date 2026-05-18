// Domain types for the poker spot trainer.
// Ported from PokerTrainer-3.1 interfaces, normalized for the new project.

export type PokerAction =
  | "RFI"
  | "vsOpen"
  | "vs3Bet"
  | "cBet"
  | "vsBBISO"
  | "blindWar"
  | "vsCbet"
  | "multiway"
  | "cbetTurn"
  | "cbetRiver";

export interface ActionButtonConfig {
  text: string;
  color: string;
}

export interface ActionHistoryItem {
  position: string;
  action: string;
}

export interface ActionHistoryStreet {
  street: string; // "PRE FLOP" | "FLOP" | "TURN" | "RIVER"
  actions: ActionHistoryItem[];
}

export interface TableConfigOverride {
  position: string;
  stackSize: number;
  bounty: number;
}

export interface ExpectedAnswerCombos {
  combos: string[]; // raw notation: "AA", "AKs", "AKo", "T9s+", "22-66", "AcKd", "default"
  answer: string[]; // matches actionButtons[].text
}

export interface ExpectedAnswerSpotConfig {
  villainStackSize?: number;
  heroStackSize?: number;
  villainBetSize?: number;
  heroBetSize?: number;
  potSize?: number;
  currentPotSize?: number;
  actionHistory?: ActionHistoryStreet[];
  tableConfiguration?: TableConfigOverride[];
  /** Override por cenário: força mostrar todos os tamanhos só neste expectedAnswer. */
  showAllSizes?: boolean;
}

export interface ExpectedAnswer {
  id?: string; // assigned at runtime
  position: string; // hero position (or villain in cBet)
  stackSize: number;
  villainPosition?: string;
  /** For multiway: multiple villain positions override config.villainPositions */
  villainPositions?: string[];
  board?: string;
  spotConfig?: ExpectedAnswerSpotConfig;
  expectedAnswers: ExpectedAnswerCombos[];
}

export interface SpotConfigFile {
  name?: string;
  action: PokerAction;
  /**
   * Drill selection mode.
   * - "random" (default): each drill picks a random expectedAnswer (may repeat).
   * - "sequential": expectedAnswers are shuffled once at session start and then
   *   presented in order, each exactly once. Session ends when all are consumed.
   */
  mode?: "random" | "sequential";
  /** Tier de treinamento (1, 2 ou 3). Usado no nivelamento pra classificar o aluno. */
  tier?: number;
  sessionSize?: number;
  potSize: number;
  currentPotSize: number;
  tableSize: number; // 2..9
  villainPositions?: string[];
  villainBetSize?: number;
  heroBetSize?: number;
  actionButtons: ActionButtonConfig[];
  actionHistory?: ActionHistoryStreet[];
  /**
   * Quando true, NÃO filtra os botões dimensionados (RAISE/BET/CBET) pra
   * mostrar só os tamanhos corretos. Aluno enxerga todos os tamanhos como
   * distratores. Útil em spots onde a escolha do tamanho é o aprendizado
   * principal (ex.: cbet turn).
   *
   * Default: false (filtro ativo, como o resto do trainer).
   */
  showAllSizes?: boolean;
  /**
   * Quando definido, se NENHUM RAISE for a resposta correta da mão atual,
   * mostra apenas este botão entre os RAISE — os outros tamanhos somem.
   * Combina com o filtro normal: se houver RAISE correto, só ele aparece
   * (comportamento existente). Resultado: o aluno SEMPRE vê 1 e apenas 1
   * botão de RAISE no spot.
   *
   * Valor: o texto exato do botão (ex.: "RAISE 6").
   */
  defaultRaiseSize?: string;
  expectedAnswers: ExpectedAnswer[];
  // Optional / legacy fields seen in real config files
  stackSize?: number | number[];
  heroPositions?: string[];
  rangeToBeDealt?: string[];
}

// Runtime model — what the UI consumes
export interface PlayerSeat {
  index: number; // 1..tableSize, 1 = hero seat (bottom)
  position: string; // "BTN", "SB", etc.
  hasChipsInFront: boolean;
  hasCards: boolean; // is showing card backs (active opponent)
  amountOfChips: number;
  isHero: boolean;
  isVillain: boolean;
  stackSize: number;
  bounty: number;
}

export interface ActionButtonState {
  text: string;
  color: string;
  isCorrect: boolean;
  pickedByUser: boolean;
}

export interface CurrentDrill {
  configName: string;
  action: PokerAction;
  stackSize: number;
  villainBetSize: number;
  heroBetSize: number;
  potSize: number;
  currentPotSize: number;
  heroPosition: string;
  villainPosition: string;
  actionButtons: ActionButtonState[];
  cardsOnHand: string; // e.g. "9h5d"
  board: string; // "AsKd5h" or "" or "-"-separated
  answerId: string;
  actionHistory: ActionHistoryStreet[];
  players: PlayerSeat[];
}
