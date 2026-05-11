/**
 * POST /api/manager/chat
 *
 * Recebe mensagem do aluno, monta contexto completo, chama o REX via Anthropic API,
 * salva a conversa no Supabase e retorna a resposta com streaming.
 *
 * Body: { userId: string; message: string; trigger?: ManagerTrigger }
 * Response: text/event-stream (SSE) com a resposta do REX
 */

import { NextRequest } from "next/server";
import OpenAI from "openai";
import {
  buildPlayerContext,
  buildPlayerContextFromDiagnostic,
  recordActivity,
  saveMessage,
  type RecentMessage,
} from "@/lib/manager/context";
import { buildSystemPrompt, type ManagerTrigger } from "@/lib/manager/persona";
import type { SavedPlan } from "@/lib/poker/planStorage";

// Lazy init: o construtor da OpenAI joga erro se OPENAI_API_KEY não estiver
// definida, e durante `next build` o módulo é importado pra coletar metadata —
// sem env var = build quebra. Cria sob demanda, no primeiro request.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      message,
      trigger = "player_initiated",
      plan,
      recentMessages,
    } = body as {
      userId: string;
      message: string;
      trigger?: ManagerTrigger;
      plan?: SavedPlan | null;
      recentMessages?: RecentMessage[];
    };

    if (!userId || !message?.trim()) {
      return new Response(JSON.stringify({ error: "userId e message são obrigatórios" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Modo sem-auth: usa diagnostic id em vez de auth.users.id
    const isDiagMode = userId.startsWith("diag:");
    const diagnosticId = isDiagMode ? userId.slice("diag:".length) : null;

    // 1. Monta contexto completo do aluno
    const ctx = isDiagMode
      ? await buildPlayerContextFromDiagnostic({
          diagnosticId: diagnosticId!,
          plan: plan ?? null,
          recentMessages: recentMessages ?? [],
        })
      : await buildPlayerContext(userId);

    // 2 + 3. Persistência só funciona no modo com auth (FK em auth.users)
    if (!isDiagMode) {
      await saveMessage(userId, "player", message.trim(), trigger);
      await recordActivity(userId, 20, "manager_replied", { trigger });
    }

    // 4. Monta system prompt com persona + contexto + trigger
    const systemPrompt = buildSystemPrompt(ctx, trigger as ManagerTrigger);

    // 5. Chama OpenAI com streaming
    const stream = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message.trim() },
      ],
    });

    // 6. Retorna SSE para o frontend
    const encoder = new TextEncoder();
    let fullResponse = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) {
              fullResponse += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }

          // Salva resposta completa do Manager no banco (somente modo com-auth)
          if (!isDiagMode) {
            await saveMessage(userId, "manager", fullResponse, trigger);
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("[manager/chat] Stream error:", err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Erro no stream" })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[manager/chat] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * GET /api/manager/chat?userId=xxx
 * Retorna o histórico de mensagens do aluno (últimas 30)
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return new Response(JSON.stringify({ error: "userId obrigatório" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Modo sem-auth: monta histórico a partir das notificações do Rex
  // (que carregam `payload.message` quando geradas via sendRexNotification).
  if (userId.startsWith("diag:")) {
    const diagId = userId.slice("diag:".length);
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, payload, created_at")
      .eq("diagnostic_id", diagId)
      .not("payload->message", "is", null)
      .order("created_at", { ascending: true })
      .limit(30);

    const messages = (data ?? [])
      .map((n) => {
        const text = (n.payload as { message?: string } | null)?.message;
        if (!text) return null;
        return {
          id: n.id,
          role: "manager" as const,
          content: text,
          created_at: n.created_at,
          trigger_type: n.kind,
        };
      })
      .filter(Boolean);

    return new Response(JSON.stringify({ messages }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("manager_conversations")
    .select("id, role, content, created_at, trigger_type")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(30);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ messages: data }), {
    headers: { "Content-Type": "application/json" },
  });
}
