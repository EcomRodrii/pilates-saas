'use client';

import Link from 'next/link';
import { Maximize2, SquarePen, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCore } from '@/lib/core-context';
import { useRol } from '@/lib/permisos';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { VistaChat } from './vista-chat';
import { nuevaConversacion } from './use-asistente';

// La ventana del chat flotante (asistente-flotante.tsx): el MISMO chat de
// /asistente —misma conversación, mismo saldo, mismo servidor— en una ventana
// de 420 px sobre el botón. Es su propio chunk: no viaja con el panel.
export function PanelFlotante({ onCerrar }: { onCerrar: () => void }) {
  const rol = useRol();
  const { user } = useAuth();
  const { studio, instructores } = useCore();
  if (!studio) return null;
  const yo = instructores.find(i => i.authUserId === user?.id);
  const nombre = yo?.nombre?.trim().split(/\s+/)[0] ?? null;
  const boton = 'inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';
  return (
    <div
      role="dialog"
      aria-label="Pregúntale a Tentare"
      className="fixed bottom-[9.75rem] right-6 z-40 hidden h-[min(640px,calc(100dvh-12rem))] w-[420px] origin-bottom-right animate-sheet-pop-in flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl lg:flex"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border/60 pl-4 pr-2">
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">Pregúntale a Tentare</p>
        <button type="button" onClick={() => nuevaConversacion()} aria-label="Nueva conversación" className={boton}><SquarePen size={17} aria-hidden="true" /></button>
        <Link href="/asistente" onClick={onCerrar} aria-label="Abrir en pantalla completa" className={boton}><Maximize2 size={16} aria-hidden="true" /></Link>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className={boton}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="min-h-0 flex-1">
        <VistaChat flotante studioId={studio.id} veDinero={puedeVerFinanzas(rol)} nombre={nombre} preguntaInicial={null} />
      </div>
    </div>
  );
}
