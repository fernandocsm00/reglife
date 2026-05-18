"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import type { SavedPlan } from "@/lib/poker/planStorage";
import {
  performanceByCategory,
  tierForSpotLabel,
  topStrengths,
  topWeaknesses,
} from "@/lib/poker/planCategories";
import { Logo } from "@/components/Logo";

interface Props {
  plan: SavedPlan;
  onContinue: () => void;
}

export function ResultsScreen({ plan, onContinue }: Props) {
  const categories = useMemo(() => performanceByCategory(plan), [plan]);
  const strengths = useMemo(() => topStrengths(plan, 3), [plan]);
  const weaknesses = useMemo(() => topWeaknesses(plan, 3), [plan]);

  const sortedSpots = useMemo(
    () =>
      [...plan.byTrainer].sort((a, b) => {
        const ta = tierForSpotLabel(a.label) ?? 9;
        const tb = tierForSpotLabel(b.label) ?? 9;
        if (ta !== tb) return ta - tb;
        return b.pct - a.pct;
      }),
    [plan.byTrainer]
  );

  const firstName = plan.playerName.split(" ")[0] ?? plan.playerName;

  return (
    <div className="rg-root min-h-screen">
      <div
        className="mx-auto"
        style={{ maxWidth: 880, padding: "40px 24px 80px" }}
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
          className="text-center"
          style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <Logo size="md" />
          <h1
            className="rg-display"
            style={{ marginTop: 28, fontSize: 44 }}
          >
            Seu resultado
          </h1>
          <p
            className="rg-body"
            style={{ marginTop: 14, maxWidth: 540 }}
          >
            Aqui está o que vimos, {firstName}. Esse é seu ponto de partida —
            antes do plano personalizado.
          </p>
        </motion.div>

        {/* Player info bar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
          className="rg-card"
          style={{
            marginTop: 32,
            padding: 22,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 22,
          }}
        >
          <div>
            <div className="rg-meta">JOGADOR</div>
            <div style={{ marginTop: 6, fontSize: 15, fontWeight: 600 }}>
              {plan.playerName}
            </div>
            {plan.email && (
              <div
                className="rg-caption"
                style={{ marginTop: 2, color: "var(--rg-fg-muted)" }}
              >
                {plan.email}
              </div>
            )}
          </div>
          <div>
            <div className="rg-meta">RESULTADO</div>
            <div
              className="rg-mono"
              style={{
                marginTop: 6,
                fontSize: 24,
                fontWeight: 700,
                color: "var(--rg-accent-fg)",
                lineHeight: 1,
              }}
            >
              {plan.accuracyPct}%
            </div>
          </div>
          <div>
            <div className="rg-meta">STATUS</div>
            <div style={{ marginTop: 6 }}>
              {plan.stoppedEarly ? (
                <span
                  className="rg-eyebrow rg-eyebrow--pill"
                  style={{
                    color: "var(--rg-danger)",
                    borderColor: "rgba(239,68,68,0.30)",
                    background: "var(--rg-danger-soft)",
                  }}
                >
                  Early stop · {plan.spotsFailed} falhas
                </span>
              ) : (
                <span
                  className="rg-eyebrow rg-eyebrow--pill"
                  style={{
                    color: "var(--rg-success)",
                    borderColor: "rgba(34,197,94,0.30)",
                    background: "rgba(34,197,94,0.08)",
                  }}
                >
                  Completo
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Performance por categoria */}
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
            style={{ marginTop: 16, padding: 24 }}
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
                      <span
                        style={{ fontSize: 14, color: "var(--rg-fg-soft)" }}
                      >
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

        {/* Pontos fortes + Áreas para melhorar */}
        {(strengths.length > 0 || weaknesses.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.08,
              duration: 0.22,
              ease: [0.2, 0.7, 0.3, 1],
            }}
            className="grid grid-cols-1 sm:grid-cols-2"
            style={{ marginTop: 16, gap: 16 }}
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
                  Ainda não tem nenhum spot acima de 70%. Foque em consolidar
                  fundamentos.
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

        {/* Resultado por Spot */}
        {sortedSpots.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.10,
              duration: 0.22,
              ease: [0.2, 0.7, 0.3, 1],
            }}
            style={{ marginTop: 28 }}
          >
            <h3 className="rg-h3" style={{ marginBottom: 12 }}>
              Resultado por spot
            </h3>
            <div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {sortedSpots.map((spot) => {
                const tier = tierForSpotLabel(spot.label);
                const passed = spot.pct >= 70;
                const dotColor = passed
                  ? "var(--rg-success)"
                  : "var(--rg-danger)";
                const cleanLabel = spot.label.replace(/ — reg\.life$/, "");
                return (
                  <div
                    key={spot.label}
                    className="rg-card"
                    style={{ padding: 16 }}
                  >
                    <div
                      className="flex items-center justify-between"
                      style={{ marginBottom: 10 }}
                    >
                      <span
                        className="rg-dot"
                        style={{ background: dotColor }}
                      />
                      {tier && (
                        <span
                          className="rg-meta"
                          style={{ color: "var(--rg-fg-faint)" }}
                        >
                          Tier {tier}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--rg-fg-soft)",
                        lineHeight: 1.3,
                        minHeight: 32,
                      }}
                    >
                      {cleanLabel}
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        alignItems: "baseline",
                        gap: 6,
                      }}
                    >
                      <span
                        className="rg-mono"
                        style={{
                          fontSize: 22,
                          fontWeight: 700,
                          color: passed
                            ? "var(--rg-success)"
                            : "var(--rg-danger)",
                          lineHeight: 1,
                        }}
                      >
                        {spot.pct}%
                      </span>
                      <span
                        className="rg-mono"
                        style={{
                          fontSize: 11,
                          color: "var(--rg-fg-subtle)",
                        }}
                      >
                        {spot.correct}/{spot.total}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* CTA — Quero meu plano */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
          className="rg-card rg-card--accent relative overflow-hidden"
          style={{
            marginTop: 36,
            padding: 28,
            borderRadius: "var(--rg-r-xl)",
          }}
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
            <div>
              <h2 className="rg-h2">
                Agora receba seu plano individual.
              </h2>
              <p
                className="rg-body-sm"
                style={{ marginTop: 10, maxWidth: 440 }}
              >
                Você terá as aulas, os treinos e a grade certa para o seu ABI atual.
              </p>
            </div>
            <button
              type="button"
              onClick={onContinue}
              className="rg-btn rg-btn--primary rg-btn--lg shrink-0"
              style={{ borderRadius: "var(--rg-r-pill)" }}
            >
              Quero meu plano →
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
