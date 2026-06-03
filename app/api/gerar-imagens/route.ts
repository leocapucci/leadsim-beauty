// app/api/gerar-imagens/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PROMPT_TEMPLATE = (briefing: string) =>
  `Brazilian woman 35 years old, radiant skin, natural beauty, serene confident expression, ` +
  `premium aesthetic clinic environment, soft golden lighting, clean white interior, ` +
  `editorial photography style, high quality, professional. ` +
  `Campaign context: ${briefing.slice(0, 400)}`;

export async function POST(req: NextRequest) {
  const OPENAI_KEY   = process.env.OPENAI_API_KEY!;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  try {
    const { job_id, briefing, formato } = await req.json();
    console.log("INICIO GERAR IMAGENS", { job_id, briefing: briefing?.slice(0, 50), formato });

    if (!job_id || !briefing || !formato) {
      return NextResponse.json(
        { error: "job_id, briefing e formato são obrigatórios" },
        { status: 400 }
      );
    }
    if (!OPENAI_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY não configurada no Vercel" },
        { status: 500 }
      );
    }

    const prompt = PROMPT_TEMPLATE(briefing);

    // Chama DALL-E 3
    const openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "low",
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.json();
      return NextResponse.json(
        { error: err.error?.message || "Erro OpenAI" },
        { status: openaiRes.status }
      );
    }

    const { data: [{ url }] } = await openaiRes.json();

    // Busca imagens existentes e faz merge (não sobrescreve outros formatos)
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: row } = await sb
      .from("jobs_campanha")
      .select("imagens")
      .eq("id", job_id)
      .single();

    const imagensAtualizadas = {
      ...(row?.imagens || {}),
      [formato]: { url, prompt_usado: prompt, size: "1024x1024" },
    };

    const { error: updateError } = await sb
      .from("jobs_campanha")
      .update({ imagens: imagensAtualizadas })
      .eq("id", job_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ job_id, formato, url, imagens: imagensAtualizadas });

  } catch (err: any) {
    console.error("ERRO CATCH:", err?.message, err?.stack);
    console.error("ERRO GERAR IMAGENS:", JSON.stringify(err), err.message, err.stack);
    return NextResponse.json({ error: err.message || "Erro interno", stack: err.stack }, { status: 500 });
  }
}
