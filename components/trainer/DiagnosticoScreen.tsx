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
  const stoppedEarly = useDiagnosticoStore((s) => s.stoppedEarly);
  const drillsPlayed = useDiagnosticoStore((s) => s.drillsPlayed);
  const results = useDiagnosticoStore((s) => s.results);

  const totalSpots = useDiagnosticoStore((s) => s.totalSpots);
  const contextIdx = useDiagnosticoStore((s) => s.contextIdx);
  const currentSpotDrills = useDiagnosticoStore((s) => s.currentSpotDrills);
  const currentSpotPlayed = useDiagnosticoStore((s) => s.currentSpotPlayed);
  const currentSpotCorrect = useDiagnosticoStore((s) => s.currentSpotCorrect);
  const spotSummaries = useDiagnosticoStore((s) => s.spotSummaries);
  const failedSpotCount = useDiagnosticoStore((s) => s.failedSpotCount);
  const sessions = useDiagnosticoStore((s) => s.sessions);

  const showSpotTransition = useDiagnosticoStore((s) => s.showSpotTransition);
  const lastSpotSummary = useDiagnosticoStore((s) => s.lastSpotSummary);

  const playerName = useDiagnosticoStore((s) => s.playerName);
  const email = useDiagnosticoStore((s) => s.email);
  const phone = useDiagnosticoStore((s) => s.phone);
  const studyTime = useDiagnosticoStore((s) => s.studyTime);
  const profitGoal = useDiagnosticoStore((s) => s.profitGoal);

  const loadConfigs = useDiagnosticoStore((s) => s.loadConfigs);
  const pickAnswer = useDiagnosticoStore((s) => s.pickAnswer);
  const nextDrill = useDiagnosticoStore((s) => s.nextDrill);
  const dismissSpotTransition = useDiagnosticoStore((s) => s.dismissSpotTransition);
  const setOnboarding = useDiagnosticoStore((s) => s.setOnboarding);

  const [muted, setMuted] = useState(false);
  const builtRef = useRef(false);

  // Lock guard
  useEffect(() => {
    const previous = getStoredPlan();
    if (isLocked(previous)) {
      router.replace("/meu-plano");
    }
  }, [router]);

  useEffect(() => {
    loadConfigs(initialConfigs);
  }, [initialConfigs, loadConfigs]);

  // Deal sound on each new drill
  useEffect(() => {
    if (drill && !hasPicked && !showSpotTransition) sounds.deal();
  }, [drill?.cardsOnHand, drill?.heroPosition, drill?.board, hasPicked, drill, showSpotTransition]);

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
      profitGoal,
      previous,
      stoppedEarly,
      spotsPlayed: spotSummaries.length,
      spotsFailed: failedSpotCount,
    });
    savePlan(plan);
    const t = setTimeout(() => router.push("/meu-plano"), 900);
    return () => clearTimeout(t);
  }, [completed, results, playerName, email, phone, studyTime, profitGoal, router,
      stoppedEarly, spotSummaries, failedSpotCount]);

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

  // "Montando seu plano…" screen
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
          {stoppedEarly
            ? "Identificamos suas principais dificuldades. Preparando um plano personalizado."
            : "Analisando seus pontos fracos e selecionando as aulas certas pra você."}
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

  // Spot transition overlay
  if (showSpotTransition && lastSpotSummary) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center text-neutral-100">
        <Logo size="md" className="mb-8" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm space-y-6"
        >
          {/* Just-completed spot result */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Spot concluído
            </p>
            <p className="mt-1 text-lg font-bold">{lastSpotSummary.label}</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl font-black ${
                  lastSpotSummary.passed
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {lastSpotSummary.pct}%
              </div>
              <div className="text-left text-sm text-neutral-400">
                <p>
                  {lastSpotSummary.correct}/{lastSpotSummary.total} acertos
                </p>
                <p className={lastSpotSummary.passed ? "text-emerald-400" : "text-red-400"}>
                  {lastSpotSummary.passed ? "Aprovado" : "Precisa melhorar"}
                </p>
              </div>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2">
            {spotSummaries.map((s, i) => (
              <div
                key={i}
                className={`h-3 w-3 rounded-full ${
                  s.passed ? "bg-emerald-500" : "bg-red-500"
                }`}
                title={`${s.label}: ${s.pct}%`}
              />
            ))}
            {Array.from({ length: totalSpots - spotSummaries.length }).map((_, i) => (
              <div
                key={`pending-${i}`}
                className="h-3 w-3 rounded-full bg-neutral-700"
              />
            ))}
          </div>

          {/* Failed counter warning */}
          {failedSpotCount > 0 && (
            <p className="text-xs text-neutral-500">
              {failedSpotCount}/3 spots abaixo de 70%
              {failedSpotCount >= 2 && " — mais 1 e o diagnóstico encerra"}
            </p>
          )}

          {/* Next spot info + CTA */}
          <div className="space-y-3">
            <p className="text-sm text-neutral-400">
              Próximo:{" "}
              <span className="font-semibold text-neutral-200">
                {sessions[contextIdx]?.label ?? ""}
              </span>{" "}
              <span className="text-neutral-500">
                ({currentSpotDrills} mãos)
              </span>
            </p>
            <button
              onClick={() => {
                sounds.click();
                dismissSpotTransition();
              }}
              className="w-full rounded-lg bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-500"
            >
              Continuar
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const drillKey = `${drill.heroPosition}-${drill.cardsOnHand}-${drill.answerId}-${drillsPlayed}`;
  const isLastDrillInSpot = currentSpotPlayed >= currentSpotDrills;
  const currentSpotPct =
    currentSpotPlayed > 0
      ? Math.round((currentSpotCorrect / currentSpotPlayed) * 100)
      : 0;
  const currentLabel = sessions[contextIdx]?.label ?? "";

  return (
    <div className="relative min-h-screen bg-neutral-950 text-neutral-100">
      {/* Top-left: history */}
      <div className="absolute left-4 top-4 w-44 space-y-4">
        <ActionHistoryPanel history={drill.actionHistory} />
      </div>

      {/* Top-right: progress */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-1 text-sm">
        <div className="flex items-center gap-3 text-neutral-400">
          <button
            onClick={toggleMute}
            className="rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
            aria-label={muted ? "Ativar som" : "Silenciar"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <span>
            Spot {spotSummaries.length + 1}/{totalSpots}
          </span>
        </div>
        <div className="text-xs text-neutral-500">
          Mão{" "}
          {Math.min(currentSpotPlayed + (hasPicked ? 0 : 1), currentSpotDrills)}/
          {currentSpotDrills}{" "}
          <span className="text-neutral-600">·</span>{" "}
          <span className="max-w-[140px] truncate inline-block align-bottom">
            {currentLabel}
          </span>
        </div>
        {currentSpotPlayed > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className={currentSpotPct >= 70 ? "text-emerald-400" : "text-amber-400"}>
              {currentSpotPct}% acerto neste spot
            </span>
            {/* Failed spot dots */}
            {failedSpotCount > 0 && (
              <span className="flex gap-1">
                {Array.from({ length: failedSpotCount }).map((_, i) => (
                  <span key={i} className="inline-block h-2 w-2 rounded-full bg-red-500" />
                ))}
              </span>
            )}
          </div>
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
              {isLastDrillInSpot ? "Finalizar spot" : "Próxima mão"}
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
