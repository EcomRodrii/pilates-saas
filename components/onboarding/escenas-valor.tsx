'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Las cuatro ESCENAS de las pantallas de valor.
//
// ⚠️ REESCRITAS. La primera versión enseñaba UNA sola tarjeta que se
// transformaba sola a los 0,9 s. Sobre el papel era elegante; en la práctica
// no se entendía nada: si no estabas mirando en ese momento, veías un estado
// final sin saber de qué venía, y si lo veías, no quedaba claro que fuera un
// «antes» y un «después». Ahora los dos estados se ven A LA VEZ, etiquetados
// con todas las letras, y la flecha del medio dice qué pasa entre uno y otro.
//
// La animación se queda, pero ya no carga con el significado: el «después»
// entra con un realce. Si no se ve —movimiento reducido, pestaña de fondo,
// alguien que parpadea— la escena se sigue entendiendo entera.
//
// ⚠️ El `pie` cuenta lo que ha pasado en los DOS paneles; la funcionalidad la
// explica el párrafo de al lado en la pantalla. La primera versión repetía ahí
// casi literalmente ese párrafo, y se leía dos veces lo mismo a diez
// centímetros de distancia — visto en el móvil, donde van uno encima de otro.
//
// Van dibujadas en código y no como imagen para que usen los MISMOS tokens que
// el producto: así siguen al tema claro/oscuro y no pueden envejecer a una
// identidad distinta de la real.
// ─────────────────────────────────────────────────────────────────────────────

import { ArrowDown, Check, X } from 'lucide-react';

export type PropsEscena = { activa: boolean };

const T = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** El armazón compartido: dos paneles etiquetados y una flecha entre ellos.
 *  Está aquí y no repetido en cada escena para que las cuatro no puedan
 *  divergir en cómo explican lo mismo. */
function AntesDespues({
  antes, despues, activa, pie,
}: {
  antes: React.ReactNode;
  despues: React.ReactNode;
  activa: boolean;
  pie: string;
}) {
  return (
    <div style={{ width: '100%', maxWidth: 430 }}>
      <Panel etiqueta="Hoy" tono="antes">{antes}</Panel>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '7px 0' }} aria-hidden>
        <span
          style={{
            width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center',
            background: 'var(--valor-marca)', color: 'var(--valor-sobre-marca)',
            transform: activa ? 'translateY(0)' : 'translateY(-4px)',
            transition: `transform 460ms ${T}`,
          }}
        >
          <ArrowDown size={14} strokeWidth={3} />
        </span>
      </div>

      <div
        style={{
          transform: activa ? 'scale(1)' : 'scale(0.985)',
          opacity: activa ? 1 : 0.55,
          transition: `transform 520ms ${T}, opacity 380ms linear`,
        }}
      >
        <Panel etiqueta="Con Tentare" tono="despues">{despues}</Panel>
      </div>

      <p style={{ margin: '10px 2px 0', fontSize: 12.5, color: 'var(--valor-tenue)', lineHeight: 1.45 }}>
        {pie}
      </p>
    </div>
  );
}

function Panel({ etiqueta, tono, children }: { etiqueta: string; tono: 'antes' | 'despues'; children: React.ReactNode }) {
  const esAntes = tono === 'antes';
  return (
    <div
      style={{
        background: esAntes ? 'var(--valor-neutro)' : 'var(--valor-superficie)',
        border: `1px solid ${esAntes ? 'var(--valor-linea)' : 'var(--valor-marca)'}`,
        borderRadius: 14,
        padding: '10px 13px 12px',
        boxShadow: esAntes ? 'none' : '0 10px 28px -20px rgba(0,0,0,.35)',
      }}
    >
      <p
        style={{
          margin: '0 0 8px', fontSize: 10.5, fontWeight: 800,
          letterSpacing: '.09em', textTransform: 'uppercase',
          color: esAntes ? 'var(--valor-tenue)' : 'var(--valor-marca)',
        }}
      >
        {etiqueta}
      </p>
      {children}
    </div>
  );
}

/** Fila del panel «Hoy»: lo que hoy le llega suelto y sin resolver. */
function Suelto({ texto, meta }: { texto: string; meta: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <X size={13} strokeWidth={3} style={{ flexShrink: 0, color: 'var(--valor-tenue)' }} aria-hidden />
      <span style={{ minWidth: 0, flex: 1, fontSize: 12.5, color: 'var(--valor-tinta)' }}>{texto}</span>
      <span style={{ fontSize: 11, color: 'var(--valor-tenue)', flexShrink: 0 }}>{meta}</span>
    </div>
  );
}

/** Fila del panel «Con Tentare»: lo mismo, ya resuelto. */
function Resuelto({ texto, meta }: { texto: string; meta: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span
        aria-hidden
        style={{
          width: 16, height: 16, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center',
          background: 'var(--valor-marca)', color: 'var(--valor-sobre-marca)',
        }}
      >
        <Check size={10} strokeWidth={4} />
      </span>
      <span style={{ minWidth: 0, flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--valor-tinta)' }}>{texto}</span>
      <span style={{ fontSize: 11, color: 'var(--valor-tenue)', flexShrink: 0 }}>{meta}</span>
    </div>
  );
}

export function EscenaReservas({ activa }: PropsEscena) {
  return (
    <AntesDespues
      activa={activa}
      pie="Ninguna te escribió a ti. Se apuntaron desde tu página, cada una a su hora."
      antes={<>
        <Suelto texto="«¿Queda sitio el jueves?»" meta="23:47" />
        <Suelto texto="«Me apuntas al de las 10»" meta="07:12" />
        <Suelto texto="«¿Puedo cambiar mi clase?»" meta="00:14" />
      </>}
      despues={<>
        <Resuelto texto="Marta reservó" meta="Jue 10:00" />
        <Resuelto texto="Lucía reservó" meta="Lun 10:00" />
        <Resuelto texto="Ana cambió su clase" meta="Jue 19:00" />
      </>}
    />
  );
}

export function EscenaCobros({ activa }: PropsEscena) {
  return (
    <AntesDespues
      activa={activa}
      pie="Ninguna de las tres recibió un recordatorio tuyo."
      antes={<>
        <Suelto texto="Marta · Bono 10 sesiones" meta="Sin pagar" />
        <Suelto texto="Lucía · Cuota mensual" meta="Sin pagar" />
        <Suelto texto="Ana · Cuota mensual" meta="Sin pagar" />
      </>}
      despues={<>
        <Resuelto texto="Marta · Bono 10 sesiones" meta="90,00 €" />
        <Resuelto texto="Lucía · Cuota mensual" meta="65,00 €" />
        <Resuelto texto="Ana · Cuota mensual" meta="65,00 €" />
      </>}
    />
  );
}

export function EscenaSustituciones({ activa }: PropsEscena) {
  return (
    <AntesDespues
      activa={activa}
      pie="Tú no hiciste ninguna llamada."
      antes={<>
        <Suelto texto="Ana no puede el martes" meta="19:00" />
        <Suelto texto="Llamas a Carmen" meta="No contesta" />
        <Suelto texto="Llamas a Elena" meta="No contesta" />
      </>}
      despues={<>
        <Resuelto texto="Carmen da la clase" meta="Aceptó" />
        <Resuelto texto="Las 8 alumnas, avisadas" meta="Hecho" />
        <Resuelto texto="Tú te enteras al acabar" meta="0 llamadas" />
      </>}
    />
  );
}

export function EscenaInformes({ activa }: PropsEscena) {
  return (
    <AntesDespues
      activa={activa}
      pie="El aviso salta solo: esa clase lleva tres semanas sin llenarse."
      antes={<>
        <Suelto texto="Reformer 10:00" meta="¿Va bien?" />
        <Suelto texto="Mat 18:00" meta="¿Va bien?" />
        <Suelto texto="Mat 12:00" meta="¿Va bien?" />
      </>}
      despues={<>
        <Resuelto texto="Reformer 10:00" meta="92 % llena" />
        <Resuelto texto="Mat 18:00" meta="74 % llena" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span
            aria-hidden
            style={{
              width: 16, height: 16, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center',
              background: 'var(--valor-aviso)', color: 'var(--valor-superficie)', fontSize: 11, fontWeight: 800,
            }}
          >
            !
          </span>
          <span style={{ minWidth: 0, flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--valor-tinta)' }}>
            Mat 12:00
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--valor-aviso)', flexShrink: 0 }}>24 % llena</span>
        </div>
      </>}
    />
  );
}
