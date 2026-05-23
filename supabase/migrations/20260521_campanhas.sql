-- Módulo 9: Reativação Preditiva + BeautyCast
-- Rodar no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS campanhas (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id    UUID        REFERENCES clinicas(id) ON DELETE CASCADE,
  nome          TEXT        NOT NULL,
  publico       TEXT        NOT NULL,
  mensagem      TEXT        NOT NULL,
  status        TEXT        DEFAULT 'rascunho',
  agendado_para TIMESTAMPTZ,
  total_enviado INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campanhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinica_owns_campanhas" ON campanhas
  FOR ALL USING (clinica_id = auth.uid());
