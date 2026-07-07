'use client';

import Link from 'next/link';
import { Inbox, Bell } from 'lucide-react';
import { GlobalSearch } from '@/components/search/global-search';
import { useStudio } from '@/lib/studio-context';

export function Topbar() {
  const { notificaciones } = useStudio();
  const sinLeer = notificaciones.filter(n => !n.leida).length;

  return (
    <div className="hidden lg:flex sticky top-0 z-10 items-center justify-between h-14 px-4 -mx-4 mb-2 bg-background/80 backdrop-blur-sm">
      <GlobalSearch variant="light" />
      <div className="flex items-center gap-1.5">
        <Link
          href="/mensajeria"
          title="Mensajería"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#EEEEE8] text-[#5A5A52] transition-colors"
        >
          <Inbox size={16} />
        </Link>
        <Link
          href="/notificaciones"
          title="Notificaciones"
          className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#EEEEE8] text-[#5A5A52] transition-colors"
        >
          <Bell size={16} />
          {sinLeer > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#C4695A]" />
          )}
        </Link>
      </div>
    </div>
  );
}
