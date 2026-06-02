"use client";

import { useState, useEffect, useRef } from "react";

// ─── TIPOS ───────────────────────────────────────────────
type Formato = "instagram" | "email" | "whatsapp" | "stories";

interface Campanha {
  id: string;
  tema: string;
  formatos: Formato[];
  score: number;
  aprovado: boolean;
  briefing: string;
  conteudo_final: string;
  notas_revisao: string;
  tentativas: number;
  duracao_segundos: number;
  criado_em: string;
  clinica_id?: string;
}

const FORMATOS: { id: Formato; label: string; icon: string }[] = [
  { id: "instagram", label: "Instagram", icon: "📸" },
  { id: "email", label: "E-mail", icon: "✉️" },
  { id: "whatsapp", label: "WhatsApp", icon: "💬" },
  { id: "stories", label: "Stories", icon: "🎞️" },
];

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────
export default function AgenteMktPage() {
  const [tema, setTema] = useState("");
  const [formatos, setFormatos] = useState<Formato[]>(["instagram", "email", "whatsapp"]);
  const [loading, setLoading] = useState(false);
  const [etapa, setEtapa] = useState<"pesquisando" | "escrevendo" | "revisando" | null>(null);
  const [campanha, setCampanha] = useState<Campanha | null>(null);
  const [historico, setHistorico] = useState<Campanha[]>([]);
  const [abaCampanha, setAbaCampanha] = useState<"conteudo" | "briefing" | "revisao">("conteudo");
  const [abaHistorico, setAbaHistorico] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const etapaRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    carregarHistorico();
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

  async function gerarCampanha() {
    if (!tema.trim() || loading) return;
    setLoading(true);
    setErro(null);
    setCampanha(null);

    // Simula progressão de etapas
    setEtapa("pesquisando");
    etapaRef.current = setTimeout(() => setEtapa("escrevendo"), 20000);
    setTimeout(() => setEtapa("revisando"), 60000);

    try {
      const res = await fetch("/api/agente-mkt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema, formatos }),
      });

      if (etapaRef.current) clearTimeout(etapaRef.current);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro desconhecido");

      setCampanha(data);
      setAbaCampanha("conteudo");
      await carregarHistorico();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setLoading(false);
      setEtapa(null);
    }
  }

  async function copiar(texto: string, id: string) {
    await navigator.clipboard.writeText(texto);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 2000);
  }

  function baixarJSON(c: Campanha) {
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campanha_${c.tema.replace(/\s+/g, "_")}_${c.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const campanhaAtiva = abaHistorico
    ? historico.find((c) => c.id === abaHistorico) || campanha
    : campanha;

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", minHeight: "100vh", background: "#0e0e11", color: "#e8e6e1" }}>

      {/* HEADER */}
      <div style={{ borderBottom: "1px solid #1e1e24", padding: "20px 32px", display: "flex", alignItems: "center", gap: 12, background: "#0e0e11" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #7C5CBF, #4f8ef7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✦</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.2px" }}>Agente de Marketing</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 1 }}>LeadSim Beauty — IA multi-agente</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {["Pesquisador", "Copywriter", "Revisor"].map((a, i) => (
            <span key={a} style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 20,
              background: loading && (
                (i === 0 && etapa === "pesquisando") ||
                (i === 1 && etapa === "escrevendo") ||
                (i === 2 && etapa === "revisando")
              ) ? "#7C5CBF22" : "#1a1a20",
              border: `1px solid ${loading && (
                (i === 0 && etapa === "pesquisando") ||
                (i === 1 && etapa === "escrevendo") ||
                (i === 2 && etapa === "revisando")
              ) ? "#7C5CBF" : "#2a2a32"}`,
              color: loading && (
                (i === 0 && etapa === "pesquisando") ||
                (i === 1 && etapa === "escrevendo") ||
                (i === 2 && etapa === "revisando")
              ) ? "#a68fe0" : "#555",
              transition: "all 0.4s"
            }}>{a}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", minHeight: "calc(100vh - 65px)" }}>

        {/* SIDEBAR ESQUERDA */}
        <div style={{ borderRight: "1px solid #1e1e24", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* FORM */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: "#555", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Tema da campanha</label>
              <textarea
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                placeholder="ex: bioestimuladores para rejuvenescimento facial..."
                rows={3}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "#16161c", border: "1px solid #2a2a32",
                  borderRadius: 10, padding: "12px 14px",
                  color: "#e8e6e1", fontSize: 14, resize: "none",
                  outline: "none", lineHeight: 1.5,
                  fontFamily: "inherit",
                }}
                onFocus={(e) => e.target.style.borderColor = "#7C5CBF"}
                onBlur={(e) => e.target.style.borderColor = "#2a2a32"}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#555", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 10 }}>Formatos</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {FORMATOS.map((f) => (
                  <button key={f.id} onClick={() => toggleFormato(f.id)} style={{
                    padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                    background: formatos.includes(f.id) ? "#7C5CBF22" : "#16161c",
                    border: `1px solid ${formatos.includes(f.id) ? "#7C5CBF" : "#2a2a32"}`,
                    color: formatos.includes(f.id) ? "#a68fe0" : "#666",
                    transition: "all 0.2s",
                  }}>
                    {f.icon} {f.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={gerarCampanha}
              disabled={loading || !tema.trim()}
              style={{
                padding: "13px", borderRadius: 10, fontWeight: 600, fontSize: 14,
                cursor: loading || !tema.trim() ? "not-allowed" : "pointer",
                background: loading || !tema.trim() ? "#1a1a20" : "linear-gradient(135deg, #7C5CBF, #4f8ef7)",
                border: "none", color: loading || !tema.trim() ? "#444" : "#fff",
                transition: "all 0.2s", letterSpacing: "-0.2px",
              }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #666", borderTopColor: "#a68fe0", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  {etapa === "pesquisando" ? "Pesquisando mercado..." : etapa === "escrevendo" ? "Gerando conteúdo..." : "Revisando..."}
                </span>
              ) : "✦ Gerar Campanha"}
            </button>

            {erro && (
              <div style={{ padding: "10px 14px", background: "#2a1515", border: "1px solid #5a2020", borderRadius: 8, fontSize: 13, color: "#e07070" }}>
                ⚠️ {erro}
              </div>
            )}
          </div>

          {/* HISTÓRICO */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
              Histórico ({historico.length})
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {historico.length === 0 && (
                <div style={{ fontSize: 13, color: "#333", textAlign: "center", paddingTop: 20 }}>Nenhuma campanha ainda</div>
              )}
              {historico.map((c) => (
                <button key={c.id} onClick={() => { setAbaHistorico(c.id); setCampanha(null); }} style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                  background: abaHistorico === c.id ? "#16161c" : "transparent",
                  border: `1px solid ${abaHistorico === c.id ? "#2a2a32" : "transparent"}`,
                  color: "inherit", transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#ccc", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.tema}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: c.score >= 8 ? "#5a9e6f" : "#9e855a" }}>★ {c.score}/10</span>
                    <span style={{ fontSize: 11, color: "#444" }}>
                      {new Date(c.criado_em).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ÁREA PRINCIPAL */}
        <div style={{ padding: "28px 32px", overflowY: "auto" }}>

          {!campanhaAtiva && !loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, opacity: 0.4 }}>
              <div style={{ fontSize: 48 }}>✦</div>
              <div style={{ fontSize: 15, color: "#555" }}>Informe um tema e gere sua primeira campanha</div>
            </div>
          )}

          {loading && !campanhaAtiva && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20 }}>
              <div style={{ position: "relative", width: 60, height: 60 }}>
                <div style={{ position: "absolute", inset: 0, border: "2px solid #1e1e24", borderTopColor: "#7C5CBF", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                <div style={{ position: "absolute", inset: 8, border: "2px solid #1e1e24", borderTopColor: "#4f8ef7", borderRadius: "50%", animation: "spin 1.5s linear infinite reverse" }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: "#ccc" }}>
                  {etapa === "pesquisando" ? "Pesquisador analisando o mercado" : etapa === "escrevendo" ? "Copywriter criando o conteúdo" : "Revisor garantindo a qualidade"}
                </div>
                <div style={{ fontSize: 13, color: "#444", marginTop: 6 }}>Isso leva ~3 minutos</div>
              </div>
            </div>
          )}

          {campanhaAtiva && (
            <div style={{ maxWidth: 780 }}>
              {/* HEADER DA CAMPANHA */}
              <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.4px", color: "#f0ede8" }}>{campanhaAtiva.tema}</h1>
                  <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: campanhaAtiva.score >= 8 ? "#5a9e6f" : "#9e855a", fontWeight: 600 }}>★ {campanhaAtiva.score}/10</span>
                    <span style={{ fontSize: 12, color: "#444" }}>·</span>
                    <span style={{ fontSize: 12, color: "#444" }}>{campanhaAtiva.duracao_segundos}s</span>
                    <span style={{ fontSize: 12, color: "#444" }}>·</span>
                    <span style={{ fontSize: 12, color: "#444" }}>{campanhaAtiva.tentativas} tentativa{campanhaAtiva.tentativas > 1 ? "s" : ""} de revisão</span>
                    <span style={{ fontSize: 12, color: "#444" }}>·</span>
                    {campanhaAtiva.formatos.map((f) => (
                      <span key={f} style={{ fontSize: 11, padding: "2px 8px", background: "#16161c", border: "1px solid #2a2a32", borderRadius: 20, color: "#666" }}>
                        {FORMATOS.find((x) => x.id === f)?.icon} {f}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => copiar(campanhaAtiva.conteudo_final, "main")} style={{
                    padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                    background: copiado === "main" ? "#1a2a1a" : "#16161c",
                    border: `1px solid ${copiado === "main" ? "#3a6a3a" : "#2a2a32"}`,
                    color: copiado === "main" ? "#5a9e6f" : "#888",
                  }}>
                    {copiado === "main" ? "✓ Copiado" : "Copiar"}
                  </button>
                  <button onClick={() => baixarJSON(campanhaAtiva)} style={{
                    padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                    background: "#16161c", border: "1px solid #2a2a32", color: "#888",
                  }}>
                    ↓ JSON
                  </button>
                </div>
              </div>

              {/* ABAS */}
              <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "#16161c", borderRadius: 10, padding: 4 }}>
                {[
                  { id: "conteudo", label: "Conteúdo gerado" },
                  { id: "briefing", label: "Briefing de mercado" },
                  { id: "revisao", label: "Notas do revisor" },
                ].map((aba) => (
                  <button key={aba.id} onClick={() => setAbaCampanha(aba.id as any)} style={{
                    flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                    background: abaCampanha === aba.id ? "#0e0e11" : "transparent",
                    border: `1px solid ${abaCampanha === aba.id ? "#2a2a32" : "transparent"}`,
                    color: abaCampanha === aba.id ? "#ccc" : "#555",
                    transition: "all 0.15s", fontFamily: "inherit",
                  }}>
                    {aba.label}
                  </button>
                ))}
              </div>

              {/* CONTEÚDO DAS ABAS */}
              <div style={{
                background: "#16161c", border: "1px solid #1e1e24",
                borderRadius: 12, padding: "24px 28px",
                whiteSpace: "pre-wrap", lineHeight: 1.75,
                fontSize: 14, color: "#c8c4be",
                minHeight: 300,
              }}>
                {abaCampanha === "conteudo" && campanhaAtiva.conteudo_final}
                {abaCampanha === "briefing" && campanhaAtiva.briefing}
                {abaCampanha === "revisao" && (
                  <div>
                    <div style={{ marginBottom: 16, padding: "12px 16px", background: "#0e0e11", borderRadius: 8, border: "1px solid #2a2a32" }}>
                      <span style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>Score final</span>
                      <div style={{ fontSize: 28, fontWeight: 700, color: campanhaAtiva.score >= 8 ? "#5a9e6f" : "#9e855a", marginTop: 4 }}>
                        {campanhaAtiva.score}<span style={{ fontSize: 16, fontWeight: 400, color: "#555" }}>/10</span>
                      </div>
                    </div>
                    {campanhaAtiva.notas_revisao}
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
