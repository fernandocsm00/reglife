// lib/poker/challenge30d.ts — Estrutura do "Desafio Profissão Poker · 30 dias".
//
// Entrega enxuta de 6 links: 3 fixos (carreira, grade de torneios, grupo
// WhatsApp) + 3 spots derivados dos top 3 leaks do diagnóstico.

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
      url: getSpotLink(leak.id),
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
