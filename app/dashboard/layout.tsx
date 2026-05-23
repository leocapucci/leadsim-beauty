import Sidebar from '@/components/dashboard/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#0A0A0D' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col" style={{ marginLeft: '260px' }}>
        {children}
      </div>
    </div>
  )
}
