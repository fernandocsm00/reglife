"use client";

/**
 * Landing "plano individual" — porta de entrada dos anúncios que prometem o
 * plano. Mesmo funil da / (leva ao /diagnostico); muda o texto e a origem
 * gravada no lead (lib/leadSource.ts).
 */

import { LandingHero } from "@/components/LandingHero";

export default function PlanoLanding() {
  return (
    <LandingHero
      entry="plano"
      title="Receba seu plano individual"
      subtitleBefore="Faça o teste e nossa equipe monta o seu "
      highlight="plano de progressão"
      subtitleAfter="."
      ctaLabel="Quero meu plano"
    />
  );
}
