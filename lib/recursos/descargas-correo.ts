// ─────────────────────────────────────────────────────────────────────────────
// El correo con el enlace de descarga, y las dos páginas que abren sus botones
// de «sí, quiero novedades» y «darme de baja».
//
// Todo lo que se pinta aquí es nuestro (títulos del catálogo y enlaces
// firmados): nada de lo que escribe la visitante en el formulario llega al
// correo ni a las páginas, así que no hay nada suyo que escapar. `esc` está
// igualmente, por si algún día se añade.
//
// Es un correo transaccional (lo ha pedido ella), no comercial: no lleva
// publicidad. El botón de novedades solo aparece si marcó la casilla.
// ─────────────────────────────────────────────────────────────────────────────

import type { RecursoDescargable } from './descargas.ts';

const OLIVA = '#343825';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface EnlacesCorreoDescarga {
  descarga: string;
  /** Solo si marcó «quiero novedades» y aún no lo tiene confirmado. */
  novedades?: string;
  /** Solo si tiene permiso de novedades, pendiente o confirmado. */
  baja?: string;
  /** La guía completa, URL absoluta. */
  guia: string;
}

const boton = (href: string, texto: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:${OLIVA};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">${esc(texto)}</a>`;

export function correoDescarga(recurso: RecursoDescargable, enlaces: EnlacesCorreoDescarga) {
  const asunto = recurso.asunto;
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1b1c17;max-width:560px">`,
    `<p>Hola:</p>`,
    `<p>Aquí tienes ${esc(recurso.titulo)} en ${esc(recurso.formato)}, lista para rellenar:</p>`,
    `<p style="margin:22px 0">${boton(enlaces.descarga, `Descargar la plantilla (${recurso.formato})`)}</p>`,
    `<p>${esc(recurso.consejo)} El enlace funciona durante 30 días.</p>`,
    enlaces.novedades
      ? `<div style="background:#f1f2ea;border-radius:12px;padding:14px 16px;margin:20px 0">` +
        `<p style="margin:0 0 10px">Nos pediste también recibir novedades y guías de Tentare por email. Para confirmarlo:</p>` +
        `<p style="margin:0 0 10px">${boton(enlaces.novedades, 'Sí, quiero recibirlas')}</p>` +
        `<p style="margin:0;font-size:13px;color:#5a5a52">Si no fuiste tú o has cambiado de idea, no hagas nada: sin confirmarlo no te escribiremos.</p>` +
        `</div>`
      : '',
    `<p>En la guía tienes el resto, con lo que dice la ley: <a href="${esc(enlaces.guia)}" style="color:${OLIVA}">${esc(enlaces.guia.replace(/^https?:\/\//, ''))}</a></p>`,
    `<p>Un saludo,<br>Marcos Roca<br>Fundador de Tentare</p>`,
    `<p style="font-size:12px;color:#5a5a52;border-top:1px solid #e1e1d9;padding-top:12px;margin-top:24px">` +
      `Recibes este correo porque pediste ${esc(recurso.titulo)} en tentare.app.` +
      (enlaces.baja ? ` ¿No quieres recibir novedades? <a href="${esc(enlaces.baja)}" style="color:#5a5a52">Darme de baja</a>.` : '') +
      `</p>`,
    `</div>`,
  ].join('');

  const texto = [
    'Hola:',
    '',
    `Aquí tienes ${recurso.titulo} en ${recurso.formato}, lista para rellenar:`,
    enlaces.descarga,
    '',
    `${recurso.consejo} El enlace funciona durante 30 días.`,
    ...(enlaces.novedades
      ? ['', 'Nos pediste también recibir novedades y guías de Tentare por email. Para confirmarlo, abre este enlace:', enlaces.novedades,
        'Si no fuiste tú o has cambiado de idea, no hagas nada: sin confirmarlo no te escribiremos.']
      : []),
    '',
    `En la guía tienes el resto, con lo que dice la ley: ${enlaces.guia}`,
    '',
    'Un saludo,',
    'Marcos Roca',
    'Fundador de Tentare',
    '',
    `Recibes este correo porque pediste ${recurso.titulo} en tentare.app.`,
    ...(enlaces.baja ? [`¿No quieres recibir novedades? Date de baja aquí: ${enlaces.baja}`] : []),
  ].join('\n');

  return { asunto, html, texto };
}

/**
 * Página suelta para los enlaces de novedades y de baja. Es HTML servido por la
 * propia ruta (no una página del sitio): no entra en el sitemap y lleva noindex.
 *
 * ⚠️ Con `accion`, la página enseña un BOTÓN que hace POST, en vez de actuar al
 * abrirse. Los antivirus de correo de muchas empresas abren todos los enlaces
 * de un mensaje para analizarlos: si abrir bastara, un escáner confirmaría
 * permisos que la persona no ha dado (o la daría de baja sin pedirlo).
 */
export function paginaDescargas(p: {
  titulo: string;
  texto: string;
  accion?: { url: string; etiqueta: string };
  volver?: { url: string; texto: string };
}): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(p.titulo)} · Tentare</title></head>
<body style="margin:0;background:#eeeee8;font-family:Arial,Helvetica,sans-serif;color:#1b1c17">
<main style="max-width:520px;margin:12vh auto 0;padding:0 20px">
<div style="background:#ffffff;border:1px solid #e1e1d9;border-radius:18px;padding:28px 26px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#5a5a52">Tentare</p>
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.2">${esc(p.titulo)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">${esc(p.texto)}</p>
${p.accion ? `<form method="post" action="${esc(p.accion.url)}" style="margin:0 0 16px"><button type="submit" style="background:${OLIVA};color:#fff;border:0;border-radius:999px;padding:12px 22px;font-size:15px;font-weight:700;cursor:pointer">${esc(p.accion.etiqueta)}</button></form>` : ''}
${p.volver ? `<a href="${esc(p.volver.url)}" style="color:${OLIVA};font-size:14px">${esc(p.volver.texto)}</a>` : ''}
</div></main></body></html>`;
}
