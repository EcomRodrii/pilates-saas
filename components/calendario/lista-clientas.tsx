'use client';

import Link from 'next/link';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import { horaEstudio } from '@/lib/utils';
import type { Reserva } from '@/lib/types';

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
  onNoShow?: (reservaId: string) => void;
  onDeshacerCheckin?: (reservaId: string) => void;
  onRevertirNoShow?: (reservaId: string) => void;
  onAprobar?: (reservaId: string) => void;
  onRechazar?: (reservaId: string) => void;
  onQuitar?: (reservaId: string) => void;
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

export function ListaClientas({
  reservas, nombreClienta, onCheckin, onNoShow, onDeshacerCheckin, onRevertirNoShow, onAprobar, onRechazar, onQuitar,
  semaforoPorSocio, filaExtra,
}: ListaClientasProps) {
  const visibles = reservas.filter(r => r.estado !== 'CANCELADA');

  if (visibles.length === 0) {
    return <div className="py-8 text-center"><p className="text-sm text-muted-foreground">Sin clientas apuntadas aún</p></div>;
  }

  return (
    <div className="space-y-0.5">
      {visibles.map(r => (
        <div key={r.id} className="flex items-center gap-2.5 py-2 px-2.5 rounded-xl hover:bg-muted group transition-colors">
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
            <p className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
              {(() => {
                const s = semaforoPorSocio?.(r.socioId);
                return s ? <span className="w-2 h-2 rounded-full shrink-0" title={s.label} style={{ background: s.color }} /> : null;
              })()}
              <Link href={`/clientas/${r.socioId}`} className="truncate hover:text-brand-medio hover:underline transition-colors">
                {nombreClienta(r.socioId)}
              </Link>
            </p>
            <p className="text-[10px] text-muted-foreground">{etiquetaEstado(r)}</p>
            {filaExtra?.(r)}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {r.estado === 'PENDIENTE_APROBACION' && (onAprobar || onRechazar) && (
              <>
                {onAprobar && (
                  <button onClick={() => onAprobar(r.id)} className={BOTON} style={{ background: 'color-mix(in srgb, var(--brand-medio) 12%, var(--card))', color: 'var(--brand-medio)' }}>
                    Aprobar
                  </button>
                )}
                {onRechazar && (
                  <button onClick={() => onRechazar(r.id)} className={BOTON} style={{ background: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', color: 'var(--destructive)' }}>
                    Rechazar
                  </button>
                )}
              </>
            )}
            {r.estado === 'CONFIRMADA' && (onCheckin || onNoShow) && (
              <>
                {onCheckin && (
                  <button onClick={() => onCheckin(r.id)} className={BOTON} style={{ background: 'color-mix(in srgb, var(--brand-medio) 12%, var(--card))', color: 'var(--brand-medio)' }}>
                    <CheckCircle2 size={11} />Check-in
                  </button>
                )}
                {onNoShow && (
                  <button onClick={() => onNoShow(r.id)} title="Marcar que no se presentó" className={BOTON} style={{ background: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', color: 'var(--destructive)' }}>
                    No vino
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
            {onQuitar && (
              <button onClick={() => onQuitar(r.id)} aria-label="Quitar reserva" className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-red-400 transition-colors opacity-60 group-hover:opacity-100">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
