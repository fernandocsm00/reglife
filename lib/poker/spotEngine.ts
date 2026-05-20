// Spot drill engine — pure functions, no React/Angular dependency.
// Ported from PokerTrainer-3.1/src/app/spot.service.ts

import {
  generateCombosFromNotationRange,
  listAllCardsCombos,
  pickRandomCardCombo,
} from "./range";
import { buildTableSeats } from "./table";
import type {
  ActionButtonState,
  CurrentDrill,
  ExpectedAnswer,
  ExpectedAnswerCombos,
  PokerAction,
  SpotConfigFile,
} from "./types";

// expectedAnswers in the legacy code are randomized on every "next hand" so we
// must precompute the per-button correct combo list once per drill set.
type CorrectAnswerMap = Map<string, Map<string, Set<string>>>;

function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function answerKey(
  position: string,
  board: string,
  stackSize: number,
  villainPosition: string,
  answerId: string
): string {
  return (
    position.toUpperCase() +
    board.toUpperCase() +
    stackSize.toString().toUpperCase() +
    villainPosition.toUpperCase() +
    answerId
  );
}

// ---- Validation -----------------------------------------------------------

export function validateSpotConfig(data: unknown): data is SpotConfigFile {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.action === "string" &&
    typeof d.potSize === "number" &&
    typeof d.currentPotSize === "number" &&
    typeof d.tableSize === "number" &&
    Array.isArray(d.actionButtons) &&
    Array.isArray(d.expectedAnswers)
  );
}

// ---- Map building ---------------------------------------------------------

// Builds the answer map: key (pos+board+stack+villain+id) -> button text -> set of legal combos.
export function buildCorrectAnswerMap(
  expectedAnswers: ExpectedAnswer[]
): CorrectAnswerMap {
  const result: CorrectAnswerMap = new Map();

  for (const ea of expectedAnswers) {
    const board = ea.board?.toUpperCase() ?? "";
    const villain = ea.villainPosition?.toUpperCase() ?? "";
    const id = ea.id ?? "";
    const key = ea.position.toUpperCase() + board + ea.stackSize.toString().toUpperCase() + villain + id;

    const buttonMap = buildExpectedAnswersForOne(ea.expectedAnswers);
    result.set(key, buttonMap);
  }

  return result;
}

function buildExpectedAnswersForOne(
  expectedAnswers: ExpectedAnswerCombos[]
): Map<string, Set<string>> {
  const buttonMap = new Map<string, Set<string>>();
  let allComboCovered: string[] = [];

  for (const ea of expectedAnswers) {
    if (ea.combos[0]?.toLowerCase() !== "default") {
      const combos = generateCombosFromNotationRange(ea.combos);
      allComboCovered = allComboCovered.concat(combos);
      for (const answer of ea.answer) {
        const upper = answer.toUpperCase();
        const existing = buttonMap.get(upper) ?? new Set<string>();
        for (const c of combos) existing.add(c);
        buttonMap.set(upper, existing);
      }
    } else {
      // "default" bucket = every combo not yet covered, assigned to ea.answer[0]
      const all = listAllCardsCombos();
      const remaining = all.filter((c) => !allComboCovered.includes(c));
      const upper = ea.answer[0].toUpperCase();
      buttonMap.set(upper, new Set(remaining));
    }
  }

  return buttonMap;
}

// Generate stable IDs for each expectedAnswer entry so we can disambiguate
// duplicate (position, stackSize, ...) tuples.
export function ensureExpectedAnswerIds(config: SpotConfigFile): ExpectedAnswer[] {
  return config.expectedAnswers.map((ea) => ({
    ...ea,
    id: ea.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)),
  }));
}

// ---- Drill creation -------------------------------------------------------

export interface DrillContext {
  config: SpotConfigFile;
  expectedAnswers: ExpectedAnswer[];
  correctAnswers: CorrectAnswerMap;
}

export function initializeDrillContext(rawConfig: SpotConfigFile): DrillContext {
  const expectedAnswers = ensureExpectedAnswerIds(rawConfig);
  const correctAnswers = buildCorrectAnswerMap(expectedAnswers);
  return { config: rawConfig, expectedAnswers, correctAnswers };
}

export interface CreateDrillOptions {
  /** If provided, forces this expectedAnswer index instead of picking randomly. */
  expectedAnswerIndex?: number;
}

export function createDrill(
  ctx: DrillContext,
  opts: CreateDrillOptions = {}
): CurrentDrill {
  const { config, expectedAnswers, correctAnswers } = ctx;
  const action = config.action;

  // 1. Pick an expected answer (forced index for sequential mode, else random)
  const idx =
    opts.expectedAnswerIndex !== undefined
      ? opts.expectedAnswerIndex % expectedAnswers.length
      : randInt(expectedAnswers.length);
  const ea = expectedAnswers[idx];
  const answerId = ea.id ?? "";
  const stackSize = ea.stackSize;
  const heroPosition = ea.position;
  const board = ea.board ?? "";
  const villainInAnswer = ea.villainPosition ?? "";

  // 2. Resolve overrides
  const villainBetSize = ea.spotConfig?.villainBetSize ?? config.villainBetSize ?? 0;
  const heroBetSize = ea.spotConfig?.heroBetSize ?? config.heroBetSize ?? 0;
  const potSize = ea.spotConfig?.potSize ?? config.potSize;
  const currentPotSize = ea.spotConfig?.currentPotSize ?? config.currentPotSize;
  const villainStackSize = ea.spotConfig?.villainStackSize ?? -1;
  const heroStackSize = ea.spotConfig?.heroStackSize ?? -1;
  const actionHistory = ea.spotConfig?.actionHistory ?? config.actionHistory ?? [];
  const tableConfiguration = ea.spotConfig?.tableConfiguration ?? [];

  // 3. Pick a random combo from the union of this answer's combos
  const rangeForThisAnswer = ea.expectedAnswers.flatMap((x) => x.combos);
  const cardsOnHand = pickRandomCardCombo(Array.from(new Set(rangeForThisAnswer)), board);

  // 4. Resolve villain seat(s) for the table.
  //    Per-scenario villainPositions (array) takes priority (multiway),
  //    then single villainPosition, then config-level list.
  const perSceneVillains = ea.villainPositions; // multiway array
  let villainPosition = villainInAnswer;
  if (!villainPosition && config.villainPositions?.length) {
    villainPosition = config.villainPositions[randInt(config.villainPositions.length)];
  }
  const villainPositionsForTable =
    perSceneVillains ??
    (villainPosition ? [villainPosition] : config.villainPositions ?? []);

  // 5. Build action buttons (each marked correct or wrong for this combo).
  // spotConfig.actionButtons sobrescreve o set default do config — usado em
  // spots multi-street/multi-stack onde os sizes válidos variam por cenário.
  const key = answerKey(heroPosition, board, stackSize, villainInAnswer, answerId);
  const buttonMap = correctAnswers.get(key);
  const buttonsForThisDrill = ea.spotConfig?.actionButtons ?? config.actionButtons;
  const allButtons: ActionButtonState[] = buttonsForThisDrill.map((btn) => ({
    text: btn.text,
    color: btn.color,
    isCorrect: buttonMap?.get(btn.text.toUpperCase())?.has(cardsOnHand) ?? false,
    pickedByUser: false,
  }));

  // Simplificação: quando uma ação dimensionada (RAISE/BET/CBET X) é a
  // resposta correta, mostrar apenas o(s) tamanho(s) correto(s) daquele
  // prefixo — esconde os outros tamanhos. Aplicado por prefixo, então um
  // spot pode ter ao mesmo tempo (ex.) RAISE filtrado e BET intacto.
  const sizedPrefixes = ["RAISE", "BET", "CBET"];
  const matchedPrefix = (text: string) =>
    sizedPrefixes.find((p) => {
      const t = text.toUpperCase();
      return t === p || t.startsWith(p + " ");
    });
  const correctPrefixes = new Set(
    allButtons
      .filter((b) => b.isCorrect)
      .map((b) => matchedPrefix(b.text))
      .filter((p): p is string => Boolean(p))
  );
  // Opt-out: quando showAllSizes=true (no config OU no spotConfig deste
  // cenário), NÃO filtra os botões dimensionados — todos os tamanhos
  // aparecem como distratores (ex.: cbet turn, onde a escolha do sizing é
  // o aprendizado principal). spotConfig vence o config global.
  const showAllSizes = ea.spotConfig?.showAllSizes ?? config.showAllSizes ?? false;
  let buttons =
    !showAllSizes && correctPrefixes.size
      ? allButtons.filter((b) => {
          const prefix = matchedPrefix(b.text);
          if (!prefix) return true; // FOLD, CALL, CHECK, LIMP, ALL-IN — sempre presentes
          if (!correctPrefixes.has(prefix)) return true; // prefixo sem correto no combo: distratores OK
          return b.isCorrect; // dentro do prefixo correto, só o tamanho certo
        })
      : allButtons;

  // defaultRaiseSize: quando nenhum RAISE é correto, mantém apenas o
  // tamanho default entre os RAISE — em vez de mostrar todos os 3 sizes
  // como distratores. Garante UM e apenas um botão de RAISE no spot.
  if (
    config.defaultRaiseSize &&
    !showAllSizes &&
    !correctPrefixes.has("RAISE")
  ) {
    const defaultRaiseUpper = config.defaultRaiseSize.toUpperCase();
    buttons = buttons.filter((b) => {
      const upper = b.text.toUpperCase();
      const isRaise = upper === "RAISE" || upper.startsWith("RAISE ");
      if (!isRaise) return true;
      return upper === defaultRaiseUpper;
    });
  }

  // 6. Build the table seats.
  const players = buildTableSeats({
    heroPosition,
    villainPositions: villainPositionsForTable,
    villainBetSize,
    action,
    tableSize: config.tableSize,
    stackSize,
    heroBetSize,
    villainStackSize,
    heroStackSize,
    selectedVillainPosition: villainPositionsForTable[0] ?? "",
    tableConfiguration,
  });

  return {
    configName: config.name ?? "",
    action,
    stackSize,
    villainBetSize,
    heroBetSize,
    potSize,
    currentPotSize,
    heroPosition,
    villainPosition: villainInAnswer || villainPosition,
    actionButtons: buttons,
    cardsOnHand,
    board,
    answerId,
    actionHistory,
    players,
  };
}

export function isCorrectChoice(
  drill: CurrentDrill,
  buttonText: string
): boolean {
  return drill.actionButtons.find((b) => b.text === buttonText)?.isCorrect ?? false;
}

export type { CorrectAnswerMap };
export type { PokerAction };
