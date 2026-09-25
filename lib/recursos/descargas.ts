// ─────────────────────────────────────────────────────────────────────────────
// Recursos que se descargan a cambio del email (lead magnet de /recursos).
//
// La visitante deja su email en la guía, le llega por correo un enlace firmado
// (lib/recursos/descargas-token.ts) y ese enlace la lleva al archivo. Aparte,
// y solo si marca una casilla que va SIN marcar, pide recibir novedades: ese
// permiso se confirma con otro botón del mismo correo (doble confirmación) y se
// guarda con el texto exacto que aceptó (`plataforma_lead`, migr 20260925182615,
// y su historial en `plataforma_lead_consentimiento`, migr 20260925184749).
//
// ⚠️ El archivo NO es secreto: está en public/ y su ruta está en este repo, que
// es público. El correo es el camino normal, no un candado. Lo que sí depende
// del correo es el permiso de novedades, que solo se confirma desde el buzón.
//
// Sin alias `@/`: lo leen `node --test` y el validador de artículos.
// ─────────────────────────────────────────────────────────────────────────────

export interface RecursoDescargable {
  /** Lo que se promete en el formulario y en el correo. */
  titulo: string;
  /** «Word», «PDF»… Sale en el botón y en el correo. */
  formato: string;
  /** Ruta pública del archivo (no es secreta). El hash del nombre evita cachés viejas al cambiarlo. */
  archivo: string;
  /** La guía de la que sale: adonde se vuelve si un enlace ha caducado. */
  guia: string;
  /** Asunto del correo con el enlace. */
  asunto: string;
  /** Una línea práctica para el correo: qué hacer con el archivo. */
  consejo: string;
  /** El titular del recuadro de descarga en la guía. */
  llamada: string;
  /** Qué recibe, en una frase, debajo del titular. */
  promesa: string;
}

export const RECURSOS_DESCARGABLES = {
  'plantilla-politica-cancelacion': {
    titulo: 'la plantilla de política de cancelación',
    formato: 'Word',
    // scripts/generar-plantilla-cancelacion.mjs la genera desde el texto de la guía.
    archivo: '/recursos/descargas/plantilla-politica-cancelacion-fb03346812.docx',
    guia: '/recursos/politica-de-cancelacion-de-clases',
    asunto: 'Tu plantilla de política de cancelación',
    consejo: 'Cambia lo que va entre corchetes, borra lo que no aplique y revísala con tu asesoría antes de publicarla.',
    llamada: 'Descárgala en Word, lista para rellenar',
    promesa: 'Te la mandamos por email: las cláusulas de esta guía en un documento de Word, con lo que tienes que cambiar marcado en amarillo.',
  },
} as const satisfies Record<string, RecursoDescargable>;

export type SlugDescarga = keyof typeof RECURSOS_DESCARGABLES;

export function esSlugDescarga(x: unknown): x is SlugDescarga {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(RECURSOS_DESCARGABLES, x);
}

/**
 * El texto de la casilla de novedades. Se guarda tal cual con el consentimiento
 * (`consentimiento_texto`), así que el formulario y el servidor leen ESTA
 * constante: si cada lado tuviera su copia, lo guardado podría no ser lo que
 * se enseñó, y la prueba del consentimiento no valdría.
 */
export const TEXTO_CONSENTIMIENTO_NOVEDADES =
  'Quiero recibir por email novedades y guías de Tentare para llevar mi estudio. Puedo darme de baja cuando quiera.';

/**
 * Email aceptable. Más estricto que el de otros formularios porque este manda
 * un correo a la dirección que se escriba: sin `<`, `>`, `,`, `;`, comillas ni
 * paréntesis (formas que algún proveedor interpreta como varias destinatarias o
 * con nombre), y con un dominio que termina en una extensión de letras.
 */
export const EMAIL_VALIDO = /^[^\s@<>,;:"'()[\]\\]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

/**
 * El buzón al que llega de verdad un email, para el tope de envíos por
 * destinataria: `ana+x@gmail.com`, `a.na@gmail.com` y `ana@googlemail.com` son
 * el mismo buzón, y sin esto cada variante contaría como una persona distinta.
 * Solo sirve para contar: lo que se guarda y a donde se envía es lo que escribió.
 */
export function buzonCanonico(email: string): string {
  const [local = '', dominio = ''] = email.trim().toLowerCase().split('@');
  const d = dominio === 'googlemail.com' ? 'gmail.com' : dominio;
  let l = local.split('+')[0];
  if (d === 'gmail.com') l = l.replace(/\./g, '');
  return `${l}@${d}`;
}
