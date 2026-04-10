import { notFound } from "next/navigation";
import { TrainerScreen } from "@/components/trainer/TrainerScreen";
import { loadSpotConfig } from "@/lib/poker/listSpots";

// Note: we intentionally do NOT use generateStaticParams here.
// In Next 16 dev, the Turbopack worker running generateStaticParams can crash
// when reading larger JSON files, producing an unhelpful
// "Jest worker encountered X child process exceptions" error.
// Rendering spots on demand works in both dev and prod without issues,
// and the pages are still cached after first render.

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function TrainerPage({ params }: PageProps) {
  const { slug } = await params;
  const config = await loadSpotConfig(slug);
  if (!config) notFound();
  return <TrainerScreen initialConfig={config} />;
}
