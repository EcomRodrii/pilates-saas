'use client';

// La hoja de reserva — pieza del prototipo navegable (pantalla «Clases»).
//
// Se abre al tocar una clase libre: dice qué es, cuándo y con quién, deja
// elegir plaza en la sala y confirma. La rejilla de plazas es lo que la
// distingue de un botón de «reservar» a secas: en un estudio de reformer la
// plaza importa —espejo, ventana, cerca de la instructora— y elegirla aquí
// evita la conversación de «¿me puedes cambiar a la 3?» al llegar.
//
// Elegir plaza es OPCIONAL a propósito: hay salas sin plazas numeradas, y
// obligar a elegir en una sala de mat sería inventarse un paso.
//
// El morph de confirmación (2026-08, feedback de 49 propietarias: "no
// transmite que esté haciendo nada"): antes, el padre cerraba la hoja en
// cuanto llegaba la respuesta del servidor, éxito o error. Ahora la hoja
// posee su propio ciclo — `onConfirmar` devuelve el resultado REAL en vez de
// nada — y el mismo botón muta en su sitio: spinner mientras espera,
// "Reservado · …" ~1.2s antes de cerrarse sola en éxito, o el motivo dentro
// de la hoja (sin cerrarla) en error. Sigue sin haber optimismo: no se dice
// nada hasta que el servidor responde (bug #500).
//
// Rediseño P0 (fidelidad a "Tentare Studio App", sección "SHEET CLASE"):
//   1. Grid de plazas 2D real (fila/columna de `Spot`, no 7 columnas fijas) —
//      la sala se ve tal cual es, no empaquetada en un ancho arbitrario.
//   2. Card de instructora con foto más grande, "Ver perfil" y su valoración
//      agregada (dato REAL — `Instructor.valoracion`, no una estrella
//      inventada; por debajo del mínimo no se pinta nada, ver
//      lib/portal-tema/valoracion.ts).
//   3. "Quién más va" con datos reales de privacidad
//      (lib/social-companeras-portal.ts), pasado por quien monta la hoja.
//   4. Banda de bono/pago con color real (marca si está cubierta, tono
//      neutro si hay que pagar aparte) y ventana de cancelación REAL
//      (heredaOverride tipo→estudio, no un "12h" fijo).
//   5. Pantalla de confirmación propia (ya no cierra sola a 1.2s): check +
//      anillo, detalle de la reserva, calendario si se confirmó, y "Ver mis
//      reservas" para cerrar.
//   6. `modoEspera`: si la clase ya está llena AL ABRIR la hoja, en vez del
//      grid de plazas se explica la lista de espera — el botón sigue siendo
//      el mismo `onConfirmar` de siempre (el servidor decide LISTA_ESPERA).

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, AlertTriangle, MapPin, Navigation, Star } from 'lucide-react';
import { useModo } from '@/lib/portal-modo';
import { useStudio } from '@/lib/studio-context';
import {
  EASE, dur, transicion, display, micro, texto, radio, altura, sombra, cristal, desenfoque,
} from '@/lib/portal-design';
import { AforoIndicator } from '@/components/portal/ui';
import { BotonesCalendario } from '@/components/portal/botones-calendario';
import { semantic } from '@/lib/portal-tokens';
import { seArreglaComprando } from '@/lib/bono-logic';
import { valoracionParaPantalla } from '@/lib/portal-tema/valoracion';
import type { EstadoReserva, Spot } from '@/lib/types';
import type { QuienVaAEstaClase } from '@/lib/social-companeras-portal.ts';

export interface ClaseParaReservar {
  id: string;
  inicio: string;
  fin: string;
  nombre: string;
  nivel: string | null;
  salaNombre: string | null;
  instructorNombre: string | null;
  /** null/undefined = sin foto, se pinta la inicial (mismo criterio que la lista). */
  instructorFotoUrl?: string | null;
  /**
   * Id real de la instructora — para el link "Ver perfil"
   * (`/portal/[slug]/instructores/[instructorId]`) y para leer su valoración
   * agregada vía `useStudio()` (`Instructor.valoracion`). undefined/null =
   * sin id a mano: se enlaza al listado general y no se pinta valoración.
   */
  instructorId?: string | null;
  aforoMaximo: number;
  ocupadas: number;
  spots: Spot[];
  spotsOcupados: string[];
  /** Precio de clase suelta si su bono no la cubre; null = incluida. */
  precio: number | null;
  /** Sesiones que le quedarán al bono si confirma. null = no aplica. */
  sesionesTrasReservar: number | null;
  /**
   * Horas de antelación para cancelar sin perder la sesión, YA resueltas
   * (`heredaOverride(tipoClase.ventanaCancelacionHoras, studio.cancelacionVentanaHoras)`,
   * lib/booking-logic.ts). undefined = quien monta la hoja no la calculó —
   * no se pinta la línea de cancelación (nunca un "12h" inventado).
   */
  ventanaCancelacionHoras?: number;
  /**
   * Cuántas socias hay YA en lista de espera para esta sesión — cuenta real
   * sobre `reservas` (estado LISTA_ESPERA), nunca una posición inventada.
   * undefined/0 = no se menciona ningún número en el aviso de espera.
   */
  enEspera?: number;
}

export type ResultadoConfirmar =
  | { ok: true; estado: EstadoReserva }
  | { ok: false; error: string };

const ETIQUETA_ESTADO: Partial<Record<EstadoReserva, string>> = {
  LISTA_ESPERA: 'En lista de espera',
  PENDIENTE_APROBACION: 'Pendiente de aprobación',
};

export function HojaReserva({
  clase, onClose, onConfirmar, onComprar, quienVa,
}: {
  clase: ClaseParaReservar | null;
  onClose: () => void;
  onConfirmar: (spotId: string | null) => Promise<ResultadoConfirmar>;
  /**
   * Llevar a la tienda. Opcional a propósito: la hoja no sabe —ni debe saber—
   * dónde vive el catálogo, así que decide quien la monta. Sin esta prop el
   * error se pinta como siempre, sin botón.
   */
  onComprar?: () => void;
  /**
   * "Quién más va" (Community & Messaging OS, mismo dato/patrón que
   * `app/portal/[slug]/clases/[sesionId]/page.tsx`) — lo calcula y lo pide
   * quien monta la hoja (necesita un fetch propio a
   * `/api/public/social/clase/[sesionId]`). undefined/null = no se pinta la
   * sección (preview del editor, o todavía sin respuesta).
   */
  quienVa?: QuienVaAEstaClase | null;
}) {
  const { t, noche } = useModo();
  const { slug } = useParams<{ slug: string }>();
  const { instructores, studio } = useStudio();
  const [spotElegido, setSpotElegido] = useState<string | null>(null);
  const [estado, setEstado] = useState<'reposo' | 'enviando' | 'exito' | 'error'>('reposo');
  const [resultadoExito, setResultadoExito] = useState<EstadoReserva | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  // Nota: quien monta esta hoja le pasa `key={clase.id}`, así que al cambiar de
  // clase React la remonta y estos estados vuelven solos a su valor inicial.
  // Sincronizarlos con un efecto era la otra opción, y sobra: la 7 de la Sala
  // Norte no es la 7 de la Sala Sur, y lo que hace falta es empezar de cero,
  // no ir corrigiendo después.

  const abierta = clase != null;
  const libres = clase ? Math.max(0, clase.aforoMaximo - clase.ocupadas) : 0;
  // Clase llena AL ABRIR la hoja (antes de intentar nada): en vez del grid de
  // plazas y "Confirmar reserva", se explica la lista de espera. El botón
  // sigue llamando al MISMO `onConfirmar` — es el servidor quien decide
  // CONFIRMADA/LISTA_ESPERA, esto es solo presentación previa.
  const modoEspera = abierta && libres <= 0;
  const ocupados = new Set(clase?.spotsOcupados ?? []);
  // El orden de la sala, no el de la base de datos: fila y luego columna es
  // como se ve la sala desde la puerta. Con el grid 2D esto ya no decide el
  // layout (lo hacen `gridRow`/`gridColumn` explícitos), pero sigue
  // ordenando el DOM para que el foco de teclado recorra la sala en orden.
  const plazas = [...(clase?.spots ?? [])].sort((a, b) => a.fila - b.fila || a.columna - b.columna || a.numero - b.numero);
  const columnasSala = plazas.length > 0 ? Math.max(...plazas.map(p => p.columna)) + 1 : 0;

  // Instructora completa (para valoración agregada) — solo si quien montó la
  // hoja pasó su id real. Nunca se busca por nombre: dos instructoras podrían
  // compartirlo.
  const instructorFull = clase?.instructorId ? instructores.find(i => i.id === clase.instructorId) ?? null : null;
  const valoracionInstructora = valoracionParaPantalla(instructorFull?.valoracion ?? null);
  const hrefPerfilInstructor = clase?.instructorId
    ? `/portal/${slug}/instructores/${clase.instructorId}`
    : `/portal/${slug}/instructores`;

  const totalQuienVa = quienVa ? quienVa.companeras.length + quienVa.otrasSinNombre : 0;

  const fecha = clase
    ? new Date(clase.inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })
    : '';
  const diaCorto = clase
    ? new Date(clase.inicio).toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')
    : '';
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  async function confirmarClick() {
    if (!clase || estado === 'enviando') return;
    setEstado('enviando');
    const r = await onConfirmar(spotElegido);
    if (r.ok) {
      setResultadoExito(r.estado);
      setEstado('exito');
    } else {
      setMensajeError(r.error);
      setEstado('error');
    }
  }

  // Cerrar mientras se envía (backdrop, arrastre) no cancela la petición en
  // curso — `onConfirmar` sigue viva de fondo y el padre puede acabar
  // anunciando "Reservada" segundos después de que la socia creyera haber
  // cerrado sin más. Ya que no se puede abortar la petición desde aquí, se
  // bloquea el cierre mientras está en vuelo: la socia ve el spinner hasta
  // que el servidor responde, igual que ya pasa con el propio botón.
  function cerrar() {
    if (estado === 'enviando') return;
    onClose();
  }

  // `semantic.danger.text` no pasa AA en modo noche (ver comentario en
  // portal-tokens.ts) — usa la variante calibrada para ese modo. Mismo
  // criterio para success/warning.
  const dangerColor = noche ? semantic.danger.textNoche : semantic.danger.text;
  const successColor = noche ? semantic.success.textNoche : semantic.success.text;
  const warningColor = noche ? semantic.warning.textNoche : semantic.warning.text;

  const etiquetaBoton = estado === 'enviando'
    ? 'Un momento…'
    : (modoEspera ? 'Unirme a la lista de espera' : 'Confirmar reserva');

  return (
    <>
      <div
        onClick={cerrar}
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          opacity: abierta ? 1 : 0, pointerEvents: abierta ? 'auto' : 'none',
          background: noche ? 'rgba(8,9,6,.44)' : 'rgba(34,38,31,.24)',
          ...cristal(desenfoque.backdrop, 120),
          transition: `opacity ${dur.tab}ms ${EASE}`,
        }}
      />

      <div
        role="dialog"
        aria-modal={abierta}
        aria-label={clase ? `Reservar ${clase.nombre}` : 'Reservar'}
        style={{
          position: 'fixed', left: 12, right: 12, zIndex: 41,
          // ⚠️ Por encima de la barra de abajo, no detrás. Con `bottom: 12` la
          // hoja llegaba hasta el borde de la pantalla y sus últimos ~70px
          // quedaban debajo del menú — en una sala con plazas numeradas la
          // lista crece y el botón de CONFIRMAR es justo lo último: la socia
          // elegía su plaza y no veía el botón. Sale de la altura real de la
          // barra (la fija el tema, `--portal-tabbar-height`) más su hueco,
          // así que vale igual para la barra flotante y para la clásica.
          bottom: 'calc(12px + var(--portal-tabbar-height, 64px) + 22px + env(safe-area-inset-bottom))',
          maxWidth: 456, margin: '0 auto',
          background: t.bg, borderRadius: radio.hoja,
          border: `1px solid ${noche ? 'rgba(243,241,233,.10)' : 'rgba(255,255,255,.8)'}`,
          boxShadow: sombra.sheet, padding: '16px 24px 24px',
          maxHeight: 'calc(100dvh - var(--portal-tabbar-height, 64px) - 56px)', overflowY: 'auto',
          opacity: abierta ? 1 : 0,
          pointerEvents: abierta ? 'auto' : 'none',
          transform: abierta ? 'translateY(0) scale(1)' : 'translateY(114%) scale(.98)',
          transition: `transform ${dur.sheet}ms ${EASE}, opacity 500ms ease`,
        }}
      >
        <button
          type="button" onClick={cerrar} aria-label="Cerrar" disabled={estado === 'enviando'}
          style={{ display: 'block', width: 40, height: 4, borderRadius: 4, margin: '0 auto', background: noche ? '#3A3F33' : '#D8D4C9', border: 'none', padding: 0 }}
        />

        {clase && estado === 'exito' ? (
          // ── Confirmación (paso 2) ──────────────────────────────────────
          // Sustituye el cierre automático a 1.2s: ahora la socia decide
          // cuándo cerrar, pulsando "Ver mis reservas".
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 4px 4px' }}>
            <div style={{ position: 'relative', width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              {/* Anillo de ping — reutiliza @keyframes wa-fab-ring (ya en
                  app/globals.css, hoy solo la usa el FAB de WhatsApp) en vez
                  de duplicar una animación de anillo nueva para el mismo
                  efecto. */}
              <span
                aria-hidden
                style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  border: `2px solid ${successColor}`,
                  animation: 'wa-fab-ring 1.8s ease-out infinite',
                }}
              />
              <span style={{
                position: 'relative', width: 52, height: 52, borderRadius: '50%',
                background: semantic.success.soft, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CheckCircle2 size={26} style={{ color: successColor }} />
              </span>
            </div>
            <h2 style={{ ...display(24), color: t.ink }}>
              {resultadoExito ? (ETIQUETA_ESTADO[resultadoExito] ?? 'Reserva confirmada') : 'Reserva confirmada'}
            </h2>
            {/* Detalle en dos líneas — verificado contra capturas reales:
                antes solo decía clase+hora; el diseño real también nombra la
                plaza elegida, el estudio y la instructora, todo dato ya
                disponible aquí (nunca uno nuevo). */}
            <p style={{ ...texto.meta, color: t.muted, marginTop: 8 }}>
              {clase.nombre}
              {spotElegido && plazas.find(p => p.id === spotElegido) && ` · plaza ${plazas.find(p => p.id === spotElegido)!.numero}`}
            </p>
            <p style={{ ...texto.meta, color: t.muted, marginTop: 2 }}>
              {diaCorto} {hora(clase.inicio)}
              {studio?.nombre && ` · ${studio.nombre}`}
              {clase.instructorNombre && ` · ${clase.instructorNombre}`}
            </p>
            {/* El bono solo se consume de verdad si queda CONFIRMADA — en
                lista de espera/pendiente de aprobación todavía no se ha
                gastado ninguna sesión. */}
            {resultadoExito === 'CONFIRMADA' && clase.sesionesTrasReservar != null && (
              <p style={{ ...texto.nota, color: t.muted, marginTop: 10 }}>
                Bono: te quedan {clase.sesionesTrasReservar} sesion{clase.sesionesTrasReservar === 1 ? '' : 'es'}
              </p>
            )}
            {resultadoExito === 'CONFIRMADA' && (
              <div style={{ marginTop: 20, width: '100%', display: 'flex', gap: 8 }}>
                {/* "Cómo llegar" — verificado contra capturas reales, mismo
                    enlace de Google Maps que ya usa portal-reservas-view.tsx,
                    no un SDK nuevo. */}
                {studio?.direccion && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([studio.direccion, studio.ciudad].filter(Boolean).join(', '))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: 1, height: 42, borderRadius: 21, border: `1px solid ${t.line}`,
                      background: 'transparent', color: t.ink, textDecoration: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      ...texto.metaFuerte, fontSize: 12.5,
                    }}
                  >
                    <Navigation size={13} /> Cómo llegar
                  </a>
                )}
                <div style={{ flex: 1 }}>
                  <BotonesCalendario
                    evento={{
                      id: clase.id, inicio: clase.inicio, fin: clase.fin, titulo: clase.nombre,
                      instructora: clase.instructorNombre ?? undefined, sala: clase.salaNombre ?? undefined,
                      estudioNombre: studio?.nombre ?? 'Tu estudio',
                      estudioDireccion: [studio?.direccion, studio?.ciudad].filter(Boolean).join(', ') || undefined,
                    }}
                    t={t}
                  />
                </div>
              </div>
            )}
            <Link
              href={`/portal/${slug}/reservas`}
              style={{
                marginTop: 22, width: '100%', height: altura.botonCta, borderRadius: radio.botonCta,
                background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
                ...texto.botonCta, display: 'flex', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none', boxShadow: sombra.cta,
              }}
            >
              Ver mis reservas
            </Link>
          </div>
        ) : clase && (
          <>
            <div style={{ ...micro(9, 0.26, 600), color: t.micro, marginTop: 22 }}>
              {fecha} · {hora(clase.inicio)} – {hora(clase.fin)}
            </div>
            <h2 style={{ ...display(32, false, 1.05), color: t.ink, marginTop: 10, textWrap: 'pretty' } as React.CSSProperties}>
              {clase.nombre}
            </h2>

            {clase.instructorNombre && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                {clase.instructorFotoUrl ? (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={clase.instructorFotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ) : (
                  <span style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: t.surface2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: t.ink,
                  }}>
                    {clase.instructorNombre.trim()[0]?.toUpperCase()}
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ ...texto.metaFuerte, color: t.ink }}>{clase.instructorNombre}</span>
                    {/* Valoración REAL (Instructor.valoracion) — nunca se
                        pinta si no llega al mínimo de reseñas para enseñarse
                        (valoracionParaPantalla), así que hoy no se ve casi
                        nunca: es correcto, no un hueco. */}
                    {valoracionInstructora && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: t.muted }}>
                        <Star size={10} fill={t.heroAccent} color={t.heroAccent} />
                        {valoracionInstructora.nota}
                      </span>
                    )}
                  </div>
                  <Link
                    href={hrefPerfilInstructor}
                    style={{ ...texto.nota, color: t.heroAccent, textDecoration: 'none' }}
                  >
                    Ver perfil
                  </Link>
                </div>
              </div>
            )}

            {(clase.nivel || clase.salaNombre) && (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 12 }}>
                {clase.nivel && <span style={{ ...texto.meta, color: t.muted }}>{clase.nivel}</span>}
                {clase.salaNombre && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, ...texto.meta, color: t.muted }}>
                    <MapPin size={12} style={{ flexShrink: 0 }} />
                    {clase.salaNombre}
                  </span>
                )}
              </div>
            )}

            {/* "Quién más va" — datos reales de privacidad
                (lib/social-companeras-portal.ts), pasados por quien monta la
                hoja. Se omite entero si no hay nada que decir: ni "vas sola"
                ni un hueco vacío. */}
            {quienVa && totalQuienVa > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
                <div style={{ display: 'flex' }}>
                  {quienVa.companeras.slice(0, 4).map((c, i) => (
                    <span
                      key={c.socioId}
                      style={{
                        width: 26, height: 26, borderRadius: '50%', background: t.surface2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10.5, fontWeight: 700, color: t.ink, flexShrink: 0,
                        border: `2px solid ${t.bg}`, marginLeft: i === 0 ? 0 : -9,
                      }}
                    >
                      {c.nombre.trim().charAt(0).toUpperCase()}
                    </span>
                  ))}
                  {quienVa.otrasSinNombre > 0 && (
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%', background: t.surface2, color: t.muted,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700,
                      flexShrink: 0, border: `2px solid ${t.bg}`, marginLeft: quienVa.companeras.length > 0 ? -9 : 0,
                    }}>
                      +{quienVa.otrasSinNombre}
                    </span>
                  )}
                </div>
                <span style={{ ...texto.nota, color: t.muted }}>
                  {totalQuienVa} compañera{totalQuienVa === 1 ? '' : 's'} ya apuntada{totalQuienVa === 1 ? '' : 's'}
                </span>
              </div>
            )}

            {modoEspera ? (
              // Clase llena al abrir la hoja: nada de grid ni de "Confirmar
              // reserva" — se explica la lista de espera. El botón de abajo
              // sigue llamando al MISMO `onConfirmar`.
              <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999,
                  background: semantic.warning.soft, color: warningColor,
                  ...micro(9, 0.18, 700),
                }}>
                  <AlertTriangle size={12} />
                  Clase llena
                </span>
                <p style={{ ...texto.meta, color: t.muted, marginTop: 14, lineHeight: 1.5, maxWidth: 320 }}>
                  {clase.enEspera != null && clase.enEspera > 0
                    ? `Ya hay ${clase.enEspera} persona${clase.enEspera === 1 ? '' : 's'} en la lista de espera. Puedes unirte: te avisaremos si se libera un hueco.`
                    : 'Puedes unirte a la lista de espera. Te avisaremos si se libera un hueco.'}
                </p>
              </div>
            ) : plazas.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26 }}>
                  <span style={{ ...display(22), color: t.ink }}>Elige tu plaza</span>
                  <AforoIndicator libres={libres} umbralUrgencia={2} style={{ fontSize: 11.5, fontWeight: 500 }} />
                </div>
                {/* Grid 2D real: `gridColumn`/`gridRow` salen de fila/columna
                    reales de cada plaza (`Spot`, lib/types.ts), no de un
                    `repeat(7, 1fr)` fijo que empaquetaba la sala en un ancho
                    arbitrario. Una sala de 1 sola fila o 1 sola columna
                    simplemente ocupa 1 fila/columna de grid — sigue
                    funcionando sin ningún caso especial. */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columnasSala}, 1fr)`, gap: 8, marginTop: 14 }}>
                  {plazas.map(sp => {
                    const libre = !ocupados.has(sp.id);
                    const elegida = spotElegido === sp.id;
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        disabled={!libre}
                        aria-pressed={elegida}
                        aria-label={`Plaza ${sp.numero}${libre ? '' : ' (ocupada)'}`}
                        onClick={() => setSpotElegido(elegida ? null : sp.id)}
                        style={{
                          gridColumn: sp.columna + 1,
                          gridRow: sp.fila + 1,
                          height: 42, borderRadius: 14,
                          border: elegida ? '1.5px solid var(--portal-brand)' : `1px solid ${t.line}`,
                          background: libre ? t.surface : 'transparent',
                          color: libre ? t.ink : t.micro,
                          ...texto.nota, fontWeight: 500,
                          cursor: libre ? 'pointer' : 'default',
                          opacity: libre ? 1 : 0.45,
                          transition: transicion(['border-color', 'background'], dur.color),
                        }}
                      >
                        {sp.numero}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div style={{
              marginTop: 24, textAlign: 'center', borderRadius: 18, padding: '14px 16px',
              background: clase.precio != null ? 'transparent' : semantic.success.soft,
              border: clase.precio != null ? `1.5px solid ${t.ink}` : 'none',
            }}>
              {clase.precio != null ? (
                <>
                  <div style={{ ...texto.metaFuerte, color: t.ink }}>Clase suelta · {clase.precio} €</div>
                  <div style={{ ...texto.nota, color: t.muted, marginTop: 4 }}>Tu bono no cubre esta clase</div>
                </>
              ) : (
                <>
                  <div style={{ ...texto.metaFuerte, color: successColor }}>Incluida en tu bono</div>
                  {clase.sesionesTrasReservar != null && (
                    <div style={{ ...texto.nota, color: t.muted, marginTop: 4 }}>
                      {clase.sesionesTrasReservar === 0
                        ? 'Será la última sesión de tu bono'
                        : `Quedarán ${clase.sesionesTrasReservar} sesion${clase.sesionesTrasReservar === 1 ? '' : 'es'}`}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Ventana de cancelación REAL (heredaOverride tipo→estudio) —
                nunca un "12h" fijo. undefined = quien montó la hoja no la
                calculó, y entonces no se dice nada en vez de inventar una. */}
            {clase.ventanaCancelacionHoras != null && (
              <p style={{ ...texto.nota, color: t.muted, textAlign: 'center', marginTop: 10 }}>
                {clase.ventanaCancelacionHoras > 0
                  ? `Cancelación gratuita hasta ${clase.ventanaCancelacionHoras} h antes`
                  : 'Cancelación gratuita en cualquier momento'}
              </p>
            )}

            {estado === 'error' && mensajeError && (
              <div role="alert" style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 16,
                borderRadius: 14, padding: '11px 14px', background: semantic.danger.soft,
              }}>
                <AlertCircle size={15} style={{ color: dangerColor, flexShrink: 0, marginTop: 1 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: dangerColor }}>{mensajeError}</p>
                  {/* Si el fallo se arregla comprando, la salida va AQUÍ, en el
                      momento en que quiere reservar — no en otra pestaña que
                      tenga que encontrar sola. */}
                  {onComprar && seArreglaComprando(mensajeError) && (
                    <button
                      type="button"
                      onClick={onComprar}
                      style={{
                        marginTop: 8, background: 'none', border: 'none', padding: 0,
                        fontSize: 13, fontWeight: 700, color: dangerColor,
                        textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer',
                      }}
                    >
                      Ver los bonos
                    </button>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={estado === 'enviando'}
              aria-busy={estado === 'enviando'}
              aria-live="polite"
              onClick={confirmarClick}
              style={{
                width: '100%', height: altura.botonCta, borderRadius: radio.botonCta, marginTop: 18,
                background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
                ...texto.botonCta, border: 'none', cursor: estado === 'reposo' || estado === 'error' ? 'pointer' : 'default',
                boxShadow: sombra.cta, opacity: estado === 'enviando' ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: transicion(['transform', 'opacity', 'background']),
              }}
            >
              {estado === 'enviando' && (
                <span aria-hidden className="animate-spin" style={{ width: 14, height: 14, borderRadius: 999, border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.85, flexShrink: 0 }} />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etiquetaBoton}</span>
            </button>

            {modoEspera && (
              <p style={{ ...texto.nota, color: t.muted, textAlign: 'center', marginTop: 10 }}>
                Sin coste — solo reservas si se libera y tú confirmas.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
