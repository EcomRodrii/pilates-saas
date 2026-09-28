'use client';
import { queImparten } from '@/lib/equipo';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, ChevronLeft, X, CheckCircle2, Calendar, User, AlertCircle } from 'lucide-react';
import type { ServicioCita, DisponibilidadCita, Instructor } from '@/lib/types';
import { PublicSheet } from '@/components/ui/public-sheet';
import { serif, sans, cq, radius, shadow, pesoTitular, paletaOscura, textoSemantico } from '@/lib/reservar-publico-tokens';
import type { ModoTokens } from '@/lib/portal-modo';
import { semantic } from '@/lib/portal-tokens';
import { fechaLargaEstudio, horaEstudio } from '@/lib/utils';
import { localDayKey, addDays, fechaDeClave } from '@/lib/reserva-calendario-logic';
import { hoyEnEstudio } from '@/lib/utils';
import { TiraDias } from './tira-dias';
import { SelectorCita } from '@/components/reservar/selector-cita';
import { metaServicioCita, precioServicioCita } from '@/lib/reservar/servicio-cita';

// ─────────────────────────────────────────────────────────────────────────────
// Reserva pública de citas 1:1 (widget /reservar). Flujo: servicio → (paso
// huecos) instructora + día + hueco → confirmar. Los huecos los calcula el
// servidor (GET /api/public/citas) sobre el horario fino; la reserva va por
// reservarCitaPublica (Bearer JWT). No decide nada de negocio: solo orquesta
// la UI.
//
// Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md, formato
// 02): dos pantallas en vez de revelado progresivo en una sola — servicio, y
// luego una pantalla con los 3 grupos (instructora/día/hora) a la vez. La
// opción "Cualquiera" de instructora no es solo copy: sin backend nuevo,
// pide los huecos de TODAS las instructoras disponibles en paralelo y los
// fusiona por hora — cada hueco fusionado recuerda de qué instructora es
// para poder reservarlo.
// ─────────────────────────────────────────────────────────────────────────────

interface Hueco { inicio: string; fin: string; instructorId: string }

interface MiCita {
  id: string;
  servicioNombre: string;
  instructorNombre: string;
  inicio: string;
  fin: string;
  estado: string;
}

export interface CitasPublicaProps {
  studioId: string;
  servicios: ServicioCita[];
  instructores: Instructor[];
  disponibilidad: DisponibilidadCita[];
  misCitas: MiCita[];
  autenticada: boolean;
  onNeedLogin: () => void;
  onReservar: (servicioId: string, instructorId: string, inicioISO: string) => Promise<{ ok: true } | { error: string }>;
  onCancelar: (citaId: string) => void | Promise<{ ok: true } | { ok: false; error: string }>;
  primary: string;
  primaryFg: string;
  /**
   * El anclaje del overlay cuando el widget vive dentro de un iframe
   * auto-dimensionado (ver `overlayStyle` en PublicSheet). Sin esto, la hoja
   * de confirmar cita se ancla al fondo del iframe, no a lo que se ve.
   */
  overlayStyle?: React.CSSProperties;
  /**
   * Avisa de si la hoja está abierta, para que el contenedor pueda pedirle al
   * anfitrión la franja visible (`tentareScrollTo`). El estado vive aquí
   * dentro, así que sin este aviso el contenedor no puede saberlo — y el
   * seguimiento del scroll se perdía en silencio.
   */
  onOverlayAbierto?: (abierto: boolean) => void;
  /** La foto del primer paso (ver `SelectorCita`). Sin ella, la lista va sola. */
  foto?: string | null;
  /**
   * La paleta que se ve (la prop `t=` del resto de la página). Solo cambia algo
   * sobre fondo OSCURO: los errores y el «¡Cita reservada!» usan los tokens del
   * PANEL (`text-destructive`, `--success`), pensados para fondo claro, y sobre
   * la tarjeta de Carbón se quedaban por debajo de 3:1. Sin ella, lo de siempre.
   */
  t?: ModoTokens;
}

function fmtHora(iso: string) { return horaEstudio(iso); }
function fmtDiaLargo(iso: string) { return fechaLargaEstudio(iso); }

const CUALQUIERA = '__cualquiera__';
// Una columna centrada, del ancho de la de los huecos; más ancha cuando la
// tarjeta de elegir servicio lleva la foto al lado, que si no se come la lista.
const ANCHO = 560;
const ANCHO_CON_FOTO = 760;

export function CitasPublica({
  studioId, servicios, instructores, disponibilidad, misCitas,
  autenticada, onNeedLogin, onReservar, onCancelar, primary, primaryFg,
  overlayStyle, onOverlayAbierto, foto, t,
}: CitasPublicaProps) {
  // En claro, `undefined`: mandan las clases de siempre.
  const oscura = t != null && paletaOscura(t);
  const peligro = oscura ? textoSemantico('danger', t) : undefined;
  const exito = oscura ? textoSemantico('success', t) : 'var(--success)';
  // RES-7-f: `ahora` es el INSTANTE (para saber qué cita ya terminó) y `hoy` el día
  // del ESTUDIO como fecha de calendario (tira de días, día elegido): con el
  // navegador fuera de Madrid, «hoy» era otro día.
  const [ahora] = useState(() => new Date());
  const hoy = fechaDeClave(hoyEnEstudio(ahora));
  const [paso, setPaso] = useState<'servicio' | 'huecos'>('servicio');
  const [servicioId, setServicioId] = useState<string | null>(null);
  const [instructorSel, setInstructorSel] = useState<string>(CUALQUIERA);
  const [dias10] = useState(() => Array.from({ length: 10 }, (_, i) => addDays(hoy, i)));
  const [selectedDay, setSelectedDay] = useState<string>(localDayKey(hoy));
  const [huecos, setHuecos] = useState<Hueco[] | null>(null);
  const [loadingHuecos, setLoadingHuecos] = useState(false);
  const [errorHuecos, setErrorHuecos] = useState(false);
  const [booking, setBooking] = useState<Hueco | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  // El contenedor necesita saber que hay un overlay abierto para pedirle al
  // anfitrión la franja visible del iframe (ver `onOverlayAbierto`).
  useEffect(() => { onOverlayAbierto?.(confirmando); }, [confirmando, onOverlayAbierto]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: true } | { error: string } | null>(null);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);

  const servicio = servicios.find(s => s.id === servicioId) ?? null;
  const precioServicio = servicio ? precioServicioCita(servicio.precio) : null;

  // El botón que se pulsa para cambiar de paso («Reservar cita», «← Servicios»)
  // desaparece con el paso: sin mover el foco, caía al <body> y con teclado o
  // lector de pantalla se perdía el sitio. Al entrar en los huecos va al titular
  // del paso; al volver, a la opción marcada (`enfocar` de SelectorCita). Sin
  // desplazar la página: dentro del widget sería la web del estudio la que salta.
  const tituloHuecosRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (paso === 'huecos') tituloHuecosRef.current?.focus({ preventScroll: true });
  }, [paso]);

  const instructorasDisponibles = useMemo(
    () => queImparten(instructores).filter(i => disponibilidad.some(d => d.instructorId === i.id)),
    [instructores, disponibilidad],
  );

  const conteosDia = useMemo(() => new Map<string, number>(), []); // la tira de días de citas no anuncia recuento: los huecos dependen de a quién se elija.

  // P1-7 (auditoría de producto): "Cualquier instructora" hacía 1 petición
  // HTTP por instructora (~4 queries cada una) contra un endpoint con
  // rate-limit de 60/min — con 4-6 instructoras del mismo servicio, una socia
  // navegando varios días podía agotar la cuota y ver "sin huecos" cuando era
  // en realidad un 429. Con una instructora concreta elegida, sigue siendo
  // exactamente la petición de siempre (mismo contrato `{ huecos }`).
  async function cargarHuecos() {
    if (!servicioId) { setHuecos(null); return; }
    setLoadingHuecos(true);
    setErrorHuecos(false);
    const instructoras = instructorSel === CUALQUIERA
      ? instructorasDisponibles.map(i => i.id)
      : [instructorSel];
    if (instructoras.length === 0) { setHuecos([]); setLoadingHuecos(false); return; }
    try {
      if (instructoras.length === 1) {
        const [instructorId] = instructoras;
        const url = `/api/public/citas?studioId=${encodeURIComponent(studioId)}&servicioId=${encodeURIComponent(servicioId)}&instructorId=${encodeURIComponent(instructorId)}&fecha=${selectedDay}`;
        const r = await fetch(url);
        // ⚠️ `fetch` no lanza con un 4xx/5xx, solo con la red caída. Sin esto,
        // un 500 (o un 429 del rate-limit) devolvía un JSON sin `huecos`, la
        // lista quedaba vacía y el widget enseñaba «no hay horas disponibles»
        // — que no es lo que ha pasado. La alumna se va convencida de que no
        // hay hueco, y el estudio no se entera de nada. El estado de error ya
        // existía ahí abajo, con su «Reintentar»; solo no se llegaba a él.
        if (!r.ok) throw new Error(`citas ${r.status}`);
        const d = await r.json();
        const brutos: { inicio: string; fin: string }[] = Array.isArray(d.huecos) ? d.huecos : [];
        setHuecos(brutos.map(h => ({ ...h, instructorId })).sort((a, b) => a.inicio.localeCompare(b.inicio)));
        return;
      }
      const url = `/api/public/citas?studioId=${encodeURIComponent(studioId)}&servicioId=${encodeURIComponent(servicioId)}&instructorId=${encodeURIComponent(instructoras.join(','))}&fecha=${selectedDay}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`citas ${r.status}`);
      const d = await r.json();
      const porInstructor: Record<string, { inicio: string; fin: string }[]> =
        d.porInstructor && typeof d.porInstructor === 'object' ? d.porInstructor : {};
      const fusionados = Object.entries(porInstructor)
        .flatMap(([instructorId, brutos]) => (Array.isArray(brutos) ? brutos : []).map(h => ({ ...h, instructorId })))
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
      setHuecos(fusionados);
    } catch {
      setErrorHuecos(true);
      setHuecos(null);
    } finally {
      setLoadingHuecos(false);
    }
  }

  useEffect(() => {
    if (paso !== 'huecos') return;
    let cancelado = false;
    (async () => { await cargarHuecos(); if (cancelado) return; })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cargarHuecos ya lee servicioId/instructorSel/selectedDay del closure; declararlas aquí duplicaría la lista.
  }, [paso, servicioId, instructorSel, selectedDay]);

  async function confirmar() {
    if (!booking || !servicioId) return;
    if (!autenticada) { onNeedLogin(); return; }
    setEnviando(true);
    const r = await onReservar(servicioId, booking.instructorId, booking.inicio);
    setEnviando(false);
    setResultado(r);
    if ('ok' in r) {
      setHuecos(prev => (prev ?? []).filter(h => h.inicio !== booking.inicio));
    }
  }

  function cerrarSheet() { setConfirmando(false); setBooking(null); setResultado(null); }
  function abrirHuecos(sId: string) { setServicioId(sId); setInstructorSel(CUALQUIERA); setSelectedDay(localDayKey(hoy)); setBooking(null); setPaso('huecos'); }
  function volverAServicios() { setPaso('servicio'); setHuecos(null); setBooking(null); }
  // Cambiar instructora o día deselecciona la hora elegida (spec Fase 4): los
  // huecos que se estaban mirando ya no son los mismos.
  function elegirInstructor(id: string) { setInstructorSel(id); setBooking(null); }
  function elegirDia(dayKey: string) { setSelectedDay(dayKey); setBooking(null); }

  const citasFuturas = misCitas
    .filter(c => c.estado !== 'CANCELADA' && new Date(c.fin).getTime() > ahora.getTime())
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  const tokensTira = {
    surface: 'var(--portal-surface)', line: 'var(--portal-line)', ink: 'var(--portal-ink)',
    mutedText: 'var(--portal-muted)', acento: primary, acentoTexto: primaryFg,
    fuenteDisplay: serif, fuenteUI: sans, radioChip: radius.hour,
  };

  // Superficies y textos con las variables del widget (no `bg-white` ni los
  // colores del panel): sobre una web oscura eran una losa blanca.
  if (servicios.length === 0) {
    return (
      <div style={{ maxWidth: ANCHO, marginInline: 'auto' }}>
        <CabeceraCitas />
        <div className="rounded-2xl flex flex-col items-center py-16 px-6 gap-3 text-center" style={{ marginTop: 18, background: 'var(--portal-surface)', border: '1px solid var(--portal-line)' }}>
          <Clock size={28} className="text-[var(--portal-micro)]" />
          <p className="font-medium" style={{ color: 'var(--portal-ink)' }}>Este estudio aún no ofrece citas reservables online</p>
          <p className="text-sm max-w-xs" style={{ color: 'var(--portal-muted)' }}>Escríbeles para reservar una sesión individual.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" style={{ maxWidth: foto ? ANCHO_CON_FOTO : ANCHO, marginInline: 'auto' }}>
      {/* Mis próximas citas */}
      {citasFuturas.length > 0 && paso === 'servicio' && (
        <div className="space-y-2">
          <h2 className="font-bold text-base px-1" style={{ color: 'var(--portal-ink)' }}>Mis próximas citas</h2>
          {errorCancelar && (
            <p role="alert" className="mx-1 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" style={{ color: peligro }}>
              <span className="font-semibold">La cita sigue en pie.</span> {errorCancelar}
            </p>
          )}
          {citasFuturas.map(c => (
            <div key={c.id} className="p-4 flex items-center justify-between gap-3" style={{ background: 'var(--portal-surface)', border: '1px solid var(--portal-line)', borderRadius: radius.card }}>
              <div className="min-w-0">
                <p className="font-bold text-sm" style={{ color: 'var(--portal-ink)' }}>{c.servicioNombre}</p>
                <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--portal-muted)' }}>{fmtDiaLargo(c.inicio)} · {fmtHora(c.inicio)}</p>
                <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--portal-muted)' }}><User size={11} aria-hidden="true" />{c.instructorNombre}</p>
              </div>
              <button
                onClick={async () => {
                  if (cancelandoId) return;
                  setCancelandoId(c.id);
                  setErrorCancelar(null);
                  try {
                    const r = await onCancelar(c.id);
                    if (r && !r.ok) setErrorCancelar(r.error);
                  } finally {
                    setCancelandoId(null);
                  }
                }}
                disabled={cancelandoId === c.id}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-destructive bg-destructive/10 hover:bg-destructive/10 border border-destructive/30 transition-colors disabled:opacity-60"
                style={{ color: peligro }}>
                <X size={12} />{cancelandoId === c.id ? 'Cancelando…' : 'Cancelar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Paso 1 — servicio: se marca y «Reservar cita» avanza (components/reservar/selector-cita.tsx) */}
      {paso === 'servicio' && (
        // `servicioId` solo existe tras haber pasado por los huecos: al volver
        // de ahí (y no en la primera carga) el foco va a la opción marcada.
        <SelectorCita servicios={servicios} inicial={servicioId} foto={foto} enfocar={servicioId !== null} onContinuar={abrirHuecos} />
      )}

      {/* Paso 2 — instructora / día / hora */}
      {paso === 'huecos' && servicio && (
        <div style={{ maxWidth: 560, marginInline: 'auto' }}>
          <button onClick={volverAServicios} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--portal-muted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            <ChevronLeft size={14} /> Servicios
          </button>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: 'var(--portal-muted)', marginTop: 10 }}>PASO 1 DE 3</div>

          <div style={{ marginTop: 14, padding: '14px 18px', borderRadius: radius.cardSmall, background: 'var(--portal-surface)', border: '1px solid var(--portal-line)' }}>
            <h2 ref={tituloHuecosRef} tabIndex={-1} style={{ fontFamily: serif, fontSize: 19, fontWeight: 'inherit', color: 'var(--portal-ink)', margin: 0, outline: 'none' }}>{servicio.nombre}</h2>
            <p style={{ fontSize: 12.5, color: 'var(--portal-muted)', marginTop: 3 }}>
              {metaServicioCita(servicio)}
            </p>
          </div>

          {/* Instructora */}
          <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: 'var(--portal-muted)', marginTop: 20 }}>INSTRUCTORA</p>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 10, paddingBottom: 2 }}>
            {[{ id: CUALQUIERA, nombre: 'Cualquiera' }, ...instructorasDisponibles].map(i => {
              const sel = i.id === instructorSel;
              return (
                <button key={i.id} onClick={() => elegirInstructor(i.id)}
                  style={{
                    flexShrink: 0, padding: '9px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                    border: '1px solid transparent', cursor: 'pointer',
                    background: sel ? 'var(--portal-ink)' : 'var(--portal-surface)',
                    color: sel ? 'var(--portal-bg)' : 'var(--portal-ink)',
                    ...(sel ? {} : { border: '1px solid var(--portal-line)' }),
                  }}>
                  {i.nombre}
                </button>
              );
            })}
          </div>

          {/* Día — misma tira de 10 días que Horario */}
          <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: 'var(--portal-muted)', marginTop: 20 }}>DÍA</p>
          <div style={{ marginTop: 10 }}>
            <TiraDias dias={dias10} seleccionado={selectedDay} conteos={conteosDia} onSeleccionar={elegirDia} tokens={tokensTira} hoyKey={localDayKey(hoy)} mananaKey={localDayKey(addDays(hoy, 1))} />
          </div>

          {/* Hora */}
          <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: 'var(--portal-muted)', marginTop: 20 }}>HORA</p>
          <div style={{ marginTop: 10 }}>
            {loadingHuecos ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }} aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ height: 42, borderRadius: radius.hour, background: 'linear-gradient(100deg, var(--portal-velo) 40%, var(--portal-line) 50%, var(--portal-velo) 60%)', backgroundSize: '200% 100%', animation: 'widget-skeleton-shimmer 1.1s linear infinite' }} />
                ))}
              </div>
            ) : errorHuecos ? (
              <EstadoNoFeliz tono="error" peligro={peligro} titulo="No hemos podido cargar el horario" cuerpo="Parece un problema de conexión. Inténtalo de nuevo en unos segundos." ctaLabel="Reintentar" onCta={cargarHuecos} />
            ) : huecos && huecos.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>
                {huecos.map(h => {
                  const sel = booking?.inicio === h.inicio;
                  return (
                    <button key={h.inicio} onClick={() => setBooking(h)}
                      style={{
                        height: 42, borderRadius: radius.hour, border: '1.5px solid transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
                        background: sel ? primary : 'var(--portal-surface)',
                        color: sel ? primaryFg : 'var(--portal-ink)',
                        transition: 'border-color .3s ease',
                      }}>
                      {fmtHora(h.inicio)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <EstadoNoFeliz
                tono="vacio" titulo="Sin huecos disponibles"
                cuerpo="Prueba otro día, o mira si otra instructora tiene hueco."
                acciones={[
                  { label: 'Ver otro día', onClick: () => setSelectedDay(localDayKey(addDays(new Date(selectedDay), 1))) },
                  ...(instructorSel !== CUALQUIERA ? [{ label: 'Cualquier instructora', onClick: () => setInstructorSel(CUALQUIERA) }] : []),
                ]}
              />
            )}
          </div>

          <button
            type="button" disabled={!booking} onClick={() => { if (booking) { setResultado(null); setConfirmando(true); } }}
            style={{
              width: '100%', height: 50, marginTop: 22, borderRadius: radius.pillBtnMd, border: 'none',
              fontFamily: sans, fontWeight: 700, fontSize: 14.5, letterSpacing: '.01em',
              background: primary, color: primaryFg,
              cursor: booking ? 'pointer' : 'not-allowed', opacity: booking ? 1 : 0.55,
            }}>
            {booking ? `Continuar · ${precioServicio ?? fmtHora(booking.inicio)}` : 'Elige una hora para continuar'}
          </button>
        </div>
      )}

      {/* Hoja de confirmación */}
      <PublicSheet
        open={confirmando && !!(booking && servicio)}
        onClose={cerrarSheet}
        label={resultado && 'ok' in resultado ? 'Cita reservada' : 'Confirmar cita'}
        // La superficie de la paleta, no `bg-white`: con Carbón su caja interior
        // (`--portal-surface-2`) se oscurecía y dejaba la letra del PANEL,
        // oscura, encima (1,2:1). Mismo arreglo que la hoja legal de la página.
        sheetClassName="bg-[var(--portal-surface)] w-full max-w-sm rounded-3xl p-6 relative shadow-2xl"
        // ⚠️ Esta hoja era la ÚNICA del flujo que no participaba del protocolo
        // de anclaje del iframe: dentro de un widget auto-dimensionado se
        // anclaba al fondo del iframe entero, a cientos de píxeles de lo que
        // la persona ve. «Citas» es una pestaña embebible por sí sola
        // (`?tab=citas`), así que le pasa exactamente igual que a «Clases»
        // antes de arreglarlo.
        overlayStyle={overlayStyle}
      >
        {booking && servicio && (
          <>
            <button onClick={cerrarSheet} aria-label="Cerrar" className="absolute top-4 right-4 text-[var(--portal-muted)] hover:text-[var(--portal-ink)]">
              <X size={18} />
            </button>

            {resultado && 'ok' in resultado ? (
              <div className="flex flex-col items-center text-center gap-4 py-2">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${exito} 12%, var(--portal-surface))` }}>
                  <CheckCircle2 size={30} style={{ color: exito }} />
                </div>
                <div>
                  <p className="text-[var(--portal-ink)] font-extrabold text-xl">¡Cita reservada!</p>
                  <p className="text-[var(--portal-muted)] text-sm mt-1 capitalize">{fmtDiaLargo(booking.inicio)} · {fmtHora(booking.inicio)}</p>
                </div>
                {/* El texto sobre la marca es su foreground, no blanco fijo: con
                    Carbón la marca se aclara y el blanco encima no se leía. */}
                <button onClick={cerrarSheet} className="w-full py-3 rounded-2xl text-sm font-bold" style={{ backgroundColor: primary, color: primaryFg }}>
                  Hecho
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-[var(--portal-ink)] font-bold text-lg mb-4">Confirmar cita</h2>
                <div className="rounded-2xl p-4 mb-4 bg-[var(--portal-surface-2)] border border-[var(--portal-line)] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: servicio.color ?? primary }} />
                    <p className="text-[var(--portal-ink)] font-bold">{servicio.nombre}</p>
                  </div>
                  <p className="text-[var(--portal-muted)] text-sm capitalize">{fmtDiaLargo(booking.inicio)}</p>
                  <p className="text-[var(--portal-muted)] text-sm">{fmtHora(booking.inicio)} – {fmtHora(booking.fin)} · {servicio.duracionMin} min</p>
                  {precioServicio && <p className="text-[var(--portal-muted)] text-sm">{precioServicio}</p>}
                </div>
                {resultado && 'error' in resultado && (
                  <div className="mb-3 px-4 py-3 rounded-xl text-sm text-destructive bg-destructive/10 border border-destructive/30" style={{ color: peligro }}>{resultado.error}</div>
                )}
                {!autenticada && (
                  <p className="text-[var(--portal-muted)] text-xs mb-3">Necesitas acceder con tu email para reservar.</p>
                )}
                <button onClick={confirmar} disabled={enviando}
                  className="w-full py-3 rounded-2xl font-bold transition-all disabled:opacity-50"
                  style={{ backgroundColor: primary, color: primaryFg }}>
                  {enviando ? 'Reservando…' : autenticada ? 'Confirmar cita' : 'Acceder para reservar'}
                </button>
              </>
            )}
          </>
        )}
      </PublicSheet>
    </div>
  );
}

/** Patrón único de estado no feliz (docs/widget-reservas-fase4-brief-diseno.md):
 *  icono circular 52px, título display, cuerpo acotado, 1-2 CTAs. Versión
 *  local: `citas-publica.tsx` no monta `ReservaCalendario`, así que no
 *  hereda su `EstadoVacio`/`EstadoErrorRed` internos. */
function EstadoNoFeliz({ tono, titulo, cuerpo, ctaLabel, onCta, acciones, peligro }: {
  tono: 'vacio' | 'error'; titulo: string; cuerpo: string;
  /** El rojo legible sobre fondo oscuro (ver `t` en `CitasPublicaProps`); sin él, el de siempre. */
  peligro?: string;
  ctaLabel?: string; onCta?: () => void;
  acciones?: { label: string; onClick: () => void }[];
}) {
  const err = tono === 'error';
  return (
    <div style={{ background: 'var(--portal-surface)', border: '1px solid var(--portal-line)', borderRadius: radius.card, padding: '38px 24px', textAlign: 'center', boxShadow: shadow.card }} role={err ? 'alert' : undefined}>
      <div style={{
        width: 52, height: 52, borderRadius: 999, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: err ? semantic.danger.soft : 'var(--portal-velo)', color: err ? (peligro ?? semantic.danger.text) : 'var(--portal-muted)',
      }}>
        {err ? <AlertCircle size={22} /> : <Calendar size={22} />}
      </div>
      <p style={{ fontFamily: serif, fontSize: 20, marginTop: 14, color: 'var(--portal-ink)' }}>{titulo}</p>
      <p style={{ fontSize: 13, color: 'var(--portal-muted)', marginTop: 6, maxWidth: 320, marginInline: 'auto' }}>{cuerpo}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
        {ctaLabel && onCta && (
          <button type="button" onClick={onCta} style={botonVacio(err)}>{ctaLabel}</button>
        )}
        {acciones?.map(a => (
          <button key={a.label} type="button" onClick={a.onClick} style={botonVacio(false)}>{a.label}</button>
        ))}
      </div>
    </div>
  );
}
function botonVacio(lleno: boolean) {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 42, padding: '0 18px',
    borderRadius: 999, fontFamily: sans, fontWeight: 700, fontSize: 13, cursor: 'pointer' as const,
    background: lleno ? 'var(--portal-brand)' : 'transparent',
    color: lleno ? 'var(--portal-brand-foreground)' : 'var(--portal-ink)',
    border: lleno ? 'none' : '1px solid var(--portal-line)',
  };
}

/** Título de la pestaña en el estado vacío. Con servicios, el titular es el de
 *  la propia tarjeta («Selecciona tu cita»): dos títulos seguidos repetían la
 *  pestaña. Sin servicios no hay nada que elegir, así que no se invita a ello. */
function CabeceraCitas() {
  return (
    <>
      <div style={{ fontFamily: serif, fontWeight: pesoTitular('normal'), fontSize: cq(28, 6.5, 34), lineHeight: 1 }}>Citas</div>
      <p style={{ fontSize: 13, color: 'var(--portal-muted)', marginTop: 8, maxWidth: 460 }}>
        Sesiones individuales con el equipo.
      </p>
    </>
  );
}
