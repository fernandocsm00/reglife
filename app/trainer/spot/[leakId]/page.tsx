import { notFound, redirect } from "next/navigation";
import { TrainerScreen } from "@/components/trainer/TrainerScreen";
import { loadSpotConfig } from "@/lib/poker/listSpots";
import { slugForLeak } from "@/lib/poker/spotLinks";

interface PageProps {
  params: Promise<{ leakId: string }>;
  searchParams: Promise<{ diag?: string }>;
}

export default async function SpotTrainerPage({ params, searchParams }: PageProps) {
  const { leakId } = await params;
  const { diag } = await searchParams;

  // Sem diagnosticId não dá pra reportar progresso — manda de volta pro plano
  if (!diag) redirect("/meu-plano");

  const slug = slugForLeak(leakId);
  if (!slug) notFound();

  const config = await loadSpotConfig(slug);
  if (!config) notFound();

  return (
    <TrainerScreen
      initialConfig={config}
      singleSpotContext={{ diagnosticId: diag, leakId }}
    />
  );
}
