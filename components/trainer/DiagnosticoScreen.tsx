"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useDiagnosticoStore } from "@/lib/poker/diagnosticoStore";
import { PokerTable } from "./PokerTable";
import { ActionButtonsBar } from "./ActionButtonsBar";
import { ActionHistoryPanel } from "./ActionHistoryPanel";
import { OnboardingForm, type OnboardingData } from "./OnboardingForm";
import { ResultsScreen } from "./ResultsScreen";
import { Logo } from "@/components/Logo";
import { sounds } from "@/lib/audio/sounds";
import { analyzeResults } from "@/lib/poker/leakAnalysis";
import { buildPlan } from "@/lib/poker/planBuilder";
import { getStoredPlan, savePlan, type SavedPlan } from "@/lib/poker/planStorage";

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
  const volumeTargetWeekly = useDiagnosticoStore((s) => s.volumeTargetWeekly);
  const notifyChannels = useDiagnosticoStore((s) => s.notifyChannels);
  const whatsappPhone = useDiagnosticoStore((s) => s.whatsappPhone);
  const quizAnswers = useDiagnosticoStore((s) => s.quizAnswers);
  const stakeGrade = useDiagnosticoStore((s) => s.stakeGrade);
  const leadId = useDiagnosticoStore((s) => s.leadId);
  const previousLeadId = useDiagnosticoStore((s) => s.previousLeadId);

  const loadConfigs = useDiagnosticoStore((s) => s.loadConfigs);
  const pickAnswer = useDiagnosticoStore((s) => s.pickAnswer);
  const nextDrill = useDiagnosticoStore((s) => s.nextDrill);
  const dismissSpotTransition = useDiagnosticoStore((s) => s.dismissSpotTransition);
  const setOnboarding = useDiagnosticoStore((s) => s.setOnboarding);
  const setLeadId = useDiagnosticoStore((s) => s.setLeadId);

  const [muted, setMuted] = useState(false);
  /**
   * Gate da tela de transição entre o quiz (pesquisa) e o teste técnico
   * (mãos). Aluno termina a pesquisa → cai aqui → vê briefing dos 10 min
   * → clica "Quero começar!" → entra no drill. Reseta a cada refresh.
   */
  const [testStarted, setTestStarted] = useState(false);
  /**
   * Plano construído ao final do teste. Renderiza a ResultsScreen
   * passando esse plan. Antes de existir, a useEffect ainda não rodou.
   */
  const [builtPlan, setBuiltPlan] = useState<SavedPlan | null>(null);
  /**
   * Aluno clicou "Quero meu plano" na ResultsScreen → ativa a tela de
   * loading "Montando seu plano…" e dispara o redirect pra /meu-plano.
   */
  const [goingToPlan, setGoingToPlan] = useState(false);
  const builtRef = useRef(false);

  useEffect(() => {
    loadConfigs(initialConfigs);
  }, [initialConfigs, loadConfigs]);

  // Em retake (resetForRetake) a navegação é soft e este componente não
  // remonta — `builtRef` ficaria true do teste anterior e o useEffect de
  // completion seria pulado. Resetamos quando `completed` volta pra false.
  useEffect(() => {
    if (!completed) {
      builtRef.current = false;
      setBuiltPlan(null);
      setGoingToPlan(false);
    }
  }, [completed]);

  // Deal sound on each new drill
  useEffect(() => {
    if (drill && !hasPicked && !showSpotTransition) sounds.deal();
  }, [drill?.cardsOnHand, drill?.heroPosition, drill?.board, hasPicked, drill, showSpotTransition]);

  // On completion: build plan, persist, post to API, redirect
  useEffect(() => {
    if (!completed) return;
    if (builtRef.current) return;
    if (results.length === 0) return;

    builtRef.current = true;

    // Caso "elite": passou em TODOS os spots (>=70% em cada um, sem early
    // stop). Bypassa a entrega de plano — não interessa pro aluno que já
    // tá batendo mid stakes. Roteia direto pra /reg-life-team com o CTA
    // de aplicação pro time. Resultado ainda é gravado no admin pra
    // acompanhar quem vai pra aplicação.
    const allPassed =
      spotSummaries.length > 0 &&
      !stoppedEarly &&
      spotSummaries.every((s) => s.passed);

    if (allPassed) {
      fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosticId: leadId,
          previousDiagnosticId: previousLeadId,
          playerName: playerName || "Jogador",
          email,
          phone,
          studyTime,
          profitGoal,
          stoppedEarly: false,
          spotsPlayed: spotSummaries.length,
          spotsFailed: 0,
          spotSummaries,
          results,
          volumeTargetWeekly,
          // Preferências do lead preservadas pra contato futuro. Notificação
          // de plano não dispara porque o bloco `if (savedPlan)` em
          // /api/results não roda quando savedPlan=null.
          notifyChannels,
          whatsappPhone: notifyChannels.includes("whatsapp") ? whatsappPhone : null,
          quizAnswers,
          stakeGrade,
          // Sem savedPlan: aluno não vai pro /meu-plano, vai pro /reg-life-team
          savedPlan: null,
        }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const detail = await r.text().catch(() => "");
            console.error(
              `[diagnostico] elite POST /api/results falhou status=${r.status} body=${detail.slice(0, 200)}`
            );
          }
        })
        .catch((err) => {
          console.error("[diagnostico] elite POST /api/results threw", err);
        });

      router.push("/reg-life-team");
      return;
    }

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
      volumeTargetWeekly,
      stakeGrade,
    });
    savePlan(plan);

    // Persist to server — captura o id retornado pra ligar o plano à linha
    // do reglife_diagnostic_results (EV usa isso pra ler sharkscope).
    // Se já temos leadId (POST /api/leads rodou ok no fim do quiz),
    // mandamos pra fazer UPDATE — não duplica linha. Se não temos,
    // /api/results faz INSERT como fallback.
    const planForServer: SavedPlan = leadId
      ? { ...plan, diagnosticId: leadId }
      : plan;
    if (leadId) savePlan(planForServer);

    fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        diagnosticId: leadId, // UPDATE quando presente, INSERT quando null
        previousDiagnosticId: previousLeadId, // só no INSERT — liga retake à tentativa anterior
        playerName: playerName || "Jogador",
        email,
        phone,
        studyTime,
        profitGoal,
        stoppedEarly,
        spotsPlayed: spotSummaries.length,
        spotsFailed: failedSpotCount,
        spotSummaries,
        results,
        volumeTargetWeekly,
        notifyChannels,
        whatsappPhone: notifyChannels.includes("whatsapp") ? whatsappPhone : null,
        // Quiz (admin-side) — só relevante no INSERT, mas mandamos
        // sempre pro caso do leadId não ter sido gravado por algum motivo
        quizAnswers,
        stakeGrade,
        savedPlan: planForServer,
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          // Antes era silent return — agora loga pra debug. Sem isso o
          // plano renderiza sem diagnosticId e o card do PDF some sem
          // ninguém saber por quê.
          const detail = await r.text().catch(() => "");
          console.error(
            `[diagnostico] POST /api/results falhou status=${r.status} body=${detail.slice(0, 200)}`
          );
          return;
        }
        const data = await r.json().catch(() => null);
        if (data?.id) {
          const withId = { ...planForServer, diagnosticId: data.id };
          savePlan(withId);
          setBuiltPlan(withId);
        } else {
          console.error("[diagnostico] /api/results respondeu OK mas sem id", data);
        }
      })
      .catch((err) => {
        console.error("[diagnostico] POST /api/results threw", err);
      });

    // O plano fica disponível pra ResultsScreen renderizar.
    // Sem auto-redirect: o aluno clica "Quero meu plano" pra avançar.
    setBuiltPlan(planForServer);
  }, [completed, results, playerName, email, phone, studyTime, profitGoal,
      stoppedEarly, spotSummaries, failedSpotCount,
      volumeTargetWeekly, notifyChannels, whatsappPhone,
      quizAnswers, stakeGrade, leadId, previousLeadId]);

  // Quando aluno clica "Quero meu plano" → 5s de loading → redirect
  useEffect(() => {
    if (!goingToPlan) return;
    const t = setTimeout(() => router.push("/meu-plano"), 5000);
    return () => clearTimeout(t);
  }, [goingToPlan, router]);

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
    return (
      <OnboardingForm
        onSubmit={(data: OnboardingData) => {
          // Atualiza o store imediatamente pra a tela do trainer já renderizar
          setOnboarding(data);
          // Fire-and-forget: captura o lead no banco (não bloqueia o teste).
          // Quando termina o teste, /api/results faz UPDATE neste id.
          fetch("/api/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              playerName: data.playerName,
              email: data.email,
              phone: data.phone,
              studyTime: data.studyTime,
              profitGoal: data.profitGoal,
              volumeTargetWeekly: data.volumeTargetWeekly,
              notifyChannels: data.notifyChannels,
              whatsappPhone: data.whatsappPhone,
              quizAnswers: data.quizAnswers,
              stakeGrade: data.stakeGrade,
            }),
          })
            .then(async (r) => {
              if (!r.ok) {
                const detail = await r.text().catch(() => "");
                console.error(
                  `[onboarding] POST /api/leads falhou status=${r.status} body=${detail.slice(0, 200)}`
                );
                return;
              }
              const json = await r.json().catch(() => null);
              if (json?.id) setLeadId(json.id);
              else console.error("[onboarding] /api/leads OK mas sem id", json);
            })
            .catch((err) => {
              console.error("[onboarding] POST /api/leads threw", err);
            });
        }}
      />
    );
  }

  // Tela de transição: quiz já feito, mas antes de mostrar a primeira mão
  // o aluno precisa saber que agora começa o teste técnico (e separar tempo).
  if (!testStarted && !completed) {
    return <TestIntro onStart={() => setTestStarted(true)} />;
  }

  // Aluno terminou o teste e ainda não pediu pra ver o plano →
  // mostra a tela de resultados com os dados do diagnóstico.
  if (completed && builtPlan && !goingToPlan) {
    return (
      <ResultsScreen plan={builtPlan} onContinue={() => setGoingToPlan(true)} />
    );
  }

  // "Montando seu plano…" — só quando aluno clicou "Quero meu plano"
  // OU enquanto o useEffect ainda não setou builtPlan (caso raro de race).
  if (completed) {
    return (
      <div className="bg-starfield glow-amber-bottom relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center text-neutral-100">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/10 blur-[140px]" />
        </div>

        <Logo size="md" className="mb-10" />

        {/* Anel pulsante âmbar */}
        <div className="relative mb-8 h-16 w-16">
          <span className="absolute inset-0 rounded-full border-2 border-amber-400 opacity-70" />
          <span className="absolute inset-0 animate-ping rounded-full border-2 border-amber-400" />
          <span className="absolute inset-3 rounded-full bg-amber-400/30" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-3xl text-neutral-50 sm:text-4xl"
        >
          Montando seu plano…
        </motion.div>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-400">
          {stoppedEarly
            ? "Identificamos suas principais dificuldades. Preparando seu plano personalizado."
            : "Analisando seu desempenho. Preparando seu plano personalizado."}
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
            <p className="mt-1 text-lg font-bold">
              {lastSpotSummary.label.replace(/ — reg\.life$/, "")}
            </p>
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
                {(sessions[contextIdx]?.label ?? "").replace(/ — reg\.life$/, "")}
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

      {/* Brand + atalho pra home (bottom-left) */}
      <div className="absolute bottom-4 left-4 flex items-center gap-3">
        <Logo size="md" />
        <Link
          href="/"
          className="rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-[11px] text-neutral-400 backdrop-blur transition hover:border-amber-400/40 hover:text-amber-300"
        >
          ← Início
        </Link>
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

// ---------------------------------------------------------------------------
// Transição: aluno terminou a pesquisa, agora começa o teste técnico (mãos)
// ---------------------------------------------------------------------------

function TestIntro({ onStart }: { onStart: () => void }) {
  return (
    <div className="bg-starfield glow-amber-bottom relative min-h-screen overflow-hidden text-neutral-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/8 blur-[140px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <Logo size="md" className="mb-10" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="font-display text-5xl leading-[0.95] text-neutral-50 sm:text-7xl">
            Teste Técnico
          </h1>

          <p className="mt-6 max-w-xl text-base leading-snug text-neutral-200 sm:text-xl">
            Agora começa o teste com{" "}
            <span className="text-amber-300">simulações de mãos</span>. Separe{" "}
            <span className="text-amber-300">10 minutos</span> para fazer com
            foco total e responda como se estivesse em uma sessão real de
            poker online.
          </p>

          <p className="mt-4 max-w-xl text-sm leading-snug text-neutral-400 sm:text-base">
            Todas as mãos são baseadas em{" "}
            <span className="text-amber-300">cEV</span> (chip equity value),
            sem ajuste de ICM.
          </p>

          <button
            type="button"
            onClick={onStart}
            className="group mt-12 inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-bold uppercase tracking-wide text-neutral-900 shadow-lg shadow-amber-500/10 transition hover:bg-neutral-100"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-neutral-900">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 transition group-hover:translate-x-0.5"
              >
                <path d="M5 12h14" />
                <path d="M13 5l7 7-7 7" />
              </svg>
            </span>
            Quero começar!
          </button>
        </motion.div>
      </div>
    </div>
  );
}
