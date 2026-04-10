// Multi-spot session store for the diagnostic flow.
// Plays all RFI scenarios first, then all C-Bet scenarios in sequence,
// records every answer, and ends with a results screen + action plan.

import { create } from "zustand";
import {
  createDrill,
  initializeDrillContext,
  isCorrectChoice,
  validateSpotConfig,
  type DrillContext,
} from "./spotEngine";
import type { CurrentDrill, PokerAction, SpotConfigFile } from "./types";
import type { MonthlyVolume, StudyTime } from "./planStorage";

export interface ResultEntry {
  spotLabel: string;        // human-friendly name of the spot
  action: PokerAction;      // RFI / cBet / etc
  tier: number;             // 1, 2 ou 3
  position: string;
  stackSize: number;
  board: string;
  hand: string;
  picked: string;           // button text the user clicked
  expected: string[];       // correct button(s)
  isCorrect: boolean;
}

interface SubSession {
  ctx: DrillContext;
  label: string;
  tier: number;
  queue: number[]; // shuffled indices of expectedAnswers
}

interface DiagnosticoState {
  sessions: SubSession[];
  contextIdx: number;
  cursorInContext: number;

  drill: CurrentDrill | null;
  hasPickedAnswer: boolean;
  completed: boolean;
  errorMessage: string;

  results: ResultEntry[];

  // Derived progress
  totalDrills: number;
  drillsPlayed: number;

  // Onboarding
  playerName: string;
  email: string;
  phone: string;
  studyTime: StudyTime;
  monthlyVolume: MonthlyVolume;

  loadConfigs: (raws: unknown[]) => void;
  pickAnswer: (buttonText: string) => void;
  nextDrill: () => void;
  setOnboarding: (data: {
    playerName: string;
    email: string;
    phone: string;
    studyTime: StudyTime;
    monthlyVolume: MonthlyVolume;
  }) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const useDiagnosticoStore = create<DiagnosticoState>((set, get) => ({
  sessions: [],
  contextIdx: 0,
  cursorInContext: 0,
  drill: null,
  hasPickedAnswer: false,
  completed: false,
  errorMessage: "",
  results: [],
  totalDrills: 0,
  drillsPlayed: 0,
  playerName: "",
  email: "",
  phone: "",
  studyTime: "ate15",
  monthlyVolume: "ate50",

  setOnboarding: ({ playerName, email, phone, studyTime, monthlyVolume }) =>
    set({ playerName, email, phone, studyTime, monthlyVolume }),

  loadConfigs: (raws) => {
    const sessions: SubSession[] = [];
    for (const raw of raws) {
      if (!validateSpotConfig(raw)) {
        set({ errorMessage: "Configuração de spot inválida" });
        return;
      }
      const config = raw as SpotConfigFile;
      const ctx = initializeDrillContext(config);
      const queue = shuffle(ctx.expectedAnswers.map((_, i) => i));
      sessions.push({
        ctx,
        label: config.name ?? config.action,
        tier: config.tier ?? 1,
        queue,
      });
    }

    const totalDrills = sessions.reduce((sum, s) => sum + s.queue.length, 0);
    const first = sessions[0];
    const drill = first
      ? createDrill(first.ctx, { expectedAnswerIndex: first.queue[0] })
      : null;

    set({
      sessions,
      contextIdx: 0,
      cursorInContext: 0,
      drill,
      hasPickedAnswer: false,
      completed: false,
      errorMessage: "",
      results: [],
      totalDrills,
      drillsPlayed: 0,
    });
  },

  pickAnswer: (buttonText) => {
    const { drill, sessions, contextIdx, results, drillsPlayed } = get();
    if (!drill) return;
    const session = sessions[contextIdx];
    if (!session) return;

    const correct = isCorrectChoice(drill, buttonText);
    const newButtons = drill.actionButtons.map((b) =>
      b.text === buttonText ? { ...b, pickedByUser: true } : b
    );
    const expectedButtons = drill.actionButtons
      .filter((b) => b.isCorrect)
      .map((b) => b.text);

    const entry: ResultEntry = {
      spotLabel: session.label,
      action: drill.action,
      tier: session.tier,
      position: drill.heroPosition,
      stackSize: drill.stackSize,
      board: drill.board,
      hand: drill.cardsOnHand,
      picked: buttonText,
      expected: expectedButtons,
      isCorrect: correct,
    };

    set({
      drill: { ...drill, actionButtons: newButtons },
      hasPickedAnswer: true,
      results: [...results, entry],
      drillsPlayed: drillsPlayed + 1,
    });
  },

  nextDrill: () => {
    const { sessions, contextIdx, cursorInContext } = get();
    if (sessions.length === 0) return;

    let nextCursor = cursorInContext + 1;
    let nextCtxIdx = contextIdx;

    if (nextCursor >= sessions[nextCtxIdx].queue.length) {
      nextCtxIdx += 1;
      nextCursor = 0;
    }

    if (nextCtxIdx >= sessions.length) {
      // All drills consumed → trigger results screen
      set({ completed: true, hasPickedAnswer: false });
      return;
    }

    const session = sessions[nextCtxIdx];
    const drill = createDrill(session.ctx, {
      expectedAnswerIndex: session.queue[nextCursor],
    });

    set({
      contextIdx: nextCtxIdx,
      cursorInContext: nextCursor,
      drill,
      hasPickedAnswer: false,
    });
  },
}));
