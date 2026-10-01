'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useStudio } from '@/lib/studio-context';
import { decidirReservaNueva, plazasOcupadas } from '@/lib/booking-logic';
import { tieneEntitlementActivo } from '@/lib/bono-logic';
import { cn, hoyEnEstudio } from '@/lib/utils';
import type { Socio } from '@/lib/types';

// «Reservar» desde la ficha: apuntarla a una clase de los próximos 14 días sin
// salir de su ficha. La reserva la hace el servidor (`addReserva`, el mismo
// camino que el calendario), y aquí solo se pinta lo que confirma.
//
// Antes de pulsar ya se ve todo lo que importa: si la clase está llena (y en
// qué puesto de la lista de espera entraría), si ya la tiene reservada, y si su
// plan no la cubre — en ese caso no se ofrece: cobrarle una clase suelta se
// hace en el calendario, que es donde ese aviso ya existe con su cobro.

const DIAS = 14;
const ESTADOS_VIVOS = new Set(['CONFIRMADA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION', 'ASISTIDA']);

export function ReservarClase({ socio, lo = 'la', abierto, onCerrar, onHecho }: {
  socio: Socio;
  /** Pronombre «la» / «lo» (apuntarla / apuntarlo). */
  lo?: string;
  abierto: boolean;
  onCerrar: () => void;
  onHecho: (texto: string) => void;
}) {
  if (!abierto) return null;
  return <Contenido socio={socio} lo={lo} onCerrar={onCerrar} onHecho={onHecho} />;
}

function Contenido({ socio, lo, onCerrar, onHecho }: { socio: Socio; lo: string; onCerrar: () => void; onHecho: (texto: string) => void }) {
  const { sesiones, reservas, tiposClase, salas, instructores, suscripciones, planesTarifa, addReserva } = useStudio();
  // La hora se fija al abrir (React Compiler: nada de leer el reloj en render).
  const [ahora] = useState(() => new Date());
  const [elegida, setElegida] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoy = hoyEnEstudio(ahora);

  const clases = useMemo(() => {
    const desde = ahora.toISOString();
    const hasta = new Date(ahora.getTime() + DIAS * 86_400_000).toISOString();
    const suyas = new Set(reservas.filter(r => r.socioId === socio.id && ESTADOS_VIVOS.has(r.estado)).map(r => r.sesionId));
    return sesiones
      .filter(s => !s.cancelada && s.inicio > desde && s.inicio < hasta)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map(s => {
        const tipo = tiposClase.find(t => t.id === s.tipoClaseId);
        const ocupadas = plazasOcupadas(s.id, reservas);
        const aforo = s.aforoMaximo ?? null;
        return {
          sesion: s,
          tipo: tipo?.nombre ?? 'Clase',
          color: tipo?.color ?? 'var(--muted-foreground)',
          sala: salas.find(x => x.id === s.salaId)?.nombre ?? null,
          instructora: instructores.find(x => x.id === s.instructorId)?.nombre ?? null,
          libres: aforo === null ? null : Math.max(0, aforo - ocupadas),
          yaLaTiene: suyas.has(s.id),
          cubre: tieneEntitlementActivo(socio.id, suscripciones, planesTarifa, hoy, s.tipoClaseId),
          dia: hoyEnEstudio(new Date(s.inicio)),
        };
      });
  }, [sesiones, reservas, tiposClase, salas, instructores, suscripciones, planesTarifa, socio.id, ahora, hoy]);

  const porDia = useMemo(() => {
    const m = new Map<string, typeof clases>();
    for (const c of clases) m.set(c.dia, [...(m.get(c.dia) ?? []), c]);
    return [...m.entries()];
  }, [clases]);

  const seleccion = clases.find(c => c.sesion.id === elegida) ?? null;
  const decision = seleccion ? decidirReservaNueva(seleccion.sesion.aforoMaximo, seleccion.sesion.id, reservas) : null;
  const sinNingunPlan = !tieneEntitlementActivo(socio.id, suscripciones, planesTarifa, hoy);

  async function confirmar() {
    if (!seleccion || enviando || !seleccion.cubre || seleccion.yaLaTiene) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await addReserva(seleccion.sesion.id, socio.id, undefined, { avisar: true });
      if (!r.ok) { setError(r.error); return; }
      const cuando = `${etiquetaDia(seleccion.dia, hoy)} a las ${hora(seleccion.sesion.inicio)}`;
      onHecho(r.estado === 'LISTA_ESPERA'
        ? `${socio.nombre} está en la lista de espera de ${seleccion.tipo}, ${cuando}. Le llega el aviso.`
        : `${socio.nombre} apuntada a ${seleccion.tipo}, ${cuando}. Le llega el aviso.`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !enviando) onCerrar(); }}>
      <DialogContent className="flex max-h-[90dvh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <div className="border-b border-border px-5 pb-3 pt-5">
          <DialogTitle className="text-base font-semibold text-foreground">Apuntar a {socio.nombre} a una clase</DialogTitle>
          <DialogDescription className="mt-0.5 text-[13px] text-muted-foreground">
            Las clases de los próximos {DIAS} días. Le llega el aviso de su reserva.
          </DialogDescription>
          {sinNingunPlan && (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-[12.5px] text-foreground">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              <span>No tiene ningún plan ni bono con el que reservar. Para apuntar{lo} con una clase suelta, hazlo desde el <Link href="/calendario" className="font-semibold underline underline-offset-2">calendario</Link>, que te deja cobrársela.</span>
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {porDia.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">No hay clases programadas en los próximos {DIAS} días.</p>
          )}
          {porDia.map(([dia, lista]) => (
            <div key={dia} className="py-1">
              <p className="sticky top-0 z-10 bg-popover px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{etiquetaDia(dia, hoy)}</p>
              <ul>
                {lista.map(c => {
                  const desactivada = c.yaLaTiene || !c.cubre;
                  const activa = elegida === c.sesion.id;
                  return (
                    <li key={c.sesion.id}>
                      <button
                        type="button"
                        disabled={desactivada}
                        onClick={() => setElegida(c.sesion.id)}
                        aria-pressed={activa}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                          activa ? 'bg-accent ring-1 ring-foreground/40' : 'hover:bg-muted',
                          desactivada && 'cursor-not-allowed opacity-55 hover:bg-transparent',
                        )}
                      >
                        <span className="w-12 shrink-0 text-[14px] font-semibold tabular-nums text-foreground">{hora(c.sesion.inicio)}</span>
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-foreground">{c.tipo}</span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {[c.instructora, c.sala].filter(Boolean).join(' · ') || ' '}
                          </span>
                        </span>
                        <span className={cn('shrink-0 text-right text-[12px]', c.libres === 0 ? 'text-warning' : 'text-muted-foreground')}>
                          {c.yaLaTiene ? 'Ya la tiene' : !c.cubre ? 'Su plan no la cubre' : c.libres === null ? 'Sin límite' : c.libres === 0 ? 'Llena' : `${c.libres} ${c.libres === 1 ? 'libre' : 'libres'}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-border px-5 py-3">
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />{error}
            </p>
          )}
          {seleccion && decision?.estado === 'LISTA_ESPERA' && (
            <p className="text-[12.5px] text-foreground">Está llena: entra en la lista de espera, en el puesto {decision.posicionEspera}. Si se libera una plaza, se le avisa.</p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCerrar} disabled={enviando} className="min-h-10 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={!seleccion || enviando}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50"
            >
              <CalendarPlus size={15} aria-hidden />
              {enviando ? 'Apuntando…' : decision?.estado === 'LISTA_ESPERA' ? 'Apuntar a la lista de espera' : `Apuntar${lo}`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function hora(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function etiquetaDia(dia: string, hoy: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  const manana = new Date(`${hoy}T12:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  if (dia === hoy) return 'Hoy';
  if (dia === manana.toISOString().slice(0, 10)) return 'Mañana';
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d).replace(/^./, c => c.toUpperCase());
}
