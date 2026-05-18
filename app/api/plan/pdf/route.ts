// app/api/plan/pdf/route.ts
//
// GET  /api/plan/pdf?diagnosticId=...&redirect=1
//      Caminho do email/WhatsApp/short-url. Tenta achar o PDF no Storage;
//      se faltar, regenera usando saved_plan da DB. Falha se saved_plan é null.
//
// POST /api/plan/pdf
//      Body: { diagnosticId, savedPlan }
//      Caminho do botão do /meu-plano. Recebe o SavedPlan direto do
//      localStorage do aluno, gera o PDF, faz upload e ATUALIZA saved_plan
//      na DB pro próximo GET funcionar standalone. Recupera o sistema mesmo
//      quando o /api/results UPDATE original falhou silenciosamente.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generatePlanPdf } from "@/lib/pdf/generatePlanPdf";
import {
  getPlanPdfPublicUrl,
  planPdfExists,
  uploadPlanPdf,
} from "@/lib/pdf/storage";
import { requireDiagSession } from "@/lib/session";
import { hit, rateLimitResponse } from "@/lib/rate-limit";
import type { SavedPlan } from "@/lib/poker/planStorage";

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// GET — caminho stateless, depende de saved_plan estar gravado na DB
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const diagnosticId = req.nextUrl.searchParams.get("diagnosticId");
  const wantsRedirect = req.nextUrl.searchParams.get("redirect") === "1";

  if (!diagnosticId) {
    return NextResponse.json(
      { error: "diagnosticId é obrigatório" },
      { status: 400 }
    );
  }

  // Já existe no Storage? retorna a URL direto
  if (await planPdfExists(diagnosticId)) {
    const url = getPlanPdfPublicUrl(diagnosticId);
    return wantsRedirect ? NextResponse.redirect(url) : NextResponse.json({ url });
  }

  // Não existe — tenta regenerar usando saved_plan da DB
  const supabase = service();
  const { data, error } = await supabase
    .from("reglife_diagnostic_results")
    .select("saved_plan")
    .eq("id", diagnosticId)
    .single();

  if (error || !data?.saved_plan) {
    console.error(
      `[api/plan/pdf GET] saved_plan ausente diagnosticId=${diagnosticId} dbError=${error?.message ?? "null"}`
    );
    return NextResponse.json(
      { error: "Plano não encontrado para regenerar PDF" },
      { status: 404 }
    );
  }

  return await renderAndUpload(diagnosticId, data.saved_plan as SavedPlan, wantsRedirect);
}

// ---------------------------------------------------------------------------
// POST — fallback que aceita savedPlan no body (caminho do botão do plano)
// Exige cookie de sessão batendo com o diagnosticId — POST pode SOBRESCREVER
// o PDF de um lead, então sem session não passa.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const diagnosticId =
    typeof body.diagnosticId === "string" && body.diagnosticId.trim()
      ? body.diagnosticId.trim()
      : null;
  const savedPlan = body.savedPlan as SavedPlan | undefined;

  const session = await requireDiagSession(diagnosticId);
  if (!session.ok) return session.response;

  // Rate-limit: 10 regenerações/h por diagnóstico. POST gera PDF + faz upload —
  // operação cara (Puppeteer/pdf-lib + I/O do Storage).
  const limitCheck = hit(`pdf:diag:${session.diagId}`, 10, 60 * 60 * 1000);
  if (!limitCheck.ok) return rateLimitResponse(limitCheck);

  if (!savedPlan || typeof savedPlan !== "object") {
    return NextResponse.json(
      { error: "savedPlan é obrigatório" },
      { status: 400 }
    );
  }

  // Já existe? retorna direto pra economizar processamento
  if (await planPdfExists(diagnosticId)) {
    return NextResponse.json({
      url: getPlanPdfPublicUrl(diagnosticId),
      regenerated: false,
    });
  }

  // Atualiza saved_plan na DB se estiver ausente (recupera estado pro GET
  // futuro / pro short-url /r/[id] / pro email).
  const supabase = service();
  const { error: upErr } = await supabase
    .from("reglife_diagnostic_results")
    .update({ saved_plan: savedPlan })
    .eq("id", diagnosticId);

  if (upErr) {
    console.error(
      `[api/plan/pdf POST] db update falhou diagnosticId=${diagnosticId} error=${upErr.message}`
    );
    // Não bloqueia — ainda dá pra gerar o PDF mesmo sem update na DB
  }

  return await renderAndUpload(diagnosticId, savedPlan, false);
}

// ---------------------------------------------------------------------------
// Helper compartilhado
// ---------------------------------------------------------------------------
async function renderAndUpload(
  diagnosticId: string,
  plan: SavedPlan,
  wantsRedirect: boolean
): Promise<NextResponse> {
  try {
    const buffer = await generatePlanPdf(plan);
    const upload = await uploadPlanPdf(diagnosticId, buffer);
    if (!upload.ok) {
      console.error(
        `[api/plan/pdf] upload falhou diagnosticId=${diagnosticId} error=${upload.error}`
      );
      return NextResponse.json(
        { error: `Upload falhou: ${upload.error}` },
        { status: 500 }
      );
    }
    const url = getPlanPdfPublicUrl(diagnosticId);
    return wantsRedirect
      ? NextResponse.redirect(url)
      : NextResponse.json({ url, regenerated: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[api/plan/pdf] generatePlanPdf falhou diagnosticId=${diagnosticId} error=${msg}`
    );
    return NextResponse.json(
      { error: "Falha ao gerar PDF", detail: msg },
      { status: 500 }
    );
  }
}
