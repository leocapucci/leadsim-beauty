import Link from 'next/link'

export default function HomePage() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: '#0D0D0F' }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full blur-3xl opacity-[0.07]"
        style={{ background: 'radial-gradient(ellipse, #C9A84C 0%, transparent 70%)' }}
      />

      <div className="text-center max-w-lg relative">

        {/* Logo */}
        <div className="mb-10">
          <p
            className="text-[11px] tracking-[0.35em] uppercase mb-3 font-light"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            Bem-vindo a
          </p>
          <h1 className="font-serif text-5xl font-light tracking-wide leading-tight">
            <span style={{ color: '#F0EDE8' }}>LeadSim </span>
            <span
              style={{
                color: '#C9A84C',
                letterSpacing: '0.18em',
                fontSize: '0.85em',
              }}
            >
              BEAUTY
            </span>
          </h1>
        </div>

        {/* Divider */}
        <div
          className="mx-auto mb-8"
          style={{
            width: 40,
            height: 1,
            background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)',
          }}
        />

        {/* Tagline */}
        <p
          className="text-base font-light leading-relaxed mb-12 tracking-wide"
          style={{ color: 'rgba(255,255,255,0.42)' }}
        >
          Inteligência estratégica para clínicas de estética premium.
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/auth/login"
            className="px-8 py-3 rounded-xl text-sm font-medium tracking-widest uppercase transition-all"
            style={{
              background: '#C9A84C',
              color: '#0D0D0F',
              letterSpacing: '0.12em',
            }}
            onMouseEnter={undefined}
          >
            Entrar
          </Link>
          <Link
            href="/auth/register"
            className="px-8 py-3 rounded-xl text-sm font-medium tracking-widest uppercase transition-all"
            style={{
              background: 'transparent',
              border: '1px solid rgba(201,168,76,0.45)',
              color: '#C9A84C',
              letterSpacing: '0.12em',
            }}
          >
            Cadastrar Clínica
          </Link>
        </div>

      </div>

      {/* Footer */}
      <p
        className="absolute bottom-8 text-[10px] tracking-widest uppercase"
        style={{ color: 'rgba(255,255,255,0.12)' }}
      >
        LeadSim Beauty © {new Date().getFullYear()}
      </p>
    </main>
  )
}
