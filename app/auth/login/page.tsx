'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message
      )
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4"
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
            Bem-vindo a
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
            Acesso à plataforma
          </p>

          <form onSubmit={handleLogin} className="space-y-5">

            {/* E-mail */}
            <div>
              <label
                htmlFor="email"
                className="block text-[11px] tracking-widest uppercase mb-2"
                style={{ color: 'rgba(201,168,76,0.75)' }}
              >
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="clinica@exemplo.com"
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

            {/* Senha */}
            <div>
              <label
                htmlFor="password"
                className="block text-[11px] tracking-widest uppercase mb-2"
                style={{ color: 'rgba(201,168,76,0.75)' }}
              >
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
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
              {loading ? 'Autenticando...' : 'Entrar'}
            </button>
          </form>
        </div>

        {/* Link cadastro */}
        <p className="text-center mt-6 text-xs" style={{ color: '#888' }}>
          Não tem conta?{' '}
          <Link
            href="/auth/register"
            className="transition-colors"
            style={{ color: '#C9A84C' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Cadastrar Clínica
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
