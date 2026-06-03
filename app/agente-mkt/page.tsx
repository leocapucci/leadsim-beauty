"use client";

import { useState, useEffect, useRef } from "react";

type Formato = "instagram" | "email" | "whatsapp" | "stories";

interface ImagemGerada {
  url: string;
  prompt_usado: string;
  size: string;
}

interface Job {
  id: string;
  status: "pendente" | "processando" | "concluido" | "erro";
  tema: string;
  formatos: Formato[];
  score?: number;
  aprovado?: boolean;
  briefing?: string;
  conteudo_final?: string;
  notas_revisao?: string;
  tentativas?: number;
  duracao_segundos?: number;
  criado_em: string;
  erro?: string;
  imagens?: Record<string, ImagemGerada>;
}

const FORMATOS: { id: Formato; label: string; icon: string }[] = [
  { id: "instagram", label: "Instagram", icon: "📸" },
  { id: "email", label: "E-mail", icon: "✉️" },
  { id: "whatsapp", label: "WhatsApp", icon: "💬" },
  { id: "stories", label: "Stories", icon: "🎞️" },
];

const ETAPAS = ["Pesquisando mercado", "Gerando conteúdo", "Revisando"];

export default function AgenteMktPage() {
  const [tema, setTema] = useState("");
  const [formatos, setFormatos] = useState<Formato[]>(["instagram", "whatsapp"]);
  const [loading, setLoading] = useState(false);
  const [loadingImagens, setLoadingImagens] = useState(false);
  const [etapaIdx, setEtapaIdx] = useState(0);
  const [jobAtual, setJobAtual] = useState<Job | null>(null);
  const [historico, setHistorico] = useState<Job[]>([]);
  const [abaCampanha, setAbaCampanha] = useState<"conteudo" | "imagens" | "briefing" | "revisao">("conteudo");
  const [jobSelecionado, setJobSelecionado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const etapaRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    carregarHistorico();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (etapaRef.current) clearInterval(etapaRef.current);
    };
  }, []);

  async function carregarHistorico() {
    try {
      const res = await fetch("/api/agente-mkt");
      if (res.ok) {
        const data = await res.json();
        setHistorico(data.campanhas || []);
      }
    } catch {}
  }

  function toggleFormato(f: Formato) {
    setFormatos((prev) =>
      prev.includes(f) ? (prev.length > 1 ? prev.filter((x) => x !== f) : prev) : [...prev, f]
    );
  }

  function iniciarPolling(job_id: string) {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/agente-mkt?job_id=${job_id}`);
        if (!res.ok) return;
        const job: Job = await res.json();
        if (job.status === "concluido") {
          clearInterval(pollingRef.current!);
          setJobAtual(job);
          setLoading(false);
          setEtapaIdx(0);
          if (etapaRef.current) clearInterval(etapaRef.current);
          setAbaCampanha("conteudo");
          await carregarHistorico();
        } else if (job.status === "erro") {
          clearInterval(pollingRef.current!);
          setErro(job.erro || "Erro desconhecido no pipeline");
          setLoading(false);
          setEtapaIdx(0);
          if (etapaRef.current) clearInterval(etapaRef.current);
        }
      } catch {}
    }, 5000);
  }

  async function gerarCampanha() {
    if (!tema.trim() || loading) return;
    setLoading(true);
    setErro(null);
    setJobAtual(null);
    setJobSelecionado(null);
    setEtapaIdx(0);

    etapaRef.current = setInterval(() => {
      setEtapaIdx((prev) => (prev < ETAPAS.length - 1 ? prev + 1 : prev));
    }, 30000);

    try {
      const res = await fetch("/api/agente-mkt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema, formatos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao iniciar campanha");
      iniciarPolling(data.job_id);
    } catch (e: any) {
      setErro(e.message);
      setLoading(false);
      setEtapaIdx(0);
      if (etapaRef.current) clearInterval(etapaRef.current);
    }
  }

  async function gerarImagens(job_id: string) {
    if (!jobVisivel) return;
    setLoadingImagens(true);
    let pollingStarted = false;
    try {
      const formatos = jobVisivel.formatos || [];
      const briefing = jobVisivel.briefing || "";

      // 1. Chama /api/gerar-imagens para cada formato em paralelo
      const resultados = await Promise.all(
        formatos.map(async (formato) => {
          const r = await fetch("/api/gerar-imagens", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ job_id, briefing, formato }),
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || `Erro ao gerar imagem para ${formato}`);
          return data;
        })
      );

      // Verifica se alguma resposta indica fire-and-forget do backend legado
      const algumGerando = resultados.some((d) => d.status === "gerando");
      if (algumGerando) {
        pollingStarted = true;
        const poll = setInterval(async () => {
          try {
            const r = await fetch(`/api/agente-mkt?job_id=${job_id}`);
            if (!r.ok) return;
            const job: Job = await r.json();
            if (job.imagens && Object.keys(job.imagens).length > 0) {
              clearInterval(poll);
              setJobAtual((prev) => prev?.id === job_id ? { ...prev, imagens: job.imagens } : prev);
              setHistorico((prev) => prev.map((j) => j.id === job_id ? { ...j, imagens: job.imagens } : j));
              setAbaCampanha("imagens");
              setLoadingImagens(false);
            }
          } catch {}
        }, 5000);
        return;
      }

      // 2. Todas resolvidas — monta o objeto imagens a partir dos resultados
      const imagensMerged: Record<string, ImagemGerada> = {};
      for (const d of resultados) {
        if (d.formato && d.url) {
          imagensMerged[d.formato] = { url: d.url, prompt_usado: d.prompt_usado || "", size: d.size || "1024x1024" };
        }
      }

      if (Object.keys(imagensMerged).length > 0) {
        setJobAtual((prev) => prev?.id === job_id ? { ...prev, imagens: imagensMerged } : prev);
        setHistorico((prev) => prev.map((j) => j.id === job_id ? { ...j, imagens: imagensMerged } : j));
        setAbaCampanha("imagens");
      } else {
        throw new Error("Nenhuma imagem foi gerada");
      }
    } catch (e: any) {
      setErro(e.message);
    } finally {
      if (!pollingStarted) setLoadingImagens(false);
    }
  }

  async function copiar(texto: string, id: string) {
    await navigator.clipboard.writeText(texto);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 2000);
  }

  function baixarJSON(job: Job) {
    const blob = new Blob([JSON.stringify(job, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campanha_${job.tema.slice(0, 40).replace(/\s+/g, "_")}_${job.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const jobVisivel = jobSelecionado
    ? historico.find((j) => j.id === jobSelecionado) || jobAtual
    : jobAtual;

  const imagensJob = jobVisivel?.imagens || {};
  const temImagens = Object.keys(imagensJob).length > 0;

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", minHeight: "100vh", background: "#0e0e11", color: "#e8e6e1" }}>
      <div style={{ borderBottom: "1px solid #1e1e24", padding: "20px 32px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #7C5CBF, #4f8ef7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✦</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Agente de Marketing</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 1 }}>LeadSim Beauty — IA multi-agente</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {ETAPAS.map((e, i) => (
            <span key={e} style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 20,
              background: loading && i === etapaIdx ? "#7C5CBF22" : "#1a1a20",
              border: `1px solid ${loading && i === etapaIdx ? "#7C5CBF" : "#2a2a32"}`,
              color: loading && i === etapaIdx ? "#a68fe0" : "#555",
              transition: "all 0.4s"
            }}>{e}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", minHeight: "calc(100vh - 65px)" }}>
        <div style={{ borderRight: "1px solid #1e1e24", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: "#555", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Tema da campanha</label>
              <textarea value={tema} onChange={(e) => setTema(e.target.value)}
                placeholder="ex: bioestimuladores para rejuvenescimento facial..." rows={3}
                style={{ width: "100%", boxSizing: "border-box", background: "#16161c", border: "1px solid #2a2a32", borderRadius: 10, padding: "12px 14px", color: "#e8e6e1", fontSize: 14, resize: "none", outline: "none", lineHeight: 1.5, fontFamily: "inherit" }}
                onFocus={(e) => e.target.style.borderColor = "#7C5CBF"}
                onBlur={(e) => e.target.style.borderColor = "#2a2a32"} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#555", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 10 }}>Formatos</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {FORMATOS.map((f) => (
                  <button key={f.id} onClick={() => toggleFormato(f.id)} style={{
                    padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                    background: formatos.includes(f.id) ? "#7C5CBF22" : "#16161c",
                    border: `1px solid ${formatos.includes(f.id) ? "#7C5CBF" : "#2a2a32"}`,
                    color: formatos.includes(f.id) ? "#a68fe0" : "#666", transition: "all 0.2s",
                  }}>{f.icon} {f.label}</button>
                ))}
              </div>
            </div>
            <button onClick={gerarCampanha} disabled={loading || !tema.trim()} style={{
              padding: "13px", borderRadius: 10, fontWeight: 600, fontSize: 14,
              cursor: loading || !tema.trim() ? "not-allowed" : "pointer",
              background: loading || !tema.trim() ? "#1a1a20" : "linear-gradient(135deg, #7C5CBF, #4f8ef7)",
              border: "none", color: loading || !tema.trim() ? "#444" : "#fff", transition: "all 0.2s",
            }}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #666", borderTopColor: "#a68fe0", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  {ETAPAS[etapaIdx]}...
                </span>
              ) : "✦ Gerar Campanha"}
            </button>
            {erro && <div style={{ padding: "10px 14px", background: "#2a1515", border: "1px solid #5a2020", borderRadius: 8, fontSize: 13, color: "#e07070" }}>⚠️ {erro}</div>}
          </div>

          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Histórico ({historico.length})</div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {historico.length === 0 && <div style={{ fontSize: 13, color: "#333", textAlign: "center", paddingTop: 20 }}>Nenhuma campanha ainda</div>}
              {historico.map((j) => (
                <button key={j.id} onClick={() => { setJobSelecionado(j.id); setJobAtual(null); }} style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                  background: jobSelecionado === j.id ? "#16161c" : "transparent",
                  border: `1px solid ${jobSelecionado === j.id ? "#2a2a32" : "transparent"}`,
                  color: "inherit", transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#ccc", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.tema}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {j.score ? <span style={{ fontSize: 11, color: j.score >= 8 ? "#5a9e6f" : "#9e855a" }}>★ {j.score}/10</span> : null}
                    <span style={{ fontSize: 11, color: "#444" }}>{new Date(j.criado_em).toLocaleDateString("pt-BR")}</span>
                    {j.imagens && Object.keys(j.imagens).length > 0 && <span style={{ fontSize: 11, color: "#5a9e6f" }}>🖼</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: "28px 32px", overflowY: "auto" }}>
          {!jobVisivel && !loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, opacity: 0.4 }}>
              <div style={{ fontSize: 48 }}>✦</div>
              <div style={{ fontSize: 15, color: "#555" }}>Informe um tema e gere sua primeira campanha</div>
            </div>
          )}

          {loading && !jobVisivel && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20 }}>
              <div style={{ position: "relative", width: 60, height: 60 }}>
                <div style={{ position: "absolute", inset: 0, border: "2px solid #1e1e24", borderTopColor: "#7C5CBF", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                <div style={{ position: "absolute", inset: 8, border: "2px solid #1e1e24", borderTopColor: "#4f8ef7", borderRadius: "50%", animation: "spin 1.5s linear infinite reverse" }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: "#ccc" }}>{ETAPAS[etapaIdx]}</div>
                <div style={{ fontSize: 13, color: "#444", marginTop: 6 }}>Processando em background — pode levar alguns minutos</div>
              </div>
            </div>
          )}

          {jobVisivel && jobVisivel.status === "concluido" && (
            <div style={{ maxWidth: 860 }}>
              <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: "-0.4px", color: "#f0ede8" }}>{jobVisivel.tema}</h1>
                  <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {jobVisivel.score ? <span style={{ fontSize: 13, color: jobVisivel.score >= 8 ? "#5a9e6f" : "#9e855a", fontWeight: 600 }}>★ {jobVisivel.score}/10</span> : null}
                    <span style={{ fontSize: 12, color: "#444" }}>· {jobVisivel.duracao_segundos}s</span>
                    {temImagens && <span style={{ fontSize: 12, color: "#5a9e6f" }}>· 🖼 {Object.keys(imagensJob).length} imagem(ns)</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {!temImagens && (
                    <button onClick={() => gerarImagens(jobVisivel.id)} disabled={loadingImagens} style={{
                      padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: loadingImagens ? "not-allowed" : "pointer",
                      background: loadingImagens ? "#1a1a20" : "#1a1a2e",
                      border: "1px solid #4f8ef7", color: loadingImagens ? "#444" : "#4f8ef7",
                      transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6,
                    }}>
                      {loadingImagens ? (
                        <><span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #444", borderTopColor: "#4f8ef7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Gerando...</>
                      ) : "🖼 Gerar Imagens (~$0,04)"}
                    </button>
                  )}
                  <button onClick={() => copiar(jobVisivel.conteudo_final || "", "main")} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", background: copiado === "main" ? "#1a2a1a" : "#16161c", border: `1px solid ${copiado === "main" ? "#3a6a3a" : "#2a2a32"}`, color: copiado === "main" ? "#5a9e6f" : "#888" }}>
                    {copiado === "main" ? "✓ Copiado" : "Copiar"}
                  </button>
                  <button onClick={() => baixarJSON(jobVisivel)} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", background: "#16161c", border: "1px solid #2a2a32", color: "#888" }}>↓ JSON</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "#16161c", borderRadius: 10, padding: 4 }}>
                {[
                  { id: "conteudo", label: "Conteúdo" },
                  ...(temImagens ? [{ id: "imagens", label: `🖼 Imagens (${Object.keys(imagensJob).length})` }] : []),
                  { id: "briefing", label: "Briefing" },
                  { id: "revisao", label: "Revisão" },
                ].map((aba) => (
                  <button key={aba.id} onClick={() => setAbaCampanha(aba.id as any)} style={{
                    flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                    background: abaCampanha === aba.id ? "#0e0e11" : "transparent",
                    border: `1px solid ${abaCampanha === aba.id ? "#2a2a32" : "transparent"}`,
                    color: abaCampanha === aba.id ? "#ccc" : "#555", fontFamily: "inherit",
                  }}>{aba.label}</button>
                ))}
              </div>

              <div style={{ background: "#16161c", border: "1px solid #1e1e24", borderRadius: 12, padding: "24px 28px", minHeight: 300 }}>
                {abaCampanha === "conteudo" && (
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.75, fontSize: 14, color: "#c8c4be" }}>{jobVisivel.conteudo_final}</div>
                )}

                {abaCampanha === "imagens" && temImagens && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 20 }}>
                    {Object.entries(imagensJob).map(([formato, img]) => (
                      <div key={formato} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          {FORMATOS.find((f) => f.id === formato)?.icon} {formato}
                        </div>
                        <img src={img.url} alt={`Imagem ${formato}`} style={{ width: "100%", borderRadius: 10, border: "1px solid #2a2a32" }} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <a href={img.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "7px 12px", borderRadius: 8, fontSize: 12, textAlign: "center", background: "#0e0e11", border: "1px solid #2a2a32", color: "#888", textDecoration: "none" }}>Abrir</a>
                          <button onClick={() => copiar(img.url, `img-${formato}`)} style={{ flex: 1, padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", background: copiado === `img-${formato}` ? "#1a2a1a" : "#0e0e11", border: `1px solid ${copiado === `img-${formato}` ? "#3a6a3a" : "#2a2a32"}`, color: copiado === `img-${formato}` ? "#5a9e6f" : "#888" }}>
                            {copiado === `img-${formato}` ? "✓ URL copiada" : "Copiar URL"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {abaCampanha === "briefing" && (
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.75, fontSize: 14, color: "#c8c4be" }}>{jobVisivel.briefing}</div>
                )}

                {abaCampanha === "revisao" && (
                  <div>
                    <div style={{ marginBottom: 16, padding: "12px 16px", background: "#0e0e11", borderRadius: 8, border: "1px solid #2a2a32" }}>
                      <span style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>Score final</span>
                      <div style={{ fontSize: 28, fontWeight: 700, color: (jobVisivel.score || 0) >= 8 ? "#5a9e6f" : "#9e855a", marginTop: 4 }}>
                        {jobVisivel.score}<span style={{ fontSize: 16, fontWeight: 400, color: "#555" }}>/10</span>
                      </div>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.75, fontSize: 14, color: "#c8c4be" }}>{jobVisivel.notas_revisao}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a32; border-radius: 2px; }
        textarea::placeholder { color: #333; }
      `}</style>
    </div>
  );
}
