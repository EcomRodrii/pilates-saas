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

import { useState } from 'react';
import { useModo } from '@/lib/portal-modo';
import {
  EASE, dur, transicion, display, micro, texto, radio, altura, sombra, cristal, desenfoque,
} from '@/lib/portal-design';
import type { Spot } from '@/lib/types';

export interface ClaseParaReservar {
  id: string;
  inicio: string;
  fin: string;
  nombre: string;
  nivel: string | null;
  salaNombre: string | null;
  instructorNombre: string | null;
  aforoMaximo: number;
  ocupadas: number;
  spots: Spot[];
  spotsOcupados: string[];
  /** Precio de clase suelta si su bono no la cubre; null = incluida. */
  precio: number | null;
  /** Sesiones que le quedarán al bono si confirma. null = no aplica. */
  sesionesTrasReservar: number | null;
}

export function HojaReserva({
  clase, onClose, onConfirmar,
}: {
  clase: ClaseParaReservar | null;
  onClose: () => void;
  onConfirmar: (spotId: string | null) => void;
}) {
  const { t, noche } = useModo();
  const [spotElegido, setSpotElegido] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Nota: quien monta esta hoja le pasa `key={clase.id}`, así que al cambiar de
  // clase React la remonta y estos dos estados vuelven solos a su valor
  // inicial. Sincronizarlos con un efecto era la otra opción, y sobra: la 7 de
  // la Sala Norte no es la 7 de la Sala Sur, y lo que hace falta es empezar de
  // cero, no ir corrigiendo después.

  const abierta = clase != null;
  const libres = clase ? Math.max(0, clase.aforoMaximo - clase.ocupadas) : 0;
  const ocupados = new Set(clase?.spotsOcupados ?? []);
  // El orden de la sala, no el de la base de datos: fila y luego columna es
  // como se ve la sala desde la puerta.
  const plazas = [...(clase?.spots ?? [])].sort((a, b) => a.fila - b.fila || a.columna - b.columna || a.numero - b.numero);

  const fecha = clase
    ? new Date(clase.inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })
    : '';
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div
        onClick={onClose}
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
          type="button" onClick={onClose} aria-label="Cerrar"
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
              {[clase.instructorNombre, clase.nivel, clase.salaNombre].filter(Boolean).map((v, i) => (
                <span key={v as string} style={{ ...(i === 0 ? texto.metaFuerte : texto.meta), color: i === 0 ? t.ink : t.muted }}>{v}</span>
              ))}
            </div>

            {plazas.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26 }}>
                  <span style={{ ...display(22), color: t.ink }}>Elige tu plaza</span>
                  <span style={{ ...texto.nota, color: t.muted }}>{libres} libres de {clase.aforoMaximo}</span>
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

            <button
              type="button"
              disabled={enviando}
              onClick={() => { setEnviando(true); onConfirmar(spotElegido); }}
              style={{
                width: '100%', height: altura.botonCta, borderRadius: radio.botonCta, marginTop: 18,
                background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
                ...texto.botonCta, border: 'none', cursor: 'pointer',
                boxShadow: sombra.cta, opacity: enviando ? 0.6 : 1,
                transition: transicion(['transform', 'opacity']),
              }}
            >
              {enviando ? 'Un momento…' : 'Confirmar reserva'}
            </button>
          </>
        )}
      </div>
    </>
  );
}
