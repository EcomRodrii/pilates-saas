'use client';

// La pestaña «Tentare» del panel de ayuda: el chat del asistente DENTRO del panel, el mismo
// de /asistente (misma conversación, mismo saldo, mismo servidor). Es su propio chunk: no
// viaja hasta que alguien abre la pestaña (lo mide `e2e/asistente-flotante.spec.ts`).
//
// Es el sitio donde vive Tenti dentro del panel de ayuda (fundador, 11-nov-2026: «lo de
// Tenti esté dentro» de un solo botón). La pestaña «Mensajes», la de la persona, va sin él.

import { useEffect } from 'react';
import Link from 'next/link';
import { Maximize2, SquarePen } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCore } from '@/lib/core-context';
import { useRol } from '@/lib/permisos';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { VistaChat } from '@/components/asistente/vista-chat';
import { nuevaConversacion } from '@/components/asistente/use-asistente';

export function PestanaTentare({ pregunta, onConsumida, onCerrar }: {
  /** La que se escribió en Inicio: se envía al montar, una vez. */
  pregunta: string | null;
  onConsumida: () => void;
  onCerrar: () => void;
}) {
  const rol = useRol();
  const { user } = useAuth();
  const { studio, instructores } = useCore();
  // Se avisa a quien la guardó para que no vuelva a enviarla al volver a esta pestaña.
  useEffect(() => { if (pregunta) onConsumida(); }, [pregunta, onConsumida]);
  if (!studio) return null;
  const yo = instructores.find(i => i.authUserId === user?.id);
  const nombre = yo?.nombre?.trim().split(/\s+/)[0] ?? null;
  const boton = 'inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border/60 pl-4 pr-12">
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">Pregúntale a Tentare</p>
        <button type="button" onClick={() => nuevaConversacion()} aria-label="Nueva conversación" className={boton}><SquarePen size={17} aria-hidden="true" /></button>
        <Link href="/asistente" onClick={onCerrar} aria-label="Abrir en pantalla completa" className={boton}><Maximize2 size={16} aria-hidden="true" /></Link>
      </header>
      <div className="min-h-0 flex-1">
        <VistaChat flotante studioId={studio.id} veDinero={puedeVerFinanzas(rol)} nombre={nombre} preguntaInicial={pregunta} />
      </div>
    </div>
  );
}
