"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Logo } from "@/components/Logo";
import {
  cooldownRemainingMs,
  daysSinceCreation,
  formatCooldown,
  getStoredPlan,
  type SavedPlan,
} from "@/lib/poker/planStorage";

export default function Home() {
  const [plan, setPlan] = useState<SavedPlan | null | undefined>(undefined);

  useEffect(() => {
    setPlan(getStoredPlan());
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Glows decorativos */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-amber-400/8 blur-[140px]" />
        <div className="absolute right-[10%] top-[30%] h-[300px] w-[300px] rounded-full bg-amber-300/6 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-3xl px-5 py-12">
        {/* Header */}
        <div className="mb-10 flex items-center justify-between">
          <Logo size="md" href={null} />
          {plan && (
            <span className="rounded-full border border-amber-400/20 bg-amber-400/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
              Dia {daysSinceCreation(plan)} · Ciclo ativo
            </span>
          )}
        </div>

        {plan === undefined ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
          </div>
        ) : plan ? (
          <Dashboard plan={plan} />
        ) : (
          <FirstTime />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard — aluno com plano ativo
// ---------------------------------------------------------------------------

function Dashboard({ plan }: { plan: SavedPlan }) {
  const day = daysSinceCreation(plan);
  const cooldownMs = cooldownRemainingMs(plan);
  const locked = cooldownMs > 0;

  const currentPhase =
    day <= 30 ? "Fase 1 – Fundamentos"
    : day <= 60 ? "Fase 2 – Aplicação"
    : "Fase 3 – Integração";

  const totalTasks = plan.phases.reduce((a, p) => a + p.tasks.length, 0);
  const checkedTasks = plan.progress.checkedTaskIds.length;
  const totalLessons = plan.phases.reduce((a, p) => a + p.lessons.length, 0);
  const checkedLessons = plan.progress.checkedLessonUrls.length;
  const progressPct = totalTasks > 0 ? Math.round((checkedTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Saudação */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Olá, {plan.playerName}.
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          {currentPhase} · {plan.playerTierLabel}
        </p>
      </motion.div>

      {/* Barra de progresso geral */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4"
      >
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-400">
          <span>Progresso do ciclo</span>
          <span className="font-semibold text-amber-300">{progressPct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="h-full rounded-full bg-amber-400"
          />
        </div>
        <div className="mt-3 flex gap-6 text-xs text-neutral-500">
          <span><span className="font-semibold text-neutral-300">{checkedTasks}</span>/{totalTasks} tasks</span>
          <span><span className="font-semibold text-neutral-300">{checkedLessons}</span>/{totalLessons} aulas</span>
          <span>Dia <span className="font-semibold text-neutral-300">{day}</span>/90</span>
        </div>
      </motion.div>

      {/* Cards principais */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* EV — Manager.IA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Link
            href="/manager"
            className="group flex h-full flex-col rounded-xl border border-amber-400/20 bg-amber-400/5 p-5 transition hover:border-amber-400/40 hover:bg-amber-400/8"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-neutral-950">
                R
              </div>
              <span className="flex items-center gap-1 text-[10px] text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                online
              </span>
            </div>
            <p className="text-sm font-semibold text-amber-300">EV</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">
              Seu Manager de Evolução. Acompanha seu plano, analisa suas sessões e te cobra quando precisa.
            </p>
            <span className="mt-4 text-xs text-neutral-500 transition group-hover:text-amber-300">
              Abrir chat →
            </span>
          </Link>
        </motion.div>

        {/* Meu Plano */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Link
            href="/meu-plano"
            className="group flex h-full flex-col rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 transition hover:border-neutral-700 hover:bg-neutral-900"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-lg">
              📋
            </div>
            <p className="text-sm font-semibold text-neutral-100">Meu Plano</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">
              Fases, tarefas e aulas do seu ciclo de 90 dias. Marque o que completou e acompanhe sua evolução.
            </p>
            <span className="mt-4 text-xs text-neutral-500 transition group-hover:text-neutral-300">
              Ver plano →
            </span>
          </Link>
        </motion.div>

        {/* Nivelamento */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {locked ? (
            <div className="flex h-full flex-col rounded-xl border border-neutral-800/50 bg-neutral-900/30 p-5 opacity-60">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-lg">
                🔒
              </div>
              <p className="text-sm font-semibold text-neutral-400">Nivelamento</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                Disponível em {formatCooldown(cooldownMs)}.
              </p>
            </div>
          ) : (
            <Link
              href="/diagnostico"
              className="group flex h-full flex-col rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 transition hover:border-neutral-700 hover:bg-neutral-900"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-lg">
                🎯
              </div>
              <p className="text-sm font-semibold text-neutral-100">Nivelamento</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                Refaça o diagnóstico para medir sua evolução e atualizar seu plano de 90 dias.
              </p>
              <span className="mt-4 text-xs text-neutral-500 transition group-hover:text-neutral-300">
                Iniciar →
              </span>
            </Link>
          )}
        </motion.div>
      </div>

      {/* Leaks em destaque */}
      {plan.leaks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Seus principais leaks
          </p>
          <div className="space-y-2">
            {plan.leaks.slice(0, 3).map((leak, i) => {
              const pct = Math.round((leak.errors / leak.total) * 100);
              return (
                <div key={leak.id} className="flex items-center gap-3">
                  <span className="w-4 text-xs text-neutral-600">#{i + 1}</span>
                  <span className="flex-1 text-xs text-neutral-300">
                    {leak.actionLabel} · {leak.position} · {leak.stackBand}
                  </span>
                  <span className="text-xs font-semibold text-red-400">{pct}% erro</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primeira vez — sem plano
// ---------------------------------------------------------------------------

function FirstTime() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center text-center"
    >
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Trainer de Nivelamento
      </h1>

      <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-300">
        Bem-vindo à reglife. Você vai passar por uma sequência de spots reais de poker.
        Responda como faria em uma sessão de verdade — sem filtro.
      </p>

      <p className="mt-4 max-w-xl text-sm leading-relaxed text-neutral-400">
        Ao final, você recebe um{" "}
        <span className="font-medium text-amber-300">
          plano personalizado
        </span>{" "}
        com os leaks identificados e as aulas exatas para corrigi-los.
      </p>

      <Link
        href="/diagnostico"
        className="group mt-10 inline-flex items-center gap-2 rounded-md bg-amber-300 px-8 py-3 text-base font-bold text-neutral-950 shadow-lg shadow-amber-900/30 transition hover:bg-amber-200"
      >
        Começar nivelamento
        <span className="transition group-hover:translate-x-1">→</span>
      </Link>

      <p className="mt-8 max-w-md text-xs text-neutral-600">
        Responda com calma. Não existe pressa — existe precisão.
      </p>
    </motion.div>
  );
}
