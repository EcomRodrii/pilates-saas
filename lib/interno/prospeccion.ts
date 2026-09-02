// ─────────────────────────────────────────────────────────────────────────────
// Prospección en frío — lógica pura.
//
// Este módulo no habla con la BD ni con SMTP a propósito: lo que decide si la
// pantalla sirve no es el CSS ni el transporte, es **qué se considera un
// borrador que no se puede enviar tal cual**. Eso hay que poder probarlo sin
// levantar nada y sin gastar una llamada a la IA.
//
// La regla que gobierna todo el flujo: la IA redacta, una persona firma. Cada
// correo afirma cosas sobre el negocio de un tercero al que nadie ha pedido
// permiso para escribirle — que use Bsport, que tenga Instagram, que cobre X.
// Si una de esas afirmaciones es falsa, el correo no se lee como "escrito a
// mano": se lee como un bot que no sabe con quién habla, que es exactamente lo
// contrario de lo que se busca.
//
// `revisarBorrador` es esa red. No bloquea el envío — avisa, y la persona
// decide. Un aviso falso es barato (se ignora); una afirmación inventada
// enviada a 100 estudios reales, no.
// ─────────────────────────────────────────────────────────────────────────────
import { PLAN_INFO } from '../billing/entitlements.ts';

export const ESTADOS_BORRADOR = ['BORRADOR', 'APROBADO', 'ENVIADO', 'FALLIDO', 'DESCARTADO'] as const;
export type EstadoBorrador = (typeof ESTADOS_BORRADOR)[number];

export const ESTADO_BORRADOR_ETIQUETA: Record<EstadoBorrador, string> = {
  BORRADOR: 'Sin revisar',
  APROBADO: 'Aprobado',
  ENVIADO: 'Enviado',
  FALLIDO: 'Falló el envío',
  DESCARTADO: 'Descartado',
};

export interface BorradorProspeccion {
  id: string;
  leadId: string;
  asunto: string;
  cuerpo: string;
  estado: EstadoBorrador;
  aprobadoPor: string | null;
  aprobadoEn: string | null;
  enviadoEn: string | null;
  error: string | null;
  generadoEn: string;
}

/** Fila cruda → borrador. Vive aquí y no en la route que lo usa primero porque
 *  lo comparten tres rutas: un `route.ts` es un entrypoint de Next, no un
 *  módulo del que se importe. */
export function aBorrador(f: Record<string, unknown>): BorradorProspeccion {
  return {
    id: f.id as string,
    leadId: f.lead_id as string,
    asunto: (f.asunto as string) ?? '',
    cuerpo: (f.cuerpo as string) ?? '',
    estado: ((f.estado as string) ?? 'BORRADOR') as EstadoBorrador,
    aprobadoPor: (f.aprobado_por as string | null) ?? null,
    aprobadoEn: (f.aprobado_en as string | null) ?? null,
    enviadoEn: (f.enviado_en as string | null) ?? null,
    error: (f.error as string | null) ?? null,
    generadoEn: String(f.generado_en ?? f.creado_en ?? ''),
  };
}

/** Lo que necesita `revisarBorrador` de un lead. Subconjunto de `Lead` a
 *  propósito: así se puede probar sin construir un lead entero. */
export interface DatosProspecto {
  estudio: string | null;
  web: string | null;
  instagram: string | null;
  softwareActual: string | null;
}

// ─── Importación del CSV ─────────────────────────────────────────────────────

export type CampoProspecto = 'email' | 'estudio' | 'web' | 'instagram' | 'telefono' | 'ciudad' | 'software_actual';

export interface CampoProspectoMeta {
  campo: CampoProspecto;
  etiqueta: string;
  obligatorio: boolean;
  /** Cómo se llama la columna en un CSV escrito por una persona. Se comparan
   *  normalizados (sin acentos, sin espacios ni guiones bajos). */
  alias: string[];
}

export const CAMPOS_PROSPECTO: CampoProspectoMeta[] = [
  { campo: 'email', etiqueta: 'Email', obligatorio: true, alias: ['email', 'correo', 'mail', 'emailcontacto', 'correoelectronico'] },
  { campo: 'estudio', etiqueta: 'Estudio', obligatorio: true, alias: ['estudio', 'nombre', 'nombreestudio', 'negocio', 'centro'] },
  { campo: 'web', etiqueta: 'Web', obligatorio: false, alias: ['web', 'website', 'url', 'paginaweb', 'sitioweb'] },
  { campo: 'instagram', etiqueta: 'Instagram', obligatorio: false, alias: ['instagram', 'ig', 'insta', 'perfilinstagram'] },
  { campo: 'telefono', etiqueta: 'Teléfono', obligatorio: false, alias: ['telefono', 'movil', 'tel', 'phone', 'contacto'] },
  { campo: 'ciudad', etiqueta: 'Ciudad', obligatorio: false, alias: ['ciudad', 'localidad', 'poblacion', 'city'] },
  { campo: 'software_actual', etiqueta: 'Software actual', obligatorio: false, alias: ['software', 'softwareactual', 'plataforma', 'sistema', 'usa'] },
];

/** Minúsculas, sin acentos y sin nada que no sea letra o número. Es la forma
 *  en que se comparan cabeceras y nombres de software: "Software Actual",
 *  "software_actual" y "SoftwareActual" son la misma columna. */
export function normalizarClave(s: string): string {
  return (s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Empareja cada campo con el índice de su columna, o -1 si no está. */
export function autoMapearProspecto(headers: string[]): Record<CampoProspecto, number> {
  const normalizadas = headers.map(normalizarClave);
  const mapa = {} as Record<CampoProspecto, number>;
  for (const meta of CAMPOS_PROSPECTO) {
    // Coincidencia exacta primero; solo si no hay, se acepta que la cabecera
    // CONTENGA el alias. Sin este orden, "email" casaría con "emailverificado"
    // antes que con la columna "email" que está más a la derecha.
    let i = normalizadas.findIndex(h => meta.alias.includes(h));
    if (i === -1) i = normalizadas.findIndex(h => meta.alias.some(a => h.includes(a)));
    mapa[meta.campo] = i;
  }
  return mapa;
}

export interface FilaProspecto {
  email: string;
  estudio: string | null;
  web: string | null;
  instagram: string | null;
  telefono: string | null;
  ciudad: string | null;
  softwareActual: string | null;
}

export interface FilaProspectoValidada {
  /** 1-indexada y contando la cabecera, para que cuadre con lo que ve la
   *  persona al abrir el CSV en Excel. */
  fila: number;
  datos: FilaProspecto;
  estado: 'ok' | 'error';
  motivo?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailProspectoValido(email: string): boolean {
  return EMAIL_RE.test((email ?? '').trim());
}

/** Deja el handle sin `@`, sin URL y sin barra final: `@estudio`,
 *  `instagram.com/estudio/` y `https://www.instagram.com/estudio` son el mismo
 *  perfil, y guardarlos de tres formas distintas rompe cualquier comparación
 *  posterior (incluida la de `revisarBorrador`). */
export function normalizarInstagram(valor: string | null | undefined): string | null {
  const bruto = (valor ?? '').trim();
  if (!bruto) return null;
  const sinUrl = bruto
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/^instagram\.com\//i, '');
  const handle = sinUrl.replace(/^@/, '').replace(/\/+$/, '').split(/[/?#]/)[0].trim();
  return handle ? `@${handle}` : null;
}

export function normalizarWeb(valor: string | null | undefined): string | null {
  const bruto = (valor ?? '').trim();
  if (!bruto) return null;
  return bruto.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim() || null;
}

const limpio = (v: string | undefined): string | null => {
  const s = (v ?? '').trim();
  return s || null;
};

/**
 * Valida las filas del CSV. Devuelve TODAS —también las que fallan— porque la
 * pantalla enseña los rechazos: un CSV de 100 filas del que se importan 98 sin
 * decir cuáles fueron las otras 2 obliga a comparar a ojo dos listas.
 */
export function validarFilasProspecto(
  rows: string[][], mapa: Record<CampoProspecto, number>,
): FilaProspectoValidada[] {
  const vistos = new Set<string>();
  return rows.map((row, i) => {
    const en = (c: CampoProspecto): string | undefined =>
      mapa[c] >= 0 ? row[mapa[c]] : undefined;

    const email = (en('email') ?? '').trim().toLowerCase();
    const datos: FilaProspecto = {
      email,
      estudio: limpio(en('estudio')),
      web: normalizarWeb(en('web')),
      instagram: normalizarInstagram(en('instagram')),
      telefono: limpio(en('telefono')),
      ciudad: limpio(en('ciudad')),
      softwareActual: limpio(en('software_actual')),
    };
    const fila = i + 2;

    if (!email) return { fila, datos, estado: 'error' as const, motivo: 'Sin email' };
    if (!emailProspectoValido(email)) {
      return { fila, datos, estado: 'error' as const, motivo: `Email inválido: ${email}` };
    }
    // Duplicado DENTRO del propio archivo. El índice único de la BD ya impide
    // crear dos leads con el mismo email, pero sin esto la segunda fila
    // pisaría en silencio a la primera y el resumen diría "100 importados"
    // cuando solo hay 99 estudios.
    if (vistos.has(email)) {
      return { fila, datos, estado: 'error' as const, motivo: `Repetido en el archivo: ${email}` };
    }
    vistos.add(email);

    if (!datos.estudio) return { fila, datos, estado: 'error' as const, motivo: 'Sin nombre de estudio' };
    return { fila, datos, estado: 'ok' as const };
  });
}

// ─── Revisión del borrador ───────────────────────────────────────────────────

export type GravedadAviso = 'alta' | 'media';

export interface AvisoBorrador {
  gravedad: GravedadAviso;
  /** Qué mirar, en una frase que se lea de un vistazo al lado del texto. */
  texto: string;
}

/** Competidores que el prompt conoce y puede nombrar. Si el correo menciona uno
 *  que NO es el que consta en el CSV, o es un dato viejo o la IA se lo ha
 *  inventado — las dos cosas se arreglan mirando, no adivinando. */
const SOFTWARE_CONOCIDO = [
  'bsport', 'momence', 'eversports', 'mindbody', 'timp', 'lorari',
  'bonsai', 'glofox', 'wodbuster', 'trainingym', 'nubapp',
];

const PLACEHOLDER_RE = /\[[^\]\n]{2,40}\]|\{\{[^}\n]{1,40}\}\}|\bXXX+\b|<[a-zA-Zñáéíóú _]{2,30}>/;

/** Importes en euros escritos como 29€, 29 €, 29,99 €, €29 o "29 euros". */
const IMPORTE_RE = /(?:€\s*(\d{1,4}(?:[.,]\d{1,2})?))|(?:(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|euros?\b))/gi;

const PRECIOS_VALIDOS: ReadonlySet<number> = new Set(
  Object.values(PLAN_INFO).map(p => p.precioMes),
);

/**
 * Contrasta lo que dice el borrador contra lo que consta del prospecto.
 *
 * No corrige ni reescribe: señala. La persona que revisa tiene el dato real al
 * lado en la pantalla, así que un aviso le cuesta tres segundos de mirada; lo
 * que no puede pasar es que una afirmación inventada salga sin que nadie la
 * haya visto.
 */
export function revisarBorrador(
  borrador: { asunto: string; cuerpo: string }, lead: DatosProspecto,
): AvisoBorrador[] {
  const avisos: AvisoBorrador[] = [];
  const texto = `${borrador.asunto}\n${borrador.cuerpo}`;
  const plano = normalizarClave(texto);

  // 1. Plantilla a medio rellenar. Es el fallo que más delata que no lo
  //    escribió una persona, y el más barato de detectar.
  const hueco = texto.match(PLACEHOLDER_RE);
  if (hueco) {
    avisos.push({ gravedad: 'alta', texto: `Hueco sin rellenar: ${hueco[0]}` });
  }

  // 2. Menciona un software que no es el suyo.
  const suyo = normalizarClave(lead.softwareActual ?? '');
  for (const sw of SOFTWARE_CONOCIDO) {
    if (!plano.includes(sw)) continue;
    if (suyo && suyo.includes(sw)) continue;
    avisos.push({
      gravedad: 'alta',
      texto: lead.softwareActual
        ? `Menciona "${sw}" y en el CSV consta ${lead.softwareActual}`
        : `Menciona "${sw}" y no consta qué software usan`,
    });
  }

  // 3/4. Da por hecho un canal que no consta. Decirle a alguien "os he visto en
  //      Instagram" cuando no tienes su Instagram es la clase de detalle que
  //      convierte un correo bueno en uno que da vergüenza ajena.
  if (!lead.instagram && /instagram|@[a-z0-9._]{3,}/i.test(texto)) {
    avisos.push({ gravedad: 'alta', texto: 'Habla de Instagram y el prospecto no tiene handle en el CSV' });
  }
  if (!lead.web && /\b(?:vuestra|su)\s+(?:web|p[áa]gina)\b|\bwww\.|\.(?:com|es|cat)\b/i.test(texto)) {
    avisos.push({ gravedad: 'media', texto: 'Habla de su web y en el CSV no consta ninguna' });
  }

  // 5. Un precio que no existe. Prometer 19€/mes en frío y cobrar 29 es una
  //    promesa rota antes de la primera llamada.
  for (const m of texto.matchAll(IMPORTE_RE)) {
    const crudo = (m[1] ?? m[2] ?? '').replace(',', '.');
    const valor = Number(crudo);
    if (!Number.isFinite(valor) || PRECIOS_VALIDOS.has(valor)) continue;
    avisos.push({ gravedad: 'alta', texto: `Precio que no está en el catálogo: ${m[0]}` });
  }

  // 6. No nombra al estudio: no está personalizado, que es la única razón de
  //    ser de generarlo uno a uno en vez de mandar la misma plantilla a 100.
  if (lead.estudio && !plano.includes(normalizarClave(lead.estudio))) {
    avisos.push({ gravedad: 'media', texto: `No nombra a "${lead.estudio}" en ningún sitio` });
  }

  // 7. Demasiado largo. Un primer correo en frío que no se lee entero no
  //    existe; el umbral es generoso a propósito.
  const palabras = borrador.cuerpo.trim().split(/\s+/).filter(Boolean).length;
  if (palabras > 220) {
    avisos.push({ gravedad: 'media', texto: `${palabras} palabras — se lee como un folleto, no como un correo` });
  }

  return avisos;
}

/** Un borrador con un aviso GRAVE no debería aprobarse sin mirar. No lo
 *  impide (quien revisa manda), pero la UI lo usa para no dejar que se cuele
 *  en un "aprobar y seguir" sin pararse. */
export function tieneAvisoGrave(avisos: AvisoBorrador[]): boolean {
  return avisos.some(a => a.gravedad === 'alta');
}

// ─── Envío por lotes ─────────────────────────────────────────────────────────

/**
 * Cuántos se mandan de una tacada.
 *
 * No es un número de rendimiento: es de reputación. Un dominio que nunca ha
 * mandado correo y de pronto suelta 100 mensajes casi idénticos en un minuto
 * es el patrón exacto que buscan los filtros de spam. En lotes pequeños, con
 * una persona pulsando el botón entre uno y otro, el tráfico se parece a lo
 * que dice ser: alguien escribiendo a estudios de uno en uno.
 */
export const TAMANO_LOTE = 10;

export function siguienteLote<T>(aprobados: readonly T[], tamano: number = TAMANO_LOTE): T[] {
  return aprobados.slice(0, Math.max(0, tamano));
}

export interface ResumenProspeccion {
  importados: number;
  porRevisar: number;
  aprobados: number;
  enviados: number;
  fallidos: number;
}

export function resumirProspeccion(
  leadsImportados: number, borradores: readonly { estado: EstadoBorrador }[],
): ResumenProspeccion {
  const cuenta = (e: EstadoBorrador) => borradores.filter(b => b.estado === e).length;
  return {
    importados: leadsImportados,
    porRevisar: cuenta('BORRADOR'),
    aprobados: cuenta('APROBADO'),
    enviados: cuenta('ENVIADO'),
    fallidos: cuenta('FALLIDO'),
  };
}
