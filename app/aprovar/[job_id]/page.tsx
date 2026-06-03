"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const RENDER_API = "https://leadsim-mkt-api.onrender.com";

interface Job {
  id: string;
  tema: string;
  conteudo_final?: string;
  imagens?: Record<string, { url: string; size: string }>;
  status: string;
  clinica_id?: string;
  score?: number;
  aprovado?: boolean;
}

export default function AprovarPage({ params }: { params: { job_id: string } }) {
  const { job_id } = params;

  const [job, setJob] = useState<Job | null>(null);
  const [clinicaNome, setClinicaNome] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<"aprovado" | "reprovado" | null>(null);
  const [publicarEm, setPublicarEm] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function fetchJob() {
      try {
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data: jobData, error: jobError } = await sb
          .from("jobs_campanha")
          .select("id, tema, conteudo_final, imagens, status, clinica_id, score, aprovado")
          .eq("id", job_id)
          .single();

        if (jobError || !jobData) {
          setErro("Campanha não encontrada.");
          return;
        }

        setJob(jobData);

        if (jobData.status === "aprovado") setResultado("aprovado");
        if (jobData.status === "reprovado") setResultado("reprovado");

        if (jobData.clinica_id) {
          const { data: clinica } = await sb
            .from("clinicas")
            .select("nome")
            .eq("id", jobData.clinica_id)
            .single();
          if (clinica) setClinicaNome(clinica.nome);
        }
      } catch (e: any) {
        setErro("Erro ao carregar campanha.");
      } finally {
        setLoading(false);
      }
    }

    fetchJob();
  }, [job_id]);

  async function responder(aprovado: boolean) {
    setProcessando(true);
    try {
      const res = await fetch(`${RENDER_API}/aprovar/${job_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aprovado, whatsapp_origem: "sistema" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erro ao processar resposta");

      setResultado(aprovado ? "aprovado" : "reprovado");
      if (data.publicar_em) setPublicarEm(data.publicar_em);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setProcessando(false);
    }
  }

  const primeiraImagem = job?.imagens ? Object.values(job.imagens)[0]?.url : null;
  const preview = job?.conteudo_final?.trim().split("\n").filter(Boolean).slice(0, 4).join("\n") ?? "";

  // ── LOADING ──
  if (loading) {
    return (
      <div style={styles.page}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={styles.spinner} />
          <p style={{ color: "#888", fontSize: 14 }}>Carregando campanha...</p>
        </div>
      </div>
    );
  }

  // ── ERRO ──
  if (erro && !job) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: "#e07070", fontSize: 15, textAlign: "center" }}>{erro}</p>
        </div>
      </div>
    );
  }

  // ── JÁ RESPONDIDA ──
  if (resultado) {
    const aprovado = resultado === "aprovado";
    const hora = publicarEm
      ? new Date(publicarEm).toLocaleString("pt-BR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
      : null;

    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>{aprovado ? "✅" : "❌"}</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: aprovado ? "#5a9e6f" : "#e07070", margin: "0 0 8px" }}>
            {aprovado ? "Campanha aprovada!" : "Campanha reprovada."}
          </h2>
          {aprovado && hora && (
            <p style={{ fontSize: 14, color: "#888", textAlign: "center", lineHeight: 1.5 }}>
              Será publicada no Instagram na {hora}.
            </p>
          )}
          {!aprovado && (
            <p style={{ fontSize: 14, color: "#888", textAlign: "center" }}>
              A campanha foi marcada como reprovada.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── PÁGINA PRINCIPAL ──
  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={styles.badge}>✦ LeadSim Beauty</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#f0ede8", margin: "10px 0 4px" }}>
            {clinicaNome || "Aprovação de Campanha"}
          </h1>
          <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
            📌 {job?.tema}
          </p>
          {job?.score ? (
            <p style={{ fontSize: 12, color: job.score >= 8 ? "#5a9e6f" : "#9e855a", marginTop: 4 }}>
              ★ Score: {job.score}/10
            </p>
          ) : null}
        </div>

        {/* Imagem gerada */}
        {primeiraImagem && (
          <img
            src={primeiraImagem}
            alt="Imagem da campanha"
            style={{ width: "100%", borderRadius: 12, marginBottom: 16, border: "1px solid #2a2a32" }}
          />
        )}

        {/* Preview do conteúdo */}
        <div style={styles.previewBox}>
          <p style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
            Prévia do conteúdo
          </p>
          <p style={{ fontSize: 14, color: "#c8c4be", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
            {preview}
            {(job?.conteudo_final?.split("\n").length ?? 0) > 4 && (
              <span style={{ color: "#555" }}>{"\n"}...</span>
            )}
          </p>
        </div>

        {/* Erro inline */}
        {erro && (
          <div style={{ padding: "10px 14px", background: "#2a1515", border: "1px solid #5a2020", borderRadius: 8, fontSize: 13, color: "#e07070", marginBottom: 12 }}>
            ⚠️ {erro}
          </div>
        )}

        {/* Botões */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            onClick={() => responder(true)}
            disabled={processando}
            style={{
              ...styles.btn,
              background: processando ? "#1a2a1a" : "linear-gradient(135deg, #2d7a4f, #3aad6e)",
              color: processando ? "#444" : "#fff",
              cursor: processando ? "not-allowed" : "pointer",
            }}
          >
            {processando ? "Processando..." : "✅ Aprovar campanha"}
          </button>

          <button
            onClick={() => responder(false)}
            disabled={processando}
            style={{
              ...styles.btn,
              background: processando ? "#1a1515" : "#2a1515",
              color: processando ? "#444" : "#e07070",
              border: "1px solid #5a2020",
              cursor: processando ? "not-allowed" : "pointer",
            }}
          >
            {processando ? "Processando..." : "❌ Reprovar campanha"}
          </button>
        </div>

        <p style={{ fontSize: 11, color: "#444", textAlign: "center", marginTop: 16 }}>
          Ao aprovar, a campanha será publicada no próximo horário agendado.
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0e0e11",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    color: "#e8e6e1",
  } as React.CSSProperties,

  card: {
    width: "100%",
    maxWidth: 440,
    background: "#16161c",
    border: "1px solid #1e1e24",
    borderRadius: 16,
    padding: "28px 24px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 0,
  } as React.CSSProperties,

  badge: {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 20,
    background: "#7C5CBF22",
    border: "1px solid #7C5CBF",
    color: "#a68fe0",
    fontSize: 12,
    fontWeight: 600,
  } as React.CSSProperties,

  previewBox: {
    background: "#0e0e11",
    border: "1px solid #1e1e24",
    borderRadius: 10,
    padding: "14px 16px",
    marginBottom: 20,
  } as React.CSSProperties,

  btn: {
    width: "100%",
    padding: "16px",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    border: "none",
    fontFamily: "inherit",
    transition: "opacity 0.2s",
  } as React.CSSProperties,

  spinner: {
    width: 36,
    height: 36,
    border: "3px solid #1e1e24",
    borderTopColor: "#7C5CBF",
    borderRadius: "50%",
    animation: "spin 0.9s linear infinite",
  } as React.CSSProperties,
};
