'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Inbox, Bell, Zap, Search } from 'lucide-react';
import { GlobalSearch } from '@/components/search/global-search';
import { ProfileMenu } from '@/components/layout/profile-menu';
import { useStudio } from '@/lib/studio-context';

export function Topbar() {
  const { notificaciones } = useStudio();
  const sinLeer = notificaciones.filter(n => !n.leida).length;
  // Un solo disparador para las dos cosas (antes había dos pills contiguos que
  // abrían el mismo modal: éste y el propio botón "Buscar" de GlobalSearch).
  // El buscador ya sabe resolver tareas; este botón solo lo abre. Existe porque
  // ⌘K no lo descubre quien no sabe que existe, y el objetivo es justamente que
  // alguien sin formación encuentre las cosas el primer día.
  const [lanzadorAbierto, setLanzadorAbierto] = useState(false);

  return (
    <div className="hidden lg:flex sticky top-0 z-10 items-center justify-between h-14 px-4 -mx-4 mb-2 bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 flex-1 max-w-md">
        <button
          onClick={() => setLanzadorAbierto(true)}
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-semibold hover:brightness-95 transition-all w-full"
        >
          <Zap size={14} aria-hidden="true" className="shrink-0" />
          <Search size={14} aria-hidden="true" className="shrink-0 opacity-70" />
          <span className="flex-1 text-left">¿Qué quieres hacer o buscar?</span>
          <kbd className="text-[10px] px-1.5 py-0.5 rounded font-mono leading-none bg-white/15 text-white/70">⌘K</kbd>
        </button>
        <GlobalSearch
          variant="light"
          renderTrigger={false}
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
