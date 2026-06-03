"use client";

import { useEffect, useMemo, useState } from "react";
import type { SavedPlan } from "@/lib/poker/planStorage";
import { buildSpotTrack, findActiveSpotIndex } from "@/lib/poker/spotTrack";
import { computeProgress, type SpotProgress } from "@/lib/poker/spotTraining";
import { LESSON_CATALOG, type LessonAction } from "@/lib/poker/lessonCatalog";
import { SpotCard } from "./SpotCard";

interface Props {
  plan: SavedPlan;
}

const BLURB_BY_ACTION: Partial<Record<LessonAction, string>> = {
  RFI:        "Como abrir mãos pré-flop por posição e stack — ranges cEV e os erros mais caros.",
  cBet:       "Quando puxar pequena, grande ou checar — texturas dry vs. wet em SPR baixo.",
  vsOpen:     "Como decidir entre flat, 3bet ou fold ao enfrentar um RFI.",
  bbDefense:  "Defesa de BB pré-flop — quais mãos defender e quando 3betar.",
  blindWar:   "Dinâmica SB vs BB pré-flop — limpe walks e proteja seu BB.",
  vsCbet:     "Como reagir a c-bet do BB: check-raise, check-call e folds disciplinados.",
  cbetTurn:   "Polarização no turn — qual size e quando deixar para o river.",
  cbetRiver:  "Decisões de value e blefe no river após c-bet em IP.",
  multiway:   "Defesa de BB em pots multiway — equity, posição e plano de pós-flop.",
  vs3Bet:     "Flat ou 4bet contra uma 3bet — leitura de range e sizes.",
  cbetOOP:    "C-bet fora de posição — frequências por size e por interação de range.",
  playingIP:  "Jogando em posição: vs cbet IP + bet vs missed c-bet.",
};

function actionOf(leakId: string | null): LessonAction | null {
  if (!leakId) return null;
  const head = leakId.split("-")[0];
  return (head as LessonAction) ?? null;
}

function lessonMeta(leakId: string | null): { title: string | null; blurb: string | null } {
  const action = actionOf(leakId);
  if (!action) return { title: null, blurb: null };
  const first = LESSON_CATALOG.find((l) => l.tags.action === action);
  return {
    title: first?.title ?? null,
    blurb: BLURB_BY_ACTION[action] ?? null,
  };
}

export function SpotTrack({ plan }: Props) {
  const track = useMemo(() => buildSpotTrack(plan), [plan]);
  const diagnosticId = plan.diagnosticId ?? "";
  const leakIdsKey = track.map((t) => t.leakId ?? "").join(",");

  const [progressByLeak, setProgressByLeak] = useState<
    Record<string, SpotProgress | null>
  >({});

  useEffect(() => {
    if (!diagnosticId || track.length === 0) return;
    let cancelled = false;

    async function fetchAll() {
      const updates: Record<string, SpotProgress | null> = {};
      for (const entry of track) {
        if (!entry.leakId) continue;
        try {
          const res = await fetch(
            `/api/spot-training?diagnosticId=${encodeURIComponent(diagnosticId)}&leakId=${encodeURIComponent(entry.leakId)}`
          );
          if (!res.ok) {
            updates[entry.leakId] = null;
            continue;
          }
          const data = (await res.json()) as { progress?: SpotProgress };
          updates[entry.leakId] = data.progress ?? null;
        } catch {
          updates[entry.leakId] = null;
        }
      }
      if (!cancelled) setProgressByLeak(updates);
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [diagnosticId, leakIdsKey, track]);

  if (!diagnosticId || track.length === 0) {
    return (
      <div className="rg-card" style={{ padding: 22, marginTop: 32 }}>
        <h3 className="rg-h3">Sua trilha de 30 dias</h3>
        <p className="rg-body-sm" style={{ marginTop: 8 }}>
          Mandou bem no nivelamento — nenhum spot crítico identificado. Foque em
          volume e fale com o EV Manager pra próximos passos.
        </p>
      </div>
    );
  }

  // First non-completed is the active one. Before = completed; after = locked.
  // Função compartilhada com adminSpotTrack.ts pra evitar drift da regra.
  const activeIdx = findActiveSpotIndex(track, (entry) => {
    const p = entry.leakId ? progressByLeak[entry.leakId] : undefined;
    return p != null && p.completed === true;
  });

  return (
    <section style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h3 className="rg-h3">Sua trilha de 30 dias</h3>
        <p className="rg-body-sm" style={{ marginTop: 4 }}>
          Conclua um spot por vez. Atingir 70% em 50 mãos libera o próximo.
        </p>
      </header>

      {track.map((entry, i) => {
        const id = entry.leakId;
        const p = id ? progressByLeak[id] : undefined;
        const progress: SpotProgress = p ?? computeProgress(null);

        const state: "active" | "locked" | "completed" =
          i < activeIdx ? "completed" : i === activeIdx ? "active" : "locked";

        const { title, blurb } = lessonMeta(id);

        return (
          <SpotCard
            key={`${entry.index}-${id ?? "empty"}`}
            entry={entry}
            state={state}
            progress={progress}
            diagnosticId={diagnosticId}
            lessonTitle={title}
            lessonBlurb={blurb}
            totalCount={track.length}
          />
        );
      })}
    </section>
  );
}
