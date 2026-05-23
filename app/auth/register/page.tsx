'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ nome: '', whatsapp: '', email: '', password: '' })
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })

    if (authError || !authData.user) {
      setError(authError?.message ?? 'Erro ao criar conta')
      setLoading(false)
      return
    }

    const { error: dbError } = await supabase.from('clinicas').insert({
      id: authData.user.id,
      nome: form.nome,
      whatsapp: form.whatsapp,
      plano: 'free',
    })

    if (dbError) {
      setError(dbError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  const fields: { label: string; name: keyof typeof form; type: string; placeholder: string }[] = [
    { label: 'Nome da Clínica',  name: 'nome',     type: 'text',     placeholder: 'Ex: Clínica Bella Vita'    },
    { label: 'WhatsApp',         name: 'whatsapp', type: 'tel',      placeholder: '(11) 99999-9999'           },
    { label: 'E-mail',           name: 'email',    type: 'email',    placeholder: 'clinica@exemplo.com'       },
    { label: 'Senha',            name: 'password', type: 'password', placeholder: 'Mínimo 6 caracteres'       },
  ]

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#0D0D0F' }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full blur-3xl opacity-[0.06]"
        style={{ background: 'radial-gradient(ellipse, #C9A84C 0%, transparent 70%)' }}
      />

      <div className="relative z-10 w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <p
            className="text-[10px] tracking-[0.4em] uppercase mb-2 font-light"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            Cadastre sua
          </p>
          <h1 className="font-serif text-4xl font-light tracking-wide leading-tight">
            <span style={{ color: '#F0EDE8' }}>LeadSim </span>
            <span style={{ color: '#C9A84C', letterSpacing: '0.18em', fontSize: '0.82em' }}>BEAUTY</span>
          </h1>
          <div
            className="mx-auto mt-4"
            style={{ width: 32, height: 1, background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)' }}
          />
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: '#1a1a1f',
            border: '1px solid rgba(201,168,76,0.15)',
          }}
        >
          <p
            className="text-center text-[11px] tracking-[0.22em] uppercase mb-8 font-light"
            style={{ color: '#888' }}
          >
            Nova clínica
          </p>

          <form onSubmit={handleRegister} className="space-y-5">

            {fields.map(field => (
              <div key={field.name}>
                <label
                  htmlFor={field.name}
                  className="block text-[11px] tracking-widest uppercase mb-2"
                  style={{ color: 'rgba(201,168,76,0.75)' }}
                >
                  {field.label}
                </label>
                <input
                  id={field.name}
                  type={field.type}
                  name={field.name}
                  value={form[field.name]}
                  onChange={handleChange}
                  required
                  placeholder={field.placeholder}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:opacity-20"
                  style={{
                    background: '#0D0D0F',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#F0EDE8',
                  }}
                  onFocus={e => (e.currentTarget.style.border = '1px solid rgba(201,168,76,0.5)')}
                  onBlur={e  => (e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)')}
                />
              </div>
            ))}

            {/* Erro */}
            {error && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#FCA5A5',
                }}
              >
                {error}
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3 text-sm font-medium tracking-[0.18em] uppercase transition-all mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#C9A84C', color: '#0D0D0F' }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#DDB95C' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#C9A84C' }}
            >
              {loading ? 'Cadastrando...' : 'Cadastrar Clínica'}
            </button>
          </form>
        </div>

        {/* Link login */}
        <p className="text-center mt-6 text-xs" style={{ color: '#888' }}>
          Já tem conta?{' '}
          <Link
            href="/auth/login"
            className="transition-opacity"
            style={{ color: '#C9A84C' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Entrar
          </Link>
        </p>

        {/* Rodapé */}
        <p
          className="text-center mt-10 text-[10px] tracking-widest uppercase"
          style={{ color: 'rgba(255,255,255,0.1)' }}
        >
          © {new Date().getFullYear()} LeadSim Beauty
        </p>
      </div>
    </main>
  )
}
