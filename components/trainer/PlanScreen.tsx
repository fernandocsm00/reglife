"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  daysSinceCreation,
  type SavedPlan,
} from "@/lib/poker/planStorage";
import { buildChallenge30d } from "@/lib/poker/challenge30d";
import {
  performanceByCategory,
  topStrengths,
  topWeaknesses,
} from "@/lib/poker/planCategories";
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
  const categories = useMemo(() => performanceByCategory(plan), [plan]);
  const strengths = useMemo(() => topStrengths(plan, 3), [plan]);
  const weaknesses = useMemo(() => topWeaknesses(plan, 3), [plan]);
  const createdAtLabel = new Date(plan.createdAt).toLocaleDateString("pt-BR");
  const [tab, setTab] = useState<"resumo" | "plano">("resumo");

  // PDF hero card — usado em ambas as tabs (entrega principal)
  const pdfCard = plan.diagnosticId ? (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
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
          <p className="rg-body-sm" style={{ marginTop: 10, maxWidth: 460 }}>
            Tudo que você precisa pros próximos 30 dias num único arquivo —
            revise no celular, imprima, compartilhe com seu coach.
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
  ) : null;

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
            <span className="rg-mono">
              Dia {day} de 30
            </span>
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

        {/* Tabs */}
        <div
          className="flex items-center gap-1 print:hidden"
          style={{
            padding: 4,
            border: "1px solid var(--rg-border)",
            borderRadius: "var(--rg-r-lg)",
            background: "var(--rg-overlay)",
            marginBottom: 24,
          }}
        >
          {[
            { key: "resumo" as const, label: "Resumo" },
            { key: "plano" as const, label: "Seu plano personalizado" },
          ].map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="flex-1 transition"
                style={{
                  padding: "10px 16px",
                  borderRadius: "var(--rg-r-md)",
                  fontSize: 14,
                  fontWeight: 600,
                  background: active ? "var(--rg-accent)" : "transparent",
                  color: active
                    ? "var(--rg-accent-on)"
                    : "var(--rg-fg-muted)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "resumo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Sua Avaliação */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.04,
                duration: 0.22,
                ease: [0.2, 0.7, 0.3, 1],
              }}
              className="rg-card rg-card--accent"
              style={{ padding: 24 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="rg-eyebrow">Sua avaliação</span>
                  <h2 className="rg-h2" style={{ marginTop: 10 }}>
                    {plan.playerTierLabel}
                  </h2>
                  <p className="rg-meta" style={{ marginTop: 6 }}>
                    Tier{" "}
                    <span className="rg-mono">{plan.playerTier}</span> ·{" "}
                    <span className="rg-mono">{plan.totalCorrect}</span> de{" "}
                    <span className="rg-mono">{plan.totalDrills}</span> spots
                    corretos
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="rg-meta">Accuracy</span>
                  <div
                    className="rg-mono"
                    style={{
                      fontSize: 36,
                      fontWeight: 700,
                      color: "var(--rg-accent-fg)",
                      marginTop: 4,
                      lineHeight: 1,
                    }}
                  >
                    {plan.accuracyPct}%
                  </div>
                </div>
              </div>
              <div className="rg-progress" style={{ marginTop: 18 }}>
                <div
                  className="rg-progress__bar"
                  style={{ width: `${plan.accuracyPct}%` }}
                />
              </div>
            </motion.div>

            {/* Performance por Categoria */}
            {categories.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.06,
                  duration: 0.22,
                  ease: [0.2, 0.7, 0.3, 1],
                }}
                className="rg-card"
                style={{ padding: 24 }}
              >
                <h3 className="rg-h3" style={{ marginBottom: 18 }}>
                  Performance por categoria
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {categories.map((c) => {
                    const accentColor =
                      c.pct >= 70
                        ? "var(--rg-success)"
                        : c.pct >= 50
                          ? "var(--rg-warn)"
                          : "var(--rg-danger)";
                    return (
                      <div key={c.category}>
                        <div
                          className="flex items-center justify-between"
                          style={{ marginBottom: 6 }}
                        >
                          <span style={{ fontSize: 14, color: "var(--rg-fg-soft)" }}>
                            {c.category}
                          </span>
                          <span
                            className="rg-mono"
                            style={{
                              fontSize: 12,
                              color: "var(--rg-fg-subtle)",
                            }}
                          >
                            {c.pct}% · {c.correct}/{c.total}
                          </span>
                        </div>
                        <div className="rg-progress">
                          <div
                            className="rg-progress__bar"
                            style={{
                              width: `${Math.max(c.pct, 3)}%`,
                              background: accentColor,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Pontos Fortes + Áreas para Melhorar */}
            {(strengths.length > 0 || weaknesses.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.08,
                  duration: 0.22,
                  ease: [0.2, 0.7, 0.3, 1],
                }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              >
                <div className="rg-card" style={{ padding: 22 }}>
                  <h3
                    className="rg-h3"
                    style={{
                      marginBottom: 14,
                      color: "var(--rg-success)",
                      fontSize: 14,
                    }}
                  >
                    Pontos fortes
                  </h3>
                  {strengths.length === 0 ? (
                    <p className="rg-caption">
                      Ainda não tem nenhum spot acima de 70%. Foque em
                      consolidar fundamentos.
                    </p>
                  ) : (
                    <ul
                      style={{
                        margin: 0,
                        padding: 0,
                        listStyle: "none",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {strengths.map((s, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-3"
                        >
                          <span
                            style={{
                              fontSize: 14,
                              color: "var(--rg-fg-soft)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {s.label}
                          </span>
                          <span
                            className="rg-mono shrink-0"
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--rg-success)",
                            }}
                          >
                            {s.pct}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rg-card" style={{ padding: 22 }}>
                  <h3
                    className="rg-h3"
                    style={{
                      marginBottom: 14,
                      color: "var(--rg-accent-fg)",
                      fontSize: 14,
                    }}
                  >
                    Áreas para melhorar
                  </h3>
                  {weaknesses.length === 0 ? (
                    <p className="rg-caption">
                      Mandou bem — não identificamos pontos fracos críticos.
                    </p>
                  ) : (
                    <ul
                      style={{
                        margin: 0,
                        padding: 0,
                        listStyle: "none",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {weaknesses.map((w, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-3"
                        >
                          <span
                            style={{
                              fontSize: 14,
                              color: "var(--rg-fg-soft)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {w.label}
                          </span>
                          <span
                            className="rg-mono shrink-0"
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--rg-accent-fg)",
                            }}
                          >
                            {w.pct}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            )}

            {/* PDF hero — entrega principal */}
            {pdfCard}
          </div>
        )}

        {tab === "plano" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {pdfCard}

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.06,
                duration: 0.22,
                ease: [0.2, 0.7, 0.3, 1],
              }}
              style={{ marginTop: 8 }}
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
                delay: 0.08,
                duration: 0.22,
                ease: [0.2, 0.7, 0.3, 1],
              }}
              style={{
                margin: 0,
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
          </div>
        )}

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
