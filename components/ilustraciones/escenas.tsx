import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { rutaIlustracion } from '@/lib/ilustraciones/manifiesto';

// ─────────────────────────────────────────────────────────────────────────────
// Ilustraciones de estados vacíos, sin datos y relleno (18-nov-2026).
//
// Dibujos ORIGINALES de Tentare, en SVG en línea para leer los tokens de `brand/` (siguen el
// modo claro/oscuro solos). El patrón —disco suave detrás y dos o tres objetos planos
// encima— es una convención de UI, no un dibujo copiado de nadie: ninguna escena reproduce
// ilustraciones de terceros.
//
// Reglas: decorativas (`aria-hidden`, el texto del estado vacío es lo que se lee), sin texto
// dentro del SVG, sin degradados (la paleta es Ink, tonos del lienzo y los dos acentos
// de la marca en pequeño), y sin emojis. Valores de color: solo `var(--t-*)`.
//
// Una escena nueva se añade a `ESCENAS` con su nombre y su uso; la lista de abajo es la que
// leen la guía y el test.
// ─────────────────────────────────────────────────────────────────────────────

const TINTA = 'var(--t-text-primary)';
const FONDO = 'var(--t-surface-sunken)';
const TARJETA = 'var(--t-surface-raised)';
const LINEA = 'var(--t-border-default)';
const AZUL = 'var(--t-blue-500)';
const AZUL_SUAVE = 'var(--t-blue-100)';
const MAGENTA = 'var(--t-magenta-500)';
const MAGENTA_SUAVE = 'var(--t-magenta-100)';

/** Trazo común: 1,5 px, extremos redondos. */
const trazo = { stroke: TINTA, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Disco() {
  return <circle cx="100" cy="76" r="60" fill={FONDO} />;
}

/** Lista o carpeta sin nada todavía. */
function SinDatos() {
  return (
    <>
      <Disco />
      <rect x="62" y="34" width="76" height="92" rx="8" fill={TARJETA} {...trazo} />
      <rect x="74" y="50" width="30" height="6" rx="3" fill={AZUL} />
      <rect x="74" y="66" width="52" height="5" rx="2.5" fill={FONDO} />
      <rect x="74" y="78" width="52" height="5" rx="2.5" fill={FONDO} />
      <rect x="74" y="90" width="34" height="5" rx="2.5" fill={FONDO} />
      <circle cx="132" cy="112" r="14" fill={MAGENTA_SUAVE} {...trazo} />
      <path d="M126 112h12M132 106v12" {...trazo} stroke={MAGENTA} />
    </>
  );
}

/** Agenda o calendario vacío: la línea de horario en punteado (`ui-rules` §2.3). */
function Agenda() {
  return (
    <>
      <Disco />
      <rect x="52" y="40" width="96" height="84" rx="10" fill={TARJETA} {...trazo} />
      <path d="M52 62h96" {...trazo} />
      <path d="M76 34v12M124 34v12" {...trazo} />
      <circle cx="72" cy="86" r="3.5" fill={AZUL} />
      <path d="M82 86h54" stroke={LINEA} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 5" />
      <circle cx="136" cy="86" r="3.5" fill="none" stroke={TINTA} strokeWidth="1.5" />
      <rect x="66" y="100" width="28" height="8" rx="4" fill={AZUL_SUAVE} />
      <rect x="100" y="100" width="34" height="8" rx="4" fill={FONDO} />
    </>
  );
}

/** Personas (clientas, equipo) todavía sin dar de alta. */
function Personas() {
  return (
    <>
      <Disco />
      <rect x="40" y="56" width="68" height="62" rx="10" fill={TARJETA} {...trazo} />
      <circle cx="74" cy="78" r="9" fill={AZUL_SUAVE} {...trazo} />
      <path d="M56 106c3-10 11-14 18-14s15 4 18 14" fill="none" {...trazo} />
      <rect x="96" y="40" width="68" height="62" rx="10" fill={TARJETA} {...trazo} />
      <circle cx="130" cy="62" r="9" fill={MAGENTA_SUAVE} {...trazo} />
      <path d="M112 90c3-10 11-14 18-14s15 4 18 14" fill="none" {...trazo} />
    </>
  );
}

/** Búsqueda o filtro sin coincidencias. */
function Busqueda() {
  return (
    <>
      <Disco />
      <rect x="52" y="42" width="82" height="14" rx="7" fill={TARJETA} {...trazo} />
      <rect x="52" y="64" width="62" height="14" rx="7" fill={TARJETA} {...trazo} />
      <rect x="52" y="86" width="72" height="14" rx="7" fill={TARJETA} {...trazo} />
      <circle cx="132" cy="92" r="22" fill={AZUL_SUAVE} fillOpacity="0.9" {...trazo} />
      <path d="M148 108l16 16" {...trazo} strokeWidth="3" />
      <path d="M124 92h16" {...trazo} stroke={AZUL} />
    </>
  );
}

/** Gráfico sin datos del periodo: barras vacías sobre una base punteada. */
function Grafico() {
  return (
    <>
      <Disco />
      <rect x="48" y="38" width="104" height="88" rx="10" fill={TARJETA} {...trazo} />
      <rect x="62" y="86" width="14" height="26" rx="3" fill={FONDO} />
      <rect x="84" y="70" width="14" height="42" rx="3" fill={AZUL_SUAVE} />
      <rect x="106" y="94" width="14" height="18" rx="3" fill={FONDO} />
      <rect x="128" y="78" width="14" height="34" rx="3" fill={FONDO} />
      <path d="M58 114h84" stroke={LINEA} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 5" />
      <path d="M62 54h26" {...trazo} stroke={AZUL} />
      <circle cx="140" cy="54" r="3.5" fill={MAGENTA} />
    </>
  );
}

/** Cobros y recibos todavía sin movimientos. */
function Cobros() {
  return (
    <>
      <Disco />
      <rect x="54" y="30" width="62" height="94" rx="8" fill={TARJETA} {...trazo} />
      <path d="M66 52h38M66 66h38M66 80h24" stroke={LINEA} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M54 124l7-6 8 6 8-6 8 6 8-6 8 6 8-6" fill="none" {...trazo} />
      <rect x="92" y="70" width="64" height="40" rx="8" fill={AZUL_SUAVE} {...trazo} />
      <path d="M92 84h64" {...trazo} />
      <rect x="102" y="96" width="18" height="5" rx="2.5" fill={AZUL} />
    </>
  );
}

/** Imagen de relleno (foto o logo todavía sin subir). */
function Relleno() {
  return (
    <>
      <Disco />
      <rect x="46" y="38" width="108" height="80" rx="10" fill={TARJETA} {...trazo} />
      <circle cx="126" cy="62" r="8" fill={MAGENTA_SUAVE} {...trazo} />
      <path d="M58 108l22-26 16 18 12-12 30 20z" fill={AZUL_SUAVE} {...trazo} />
    </>
  );
}

export const ESCENAS = {
  /** Una lista o tabla sin filas todavía. */
  sinDatos: SinDatos,
  /** Calendario, horario o agenda sin clases. */
  agenda: Agenda,
  /** Clientas, equipo o contactos sin dar de alta. */
  personas: Personas,
  /** Búsqueda o filtro sin coincidencias. */
  busqueda: Busqueda,
  /** Un gráfico o informe sin datos del periodo. */
  grafico: Grafico,
  /** Cobros, recibos o caja sin movimientos. */
  cobros: Cobros,
  /** Imagen de relleno: foto, logo o portada sin subir. */
  relleno: Relleno,
} as const satisfies Record<string, () => ReactNode>;

export type NombreEscena = keyof typeof ESCENAS;

export function Escena({ nombre, className }: { nombre: NombreEscena; className?: string }) {
  const Dibujo = ESCENAS[nombre];
  // Una ilustración subida (`public/ilustraciones/vacio-<nombre>.svg` y su clave en el manifiesto) manda sobre la de código.
  const externa = rutaIlustracion(`vacio-${nombre}`);
  if (externa) {
    // eslint-disable-next-line @next/next/no-img-element -- SVG decorativo local: next/image no optimiza SVG.
    return <img src={externa} alt="" aria-hidden="true" className={cn('h-auto w-44 shrink-0', className)} data-escena={nombre} />;
  }
  return (
    <svg
      viewBox="0 0 200 150"
      className={cn('h-auto w-44 shrink-0', className)}
      aria-hidden="true"
      focusable="false"
      data-escena={nombre}
    >
      <Dibujo />
    </svg>
  );
}
