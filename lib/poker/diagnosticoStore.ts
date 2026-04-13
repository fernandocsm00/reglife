// Multi-spot session store for the diagnostic flow.
// Evaluates each spot independently (≥70% to pass). After 3 failed spots
// the diagnostic ends early and builds the plan from the weakest areas.

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
  spotLabel: string;
  action: PokerAction;
  tier: number;
  position: string;
  stackSize: number;
  board: string;
  hand: string;
  picked: string;
  expected: string[];
  isCorrect: boolean;
}

export interface SpotSummary {
  label: string;
  action: PokerAction;
  tier: number;
  correct: number;
  total: number;
  pct: number;
  passed: boolean; // ≥70%
}

const PASS_THRESHOLD = 70;
const MAX_FAILED_SPOTS = 3;

interface SubSession {
  ctx: DrillContext;
  label: string;
  action: PokerAction;
  tier: number;
  queue: number[];
}

interface DiagnosticoState {
  sessions: SubSession[];
  contextIdx: number;
  cursorInContext: number;

  drill: CurrentDrill | null;
  hasPickedAnswer: boolean;
  completed: boolean;
  stoppedEarly: boolean; // true when 3 spots failed
  errorMessage: string;

  results: ResultEntry[];
  spotSummaries: SpotSummary[];
  failedSpotCount: number;

  // Progress helpers
  totalSpots: number;
  currentSpotDrills: number; // total drills in current spot
  currentSpotPlayed: number; // drills played in current spot
  currentSpotCorrect: number; // correct answers in current spot
  drillsPlayed: number; // overall

  // Onboarding
  playerName: string;
  email: string;
  phone: string;
  studyTime: StudyTime;
  monthlyVolume: MonthlyVolume;

  // Spot transition overlay
  showSpotTransition: boolean;
  lastSpotSummary: SpotSummary | null;

  loadConfigs: (raws: unknown[]) => void;
  pickAnswer: (buttonText: string) => void;
  nextDrill: () => void;
  dismissSpotTransition: () => void;
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
  stoppedEarly: false,
  errorMessage: "",
  results: [],
  spotSummaries: [],
  failedSpotCount: 0,
  totalSpots: 0,
  currentSpotDrills: 0,
  currentSpotPlayed: 0,
  currentSpotCorrect: 0,
  drillsPlayed: 0,
  playerName: "",
  email: "",
  phone: "",
  studyTime: "ate15",
  monthlyVolume: "ate50",
  showSpotTransition: false,
  lastSpotSummary: null,

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
        action: config.action as PokerAction,
        tier: config.tier ?? 1,
        queue,
      });
    }

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
      stoppedEarly: false,
      errorMessage: "",
      results: [],
      spotSummaries: [],
      failedSpotCount: 0,
      totalSpots: sessions.length,
      currentSpotDrills: first?.queue.length ?? 0,
      currentSpotPlayed: 0,
      currentSpotCorrect: 0,
      drillsPlayed: 0,
      showSpotTransition: false,
      lastSpotSummary: null,
    });
  },

  pickAnswer: (buttonText) => {
    const { drill, sessions, contextIdx, results, drillsPlayed, currentSpotPlayed, currentSpotCorrect } = get();
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
      currentSpotPlayed: currentSpotPlayed + 1,
      currentSpotCorrect: currentSpotCorrect + (correct ? 1 : 0),
    });
  },

  nextDrill: () => {
    const { sessions, contextIdx, cursorInContext, currentSpotPlayed, currentSpotCorrect,
      spotSummaries, failedSpotCount } = get();
    if (sessions.length === 0) return;

    let nextCursor = cursorInContext + 1;
    let nextCtxIdx = contextIdx;

    // Check if current spot just finished
    if (nextCursor >= sessions[nextCtxIdx].queue.length) {
      // --- Evaluate the just-completed spot ---
      const finishedSession = sessions[nextCtxIdx];
      const pct = currentSpotPlayed > 0
        ? Math.round((currentSpotCorrect / currentSpotPlayed) * 100)
        : 0;
      const passed = pct >= PASS_THRESHOLD;
      const summary: SpotSummary = {
        label: finishedSession.label,
        action: finishedSession.action,
        tier: finishedSession.tier,
        correct: currentSpotCorrect,
        total: currentSpotPlayed,
        pct,
        passed,
      };
      const newSummaries = [...spotSummaries, summary];
      const newFailedCount = failedSpotCount + (passed ? 0 : 1);

      // Should we stop early? (3 failed spots)
      if (newFailedCount >= MAX_FAILED_SPOTS) {
        set({
          spotSummaries: newSummaries,
          failedSpotCount: newFailedCount,
          completed: true,
          stoppedEarly: true,
          hasPickedAnswer: false,
          showSpotTransition: false,
          lastSpotSummary: summary,
        });
        return;
      }

      // Move to next spot
      nextCtxIdx += 1;
      nextCursor = 0;

      // All spots consumed?
      if (nextCtxIdx >= sessions.length) {
        set({
          spotSummaries: newSummaries,
          failedSpotCount: newFailedCount,
          completed: true,
          stoppedEarly: false,
          hasPickedAnswer: false,
          showSpotTransition: false,
          lastSpotSummary: summary,
        });
        return;
      }

      // Show spot transition overlay before starting next spot
      const nextSession = sessions[nextCtxIdx];
      set({
        spotSummaries: newSummaries,
        failedSpotCount: newFailedCount,
        showSpotTransition: true,
        lastSpotSummary: summary,
        contextIdx: nextCtxIdx,
        cursorInContext: 0,
        currentSpotDrills: nextSession.queue.length,
        currentSpotPlayed: 0,
        currentSpotCorrect: 0,
        hasPickedAnswer: false,
        drill: createDrill(nextSession.ctx, {
          expectedAnswerIndex: nextSession.queue[0],
        }),
      });
      return;
    }

    // Normal advance within the same spot
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

  dismissSpotTransition: () => {
    set({ showSpotTransition: false });
  },
}));
