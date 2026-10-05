'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Check, CircleSlash, Mic, Pin, RotateCcw, ThumbsDown, UserMinus, UserRound, UserX } from 'lucide-react';
import { cn, horaEstudio } from '@/lib/utils';
import type { Reserva } from '@/lib/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MenuAcciones, type AccionMenu } from '@/components/ui/menu-acciones';
import { avisoQuitarReserva, type MarcaReserva } from '@/lib/plazas-fijas-cancelacion';
import { avisoQuitarExterna, filaReserva } from '@/lib/plataformas/fila-reserva';
import { planPasarLista } from '@/lib/calendario-decisiones';
import { MENSAJE_CLASE_AUN_NO_EMPEZADA } from '@/lib/calendario-estado';

// Quién viene a la clase, en la ficha del Calendario.
//
// Lo principal de cada clienta, a la vista y a tamaño de dedo (el mostrador
// trabaja con un iPad): el check-in. Lo demás —no vino, repetir, hacerle plaza
// fija, nota de voz, quitar— en su ⋯, con lo que hace de verdad escrito debajo.
//
// Terminada la clase, se pasa lista marcando solo a quien NO vino: al guardar,
// las demás quedan como que vinieron. Antes «Pasar lista» las daba a TODAS por
// venidas de un toque.

export interface ClientasDeClaseProps {
  reservas: Reserva[];
  nombreClienta: (socioId: string) => string;
  /** La clase terminó con gente sin marcar: modo pasar lista. */
  pasarLista: boolean;
  /** Desde una hora antes de empezar, como la puerta. */
  checkinAbierto: boolean;
  /** Si aún no está abierto y la clase es hoy, desde qué hora («09:00»): lo dice
   *  la fila, en vez de no enseñar nada. Otro día, null: sería ruido. */
  checkinDesde?: string | null;
  /** Ya ha empezado: se puede decir que alguien no vino. */
  empezada: boolean;
  onCheckin?: (reservaId: string) => void;
  onDeshacerCheckin?: (reservaId: string) => void;
  onNoShow?: (reservaId: string) => void;
  onRevertirNoShow?: (reservaId: string) => void;
  onAprobar?: (reservaId: string) => void;
  onRechazar?: (reservaId: string) => void;
  resolviendoId?: string | null;
  onQuitar?: (reservaId: string) => void;
  onRepetirSemanaSiguiente?: (reservaId: string) => void;
  onHacerPlazaFija?: (reservaId: string) => void;
  plazaFijaExistePara?: (socioId: string) => boolean;
  onNotaVoz?: (socioId: string) => void;
  marcaDe?: (r: Reserva) => MarcaReserva;
  semaforoPorSocio?: (socioId: string) => { color: string; label: string } | undefined;
  /** Debajo de la fila (las caras de cómo le fue, para quien ve la ficha clínica). */
  filaExtra?: (r: Reserva) => ReactNode;
  /** El nombre de su máquina o sitio, si lo tiene. */
  sitioDe?: (r: Reserva) => string | null;
  /** Pasar lista: escribe y dice cómo ha ido. */
  onGuardarLista?: (plan: { vinieron: string[]; noVinieron: string[] }) => Promise<void>;
}

// De dónde viene cada persona de la lista: de su plaza fija (se le reserva sola
// cada semana), gastando una recuperación, o por una reserva de una vez. Las tres
// llevan etiqueta: el mostrador tiene que ver de un vistazo quién está por qué.
const ETIQUETA_MARCA: Record<Exclude<MarcaReserva, null> | 'reserva', { texto: string; titulo: string }> = {
  fija: { texto: 'Clase fija', titulo: 'Viene por su clase fija: se le reserva sola cada semana' },
  recuperacion: { texto: 'Recuperación', titulo: 'Viene gastando una clase para recuperar' },
  reserva: { texto: 'Reserva', titulo: 'Reservó esta clase una vez, ella o el estudio' },
};

const DE_PLAZA = new Set(['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']);

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function estiloAvatar(estado: string): React.CSSProperties {
  if (estado === 'ASISTIDA') return { background: 'color-mix(in srgb, var(--success) 14%, var(--card))', color: 'var(--success)' };
  if (estado === 'NO_ASISTIO') return { background: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', color: 'var(--destructive)' };
  if (estado === 'LISTA_ESPERA' || estado === 'PENDIENTE_APROBACION') return { background: 'color-mix(in srgb, var(--warning) 14%, var(--card))', color: 'var(--warning)' };
  return { background: 'var(--muted)', color: 'var(--foreground)' };
}

const BOTON_FILA = 'inline-flex min-h-11 min-w-[96px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[13.5px] font-semibold transition-colors';

export function ClientasDeClase(p: ClientasDeClaseProps) {
  const router = useRouter();
  const [pendienteQuitar, setPendienteQuitar] = useState<Reserva | null>(null);
  const [noVinieron, setNoVinieron] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);

  const visibles = useMemo(() => {
    const orden = (r: Reserva) => DE_PLAZA.has(r.estado) ? 0 : r.estado === 'PENDIENTE_APROBACION' ? 1 : 2;
    return p.reservas
      .filter(r => r.estado !== 'CANCELADA')
      .sort((a, b) => orden(a) - orden(b)
        || (a.posicionEspera ?? 0) - (b.posicionEspera ?? 0)
        || filaReserva(a, p.nombreClienta).nombre.localeCompare(filaReserva(b, p.nombreClienta).nombre, 'es'));
  }, [p.reservas, p.nombreClienta]);

  const plan = planPasarLista(visibles, noVinieron);
  const porMarcar = plan.vinieron.length + plan.noVinieron.length;

  if (visibles.length === 0) {
    return <p className="px-5 py-8 text-center text-[13.5px] text-muted-foreground">Nadie apuntada todavía.</p>;
  }

  function alternarNoVino(id: string) {
    setNoVinieron(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  async function guardarLista() {
    if (!p.onGuardarLista || guardando || porMarcar === 0) return;
    setGuardando(true);
    try {
      await p.onGuardarLista(plan);
      setNoVinieron(new Set());
    } finally {
      setGuardando(false);
    }
  }

  const enEspera = visibles.filter(r => r.estado === 'LISTA_ESPERA').length;

  return (
    <div>
      {p.pasarLista && (
        <p className="px-5 pt-3 text-[13px] text-muted-foreground text-pretty">
          Marca solo a quien <b className="font-semibold text-foreground">no vino</b>. Al guardar, las demás quedan como que vinieron.
        </p>
      )}
      <ul className="divide-y divide-border pt-1">
        {visibles.map(r => {
          const fila = filaReserva(r, p.nombreClienta);
          const marca = fila.plataforma ? null : p.marcaDe?.(r) ?? null;
          const semaforo = fila.conSemaforo ? p.semaforoPorSocio?.(r.socioId) : undefined;
          const sitio = p.sitioDe?.(r) ?? null;
          // Sin `marcaDe` (otro llamador) no se sabe de dónde viene: no se etiqueta.
          const ocupaPlaza = r.estado !== 'LISTA_ESPERA' && r.estado !== 'PENDIENTE_APROBACION';
          const clave = fila.plataforma ? null : marca ?? (p.marcaDe && ocupaPlaza ? 'reserva' : null);
          const etiqueta = clave ? ETIQUETA_MARCA[clave] : null;
          const estadoTexto = r.estado === 'LISTA_ESPERA'
            ? (r.ofertaExpiraEn ? `Plaza ofrecida · caduca a las ${horaEstudio(r.ofertaExpiraEn)}` : `En espera · nº ${r.posicionEspera ?? '?'}`)
            : r.estado === 'PENDIENTE_APROBACION' ? 'Pendiente de aprobar' : null;
          const detalle = [
            sitio && <span key="sitio">{sitio}</span>,
            etiqueta && (
              <span key="marca" data-marca={clave} title={etiqueta.titulo} className={clave === 'fija' ? 'font-medium text-foreground' : undefined}>
                {etiqueta.texto}
              </span>
            ),
            estadoTexto && <span key="estado">{estadoTexto}</span>,
          ].filter(Boolean);
          const marcandoNoVino = p.pasarLista && r.estado === 'CONFIRMADA' && !r.checkInEn;

          const menu: AccionMenu[] = [];
          if (r.estado === 'CONFIRMADA' && p.onNoShow && p.empezada && !p.pasarLista) {
            menu.push({ texto: 'Marcar que no vino', icono: UserX, onClick: () => p.onNoShow?.(r.id), nota: 'Cuenta como ausencia' });
          }
          if (r.estado === 'ASISTIDA' && p.onDeshacerCheckin) {
            menu.push({ texto: 'Deshacer el check-in', icono: RotateCcw, onClick: () => p.onDeshacerCheckin?.(r.id), nota: 'Vuelve a estar apuntada, sin marcar' });
          }
          if (r.estado === 'NO_ASISTIO' && p.onRevertirNoShow) {
            menu.push({ texto: 'Deshacer «no vino»', icono: RotateCcw, onClick: () => p.onRevertirNoShow?.(r.id), nota: 'Vuelve a estar apuntada, sin marcar' });
          }
          if (r.estado === 'PENDIENTE_APROBACION' && p.onRechazar) {
            menu.push({ texto: 'Rechazar la reserva', icono: ThumbsDown, onClick: () => p.onRechazar?.(r.id), peligro: true, desactivada: p.resolviendoId != null });
          }
          if (r.estado === 'CONFIRMADA' && p.onRepetirSemanaSiguiente && fila.puedeRepetir) {
            menu.push({ texto: 'Apuntarla la semana que viene', icono: CalendarPlus, onClick: () => p.onRepetirSemanaSiguiente?.(r.id), nota: 'A la misma clase, siete días después' });
          }
          if (r.estado === 'CONFIRMADA' && p.onHacerPlazaFija && fila.puedeHacerFija && !p.plazaFijaExistePara?.(r.socioId)) {
            menu.push({ texto: 'Darle clase fija', icono: Pin, onClick: () => p.onHacerPlazaFija?.(r.id), nota: 'Que venga cada semana a este hueco, sin apuntarla clase a clase' });
          }
          if (r.estado === 'ASISTIDA' && p.onNotaVoz && !fila.plataforma) {
            menu.push({ texto: 'Nota de voz', icono: Mic, onClick: () => p.onNotaVoz?.(r.socioId), nota: 'Piloto' });
          }
          if (fila.enlaceFicha) {
            const href = fila.enlaceFicha;
            menu.push({ texto: 'Ver su ficha', icono: UserRound, onClick: () => router.push(href) });
          }
          if (p.onQuitar) {
            menu.push({
              texto: 'Quitar de la clase', icono: UserMinus, peligro: true, separar: menu.length > 0,
              onClick: () => setPendienteQuitar(r),
              nota: avisoQuitarExterna(fila.plataforma) ?? avisoQuitarReserva(r.estado, marca),
            });
          }

          return (
            <li key={r.id} data-reserva-id={r.id} data-estado={r.estado} className="px-5 py-2.5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold" style={estiloAvatar(r.estado)} aria-hidden>
                  {iniciales(fila.nombre) || '·'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1.5 text-[14px] font-medium text-foreground">
                    {semaforo && <span className="size-2 shrink-0 rounded-full" title={semaforo.label} style={{ background: semaforo.color }} />}
                    {fila.enlaceFicha
                      ? <Link href={fila.enlaceFicha} className="truncate hover:underline">{fila.nombre}</Link>
                      : <span className="truncate">{fila.nombre}</span>}
                    {fila.siglaPlataforma && (
                      <span
                        title="Reserva vendida por la plataforma: no es clienta del estudio"
                        data-plataforma={fila.plataforma}
                        className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground"
                      >
                        {fila.siglaPlataforma}
                      </span>
                    )}
                  </p>
                  {detalle.length > 0 && (
                    <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                      {detalle.map((d, i) => <span key={i}>{i > 0 && ' · '}{d}</span>)}
                    </p>
                  )}
                </div>

                {marcandoNoVino ? (
                  <button
                    type="button"
                    aria-pressed={noVinieron.has(r.id)}
                    onClick={() => alternarNoVino(r.id)}
                    className={cn(BOTON_FILA, 'border', noVinieron.has(r.id)
                      ? 'border-destructive/50 bg-destructive/10 text-destructive'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground')}
                  >
                    <UserX size={15} aria-hidden />No vino
                  </button>
                ) : r.estado === 'CONFIRMADA' && p.onCheckin && p.checkinAbierto ? (
                  <button
                    type="button"
                    title={`Marcar que ${fila.nombre} ha venido`}
                    onClick={() => p.onCheckin?.(r.id)}
                    className={cn(BOTON_FILA, 'border border-border bg-card text-foreground shadow-xs hover:bg-muted')}
                  >
                    Check-in
                  </button>
                ) : r.estado === 'CONFIRMADA' && p.onCheckin && p.checkinDesde ? (
                  <span className="shrink-0 text-[12.5px] text-muted-foreground" title={MENSAJE_CLASE_AUN_NO_EMPEZADA}>
                    Check-in desde las {p.checkinDesde}
                  </span>
                ) : r.estado === 'ASISTIDA' ? (
                  <span className={cn(BOTON_FILA, 'bg-[color-mix(in_srgb,var(--success)_14%,var(--card))] text-[var(--success)]')}>
                    <Check size={16} strokeWidth={2.5} aria-hidden />Vino
                  </span>
                ) : r.estado === 'NO_ASISTIO' ? (
                  <span className={cn(BOTON_FILA, 'bg-destructive/10 text-destructive')}>
                    <CircleSlash size={15} aria-hidden />No vino
                  </span>
                ) : r.estado === 'PENDIENTE_APROBACION' && p.onAprobar ? (
                  <button
                    type="button"
                    disabled={p.resolviendoId != null}
                    onClick={() => p.onAprobar?.(r.id)}
                    className={cn(BOTON_FILA, 'bg-brand text-brand-foreground hover:brightness-95 disabled:opacity-50')}
                  >
                    Aprobar
                  </button>
                ) : null}

                {menu.length > 0 && (
                  <MenuAcciones
                    acciones={menu}
                    titulo={fila.nombre}
                    ancho="ancho"
                    etiqueta={`Más acciones de ${fila.nombre}`}
                    claseBoton="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  />
                )}
              </div>
              {!fila.plataforma && p.filaExtra?.(r)}
            </li>
          );
        })}
      </ul>
      {/* Sitio para que la última fila suba por encima de la burbuja de soporte
          cuando la ficha va al lado (lo mide globals.css; en otro sitio, 0). */}
      <div aria-hidden data-sitio-burbuja />

      {p.pasarLista && p.onGuardarLista && porMarcar > 0 && (
        <div className="sticky bottom-0 border-t border-border bg-card/95 px-5 py-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => void guardarLista()}
            disabled={guardando}
            className="flex min-h-11 w-full items-center justify-center rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-foreground hover:brightness-95 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : `Guardar · ${plan.vinieron.length} ${plan.vinieron.length === 1 ? 'vino' : 'vinieron'}, ${plan.noVinieron.length} no`}
          </button>
          {plan.noVinieron.length < porMarcar && (
            <p className="mt-2 text-center text-[12.5px] text-muted-foreground">
              {visibles.some(r => r.estado === 'ASISTIDA') ? '¿No vino ninguna de las que quedan?' : '¿No vino nadie?'}{' '}
              <button
                type="button"
                onClick={() => setNoVinieron(new Set([...plan.vinieron, ...plan.noVinieron]))}
                className="font-medium text-foreground underline underline-offset-2"
              >
                Márcalas así
              </button>
            </p>
          )}
        </div>
      )}

      {enEspera > 0 && !p.pasarLista && (
        <p className="border-t border-border px-5 py-2.5 text-[12.5px] text-muted-foreground">
          {enEspera === 1 ? '1 persona en lista de espera' : `${enEspera} personas en lista de espera`}
        </p>
      )}

      <ConfirmDialog
        open={!!pendienteQuitar}
        onOpenChange={v => { if (!v) setPendienteQuitar(null); }}
        titulo={pendienteQuitar ? `¿Quitar a ${filaReserva(pendienteQuitar, p.nombreClienta).nombre}?` : ''}
        descripcion={pendienteQuitar ? (avisoQuitarExterna(filaReserva(pendienteQuitar, p.nombreClienta).plataforma)
          ?? avisoQuitarReserva(pendienteQuitar.estado, p.marcaDe?.(pendienteQuitar) ?? null)) : ''}
        textoConfirmar="Quitar"
        destructivo
        onConfirm={() => { if (pendienteQuitar) p.onQuitar?.(pendienteQuitar.id); setPendienteQuitar(null); }}
      />
    </div>
  );
}
