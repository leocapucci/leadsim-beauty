// app/api/gerar-imagens/route.ts
// ✅ ESTÁVEL - não modificar sem aprovação explícita
// Modelo: gpt-image-2, quality: low, sem response_format
// Chave: process.env.Agentsleadsimopenai
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PROMPT_TEMPLATE = (briefing: string) =>
  `Brazilian woman 35 years old, radiant skin, natural beauty, serene confident expression, ` +
  `premium aesthetic clinic environment, soft golden lighting, clean white interior, ` +
  `editorial photography style, high quality, professional. ` +
  `Campaign context: ${briefing.slice(0, 400)}`;

export async function POST(req: NextRequest) {
  const OPENAI_KEY   = process.env.Agentsleadsimopenai!;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  try {
    const { job_id, briefing, formato } = await req.json();
    console.log("INICIO GERAR IMAGENS", { job_id, briefing: briefing?.slice(0, 50), formato });
    console.log("OPENAI_KEY presente:", !!process.env.Agentsleadsimopenai, "tamanho:", process.env.Agentsleadsimopenai?.length);

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

    const openaiData = await openaiRes.json();

    if (!openaiRes.ok) {
      const errMsg = openaiData?.error?.message || JSON.stringify(openaiData) || "Erro OpenAI";
      console.error("OPENAI ERROR:", openaiRes.status, errMsg);
      return NextResponse.json({ error: errMsg }, { status: openaiRes.status });
    }

    const item = openaiData.data?.[0];
    if (!item) {
      console.error("OPENAI sem data:", JSON.stringify(openaiData));
      throw new Error("OpenAI não retornou imagem");
    }
    if (!item.url && !item.b64_json) throw new Error("OpenAI não retornou url nem b64_json");

    // Converte para Buffer para upload no Supabase Storage
    let imageBuffer: Buffer;
    if (item.b64_json) {
      imageBuffer = Buffer.from(item.b64_json, "base64");
    } else {
      const imgRes = await fetch(item.url);
      imageBuffer = Buffer.from(await imgRes.arrayBuffer());
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Upload para Supabase Storage — URL pública permanente
    const storagePath = `${job_id}/${formato}.png`;
    const { error: uploadError } = await sb.storage
      .from("imagens-campanha")
      .upload(storagePath, imageBuffer, { contentType: "image/png", upsert: true });

    if (uploadError) {
      console.error("STORAGE UPLOAD ERROR:", uploadError.message);
      throw new Error(`Erro ao fazer upload da imagem: ${uploadError.message}`);
    }

    const { data: { publicUrl: url } } = sb.storage
      .from("imagens-campanha")
      .getPublicUrl(storagePath);

    console.log("IMAGEM SALVA NO STORAGE:", url);

    // Busca imagens existentes e faz merge (não sobrescreve outros formatos)

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
