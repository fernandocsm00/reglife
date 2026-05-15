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
    <div className="rg-root min-h-screen print:bg-white print:text-black">
      <div
        className="mx-auto"
        style={{ maxWidth: 720, padding: "40px 24px 56px" }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 print:hidden">
          <Link
            href="/"
            className="rg-meta"
            style={{ color: "var(--rg-fg-subtle)", textDecoration: "none" }}
          >
            ← Início
          </Link>
          <span className="rg-eyebrow rg-eyebrow--pill">
            <span className="rg-mono">Dia {day} de 30</span>
          </span>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
          style={{ marginTop: 28, marginBottom: 32 }}
        >
          <Logo size="md" />
          <p className="rg-eyebrow" style={{ marginTop: 24 }}>
            Desafio Profissão Poker
          </p>
          <h1
            className="rg-display"
            style={{ marginTop: 10, color: "var(--rg-fg)" }}
          >
            Plano de 30 dias — {plan.playerName}.
          </h1>
          <p className="rg-meta" style={{ marginTop: 10 }}>
            Criado em <span className="rg-mono">{createdAtLabel}</span>
            {plan.playerTierLabel ? <> · {plan.playerTierLabel}</> : null}
          </p>
        </motion.div>

        {/* PDF hero — entrega principal */}
        {plan.diagnosticId && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.05,
              duration: 0.22,
              ease: [0.2, 0.7, 0.3, 1],
            }}
            className="rg-card rg-card--accent relative overflow-hidden print:hidden"
            style={{ borderRadius: "var(--rg-r-xl)", padding: 28 }}
          >
            <div
              className="pointer-events-none absolute -right-20 -top-20 rounded-full"
              style={{
                width: 256,
                height: 256,
                background: "var(--rg-accent-bg-12)",
                filter: "blur(100px)",
              }}
            />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="rg-eyebrow">Seu relatório está pronto</span>
                <h2 className="rg-h2" style={{ marginTop: 10 }}>
                  Baixe o PDF com seu plano completo.
                </h2>
                <p
                  className="rg-body-sm"
                  style={{ marginTop: 10, maxWidth: 460 }}
                >
                  Tudo que você precisa pros próximos 30 dias num único arquivo
                  — revise no celular, imprima, compartilhe com seu coach.
                </p>
              </div>
              <a
                href={`/r/${plan.diagnosticId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rg-btn rg-btn--primary rg-btn--lg shrink-0"
                style={{ borderRadius: "var(--rg-r-pill)" }}
              >
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
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Baixar meu plano
              </a>
            </div>
          </motion.div>
        )}

        {/* Plano de Ação — 6 itens */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.07,
            duration: 0.22,
            ease: [0.2, 0.7, 0.3, 1],
          }}
          style={{ marginTop: 32 }}
        >
          <p className="rg-eyebrow">Suas 6 frentes</p>
          <h3 className="rg-h3" style={{ marginTop: 8 }}>
            Plano de ação
          </h3>
          <p className="rg-body-sm" style={{ marginTop: 4 }}>
            O que estudar e treinar nos próximos 30 dias.
          </p>
        </motion.div>

        <motion.ul
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.09,
            duration: 0.22,
            ease: [0.2, 0.7, 0.3, 1],
          }}
          style={{
            margin: "12px 0 0",
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {items.map((item, i) => (
            <li key={i}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rg-row"
                style={{ padding: "18px 22px" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 16,
                    minWidth: 0,
                  }}
                >
                  <span
                    className="rg-mono"
                    style={{
                      fontSize: 13,
                      color: "var(--rg-fg-faint)",
                      fontWeight: 500,
                      width: 24,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                      {item.label}
                    </div>
                    {item.sublabel && (
                      <div className="rg-caption" style={{ marginTop: 4 }}>
                        {item.sublabel}
                      </div>
                    )}
                  </div>
                </div>
                <span className="rg-row__arrow">→</span>
              </a>
            </li>
          ))}
        </motion.ul>

        {/* Footer */}
        <div
          className="print:hidden"
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: "1px solid var(--rg-border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            onClick={() => window.print()}
            className="rg-btn rg-btn--ghost rg-btn--sm"
          >
            Imprimir / PDF
          </button>
          <button
            onClick={() => setShowRetake(true)}
            className="rg-btn rg-btn--ghost rg-btn--sm"
          >
            Refazer nivelamento
          </button>
        </div>
      </div>

      <RetakeModal open={showRetake} onClose={() => setShowRetake(false)} />
    </div>
  );
}
