"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { SpotTrackEntry } from "@/lib/poker/spotTrack";
import type { SpotProgress } from "@/lib/poker/spotTraining";
import { THRESHOLD_HANDS, THRESHOLD_PCT } from "@/lib/poker/spotTraining";

type State = "active" | "locked" | "completed";

interface Props {
  entry: SpotTrackEntry;
  state: State;
  progress: SpotProgress;
  diagnosticId: string;
  /** Lesson title pulled from lessonCatalog or null when there is no match. */
  lessonTitle: string | null;
  /** 1-line synopsis. Null when there is no specific copy for this theme. */
  lessonBlurb: string | null;
  /** Total number of spots in the track (for "Spot N / 3"). */
  totalCount: number;
}

export function SpotCard({
  entry,
  state,
  progress,
  diagnosticId,
  lessonTitle,
  lessonBlurb,
  totalCount,
}: Props) {
  if (state === "locked") return <LockedCard entry={entry} totalCount={totalCount} />;
  if (state === "completed") return <CompletedCard entry={entry} progress={progress} totalCount={totalCount} />;

  // Active
  const pctDisplay  = Math.round(progress.pct * 100);
  const handsTarget = THRESHOLD_HANDS;
  const handsBarPct = Math.min(100, (progress.handsPlayed / handsTarget) * 100);
  const showAlmostThere =
    progress.handsPlayed >= THRESHOLD_HANDS && progress.pct < THRESHOLD_PCT;

  const trainerHref =
    entry.trainerSlug && entry.leakId
      ? `/trainer/spot/${encodeURIComponent(entry.leakId)}?diag=${encodeURIComponent(diagnosticId)}`
      : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="rg-card rg-card--accent"
      style={{ padding: 28, borderRadius: "var(--rg-r-xl)" }}
    >
      <header className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <span className="rg-eyebrow">SPOT {entry.index + 1} / {totalCount}</span>
        {entry.pct !== null && (
          <span className="rg-eyebrow rg-eyebrow--pill" style={{ color: "var(--rg-danger)" }}>
            Diagnóstico: {entry.pct}%
          </span>
        )}
      </header>

      <h3 className="rg-h2" style={{ marginBottom: 18 }}>{entry.label}</h3>

      {/* Bloco 1 — Diagnóstico */}
      <section style={{ marginBottom: 20 }}>
        <p className="rg-eyebrow" style={{ marginBottom: 6 }}>Por que esse spot</p>
        <p className="rg-body-sm">
          {entry.pct !== null
            ? `Você acertou ${entry.pct}% no nivelamento. Esse é um dos seus leaks principais.`
            : "Recomendação a definir pelo seu Manager."}
        </p>
      </section>

      {/* Bloco 2 — Aula */}
      <section style={{ marginBottom: 20 }}>
        <p className="rg-eyebrow" style={{ marginBottom: 6 }}>O que você vai aprender</p>
        <a
          href={entry.lessonUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rg-row"
          style={{ padding: "12px 14px" }}
        >
          <span>📺 {lessonTitle ?? "Aula recomendada"}</span>
          <span className="rg-row__arrow">→</span>
        </a>
        {lessonBlurb && (
          <p className="rg-caption" style={{ marginTop: 8 }}>{lessonBlurb}</p>
        )}
      </section>

      {/* Bloco 3 — Treino */}
      <section style={{ marginBottom: 12 }}>
        <p className="rg-eyebrow" style={{ marginBottom: 6 }}>Treine este spot</p>
        <p className="rg-caption" style={{ marginBottom: 12 }}>
          Meta: {Math.round(THRESHOLD_PCT * 100)}% de acerto em {THRESHOLD_HANDS} mãos
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div className="rg-progress" style={{ flex: 1 }}>
            <div className="rg-progress__bar" style={{ width: `${handsBarPct}%` }} />
          </div>
          <span className="rg-mono" style={{ fontSize: 12, color: "var(--rg-fg-subtle)" }}>
            {progress.handsPlayed}/{handsTarget} mãos · {pctDisplay}% acerto
          </span>
        </div>

        {showAlmostThere && (
          <p className="rg-caption" style={{ color: "var(--rg-warn)", marginBottom: 8 }}>
            Quase lá — continue até {Math.round(THRESHOLD_PCT * 100)}%
          </p>
        )}

        {trainerHref ? (
          <Link href={trainerHref} className="rg-btn rg-btn--primary rg-btn--lg">
            ▶ Treinar este spot
          </Link>
        ) : (
          <p className="rg-caption">
            Esse spot ainda não está no trainer interno. Estude a aula acima e fale com o EV Manager.
          </p>
        )}
      </section>

      <p className="rg-caption" style={{ marginTop: 12 }}>
        ✓ Critério: {Math.round(THRESHOLD_PCT * 100)}% em {THRESHOLD_HANDS} mãos → libera o próximo Spot
      </p>
    </motion.article>
  );
}

function LockedCard({ entry, totalCount }: { entry: SpotTrackEntry; totalCount: number }) {
  return (
    <article
      className="rg-card"
      style={{ padding: 20, borderRadius: "var(--rg-r-lg)", opacity: 0.55 }}
    >
      <div className="flex items-center justify-between">
        <span className="rg-eyebrow">SPOT {entry.index + 1} / {totalCount}</span>
        <span className="rg-meta">🔒 Bloqueado</span>
      </div>
      <h3 className="rg-h3" style={{ marginTop: 8 }}>{entry.label}</h3>
      <p className="rg-caption" style={{ marginTop: 6 }}>
        Disponível após concluir o Spot {entry.index}
      </p>
    </article>
  );
}

function CompletedCard({
  entry,
  progress,
  totalCount,
}: {
  entry: SpotTrackEntry;
  progress: SpotProgress;
  totalCount: number;
}) {
  return (
    <article
      className="rg-card"
      style={{
        padding: 20,
        borderRadius: "var(--rg-r-lg)",
        borderColor: "var(--rg-success)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="rg-eyebrow" style={{ color: "var(--rg-success)" }}>
          SPOT {entry.index + 1} / {totalCount} · CONCLUÍDO
        </span>
        <span className="rg-meta" style={{ color: "var(--rg-success)" }}>✓</span>
      </div>
      <h3 className="rg-h3" style={{ marginTop: 8 }}>{entry.label}</h3>
      <p className="rg-caption" style={{ marginTop: 6 }}>
        {progress.handsPlayed} mãos · {Math.round(progress.pct * 100)}% de acerto
      </p>
    </article>
  );
}
