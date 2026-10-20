// Logos de MENTIRA para probar la franja de clientes (e2e y capturas): estudios
// con nombres inventados y SVG dibujados aquí, en línea (data URI). Nunca el logo
// de un cliente real, ni en el repo ni en una captura versionada.
//
// Solo los usan `logos-clientes-servidor.ts` con `E2E_TEST=1` (la variable no
// existe en producción) y la ruta de pruebas `/e2e-franja-logos`.
import type { LogoCliente } from './logos-clientes.ts';

const MUESTRAS: { nombre: string; color: string; forma: 'circulo' | 'cuadrado' | 'rombo'; serif: boolean }[] = [
  { nombre: 'Estudio Nube', color: '#3B6FB6', forma: 'circulo', serif: false },
  { nombre: 'Luna Reformer', color: '#8A4FB0', forma: 'circulo', serif: true },
  { nombre: 'Taller Brisa', color: '#2E9E7A', forma: 'cuadrado', serif: false },
  { nombre: 'Casa Olmo', color: '#B5651D', forma: 'rombo', serif: true },
  { nombre: 'Pilates Faro', color: '#C0392B', forma: 'cuadrado', serif: false },
  { nombre: 'Yoga Ribera', color: '#1F8A9E', forma: 'rombo', serif: false },
  { nombre: 'Atelier Cobre', color: '#B8732E', forma: 'circulo', serif: true },
  { nombre: 'Sala Marea', color: '#34495E', forma: 'cuadrado', serif: true },
];

function svgDe(m: (typeof MUESTRAS)[number]): string {
  const marca = m.forma === 'circulo'
    ? `<circle cx="14" cy="20" r="12" fill="${m.color}"/>`
    : m.forma === 'cuadrado'
      ? `<rect x="2" y="8" width="24" height="24" rx="5" fill="${m.color}"/>`
      : `<polygon points="14,6 26,20 14,34 2,20" fill="${m.color}"/>`;
  const fuente = m.serif ? 'Georgia, serif' : 'Helvetica, Arial, sans-serif';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40" width="160" height="40">${marca}`
    + `<text x="34" y="26" font-family="${fuente}" font-size="15.5" font-weight="700" fill="${m.color}">${m.nombre}</text></svg>`;
}

/** `n` logos de prueba (hasta 12; pasados los 8 distintos, se repiten con otro número en el nombre). */
export function logosDePrueba(n: number): LogoCliente[] {
  const cuantos = Number.isFinite(n) ? Math.max(0, Math.min(12, Math.floor(n))) : 0;
  return Array.from({ length: cuantos }, (_, i) => {
    const base = MUESTRAS[i % MUESTRAS.length];
    const m = i < MUESTRAS.length ? base : { ...base, nombre: `${base.nombre} ${Math.floor(i / MUESTRAS.length) + 1}` };
    return { nombre: m.nombre, logoUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svgDe(m))}` };
  });
}
