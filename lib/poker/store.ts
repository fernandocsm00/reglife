// Zustand store for the spot drill session.

import { create } from "zustand";
import {
  createDrill,
  initializeDrillContext,
  isCorrectChoice,
  validateSpotConfig,
  type DrillContext,
} from "./spotEngine";
import type { CurrentDrill, SpotConfigFile } from "./types";

interface DrillState {
  context: DrillContext | null;
  drill: CurrentDrill | null;
  errorMessage: string;

  // session metrics
  totalHandsPlayed: number;
  correctPlays: number;
  hasPickedAnswer: boolean;
  drillCompleted: boolean;

  // Sequential mode state. Empty array means random mode.
  sequentialQueue: number[];
  sequentialCursor: number;

  loadConfig: (raw: unknown) => void;
  pickAnswer: (buttonText: string) => void;
  nextDrill: () => void;
  restart: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const useDrillStore = create<DrillState>((set, get) => ({
  context: null,
  drill: null,
  errorMessage: "",
  totalHandsPlayed: 0,
  correctPlays: 0,
  hasPickedAnswer: false,
  drillCompleted: false,
  sequentialQueue: [],
  sequentialCursor: 0,

  loadConfig: (raw) => {
    if (!validateSpotConfig(raw)) {
      set({ errorMessage: "Invalid Spot configuration file" });
      return;
    }
    const config = raw as SpotConfigFile;
    const context = initializeDrillContext(config);
    const isSequential = config.mode === "sequential";
    const queue = isSequential
      ? shuffle(context.expectedAnswers.map((_, i) => i))
      : [];
    const drill = isSequential
      ? createDrill(context, { expectedAnswerIndex: queue[0] })
      : createDrill(context);
    set({
      context,
      drill,
      errorMessage: "",
      totalHandsPlayed: 0,
      correctPlays: 0,
      hasPickedAnswer: false,
      drillCompleted: false,
      sequentialQueue: queue,
      sequentialCursor: 0,
    });
  },

  pickAnswer: (buttonText) => {
    const {
      drill,
      totalHandsPlayed,
      correctPlays,
      context,
      sequentialQueue,
    } = get();
    if (!drill || !context) return;

    const correct = isCorrectChoice(drill, buttonText);
    const newButtons = drill.actionButtons.map((b) =>
      b.text === buttonText ? { ...b, pickedByUser: true } : b
    );
    const isSequential = sequentialQueue.length > 0;
    const sessionLimit = isSequential
      ? sequentialQueue.length
      : context.config.sessionSize ?? 0;
    const newTotal = totalHandsPlayed + 1;
    const newCorrect = correct ? correctPlays + 1 : correctPlays;
    set({
      drill: { ...drill, actionButtons: newButtons },
      totalHandsPlayed: newTotal,
      correctPlays: newCorrect,
      hasPickedAnswer: true,
      drillCompleted: sessionLimit > 0 && newTotal >= sessionLimit,
    });
  },

  nextDrill: () => {
    const { context, sequentialQueue, sequentialCursor } = get();
    if (!context) return;
    if (sequentialQueue.length > 0) {
      const nextCursor = sequentialCursor + 1;
      if (nextCursor >= sequentialQueue.length) {
        // Safety: should already be drillCompleted; do nothing.
        set({ hasPickedAnswer: false });
        return;
      }
      set({
        drill: createDrill(context, {
          expectedAnswerIndex: sequentialQueue[nextCursor],
        }),
        sequentialCursor: nextCursor,
        hasPickedAnswer: false,
      });
      return;
    }
    set({ drill: createDrill(context), hasPickedAnswer: false });
  },

  restart: () => {
    const { context } = get();
    if (!context) return;
    const isSequential = context.config.mode === "sequential";
    const queue = isSequential
      ? shuffle(context.expectedAnswers.map((_, i) => i))
      : [];
    const drill = isSequential
      ? createDrill(context, { expectedAnswerIndex: queue[0] })
      : createDrill(context);
    set({
      drill,
      totalHandsPlayed: 0,
      correctPlays: 0,
      hasPickedAnswer: false,
      drillCompleted: false,
      sequentialQueue: queue,
      sequentialCursor: 0,
    });
  },
}));
