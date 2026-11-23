// ─────────────────────────────────────────────────────────────────────────────
// Los correos que TENTARE manda a los estudios: fallo de pago de la
// suscripción, estudio vencido, accesos del equipo, el resumen semanal...
//
// Aquí manda la marca de Tentare, NO la del estudio: quien escribe es el
// proveedor del servicio. Por eso la paleta es fija y no se deriva de nada.
//
// El estilo (pedido del fundador con capturas de Shopify): titular grande y centrado, logo
// arriba, botón en píldora y paneles sobre la tarjeta. ⚠️ Es CLARO por defecto y se
// adapta al modo oscuro del destinatario: la captura de Shopify se veía oscura porque el
// móvil de quien la hizo estaba en modo oscuro, no porque el correo lo fuera. Unos
// destinatarios lo abren con fondo blanco y otros con fondo negro, y los dos tienen que
// leerlo bien. Los colores salen de los tokens del Brand OS (`brand/design-tokens.json`,
// `semantic.light` y `semantic.dark`).
//
// Cómo se adapta: cada color del correo va EN LÍNEA con su valor claro (lo que ven Outlook de
// escritorio y todo cliente que no sepa de modos), y `cssModoOscuro()` genera, a partir de las
// dos paletas, las reglas que cambian cada color claro por su pareja oscura con
// `@media (prefers-color-scheme: dark)` (Apple Mail, iOS, Outlook.com y la mayoría de apps) y
// los atributos `data-ogsc`/`data-ogsb` (Outlook.com y su app). Gmail no tiene modo propio para
// el autor: oscurece solo un correo claro, y por eso los claros no son blanco ni negro puros.
// Como se cambia por valor, los correos que montan sus propios bloques (`alta.ts`) se adaptan
// sin hacer nada, SIEMPRE que usen estos colores y no otros.
//
// Mismas reglas de compatibilidad que el sistema del estudio (lib/emails/estudio/plantilla.ts):
// tablas, estilos en línea, 600 px fijos para Outlook, preheader oculto, y `bgcolor` en cada fondo.
// ─────────────────────────────────────────────────────────────────────────────

import { LEGAL } from '../../legal-info.ts';
import { escaparHtml, hrefSeguro, preheaderHtml, cabezaHtml } from '../html.ts';

/**
 * El kit de marca de Tentare para correos, por ROL (no por tono), en su versión CLARA: es la que va en línea.
 * ⚠️ Dentro de cada propiedad (fondo, color de texto, borde) los valores tienen que ser DISTINTOS entre
 * roles: el modo oscuro cambia por valor, y dos roles con el mismo hex se cambiarían a lo mismo.
 */
export const TENTARE = {
  /** El fondo de la bandeja alrededor de la tarjeta (`surface-canvas`). */
  fondo: '#F7F4EE',
  /** La tarjeta del correo (`surface-raised`). */
  tarjeta: '#FFFFFF',
  /** Paneles dentro de la tarjeta: cifras y destacados (`surface-sunken`). */
  panel: '#ECE6DC',
  borde: '#E3DCD0',
  /** Titulares y lo importante (`text-primary`). */
  texto: '#222A33',
  /** El cuerpo del correo (`text-secondary`). */
  cuerpo: '#3A424D',
  /** Letra pequeña, pie y etiquetas (`text-tertiary`). */
  suave: '#5E6670',
  /** Antetítulos y enlaces (`text-link`). */
  realce: '#3E6A82',
  /** Fondo y texto del botón: tinta sobre papel, y al revés en oscuro. */
  boton: '#2A313A',
  botonTexto: '#FFFFFF',
  /** La regla de color bajo el logo: decoración, no texto (`sand`). */
  regla: '#D8CDBB',
  /** Avisos con significado propio: un cobro fallido, un borrado de datos. */
  alerta: '#A3342A',
  /**
   * La placa del logo y la del QR: dos imágenes pensadas para fondo claro, que NO se oscurecen. Es a propósito
   * un blanco que no es `#FFFFFF` (el de la tarjeta): si fuera el mismo, el modo oscuro no podría oscurecer
   * la tarjeta y dejar la placa en blanco.
   */
  placa: '#FEFEFE',
} as const;

/** La pareja de cada color para quien tiene el modo oscuro puesto (`semantic.dark` del Brand OS). */
export const TENTARE_OSCURO: Record<keyof typeof TENTARE, string> = {
  fondo: '#12161B',
  tarjeta: '#1B2027',
  panel: '#242A33',
  borde: '#2F3640',
  texto: '#F2EEE7',
  cuerpo: '#B4BAC2',
  suave: '#8A9098',
  realce: '#7FAFC6',
  boton: '#F2EEE7',
  botonTexto: '#12161B',
  regla: '#D8CDBB',
  alerta: '#EF6B5E',
  placa: '#FEFEFE',
};

/** Todos los hex que puede llevar un correo de esta familia (claros y oscuros). Lo usan las pruebas. */
export const COLORES_TENTARE: readonly string[] = [...new Set([...Object.values(TENTARE), ...Object.values(TENTARE_OSCURO)])];

const FONDOS: (keyof typeof TENTARE)[] = ['fondo', 'tarjeta', 'panel', 'boton', 'alerta'];
const TEXTOS: (keyof typeof TENTARE)[] = ['texto', 'cuerpo', 'suave', 'realce', 'botonTexto'];
const BORDES: (keyof typeof TENTARE)[] = ['borde', 'realce'];

/**
 * Las reglas del modo oscuro, generadas de las dos paletas. Cambia por VALOR de color en línea
 * (`[style*="color:#222A33"]`), así que no hace falta una clase en cada elemento. `!important` porque el
 * estilo en línea gana a cualquier regla sin él.
 */
export function cssModoOscuro(): string {
  // Cada regla es una lista de selectores y un bloque: así el prefijo de Outlook.com se pone a TODOS los
  // selectores (un `[bgcolor=…]` sin prefijo se aplicaría siempre, también en claro).
  const reglas: { sel: string[]; decl: string }[] = [];
  const cada = (roles: (keyof typeof TENTARE)[], f: (claro: string, oscuro: string) => { sel: string[]; decl: string }) => {
    for (const r of roles) if (TENTARE[r] !== TENTARE_OSCURO[r]) reglas.push(f(TENTARE[r], TENTARE_OSCURO[r]));
  };
  cada(FONDOS, (c, o) => ({ sel: [`[style*="background:${c}"]`, `[bgcolor="${c}"]`], decl: `background: ${o} !important; background-color: ${o} !important;` }));
  cada(TEXTOS, (c, o) => ({ sel: [`[style*="color:${c}"]`], decl: `color: ${o} !important;` }));
  cada(BORDES, (c, o) => ({ sel: [`[style*="solid ${c}"]`], decl: `border-color: ${o} !important;` }));
  const pinta = (prefijo = '') => reglas.map(r => `${r.sel.map(x => `${prefijo}${x}`).join(', ')} { ${r.decl} }`).join('\n    ');
  // El enlace de la cabeza (`a { color }`) y el cuerpo de la página solo van en la media query.
  const base = `body { background: ${TENTARE_OSCURO.fondo} !important; }\n    a { color: ${TENTARE_OSCURO.realce}; }`;
  // Outlook.com y su app no usan la media query: marcan el correo con data-ogsb (fondo) y data-ogsc (texto).
  const ogs = [`[data-ogsb] `, `[data-ogsc] `].map(pre => pinta(pre)).join('\n    ');
  return `  @media (prefers-color-scheme: dark) {\n    ${pinta()}\n    ${base}\n  }\n    ${ogs}\n`;
}

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
  /** Color de la regla bajo el logo. Ausente = la arena de la marca. */
  acento?: string | null;
  /**
   * Por qué le llega este correo. Va en el pie, y no es decoración: un aviso
   * de software sin motivo se lee como spam.
   */
  motivo?: string | null;
}

export function correoTentare(o: CorreoTentareOpts): string {
  const regla = o.acento?.trim() || TENTARE.regla;
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
${cabezaHtml('Tentare', t.fondo, t.realce, ANCHO, '* { font-family: Arial, Helvetica, sans-serif !important; }', 'light dark', cssModoOscuro())}
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
export function cabeceraTentare(regla: string = TENTARE.regla): string {
  return cabecera(regla);
}

/** El botón de la marca (un correo, una llamada a la acción). */
export function botonTentare(b: { href: string; texto: string }): string {
  return boton(b);
}

function cabecera(regla: string): string {
  const t = TENTARE;
  // El logo del kit es para fondo claro. En claro la placa es del color de la tarjeta (no se nota); en
  // oscuro la tarjeta se oscurece y la placa se queda blanca, como el logo de Shopify en su correo. Mismas
  // medidas de imagen que en supabase/templates/*.html (132×35). Con las imágenes bloqueadas —el caso por
  // defecto en media bandeja— el `alt` dice de quién es.
  return `<tr><td class="px-mobile" style="padding:28px 32px 22px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-left:-10px;"><tr>
<td bgcolor="${t.placa}" style="background:${t.placa};border-radius:12px;padding:11px 14px;">
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
  // El botón de la referencia: una píldora de tinta con texto blanco (al revés en modo oscuro). `mso-padding-alt` le
  // da el alto en Outlook, que no entiende el padding de un `<a>` (y que dibuja las
  // esquinas rectas: sigue siendo un botón legible).
  return `<tr><td class="px-mobile" align="center" style="padding:10px 32px 32px;text-align:center;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td align="center" bgcolor="${t.boton}" style="border-radius:999px;background:${t.boton};mso-padding-alt:16px 34px;">
<a href="${hrefSeguro(b.href)}" style="display:inline-block;padding:16px 34px;font-family:${PILA};font-weight:bold;font-size:15px;color:${t.botonTexto};text-decoration:none;border-radius:999px;line-height:1.15;">${escaparHtml(b.texto)}</a>
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
