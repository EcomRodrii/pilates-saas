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
import { sanearMarkdown } from '../sanear-markdown.ts';

/** La marca del estudio tal y como la necesita el correo. */
export interface MarcaCorreo {
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  colorSecundario?: string | null;
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

export interface FilaDetalle {
  label: string;
  value: string;
  tachado?: boolean;
}

export interface CorreoEstudioOpts {
  marca: MarcaCorreo;
  /** Lo que se lee en la bandeja junto al asunto. */
  preheader: string;
  titular: string;
  parrafos?: (string | null | undefined)[];
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

const ANCHO = 600;

/** Pila de fuentes segura en correo. La de marca del producto es un webfont y casi ningún cliente la carga. */
const PILA_SEGURA = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
/** El titular va en serif cursiva SIEMPRE: es la seña de identidad de la plantilla. */
const PILA_TITULAR = "Georgia, 'Times New Roman', Times, serif";

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Un `href` que se puede pintar. Cualquier otra cosa (`javascript:`, un campo a
 * medio escribir) se convierte en `#`: un botón que no lleva a ninguna parte es
 * malo, uno que ejecuta algo es otra cosa.
 */
function hrefSeguro(url: string): string {
  const limpia = url.trim();
  return /^(https?:|mailto:|tel:)/i.test(limpia) ? escaparHtml(limpia) : '#';
}

/**
 * Lo mismo para el `src` de una imagen, pero devolviendo `null` en vez de `#`:
 * ahí un destino rechazado no puede quedarse en la página como un icono roto,
 * la imagen sencillamente no se pinta. Se exige http(s) — un `data:` cabría en
 * el atributo y metería el peso del archivo en el propio correo, que es la
 * forma más rápida de cruzar el recorte de Gmail.
 */
function imagenSegura(url?: string | null): string | null {
  const limpia = (url ?? '').trim();
  return /^https?:/i.test(limpia) ? escaparHtml(limpia) : null;
}

/** El documento completo. Es la única función que sabe de `<html>`. */
export function correoEstudio(o: CorreoEstudioOpts): string {
  const p = paletaCorreoEstudio(o.marca.colorPrimario, o.marca.colorSecundario);
  const cuerpoFuente = o.marca.fuente ? `'${o.marca.fuente.replace(/'/g, '')}', ${PILA_SEGURA}` : PILA_SEGURA;
  const filete = o.acento?.trim() || p.marca;

  const cuerpo = o.contenidoHtml !== undefined
    ? `<tr><td class="px-mobile" style="padding:6px 28px 20px;background:${p.papel};">${o.contenidoHtml}</td></tr>`
    : [
        titularYTexto(o, p, cuerpoFuente),
        o.detalle && o.detalle.filas.length > 0 ? tarjetaDetalle(o.detalle, p, cuerpoFuente) : '',
        o.boton ? boton(o.boton, p, cuerpoFuente) : '',
      ].join('');

  const bloques = [
    // La foto va lo primero, como en la referencia: es lo que hace que el
    // correo se lea como del estudio antes que como del software. La cabecera
    // con el logo queda debajo, de membrete.
    o.conPortada ? portada(o.marca) : '',
    cabecera(o.marca, p, cuerpoFuente),
    cuerpo,
    notaYFirma(o, p, cuerpoFuente),
  ].join('');

  return `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escaparHtml(o.marca.estudioNombre)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  body { margin: 0; padding: 0; width: 100% !important; background: ${p.arena}; }
  a { color: ${p.enlace}; }
  @media screen and (max-width: ${ANCHO}px) {
    .w-full { width: 100% !important; }
    .px-mobile { padding-left: 20px !important; padding-right: 20px !important; }
    }
</style>
</head>
<body style="margin:0;padding:0;background:${p.arena};">
${preheader(o.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.arena}" style="background:${p.arena};">
<tr><td align="center" style="padding:28px 12px;">
<!--[if mso | IE]>
<table role="presentation" width="${ANCHO}" align="center" cellpadding="0" cellspacing="0" border="0" style="width:${ANCHO}px;"><tr><td>
<![endif]-->
<div class="w-full" style="max-width:${ANCHO}px;margin:0 auto;text-align:left;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.papel}" style="background:${p.papel};border:1px solid ${p.borde};border-radius:8px;overflow:hidden;">
<tr><td style="background:${filete};height:5px;line-height:5px;font-size:0;">&nbsp;</td></tr>
${bloques}
</table>
${pie(o, p, cuerpoFuente)}
</div>
<!--[if mso | IE]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

// ── Piezas ───────────────────────────────────────────────────────────────────

/**
 * El texto de bandeja. Los `&zwnj;&nbsp;` de relleno existen para que Gmail no
 * siga leyendo el correo y enseñe las primeras palabras del cuerpo detrás del
 * preheader.
 */
function preheader(texto: string): string {
  const relleno = '&nbsp;&zwnj;'.repeat(60);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escaparHtml(texto)}${relleno}</div>`;
}

function cabecera(marca: MarcaCorreo, p: PaletaCorreo, fuente: string): string {
  // Con logo se pinta el logo; sin él, el nombre del estudio en versales. Nunca
  // las dos cosas: sería el nombre dos veces seguidas.
  const logo = imagenSegura(marca.logoUrl);
  const identidad = logo
    ? `<img src="${logo}" height="30" alt="${escaparHtml(marca.estudioNombre)}" style="display:block;border:0;max-height:30px;width:auto;">`
    : `<div style="font-family:${fuente};font-size:12px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;color:${p.etiqueta};">${escaparHtml(marca.estudioNombre)}</div>`;
  const lema = marca.lema?.trim()
    ? `<div style="font-family:${PILA_TITULAR};font-style:italic;font-size:13px;line-height:1.4;color:${p.tintaSuave};margin-top:6px;">${escaparHtml(marca.lema.trim())}</div>`
    : '';
  return `<tr><td class="px-mobile" style="padding:22px 28px 18px;background:${p.papel};">${identidad}${lema}</td></tr>`;
}

function portada(marca: MarcaCorreo): string {
  const foto = imagenSegura(marca.portadaUrl);
  if (!foto) return '';
  // Sin `height` fijo: la foto del estudio no tiene por qué venir en 16:10 y
  // forzarlo la deformaría. El `width` sí va como atributo porque Outlook no
  // lee el de la hoja de estilos.
  return `<tr><td style="padding:0;font-size:0;line-height:0;">
<img src="${foto}" width="${ANCHO}" alt="${escaparHtml(marca.estudioNombre)}" style="display:block;width:100%;max-width:${ANCHO}px;height:auto;border:0;">
</td></tr>`;
}

function titularYTexto(o: CorreoEstudioOpts, p: PaletaCorreo, fuente: string): string {
  const parrafos = (o.parrafos ?? [])
    .filter((t): t is string => !!t && t.trim() !== '')
    .map((t, i, todos) => `<div style="font-family:${fuente};font-size:14.5px;line-height:1.7;color:${p.tinta};margin:0 0 ${i === todos.length - 1 ? 0 : 14}px;">${escaparHtml(t)}</div>`)
    .join('');
  return `<tr><td class="px-mobile" style="padding:6px 28px 20px;background:${p.papel};">
<div style="font-family:${PILA_TITULAR};font-style:italic;font-size:23px;line-height:1.35;color:${p.tinta};margin:0 0 14px;">${escaparHtml(o.titular)}</div>
${parrafos}
</td></tr>`;
}

function tarjetaDetalle(d: NonNullable<CorreoEstudioOpts['detalle']>, p: PaletaCorreo, fuente: string): string {
  const titulo = d.titulo?.trim()
    ? `<div style="font-family:${fuente};font-weight:bold;font-size:13px;color:${p.etiqueta};margin:0 0 10px;">${escaparHtml(d.titulo.trim())}</div>`
    : '';
  return `<tr><td class="px-mobile" style="padding:0 28px 20px;background:${p.papel};">${filasDetalle(d.filas, p, fuente, '0', titulo)}</td></tr>`;
}

/** La tarjeta arena con las filas etiqueta/valor. La comparten el correo de sistema y el cuerpo libre. */
function filasDetalle(filas: FilaDetalle[], p: PaletaCorreo, fuente: string, margen: string, titulo = ''): string {
  const cuerpo = filas.map(f => `<tr>
<td width="110" valign="top" style="padding:6px 0 4px;font-family:${fuente};font-size:11px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:${p.etiqueta};">${escaparHtml(f.label)}</td>
<td valign="top" style="padding:4px 0;font-family:${fuente};font-size:13.5px;line-height:1.5;color:${p.tinta};${f.tachado ? 'text-decoration:line-through;' : ''}">${escaparHtml(f.value)}</td>
</tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.arena}" style="background:${p.arena};border-radius:6px;margin:${margen};"><tr><td style="padding:16px 18px;">
${titulo}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cuerpo}</table>
</td></tr></table>`;
}

function boton(b: { href: string; texto: string }, p: PaletaCorreo, fuente: string): string {
  return `<tr><td class="px-mobile" style="padding:0 28px 22px;background:${p.papel};">${pildora(b, p, fuente, '0')}</td></tr>`;
}

/**
 * El botón. `mso-padding-alt` es lo que le da alto en Outlook, que ignora el
 * padding de un `<a>` porque no entiende `display:inline-block`; sin eso sale
 * una raya de color con el texto pegado a los bordes.
 */
function pildora(b: { href: string; texto: string }, p: PaletaCorreo, fuente: string, margen: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${margen};"><tr>
<td align="center" bgcolor="${p.boton}" style="border-radius:999px;background:${p.boton};mso-padding-alt:13px 28px;">
<a href="${hrefSeguro(b.href)}" style="display:inline-block;padding:13px 28px;font-family:${fuente};font-weight:bold;font-size:13.5px;letter-spacing:.02em;color:${p.botonTexto};text-decoration:none;border-radius:999px;line-height:1.15;">${escaparHtml(b.texto)}</a>
</td></tr></table>`;
}

function notaYFirma(o: CorreoEstudioOpts, p: PaletaCorreo, fuente: string): string {
  const nota = o.nota?.trim()
    ? `<div style="font-family:${fuente};font-size:12px;line-height:1.6;color:${p.tintaSuave};margin:0;">${escaparHtml(o.nota.trim())}</div>`
    : '';
  const firma = o.firma?.trim()
    ? `<div style="font-family:${fuente};font-size:12px;color:${p.tintaSuave};margin:${nota ? '12px' : '0'} 0 0;">${escaparHtml(o.firma.trim())}</div>`
    : '';
  if (!nota && !firma) return '';
  return `<tr><td class="px-mobile" style="padding:0 28px 26px;background:${p.papel};">${nota}${firma}</td></tr>`;
}

/**
 * El pie va FUERA de la tarjeta, sobre el arena: es la letra del sobre, no del
 * mensaje. Lleva la dirección postal del estudio y, solo en los correos
 * comerciales, el enlace de baja.
 */
function pie(o: CorreoEstudioOpts, p: PaletaCorreo, fuente: string): string {
  const piezas: string[] = [];
  if (o.pie?.trim()) {
    piezas.push(escaparHtml(o.pie.trim()));
  } else {
    piezas.push(escaparHtml(o.marca.estudioNombre));
    if (o.marca.direccionPostal?.trim()) piezas.push(escaparHtml(o.marca.direccionPostal.trim()));
  }
  if (o.bajaUrl) {
    piezas.push(`<a href="${hrefSeguro(o.bajaUrl)}" style="color:${p.tintaSuave};text-decoration:underline;">Darte de baja de estos avisos</a>`);
  }
  // Enlaces de texto y no iconos: los clientes de correo bloquean las imágenes
  // por defecto y una fila de iconos bloqueados es una fila de cuadros rotos.
  const canales = (o.marca.canales ?? [])
    .map(c => `<a href="${hrefSeguro(c.href)}" style="color:${p.tintaSuave};text-decoration:underline;">${escaparHtml(c.label)}</a>`)
    .join(' · ');
  const segunda = canales ? `<br>${canales}` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="px-mobile" style="padding:16px 8px 0;font-family:${fuente};font-size:11px;line-height:1.6;color:${p.tintaSuave};text-align:center;">
${piezas.join(' &middot; ')}${segunda}
</td></tr></table>`;
}

// ── Cuerpo libre escrito por la propietaria ──────────────────────────────────

/**
 * Instancia propia de marked: `marked.use()` es global y react-email usa la
 * misma librería por debajo. Configurarla ahí le cambiaría el renderizado a
 * cualquier plantilla que siga en React Email.
 */
function markdownCorreo(p: PaletaCorreo, fuente: string): Marked {
  const texto = `font-family:${fuente};font-size:14.5px;line-height:1.7;color:${p.tinta};`;
  return new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      paragraph(t) { return `<div style="${texto}margin:0 0 14px;">${this.parser.parseInline(t.tokens)}</div>`; },
      heading(t) {
        const tam = t.depth === 1 ? 23 : t.depth === 2 ? 18 : 15;
        const estilo = t.depth === 1
          ? `font-family:${PILA_TITULAR};font-style:italic;`
          : `font-family:${fuente};font-weight:bold;`;
        return `<div style="${estilo}font-size:${tam}px;line-height:1.35;color:${p.tinta};margin:0 0 12px;">${this.parser.parseInline(t.tokens)}</div>`;
      },
      list(t) {
        const items = t.items.map(i => `<li style="${texto}margin:0 0 6px;">${this.parser.parseInline(i.tokens)}</li>`).join('');
        return `<${t.ordered ? 'ol' : 'ul'} style="margin:0 0 14px;padding-left:20px;">${items}</${t.ordered ? 'ol' : 'ul'}>`;
      },
      link(t) { return `<a href="${hrefSeguro(t.href)}" style="color:${p.enlace};text-decoration:underline;">${this.parser.parseInline(t.tokens)}</a>`; },
      blockquote(t) { return `<div style="${texto}margin:0 0 14px;padding:2px 0 2px 14px;border-left:3px solid ${p.borde};color:${p.tintaSuave};">${this.parser.parse(t.tokens)}</div>`; },
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
 * `{boton}`. Mismo contrato que tenía `cuerpo-editable.tsx` — lo que cambia es
 * que ahora se pinta con el sistema del estudio y no con el layout genérico.
 */
export function correoEstudioLibre(o: CorreoEstudioOpts & { cuerpo: string }): string {
  const p = paletaCorreoEstudio(o.marca.colorPrimario, o.marca.colorSecundario);
  const fuente = o.marca.fuente ? `'${o.marca.fuente.replace(/'/g, '')}', ${PILA_SEGURA}` : PILA_SEGURA;
  const md = markdownCorreo(p, fuente);

  // El token va solo en su línea. Se parte con captura para saber cuál salió y
  // en qué orden: puede ponerlos al revés, repetir uno o no poner ninguno.
  const trozos = sanearMarkdown(o.cuerpo).split(/^[ \t]*\{(datos|boton)\}[ \t]*$/gim);
  const contenidoHtml = trozos.map((trozo, i) => {
    if (i % 2 === 0) return trozo.trim() === '' ? '' : String(md.parse(trozo));
    if (trozo === 'datos') {
      return o.detalle && o.detalle.filas.length > 0 ? filasDetalle(o.detalle.filas, p, fuente, '0 0 16px') : '';
    }
    return o.boton ? pildora(o.boton, p, fuente, '0 0 16px') : '';
  }).join('');

  // Sin titular propio: lo pone ella con un `# Título` en su Markdown, y
  // añadirle uno fijo encima daría dos titulares seguidos.
  return correoEstudio({ ...o, titular: '', contenidoHtml });
}
