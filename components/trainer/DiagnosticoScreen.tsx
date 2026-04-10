"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { useDiagnosticoStore } from "@/lib/poker/diagnosticoStore";
import { PokerTable } from "./PokerTable";
import { ActionButtonsBar } from "./ActionButtonsBar";
import { ActionHistoryPanel } from "./ActionHistoryPanel";
import { OnboardingForm } from "./OnboardingForm";
import { Logo } from "@/components/Logo";
import { sounds } from "@/lib/audio/sounds";
import { analyzeResults } from "@/lib/poker/leakAnalysis";
import { buildPlan } from "@/lib/poker/planBuilder";
import { getStoredPlan, isLocked, savePlan } from "@/lib/poker/planStorage";

interface Props {
  initialConfigs: unknown[];
}

export function DiagnosticoScreen({ initialConfigs }: Props) {
  const router = useRouter();

  const drill = useDiagnosticoStore((s) => s.drill);
  const errorMessage = useDiagnosticoStore((s) => s.errorMessage);
  const hasPicked = useDiagnosticoStore((s) => s.hasPickedAnswer);
  const completed = useDiagnosticoStore((s) => s.completed);
  const drillsPlayed = useDiagnosticoStore((s) => s.drillsPlayed);
  const totalDrills = useDiagnosticoStore((s) => s.totalDrills);
  const results = useDiagnosticoStore((s) => s.results);

  const playerName = useDiagnosticoStore((s) => s.playerName);
  const email = useDiagnosticoStore((s) => s.email);
  const phone = useDiagnosticoStore((s) => s.phone);
  const studyTime = useDiagnosticoStore((s) => s.studyTime);
  const monthlyVolume = useDiagnosticoStore((s) => s.monthlyVolume);

  const loadConfigs = useDiagnosticoStore((s) => s.loadConfigs);
  const pickAnswer = useDiagnosticoStore((s) => s.pickAnswer);
  const nextDrill = useDiagnosticoStore((s) => s.nextDrill);
  const setOnboarding = useDiagnosticoStore((s) => s.setOnboarding);

  const [muted, setMuted] = useState(false);
  const builtRef = useRef(false);

  // Lock guard: if a previous plan is still in cooldown, kick the user out.
  useEffect(() => {
    const previous = getStoredPlan();
    if (isLocked(previous)) {
      router.replace("/meu-plano");
    }
  }, [router]);

  useEffect(() => {
    loadConfigs(initialConfigs);
  }, [initialConfigs, loadConfigs]);

  // Replay deal sound on each new drill
  useEffect(() => {
    if (drill && !hasPicked) sounds.deal();
  }, [drill?.cardsOnHand, drill?.heroPosition, drill?.board, hasPicked, drill]);

  // On completion: build plan, persist, redirect
  useEffect(() => {
    if (!completed) return;
    if (builtRef.current) return;
    if (results.length === 0) return;

    builtRef.current = true;
    const summary = analyzeResults(results);
    const previous = getStoredPlan();
    const plan = buildPlan({
      summary,
      playerName: playerName || "Jogador",
      email,
      phone,
      studyTime,
      monthlyVolume,
      previous,
    });
    savePlan(plan);
    // Pequena pausa pra mostrar a tela "Montando seu plano…" e dar peso ao momento.
    const t = setTimeout(() => router.push("/meu-plano"), 900);
    return () => clearTimeout(t);
  }, [
    completed,
    results,
    playerName,
    email,
    phone,
    studyTime,
    monthlyVolume,
    router,
  ]);

  const handlePick = (text: string) => {
    pickAnswer(text);
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

  // Onboarding gate
  if (!playerName) {
    return <OnboardingForm onSubmit={setOnboarding} />;
  }

  if (completed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center text-neutral-100">
        <Logo size="lg" className="mb-6" />
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold"
        >
          Montando seu plano de 90 dias…
        </motion.div>
        <p className="mt-2 text-sm text-neutral-400">
          Analisando seus pontos fracos e selecionando as aulas certas pra você.
        </p>
      </div>
    );
  }

  if (!drill) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-400">
        Carregando trainer…
      </div>
    );
  }

  const drillKey = `${drill.heroPosition}-${drill.cardsOnHand}-${drill.answerId}-${drillsPlayed}`;
  const isLastDrill = drillsPlayed >= totalDrills;
  const correctSoFar = results.filter((r) => r.isCorrect).length;

  return (
    <div className="relative min-h-screen bg-neutral-950 text-neutral-100">
      {/* Top-left: history */}
      <div className="absolute left-4 top-4 w-44 space-y-4">
        <ActionHistoryPanel history={drill.actionHistory} />
      </div>

      {/* Top-right: progress + mute */}
      <div className="absolute right-4 top-4 flex items-center gap-3 text-sm text-neutral-400">
        <button
          onClick={toggleMute}
          className="rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
          aria-label={muted ? "Ativar som" : "Silenciar"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <span>
          Mão{" "}
          {Math.min(drillsPlayed + (hasPicked ? 0 : 1), totalDrills)} /{" "}
          {totalDrills}
        </span>
        {drillsPlayed > 0 && (
          <span className="text-emerald-400">
            ({Math.round((correctSoFar / drillsPlayed) * 100)}% acerto)
          </span>
        )}
      </div>

      {/* Brand bottom-left */}
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
          {hasPicked && (
            <motion.button
              key="next"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={() => {
                sounds.click();
                nextDrill();
              }}
              className="flex items-center gap-2 rounded-md bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-neutral-700"
            >
              {isLastDrill ? "Ver meu plano" : "Próxima mão"}
              <Image
                src="/trainer/icon-next.svg"
                alt="next"
                width={14}
                height={14}
              />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
