// TEMPORARY DEBUG PAGE — remove after confirming env vars are working
export default function DebugPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  return (
    <div style={{ fontFamily: 'monospace', padding: 32, background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h1 style={{ color: '#C4A35A', marginBottom: 24 }}>Env Var Debug</h1>

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          <tr>
            <td style={{ padding: '8px 16px 8px 0', color: '#aaa' }}>NEXT_PUBLIC_SUPABASE_URL</td>
            <td style={{ padding: '8px 0', color: url ? '#4ade80' : '#f87171' }}>
              {url ? `✓ defined — "${url.slice(0, 30)}..."` : '✗ undefined'}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '8px 16px 8px 0', color: '#aaa' }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</td>
            <td style={{ padding: '8px 0', color: key ? '#4ade80' : '#f87171' }}>
              {key ? `✓ defined — "${key.slice(0, 20)}..."` : '✗ undefined'}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ marginTop: 32, color: '#666', fontSize: 12 }}>
        Rendered at: {new Date().toISOString()}
        {' | '}
        Runtime: {typeof window === 'undefined' ? 'server' : 'client'}
      </p>
    </div>
  )
}
