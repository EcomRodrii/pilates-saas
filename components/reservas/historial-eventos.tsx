'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/db/supabase';
import { cn } from '@/lib/utils';

interface EventoReserva {
  id: number;
  reserva_id: string;
  ocurrido_en: string;
  operacion: 'INSERT' | 'UPDATE' | 'DELETE';
  actor_tipo: 'STAFF' | 'SOCIA' | 'SISTEMA' | 'DESCONOCIDO';
  actor_rol: string | null;
  origen: 'PANEL' | 'PORTAL' | 'SERVIDOR';
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}

interface HistorialEventosProps {
  socioId?: string;
  sesionId?: string;
  className?: string;
}

function esEventoReserva(valor: unknown): valor is EventoReserva {
  if (typeof valor !== 'object' || valor === null) return false;
  const evento = valor as Partial<EventoReserva>;
  return Number.isSafeInteger(evento.id)
    && typeof evento.reserva_id === 'string'
    && typeof evento.ocurrido_en === 'string'
    && Number.isFinite(Date.parse(evento.ocurrido_en))
    && ['INSERT', 'UPDATE', 'DELETE'].includes(evento.operacion ?? '')
    && ['STAFF', 'SOCIA', 'SISTEMA', 'DESCONOCIDO'].includes(evento.actor_tipo ?? '')
    && ['PANEL', 'PORTAL', 'SERVIDOR'].includes(evento.origen ?? '');
}

function estadoLegible(valor: unknown): string {
  if (typeof valor !== 'string') return '—';
  const estados: Record<string, string> = {
    CONFIRMADA: 'Confirmada', ASISTIDA: 'Asistió', NO_ASISTIO: 'No asistió',
    CANCELADA: 'Cancelada', LISTA_ESPERA: 'Lista de espera', PENDIENTE_APROBACION: 'Pendiente de aprobación',
  };
  return estados[valor] ?? valor;
}

function resumen(e: EventoReserva): string {
  if (e.operacion === 'INSERT') return `Reserva creada · ${estadoLegible(e.despues?.estado)}`;
  if (e.operacion === 'DELETE') return `Reserva eliminada · ${estadoLegible(e.antes?.estado)}`;
  const cambios: string[] = [];
  if (e.antes?.estado !== e.despues?.estado) {
    cambios.push(`${estadoLegible(e.antes?.estado)} → ${estadoLegible(e.despues?.estado)}`);
  }
  if (e.antes?.check_in_en !== e.despues?.check_in_en) {
    cambios.push(e.despues?.check_in_en ? 'Check-in marcado' : 'Check-in deshecho');
  }
  if (e.antes?.spot_id !== e.despues?.spot_id) cambios.push('Plaza cambiada');
  if (e.antes?.posicion_espera !== e.despues?.posicion_espera) cambios.push('Posición de espera cambiada');
  return cambios.join(' · ') || 'Reserva actualizada';
}

function actorLegible(e: EventoReserva): string {
  if (e.actor_tipo === 'SISTEMA') return 'Sistema';
  if (e.actor_tipo === 'SOCIA') return 'Alumna';
  if (e.actor_rol === 'PROPIETARIO') return 'Propietaria';
  if (e.actor_rol === 'MANAGER') return 'Manager';
  if (e.actor_rol === 'RECEPCION') return 'Recepción';
  if (e.actor_rol === 'INSTRUCTOR') return 'Instructora';
  return 'Equipo';
}

export function HistorialEventosReservas({ socioId, sesionId, className }: HistorialEventosProps) {
  const [eventos, setEventos] = useState<EventoReserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    void Promise.all([
      (async () => {
        let query = supabase.from('reservas_eventos')
          .select('id, reserva_id, ocurrido_en, operacion, actor_tipo, actor_rol, origen, antes, despues')
          .order('id', { ascending: false }).limit(30);
        if (socioId) query = query.eq('socio_id', socioId);
        if (sesionId) query = query.eq('sesion_id', sesionId);
        return query;
      })(),
    ]).then(([resultado]) => {
      if (!vivo) return;
      if (resultado.error) setError(true);
      else {
        setError(false);
        // Algunos consumidores E2E interceptan `reservas**` y responden con
        // filas de `reservas`; descartar esos datos evita que una fecha ausente
        // en una respuesta inesperada derribe toda la pantalla.
        const filas = Array.isArray(resultado.data) ? resultado.data : [];
        setEventos(filas.filter(esEventoReserva));
      }
    }).catch(() => { if (vivo) setError(true); }).finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [socioId, sesionId]);

  return (
    <section className={cn('rounded-xl border border-border bg-card p-4', className)} aria-label="Historial de reservas y asistencia">
      <h3 className="text-sm font-bold text-foreground">Historial de reservas y asistencia</h3>
      {cargando ? <p className="mt-2 text-xs text-muted-foreground">Cargando…</p>
        : error ? <p className="mt-2 text-xs text-muted-foreground">No se ha podido cargar el historial.</p>
          : eventos.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Aún no hay cambios registrados.</p>
            : <ol className="mt-3 divide-y divide-border">
              {eventos.map(e => (
                <li key={e.id} className="py-2 first:pt-0 last:pb-0">
                  <p className="text-[13px] font-medium text-foreground">{resumen(e)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(e.ocurrido_en))}
                    {' · '}{actorLegible(e)}
                  </p>
                </li>
              ))}
            </ol>}
    </section>
  );
}
