export type Plano = 'free' | 'starter' | 'pro' | 'enterprise'
export type Direcao = 'entrada' | 'saida'
export type StatusPlanoAura = 'ativo' | 'pausado' | 'concluido'
export type StatusBeautyClub = 'ativo' | 'inativo' | 'cancelado'
export type TierBeautyClub = 'silver' | 'gold' | 'platinum'

export interface Clinica {
  id: string
  nome: string
  whatsapp: string
  plano: Plano
  created_at: string
}

export interface Paciente {
  id: string
  clinica_id: string
  nome: string
  whatsapp: string
  skinspan_score: number | null
  created_at: string
}

export interface PlanoAura {
  id: string
  paciente_id: string
  mes: string
  tratamento: string
  status: StatusPlanoAura
  created_at: string
}

export interface MembroBeautyClub {
  id: string
  paciente_id: string
  tier: TierBeautyClub
  valor: number
  status: StatusBeautyClub
  created_at: string
}

export interface Mensagem {
  id: string
  clinica_id: string
  paciente_id: string
  conteudo: string
  direcao: Direcao
  created_at: string
}

// Supabase Database type for generic client typing
export interface Database {
  public: {
    Tables: {
      clinicas: { Row: Clinica; Insert: Omit<Clinica, 'created_at'>; Update: Partial<Clinica> }
      pacientes: { Row: Paciente; Insert: Omit<Paciente, 'id' | 'created_at'>; Update: Partial<Paciente> }
      planos_aura: { Row: PlanoAura; Insert: Omit<PlanoAura, 'id' | 'created_at'>; Update: Partial<PlanoAura> }
      membros_beautyclub: { Row: MembroBeautyClub; Insert: Omit<MembroBeautyClub, 'id' | 'created_at'>; Update: Partial<MembroBeautyClub> }
      mensagens: { Row: Mensagem; Insert: Omit<Mensagem, 'id' | 'created_at'>; Update: Partial<Mensagem> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
