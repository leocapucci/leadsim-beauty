-- ============================================================
-- LeadSim Beauty — Schema inicial do Supabase
-- Execute este arquivo no SQL Editor do seu projeto Supabase
-- ============================================================

-- Habilitar extensão de UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELA: clinicas
-- Representa cada clínica de estética cadastrada na plataforma
-- ============================================================
CREATE TABLE IF NOT EXISTS clinicas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        TEXT NOT NULL,
  whatsapp    TEXT NOT NULL,
  plano       TEXT NOT NULL DEFAULT 'free' CHECK (plano IN ('free', 'starter', 'pro', 'enterprise')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: pacientes
-- Pacientes associados a uma clínica
-- ============================================================
CREATE TABLE IF NOT EXISTS pacientes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinica_id      UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  whatsapp        TEXT NOT NULL,
  skinspan_score  INTEGER CHECK (skinspan_score BETWEEN 0 AND 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pacientes_clinica ON pacientes(clinica_id);

-- ============================================================
-- TABELA: planos_aura
-- Planos mensais de tratamento personalizados (Plano Aura)
-- ============================================================
CREATE TABLE IF NOT EXISTS planos_aura (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id  UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  mes          TEXT NOT NULL,             -- formato: "YYYY-MM"
  tratamento   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ativo'
                 CHECK (status IN ('ativo', 'pausado', 'concluido')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planos_aura_paciente ON planos_aura(paciente_id);

-- ============================================================
-- TABELA: membros_beautyclub
-- Programa de fidelidade Beauty Club
-- ============================================================
CREATE TABLE IF NOT EXISTS membros_beautyclub (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id  UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  tier         TEXT NOT NULL DEFAULT 'silver'
                 CHECK (tier IN ('silver', 'gold', 'platinum')),
  valor        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'ativo'
                 CHECK (status IN ('ativo', 'inativo', 'cancelado')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beautyclub_paciente ON membros_beautyclub(paciente_id);

-- ============================================================
-- TABELA: mensagens
-- Histórico de mensagens trocadas via WhatsApp
-- ============================================================
CREATE TABLE IF NOT EXISTS mensagens (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinica_id   UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  paciente_id  UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  conteudo     TEXT NOT NULL,
  direcao      TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensagens_clinica   ON mensagens(clinica_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_paciente  ON mensagens(paciente_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Cada clínica só acessa seus próprios dados
-- ============================================================
ALTER TABLE clinicas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pacientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE planos_aura       ENABLE ROW LEVEL SECURITY;
ALTER TABLE membros_beautyclub ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens         ENABLE ROW LEVEL SECURITY;

-- clinicas: usuário só vê/edita a própria clínica
CREATE POLICY "clinica_owner" ON clinicas
  FOR ALL USING (id = auth.uid());

-- pacientes: acesso pela clinica_id do usuário autenticado
CREATE POLICY "pacientes_by_clinica" ON pacientes
  FOR ALL USING (clinica_id = auth.uid());

-- planos_aura: acesso via paciente da clínica
CREATE POLICY "planos_by_clinica" ON planos_aura
  FOR ALL USING (
    paciente_id IN (
      SELECT id FROM pacientes WHERE clinica_id = auth.uid()
    )
  );

-- membros_beautyclub: acesso via paciente da clínica
CREATE POLICY "beautyclub_by_clinica" ON membros_beautyclub
  FOR ALL USING (
    paciente_id IN (
      SELECT id FROM pacientes WHERE clinica_id = auth.uid()
    )
  );

-- mensagens: acesso direto por clinica_id
CREATE POLICY "mensagens_by_clinica" ON mensagens
  FOR ALL USING (clinica_id = auth.uid());
