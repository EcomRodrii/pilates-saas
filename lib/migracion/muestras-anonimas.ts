// ─────────────────────────────────────────────────────────────────────────────
// Migración Mágica · MUESTRAS ANÓNIMAS para el fallback de IA.
//
// Cuando el clasificador determinista no reconoce un archivo, el analizador
// pide a un proveedor de IA externo que proponga entidad + mapeo de columnas.
// Antes le mandaba las cabeceras y las 10 primeras filas REALES del CSV:
// nombres, emails, teléfonos, DNI y etiquetas de salud de socias de un estudio.
//
// La IA solo devuelve ÍNDICES de columna; los valores se validan después en
// código, en local, sobre TODAS las filas reales (`evaluarMapeo`). Así que para
// mapear le basta con la FORMA de cada columna, no con su contenido. Aquí se
// sustituye cada valor por un marcador de tipo:
//
//  - Cabecera que sugiere dato personal o de salud → siempre marcador
//    (`<email>`, `<teléfono>`, `<fecha nn/nn/aaaa>`, `<texto 12 caracteres>`…).
//  - Resto de columnas → marcador para lo que PAREZCA identificativo (email,
//    teléfono, DNI/NIE, IBAN, URL, número largo) o texto libre; se conservan
//    horas, importes, números cortos y booleanos.
//  - Categorías (estado, código de plan): solo se conserva un valor corto, sin
//    espacios, que se REPITE en la muestra y no nombra una condición de salud.
//    Un nombre propio suelto no se repite en 10 filas; «Active» sí.
//
// Compromiso aceptado: un nombre de plan con espacios («Bono 10») llega como
// `<texto 7 caracteres>`. No afecta al mapeo (la cabecera sigue ahí) ni a la
// resolución de planes, que se hace en código contra los valores reales.
//
// Módulo puro, sin dependencias: lo cubre muestras-anonimas.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Cabeceras de dato personal o sensible (ya normalizadas: sin tildes, minúsculas).
const CABECERA_SENSIBLE = new RegExp([
  'nombre', 'name', 'apellid', 'surname', 'vorname',
  'mail', 'correo',
  'telef', 'movil', 'phone', 'mobile', 'celular', 'whatsapp',
  '\\bdni\\b', '\\bnif\\b', '\\bnie\\b', 'document', 'pasaporte', 'passport',
  'direcc', 'address', 'domicilio', 'calle', 'street', 'postal', '\\bzip\\b',
  'nacimiento', 'birth', '\\bdob\\b', 'cumple', '\\bedad\\b', '\\bage\\b',
  'iban', 'cuenta', 'account', 'swift', '\\bbic\\b', 'tarjeta', '\\bcard\\b',
  'nota', 'note', 'observ', 'coment', 'comment', '\\btags?\\b', 'etiqueta',
  'salud', 'health', 'lesion', 'injur', 'medic', 'alergi', 'allerg', 'patolog',
  'embaraz', 'pregnan', 'diagnos', 'condicion', 'condition',
  'client', 'customer', 'member', 'socia', 'socio', 'alumn', 'usuari', 'user',
  'contact', 'asistente', 'attendee', 'participant', 'persona', 'titular',
  'pagador', 'payer', 'tutor', 'emergenc', 'referid', 'referr',
  'instructor', 'profesor', 'teacher', 'coach', 'trainer',
  'firma', 'signature', 'foto', 'photo', 'avatar', 'genero', 'gender', 'sexo',
].join('|'));

// Valores que, aunque la columna no lo avise, nombran una condición de salud.
const VALOR_SALUD = /lesion|embaraz|postparto|diastasis|hernia|lumbal|cervical|escoliosis|cirugi|operad|protesis|diabet|hipertens|asma|artrosis|artritis|osteopor|fibromialg|ansiedad|depres|cancer|alergi|medic|dolor|injur|pregnan/;

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_URL = /^(https?:\/\/|www\.)/i;
const RE_IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i;
const RE_DOCUMENTO = /^[XYZ]?-?\d{7,8}-?[A-Z]$/i;
const RE_FECHA = /^(\d{1,4})([/.-])(\d{1,2})\2(\d{1,4})(?:[ T](\d{1,2}):\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const RE_HORA = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const RE_IMPORTE = /^[-+]?(?:[€$£]\s?)?(?:\d{1,6}|\d{1,3}(?:[.,]\d{3})+)(?:[.,]\d{1,2})?(?:\s?(?:€|eur|usd|\$|£))?$/i;
const RE_BOOLEANO = /^(true|false|si|sí|no|yes|y|n|x|verdadero|falso)$/i;

/** ¿La cabecera sugiere un dato personal o sensible? */
export function cabeceraSensible(cabecera: string): boolean {
  return CABECERA_SENSIBLE.test(normalizar(cabecera));
}

function formaDeFecha(m: RegExpMatchArray): string {
  const grupo = (g: string) => (g.length === 4 ? 'aaaa' : 'nn');
  const sep = m[2];
  return `<fecha ${grupo(m[1])}${sep}${grupo(m[3])}${sep}${grupo(m[4])}${m[5] !== undefined ? ' hh:mm' : ''}>`;
}

/** Marcador para lo que parece identificativo; `null` si no lo parece. */
function marcadorIdentificativo(v: string): string | null {
  if (RE_EMAIL.test(v)) return '<email>';
  if (RE_URL.test(v)) return '<url>';
  const compacto = v.replace(/[\s().-]/g, '');
  if (RE_IBAN.test(compacto)) return '<iban>';
  if (RE_DOCUMENTO.test(v)) return '<documento>';
  // «1990-01-15» sin guiones son 8 dígitos: la fecha se resuelve antes que el
  // número, o perdería la forma que la IA necesita para reconocerla.
  if (RE_FECHA.test(v)) return null;
  if (/^\+?\d+$/.test(compacto)) {
    const digitos = compacto.replace('+', '').length;
    const conSeparadores = compacto !== v || v.startsWith('+');
    if (digitos >= 9 && digitos <= 15 && (conSeparadores || /^[6789]/.test(compacto))) return '<teléfono>';
    if (digitos >= 7) return `<número ${digitos} dígitos>`;
  }
  return null;
}

const texto = (v: string) => `<texto ${[...v].length} caracteres>`;

/** Valor de una columna con cabecera sensible: nunca sale el original. */
function marcadorDeTipo(v: string): string {
  const id = marcadorIdentificativo(v);
  if (id) return id;
  const fecha = v.match(RE_FECHA);
  if (fecha) return formaDeFecha(fecha);
  if (RE_HORA.test(v)) return '<hora>';
  if (RE_IMPORTE.test(v)) return '<número>';
  if (RE_BOOLEANO.test(v)) return '<sí/no>';
  return texto(v);
}

/** Valor de una columna sin cabecera sensible: se conserva solo si es inocuo. */
function valorSeguro(v: string, repeticiones: number): string {
  const id = marcadorIdentificativo(v);
  if (id) return id;
  const fecha = v.match(RE_FECHA);
  if (fecha) return formaDeFecha(fecha);
  if (VALOR_SALUD.test(normalizar(v))) return texto(v);
  if (RE_HORA.test(v) || RE_IMPORTE.test(v) || RE_BOOLEANO.test(v)) return v;
  if (repeticiones >= 2 && !/\s/.test(v) && [...v].length <= 20) return v;
  return texto(v);
}

/** Sustituye cada celda de la muestra por su forma, sin datos personales. */
export function enmascararMuestra(cabeceras: string[], filas: string[][]): string[][] {
  const ancho = Math.max(cabeceras.length, ...filas.map(f => f.length));
  const sensibles = Array.from({ length: ancho }, (_, i) => cabeceraSensible(cabeceras[i] ?? ''));
  const conteos = Array.from({ length: ancho }, (_, i) => {
    const c = new Map<string, number>();
    for (const f of filas) {
      const v = (f[i] ?? '').trim();
      if (v) c.set(v, (c.get(v) ?? 0) + 1);
    }
    return c;
  });
  return filas.map(f => f.map((celda, i) => {
    const v = (celda ?? '').trim();
    if (!v) return '';
    return sensibles[i] ? marcadorDeTipo(v) : valorSeguro(v, conteos[i].get(v) ?? 0);
  }));
}

/** Nota para el prompt de sistema: qué significan los marcadores. */
export const NOTA_MUESTRAS_ANONIMAS =
  'Los valores de ejemplo están anonimizados: marcadores como <email>, <teléfono>, <documento>, <iban>, ' +
  '<fecha nn/nn/aaaa>, <número N dígitos> o <texto N caracteres> sustituyen al valor real y describen su forma. ' +
  'Usa las cabeceras y esas formas para decidir el mapeo.';

/** Mensaje de usuario para clasificar un archivo, con la muestra ya enmascarada. */
export function construirPromptClasificacion(nombre: string, cabeceras: string[], filas: string[][]): string {
  const muestra = enmascararMuestra(cabeceras, filas);
  return (
    `Archivo: ${nombre}\nColumnas (índice: nombre):\n` +
    cabeceras.map((h, i) => `${i}: ${h}`).join('\n') +
    `\n\nPrimeras filas (anonimizadas):\n` +
    muestra.map(f => f.join(' | ')).join('\n')
  );
}
