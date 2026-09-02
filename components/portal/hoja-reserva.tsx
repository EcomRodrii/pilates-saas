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
//
// Fidelidad visual a "Tentare Studio App" (docs/diseno-referencia-portal,
// capturas 2026-08-31): valores LITERALES de `portal-app.css`/CHEATSHEET-CSS.md
// en vez de `useModo()`/`lib/portal-design.ts` — esta hoja es SIEMPRE clara
// (fondo #FAF9F5 fijo, sin variante noche), así que los tokens día/noche no
// aplican aquí. `<BotonesCalendario>` tampoco los necesita ya: sus propios
// estilos son literales.

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, AlertTriangle, MapPin, Navigation, Star } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { dur, transicion, sans, texto } from '@/lib/portal-design';
import { BotonesCalendario } from '@/components/portal/botones-calendario';
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

  // Badge de plazas (mismo patrón de 3 estados que portal-clases-view.tsx,
  // clases `.ap-badge--*` de portal-app.css) — aquí nunca hay estado
  // "reservada" (esta hoja solo se abre para una clase SIN reservar).
  const badgePlazas = libres <= 0
    ? { clase: 'ap-badge--llena', texto: 'Llena · lista' }
    : libres === 1
      ? { clase: 'ap-badge--pocas', texto: '1 plaza' }
      : { clase: 'ap-badge--ok', texto: `${libres} plazas` };

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

  const etiquetaBoton = estado === 'enviando'
    ? 'Un momento…'
    : (modoEspera ? 'Unirme a la lista de espera' : 'Confirmar reserva');

  return (
    <>
      {/* Velo (CHEATSHEET-CSS.md, Bottom sheet): rgba(15,15,15,.42), fade .3s
          — literal, ya no depende del modo noche/cristal del tema. */}
      <div
        onClick={cerrar}
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          opacity: abierta ? 1 : 0, pointerEvents: abierta ? 'auto' : 'none',
          background: 'rgba(15,15,15,.42)',
          transition: 'opacity .3s ease',
        }}
      />

      {/* Hoja (CHEATSHEET-CSS.md, Bottom sheet): a sangre con el borde
          inferior real (cubre la barra de navegación, como en el diseño),
          radius 24px 24px 0 0, handle 34×4px centrado a 9px, entrada
          translateY(110%→0) .38s con el spring exacto. */}
      <div
        role="dialog"
        aria-modal={abierta}
        aria-hidden={!abierta}
        aria-label={clase ? `Reservar ${clase.nombre}` : 'Reservar'}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41,
          maxWidth: 480, margin: '0 auto',
          background: '#FAF9F5', borderRadius: '24px 24px 0 0',
          boxShadow: '0 -18px 50px rgba(15,15,15,.25)',
          padding: '9px 20px calc(20px + env(safe-area-inset-bottom))',
          maxHeight: '92dvh', overflowY: 'auto',
          opacity: abierta ? 1 : 0,
          pointerEvents: abierta ? 'auto' : 'none',
          transform: abierta ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform .38s cubic-bezier(.34,1.3,.5,1), opacity .38s ease',
        }}
      >
        <button
          type="button" onClick={cerrar} aria-label="Cerrar" disabled={estado === 'enviando'}
          style={{ display: 'block', width: 34, height: 4, borderRadius: 4, margin: '0 auto', background: '#D9D6C9', border: 'none', padding: 0 }}
        />

        {clase && estado === 'exito' ? (
          // ── Confirmación (paso 2) ──────────────────────────────────────
          // Sustituye el cierre automático a 1.2s: ahora la socia decide
          // cuándo cerrar, pulsando "Ver mis reservas".
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '30px 4px 4px' }}>
            {/* Confirmación (CHEATSHEET-CSS.md, Bottom sheet): check 64px
                #4F8A5B + anillo apRing .9s + 6 partículas de confeti que
                salen del centro en distintas direcciones (apConf .9s,
                portal-app.css). */}
            <div style={{ position: 'relative', width: 76, height: 76, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <span aria-hidden style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '2px solid #4F8A5B', animation: 'apRing .9s ease-out' }} />
              {[
                { tx: -34, ty: -30, rot: -40, color: '#4F8A5B' },
                { tx: 32, ty: -32, rot: 35, color: '#C99A3C' },
                { tx: -40, ty: 12, rot: -60, color: '#C2503A' },
                { tx: 40, ty: 14, rot: 60, color: '#1A1A1A' },
                { tx: -14, ty: -42, rot: -15, color: '#C99A3C' },
                { tx: 16, ty: -44, rot: 20, color: '#4F8A5B' },
              ].map((p, i) => (
                <span
                  key={i} aria-hidden
                  style={{
                    position: 'absolute', top: '50%', left: '50%', width: 7, height: 11, marginTop: -5.5, marginLeft: -3.5,
                    background: p.color, borderRadius: 2,
                    animation: 'apConf .9s ease-out',
                    ['--tx' as string]: `${p.tx}px`, ['--ty' as string]: `${p.ty}px`, ['--rot' as string]: `${p.rot}deg`,
                  } as React.CSSProperties}
                />
              ))}
              <span style={{
                position: 'relative', width: 64, height: 64, borderRadius: '50%',
                background: '#4F8A5B', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CheckCircle2 size={30} style={{ color: '#FFFFFF' }} />
              </span>
            </div>
            <h2 style={{ fontFamily: sans, fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1, color: '#1A1A1A' }}>
              {resultadoExito ? (ETIQUETA_ESTADO[resultadoExito] ?? 'Reserva confirmada') : 'Reserva confirmada'}
            </h2>
            {/* Detalle en dos líneas — verificado contra capturas reales:
                antes solo decía clase+hora; el diseño real también nombra la
                plaza elegida, el estudio y la instructora, todo dato ya
                disponible aquí (nunca uno nuevo). */}
            <p style={{ ...texto.meta, color: '#5A5A52', marginTop: 8 }}>
              {clase.nombre}
              {spotElegido && plazas.find(p => p.id === spotElegido) && ` · plaza ${plazas.find(p => p.id === spotElegido)!.nombre}`}
            </p>
            <p style={{ ...texto.meta, color: '#5A5A52', marginTop: 2 }}>
              {diaCorto} {hora(clase.inicio)}
              {studio?.nombre && ` · ${studio.nombre}`}
              {clase.instructorNombre && ` · ${clase.instructorNombre}`}
            </p>
            {/* El bono solo se consume de verdad si queda CONFIRMADA — en
                lista de espera/pendiente de aprobación todavía no se ha
                gastado ninguna sesión. Verde (no gris): es una noticia
                buena, mismo tono que el resto de avisos de bono. */}
            {resultadoExito === 'CONFIRMADA' && clase.sesionesTrasReservar != null && (
              <p style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: '#3E6B4A', marginTop: 10 }}>
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
                      flex: 1, height: 42, borderRadius: 21, border: '1px solid #E5E3DA',
                      background: 'transparent', color: '#1A1A1A', textDecoration: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontFamily: sans, fontSize: 12.5, fontWeight: 700,
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
                  />
                </div>
              </div>
            )}
            <Link
              href={`/portal/${slug}/reservas`}
              className="ap-btn ap-btn--primario"
              style={{
                marginTop: 22, width: '100%', height: 50,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              Ver mis reservas
            </Link>
          </div>
        ) : clase && (
          <>
            {/* Título + badge de plazas en la misma fila (capturas reales:
                "5 plazas" va junto al nombre de la clase, no junto a "Elige
                tu plaza"), y la línea de fecha/hora debajo del título. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginTop: 22 }}>
              <h2 style={{ fontFamily: sans, fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.15, color: '#1A1A1A', textWrap: 'pretty', minWidth: 0 } as React.CSSProperties}>
                {clase.nombre}
              </h2>
              <span className={`ap-badge ${badgePlazas.clase}`} style={{ flexShrink: 0, marginTop: 3 }}>{badgePlazas.texto}</span>
            </div>
            <div style={{ ...texto.meta, color: '#5A5A52', marginTop: 6 }}>
              {fecha} · {hora(clase.inicio)} – {hora(clase.fin)}
            </div>

            {clase.instructorNombre && (
              <div className="ap-card" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '12px 14px' }}>
                {clase.instructorFotoUrl ? (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={clase.instructorFotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ) : (
                  <span style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: '#EFEDE4',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#1A1A1A',
                  }}>
                    {clase.instructorNombre.trim()[0]?.toUpperCase()}
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 700, color: '#1A1A1A' }}>{clase.instructorNombre}</span>
                    {/* Valoración REAL (Instructor.valoracion) — nunca se
                        pinta si no llega al mínimo de reseñas para enseñarse
                        (valoracionParaPantalla), así que hoy no se ve casi
                        nunca: es correcto, no un hueco. */}
                    {valoracionInstructora && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: sans, fontSize: 11, fontWeight: 700, color: '#5A5A52' }}>
                        <Star size={10} fill="#C99A3C" color="#C99A3C" />
                        {valoracionInstructora.nota}
                      </span>
                    )}
                  </div>
                  <Link
                    href={hrefPerfilInstructor}
                    style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: '#3E6B4A', textDecoration: 'none' }}
                  >
                    Ver perfil
                  </Link>
                </div>
              </div>
            )}

            {(clase.nivel || clase.salaNombre) && (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 12 }}>
                {clase.nivel && <span style={{ ...texto.meta, color: '#5A5A52' }}>{clase.nivel}</span>}
                {clase.salaNombre && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, ...texto.meta, color: '#5A5A52' }}>
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
              <div className="ap-card" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex' }}>
                  {quienVa.companeras.slice(0, 4).map((c, i) => (
                    <span
                      key={c.socioId}
                      style={{
                        width: 26, height: 26, borderRadius: '50%', background: '#EFEDE4',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10.5, fontWeight: 700, color: '#1A1A1A', flexShrink: 0,
                        border: '2px solid #FAF9F5', marginLeft: i === 0 ? 0 : -9,
                      }}
                    >
                      {c.nombre.trim().charAt(0).toUpperCase()}
                    </span>
                  ))}
                  {quienVa.otrasSinNombre > 0 && (
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%', background: '#EFEDE4', color: '#5A5A52',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700,
                      flexShrink: 0, border: '2px solid #FAF9F5', marginLeft: quienVa.companeras.length > 0 ? -9 : 0,
                    }}>
                      +{quienVa.otrasSinNombre}
                    </span>
                  )}
                </div>
                <span style={{ ...texto.nota, color: '#5A5A52' }}>
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
                  background: '#F6EEDD', color: '#8A6A25',
                  fontFamily: sans, fontSize: 9, fontWeight: 700, letterSpacing: '.18em', paddingLeft: '.18em', textTransform: 'uppercase',
                }}>
                  <AlertTriangle size={12} />
                  Clase llena
                </span>
                <p style={{ ...texto.meta, color: '#5A5A52', marginTop: 14, lineHeight: 1.5, maxWidth: 320 }}>
                  {clase.enEspera != null && clase.enEspera > 0
                    ? `Ya hay ${clase.enEspera} persona${clase.enEspera === 1 ? '' : 's'} en la lista de espera. Puedes unirte: te avisaremos si se libera un hueco.`
                    : 'Puedes unirte a la lista de espera. Te avisaremos si se libera un hueco.'}
                </p>
              </div>
            ) : plazas.length > 0 && (
              <>
                {/* Etiqueta mono (CHEATSHEET-CSS.md, `.ap-label`): "ELIGE TU
                    PLAZA · SALA 2" — antes un h2 grande a juego con "Elige tu
                    plaza" y el badge de plazas al lado; en las capturas
                    reales ese badge vive junto al título de arriba y aquí
                    solo hay una etiqueta pequeña. */}
                <div style={{ marginTop: 26 }}>
                  <span className="ap-label">
                    Elige tu plaza{clase.salaNombre ? ` · ${clase.salaNombre}` : ''}
                  </span>
                </div>
                {/* Grid 2D real: `gridColumn`/`gridRow` salen de fila/columna
                    reales de cada plaza (`Spot`, lib/types.ts), no de un
                    `repeat(7, 1fr)` fijo que empaquetaba la sala en un ancho
                    arbitrario. Una sala de 1 sola fila o 1 sola columna
                    simplemente ocupa 1 fila/columna de grid — sigue
                    funcionando sin ningún caso especial. */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columnasSala}, 1fr)`, gap: 8, marginTop: 10 }}>
                  {plazas.map(sp => {
                    const libre = !ocupados.has(sp.id);
                    const elegida = spotElegido === sp.id;
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        disabled={!libre}
                        aria-pressed={elegida}
                        aria-label={`Plaza ${sp.nombre}${libre ? '' : ' (ocupada)'}`}
                        onClick={() => setSpotElegido(elegida ? null : sp.id)}
                        style={{
                          gridColumn: sp.columna + 1,
                          gridRow: sp.fila + 1,
                          height: 58, borderRadius: 14,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                          border: elegida ? '1.5px solid #1A1A1A' : '1px solid #E5E3DA',
                          background: elegida ? '#1A1A1A' : libre ? '#FFFFFF' : '#EFEDE4',
                          cursor: libre ? 'pointer' : 'default',
                          opacity: libre ? 1 : 0.75,
                          transition: transicion(['border-color', 'background'], dur.color),
                        }}
                      >
                        <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 800, color: elegida ? '#F1ECE1' : libre ? '#1A1A1A' : '#98A093' }}>
                          {sp.nombre}
                        </span>
                        <span style={{ fontFamily: sans, fontSize: 9, fontWeight: 500, color: elegida ? 'rgba(241,236,225,.75)' : '#98A093' }}>
                          {elegida ? 'tuyo' : libre ? 'libre' : 'ocupado'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Aviso bono (CHEATSHEET-CSS.md, Bottom sheet): bg #EAF0E7
                radius 14px, check circular 22px #4F8A5B, texto 12px/700
                #2E5A3A. La clase suelta (sin bono que la cubra) no está en el
                diseño de referencia — mantiene un tratamiento neutro propio. */}
            <div style={{
              marginTop: 24, borderRadius: clase.precio != null ? 18 : 14, padding: clase.precio != null ? '14px 16px' : '12px 14px',
              textAlign: clase.precio != null ? 'center' : 'left',
              display: clase.precio != null ? 'block' : 'flex', alignItems: 'center', gap: 10,
              background: clase.precio != null ? 'transparent' : '#EAF0E7',
              border: clase.precio != null ? '1.5px solid #1A1A1A' : 'none',
            }}>
              {clase.precio != null ? (
                <>
                  <div style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 500, color: '#1A1A1A' }}>Clase suelta · {clase.precio} €</div>
                  <div style={{ ...texto.nota, color: '#5A5A52', marginTop: 4 }}>Tu bono no cubre esta clase</div>
                </>
              ) : (
                <>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', flex: '0 0 22px', background: '#4F8A5B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={13} style={{ color: '#FFFFFF' }} />
                  </span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#2E5A3A' }}>Incluida en tu bono</div>
                    {clase.sesionesTrasReservar != null && (
                      <div style={{ fontSize: 11, color: '#3E6B4A', marginTop: 2 }}>
                        {clase.sesionesTrasReservar === 0
                          ? 'Será la última sesión de tu bono'
                          : `Quedarán ${clase.sesionesTrasReservar} sesion${clase.sesionesTrasReservar === 1 ? '' : 'es'}`}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Ventana de cancelación REAL (heredaOverride tipo→estudio) —
                nunca un "12h" fijo. undefined = quien montó la hoja no la
                calculó, y entonces no se dice nada en vez de inventar una. */}
            {clase.ventanaCancelacionHoras != null && (
              <p style={{ ...texto.nota, color: '#5A5A52', textAlign: 'center', marginTop: 10 }}>
                {clase.ventanaCancelacionHoras > 0
                  ? `Cancelación gratuita hasta ${clase.ventanaCancelacionHoras} h antes`
                  : 'Cancelación gratuita en cualquier momento'}
              </p>
            )}

            {estado === 'error' && mensajeError && (
              <div role="alert" style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 16,
                borderRadius: 14, padding: '11px 14px', background: '#F4E9E5',
              }}>
                <AlertCircle size={15} style={{ color: '#C2503A', flexShrink: 0, marginTop: 1 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#C2503A' }}>{mensajeError}</p>
                  {/* Si el fallo se arregla comprando, la salida va AQUÍ, en el
                      momento en que quiere reservar — no en otra pestaña que
                      tenga que encontrar sola. */}
                  {onComprar && seArreglaComprando(mensajeError) && (
                    <button
                      type="button"
                      onClick={onComprar}
                      style={{
                        marginTop: 8, background: 'none', border: 'none', padding: 0,
                        fontSize: 13, fontWeight: 700, color: '#C2503A',
                        textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer',
                      }}
                    >
                      Ver los bonos
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* CHEATSHEET-CSS.md, Bottom sheet: ap-btn--primario height 50px. */}
            <button
              type="button"
              className="ap-btn ap-btn--primario"
              disabled={estado === 'enviando'}
              aria-busy={estado === 'enviando'}
              aria-live="polite"
              onClick={confirmarClick}
              style={{
                width: '100%', height: 50, marginTop: 18,
                cursor: estado === 'reposo' || estado === 'error' ? 'pointer' : 'default',
                opacity: estado === 'enviando' ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {estado === 'enviando' && (
                <span aria-hidden className="animate-spin" style={{ width: 14, height: 14, borderRadius: 999, border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.85, flexShrink: 0 }} />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etiquetaBoton}</span>
            </button>

            {modoEspera && (
              <p style={{ ...texto.nota, color: '#5A5A52', textAlign: 'center', marginTop: 10 }}>
                Sin coste — solo reservas si se libera y tú confirmas.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
