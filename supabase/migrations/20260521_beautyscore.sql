-- Módulo 10: BeautyScore™ Semanal
-- Rodar no Supabase SQL Editor

ALTER TABLE clinicas
  ADD COLUMN IF NOT EXISTS beautyscore_history JSONB DEFAULT '[]'::jsonb;
