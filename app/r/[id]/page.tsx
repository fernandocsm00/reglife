// app/r/[id]/page.tsx — URL curta que redireciona pro PDF do plano.
// /r/abc-123 → 302 → https://<supabase>/storage/v1/object/public/plan-pdfs/abc-123.pdf

import { redirect, notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getPlanPdfPublicUrl, planPdfExists } from "@/lib/pdf/storage";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ShortUrlPage({ params }: Props) {
  const { id } = await params;

  // UUID format check leve — evita SQL desnecessário
  if (!/^[0-9a-f-]{8,}$/i.test(id)) {
    notFound();
  }

  // Confirma que o diagnóstico existe (proteção contra links inválidos)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  // Se PDF não existe no Storage (raro), envia pro endpoint que regenera
  const exists = await planPdfExists(id);
  if (!exists) {
    redirect(`/api/plan/pdf?diagnosticId=${id}&redirect=1`);
  }

  redirect(getPlanPdfPublicUrl(id));
}
