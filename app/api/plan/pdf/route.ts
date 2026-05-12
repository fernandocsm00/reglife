// app/api/plan/pdf/route.ts — GET retorna URL do PDF; regenera se faltar no Storage.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generatePlanPdf } from "@/lib/pdf/generatePlanPdf";
import {
  getPlanPdfPublicUrl,
  planPdfExists,
  uploadPlanPdf,
} from "@/lib/pdf/storage";
import type { SavedPlan } from "@/lib/poker/planStorage";

export async function GET(req: NextRequest) {
  const diagnosticId = req.nextUrl.searchParams.get("diagnosticId");
  const wantsRedirect = req.nextUrl.searchParams.get("redirect") === "1";

  if (!diagnosticId) {
    return NextResponse.json(
      { error: "diagnosticId é obrigatório" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Já existe no Storage? retorna a URL direto
  if (await planPdfExists(diagnosticId)) {
    const url = getPlanPdfPublicUrl(diagnosticId);
    return wantsRedirect ? NextResponse.redirect(url) : NextResponse.json({ url });
  }

  // Não existe — busca o plano completo salvo em saved_plan
  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .select("saved_plan")
    .eq("id", diagnosticId)
    .single();

  if (error || !data?.saved_plan) {
    return NextResponse.json(
      { error: "Plano não encontrado para regenerar PDF" },
      { status: 404 }
    );
  }

  const plan = data.saved_plan as SavedPlan;
  const buffer = await generatePlanPdf(plan);
  const upload = await uploadPlanPdf(diagnosticId, buffer);
  if (!upload.ok) {
    return NextResponse.json(
      { error: `Upload falhou: ${upload.error}` },
      { status: 500 }
    );
  }

  const url = getPlanPdfPublicUrl(diagnosticId);
  return wantsRedirect ? NextResponse.redirect(url) : NextResponse.json({ url });
}
