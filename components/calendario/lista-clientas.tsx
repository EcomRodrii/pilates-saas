'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, RefreshCw, Repeat, CalendarClock, RotateCcw, X, type LucideIcon } from 'lucide-react';
import { cn, horaEstudio } from '@/lib/utils';
import type { Reserva } from '@/lib/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { avisoQuitarReserva, type MarcaReserva } from '@/lib/plazas-fijas-cancelacion';

// Rediseño del Calendario — punto 5, pestaña "Clientas" del panel lateral.
// Estados reales de `EstadoReserva`, incluida la posición en lista de espera
// (I-11) — nada de un "confirmadas/N" agregado. Las CANCELADA no se listan
// aquí (igual que el panel actual): ya no son parte de "quién viene".
export interface ListaClientasProps {
  reservas: Reserva[];
  nombreClienta: (socioId: string) => string;
  /** Cada acción es opcional — su ausencia decide qué puede hacer el rol,
   *  mismo patrón que `accion` en BloqueClase. */
  onCheckin?: (reservaId: string) => void;
  /** Presente = el check-in existe pero está bloqueado (#870: clase todavía
   *  futura) — el botón se pinta deshabilitado con este texto de motivo, en
   *  vez de desaparecer sin explicación o dejar pasar el check-in. */
  checkinBloqueadoPor?: string;
  onNoShow?: (reservaId: string) => void;
  onDeshacerCheckin?: (reservaId: string) => void;
  onRevertirNoShow?: (reservaId: string) => void;
  onAprobar?: (reservaId: string) => void;
  onRechazar?: (reservaId: string) => void;
  /** Reserva cuya aprobación/rechazo está viajando: mientras tanto se apagan
   *  Aprobar y Rechazar de todas, para no mandar dos decisiones a la vez. */
  resolviendoId?: string | null;
  onQuitar?: (reservaId: string) => void;
  /** "Repite como la semana pasada" — vuelve a apuntarla a la misma sala+tipo
   *  de clase, 7 días después. Solo tiene sentido sobre una reserva ya
   *  CONFIRMADA (repetir una lista de espera o pendiente de aprobar repite el
   *  estado, no la clase). */
  onRepetirSemanaSiguiente?: (reservaId: string) => void;
  /** Atajo pedido tras feedback real de una propietaria en prueba: antes crear
   *  una plaza fija solo se podía desde la ficha de la socia, sin ningún
   *  enlace desde el calendario. Abre el mismo diálogo que la ficha con la
   *  clase de ESTA sesión ya elegida. Solo sobre CONFIRMADA, mismo criterio que
   *  "Repetir". */
  onHacerPlazaFija?: (reservaId: string) => void;
  /** Si ya tiene una plaza fija que encaja con el slot de esta sesión, el
   *  botón se oculta en vez de dejar crear un duplicado sin avisar. */
  plazaFijaExistePara?: (socioId: string) => boolean;
  /** Si viene por su plaza fija o gastando una clase para recuperar
   *  (`marcaReserva`). Sin la función, o sin marca, no se pinta nada. */
  marcaDe?: (r: Reserva) => MarcaReserva;
  /** Punto de color del semáforo de salud (§11 ficha clínica) — ausente si el
   *  rol no lo puede ver (puedeVerSemaforo). Genérico a propósito: este
   *  componente no importa tipos de lib/ficha-clinica. */
  semaforoPorSocio?: (socioId: string) => { color: string; label: string } | undefined;
  /** Contenido extra bajo la fila (hoy: emojis de evolución post-clase, solo
   *  ASISTIDA + puedeVerFichaClinica) — hueco genérico para no acoplar este
   *  componente a la ficha clínica.  */
  filaExtra?: (r: Reserva) => React.ReactNode;
}

function etiquetaEstado(r: Reserva): string {
  if (r.estado === 'LISTA_ESPERA') {
    return r.ofertaExpiraEn ? `Oferta viva · caduca ${horaEstudio(r.ofertaExpiraEn)}` : `Espera #${r.posicionEspera ?? '?'}`;
  }
  if (r.estado === 'PENDIENTE_APROBACION') return 'Pendiente de aprobar';
  if (r.estado === 'ASISTIDA') return 'Asistida';
  if (r.estado === 'NO_ASISTIO') return 'No asistió';
  return 'Confirmada';
}

const BOTON = 'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors';

// De dónde viene cada persona de la lista: de su plaza fija (se le reserva sola
// cada semana), gastando una recuperación, o por una reserva de una vez. Antes la
// reserva normal no llevaba nada «para no añadir ruido», y el mostrador no podía
// ver de un vistazo quién está por qué: las tres llevan etiqueta.
const ETIQUETA_MARCA: Record<Exclude<MarcaReserva, null> | 'reserva', { texto: string; titulo: string; Icono: LucideIcon }> = {
  fija: { texto: 'Fija', titulo: 'Viene por su plaza fija: se le reserva sola cada semana', Icono: Repeat },
  recuperacion: { texto: 'Recuperación', titulo: 'Viene gastando una clase para recuperar', Icono: RotateCcw },
  reserva: { texto: 'Reserva', titulo: 'Reservó esta clase una vez, ella o el estudio', Icono: CalendarDays },
};

export function ListaClientas({
  reservas, nombreClienta, onCheckin, checkinBloqueadoPor, onNoShow, onDeshacerCheckin, onRevertirNoShow, onAprobar, onRechazar, resolviendoId, onQuitar,
  onRepetirSemanaSiguiente, onHacerPlazaFija, plazaFijaExistePara, marcaDe, semaforoPorSocio, filaExtra,
}: ListaClientasProps) {
  const visibles = reservas.filter(r => r.estado !== 'CANCELADA');
  // P1-4 (auditoría de producto): un clic en la X quitaba la reserva sin
  // confirmar. Con lista de espera activa, quitar una CONFIRMADA promueve
  // automáticamente a la siguiente persona — un clic accidental deja de ser
  // trivialmente reversible.
  const [pendienteQuitar, setPendienteQuitar] = useState<Reserva | null>(null);

  if (visibles.length === 0) {
    return <div className="py-8 text-center"><p className="text-sm text-muted-foreground">Sin clientas apuntadas aún</p></div>;
  }

  return (
    <div className="space-y-0.5">
      {visibles.map(r => {
        const marca = marcaDe?.(r) ?? null;
        // Solo a quien ocupa plaza de verdad: en la lista de espera lo que importa es su turno.
        // Sin `marcaDe` (otro llamador) no se sabe de dónde viene: no se etiqueta.
        const ocupaPlaza = r.estado !== 'LISTA_ESPERA' && r.estado !== 'PENDIENTE_APROBACION';
        const clave = marca ?? (marcaDe && ocupaPlaza ? 'reserva' : null);
        const etiqueta = clave ? ETIQUETA_MARCA[clave] : null;
        return (
          // Las acciones van en su propia línea, bajo el nombre. En la misma fila
          // (Check-in, No vino, Repetir, Hacer fija) se comían todo el ancho del
          // panel lateral y el nombre de la clienta quedaba a 0 px: se veían las
          // iniciales y botones, y no quién era.
          <div key={r.id} className="flex items-start gap-2.5 py-2 px-2.5 rounded-xl hover:bg-muted group transition-colors">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              style={
                r.estado === 'ASISTIDA'
                  ? { background: 'color-mix(in srgb, var(--brand-medio) 12%, var(--card))', color: 'var(--brand-medio)' }
                  : r.estado === 'LISTA_ESPERA' || r.estado === 'PENDIENTE_APROBACION'
                  ? { background: 'color-mix(in srgb, var(--warning) 12%, var(--card))', color: 'var(--warning)' }
                  : r.estado === 'NO_ASISTIO'
                  ? { background: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', color: 'var(--destructive)' }
                  : { background: 'color-mix(in srgb, var(--brand) 10%, var(--card))', color: 'var(--brand)' }
              }
            >
              {nombreClienta(r.socioId).split(' ').slice(0, 2).map(p => p[0]).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 min-w-0">
                {(() => {
                  const s = semaforoPorSocio?.(r.socioId);
                  return s ? <span className="w-2 h-2 rounded-full shrink-0" title={s.label} style={{ background: s.color }} /> : null;
                })()}
                <Link href={`/clientas/${r.socioId}`} className="truncate hover:text-brand-medio hover:underline transition-colors">
                  {nombreClienta(r.socioId)}
                </Link>
                {etiqueta && (
                  <span
                    title={etiqueta.titulo}
                    data-marca={clave}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold',
                      clave === 'fija' ? 'border-brand/30 bg-brand/10 text-brand' : 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    <etiqueta.Icono size={10} aria-hidden />
                    {etiqueta.texto}
                  </span>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground">{etiquetaEstado(r)}</p>
              {filaExtra?.(r)}
              <div className="flex flex-wrap items-center gap-1 mt-1.5 empty:hidden">
                {r.estado === 'PENDIENTE_APROBACION' && (onAprobar || onRechazar) && (
                  <>
                    {onAprobar && (
                      <button onClick={() => onAprobar(r.id)} disabled={resolviendoId != null} className={`${BOTON} disabled:opacity-50 disabled:cursor-not-allowed`} style={{ background: 'color-mix(in srgb, var(--brand-medio) 12%, var(--card))', color: 'var(--brand-medio)' }}>
                        Aprobar
                      </button>
                    )}
                    {onRechazar && (
                      <button onClick={() => onRechazar(r.id)} disabled={resolviendoId != null} className={`${BOTON} disabled:opacity-50 disabled:cursor-not-allowed`} style={{ background: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', color: 'var(--destructive)' }}>
                        Rechazar
                      </button>
                    )}
                  </>
                )}
                {r.estado === 'CONFIRMADA' && (onCheckin || onNoShow || onRepetirSemanaSiguiente) && (
                  <>
                    {onCheckin && (
                      checkinBloqueadoPor ? (
                        <button disabled title={checkinBloqueadoPor} className={`${BOTON} opacity-40 cursor-not-allowed`} style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                          <CheckCircle2 size={11} />Check-in
                        </button>
                      ) : (
                        <button onClick={() => onCheckin(r.id)} className={BOTON} style={{ background: 'color-mix(in srgb, var(--brand-medio) 12%, var(--card))', color: 'var(--brand-medio)' }}>
                          <CheckCircle2 size={11} />Check-in
                        </button>
                      )
                    )}
                    {onNoShow && (
                      <button onClick={() => onNoShow(r.id)} title="Marcar que no se presentó" className={BOTON} style={{ background: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', color: 'var(--destructive)' }}>
                        No vino
                      </button>
                    )}
                    {onRepetirSemanaSiguiente && (
                      <button
                        onClick={() => onRepetirSemanaSiguiente(r.id)}
                        title="Apuntarla a la misma clase la semana que viene"
                        className={`${BOTON} text-muted-foreground hover:bg-muted opacity-60 group-hover:opacity-100`}
                      >
                        <Repeat size={11} />Repetir
                      </button>
                    )}
                    {onHacerPlazaFija && !plazaFijaExistePara?.(r.socioId) && (
                      <button
                        onClick={() => onHacerPlazaFija(r.id)}
                        title="Que venga cada semana a este mismo hueco, sin tener que apuntarla clase a clase"
                        className={`${BOTON} text-muted-foreground hover:bg-muted opacity-60 group-hover:opacity-100`}
                      >
                        <CalendarClock size={11} />Hacer fija
                      </button>
                    )}
                  </>
                )}
                {r.estado === 'ASISTIDA' && (
                  <>
                    <span className={BOTON} style={{ background: 'color-mix(in srgb, var(--brand-medio) 12%, var(--card))', color: 'var(--brand-medio)' }}>
                      <CheckCircle2 size={11} />OK
                    </span>
                    {onDeshacerCheckin && (
                      <button onClick={() => onDeshacerCheckin(r.id)} title="Deshacer check-in (vuelve a confirmada)" className={`${BOTON} text-muted-foreground hover:bg-muted`}>
                        <RefreshCw size={11} />Deshacer
                      </button>
                    )}
                  </>
                )}
                {r.estado === 'NO_ASISTIO' && onRevertirNoShow && (
                  <button onClick={() => onRevertirNoShow(r.id)} title="Deshacer: volver a confirmada" className={BOTON} style={{ background: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', color: 'var(--destructive)' }}>
                    <RefreshCw size={11} />Deshacer
                  </button>
                )}
              </div>
            </div>
            {onQuitar && (
              <button onClick={() => setPendienteQuitar(r)} aria-label="Quitar reserva" className="w-6 h-6 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-red-400 transition-colors opacity-60 group-hover:opacity-100">
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}

      <ConfirmDialog
        open={!!pendienteQuitar}
        onOpenChange={v => { if (!v) setPendienteQuitar(null); }}
        titulo={pendienteQuitar ? `¿Quitar a ${nombreClienta(pendienteQuitar.socioId)}?` : ''}
        descripcion={pendienteQuitar ? avisoQuitarReserva(pendienteQuitar.estado, marcaDe?.(pendienteQuitar) ?? null) : ''}
        textoConfirmar="Quitar"
        destructivo
        onConfirm={() => { if (pendienteQuitar) onQuitar?.(pendienteQuitar.id); setPendienteQuitar(null); }}
      />
    </div>
  );
}
