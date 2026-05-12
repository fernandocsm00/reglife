// lib/email.ts — Provider-agnostic transactional email layer.
//
// Default: no-op stub (loga e segue). Quando o provider for escolhido (Resend,
// SendGrid, SES, etc.), substitua a função `dispatch()` mantendo a mesma assinatura.

export interface PlanReportEmailArgs {
  to: string;
  playerName: string;
  pdfBuffer: Buffer;
  downloadUrl: string;
}

export interface EmailResult {
  ok: boolean;
  provider: string;
  error?: string;
}

const FROM = process.env.EMAIL_FROM ?? "EV <ev@reglife.com.br>";
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? "contato@reglife.com.br";

function htmlBody(playerName: string, downloadUrl: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0F172A;">
      <p style="font-size: 16px; margin: 0 0 12px;">Oi, ${playerName}.</p>
      <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">
        Anexei o relatório do seu nivelamento aqui. São 3 páginas:
        capa com o seu Tier e accuracy, top 3 leaks que vamos atacar primeiro,
        e o roadmap dos 90 dias.
      </p>
      <p style="font-size: 15px; line-height: 1.5; margin: 0 0 24px;">
        Você também pode baixar a qualquer momento:
        <a href="${downloadUrl}" style="color: #D97706; font-weight: bold;">${downloadUrl}</a>
      </p>
      <p style="font-size: 13px; color: #475569; margin: 0;">
        — EV<br/>Seu Manager de Evolução · Reglife
      </p>
    </div>
  `.trim();
}

/**
 * Stub default — substituir quando provider for escolhido.
 */
async function dispatch(args: PlanReportEmailArgs): Promise<EmailResult> {
  // TODO: trocar por chamada real ao provider (Resend / SendGrid / SES) quando configurado.
  console.log(
    `[email:stub] would send plan PDF to ${args.to} (player: ${args.playerName}, pdf: ${args.pdfBuffer.length} bytes, url: ${args.downloadUrl})`
  );
  return { ok: true, provider: "stub" };
}

export async function sendPlanReportEmail(
  args: PlanReportEmailArgs
): Promise<EmailResult> {
  if (!args.to || !args.to.includes("@")) {
    return { ok: false, provider: "stub", error: "invalid email" };
  }
  try {
    return await dispatch(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email] dispatch failed", msg);
    return { ok: false, provider: "stub", error: msg };
  }
}

export const EMAIL_CONFIG = { FROM, REPLY_TO, htmlBody };
