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

          {plan.diagnosticId && (
            <a
              href={`/r/${plan.diagnosticId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900/50 px-4 py-2 text-sm text-neutral-200 transition hover:border-amber-400/50 hover:text-amber-300 print:hidden"
            >
              📄 Baixar relatório (PDF)
            </a>
          )}
        </motion.div>

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
