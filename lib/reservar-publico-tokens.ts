// Lenguaje visual de la página pública `/reservar/[slug]` — extraído pixel a
// pixel del diseño "Reservas" (Instrument Serif + Instrument Sans, tarjetas
// blancas sobre hueso, sombras muy difuminadas tiradas de un verde oscuro).
//
// Es SU PROPIO lenguaje, distinto del portal privado (`lib/portal-design.ts`,
// `lib/portal-tokens.ts`): comparte familia tipográfica y curva de animación
// con el resto del producto (por eso se reexportan de aquí, no se duplican),
// pero radios, sombras y el patrón de espaciado responsive (clamp()+cqw en vez
// de media queries) son propios de esta pantalla.
//
// El color de marca (botones, chips activos) sigue siendo `--portal-brand`
// (white-label por estudio, decisión ya cerrada) y NO el oliva fijo #2C352C
// del diseño original (que era el color de una marca de ejemplo, "Estudio
// Alma"). Los neutros (fondo, tarjeta, tinta, línea) sí son exactos: son los
// mismos que ya expone `lib/portal-paleta.ts` — esta pantalla YA es la fuente
// de ese diseño, así que no hace falta una sexta paleta.
import type { CSSProperties } from 'react';
import { serif, sans, EASE } from './portal-design';

export { serif, sans, EASE };

// ── Contenedor responsive ───────────────────────────────────────────────────
// El diseño no usa media queries: un único `container-type: inline-size` en
// la raíz + `clamp(min, Ncqw, max)` en cada medida hace que la misma marca
// sirva de 320px a 1280px+. `cq` es el shorthand para escribir esos clamps
// sin repetir "cqw" en cada sitio.
export const containerRoot: CSSProperties = { containerType: 'inline-size' };
export function cq(min: number, vw: number, max: number): string {
  return `clamp(${min}px, ${vw}cqw, ${max}px)`;
}

// ── Radios (exactos al diseño) ──────────────────────────────────────────────
export const radius = {
  hero: 28,      // tarjetas de foto grandes (cita, estudio)
  card: 26,      // tarjeta de clase/servicio/reserva
  cardSmall: 24, // tarjetas de plan compactas
  chipCard: 22,  // mini-tarjetas de tipo de clase
  hour: 18,      // botón de hora (citas)
  spot: 15,      // celda del selector de sitio
  pillBtnLg: 26, // botón alto 52px
  pillBtnCta: 31,// CTA 62px
  pillBtnMd: 25, // botón 50px
  pillBtnSm: 24, // botón 48px
  pillBtnXs: 23, // botón 46px
  navCircle: 21, // flecha circular de navegación (42px)
  pill: 999,
} as const;

// ── Sombras (tiradas del mismo verde oscuro, nunca negro puro) ─────────────
export const shadow = {
  card: '0 16px 36px -28px rgba(34,42,30,.5)',
  cardHover: '0 20px 40px -24px rgba(34,42,30,.5)',
  sidebarCard: '0 18px 40px -30px rgba(34,42,30,.5)',
  hero: '0 22px 46px -32px rgba(34,42,30,.5)',
  ctaOscuro: '0 18px 34px -18px rgba(34,42,30,.6)',
  ctaOscuroFuerte: '0 20px 40px -24px rgba(34,42,30,.6)',
  headerBtn: '0 14px 28px -16px rgba(34,42,30,.55)',
  planClaro: '0 14px 32px -28px rgba(34,42,30,.5)',
  miniCard: '0 12px 28px -26px rgba(34,42,30,.5)',
} as const;

// ── Tipografía ───────────────────────────────────────────────────────────────
export function eyebrow(size = 9): CSSProperties {
  return {
    fontFamily: sans, fontSize: size, fontWeight: 500, letterSpacing: '.28em',
    paddingLeft: '.28em', textTransform: 'uppercase',
  };
}
export function heading(vw: [number, number, number], it = false): CSSProperties {
  return { fontFamily: serif, fontSize: cq(...vw), fontStyle: it ? 'italic' : 'normal', lineHeight: 1 };
}

export const easeCard = `border-color .4s ease, background .4s ease, transform .5s ${EASE}`;
export const easeBtn = `background .35s ease, transform .45s ${EASE}`;
