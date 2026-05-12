// lib/pdf/storage.ts — Upload do PDF + URL pública.

import { createClient } from "@supabase/supabase-js";

const BUCKET = "plan-pdfs";

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Faz upload do PDF pro bucket `plan-pdfs` no path `{diagnosticId}.pdf`.
 * Substitui (`upsert: true`) se já existe — útil pra regenerar.
 */
export async function uploadPlanPdf(
  diagnosticId: string,
  buffer: Buffer
): Promise<{ ok: boolean; error?: string }> {
  const path = `${diagnosticId}.pdf`;
  const supabase = service();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "3600",
    });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * URL pública do PDF (bucket é public, então URL é direta — sem signing).
 */
export function getPlanPdfPublicUrl(diagnosticId: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/${diagnosticId}.pdf`;
}

/**
 * Verifica se o PDF existe no bucket (HEAD-like via list).
 */
export async function planPdfExists(diagnosticId: string): Promise<boolean> {
  const supabase = service();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list("", { search: `${diagnosticId}.pdf` });
  if (error || !data) return false;
  return data.some((f) => f.name === `${diagnosticId}.pdf`);
}
