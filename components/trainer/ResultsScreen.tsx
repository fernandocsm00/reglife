"use client";

import { motion } from "motion/react";
import type { ResultEntry } from "@/lib/poker/diagnosticoStore";
import { analyzeResults } from "@/lib/poker/leakAnalysis";
import { Logo } from "@/components/Logo";

interface Props {
  results: ResultEntry[];
}

function formatBoard(board: string): string {
  if (!board) return "—";
  // already dashed?
  if (board.includes("-")) return board;
  // group every 2 chars
  return board.match(/.{1,2}/g)?.join("-") ?? board;
}

function formatHand(hand: string): string {
  if (!hand) return "—";
  // hand is like "QsTs"
  return hand.match(/.{1,2}/g)?.join("") ?? hand;
}

export function ResultsScreen({ results }: Props) {
  const summary = analyzeResults(results);

  // Group results by spotLabel for display
  const grouped = new Map<string, ResultEntry[]>();
  for (const r of results) {
    const list = grouped.get(r.spotLabel) ?? [];
    list.push(r);
    grouped.set(r.spotLabel, list);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 text-center"
        >
          <Logo size="lg" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
            Resultado do Nivelamento
          </h1>
          <p className="mt-2 text-neutral-400">
            Veja onde você acertou, onde errou e o que estudar a seguir.
          </p>
        </motion.div>

        {/* Summary cards */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-10 grid grid-cols-3 gap-4"
        >
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 text-center">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Acerto
            </div>
            <div className="mt-1 text-3xl font-bold text-amber-300">
              {summary.accuracyPct}%
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 text-center">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Acertos
            </div>
            <div className="mt-1 text-3xl font-bold text-neutral-100">
              {summary.totalCorrect}
              <span className="text-neutral-500">/{summary.totalDrills}</span>
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 text-center">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Erros
            </div>
            <div className="mt-1 text-3xl font-bold text-red-400">
              {summary.totalErrors}
            </div>
          </div>
        </motion.div>

        {/* Per-trainer summary */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10 space-y-3"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Por trainer
          </h2>
          {summary.byTrainer.map((t) => (
            <div
              key={t.label}
              className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
            >
              <div className="font-medium text-neutral-200">{t.label}</div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-neutral-400">
                  {t.correct}/{t.total}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    t.pct >= 80
                      ? "bg-amber-400/15 text-amber-300"
                      : t.pct >= 60
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-red-500/15 text-red-300"
                  }`}
                >
                  {t.pct}%
                </span>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Action plan */}
        {summary.leaks.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-10"
          >
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Plano de ação · seus pontos fracos
            </h2>
            <div className="space-y-4">
              {summary.leaks.map((leak) => (
                <div
                  key={leak.id}
                  className="rounded-xl border border-red-500/20 bg-red-500/5 p-5"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-neutral-100">
                      {leak.actionLabel} · {leak.position} · {leak.stackBand}
                    </div>
                    <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
                      {leak.errors} erro{leak.errors > 1 ? "s" : ""} de{" "}
                      {leak.total}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-300">
                    {leak.recommendation}
                  </p>
                  {leak.lessons.length > 0 && (
                    <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                        Aulas recomendadas
                      </div>
                      <ul className="space-y-1.5">
                        {leak.lessons.map((lesson) => (
                          <li key={lesson.url} className="text-sm">
                            <a
                              href={lesson.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group flex items-start gap-2 text-neutral-200 hover:text-amber-300"
                            >
                              <span className="mt-0.5 inline-flex shrink-0 items-center rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-400 group-hover:text-amber-300">
                                {lesson.type}
                              </span>
                              <span className="leading-snug">
                                {lesson.title}
                                <span className="ml-1 text-xs text-neutral-500">
                                  · {lesson.module}
                                </span>
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {leak.examples.length > 0 && (
                    <div className="mt-3 space-y-1 text-xs text-neutral-500">
                      {leak.examples.map((ex, i) => (
                        <div key={i}>
                          • Mão {formatHand(ex.hand)}
                          {ex.board ? ` no bordo ${formatBoard(ex.board)}` : ""}
                          : você escolheu{" "}
                          <span className="text-red-300">{ex.picked}</span>, o
                          correto era{" "}
                          <span className="text-amber-300">
                            {ex.expected.join(" ou ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-10 rounded-xl border border-amber-400/30 bg-amber-400/5 p-6 text-center"
          >
            <div className="text-2xl">🏆</div>
            <div className="mt-2 text-lg font-semibold text-amber-300">
              Perfeito! Nenhum leak identificado.
            </div>
            <div className="mt-1 text-sm text-neutral-400">
              Você acertou todas as decisões. Continue treinando para manter o nível.
            </div>
          </motion.div>
        )}

        {/* Detailed log */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Detalhes de cada mão
          </h2>
          {Array.from(grouped.entries()).map(([label, list]) => (
            <div key={label}>
              <div className="mb-2 text-sm font-medium text-neutral-300">
                {label}
              </div>
              <div className="overflow-hidden rounded-lg border border-neutral-800">
                {list.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-4 py-2 text-sm ${
                      i % 2 === 0 ? "bg-neutral-900/40" : "bg-neutral-900/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          r.isCorrect
                            ? "bg-amber-400/20 text-amber-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {r.isCorrect ? "✓" : "✗"}
                      </span>
                      <span className="text-neutral-300">
                        {r.position} {r.stackSize}bb
                      </span>
                      <span className="text-neutral-500">
                        {formatHand(r.hand)}
                        {r.board ? ` · ${formatBoard(r.board)}` : ""}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {r.isCorrect ? (
                        <span className="text-amber-300">{r.picked}</span>
                      ) : (
                        <>
                          <span className="text-red-400">{r.picked}</span>
                          <span className="mx-1">→</span>
                          <span className="text-amber-300">
                            {r.expected.join(" ou ")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
