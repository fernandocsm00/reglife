"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  cooldownRemainingMs,
  daysSinceCreation,
  formatCooldown,
  RETAKE_COOLDOWN_DAYS,
  savePlan,
  type SavedPlan,
} from "@/lib/poker/planStorage";
import {
  PROFIT_GOAL_LABELS,
  PROFIT_GOAL_ADVICE,
  STUDY_TIME_LABELS,
} from "@/lib/poker/planBuilder";
import { Logo } from "@/components/Logo";
import { RetakeModal } from "./RetakeModal";

interface Props {
  plan: SavedPlan;
  onPlanChange: (plan: SavedPlan) => void;
}

export function PlanScreen({ plan, onPlanChange }: Props) {
  const [showRetake, setShowRetake] = useState(false);
  const day = daysSinceCreation(plan);
  const cooldownMs = cooldownRemainingMs(plan);
  const locked = cooldownMs > 0;

  const checkedLessons = useMemo(
    () => new Set(plan.progress.checkedLessonUrls),
    [plan.progress.checkedLessonUrls]
  );
  const checkedTasks = useMemo(
    () => new Set(plan.progress.checkedTaskIds),
    [plan.progress.checkedTaskIds]
  );

  const toggleLesson = (url: string) => {
    const set = new Set(plan.progress.checkedLessonUrls);
    if (set.has(url)) set.delete(url);
    else set.add(url);
    const next: SavedPlan = {
      ...plan,
      progress: { ...plan.progress, checkedLessonUrls: Array.from(set) },
    };
    savePlan(next);
    onPlanChange(next);
  };

  const toggleTask = (id: string) => {
    const set = new Set(plan.progress.checkedTaskIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next: SavedPlan = {
      ...plan,
      progress: { ...plan.progress, checkedTaskIds: Array.from(set) },
    };
    savePlan(next);
    onPlanChange(next);
  };

  // Próximo passo: primeira tarefa ou aula não marcada percorrendo as fases
  const nextStep = useMemo(() => {
    for (const phase of plan.phases) {
      for (const task of phase.tasks) {
        if (!checkedTasks.has(task.id)) {
          return { kind: "task" as const, phase, task };
        }
      }
      for (const lesson of phase.lessons) {
        if (!checkedLessons.has(lesson.url)) {
          return { kind: "lesson" as const, phase, lesson };
        }
      }
    }
    return null;
  }, [plan.phases, checkedTasks, checkedLessons]);

  const createdAtLabel = new Date(plan.createdAt).toLocaleDateString("pt-BR");

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 print:bg-white print:text-black">
      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Top bar */}
        <div className="mb-2 flex items-center justify-between gap-4 print:mb-4">
          <Link
            href="/"
            className="text-xs text-neutral-500 transition hover:text-neutral-200 print:hidden"
          >
            ← Início
          </Link>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            Plano ativo · Dia {day} de 90
          </span>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Logo size="lg" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
            Olá, {plan.playerName}.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-neutral-300">
            Esse plano não é uma nota. É o caminho que a reglife traçou pra você
            nos próximos 90 dias. Cumpra fase por fase e a evolução acontece.
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Criado em {createdAtLabel} · {STUDY_TIME_LABELS[plan.studyTime]} ·{" "}
            Meta: {PROFIT_GOAL_LABELS[plan.profitGoal]}
          </p>
        </motion.div>

        {/* Próximo passo destacado */}
        {nextStep ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-10 rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-400/15 to-amber-500/5 p-6"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
              Sua próxima ação
            </div>
            <div className="mt-2 text-lg font-semibold text-neutral-100">
              {nextStep.kind === "lesson"
                ? nextStep.lesson.title
                : nextStep.task.text}
            </div>
            <div className="mt-1 text-xs text-neutral-400">
              {nextStep.phase.title} · {nextStep.phase.rangeLabel}
              {nextStep.kind === "lesson" && ` · ${nextStep.lesson.module}`}
            </div>
            {nextStep.kind === "lesson" && (
              <a
                href={nextStep.lesson.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-amber-300 px-4 py-2 text-sm font-bold text-neutral-950 transition hover:bg-amber-200"
              >
                Abrir aula →
              </a>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-10 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-6 text-center"
          >
            <div className="text-2xl">🏁</div>
            <div className="mt-2 text-lg font-semibold text-amber-300">
              Plano 100% concluído
            </div>
            <div className="mt-1 text-sm text-neutral-300">
              Refaça o nivelamento para medir sua evolução.
            </div>
          </motion.div>
        )}

        {/* Tier badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.06 }}
          className="mb-8 flex items-center gap-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-5"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-300 text-2xl font-black text-amber-300">
            {plan.playerTier}
          </div>
          <div>
            <div className="text-sm font-bold text-amber-300">
              {plan.playerTierLabel}
            </div>
            <div className="text-xs text-neutral-400">
              Classificação baseada no seu nivelamento. Foque nas aulas e
              tarefas do seu tier para subir.
            </div>
          </div>
        </motion.div>

        {/* Profit goal + advice */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.065 }}
          className="mb-8 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-5"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <div className="text-sm font-bold text-emerald-300">
                Sua meta: {PROFIT_GOAL_LABELS[plan.profitGoal]}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-neutral-400">
                {PROFIT_GOAL_ADVICE[plan.profitGoal]}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Early stop banner */}
        {plan.stoppedEarly && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.07 }}
            className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"
          >
            <strong>Diagnóstico encerrado antecipadamente.</strong>{" "}
            Identificamos {plan.spotsFailed} spots abaixo de 70% em{" "}
            {plan.spotsPlayed} spots jogados. Seu plano foca nesses pontos
            fracos para acelerar sua evolução.
          </motion.div>
        )}

        {/* Stats */}
        <div className="mb-10 grid grid-cols-3 gap-4 sm:grid-cols-4">
          <StatCard
            label="Acerto geral"
            value={`${plan.accuracyPct}%`}
            accent="amber"
          />
          <StatCard
            label="Acertos"
            value={`${plan.totalCorrect}/${plan.totalDrills}`}
          />
          <StatCard
            label="Leaks identificados"
            value={`${plan.leaks.length}`}
            accent="red"
          />
          {plan.spotsPlayed > 0 && (
            <StatCard
              label="Spots avaliados"
              value={`${plan.spotsPlayed - plan.spotsFailed}/${plan.spotsPlayed}`}
              accent={plan.stoppedEarly ? "red" : undefined}
            />
          )}
        </div>

        {/* Phases */}
        <div className="mb-12 space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Plano dos 90 dias
          </h2>
          {plan.phases.map((phase, i) => (
            <PhaseCard
              key={phase.id}
              index={i}
              phase={phase}
              checkedLessons={checkedLessons}
              checkedTasks={checkedTasks}
              onToggleLesson={toggleLesson}
              onToggleTask={toggleTask}
            />
          ))}
        </div>

        {/* Leaks detalhados */}
        {plan.leaks.length > 0 && (
          <div className="mb-12">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Seus pontos fracos
            </h2>
            <div className="space-y-3">
              {plan.leaks.map((leak) => (
                <div
                  key={leak.id}
                  className="rounded-lg border border-red-500/20 bg-red-500/5 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-neutral-100">
                      {leak.actionLabel} · {leak.position} · {leak.stackBand}
                    </div>
                    <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
                      {leak.errors}/{leak.total} erros
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-300">
                    {leak.recommendation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comunidade CTA */}
        <div className="mb-12 rounded-xl border border-amber-400/20 bg-amber-400/5 p-6">
          <div className="text-sm font-semibold text-amber-300">
            Próximo movimento na comunidade
          </div>
          <p className="mt-2 text-sm leading-relaxed text-neutral-300">
            Entre no canal{" "}
            <span className="font-semibold text-neutral-100">
              #plano-de-90-dias
            </span>{" "}
            e poste qual é o seu leak nº1. A galera te cobra. Compromisso
            público é metade da execução.
          </p>
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-800 pt-6 print:hidden">
          <div className="max-w-md text-xs text-neutral-500">
            {locked ? (
              <>
                Próximo nivelamento liberado em{" "}
                <span className="font-semibold text-amber-300">
                  {formatCooldown(cooldownMs)}
                </span>
                . Use esse tempo pra estudar as aulas do seu plano.
              </>
            ) : plan.attempts === 1 ? (
              <>
                Você ainda tem 1 retake imediato. Depois disso, cooldown de{" "}
                {RETAKE_COOLDOWN_DAYS} dias.
              </>
            ) : (
              <>
                Refazer agora vai disparar um cooldown de {RETAKE_COOLDOWN_DAYS}{" "}
                dias.
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200 transition hover:border-neutral-500"
            >
              Imprimir / PDF
            </button>
            <button
              onClick={() => setShowRetake(true)}
              disabled={locked}
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:border-amber-400/50 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Refazer nivelamento
            </button>
          </div>
        </div>
      </div>

      <RetakeModal
        open={showRetake}
        onClose={() => setShowRetake(false)}
        plan={plan}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber" | "red";
}) {
  const color =
    accent === "amber"
      ? "text-amber-300"
      : accent === "red"
        ? "text-red-400"
        : "text-neutral-100";
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 text-center">
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function PhaseCard({
  phase,
  index,
  checkedLessons,
  checkedTasks,
  onToggleLesson,
  onToggleTask,
}: {
  phase: SavedPlan["phases"][number];
  index: number;
  checkedLessons: Set<string>;
  checkedTasks: Set<string>;
  onToggleLesson: (url: string) => void;
  onToggleTask: (id: string) => void;
}) {
  const totalItems = phase.tasks.length + phase.lessons.length;
  const doneItems =
    phase.tasks.filter((t) => checkedTasks.has(t.id)).length +
    phase.lessons.filter((l) => checkedLessons.has(l.url)).length;
  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            Fase {index + 1} · {phase.rangeLabel}
          </div>
          <div className="mt-1 text-xl font-bold text-neutral-100">
            {phase.title}
          </div>
        </div>
        <div className="text-right text-xs text-neutral-500">
          <div>{pct}% concluído</div>
          <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-amber-300 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        {phase.focus}
      </p>

      {phase.tasks.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Tarefas semanais
          </div>
          <ul className="space-y-1">
            {phase.tasks.map((task) => {
              const done = checkedTasks.has(task.id);
              return (
                <li key={task.id}>
                  <button
                    onClick={() => onToggleTask(task.id)}
                    className="flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-neutral-800/40"
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                        done
                          ? "border-amber-300 bg-amber-300 text-neutral-950"
                          : "border-neutral-600"
                      }`}
                    >
                      {done && "✓"}
                    </span>
                    <span
                      className={
                        done
                          ? "text-neutral-500 line-through"
                          : "text-neutral-200"
                      }
                    >
                      {task.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {phase.lessons.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Aulas recomendadas
          </div>
          <ul className="space-y-2">
            {phase.lessons.map((lesson) => {
              const done = checkedLessons.has(lesson.url);
              return (
                <li key={lesson.url} className="flex items-start gap-3">
                  <button
                    onClick={() => onToggleLesson(lesson.url)}
                    aria-label={
                      done ? "Desmarcar aula" : "Marcar como assistida"
                    }
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                      done
                        ? "border-amber-300 bg-amber-300 text-neutral-950"
                        : "border-neutral-600"
                    }`}
                  >
                    {done && "✓"}
                  </button>
                  <a
                    href={lesson.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-sm leading-snug ${
                      done
                        ? "text-neutral-500 line-through"
                        : "text-neutral-200 hover:text-amber-300"
                    }`}
                  >
                    <span className="mr-2 inline-flex items-center rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-400">
                      {lesson.type}
                    </span>
                    {lesson.title}
                    <span className="ml-1 text-xs text-neutral-500">
                      · {lesson.module}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
