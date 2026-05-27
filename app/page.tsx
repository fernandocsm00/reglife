"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Logo } from "@/components/Logo";
import { getStoredPlan, type SavedPlan } from "@/lib/poker/planStorage";

export default function Home() {
  const [plan, setPlan] = useState<SavedPlan | null | undefined>(undefined);

  useEffect(() => {
    setPlan(getStoredPlan());
  }, []);

  return (
    <div className="bg-starfield glow-amber-bottom relative min-h-screen overflow-hidden text-neutral-100">
      {/* Glows decorativos */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-amber-400/8 blur-[140px]" />
        <div className="absolute right-[10%] top-[30%] h-[300px] w-[300px] rounded-full bg-amber-300/6 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-3xl px-5 py-12">
        {/* Header */}
        <div className="mb-10 flex items-center justify-between">
          <Logo size="md" href={null} />
        </div>

        {plan === undefined ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
          </div>
        ) : plan ? (
          <Returning playerName={plan.playerName} />
        ) : (
          <FirstTime />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aluno com plano — entra na home e escolhe entre falar com o EV ou ver o plano
// ---------------------------------------------------------------------------

function Returning({ playerName }: { playerName?: string }) {
  const firstName = playerName?.trim().split(/\s+/)[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center text-center"
    >
      <h1 className="font-display text-5xl leading-[0.95] text-neutral-50 sm:text-7xl">
        {firstName ? `Bem-vindo, ${firstName}` : "Bem-vindo de volta"}
      </h1>

      <p className="mt-6 max-w-2xl text-base leading-snug text-neutral-200 sm:text-xl">
        Fale com o <span className="text-amber-300">EV</span> ou continue seu
        plano de progressão.
      </p>

      <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row">
        <Link
          href="/manager"
          className="group inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-bold uppercase tracking-wide text-neutral-900 shadow-lg shadow-amber-500/10 transition hover:bg-neutral-100"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-neutral-900">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          Falar com o EV
        </Link>

        <Link
          href="/meu-plano"
          className="inline-flex items-center gap-2 rounded-full border border-neutral-700 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-neutral-200 transition hover:border-amber-400/60 hover:text-amber-300"
        >
          Ver meu plano
        </Link>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Primeira vez — sem plano (única view possível agora; quem já tem plano é
// redirecionado pra /meu-plano no useEffect do Home)
// ---------------------------------------------------------------------------

function FirstTime() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center text-center"
    >
      <h1 className="font-display text-5xl leading-[0.95] text-neutral-50 sm:text-7xl">
        Receba seu plano individual
      </h1>

      <p className="mt-6 max-w-2xl text-base leading-snug text-neutral-200 sm:text-xl">
        Faça o teste e receba seu{" "}
        <span className="text-amber-300">plano de progressão</span> na hora.
      </p>

      <Link
        href="/diagnostico"
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
        Começar agora
      </Link>
    </motion.div>
  );
}
