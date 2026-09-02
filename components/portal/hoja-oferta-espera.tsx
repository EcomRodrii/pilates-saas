'use client';

// Sheet de OFERTA DE PLAZA — Fase 2b (plazo para aceptar una plaza de lista de
// espera liberada, ver .claude/tentare-os.md). Es urgente por diseño: se abre
// SOLA en cuanto hay una oferta viva (la monta `portal-reservas-view.tsx`),
// sin depender de que la socia esté mirando la pestaña "Lista de espera" — por
// eso vive por encima de cualquier otro sheet de la pantalla (z-index más
// alto que HojaReserva/el sheet de cancelar, que usan 40/41).
//
// Mismo lenguaje visual que HojaReserva y el sheet de cancelar de
// portal-reservas-view.tsx: fondo de cristal, `radio.hoja`, `sombra.sheet`,
// mismo transform/transition — es la MISMA familia de overlay del portal,
// solo con más prioridad.
//
// El countdown es EN VIVO (mm:ss, `setInterval` de 1s mientras el sheet está
// montado con una oferta) — antes solo se decía la hora de pared ("hasta las
// 18:47"), que no transmite cuenta atrás real. Al llegar a 0 se deshabilitan
// los dos botones: el servidor rechazaría igual una oferta caducada, pero no
// se deja ni intentarlo desde aquí.
//
// "Dejarla pasar" NO es un endpoint nuevo de "rechazar oferta" — es
// `cancelarReserva` de siempre: cancelar una reserva en LISTA_ESPERA con una
// oferta viva libera el hueco y promueve a la siguiente en el backend
// (`promocionar_siguiente_espera`). No hace falta nada nuevo en el servidor.
//
// ⚠️ Esto era FALSO hasta la migración 20260829120000: `cancelar_reserva_plaza`
// solo promocionaba desde CONFIRMADA/ASISTIDA, así que rechazar la oferta
// explícitamente dejaba la plaza huérfana y era PEOR que ignorarla (dejarla
// caducar sí promovía, vía `expirar_oferta_lista_espera`). Si alguien vuelve a
// tocar esa RPC: la rama `v_estado = 'LISTA_ESPERA' and v_tenia_oferta` es la
// que sostiene este comentario.

import { useEffect, useState } from 'react';
import { PartyPopper } from 'lucide-react';
import {
  EASE, dur, transicion, display, micro, texto, radio, altura, sombra, cristal, desenfoque,
} from '@/lib/portal-design';
import { semantic } from '@/lib/portal-tokens';
import type { Instructor, Sala, Sesion, TipoClase } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';

export interface OfertaEspera {
  reservaId: string;
  /** ISO — cuándo caduca la oferta si no se acepta a tiempo. */
  ofertaExpiraEn: string;
  sesion: Sesion;
  tipo: TipoClase | null;
  sala: Sala | null;
  instr: Instructor | null;
}

/** `125000` ms → `"2:05"`. Redondea hacia arriba: a 400ms del corte sigue
 *  contando el segundo entero, no salta a 0 antes de tiempo. */
function formatoCuentaAtras(ms: number): string {
  const totalSeg = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeg / 60);
  const s = totalSeg % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function HojaOfertaEspera({
  oferta, onClose, onAceptar, onDejarPasar, onError,
}: {
  oferta: OfertaEspera | null;
  onClose: () => void;
  onAceptar: (reservaId: string) => Promise<ResultadoEscritura>;
  onDejarPasar: (reservaId: string) => Promise<ResultadoEscritura>;
  /**
   * El error de cualquiera de las dos acciones se avisa con el MISMO
   * `Toast`/`AvisoToast` que ya usa el resto de `portal-reservas-view.tsx`
   * (cancelar reserva, aceptar oferta desde la pestaña Espera) — este sheet
   * no pinta un bloque de error propio para no duplicar el patrón de aviso.
   */
  onError: (mensaje: string) => void;
}) {
  const [restanteMs, setRestanteMs] = useState<number | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState<'aceptar' | 'dejar' | null>(null);

  const abierta = oferta != null;
  const reservaId = oferta?.reservaId ?? null;
  const ofertaExpiraEn = oferta?.ofertaExpiraEn ?? null;

  // Countdown en vivo mientras hay una oferta — se limpia al cerrar el sheet
  // o cambiar de oferta, nunca dos intervalos corriendo a la vez.
  useEffect(() => {
    if (!ofertaExpiraEn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sin oferta no hay cuenta atrás que mantener; limpia el resto de un ciclo anterior (mismo criterio que el reloj de portal-reservas-view.tsx).
      setRestanteMs(null);
      return;
    }
    const expiraEnMs = new Date(ofertaExpiraEn).getTime();
    const tick = () => setRestanteMs(Math.max(0, expiraEnMs - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ofertaExpiraEn]);

  // El "acción en curso" es de ESTA oferta concreta — al cambiar de reserva
  // (se acepta una y aparece otra distinta) no debe sobrevivir el spinner de
  // la anterior.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el estado de UI con el cambio de identidad de la oferta (prop), no con el propio render.
    setAccionEnCurso(null);
  }, [reservaId]);

  const caducada = restanteMs != null && restanteMs <= 0;

  async function ejecutar(accion: 'aceptar' | 'dejar') {
    if (!oferta || accionEnCurso || caducada) return;
    setAccionEnCurso(accion);
    const r = accion === 'aceptar' ? await onAceptar(oferta.reservaId) : await onDejarPasar(oferta.reservaId);
    setAccionEnCurso(null);
    if (!r.ok) { onError(r.error); return; }
    // Si `r.ok`, quien monta este sheet recalcula `oferta` desde sus
    // reservas (ya sin LISTA_ESPERA/ofertaExpiraEn) y esto se cierra solo al
    // recibir `oferta = null` — no hace falta un `onClose()` aquí, y llamarlo
    // igualmente no cambiaría nada porque `oferta` ya habrá desaparecido en
    // el próximo render del padre.
  }

  const successColor = semantic.success.text;

  const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          opacity: abierta ? 1 : 0, pointerEvents: abierta ? 'auto' : 'none',
          background: 'rgba(34,38,31,.3)',
          ...cristal(desenfoque.backdrop, 120),
          transition: `opacity ${dur.tab}ms ${EASE}`,
        }}
      />

      <div
        role="dialog"
        aria-modal={abierta}
        aria-hidden={!abierta}
        aria-label={oferta?.tipo ? `Plaza liberada — ${oferta.tipo.nombre}` : 'Plaza liberada'}
        style={{
          position: 'fixed', left: 12, right: 12, zIndex: 61,
          bottom: 'calc(12px + var(--portal-tabbar-height, 64px) + 22px + env(safe-area-inset-bottom))',
          maxWidth: 456, margin: '0 auto',
          background: '#FAF9F5', borderRadius: radio.hoja,
          border: '1px solid rgba(255,255,255,.8)',
          boxShadow: sombra.sheet, padding: '16px 24px 24px',
          maxHeight: 'calc(100dvh - var(--portal-tabbar-height, 64px) - 56px)', overflowY: 'auto',
          opacity: abierta ? 1 : 0,
          pointerEvents: abierta ? 'auto' : 'none',
          transform: abierta ? 'translateY(0) scale(1)' : 'translateY(114%) scale(.98)',
          transition: `transform ${dur.sheet}ms ${EASE}, opacity 500ms ease`,
        }}
      >
        <button
          type="button" onClick={onClose} aria-label="Cerrar"
          style={{ display: 'block', width: 40, height: 4, borderRadius: 4, margin: '0 auto', background: '#D8D4C9', border: 'none', padding: 0 }}
        />

        {oferta && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999,
                background: semantic.success.soft, color: successColor,
                ...micro(9, 0.16, 700),
              }}>
                <PartyPopper size={13} />
                Plaza liberada — reservada para ti
              </span>
            </div>

            <h2 style={{ ...display(28, false, 1.05), color: '#1A1A1A', marginTop: 16, textAlign: 'center', textWrap: 'pretty' } as React.CSSProperties}>
              {oferta.tipo?.nombre ?? 'Clase'}
            </h2>
            <p style={{ ...texto.meta, color: '#5A5A52', textAlign: 'center', marginTop: 6, textTransform: 'capitalize' }}>
              {fecha(oferta.sesion.inicio)} · {hora(oferta.sesion.inicio)}
              {oferta.sala ? ` · ${oferta.sala.nombre}` : ''}
            </p>
            {oferta.instr && (
              <p style={{ ...texto.nota, color: '#5A5A52', textAlign: 'center', marginTop: 2 }}>
                {oferta.instr.nombre}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 24 }}>
              <span style={{ ...micro(9, 0.2, 600), color: '#98A093' }}>
                {caducada ? 'Oferta caducada' : 'Tiempo para aceptar'}
              </span>
              <span style={{
                fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace',
                fontSize: 42, fontWeight: 700, lineHeight: 1, marginTop: 6,
                color: caducada ? '#5A5A52' : '#1A1A1A',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {restanteMs != null ? formatoCuentaAtras(restanteMs) : '--:--'}
              </span>
            </div>

            {caducada && (
              <p style={{ ...texto.meta, color: '#5A5A52', textAlign: 'center', marginTop: 10 }}>
                Esta oferta ha caducado. Si vuelve a haber hueco, te avisaremos otra vez.
              </p>
            )}

            <button
              type="button"
              disabled={accionEnCurso != null || caducada}
              aria-busy={accionEnCurso === 'aceptar'}
              onClick={() => void ejecutar('aceptar')}
              style={{
                width: '100%', height: altura.botonCta, borderRadius: radio.botonCta, marginTop: 22,
                background: 'var(--ap-tinta, #1A1A1A)', color: '#F1ECE1',
                ...texto.botonCta, border: 'none',
                cursor: accionEnCurso != null || caducada ? 'default' : 'pointer',
                boxShadow: sombra.cta, opacity: caducada ? 0.5 : (accionEnCurso === 'dejar' ? 0.6 : 1),
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: transicion(['opacity']),
              }}
            >
              {accionEnCurso === 'aceptar' && (
                <span aria-hidden className="animate-spin" style={{ width: 14, height: 14, borderRadius: 999, border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.85, flexShrink: 0 }} />
              )}
              {accionEnCurso === 'aceptar' ? 'Aceptando…' : 'Aceptar la plaza con mi bono'}
            </button>

            <button
              type="button"
              disabled={accionEnCurso != null}
              onClick={() => void ejecutar('dejar')}
              style={{
                width: '100%', height: 48, borderRadius: radio.botonCta, marginTop: 8,
                background: 'transparent', color: '#5A5A52', border: 'none',
                ...texto.botonCta, fontWeight: 500, cursor: accionEnCurso != null ? 'default' : 'pointer',
                opacity: accionEnCurso === 'aceptar' ? 0.5 : 1,
              }}
            >
              {accionEnCurso === 'dejar' ? 'Un momento…' : 'Dejarla pasar'}
            </button>
          </>
        )}
      </div>
    </>
  );
}
