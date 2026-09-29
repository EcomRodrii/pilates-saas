'use client';

// La tarjeta de una reserva de la socia (F5 del rediseño «/reservar = estilo de
// la app de la alumna», 29-sep-2026).
//
// Es la de «Mis clases» de la app (app/portal/[slug]/mis-reservas/page.tsx)
// ADAPTADA, no importada —aquella vive dentro de `StudentProvider` y de
// student.css—: arriba el cuándo en el color de la marca y el estado a la
// derecha; debajo la clase y «con Marta Vidal · Sala Reformer»; al pie, las
// acciones en píldora. Antes, en la hoja de «Mis reservas», cada reserva era
// texto suelto con la insignia y un «Cancelar reserva» subrayado.
//
// La comparten la página (`misReservasBody`, app/reservar/[slug]/page.tsx) y la
// lista del widget nativo (./mis-reservas-lista.tsx), para que la misma reserva
// se vea igual en la web del estudio y en la página de Tentare. Qué dice cada
// una lo decide lib/reservar/mis-reservas.ts.
//
// ⚠️ Solo estilos EN LÍNEA: esto también lo compila esbuild para el widget
// nativo, que no tiene Tailwind. Los colores salen de los tokens (`t`) y de
// `textoSemantico`, que los mide contra la tarjeta que se ve: en Carbón el
// verde y el rojo de siempre se quedaban por debajo de AA.

import type { CSSProperties, ReactNode } from 'react';
import { CircleCheck } from 'lucide-react';
import type { ModoTokens } from '@/lib/portal-modo';
import { pesoTitular, sans, serif, textoSemantico } from '@/lib/reservar-publico-tokens';
import type { TonoEstadoReserva } from '@/lib/reservar/mis-reservas';

/** La marca cuando es TEXTO: medida contra la paleta que se ve. En el nativo esa variable no existe y cae a la marca tal cual. */
const MARCA_TEXTO = 'var(--portal-brand-texto, var(--portal-brand))';

/** El color del punto (o del check) de cada tono. El texto de la insignia va SIEMPRE en tinta: es lo que garantiza el contraste. */
function colorDeTono(tono: TonoEstadoReserva, t: ModoTokens): string {
  switch (tono) {
    case 'reservada':
    case 'asistida': return textoSemantico('success', t);
    case 'espera':
    case 'pendiente': return textoSemantico('warning', t);
    case 'curso': return MARCA_TEXTO;
    case 'neutro': return t.muted;
  }
}

/** «Reservada ✓», «Lista de espera · 2ª»… El mismo dibujo que la insignia de plazas de la ficha (F4). */
export function InsigniaEstado({ t, texto, tono }: { t: ModoTokens; texto: string; tono: TonoEstadoReserva }) {
  const color = colorDeTono(tono, t);
  const neutro = tono === 'neutro';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
      minHeight: 26, padding: '0 10px', borderRadius: 'var(--reservar-radio-boton, 999px)',
      background: neutro ? t.surface2 : `color-mix(in oklab, ${color} 13%, ${t.surface})`,
      color: neutro ? t.muted : t.ink,
      fontFamily: sans, fontSize: 12, fontWeight: 800, lineHeight: 1.2, whiteSpace: 'nowrap',
    }}>
      {tono === 'reservada' || tono === 'asistida'
        ? <CircleCheck size={13} strokeWidth={2.5} aria-hidden="true" style={{ color, flexShrink: 0 }} />
        : !neutro && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: color, flexShrink: 0 }} />}
      {texto}
    </span>
  );
}

/**
 * Una acción en píldora («+ Calendario», «Cancelar reserva»). La píldora se ve
 * de 36 px —como los chips de la app, que en una fila de dos o tres no caben a
 * 44— pero el botón mide 44 de alto: la zona que se toca es la del pulgar.
 */
export function BotonPildora({ t, tono = 'neutro', onClick, disabled, etiqueta, icono, children }: {
  t: ModoTokens;
  /** `peligro`: cancelar, salir de la lista. Contorno y texto en rojo, como el `btn--danger` de la app. */
  tono?: 'neutro' | 'peligro';
  onClick: () => void;
  disabled?: boolean;
  /** Nombre accesible cuando el texto visible no basta (siempre CONTIENE el visible: WCAG 2.5.3). */
  etiqueta?: string;
  icono?: ReactNode;
  children: ReactNode;
}) {
  const peligro = tono === 'peligro';
  const rojo = textoSemantico('danger', t);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      // El anillo de foco de /reservar (app/globals.css). En el nativo, que no
      // tiene la clase, queda el del navegador.
      className="reservar-foco"
      style={{
        display: 'inline-flex', alignItems: 'center', height: 44, padding: 0, flexShrink: 0,
        border: 'none', background: 'none', borderRadius: 'var(--reservar-radio-boton, 999px)',
        cursor: disabled ? 'default' : 'pointer', fontFamily: sans,
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px',
        borderRadius: 'var(--reservar-radio-boton, 999px)',
        border: `1px solid ${peligro ? rojo : 'transparent'}`,
        background: peligro ? 'transparent' : t.surface2,
        color: peligro ? rojo : t.ink,
        fontSize: 12.5, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1, transition: 'opacity .2s ease',
      }}>
        {icono}
        {children}
      </span>
    </button>
  );
}

/** La tarjeta en sí. `apagada` para las pasadas: el cuándo pierde el color de la marca, que es para lo que viene. */
export function TarjetaReserva({ t, cuando, estado, nombre, detalle, apagada = false, orden = 0, acciones, children }: {
  t: ModoTokens;
  cuando: string;
  estado: { texto: string; tono: TonoEstadoReserva };
  nombre: string;
  detalle?: string | null;
  apagada?: boolean;
  /** Su posición en la lista: las primeras entran escalonadas (40 ms), el resto a la vez. */
  orden?: number;
  acciones?: ReactNode;
  /** Lo que va debajo de las acciones: la confirmación de cancelar, un error, una oferta de plaza. */
  children?: ReactNode;
}) {
  const entrada: CSSProperties = {
    // El mismo `reserva-card-in` de las tarjetas del horario, que existe en las
    // dos hojas (globals.css y widget.css): la lista llega, no aparece de golpe.
    // El retraso va dentro del atajo: mezclar `animation` y `animationDelay` en
    // línea es lo que React avisa que se desincroniza al repintar.
    animation: `reserva-card-in .35s cubic-bezier(.16,1,.3,1) ${Math.min(orden, 5) * 40}ms both`,
  };
  return (
    <article style={{
      ...entrada,
      padding: '14px 16px', minWidth: 0,
      background: t.surface, border: `1px solid ${t.line}`,
      borderRadius: 'var(--reservar-radio-tarjeta, 20px)',
      fontFamily: sans,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <p style={{
          margin: 0, fontSize: 13, fontWeight: 800, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums',
          color: apagada ? t.muted : MARCA_TEXTO,
        }}>
          {cuando}
        </p>
        <InsigniaEstado t={t} texto={estado.texto} tono={estado.tono} />
      </div>
      <h3 style={{
        margin: '6px 0 0', fontFamily: serif, fontWeight: pesoTitular(800), fontSize: 16, lineHeight: 1.25,
        letterSpacing: '-.01em', color: t.ink, overflowWrap: 'anywhere',
      }}>
        {nombre}
      </h3>
      {detalle && (
        <p style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: 1.45, color: t.muted }}>{detalle}</p>
      )}
      {acciones && (
        // Las píldoras miden 44 con su zona táctil: el margen negativo de abajo
        // devuelve el aire de sobra al borde de la tarjeta.
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 8px', margin: '6px 0 -4px' }}>
          {acciones}
        </div>
      )}
      {children}
    </article>
  );
}
