// app/api/publicar-instagram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  try {
    const { job_id, formato, caption } = await req.json();

    if (!job_id || !formato || !caption) {
      return NextResponse.json(
        { error: "job_id, formato e caption são obrigatórios" },
        { status: 400 }
      );
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1. Busca o job
    const { data: job, error: jobError } = await sb
      .from("jobs_campanha")
      .select("clinica_id, imagens, publicacoes")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
    }

    const imageUrl = job.imagens?.[formato]?.url;
    if (!imageUrl) {
      return NextResponse.json(
        { error: `Imagem para formato "${formato}" não encontrada` },
        { status: 400 }
      );
    }

    // 2. Busca credenciais Instagram da clínica
    const { data: clinica, error: clinicaError } = await sb
      .from("clinicas")
      .select("instagram_account_id, instagram_access_token")
      .eq("id", job.clinica_id)
      .single();

    if (clinicaError || !clinica) {
      return NextResponse.json({ error: "Clínica não encontrada" }, { status: 404 });
    }

    const { instagram_account_id, instagram_access_token } = clinica;

    if (!instagram_account_id || !instagram_access_token) {
      return NextResponse.json(
        { error: "Clínica sem credenciais do Instagram configuradas" },
        { status: 400 }
      );
    }

    const graphBase = `https://graph.facebook.com/v19.0`;

    // 3. Step 1 — cria container de mídia
    const mediaRes = await fetch(`${graphBase}/${instagram_account_id}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: instagram_access_token,
      }),
    });

    const mediaData = await mediaRes.json();

    if (!mediaRes.ok) {
      const errMsg = mediaData?.error?.message || JSON.stringify(mediaData);
      console.error("INSTAGRAM MEDIA ERROR:", errMsg);
      return NextResponse.json(
        { error: `Erro ao criar mídia no Instagram: ${errMsg}` },
        { status: mediaRes.status }
      );
    }

    const creation_id = mediaData.id;
    if (!creation_id) throw new Error("Instagram não retornou creation_id");

    // 4. Step 2 — publica o post
    const publishRes = await fetch(`${graphBase}/${instagram_account_id}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id,
        access_token: instagram_access_token,
      }),
    });

    const publishData = await publishRes.json();

    if (!publishRes.ok) {
      const errMsg = publishData?.error?.message || JSON.stringify(publishData);
      console.error("INSTAGRAM PUBLISH ERROR:", errMsg);
      return NextResponse.json(
        { error: `Erro ao publicar no Instagram: ${errMsg}` },
        { status: publishRes.status }
      );
    }

    const post_id = publishData.id;
    if (!post_id) throw new Error("Instagram não retornou post_id");

    // 5. Step 3 — busca o permalink
    const permalinkRes = await fetch(
      `${graphBase}/${post_id}?fields=permalink&access_token=${instagram_access_token}`
    );
    const permalinkData = await permalinkRes.json();
    const permalink: string = permalinkData.permalink ?? `https://www.instagram.com/p/${post_id}`;

    // 6. Salva publicação no Supabase
    const publicacoesAtualizadas = {
      ...(job.publicacoes || {}),
      [`instagram_${formato}`]: {
        post_id,
        permalink,
        publicado_em: new Date().toISOString(),
      },
    };

    const { error: updateError } = await sb
      .from("jobs_campanha")
      .update({ publicacoes: publicacoesAtualizadas })
      .eq("id", job_id);

    if (updateError) {
      // Post já publicado — loga mas não falha
      console.error("SUPABASE UPDATE ERROR:", updateError.message);
    }

    return NextResponse.json({ success: true, permalink, post_id, publicacoes: publicacoesAtualizadas });

  } catch (err: any) {
    console.error("ERRO PUBLICAR INSTAGRAM:", err?.message, err?.stack);
    return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 });
  }
}
