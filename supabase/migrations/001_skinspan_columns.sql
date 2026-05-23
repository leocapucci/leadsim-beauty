-- ============================================================
-- Migration 001 — Skinspan Score™ IA columns
-- Execute no SQL Editor do Supabase antes de usar o endpoint /api/skinspan
-- ============================================================

ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS skinspan_data    JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS skinspan_history JSONB DEFAULT '[]'::jsonb;

-- Índice parcial para queries de pacientes com score calculado
CREATE INDEX IF NOT EXISTS idx_pacientes_skinspan
  ON pacientes((skinspan_data IS NOT NULL))
  WHERE skinspan_data IS NOT NULL;

-- Comentário documental
COMMENT ON COLUMN pacientes.skinspan_data IS
  'Último resultado da IA: {score, anos_diferenca, interpretacao, recomendacao}';
COMMENT ON COLUMN pacientes.skinspan_history IS
  'Array cronológico: [{score, anos_diferenca, data}] — máx 12 entradas';
