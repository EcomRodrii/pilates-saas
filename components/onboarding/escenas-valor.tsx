'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Las cuatro ESCENAS de las pantallas de valor. Cada una cuenta un problema
// real de un martes en un estudio de Pilates y lo transforma en la pantalla de
// Tentare que lo resuelve.
//
// Por qué van dibujadas en código y no como imagen:
//   · Se ven nítidas en cualquier densidad de pantalla, sin @2x ni WebP.
//   · Usan los MISMOS tokens que el producto, así que no pueden envejecer a
//     una identidad distinta de la real (el repo ya se comió eso con los PNG
//     del logo: convivían dos marcas a un clic de distancia).
//   · Pesan bytes de HTML, no cientos de KB por pantalla, y esto lo ve alguien
//     que acaba de registrarse y aún no sabe si se queda.
//
// El "antes" es literal a propósito: mensajes a las 23:47, una lista con
// pendientes, una llamada sin contestar. Es lo que la propietaria reconoce de
// su semana — no una metáfora abstracta de productividad.
// ─────────────────────────────────────────────────────────────────────────────

import { Check, Phone, Star } from 'lucide-react';

/** `t` va de 0 (antes) a 1 (después). Las escenas interpolan con CSS, no con JS:
 *  una transición declarada se detiene sola con `prefers-reduced-motion`. */
export type PropsEscena = { activa: boolean };

const T = 'cubic-bezier(0.22, 1, 0.36, 1)';

function tarjeta(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: 'var(--valor-superficie)',
    borderRadius: 14,
    border: '1px solid var(--valor-linea)',
    boxShadow: '0 18px 40px -28px rgba(0,0,0,.55)',
    ...extra,
  };
}

// ── 1. Reservas ─────────────────────────────────────────────────────────────
// Antes: mensajes sueltos a horas imposibles. Después: los mismos nombres,
// dentro de las plazas de la clase. El mensaje no desaparece: se COLOCA.
// ⚠️ Cada una acaba en algo DISTINTO, y es lo que hace que la escena se lea
// como real. La primera versión resolvía las tres en «plaza confirmada ·
// jueves 10:00»: tres filas idénticas se leen como relleno, no como tres
// personas con tres peticiones distintas. Visto en el navegador, no en el JSX.
const MENSAJES = [
  { hora: '23:47', texto: '¿Queda sitio el jueves?', quien: 'Marta', despues: 'Reservó', cuando: 'Jueves 10:00 · Reformer' },
  { hora: '07:12', texto: 'Me apuntas al de las 10', quien: 'Lucía', despues: 'Reservó', cuando: 'Lunes 10:00 · Reformer' },
  { hora: '00:14', texto: '¿Puedo cambiar mi clase?', quien: 'Ana', despues: 'Cambió su clase', cuando: 'Jueves 19:00 · Mat' },
];

export function EscenaReservas({ activa }: PropsEscena) {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
      {MENSAJES.map((m, i) => (
        <div
          key={m.quien}
          style={{
            ...tarjeta({ padding: '10px 13px', marginBottom: 9 }),
            display: 'flex', alignItems: 'center', gap: 10,
            transform: activa ? 'translateX(0) scale(1)' : `translateX(${8 + i * 5}px) rotate(${i % 2 ? 1.4 : -1.1}deg)`,
            opacity: activa ? 1 : 0.92,
            transition: `transform 620ms ${T} ${i * 90}ms, opacity 400ms linear`,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 28, height: 28, borderRadius: 9, flexShrink: 0,
              display: 'grid', placeItems: 'center',
              fontSize: 11.5, fontWeight: 800,
              background: activa ? 'var(--valor-marca-suave)' : 'var(--valor-neutro)',
              color: activa ? 'var(--valor-marca)' : 'var(--valor-tenue)',
              transition: `background 500ms linear ${i * 90}ms, color 500ms linear ${i * 90}ms`,
            }}
          >
            {m.quien[0]}
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--valor-tinta)', lineHeight: 1.3 }}>
              {activa ? `${m.quien} · ${m.despues.toLowerCase()}` : m.texto}
            </span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--valor-tenue)', marginTop: 1 }}>
              {activa ? m.cuando : `${m.quien} · ${m.hora}`}
            </span>
          </span>
          <span
            aria-hidden
            style={{
              width: 18, height: 18, borderRadius: 999, flexShrink: 0,
              display: 'grid', placeItems: 'center',
              background: 'var(--valor-marca)', color: 'var(--valor-superficie)',
              opacity: activa ? 1 : 0,
              transform: activa ? 'scale(1)' : 'scale(0.4)',
              transition: `opacity 300ms linear ${420 + i * 90}ms, transform 420ms ${T} ${420 + i * 90}ms`,
            }}
          >
            <Check size={11} strokeWidth={3.5} />
          </span>
        </div>
      ))}
      <p
        style={{
          margin: '14px 0 0', fontSize: 11.5, color: 'var(--valor-arena)',
          opacity: activa ? 1 : 0, transition: 'opacity 400ms linear 700ms',
        }}
      >
        Se apuntaron solas. Tú no tocaste el móvil.
      </p>
    </div>
  );
}

// ── 2. Cobros ───────────────────────────────────────────────────────────────
// Antes: cuatro pendientes y un total que no cuadra. Después: cobrado, con su
// recibo. El número no baila: es el mismo, cambia su estado.
const COBROS = [
  { quien: 'Marta Gil', concepto: 'Bono 10 sesiones', eur: '90,00' },
  { quien: 'Lucía Sanz', concepto: 'Cuota mensual', eur: '65,00' },
  { quien: 'Ana Ruiz', concepto: 'Cuota mensual', eur: '65,00' },
];

export function EscenaCobros({ activa }: PropsEscena) {
  return (
    <div style={{ ...tarjeta({ padding: 16 }), width: '100%', maxWidth: 420 }}>
      {COBROS.map((c, i) => (
        <div
          key={c.quien}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 0',
            borderBottom: i < COBROS.length - 1 ? '1px solid var(--valor-linea)' : 'none',
          }}
        >
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--valor-tinta)' }}>{c.quien}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--valor-tenue)' }}>{c.concepto}</span>
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--valor-tinta)', fontVariantNumeric: 'tabular-nums' }}>
            {c.eur} €
          </span>
          <span
            style={{
              width: 78, textAlign: 'center', flexShrink: 0,
              fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em',
              padding: '3px 0', borderRadius: 999,
              background: activa ? 'var(--valor-marca-suave)' : 'var(--valor-neutro)',
              color: activa ? 'var(--valor-marca)' : 'var(--valor-tenue)',
              transition: `background 420ms linear ${i * 130}ms, color 420ms linear ${i * 130}ms`,
            }}
          >
            {activa ? 'Cobrado' : 'Pendiente'}
          </span>
        </div>
      ))}
      <p
        style={{
          margin: '13px 0 0', fontSize: 11.5, color: 'var(--valor-tenue)',
          opacity: activa ? 1 : 0, transition: 'opacity 400ms linear 560ms',
        }}
      >
        Se cobró solo el día 1. Con su recibo, y sin recordárselo a nadie.
      </p>
    </div>
  );
}

// ── 3. Sustituciones ────────────────────────────────────────────────────────
// El wedge real del producto. Antes: la llamada que no contestan y la clase en
// el aire. Después: Tentare ya ha preguntado por ti, por orden de quien encaja.
const CANDIDATAS = [
  { nombre: 'Carmen', nota: 'Da Reformer los martes' },
  { nombre: 'Elena', nota: 'Libre esa hora' },
];

export function EscenaSustituciones({ activa }: PropsEscena) {
  return (
    <div style={{ width: '100%', maxWidth: 420 }}>
      <div style={{ ...tarjeta({ padding: '12px 14px', marginBottom: 10 }), display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          aria-hidden
          style={{
            width: 30, height: 30, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'var(--valor-neutro)', color: 'var(--valor-tenue)',
          }}
        >
          <Phone size={14} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--valor-tinta)' }}>
            Ana no puede dar el martes
          </span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--valor-tenue)' }}>
            Reformer · 19:00 · 8 alumnas apuntadas
          </span>
        </span>
      </div>

      {CANDIDATAS.map((c, i) => (
        <div
          key={c.nombre}
          style={{
            ...tarjeta({ padding: '10px 13px', marginBottom: 8 }),
            display: 'flex', alignItems: 'center', gap: 10,
            opacity: activa ? 1 : 0,
            transform: activa ? 'translateY(0)' : 'translateY(10px)',
            transition: `opacity 420ms linear ${180 + i * 160}ms, transform 520ms ${T} ${180 + i * 160}ms`,
          }}
        >
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--valor-tinta)' }}>{c.nombre}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--valor-tenue)' }}>{c.nota}</span>
          </span>
          {i === 0 && (
            <span
              style={{
                fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                background: 'var(--valor-marca-suave)', color: 'var(--valor-marca)',
                opacity: activa ? 1 : 0, transition: 'opacity 320ms linear 760ms',
              }}
            >
              Acepta
            </span>
          )}
        </div>
      ))}

      <p
        style={{
          margin: '12px 0 0', fontSize: 11.5, color: 'var(--valor-arena)',
          opacity: activa ? 1 : 0, transition: 'opacity 400ms linear 900ms',
        }}
      >
        Preguntamos por orden de quien mejor encaja. Tú te enteras cuando ya está resuelto.
      </p>
    </div>
  );
}

// ── 4. Lo que no se ve ──────────────────────────────────────────────────────
// Antes: cuatro clases iguales. Después: cuáles sostienen el estudio y cuál te
// está costando dinero. Las barras crecen desde cero — el dato aparece, no
// estaba escondido.
const CLASES = [
  { nombre: 'Reformer 10:00', pct: 92, bien: true },
  { nombre: 'Mat 18:00', pct: 74, bien: true },
  { nombre: 'Reformer 19:00', pct: 61, bien: true },
  { nombre: 'Mat 12:00', pct: 24, bien: false },
];

export function EscenaInformes({ activa }: PropsEscena) {
  return (
    <div style={{ ...tarjeta({ padding: 16 }), width: '100%', maxWidth: 420 }}>
      {CLASES.map((c, i) => (
        <div key={c.nombre} style={{ marginBottom: i < CLASES.length - 1 ? 13 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--valor-tinta)' }}>{c.nombre}</span>
            <span
              style={{
                fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                color: c.bien ? 'var(--valor-marca)' : 'var(--valor-aviso)',
                opacity: activa ? 1 : 0, transition: `opacity 300ms linear ${420 + i * 110}ms`,
              }}
            >
              {c.pct}%
            </span>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: 'var(--valor-neutro)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%', borderRadius: 999,
                width: activa ? `${c.pct}%` : '0%',
                background: c.bien ? 'var(--valor-marca)' : 'var(--valor-aviso)',
                transition: `width 760ms ${T} ${i * 110}ms`,
              }}
            />
          </div>
        </div>
      ))}
      <p
        style={{
          margin: '15px 0 0', fontSize: 11.5, color: 'var(--valor-tenue)',
          display: 'flex', alignItems: 'center', gap: 6,
          opacity: activa ? 1 : 0, transition: 'opacity 400ms linear 900ms',
        }}
      >
        <Star size={12} style={{ flexShrink: 0, color: 'var(--valor-aviso)' }} />
        El Mat de las 12:00 lleva tres semanas sin llenarse.
      </p>
    </div>
  );
}
