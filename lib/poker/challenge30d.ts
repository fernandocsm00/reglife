// lib/poker/challenge30d.ts — Estrutura do "Desafio Profissão Poker · 30 dias".
//
// Substitui o plano de 90 dias (3 fases / tasks / aulas) por uma entrega
// enxuta de 6 links (3 fixos + 3 spots derivados dos top 3 leaks).

import type { SavedPlan } from "./planStorage";
import { topLeaks } from "@/lib/pdf/utils";
import { FIXED_LINKS, getSpotLink } from "./spotLinks";

export interface ChallengeItem {
  /** Label exibido no card / linha do PDF. */
  label: string;
  /** Sublabel curto (ex.: nome do spot ou contexto). Opcional. */
  sublabel?: string;
  /** URL final pra onde o aluno é levado. */
  url: string;
}

export function buildChallenge30d(plan: SavedPlan): ChallengeItem[] {
  const leaks = topLeaks(plan, 3);

  const items: ChallengeItem[] = [
    {
      label: "Aula construção de carreira",
      sublabel: "Como pensar a carreira no poker hoje",
      url: FIXED_LINKS.careerLesson,
    },
  ];

  leaks.forEach((leak, i) => {
    items.push({
      label: `Spot ${i + 1} — aula + treino`,
      sublabel: leak.label,
      url: getSpotLink(leakIdFromHighlight(leak.label)),
    });
  });

  // Se o aluno gerou menos de 3 leaks (ex.: passou em quase tudo), preenche
  // os slots restantes com itens neutros pra manter a estrutura de 6 cards.
  while (items.length < 4) {
    items.push({
      label: `Spot ${items.length} — aula + treino`,
      sublabel: "Recomendação a definir",
      url: FIXED_LINKS.careerLesson,
    });
  }

  items.push({
    label: "Grade de torneios",
    sublabel: "Quais torneios jogar e em qual horário",
    url: FIXED_LINKS.tournamentGrid,
  });

  items.push({
    label: "Grupo exclusivo no WhatsApp",
    sublabel: "Receba mais conteúdos e tire dúvidas",
    url: FIXED_LINKS.whatsappGroup,
  });

  return items;
}

/**
 * Converte o label exibido do leak (ex: "Vs RFI · BB · 25bb") de volta
 * pra um leak_id (ex: "vsOpen-BB-25") pra consultar o SPOT_LINK_MAP.
 *
 * Como `topLeaks()` em lib/pdf/utils só nos devolve o label formatado,
 * precisamos parsear de volta. Se não encontrar correspondência o
 * `getSpotLink` cai no PLACEHOLDER — não quebra.
 */
function leakIdFromHighlight(label: string): string {
  // Ex.: "Vs RFI · BB · 25bb"  →  ["Vs RFI", "BB", "25bb"]
  const parts = label.split("·").map((s) => s.trim());
  if (parts.length < 3) return label;

  const [actionLabel, position, stackBand] = parts;
  const action = ACTION_LABEL_TO_ID[actionLabel] ?? actionLabel;
  const stack = stackBand.replace(/bb$/i, "");
  return `${action}-${position}-${stack}`;
}

const ACTION_LABEL_TO_ID: Record<string, string> = {
  "RFI": "RFI",
  "Vs RFI": "vsOpen",
  "C-Bet": "cBet",
  "Vs C-Bet": "vsCbet",
  "Blind War": "blindWar",
  "Vs 3-Bet": "vs3Bet",
  "Multiway BB": "multiway",
  "C-Bet Turn": "cbetTurn",
  "C-Bet River": "cbetRiver",
};
