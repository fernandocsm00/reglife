"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

  const cooldownMs = plan ? cooldownRemainingMs(plan) : 0;
  const locked = cooldownMs > 0;

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {/* glow decorativo (amarelo reglife) */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/10 blur-[150px]" />
        <div className="absolute right-[15%] top-[18%] h-[260px] w-[260px] rounded-full bg-amber-300/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <Logo size="xl" className="mb-8" />

        {plan === undefined ? (
          <div className="text-sm text-neutral-500">Carregando…</div>
        ) : plan ? (
          <ReturningView
            plan={plan}
            locked={locked}
            cooldownMs={cooldownMs}
          />
        ) : (
          <FirstTimeView />
        )}
      </div>
    </div>
  );
}

function FirstTimeView() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Trainer de Nivelamento
      </h1>

      <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
        Bem-vindo à reglife. Esse é o ponto de partida do seu onboarding: você
        vai passar por uma sequência de spots reais de poker. Em cada mão,
        escolha a ação que considera{" "}
        <span className="font-medium text-neutral-100">mais correta</span> —
        responda da melhor forma possível, como se fosse uma sessão de verdade.
      </p>

      <p className="mt-4 max-w-xl text-sm leading-relaxed text-neutral-400">
        Ao final, você receberá um{" "}
        <span className="font-medium text-amber-300">
          plano de ação personalizado dos próximos 90 dias
        </span>{" "}
        com base nos seus pontos fracos, mostrando exatamente quais aulas da
        comunidade estudar e em que ordem.
      </p>

      <Link
        href="/diagnostico"
        className="group mt-10 inline-flex items-center gap-2 rounded-md bg-amber-300 px-8 py-3 text-base font-bold text-neutral-950 shadow-lg shadow-amber-900/30 transition hover:bg-amber-200 hover:shadow-amber-800/40"
      >
        Começar nivelamento
        <span className="transition group-hover:translate-x-1">→</span>
      </Link>

      <div className="mt-10 max-w-md text-xs text-neutral-600">
        Responda com calma. Não existe pressa — existe precisão. Seu plano
        depende da honestidade do que você jogar aqui.
      </div>
    </>
  );
}

function ReturningView({
  plan,
  locked,
  cooldownMs,
}: {
  plan: SavedPlan;
  locked: boolean;
  cooldownMs: number;
}) {
  const day = daysSinceCreation(plan);

  return (
    <>
      <span className="mb-4 inline-flex rounded-full border border-amber-400/30 bg-amber-400/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
        Aluno reglife · Dia {day} do seu ciclo
      </span>

      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Olá de novo, {plan.playerName}.
      </h1>

      <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-300">
        Seu plano de 90 dias está em execução. Foque na próxima ação e cumpra
        as tarefas da semana — é assim que a evolução acontece.
      </p>

      <Link
        href="/meu-plano"
        className="group mt-10 inline-flex items-center gap-2 rounded-md bg-amber-300 px-8 py-3 text-base font-bold text-neutral-950 shadow-lg shadow-amber-900/30 transition hover:bg-amber-200"
      >
        Ver meu plano
        <span className="transition group-hover:translate-x-1">→</span>
      </Link>

      {locked ? (
        <div className="mt-6 max-w-md text-xs text-neutral-500">
          Próximo nivelamento liberado em{" "}
          <span className="font-semibold text-amber-300">
            {formatCooldown(cooldownMs)}
          </span>
          . Use esse tempo pra estudar.
        </div>
      ) : (
        <div className="mt-6 text-[11px] text-neutral-600">
          Você pode refazer o nivelamento dentro do plano — mas só faça se
          realmente estudou as aulas recomendadas.
        </div>
      )}
    </>
  );
}
