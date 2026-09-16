// ─────────────────────────────────────────────────────────────────────────────
// Los correos que TENTARE manda a los estudios: fallo de pago de la
// suscripción, estudio vencido, accesos del equipo, el resumen semanal...
//
// Aquí manda la marca de Tentare, NO la del estudio: quien escribe es el
// proveedor del servicio. Por eso la paleta es fija (el kit oliva) y no se
// deriva de nada, y la cara es la misma que ya tienen los correos de acceso de
// Supabase (`supabase/templates/*.html`): el logo horizontal, la regla dorada y
// el titular en oliva. Una propietaria recibe los dos tipos y tienen que
// reconocerse como del mismo remitente.
//
// La estructura sigue la referencia «Gym Newsletter»: antetítulo, titular
// grueso, agenda en filas, bloque de cifras y un botón fuerte. Mismas reglas de
// compatibilidad que el sistema del estudio (lib/emails/estudio/plantilla.ts):
// tablas, estilos en línea, 600 px fijos para Outlook, preheader oculto.
// ─────────────────────────────────────────────────────────────────────────────

import { LEGAL } from '../../legal-info.ts';
import { escaparHtml, hrefSeguro, preheaderHtml, cabezaHtml } from '../html.ts';

/** El kit de marca de Tentare. Los únicos colores de esta familia. */
export const TENTARE = {
  fondo: '#EEEEE8',
  papel: '#FFFFFF',
  borde: '#D3CFC2',
  oliva: '#343825',
  olivaMedio: '#5A6142',
  dorado: '#D9C29E',
  arena: '#F1F2EA',
  tinta: '#3A3A34',
  tintaSuave: '#63635D',
  /** Avisos con significado propio: un cobro fallido, un borrado de datos. */
  alerta: '#B91C1C',
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
  /** Color de la regla bajo el logo. Ausente = el dorado de la marca. */
  acento?: string | null;
  /**
   * Por qué le llega este correo. Va en el pie, y no es decoración: un aviso
   * de software sin motivo se lee como spam.
   */
  motivo?: string | null;
}

export function correoTentare(o: CorreoTentareOpts): string {
  const t = TENTARE;
  const regla = o.acento?.trim() || t.dorado;
  const bloques = [
    cabecera(regla),
    titular(o),
    o.agenda && o.agenda.filas.length > 0 ? agenda(o.agenda) : '',
    o.cifras && o.cifras.length > 0 ? cifras(o.cifras) : '',
    o.destacado ? destacado(o.destacado) : '',
    o.boton ? boton(o.boton, o.enlace) : '',
    o.nota?.trim() ? nota(o.nota.trim()) : '',
  ].join('');

  return `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
${cabezaHtml('Tentare', t.fondo, t.olivaMedio, ANCHO, '* { font-family: Arial, Helvetica, sans-serif !important; }')}
<body style="margin:0;padding:0;background:${t.fondo};">
${preheaderHtml(o.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.fondo}" style="background:${t.fondo};">
<tr><td align="center" style="padding:32px 12px;">
<!--[if mso | IE]>
<table role="presentation" width="${ANCHO}" align="center" cellpadding="0" cellspacing="0" border="0" style="width:${ANCHO}px;"><tr><td>
<![endif]-->
<div class="w-full" style="max-width:${ANCHO}px;margin:0 auto;text-align:left;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.papel}" style="background:${t.papel};border:1px solid ${t.borde};border-radius:10px;">
${bloques}
</table>
${pie(o.motivo)}
</div>
<!--[if mso | IE]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

// ── Piezas ───────────────────────────────────────────────────────────────────

function cabecera(regla: string): string {
  // Mismas medidas que en supabase/templates/*.html: 132×35. Con las imágenes
  // bloqueadas —el caso por defecto en media bandeja— el `alt` dice de quién es.
  return `<tr><td class="px-mobile" style="padding:26px 32px 20px;">
<img src="${LOGO_TENTARE_URL}" width="132" height="35" alt="Tentare" style="display:block;border:0;width:132px;height:35px;">
</td></tr>
<tr><td style="padding:0 32px;"><div style="height:2px;line-height:2px;font-size:0;background:${regla};">&nbsp;</div></td></tr>`;
}

function titular(o: CorreoTentareOpts): string {
  const t = TENTARE;
  const ante = o.antetitulo?.trim()
    ? `<div style="font-family:${PILA};font-size:10.5px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${t.olivaMedio};margin:0 0 10px;">${escaparHtml(o.antetitulo.trim())}</div>`
    : '';
  const parrafos = (o.parrafos ?? [])
    .filter((p): p is string => !!p && p.trim() !== '')
    .map(p => `<div style="font-family:${PILA};font-size:15px;line-height:1.65;color:${t.tinta};margin:0 0 14px;">${escaparHtml(p)}</div>`)
    .join('');
  return `<tr><td class="px-mobile" style="padding:28px 32px 8px;">
${ante}<div style="font-family:${PILA};font-weight:800;font-size:26px;line-height:1.2;letter-spacing:-0.02em;color:${t.oliva};margin:0 0 14px;">${escaparHtml(o.titular)}</div>
${parrafos}
</td></tr>`;
}

function agenda(a: NonNullable<CorreoTentareOpts['agenda']>): string {
  const t = TENTARE;
  const titulo = a.titulo?.trim()
    ? `<div style="font-family:${PILA};font-size:10.5px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${t.olivaMedio};margin:0 0 8px;">${escaparHtml(a.titulo.trim())}</div>`
    : '';
  // La columna mide lo que su texto más largo, con techo: a 140 px fijos un
  // «T1» se quedaba con media pantalla del móvil y el resto iba en cuatro líneas.
  const larga = Math.max(...a.filas.map(f => f.cuando.length));
  const anchoCuando = Math.min(140, Math.max(44, larga * 8 + 16));
  const filas = a.filas.map(f => `<tr>
<td width="${anchoCuando}" valign="top" style="padding:9px 12px 9px 0;border-top:1px solid ${t.arena};font-family:${PILA};font-weight:bold;font-size:13px;color:${t.oliva};${f.tachado ? 'text-decoration:line-through;' : ''}">${escaparHtml(f.cuando)}</td>
<td valign="top" style="padding:9px 0;border-top:1px solid ${t.arena};font-family:${PILA};font-size:14px;line-height:1.5;color:${t.tinta};${f.tachado ? 'text-decoration:line-through;' : ''}">${escaparHtml(f.que)}</td>
</tr>`).join('');
  return `<tr><td class="px-mobile" style="padding:8px 32px 18px;">
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
  const celdas = visibles.map(c => `<td width="${ancho}%" valign="top" style="padding:18px 8px;text-align:center;">
<div style="font-family:${PILA};font-weight:800;font-size:${cuerpo}px;line-height:1.15;color:${t.oliva};margin:0 0 6px;white-space:nowrap;">${escaparHtml(c.valor)}</div>
<div style="font-family:${PILA};font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:${t.tintaSuave};">${escaparHtml(c.etiqueta)}</div>
</td>`).join('');
  return `<tr><td class="px-mobile" style="padding:6px 32px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.arena}" style="background:${t.arena};border-radius:8px;"><tr>${celdas}</tr></table>
</td></tr>`;
}

function destacado(d: NonNullable<CorreoTentareOpts['destacado']>): string {
  const t = TENTARE;
  const texto = d.texto?.trim()
    ? `<div style="font-family:${PILA};font-size:13.5px;line-height:1.55;color:${t.tinta};margin:4px 0 0;word-break:break-word;">${escaparHtml(d.texto.trim())}</div>`
    : '';
  return `<tr><td class="px-mobile" style="padding:6px 32px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.arena}" style="background:${t.arena};border-left:3px solid ${t.dorado};"><tr><td style="padding:14px 16px;">
<div style="font-family:${PILA};font-weight:bold;font-size:14px;color:${t.oliva};word-break:break-word;">${escaparHtml(d.titulo)}</div>${texto}
</td></tr></table>
</td></tr>`;
}

function boton(b: { href: string; texto: string }, enlace?: { href: string; texto: string } | null): string {
  const t = TENTARE;
  // El botón «fuerte» de la referencia: esquinas apenas redondeadas, versales y
  // el dorado de la marca sobre oliva (6,9:1). `mso-padding-alt` le da el alto
  // en Outlook, que no entiende el padding de un `<a>`.
  return `<tr><td class="px-mobile" style="padding:6px 32px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${t.oliva}" style="border-radius:8px;background:${t.oliva};mso-padding-alt:14px 26px;">
<a href="${hrefSeguro(b.href)}" style="display:inline-block;padding:14px 26px;font-family:${PILA};font-weight:bold;font-size:13px;letter-spacing:.6px;text-transform:uppercase;color:${t.dorado};text-decoration:none;border-radius:8px;line-height:1.15;">${escaparHtml(b.texto)}</a>
</td></tr></table>${enlace ? `
<div style="font-family:${PILA};font-size:13px;margin:12px 0 0;"><a href="${hrefSeguro(enlace.href)}" style="color:${t.olivaMedio};text-decoration:underline;">${escaparHtml(enlace.texto)}</a></div>` : ''}
</td></tr>`;
}

function nota(texto: string): string {
  const t = TENTARE;
  return `<tr><td class="px-mobile" style="padding:0 32px 28px;">
<div style="font-family:${PILA};font-size:12.5px;line-height:1.6;color:${t.tintaSuave};">${escaparHtml(texto)}</div>
</td></tr>`;
}

function pie(motivo?: string | null): string {
  const t = TENTARE;
  const porQue = motivo?.trim() ? `${escaparHtml(motivo.trim())}<br>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="px-mobile" style="padding:18px 8px 0;font-family:${PILA};font-size:11px;line-height:1.6;color:${t.tintaSuave};text-align:center;">
${porQue}Tentare · software para estudios de Pilates · <a href="mailto:${LEGAL.email}" style="color:${t.tintaSuave};text-decoration:underline;">${LEGAL.email}</a>
</td></tr></table>`;
}
