'use client';

import { Sidebar } from '@/components/layout/sidebar';

// NOTE: Auth gate temporarily removed so external auditors can access the
// dashboard without credentials. Restore the useAuth() redirect before
// going to production.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-[256px] min-h-screen">
        <div className="pt-14 lg:pt-2 pb-20 lg:pb-0 max-w-[1320px] mx-auto px-4 lg:px-6 py-6 lg:py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
