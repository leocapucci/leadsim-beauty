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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.tema || body.tema.trim().length < 3) {
      return NextResponse.json(
        { error: "Tema inválido — mínimo 3 caracteres" },
        { status: 400 }
      );
    }

    return await proxyRequest("/campanha", {
      method: "POST",
      body: JSON.stringify({
        tema: body.tema,
        formatos: body.formatos || ["instagram", "email", "whatsapp"],
        clinica_id: body.clinica_id || null,
        clinica_nome: body.clinica_nome || null,
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clinica_id = searchParams.get("clinica_id") || "";
  const limite = searchParams.get("limite") || "20";

  const params = new URLSearchParams({ limite });
  if (clinica_id) params.set("clinica_id", clinica_id);

  return await proxyRequest(`/campanhas?${params}`, { method: "GET" });
}
