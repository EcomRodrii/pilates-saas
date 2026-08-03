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

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { useModo } from '@/lib/portal-modo';
import {
  EASE, dur, transicion, display, micro, texto, radio, altura, sombra, cristal, desenfoque,
} from '@/lib/portal-design';
import { AforoIndicator } from '@/components/portal/ui';
import { semantic } from '@/lib/portal-tokens';
import type { EstadoReserva, Spot } from '@/lib/types';

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
  aforoMaximo: number;
  ocupadas: number;
  spots: Spot[];
  spotsOcupados: string[];
  /** Precio de clase suelta si su bono no la cubre; null = incluida. */
  precio: number | null;
  /** Sesiones que le quedarán al bono si confirma. null = no aplica. */
  sesionesTrasReservar: number | null;
}

export type ResultadoConfirmar =
  | { ok: true; estado: EstadoReserva }
  | { ok: false; error: string };

const ETIQUETA_ESTADO: Partial<Record<EstadoReserva, string>> = {
  LISTA_ESPERA: 'En lista de espera',
  PENDIENTE_APROBACION: 'Pendiente de aprobación',
};

export function HojaReserva({
  clase, onClose, onConfirmar,
}: {
  clase: ClaseParaReservar | null;
  onClose: () => void;
  onConfirmar: (spotId: string | null) => Promise<ResultadoConfirmar>;
}) {
  const { t, noche } = useModo();
  const [spotElegido, setSpotElegido] = useState<string | null>(null);
  const [estado, setEstado] = useState<'reposo' | 'enviando' | 'exito' | 'error'>('reposo');
  const [resultadoExito, setResultadoExito] = useState<EstadoReserva | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  // Nota: quien monta esta hoja le pasa `key={clase.id}`, así que al cambiar de
  // clase React la remonta y estos estados vuelven solos a su valor inicial.
  // Sincronizarlos con un efecto era la otra opción, y sobra: la 7 de la Sala
  // Norte no es la 7 de la Sala Sur, y lo que hace falta es empezar de cero,
  // no ir corrigiendo después.

  // Tras el morph de éxito, cierra sola pasado un momento — pero si la hoja
  // se remonta antes (otra clase, o el usuario ya la cerró) el timeout no
  // debe disparar sobre una instancia que ya no está.
  useEffect(() => {
    if (estado !== 'exito') return;
    const id = setTimeout(onClose, 1200);
    return () => clearTimeout(id);
  }, [estado, onClose]);

  const abierta = clase != null;
  const libres = clase ? Math.max(0, clase.aforoMaximo - clase.ocupadas) : 0;
  const ocupados = new Set(clase?.spotsOcupados ?? []);
  // El orden de la sala, no el de la base de datos: fila y luego columna es
  // como se ve la sala desde la puerta.
  const plazas = [...(clase?.spots ?? [])].sort((a, b) => a.fila - b.fila || a.columna - b.columna || a.numero - b.numero);

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
  // portal-tokens.ts) — usa la variante calibrada para ese modo.
  const dangerColor = noche ? semantic.danger.textNoche : semantic.danger.text;

  const etiquetaBoton = clase
    ? estado === 'enviando'
      ? 'Un momento…'
      : estado === 'exito'
        ? `${resultadoExito ? (ETIQUETA_ESTADO[resultadoExito] ?? 'Reservado') : 'Reservado'} · ${clase.nombre} ${diaCorto} ${hora(clase.inicio)}`
        : 'Confirmar reserva'
    : 'Confirmar reserva';

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
          position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 41,
          maxWidth: 456, margin: '0 auto',
          background: t.bg, borderRadius: radio.hoja,
          border: `1px solid ${noche ? 'rgba(243,241,233,.10)' : 'rgba(255,255,255,.8)'}`,
          boxShadow: sombra.sheet, padding: '16px 24px 24px',
          maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto',
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

        {clase && (
          <>
            <div style={{ ...micro(9, 0.26, 600), color: t.micro, marginTop: 22 }}>
              {fecha} · {hora(clase.inicio)} – {hora(clase.fin)}
            </div>
            <h2 style={{ ...display(32, false, 1.05), color: t.ink, marginTop: 10, textWrap: 'pretty' } as React.CSSProperties}>
              {clase.nombre}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
              {clase.instructorNombre && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {clase.instructorFotoUrl ? (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={clase.instructorFotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  ) : (
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: t.surface2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, color: t.ink,
                    }}>
                      {clase.instructorNombre.trim()[0]?.toUpperCase()}
                    </span>
                  )}
                  <span style={{ ...texto.metaFuerte, color: t.ink }}>{clase.instructorNombre}</span>
                </div>
              )}
              {[clase.nivel, clase.salaNombre].filter(Boolean).map(v => (
                <span key={v as string} style={{ ...texto.meta, color: t.muted }}>{v}</span>
              ))}
            </div>

            {plazas.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26 }}>
                  <span style={{ ...display(22), color: t.ink }}>Elige tu plaza</span>
                  <AforoIndicator libres={libres} umbralUrgencia={2} style={{ fontSize: 11.5, fontWeight: 500 }} />
                </div>
                {/* Siete columnas como en el diseño. Con `auto-fit` una sala de
                    cuatro plazas quedaría con cuatro celdas anchísimas; fijar la
                    rejilla mantiene la proporción de la sala real. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginTop: 14 }}>
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
                          height: 38, borderRadius: 13,
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

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              {clase.precio != null ? (
                <>
                  <div style={{ ...texto.metaFuerte, color: t.ink }}>Clase suelta · {clase.precio} €</div>
                  <div style={{ ...texto.nota, color: t.muted, marginTop: 4 }}>Tu bono no cubre esta clase</div>
                </>
              ) : (
                <>
                  <div style={{ ...texto.metaFuerte, color: t.ink }}>Incluida en tu bono</div>
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

            {estado === 'error' && mensajeError && (
              <div role="alert" style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 16,
                borderRadius: 14, padding: '11px 14px', background: semantic.danger.soft,
              }}>
                <AlertCircle size={15} style={{ color: dangerColor, flexShrink: 0 }} />
                <p style={{ fontSize: 13, fontWeight: 700, color: dangerColor }}>{mensajeError}</p>
              </div>
            )}

            <button
              type="button"
              disabled={estado === 'enviando' || estado === 'exito'}
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
              {estado === 'exito' && <CheckCircle2 size={16} style={{ flexShrink: 0 }} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etiquetaBoton}</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}
