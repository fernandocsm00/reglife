"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useDrillStore } from "@/lib/poker/store";
import { PokerTable } from "./PokerTable";
import { ActionButtonsBar } from "./ActionButtonsBar";
import { ActionHistoryPanel } from "./ActionHistoryPanel";
import { Logo } from "@/components/Logo";
import { sounds } from "@/lib/audio/sounds";

interface Props {
  initialConfig: unknown;
  /**
   * Quando presente, ativa modo single-spot: cada mão é reportada pra
   * /api/spot-training, e ao desbloquear o spot redireciona pra /meu-plano.
   */
  singleSpotContext?: {
    diagnosticId: string;
    leakId: string;
  };
}

export function TrainerScreen({ initialConfig, singleSpotContext }: Props) {
  const drill = useDrillStore((s) => s.drill);
  const errorMessage = useDrillStore((s) => s.errorMessage);
  const hasPicked = useDrillStore((s) => s.hasPickedAnswer);
  const totalHandsPlayed = useDrillStore((s) => s.totalHandsPlayed);
  const correctPlays = useDrillStore((s) => s.correctPlays);
  const drillCompleted = useDrillStore((s) => s.drillCompleted);

  const loadConfig = useDrillStore((s) => s.loadConfig);
  const pickAnswerStore = useDrillStore((s) => s.pickAnswer);
  const nextDrillStore = useDrillStore((s) => s.nextDrill);
  const restartStore = useDrillStore((s) => s.restart);

  const [muted, setMuted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!singleSpotContext) {
      loadConfig(initialConfig);
      return;
    }
    loadConfig(initialConfig, {
      onHandPlayed: async ({ correct }) => {
        try {
          const res = await fetch("/api/spot-training", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              diagnosticId: singleSpotContext.diagnosticId,
              leakId: singleSpotContext.leakId,
              correct,
            }),
          });
          const data = (await res.json().catch(() => null)) as
            | { unlockedNow?: boolean }
            | null;
          if (data?.unlockedNow) {
            // delay pra animação de acerto terminar
            setTimeout(() => router.push("/meu-plano?unlocked=1"), 1500);
          }
        } catch (err) {
          console.warn("[trainer] spot-training report failed:", err);
        }
      },
    });
  }, [initialConfig, loadConfig, singleSpotContext, router]);

  // Replay deal sound whenever the drill changes
  useEffect(() => {
    if (drill && !hasPicked) sounds.deal();
  }, [drill?.cardsOnHand, drill?.heroPosition, hasPicked, drill]);

  const handlePick = (text: string) => {
    pickAnswerStore(text);
    // Determine correctness from the freshly picked button
    const picked = drill?.actionButtons.find((b) => b.text === text);
    if (picked?.isCorrect) sounds.correct();
    else sounds.wrong();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    sounds.setMuted(next);
  };

  if (errorMessage) {
    return (
      <div className="flex h-screen items-center justify-center text-red-400">
        {errorMessage}
      </div>
    );
  }
  if (!drill) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-400">
        Carregando spot…
      </div>
    );
  }

  // drillKey changes whenever a new drill is created — used to retrigger animations
  const drillKey = `${drill.heroPosition}-${drill.cardsOnHand}-${drill.answerId}-${totalHandsPlayed}`;

  return (
    <div className="relative min-h-screen bg-neutral-950 text-neutral-100">
      {/* Top-left: history + back */}
      <div className="absolute left-4 top-4 w-44 space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-neutral-500 transition hover:text-neutral-200"
        >
          ← Voltar
        </Link>
        <ActionHistoryPanel history={drill.actionHistory} />
      </div>

      {/* Top-right: counter + mute */}
      <div className="absolute right-4 top-4 flex items-center gap-3 text-sm text-neutral-400">
        <button
          onClick={toggleMute}
          className="rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
          aria-label={muted ? "Ativar som" : "Silenciar"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <span>Mãos: {totalHandsPlayed}</span>
        {totalHandsPlayed > 0 && (
          <span className="text-emerald-400">
            ({Math.round((correctPlays / totalHandsPlayed) * 100)}% acerto)
          </span>
        )}
      </div>

      {/* Brand */}
      <div className="absolute bottom-4 left-4">
        <Logo size="md" />
      </div>

      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
        <PokerTable drill={drill} drillKey={drillKey} />

        <div className="w-full">
          <ActionButtonsBar
            buttons={drill.actionButtons}
            hasPicked={hasPicked}
            onPick={handlePick}
          />
        </div>

        <AnimatePresence>
          {hasPicked && !drillCompleted && (
            <motion.button
              key="next"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={() => {
                sounds.click();
                nextDrillStore();
              }}
              className="flex items-center gap-2 rounded-md bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-neutral-700"
            >
              Próxima mão
              <Image src="/trainer/icon-next.svg" alt="next" width={14} height={14} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Session results modal */}
      <AnimatePresence>
        {drillCompleted && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center shadow-xl"
            >
              <div className="mb-2 text-2xl font-bold">Sessão concluída</div>
              <div className="mb-6 text-neutral-300">
                Acertos: {correctPlays} / {totalHandsPlayed}
              </div>
              <button
                onClick={() => {
                  sounds.click();
                  restartStore();
                }}
                className="rounded-md bg-amber-300 px-6 py-2 text-sm font-bold text-neutral-950 transition hover:bg-amber-200"
              >
                Recomeçar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
