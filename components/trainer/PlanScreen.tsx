"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  daysSinceCreation,
  type SavedPlan,
} from "@/lib/poker/planStorage";
import { buildChallenge30d } from "@/lib/poker/challenge30d";
import { Logo } from "@/components/Logo";
import { RetakeModal } from "./RetakeModal";

interface Props {
  plan: SavedPlan;
  onPlanChange: (plan: SavedPlan) => void;
}

export function PlanScreen({ plan }: Props) {
  const [showRetake, setShowRetake] = useState(false);
  const day = Math.min(daysSinceCreation(plan), 30);
  const items = useMemo(() => buildChallenge30d(plan), [plan]);
  const createdAtLabel = new Date(plan.createdAt).toLocaleDateString("pt-BR");

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 print:bg-white print:text-black">
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Top bar */}
        <div className="mb-2 flex items-center justify-between gap-4 print:mb-4">
          <Link
            href="/"
            className="text-xs text-neutral-500 transition hover:text-neutral-200 print:hidden"
          >
            ← Início
          </Link>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            Dia {day} de 30
          </span>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Logo size="lg" />
          <div className="mt-8 text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300">
            Desafio Profissão Poker
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Plano de 30 Dias — {plan.playerName}
          </h1>
          <p className="mt-3 text-sm text-neutral-500">
            Criado em {createdAtLabel}
          </p>
        </motion.div>

        {/* Card de destaque do PDF — entrega principal do desafio */}
        {plan.diagnosticId && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="relative mb-10 overflow-hidden rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-400/20 via-amber-400/5 to-transparent p-6 shadow-2xl shadow-amber-500/10 print:hidden sm:p-8"
          >
            {/* Glow decorativo no fundo */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-400/15 blur-[100px]" />
            <div className="pointer-events-none absolute -bottom-24 -left-12 h-48 w-48 rounded-full bg-amber-300/10 blur-[90px]" />

            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300">
                  Seu relatório está pronto
                </div>
                <h2 className="mt-2 text-xl font-bold text-neutral-50 sm:text-2xl">
                  Baixe o PDF com seu plano completo
                </h2>
                <p className="mt-2 max-w-md text-sm text-neutral-300">
                  Tudo que você precisa pros próximos 30 dias num único arquivo —
                  revise no celular, imprima, compartilhe com seu coach.
                </p>
              </div>

              <a
                href={`/r/${plan.diagnosticId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative inline-flex shrink-0 items-center gap-3 self-start rounded-full bg-white px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-neutral-900 shadow-xl shadow-amber-500/30 transition hover:bg-neutral-100 hover:shadow-amber-500/50 sm:self-auto"
              >
                {/* Anel pulsante âmbar pra chamar atenção */}
                <span className="pointer-events-none absolute -inset-1 rounded-full bg-amber-400/40 opacity-0 blur-md transition group-hover:opacity-100" />
                <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-neutral-900">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 transition group-hover:translate-y-0.5"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>
                <span className="relative">Baixar relatório (PDF)</span>
              </a>
            </div>
          </motion.div>
        )}

        {/* 6 itens do Desafio */}
        <motion.ul
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-10 space-y-3"
        >
          {items.map((item, i) => (
            <li key={i}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-900/40 px-5 py-4 transition hover:border-amber-400/40 hover:bg-amber-400/5"
              >
                <div className="min-w-0">
                  <div className="text-base font-semibold text-neutral-100 group-hover:text-amber-200">
                    {item.label}
                  </div>
                  {item.sublabel && (
                    <div className="mt-1 truncate text-xs text-neutral-500">
                      {item.sublabel}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-neutral-500 transition group-hover:translate-x-1 group-hover:text-amber-300">
                  →
                </span>
              </a>
            </li>
          ))}
        </motion.ul>

        {/* Footer actions */}
        <div className="mt-12 flex flex-wrap items-center justify-end gap-2 border-t border-neutral-800 pt-6 print:hidden">
          <button
            onClick={() => window.print()}
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200 transition hover:border-neutral-500"
          >
            Imprimir / PDF
          </button>
          <button
            onClick={() => setShowRetake(true)}
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:border-amber-400/50 hover:text-amber-300"
          >
            Refazer nivelamento
          </button>
        </div>
      </div>

      <RetakeModal open={showRetake} onClose={() => setShowRetake(false)} />
    </div>
  );
}
