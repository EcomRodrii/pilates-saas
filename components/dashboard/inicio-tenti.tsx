'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCore } from '@/lib/core-context';
import { useRol } from '@/lib/permisos';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { tomarPreguntaPendiente } from '@/lib/asistente-context';
import { useEstadoEstudio } from '@/lib/estado-estudio-cliente';

// Inicio es solo Tenti (25-nov-2026, decisión del fundador): la conversación de «Pregúntale a Tentare» a pantalla
// completa, sin tarjetas ni cifras. Es el MISMO chat que /asistente (mismo servidor, permisos y aislamiento por
// estudio). El chat llega por `dynamic`: no entra en el chunk de quien no lo ve.
//
// ⚠️ Lo que antes vivía en Inicio no se ha borrado: está entero en `/dashboard?vista=resumen`, con las tarjetas de
// «lo que espera tu visto bueno» (cobros, devoluciones, reservas por aprobar…). El enlace de arriba es navegación,
// y es la única forma de que algo pendiente no quede sin ver: no se quita sin dar otra.
const VistaChat = dynamic(() => import('@/components/asistente/vista-chat').then(m => m.VistaChat), { ssr: false });

export const HREF_RESUMEN = '/dashboard?vista=resumen';

export function InicioTenti() {
  const rol = useRol();
  const { user } = useAuth();
  const { studio, instructores } = useCore();
  const estado = useEstadoEstudio();
  const pendientes = estado ? estado.decidir.reduce((n, l) => n + l.n, 0) : 0;
  const [pregunta] = useState(() => tomarPreguntaPendiente());
  if (!studio) return null;
  const yo = instructores.find(i => i.authUserId === user?.id);
  const nombre = yo?.nombre?.trim().split(/\s+/)[0] ?? null;
  return (
    <div data-testid="inicio-tenti" data-tour="resumen-vista">
      <VistaChat studioId={studio.id} veDinero={puedeVerFinanzas(rol)} nombre={nombre} preguntaInicial={pregunta} />
      <Link
        href={HREF_RESUMEN}
        className="fixed right-3 top-[calc(env(safe-area-inset-top,0px)+3.5rem)] z-[36] inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted lg:right-6 lg:top-[calc(var(--panel-top,0.5rem)+4.75rem)] lg:z-30"
      >
        {pendientes > 0 ? `${pendientes} por decidir` : 'Resumen'}
        <ArrowUpRight size={14} aria-hidden />
      </Link>
    </div>
  );
}
