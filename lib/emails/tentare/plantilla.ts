// ─────────────────────────────────────────────────────────────────────────────
// Los correos que TENTARE manda a los estudios: fallo de pago de la
// suscripción, estudio vencido, accesos del equipo, el resumen semanal...
//
// Aquí manda la marca de Tentare, NO la del estudio: quien escribe es el
// proveedor del servicio. Por eso la paleta es fija y no se deriva de nada.
//
// El estilo (21-nov-2026, pedido del fundador con capturas de Shopify): oscuro, el
// titular grande y centrado, el logo en una pastilla blanca, un botón blanco
// redondeado y paneles sobre la tarjeta. Los colores salen de los tokens oscuros del
// Brand OS (`brand/design-tokens.json`, `semantic.dark`): no se inventan aquí.
// ⚠️ Los correos de acceso de Supabase (`supabase/templates/*.html`) siguen con el
// estilo claro anterior: no se despliegan con el merge y hay que reaplicarlos
// (`scripts/alta-nueva-plantilla-codigo.ts`), así que conviven dos caras hasta entonces.
//
// Mismas reglas de compatibilidad que el sistema del estudio
// (lib/emails/estudio/plantilla.ts): tablas, estilos en línea, 600 px fijos para
// Outlook, preheader oculto, y `bgcolor` en cada fondo (Outlook ignora el CSS).
// ─────────────────────────────────────────────────────────────────────────────

import { LEGAL } from '../../legal-info.ts';
import { escaparHtml, hrefSeguro, preheaderHtml, cabezaHtml } from '../html.ts';

/** El kit de marca de Tentare para correos. Los únicos colores de esta familia, por ROL (no por tono). */
export const TENTARE = {
  /** El fondo de la bandeja alrededor de la tarjeta (`surface-canvas`). */
  fondo: '#12161B',
  /** La tarjeta del correo (`surface-raised`). */
  tarjeta: '#1B2027',
  /** Paneles dentro de la tarjeta: cifras, destacado, QR (`surface-sunken`). */
  panel: '#242A33',
  borde: '#2F3640',
  /** Titulares y lo importante (`text-primary`). También el botón. */
  texto: '#F2EEE7',
  /** El cuerpo del correo (`text-secondary`). */
  cuerpo: '#B4BAC2',
  /** Letra pequeña, pie y etiquetas (`ink-400`). */
  suave: '#8A9098',
  /** El toque de color: antetítulos, enlaces y la regla bajo el logo (`sand`). */
  realce: '#D8CDBB',
  /** Avisos con significado propio: un cobro fallido, un borrado de datos. */
  alerta: '#EF6B5E',
  /** Solo la pastilla del logo y la placa del QR: ambos son imágenes pensadas para fondo claro. */
  blanco: '#FFFFFF',
} as const;

/** El lockup horizontal que ya usan los correos de acceso. Sale de docs/marca con `node scripts/regenerar-marca.mjs`. */
export const LOGO_TENTARE_URL = `${LEGAL.url}/logo-horizontal.png`;

const ANCHO = 600;
/**
 * Sin serif en esta familia, así que la pila acaba siempre en Arial. ⚠️ Outlook
 * de Windows NO baja por la pila si la primera fuente no está instalada: cae a
 * Times New Roman. Por eso además va el condicional `mso` que fuerza Arial.
 */
const PILA = "'Plus Jakarta Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
/** La misma pila, para los correos de esta familia que montan sus propios bloques (alta.ts). */
export const PILA_TENTARE = PILA;

export interface CorreoTentareOpts {
  /** Lo que se lee en la bandeja junto al asunto. */
  preheader: string;
  /** Una etiqueta corta en versales encima del titular («TU SUSCRIPCIÓN»). */
  antetitulo?: string | null;
  titular: string;
  parrafos?: (string | null | undefined)[];
  /** Filas «cuándo / qué». El «This week's schedule» de la referencia. */
  agenda?: { titulo?: string | null; filas: { cuando: string; que: string; tachado?: boolean }[] } | null;
  /** Dos o tres cifras grandes con su etiqueta. */
  cifras?: { valor: string; etiqueta: string }[] | null;
  /** Una banda destacada, para lo que no se puede pasar por alto. */
  destacado?: { titulo: string; texto?: string | null } | null;
  boton?: { href: string; texto: string } | null;
  /**
   * Un segundo destino, en pequeño bajo el botón. Nunca dos botones: un correo
   * tiene UNA llamada a la acción, y la segunda va como enlace.
   */
  enlace?: { href: string; texto: string } | null;
  /** Letra pequeña del final. */
  nota?: string | null;
  /** Color de la regla bajo el logo. Ausente = el realce (arena) de la marca. */
  acento?: string | null;
  /**
   * Por qué le llega este correo. Va en el pie, y no es decoración: un aviso
   * de software sin motivo se lee como spam.
   */
  motivo?: string | null;
}

export function correoTentare(o: CorreoTentareOpts): string {
  const regla = o.acento?.trim() || TENTARE.realce;
  const bloques = [
    cabecera(regla),
    titular(o),
    o.agenda && o.agenda.filas.length > 0 ? agenda(o.agenda) : '',
    o.cifras && o.cifras.length > 0 ? cifras(o.cifras) : '',
    o.destacado ? destacado(o.destacado) : '',
    o.boton ? boton(o.boton, o.enlace) : '',
    o.nota?.trim() ? nota(o.nota.trim()) : '',
  ].join('');

  return marcoTentare(o.preheader, bloques, pie(o.motivo));
}

/**
 * El marco de todos los correos de Tentare: cabeza, preheader, la tarjeta de
 * 600 px (con su tabla para Outlook) y el pie. Lo usa `correoTentare` y lo usa
 * el correo del alta nueva (`alta.ts`), que necesita un orden de bloques que
 * `correoTentare` no tiene (el enlace de su página entre dos párrafos) y un pie
 * propio. Así el marco no se copia.
 */
export function marcoTentare(preheader: string, bloques: string, pieHtml: string): string {
  const t = TENTARE;
  return `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
${cabezaHtml('Tentare', t.fondo, t.realce, ANCHO, '* { font-family: Arial, Helvetica, sans-serif !important; }', 'dark')}
<body style="margin:0;padding:0;background:${t.fondo};" bgcolor="${t.fondo}">
${preheaderHtml(preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.fondo}" style="background:${t.fondo};">
<tr><td align="center" style="padding:32px 12px;">
<!--[if mso | IE]>
<table role="presentation" width="${ANCHO}" align="center" cellpadding="0" cellspacing="0" border="0" style="width:${ANCHO}px;"><tr><td>
<![endif]-->
<div class="w-full" style="max-width:${ANCHO}px;margin:0 auto;text-align:left;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.tarjeta}" style="background:${t.tarjeta};border:1px solid ${t.borde};border-radius:16px;">
${bloques}
</table>
${pieHtml}
</div>
<!--[if mso | IE]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

// ── Piezas ───────────────────────────────────────────────────────────────────

/** El logo y la regla de color: la misma cabecera en todos los correos de Tentare. */
export function cabeceraTentare(regla: string = TENTARE.realce): string {
  return cabecera(regla);
}

/** El botón de la marca (un correo, una llamada a la acción). */
export function botonTentare(b: { href: string; texto: string }): string {
  return boton(b);
}

function cabecera(regla: string): string {
  const t = TENTARE;
  // El logo del kit es para fondo claro: va en una pastilla blanca, como el de
  // Shopify en su correo. Mismas medidas de imagen que en supabase/templates/*.html
  // (132×35). Con las imágenes bloqueadas —el caso por defecto en media bandeja— el
  // `alt` dice de quién es.
  return `<tr><td class="px-mobile" style="padding:28px 32px 22px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${t.blanco}" style="background:${t.blanco};border-radius:12px;padding:11px 18px;">
<img src="${LOGO_TENTARE_URL}" width="132" height="35" alt="Tentare" style="display:block;border:0;width:132px;height:35px;">
</td></tr></table>
</td></tr>
<tr><td style="padding:0 32px;"><div style="height:2px;line-height:2px;font-size:0;background:${regla};">&nbsp;</div></td></tr>`;
}

function titular(o: CorreoTentareOpts): string {
  const t = TENTARE;
  const ante = o.antetitulo?.trim()
    ? `<div style="font-family:${PILA};font-size:11px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:${t.realce};margin:0 0 14px;">${escaparHtml(o.antetitulo.trim())}</div>`
    : '';
  const parrafos = (o.parrafos ?? [])
    .filter((p): p is string => !!p && p.trim() !== '')
    .map(p => `<div style="font-family:${PILA};font-size:16px;line-height:1.65;color:${t.cuerpo};margin:0 0 14px;">${escaparHtml(p)}</div>`)
    .join('');
  return `<tr><td class="px-mobile" align="center" style="padding:40px 32px 12px;text-align:center;">
${ante}<div style="font-family:${PILA};font-weight:800;font-size:34px;line-height:1.15;letter-spacing:-0.025em;color:${t.texto};margin:0 0 18px;">${escaparHtml(o.titular)}</div>
${parrafos}
</td></tr>`;
}

function agenda(a: NonNullable<CorreoTentareOpts['agenda']>): string {
  const t = TENTARE;
  const titulo = a.titulo?.trim()
    ? `<div style="font-family:${PILA};font-size:11px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:${t.realce};margin:0 0 8px;">${escaparHtml(a.titulo.trim())}</div>`
    : '';
  // La columna mide lo que su texto más largo, con techo: a 140 px fijos un
  // «T1» se quedaba con media pantalla del móvil y el resto iba en cuatro líneas.
  const larga = Math.max(...a.filas.map(f => f.cuando.length));
  const anchoCuando = Math.min(140, Math.max(44, larga * 8 + 16));
  const filas = a.filas.map(f => `<tr>
<td width="${anchoCuando}" valign="top" style="padding:11px 12px 11px 0;border-top:1px solid ${t.borde};font-family:${PILA};font-weight:bold;font-size:13px;color:${t.texto};${f.tachado ? 'text-decoration:line-through;' : ''}">${escaparHtml(f.cuando)}</td>
<td valign="top" style="padding:11px 0;border-top:1px solid ${t.borde};font-family:${PILA};font-size:14px;line-height:1.5;color:${t.cuerpo};${f.tachado ? 'text-decoration:line-through;' : ''}">${escaparHtml(f.que)}</td>
</tr>`).join('');
  return `<tr><td class="px-mobile" style="padding:8px 32px 20px;">
${titulo}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}</table>
</td></tr>`;
}

function cifras(cs: { valor: string; etiqueta: string }[]): string {
  const t = TENTARE;
  // Más de tres no caben en 375 px sin que la cifra se parta en dos líneas.
  const visibles = cs.slice(0, 3);
  const ancho = Math.floor(100 / visibles.length);
  // El cuerpo baja con la cifra más larga del bloque, no con cada una: tres
  // tamaños distintos en fila se leen como un descuadre. «10.000,00 €» a 26 px
  // no cabía en un tercio de 600 y el «€» saltaba de línea.
  const larga = Math.max(...visibles.map(c => c.valor.length));
  const cuerpo = visibles.length === 1 || larga <= 7 ? 26 : larga <= 9 ? 20 : 17;
  const celdas = visibles.map(c => `<td width="${ancho}%" valign="top" style="padding:20px 8px;text-align:center;">
<div style="font-family:${PILA};font-weight:800;font-size:${cuerpo}px;line-height:1.15;color:${t.texto};margin:0 0 6px;white-space:nowrap;">${escaparHtml(c.valor)}</div>
<div style="font-family:${PILA};font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:${t.cuerpo};">${escaparHtml(c.etiqueta)}</div>
</td>`).join('');
  return `<tr><td class="px-mobile" style="padding:6px 32px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.panel}" style="background:${t.panel};border-radius:12px;"><tr>${celdas}</tr></table>
</td></tr>`;
}

function destacado(d: NonNullable<CorreoTentareOpts['destacado']>): string {
  const t = TENTARE;
  const texto = d.texto?.trim()
    ? `<div style="font-family:${PILA};font-size:13.5px;line-height:1.55;color:${t.cuerpo};margin:4px 0 0;word-break:break-word;">${escaparHtml(d.texto.trim())}</div>`
    : '';
  return `<tr><td class="px-mobile" style="padding:6px 32px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.panel}" style="background:${t.panel};border-left:3px solid ${t.realce};border-radius:4px;"><tr><td style="padding:16px 18px;">
<div style="font-family:${PILA};font-weight:bold;font-size:14px;color:${t.texto};word-break:break-word;">${escaparHtml(d.titulo)}</div>${texto}
</td></tr></table>
</td></tr>`;
}

function boton(b: { href: string; texto: string }, enlace?: { href: string; texto: string } | null): string {
  const t = TENTARE;
  // El botón de la referencia: píldora clara con texto oscuro. `mso-padding-alt` le
  // da el alto en Outlook, que no entiende el padding de un `<a>` (y que dibuja las
  // esquinas rectas: sigue siendo un botón legible).
  return `<tr><td class="px-mobile" align="center" style="padding:10px 32px 32px;text-align:center;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td align="center" bgcolor="${t.texto}" style="border-radius:999px;background:${t.texto};mso-padding-alt:16px 34px;">
<a href="${hrefSeguro(b.href)}" style="display:inline-block;padding:16px 34px;font-family:${PILA};font-weight:bold;font-size:15px;color:${t.fondo};text-decoration:none;border-radius:999px;line-height:1.15;">${escaparHtml(b.texto)}</a>
</td></tr></table>${enlace ? `
<div style="font-family:${PILA};font-size:13px;margin:16px 0 0;"><a href="${hrefSeguro(enlace.href)}" style="color:${t.realce};text-decoration:underline;">${escaparHtml(enlace.texto)}</a></div>` : ''}
</td></tr>`;
}

function nota(texto: string): string {
  const t = TENTARE;
  return `<tr><td class="px-mobile" align="center" style="padding:0 32px 32px;text-align:center;">
<div style="font-family:${PILA};font-size:12.5px;line-height:1.6;color:${t.suave};">${escaparHtml(texto)}</div>
</td></tr>`;
}

function pie(motivo?: string | null): string {
  const t = TENTARE;
  const porQue = motivo?.trim() ? `${escaparHtml(motivo.trim())}<br>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="px-mobile" style="padding:20px 8px 0;font-family:${PILA};font-size:11px;line-height:1.6;color:${t.suave};text-align:center;">
${porQue}Tentare · software para estudios de Pilates · <a href="mailto:${LEGAL.email}" style="color:${t.suave};text-decoration:underline;">${LEGAL.email}</a>
</td></tr></table>`;
}
