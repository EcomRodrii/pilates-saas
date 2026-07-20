'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Inbox, Bell, Zap } from 'lucide-react';
import { GlobalSearch } from '@/components/search/global-search';
import { ProfileMenu } from '@/components/layout/profile-menu';
import { useStudio } from '@/lib/studio-context';

export function Topbar() {
  const { notificaciones } = useStudio();
  const sinLeer = notificaciones.filter(n => !n.leida).length;
  // El buscador ya sabe resolver tareas; este botón solo lo abre. Existe porque
  // ⌘K no lo descubre quien no sabe que existe, y el objetivo es justamente que
  // alguien sin formación encuentre las cosas el primer día.
  const [lanzadorAbierto, setLanzadorAbierto] = useState(false);

  return (
    <div className="hidden lg:flex sticky top-0 z-10 items-center justify-between h-14 px-4 -mx-4 mb-2 bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setLanzadorAbierto(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-semibold hover:brightness-95 transition-all"
        >
          <Zap size={14} aria-hidden="true" />
          ¿Qué quieres hacer?
        </button>
        <GlobalSearch
          variant="light"
          abierto={lanzadorAbierto}
          onAbiertoChange={setLanzadorAbierto}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Link
          href="/mensajeria"
          title="Mensajería"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-background text-muted-foreground transition-colors"
        >
          <Inbox size={16} />
        </Link>
        <Link
          href="/notificaciones"
          title="Notificaciones"
          className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-background text-muted-foreground transition-colors"
        >
          <Bell size={16} />
          {sinLeer > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#C4695A]" />
          )}
        </Link>
        <ProfileMenu />
      </div>
    </div>
  );
}
