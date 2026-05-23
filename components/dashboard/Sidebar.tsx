'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// ── Icons ──────────────────────────────────────────────────────────────────

function IconGrid() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}
function IconUsers() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function IconStar() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}
function IconSparkle() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  )
}
function IconBio() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  )
}
function IconBeautyAI() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
      <path d="M9 13.5c1 1 5 1 6 0" />
    </svg>
  )
}
function IconMegaphone() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
  )
}
function IconRefresh() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}
function IconStack() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 22 8.5 12 15 2 8.5 12 2" />
      <polyline points="2 15 12 21.5 22 15" />
      <polyline points="2 11.5 12 18 22 11.5" />
    </svg>
  )
}
function IconEye() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
function IconSkinspan() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconMessage() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
function IconLogout() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}

// ── Nav items ──────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Dashboard',      href: '/dashboard',                icon: IconGrid,     exact: true },
  { label: 'Pacientes',      href: '/dashboard/pacientes',      icon: IconUsers,    exact: false },
  { label: 'Beauty Club',    href: '/dashboard/beautyclub',     icon: IconStar,     exact: false },
  { label: 'Plano Aura',     href: '/dashboard/plano-aura',     icon: IconSparkle,  exact: false },
  { label: 'Aura Bio',       href: '/dashboard/aura-bio',       icon: IconBio,      exact: false },
  { label: 'Aura Stack',     href: '/dashboard/aura-stack',     icon: IconStack,     exact: false },
  { label: 'Skinspan Score', href: '/dashboard/skinspan',       icon: IconSkinspan,  exact: false },
  { label: 'BeautyPreview', href: '/dashboard/beautypreview',  icon: IconEye,       exact: false },
  { label: 'BeautyCast',    href: '/dashboard/beautycast',     icon: IconMegaphone, exact: false },
  { label: 'Reativação',    href: '/dashboard/reativacao',     icon: IconRefresh,   exact: false },
  { label: 'BeautyAI',      href: '/dashboard/beautyai',       icon: IconBeautyAI,  exact: false },
  { label: 'Mensagens',      href: '/dashboard/mensagens',      icon: IconMessage,  exact: false },
  { label: 'Configurações',  href: '/dashboard/configuracoes',  icon: IconSettings, exact: false },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const [clinicName, setClinicName] = useState<string>('')
  const [initials,   setInitials]   = useState<string>('LB')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('clinicas')
        .select('nome')
        .eq('id', user.id)
        .single()

      const name = data?.nome ?? user.email ?? 'Clínica'
      setClinicName(name)
      setInitials(
        name
          .split(' ')
          .slice(0, 2)
          .map((w: string) => w[0])
          .join('')
          .toUpperCase()
      )
    }
    load()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  return (
    <aside
      className="fixed top-0 left-0 h-screen w-[260px] flex flex-col z-40 select-none"
      style={{
        backgroundColor: '#0D0D12',
        borderRight: '1px solid rgba(196,163,90,0.1)',
      }}
    >
      {/* ── Logo ── */}
      <div className="px-7 pt-8 pb-6">
        <p className="font-serif text-3xl tracking-[0.12em] leading-none" style={{ color: '#C4A35A' }}>
          LeadSim
        </p>
        <p
          className="font-serif text-[11px] font-light tracking-[0.4em] uppercase mt-0.5"
          style={{ color: 'rgba(196,163,90,0.5)' }}
        >
          Beauty
        </p>
        {/* ornamental line */}
        <div className="flex items-center gap-2 mt-4">
          <span className="h-px flex-1 block" style={{ background: 'rgba(196,163,90,0.18)' }} />
          <span className="w-1 h-1 rounded-full block" style={{ background: 'rgba(196,163,90,0.4)' }} />
          <span className="h-px flex-1 block" style={{ background: 'rgba(196,163,90,0.18)' }} />
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ label, href, icon: Icon, exact }) => {
          const active = isActive(href, exact)
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-150 relative"
              style={{
                color: active ? '#C4A35A' : 'rgba(255,255,255,0.38)',
                background: active ? 'rgba(196,163,90,0.08)' : 'transparent',
              }}
              onMouseEnter={e => {
                if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.65)'
              }}
              onMouseLeave={e => {
                if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.38)'
              }}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                  style={{ background: '#C4A35A' }}
                />
              )}
              <Icon />
              <span className="font-light tracking-wide">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="px-5 pb-6 pt-4">
        <div className="h-px mb-4" style={{ background: 'rgba(196,163,90,0.1)' }} />

        {/* Avatar + name */}
        <div className="flex items-center gap-3 mb-3 px-1">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-serif text-xs font-medium"
            style={{ background: 'rgba(196,163,90,0.15)', color: '#C4A35A', border: '1px solid rgba(196,163,90,0.25)' }}
          >
            {initials}
          </div>
          <span
            className="text-xs font-light truncate flex-1"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            {clinicName || '—'}
          </span>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs tracking-wide transition-all duration-150"
          style={{ color: 'rgba(239,68,68,0.55)' }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'rgba(239,68,68,0.85)'
            e.currentTarget.style.background = 'rgba(239,68,68,0.06)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(239,68,68,0.55)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <IconLogout />
          <span>Sair da conta</span>
        </button>
      </div>
    </aside>
  )
}
