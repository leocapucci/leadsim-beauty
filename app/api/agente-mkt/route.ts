// app/api/agente-mkt/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.AGENTE_MKT_API_URL!;
const API_KEY = process.env.LEADSIM_INTERNAL_KEY!;

async function proxyRequest(path: string, options: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...(options.headers as Record<string, string>),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json(
      { error: data.detail || "Erro na API dos agentes" },
      { status: res.status }
    );
  }
  return NextResponse.json(data);
}

// POST /api/agente-mkt — inicia campanha
// POST /api/agente-mkt?action=imagens&job_id=xxx — gera imagens
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const job_id = searchParams.get("job_id");

  // Gera imagens para campanha existente
  if (action === "imagens" && job_id) {
    return await proxyRequest(`/campanha/${job_id}/imagens`, { method: "POST" });
  }

  // Inicia nova campanha
  try {
    const body = await req.json();
    if (!body.tema || body.tema.trim().length < 3) {
      return NextResponse.json({ error: "Tema inválido — mínimo 3 caracteres" }, { status: 400 });
    }
    return await proxyRequest("/campanha", {
      method: "POST",
      body: JSON.stringify({
        tema: body.tema,
        formatos: body.formatos || ["instagram", "whatsapp"],
        clinica_id: body.clinica_id || null,
        clinica_nome: body.clinica_nome || null,
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// GET /api/agente-mkt?job_id=xxx — polling de status
// GET /api/agente-mkt — lista histórico
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const job_id = searchParams.get("job_id");

  if (job_id) {
    return await proxyRequest(`/campanha/status/${job_id}`, { method: "GET" });
  }

  const clinica_id = searchParams.get("clinica_id") || "";
  const limite = searchParams.get("limite") || "20";
  const params = new URLSearchParams({ limite });
  if (clinica_id) params.set("clinica_id", clinica_id);

  return await proxyRequest(`/campanhas?${params}`, { method: "GET" });
}
