'use client';

import { Sidebar } from '@/components/layout/sidebar';

// NOTE: Auth gate temporarily removed so external auditors can access the
// dashboard without credentials. Restore the useAuth() redirect before
// going to production.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FDFBFA' }}>
      <Sidebar />
      <main className="lg:pl-56 min-h-screen">
        <div className="pt-14 lg:pt-0 pb-20 lg:pb-0 max-w-[1280px] mx-auto px-4 lg:px-8 py-6 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
