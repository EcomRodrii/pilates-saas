'use client';

import { Clock } from 'lucide-react';
import { cuandoEstudio } from '@/lib/utils';
import type { EventoHistorial } from '@/lib/calendario-historial';

// Rediseño del Calendario — punto 5, pestaña "Sustituciones" (antes
// "Historial" — renombrada, pilar 6: el nombre viejo prometía un historial
// general de asistencia que esto nunca fue). Ámbito acotado a
// cobertura/instructora (ver lib/calendario-historial.ts) — no un log
// genérico de todo lo que le ha pasado a la sesión.
export function HistorialSesion({ eventos }: { eventos: EventoHistorial[] }) {
  if (eventos.length === 0) {
    return <div className="py-8 text-center"><p className="text-sm text-muted-foreground">Sin incidencias de cobertura en esta clase</p></div>;
  }

  return (
    <ul className="space-y-3">
      {eventos.map(e => (
        <li key={e.id} className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Clock size={12} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">{e.texto}</p>
            {/* Fecha completa, no solo la hora: una sustitución puede abrirse
                días antes de la clase — "08:00" a secas sería ambiguo. */}
            <p className="text-[10.5px] text-muted-foreground">{cuandoEstudio(e.fecha)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
