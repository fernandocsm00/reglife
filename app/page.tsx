"use client";

/**
 * Landing "fazer o teste" — porta de entrada padrão.
 * A outra porta é /plano ("receber o plano individual"). As duas levam ao
 * mesmo /diagnostico; o que muda é a promessa do anúncio, gravada como
 * origem do lead (lib/leadSource.ts).
 */

import { LandingHero } from "@/components/LandingHero";

export default function Home() {
  return (
    <LandingHero
      entry="teste"
      title="Descubra seu nível no poker"
      subtitleBefore="Faça o teste e receba seu "
      highlight="score por spot"
      subtitleAfter=" na hora."
      ctaLabel="Fazer o teste"
    />
  );
}
