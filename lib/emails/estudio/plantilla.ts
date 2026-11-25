// ─────────────────────────────────────────────────────────────────────────────
// El correo que un ESTUDIO manda a sus alumnas. Un sistema, no una plantilla
// por correo: cabecera con el logo, portada opcional, titular, párrafos,
// tarjeta de detalle, botón y pie legal. Cada plantilla describe QUÉ dice; el
// cómo se ve vive aquí y solo aquí.
//
// ⚠️ Esto genera HTML a mano, no React Email, y es deliberado. Lo que el correo
// tiene que cumplir no se puede expresar con `<Container>`:
//   · Outlook (motor de Word) ignora `max-width`, así que el ancho de 600 px
//     necesita el condicional `[if mso | IE]` con una tabla de `width="600"`.
//     Medido sobre la salida real de React Email: su contenedor sale
//     `width="100%"` y en Outlook el correo ocupaba toda la ventana.
//   · El padding del botón en Outlook exige `mso-padding-alt` en el `<td>`.
//   · Y `node --test --experimental-strip-types` —el runner de este repo— no
//     carga `.tsx`: con JSX no habría forma de probar el HTML que sale, que es
//     justo lo único que le llega a la clienta.
// ─────────────────────────────────────────────────────────────────────────────

import { Marked } from 'marked';
import type { CanalResuelto } from '../../canales-estudio.ts';
import { paletaCorreoEstudio, type PaletaCorreo } from './paleta.ts';
import { colorLegibleSobre } from '../../color-utils.ts';
import { foregroundParaFondo } from '../../wcag-contrast.ts';
import { sanearMarkdown } from '../sanear-markdown.ts';
import { escaparHtml, hrefSeguro, imagenSegura, preheaderHtml, cabezaHtml, FUENTES_EN_WINDOWS } from '../html.ts';
import { logoDeCorreo } from './marca-correo.ts';

/** La marca del estudio tal y como la necesita el correo. */
export interface MarcaCorreo {
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  colorSecundario?: string | null;
  /** El del botón elegido a mano en la plantilla. Gana siempre, sea claro u oscuro. */
  colorBoton?: string | null;
  /** Foto de portada. Ausente = el correo no lleva hero aunque se pida. */
  portadaUrl?: string | null;
  /** El lema del estudio, bajo el logo. Ausente = no se pinta nada. */
  lema?: string | null;
  /** Una de FUENTES_EMAIL. Ausente = la pila segura por defecto. */
  fuente?: string | null;
  /** Dirección postal para el pie. Ausente = el pie no la dice. */
  direccionPostal?: string | null;
  canales?: CanalResuelto[];
}

/**
 * Lo que la propietaria ha personalizado de una plantilla (`plantillas_email`).
 * Todo opcional: ausente = se mantiene lo de siempre, campo a campo. Es el
 * reflejo en TypeScript de las columnas nullable de la migr 20260811005749.
 */
export interface PersonalizacionCorreo {
  cuerpo?: string;
  botonTexto?: string;
  /** A dónde lleva el botón. Ausente = el destino de siempre (su app…). */
  botonUrl?: string;
  colorCabecera?: string;
  colorBoton?: string;
  logoUrl?: string;
  /** Foto de portada SOLO para este correo. Ausente = la de su app. */
  portadaUrl?: string;
  /**
   * ¿Este correo lleva foto? Ausente = lo que decida la plantilla (la reserva
   * sí, la cancelación no). `false` la apaga aunque la plantilla la pinte.
   */
  mostrarPortada?: boolean;
  pie?: string;
  fuente?: string;
}

export interface FilaDetalle {
  label: string;
  value: string;
  tachado?: boolean;
  /**
   * El dato que da sentido al correo: el importe de un justificante de pago, el
   * de un cobro fallido. Se pinta más grande y en el color del filete. Uno por
   * tarjeta — con dos ya no destaca ninguno.
   */
  destacado?: boolean;
  /**
   * Un código que se va a copiar o dictar (tarjeta regalo): más grande aún, en monoespaciada y con
   * la fila a todo el ancho para que no se parta en dos líneas. Va con `destacado`.
   */
  codigo?: boolean;
}

export interface CorreoEstudioOpts {
  marca: MarcaCorreo;
  /** Lo que se lee en la bandeja junto al asunto. */
  preheader: string;
  titular: string;
  parrafos?: (string | null | undefined)[];
  /** Unas palabras de una persona («Felices fiestas»), en cita bajo los párrafos. Ausente = no se pinta. */
  cita?: { texto: string; autor?: string | null } | null;
  detalle?: { titulo?: string | null; filas: FilaDetalle[] };
  boton?: { href: string; texto: string } | null;
  /** La letra pequeña del final (política de cancelación, etc.). */
  nota?: string | null;
  /** «Nos vemos en el estudio — Marta». Ausente = firma con el nombre a secas. */
  firma?: string | null;
  /** ¿Lleva foto de portada? Solo se pinta si la marca tiene `portadaUrl`. */
  conPortada?: boolean;
  /**
   * Color del filete superior cuando el correo tiene un significado propio
   * (clase cancelada, pago fallido). Ausente = el color de la marca.
   */
  acento?: string | null;
  /**
   * Enlace de baja. SOLO para correos comerciales (LSSI art. 21): una
   * confirmación de reserva no se puede «dar de baja», y ofrecerlo sería
   * mentir. Ausente = el pie no lo pinta.
   */
  bajaUrl?: string | null;
  /** Pie escrito por la propietaria, en vez del legal por defecto. */
  pie?: string | null;
  /**
   * Contenido ya pintado que SUSTITUYE a titular, párrafos, tarjeta y botón.
   * Lo usa `correoEstudioLibre` cuando la propietaria escribe el correo entero:
   * la cabecera, la portada y el pie siguen siendo del sistema.
   */
  contenidoHtml?: string;
}

const ANCHO = 620;

/**
 * El correo es el de Shopify, pieza por pieza (medido en una bandeja real, 24-nov-2026): lienzo gris claro, columna
 * blanca de 620 px, una banda negra arriba que dice de qué tienda es, el logo a la izquierda, titular de 44 px y peso
 * ligero centrado, texto centrado de 18/16 px, botón en píldora, foto a lo ancho y un pie negro con la dirección. La
 * marca del estudio entra por su nombre, su logo, su foto y el color de su botón: los neutros son los del correo.
 */
const LIENZO = '#EFF1F4';
const TINTA = '#000000';
const SUAVE = '#4A4A4A';
const LINEA = '#E3E3E3';
const NEGRO = '#000000';
/** Inter si el cliente la tiene; si no, la del sistema. La de marca del producto es un webfont y casi nadie la carga. */
const PILA_SEGURA = "InterVariable, Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

/**
 * Lo que lee SOLO Outlook de Windows. Su motor no baja por la pila de fuentes:
 * con `-apple-system` o 'Plus Jakarta Sans' delante —ninguna instalada en
 * Windows— pintaba el cuerpo del correo en Times New Roman. Aquí se le da la
 * fuente elegida si Windows la tiene, y si no Arial.
 */
function estiloMso(fuente?: string | null): string {
  const elegida = (fuente ?? '').trim();
  const cuerpo = FUENTES_EN_WINDOWS.has(elegida) ? `'${elegida}', Arial, sans-serif` : 'Arial, Helvetica, sans-serif';
  return `td, div, p, a, li, span { font-family: ${cuerpo} !important; }`;
}

/** En el móvil el titular baja de 44 a 32 px: a 44, cuatro palabras ya se parten en tres líneas. */
const CSS_MOVIL = `  @media screen and (max-width: 620px) {
    .h1-mobile { font-size: 32px !important; line-height: 38px !important; }
  }
`;

// Las piezas sin marca (escapar, destinos seguros, preheader, <head>) viven en
// lib/emails/html.ts y las comparte la familia de Tentare. Se reexporta
// `escaparHtml` para quien ya la importaba de aquí.
export { escaparHtml };

/** El documento completo. Es la única función que sabe de `<html>`. */
export function correoEstudio(o: CorreoEstudioOpts): string {
  const p = paletaCorreoEstudio(o.marca.colorPrimario, o.marca.colorSecundario, o.marca.colorBoton);
  const cuerpoFuente = o.marca.fuente ? `'${o.marca.fuente.replace(/'/g, '')}', ${PILA_SEGURA}` : PILA_SEGURA;
  const acento = o.acento?.trim() || null;
  // El acento también pinta el dato destacado (el importe de un cobro): ahí es TEXTO sobre blanco.
  const destaque = colorLegibleSobre(acento ?? p.marca, '#FFFFFF');

  const cuerpo = o.contenidoHtml !== undefined
    ? `<tr><td class="px-mobile" style="padding:24px 40px 8px;background:#FFFFFF;">${o.contenidoHtml}</td></tr>`
    : [
        titularYTexto(o, cuerpoFuente),
        o.detalle && o.detalle.filas.length > 0 ? tarjetaDetalle(o.detalle, cuerpoFuente, destaque) : '',
        o.boton ? boton(o.boton, p, cuerpoFuente) : '',
      ].join('');

  const bloques = [
    banda(o.marca.estudioNombre, acento ?? p.marca, cuerpoFuente),
    cabecera(o, cuerpoFuente),
    cuerpo,
    notaYFirma(o, cuerpoFuente),
    o.conPortada ? portada(o.marca) : '',
    pie(o, cuerpoFuente),
  ].join('');

  return `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
${cabezaHtml(o.marca.estudioNombre, LIENZO, p.enlace, ANCHO, estiloMso(o.marca.fuente), 'light', CSS_MOVIL)}
<body style="margin:0;padding:0;background:${LIENZO};">
${preheaderHtml(o.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${LIENZO}" style="background:${LIENZO};">
<tr><td align="center" style="padding:0;">
<!--[if mso | IE]>
<table role="presentation" width="${ANCHO}" align="center" cellpadding="0" cellspacing="0" border="0" style="width:${ANCHO}px;"><tr><td>
<![endif]-->
<div class="w-full" style="max-width:${ANCHO}px;margin:0 auto;text-align:left;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;">
${bloques}
</table>
</div>
<!--[if mso | IE]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

// ── Piezas ───────────────────────────────────────────────────────────────────

/**
 * La banda de arriba: de quién es el correo, en 12 px, con el color del estudio (en la referencia es la marca de la
 * casa). Cuando el correo trae un aviso con significado propio (clase cancelada, cobro fallido) toma ese color. El
 * texto se elige por contraste: una marca pastel lleva letra oscura.
 */
function banda(nombre: string, fondo: string, fuente: string): string {
  return `<tr><td align="center" bgcolor="${fondo}" style="background:${fondo};padding:4px 24px;font-family:${fuente};font-size:12px;line-height:14px;color:${foregroundParaFondo(fondo)};text-align:center;">${escaparHtml(nombre)}</td></tr>`;
}

/**
 * El logo a la izquierda (o el nombre, si no hay) y, SOLO en un correo comercial, la misma acción del botón repetida a
 * la derecha: es una campaña, como la de Shopify. En una confirmación sería ruido.
 */
function cabecera(o: CorreoEstudioOpts, fuente: string): string {
  const logo = imagenSegura(logoDeCorreo(o.marca.logoUrl));
  const alt = escaparHtml(o.marca.estudioNombre);
  // Dos límites y ningún tamaño fijo: no sabemos la forma del logo. Outlook ignora `max-*`, así que ahí va su copia con alto fijo.
  const identidad = logo
    ? `<!--[if mso]><img src="${logo}" height="48" alt="${alt}" style="display:block;border:0;"><![endif]-->
<!--[if !mso]><!--><img src="${logo}" alt="${alt}" style="display:block;border:0;width:auto;height:auto;max-width:160px;max-height:53px;"><!--<![endif]-->`
    : `<div style="font-family:${fuente};font-size:20px;font-weight:600;line-height:26px;color:${TINTA};">${alt}</div>`;
  const atajo = o.bajaUrl && o.boton
    ? `<td align="right" valign="middle" style="padding:0 0 0 16px;"><a href="${hrefSeguro(o.boton.href)}" style="display:inline-block;padding:10px 20px;border-radius:30px;background:${LIENZO};font-family:${fuente};font-size:14px;font-weight:500;line-height:20px;color:${TINTA};text-decoration:none;">${escaparHtml(o.boton.texto)}</a></td>`
    : '';
  return `<tr><td class="px-mobile" style="padding:16px 40px 8px;background:#FFFFFF;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle">${identidad}</td>${atajo}</tr></table></td></tr>`;
}

function portada(marca: MarcaCorreo): string {
  const foto = imagenSegura(marca.portadaUrl);
  if (!foto) return '';
  // Sin `height` fijo: la foto del estudio no tiene por qué venir en 16:10 y
  // forzarlo la deformaría. El `width` sí va como atributo porque Outlook no
  // lee el de la hoja de estilos.
  return `<tr><td style="padding:16px 0 0;font-size:0;line-height:0;">
<img src="${foto}" width="${ANCHO}" alt="${escaparHtml(marca.estudioNombre)}" style="display:block;width:100%;max-width:${ANCHO}px;height:auto;border:0;">
</td></tr>`;
}

function titularYTexto(o: CorreoEstudioOpts, fuente: string): string {
  const parrafos = (o.parrafos ?? [])
    .filter((t): t is string => !!t && t.trim() !== '')
    // El primero es la entradilla (18 px); el resto, texto (16 px). Como en la referencia.
    .map((t, i, todos) => `<div style="font-family:${fuente};font-size:${i === 0 ? 18 : 16}px;font-weight:400;line-height:${i === 0 ? 25 : 22}px;color:${TINTA};text-align:center;margin:0 0 ${i === todos.length - 1 ? 0 : 16}px;">${escaparHtml(t)}</div>`)
    .join('');
  // La cita es de otra persona: en cursiva y entre comillas, para que no se lea como una frase más del estudio.
  const cita = o.cita?.texto.trim()
    ? `<div style="margin:24px 0 0;text-align:center;">
<div style="font-family:${fuente};font-style:italic;font-size:22px;line-height:28px;color:${TINTA};">«${escaparHtml(o.cita.texto.trim())}»</div>
${o.cita.autor?.trim() ? `<div style="font-family:${fuente};font-size:12px;font-weight:700;line-height:16px;color:${TINTA};margin-top:12px;">${escaparHtml(o.cita.autor.trim())}</div>` : ''}
</div>`
    : '';
  const titular = o.titular.trim()
    ? `<tr><td class="px-mobile" align="center" style="padding:24px 40px 12px;background:#FFFFFF;text-align:center;"><h1 class="h1-mobile" style="font-family:${fuente};font-size:44px;font-weight:300;line-height:48px;color:${TINTA};text-align:center;margin:0;">${escaparHtml(o.titular)}</h1></td></tr>`
    : '';
  return `${titular}
<tr><td class="px-mobile" align="center" style="padding:8px 40px 16px;background:#FFFFFF;text-align:center;">${parrafos}${cita}</td></tr>`;
}

function tarjetaDetalle(d: NonNullable<CorreoEstudioOpts['detalle']>, fuente: string, destaque: string): string {
  const titulo = d.titulo?.trim()
    ? `<div style="font-family:${fuente};font-weight:400;font-size:22px;line-height:28px;color:${TINTA};text-align:center;margin:0 0 12px;">${escaparHtml(d.titulo.trim())}</div>`
    : '';
  return `<tr><td class="px-mobile" style="padding:8px 40px 16px;background:#FFFFFF;">${filasDetalle(d.filas, fuente, '0', titulo, destaque)}</td></tr>`;
}

/** Las filas etiqueta/valor, separadas por un filete fino. La comparten el correo de sistema y el cuerpo libre. */
function filasDetalle(filas: FilaDetalle[], fuente: string, margen: string, titulo = '', destaque: string = TINTA): string {
  const cuerpo = filas.map(f => f.codigo ? `<tr><td colspan="2" align="center" style="padding:16px 0;border-top:1px solid ${LINEA};text-align:center;">
<div style="font-family:${fuente};font-size:14px;line-height:18px;color:${SUAVE};padding:0 0 8px;">${escaparHtml(f.label)}</div>
<div style="font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:32px;font-weight:400;letter-spacing:.08em;line-height:40px;color:${destaque};">${escaparHtml(f.value)}</div>
</td></tr>` : `<tr>
<td width="140" valign="top" style="padding:12px 12px 12px 0;border-top:1px solid ${LINEA};font-family:${fuente};font-size:16px;line-height:22px;color:${SUAVE};">${escaparHtml(f.label)}</td>
<td valign="top" style="padding:${f.destacado ? '7px' : '12px'} 0;border-top:1px solid ${LINEA};font-family:${fuente};font-size:${f.destacado ? '28px' : '16px'};font-weight:${f.destacado ? 300 : 400};line-height:${f.destacado ? '32px' : '22px'};color:${f.destacado ? destaque : TINTA};${f.tachado ? 'text-decoration:line-through;' : ''}">${escaparHtml(f.value)}</td>
</tr>`).join('');
  return `<div style="margin:${margen};">${titulo}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cuerpo}</table></div>`;
}

function boton(b: { href: string; texto: string }, p: PaletaCorreo, fuente: string): string {
  return `<tr><td class="px-mobile" align="center" style="padding:8px 40px 16px;background:#FFFFFF;">${pildora(b, p, fuente, '0')}</td></tr>`;
}

/**
 * El botón. `mso-padding-alt` es lo que le da alto en Outlook, que ignora el
 * padding de un `<a>` porque no entiende `display:inline-block`; sin eso sale
 * una raya de color con el texto pegado a los bordes.
 */
function pildora(b: { href: string; texto: string }, p: PaletaCorreo, fuente: string, margen: string): string {
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:${margen === '0' ? '0 auto' : margen};"><tr>
<td align="center" bgcolor="${p.boton}" style="border-radius:30px;background:${p.boton};mso-padding-alt:12px 24px;">
<a href="${hrefSeguro(b.href)}" style="display:inline-block;padding:12px 24px;font-family:${fuente};font-weight:500;font-size:16px;color:${p.botonTexto};text-decoration:none;border-radius:30px;line-height:24px;">${escaparHtml(b.texto)}</a>
</td></tr></table>`;
}

function notaYFirma(o: CorreoEstudioOpts, fuente: string): string {
  const nota = o.nota?.trim()
    ? `<div style="font-family:${fuente};font-size:14px;line-height:20px;color:${SUAVE};text-align:center;margin:0;">${escaparHtml(o.nota.trim())}</div>`
    : '';
  const firma = o.firma?.trim()
    ? `<div style="font-family:${fuente};font-size:14px;font-weight:700;line-height:20px;color:${TINTA};text-align:center;margin:${nota ? '16px' : '0'} 0 0;">${escaparHtml(o.firma.trim())}</div>`
    : '';
  if (!nota && !firma) return `<tr><td style="padding:0 0 16px;background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td></tr>`;
  return `<tr><td class="px-mobile" align="center" style="padding:8px 40px 32px;background:#FFFFFF;">${nota}${firma}</td></tr>`;
}

/**
 * El pie negro: de quién es, su dirección postal, sus canales y, solo en los correos comerciales, la baja.
 */
function pie(o: CorreoEstudioOpts, fuente: string): string {
  const piezas: string[] = [];
  if (o.pie?.trim()) {
    piezas.push(escaparHtml(o.pie.trim()));
  } else {
    piezas.push(`© ${escaparHtml(o.marca.estudioNombre)}`);
    if (o.marca.lema?.trim()) piezas.push(escaparHtml(o.marca.lema.trim()));
    if (o.marca.direccionPostal?.trim()) piezas.push(escaparHtml(o.marca.direccionPostal.trim()));
  }
  const enlace = (href: string, texto: string) => `<a href="${hrefSeguro(href)}" style="color:#FFFFFF;font-weight:700;text-decoration:underline;">${escaparHtml(texto)}</a>`;
  // Enlaces de texto y no iconos: los clientes de correo bloquean las imágenes
  // por defecto y una fila de iconos bloqueados es una fila de cuadros rotos.
  const enlaces = [
    ...(o.marca.canales ?? []).map(c => enlace(c.href, c.label)),
    ...(o.bajaUrl ? [enlace(o.bajaUrl, 'Darte de baja de estos avisos')] : []),
  ].join('&nbsp;&nbsp;&nbsp; ');
  const segunda = enlaces ? `<div style="margin:16px 0 0;">${enlaces}</div>` : '';
  return `<tr><td class="px-mobile" align="center" bgcolor="${NEGRO}" style="background:${NEGRO};padding:40px 40px 40px;font-family:${fuente};font-size:14px;line-height:18px;color:#FFFFFF;text-align:center;">${piezas.join(' &middot; ')}${segunda}</td></tr>`;
}

// ── Cuerpo libre escrito por la propietaria ──────────────────────────────────

/**
 * Instancia propia de marked: `marked.use()` es global y react-email usa la
 * misma librería por debajo. Configurarla ahí le cambiaría el renderizado a
 * cualquier plantilla que siga en React Email.
 */
function markdownCorreo(p: PaletaCorreo, fuente: string): Marked {
  const texto = `font-family:${fuente};font-size:16px;font-weight:400;line-height:22px;color:${TINTA};`;
  return new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      paragraph(t) { return `<div style="${texto}margin:0 0 14px;">${this.parser.parseInline(t.tokens)}</div>`; },
      heading(t) {
        // H1 = el titular del correo (44 px ligero, centrado); H2 = sección; el resto, destacado.
        const [tam, alto, peso] = t.depth === 1 ? [44, 48, 300] : t.depth === 2 ? [28, 34, 300] : [16, 22, 700];
        const clase = t.depth === 1 ? ' class="h1-mobile"' : '';
        return `<div${clase} style="font-family:${fuente};font-weight:${peso};font-size:${tam}px;line-height:${alto}px;color:${TINTA};text-align:${t.depth === 3 ? 'left' : 'center'};margin:0 0 16px;">${this.parser.parseInline(t.tokens)}</div>`;
      },
      list(t) {
        const items = t.items.map(i => `<li style="${texto}margin:0 0 6px;">${this.parser.parseInline(i.tokens)}</li>`).join('');
        return `<${t.ordered ? 'ol' : 'ul'} style="margin:0 0 14px;padding-left:20px;">${items}</${t.ordered ? 'ol' : 'ul'}>`;
      },
      link(t) { return `<a href="${hrefSeguro(t.href)}" style="color:${p.enlace};text-decoration:underline;">${this.parser.parseInline(t.tokens)}</a>`; },
      // Sin esto sale un `<hr>` pelado: cada cliente de correo le pone su
      // propio grosor y su propio gris, y en Outlook queda una raya hundida.
      hr() { return `<div style="height:1px;line-height:1px;font-size:0;background:${LINEA};margin:0 0 18px;">&nbsp;</div>`; },
      blockquote(t) { return `<div style="${texto}margin:0 0 14px;padding:2px 0 2px 14px;border-left:3px solid ${LINEA};color:${SUAVE};">${this.parser.parse(t.tokens)}</div>`; },
      // Una imagen pegada por la propietaria sale a lo ancho de la tarjeta y
      // nunca sin `alt`: con las imágenes bloqueadas —el caso por defecto en
      // media bandeja— un `alt` vacío deja un hueco mudo.
      image(t) {
        const src = imagenSegura(t.href);
        if (!src) return '';
        return `<img src="${src}" alt="${escaparHtml(t.text || 'Imagen')}" style="display:block;max-width:100%;height:auto;border:0;margin:0 0 14px;">`;
      },
    },
  });
}

/**
 * Correo cuyo cuerpo entero lo escribe la propietaria en Markdown, con dos
 * tokens que coloca donde quiera: `{datos}` (la tarjeta de detalle) y
 * `{boton}`. Mismo contrato de tokens que tenía el layout genérico anterior —
 * lo que cambia es que ahora se pinta con la marca del estudio.
 */
export function correoEstudioLibre(o: CorreoEstudioOpts & { cuerpo: string }): string {
  const p = paletaCorreoEstudio(o.marca.colorPrimario, o.marca.colorSecundario, o.marca.colorBoton);
  const fuente = o.marca.fuente ? `'${o.marca.fuente.replace(/'/g, '')}', ${PILA_SEGURA}` : PILA_SEGURA;
  const md = markdownCorreo(p, fuente);

  // El token va solo en su línea. Se parte con captura para saber cuál salió y
  // en qué orden: puede ponerlos al revés, repetir uno o no poner ninguno.
  const trozos = sanearMarkdown(o.cuerpo).split(/^[ \t]*\{(datos|boton)\}[ \t]*$/gim);
  const contenidoHtml = trozos.map((trozo, i) => {
    if (i % 2 === 0) return trozo.trim() === '' ? '' : String(md.parse(trozo));
    if (trozo === 'datos') {
      return o.detalle && o.detalle.filas.length > 0 ? filasDetalle(o.detalle.filas, fuente, '0 0 16px') : '';
    }
    return o.boton ? pildora(o.boton, p, fuente, '0 0 16px') : '';
  }).join('');

  // Sin titular propio: lo pone ella con un `# Título` en su Markdown, y
  // añadirle uno fijo encima daría dos titulares seguidos.
  return correoEstudio({ ...o, titular: '', contenidoHtml });
}
