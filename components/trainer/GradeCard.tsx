"use client";

/**
 * GradeCard — bloco separado em /meu-plano mostrando a grade do aluno.
 *
 * Renderizado entre <SpotTrack> e <ResourcesBlock>. Visual com peso
 * similar aos SpotCards (rg-card grande) mas paleta neutra — grade
 * é "informativo geral", não amarra a um spot específico.
 *
 * Lida com plan.stakeGrade === null (aluno não declarou banca) via
 * fallback no título e descriptor.
 */

import { motion } from "motion/react";
import type { SavedPlan } from "@/lib/poker/planStorage";
import { getGradeUrl } from "@/lib/poker/spotTrack";

interface Props {
  plan: SavedPlan;
}

const GRADE_DESCRIPTORS: Record<number, string> = {
  1:    "Sunday Storm e companhia",
  2.5:  "$2.50 entry — Stars Vanilla e PKO",
  4:    "$4 entry — Mid stakes",
  7:    "$7 entry — Approach a $10",
  10:   "$10 entry — High mid",
  13:   "$13 entry — $20 cusp",
  19:   "$19 entry — High stakes",
  28:   "$28 entry — Sunday Million regs",
};

function gradeTitle(stakeGrade: number | null | undefined): string {
  if (stakeGrade == null) return "Grade de torneios";
  return `ABI $${stakeGrade}`;
}

function gradeDescriptor(stakeGrade: number | null | undefined): string {
  if (stakeGrade == null) {
    return "Defina sua banca com o EV pra liberar a grade sugerida.";
  }
  return GRADE_DESCRIPTORS[stakeGrade] ?? `Grade ABI $${stakeGrade}`;
}

export function GradeCard({ plan }: Props) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="rg-card border border-neutral-700/40 bg-neutral-900/40"
      style={{ padding: 28, borderRadius: "var(--rg-r-xl)", marginTop: 32 }}
    >
      <span className="rg-eyebrow">TUA GRADE</span>
      <h3 className="rg-h2" style={{ marginTop: 8, marginBottom: 6 }}>
        {gradeTitle(plan.stakeGrade)}
      </h3>
      <p className="rg-body-sm" style={{ marginBottom: 18 }}>
        {gradeDescriptor(plan.stakeGrade)}
      </p>
      <a
        href={getGradeUrl(plan)}
        target="_blank"
        rel="noopener noreferrer"
        className="rg-btn rg-btn--secondary"
      >
        📋 Abrir grade →
      </a>
    </motion.article>
  );
}
