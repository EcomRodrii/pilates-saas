// Las piezas de HTML de correo que no tienen marca: escapar lo que escribe una
// persona y aceptar solo destinos que se pueden pintar. Las comparten los dos
// sistemas de correo —el del estudio (lib/emails/estudio/) y el de Tentare
// (lib/emails/tentare/)— para que la regla de seguridad viva en UN sitio.

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
export function hrefSeguro(url: string): string {
  const limpia = url.trim();
  return /^(https?:|mailto:|tel:)/i.test(limpia) ? escaparHtml(limpia) : '#';
}

/**
 * Lo mismo para el `src` de una imagen, pero devolviendo `null`: un destino
 * rechazado no puede quedarse como icono roto, la imagen no se pinta. Solo
 * http(s) — un `data:` metería el peso del archivo en el propio correo, que es
 * la forma más rápida de cruzar el recorte de Gmail (~102 KB).
 */
export function imagenSegura(url?: string | null): string | null {
  const limpia = (url ?? '').trim();
  return /^https?:/i.test(limpia) ? escaparHtml(limpia) : null;
}

/**
 * El texto de bandeja. Los `&nbsp;&zwnj;` de relleno existen para que Gmail no
 * siga leyendo el correo y enseñe las primeras palabras del cuerpo detrás.
 */
export function preheaderHtml(texto: string): string {
  const relleno = '&nbsp;&zwnj;'.repeat(60);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escaparHtml(texto)}${relleno}</div>`;
}

/**
 * Cabecera `<head>` común: Outlook a 96 ppp, modo claro declarado, reset y media
 * query de móvil. `estiloMso` es CSS que solo lee Outlook de Windows (va dentro
 * de un condicional): cada familia decide ahí sus fuentes.
 */
export function cabezaHtml(titulo: string, fondo: string, enlace: string, ancho = 600, estiloMso = ''): string {
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escaparHtml(titulo)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
${estiloMso ? `<style>${estiloMso}</style>\n` : ''}<![endif]-->
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  body { margin: 0; padding: 0; width: 100% !important; background: ${fondo}; }
  a { color: ${enlace}; }
  @media screen and (max-width: ${ancho}px) {
    .w-full { width: 100% !important; }
    .px-mobile { padding-left: 20px !important; padding-right: 20px !important; }
  }
</style>
</head>`;
}

/**
 * ⚠️ Outlook de Windows NO baja por la pila de `font-family`: si la PRIMERA
 * fuente no está instalada, pinta Times New Roman y se olvida del resto. Estas
 * son las de FUENTES_EMAIL que Windows trae de serie; cualquier otra
 * (`-apple-system`, 'Plus Jakarta Sans') hay que sustituirla en el condicional
 * `mso` o el correo sale en Times.
 */
export const FUENTES_EN_WINDOWS = new Set(['Arial', 'Georgia', 'Verdana', 'Times New Roman', 'Courier New']);
