import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Identificador único para entidades. Combina timestamp + contador monotónico
// (colisión-cero dentro de un proceso, incluso en bucles ajustados como los
// crons — P0-7) + aleatorio (seguridad entre procesos). ÚNICO generador del
// sistema: los crons lo importan en vez de reimplementar Math.random() suelto.
let uidSeq = 0;
export function uid() {
  uidSeq = (uidSeq + 1) % 0xffffffff;
  return `${Date.now().toString(36)}-${uidSeq.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// UUID v4 de verdad (para columnas Postgres `uuid`, donde el `uid()` de arriba
// no vale — formato inválido, 22P02). `crypto.randomUUID()` exige contexto
// seguro y Safari >=15.4; `crypto.getRandomValues()` es muchísimo más viejo y
// funciona en contexto no seguro, así que sirve de fallback real, no solo de
// mejor-que-nada.
export function uuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, x => x.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

// Compara dos versiones "0.92"/"1.0.3" numéricamente, no como texto — un
// ORDER BY version en SQL (o un .sort() de JS por defecto) las trata como
// texto y ordena mal en cuanto un componente llega a dos cifras: "0.10" sale
// ANTES que "0.2" porque '1' < '2' como carácter. Compara parte a parte como
// enteros. Usado por el changelog de Actualizaciones (lista admin + widget).
export function compararVersiones(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Formatea un importe en euros al estilo español: coma decimal + " €"
// (p.ej. 22 → "22,00 €"). SOLO para mostrar en pantalla. NO usar para valores
// de protocolo/QR (Verifactu, PayPal), que exigen punto decimal a propósito.
export function formatEuro(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

// Formateadores de fecha/hora en español — estaban reimplementados (copy-paste
// idéntico o casi) en 6+ páginas. Un único sitio para no divergir por accidente.
export function formatFechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatHoraCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ─── Semanas ─────────────────────────────────────────────────────────────────
// El lunes de la semana de una fecha. En España la semana empieza en lunes, y
// `Date.getDay()` devuelve 0 para DOMINGO — que es justo donde se cuela el
// error: restar `getDay() - 1` funciona de lunes a sábado y el domingo suma un
// día, dejando la semana empezando MAÑANA.
//
// Estaba escrito a mano en tres pantallas. Dos acertaban y la del dashboard no,
// así que los domingos su "ocupación media" miraba la semana siguiente —vacía—
// y mostraba 0% con las clases de hoy llenas. Un único sitio.
export function inicioDeSemana(fecha: Date | string): Date {
  const d = new Date(fecha);
  const dia = d.getDay();                       // 0 = domingo
  d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** El domingo de la semana de una fecha (fin de semana natural, lunes→domingo). */
export function finDeSemana(fecha: Date | string): Date {
  const d = inicioDeSemana(fecha);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ─── Fecha y hora DEL ESTUDIO ────────────────────────────────────────────────
// Los tres de arriba formatean en la zona horaria del NAVEGADOR, que es lo que
// se quiere cuando el dato solo se pinta en pantalla. Pero cuando la cadena se
// mete en un mensaje que se le manda a una alumna —"tu clase es el sábado a las
// 09:00"— la zona correcta es la del estudio, no la de quien está editando: si
// la dueña abre el panel desde otro país, la alumna recibe una hora que no es.
//
// Esto estaba copiado a mano en cinco sitios (calendario y contexto) y solo UNA
// de las copias llevaba `timeZone`, así que editar una serie mandaba la hora
// buena y editar esa misma clase suelta mandaba la del navegador: mismo aviso,
// dos horas distintas. Un único sitio, y que no vuelva a pasar.
export const TZ_ESTUDIO = 'Europe/Madrid';

/** Desfase de la zona del estudio respecto a UTC, en milisegundos, para un
 *  instante dado. Cambia con el horario de verano, así que NO se puede fijar. */
function desfaseEstudio(msUtc: number): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ_ESTUDIO, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(msUtc)).map(x => [x.type, x.value]));
  // `hour` puede venir como '24' a medianoche en algunos entornos.
  const hora = Number(p.hour) % 24;
  const comoUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hora, Number(p.minute), Number(p.second));
  return comoUtc - msUtc;
}

/**
 * Un día natural del estudio ('YYYY-MM-DD') como el instante UTC en que empieza.
 *
 * ⚠️ No vale con `new Date(fecha)`: eso interpreta la fecha en UTC, y en Madrid
 * el día empieza una o dos horas ANTES. Un cierre del 10 al 16 se comería la
 * madrugada del 10 y dejaría fuera la del 17 — verificado en la BD: una clase
 * de las 00:30 del 10 cae dentro del cierre en hora local y fuera en UTC.
 *
 * Se resuelve el desfase con el instante tentativo y se corrige, así el cambio
 * de hora sale bien sin tabla de reglas.
 */
export function inicioDelDiaEstudio(fechaISO: string): string {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const tentativo = Date.UTC(a, m - 1, d, 0, 0, 0);
  return new Date(tentativo - desfaseEstudio(tentativo)).toISOString();
}

/** El instante UTC en que TERMINA ese día del estudio (= empieza el siguiente).
 *  Exclusivo, para usarlo como `< fin` y no dejar fuera los últimos segundos. */
export function finDelDiaEstudio(fechaISO: string): string {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const tentativo = Date.UTC(a, m - 1, d + 1, 0, 0, 0);
  return new Date(tentativo - desfaseEstudio(tentativo)).toISOString();
}

/**
 * El día de HOY en la zona del estudio, como 'YYYY-MM-DD'.
 *
 * ⚠️ Existe porque `new Date().toISOString().slice(0, 10)` da el día en **UTC**,
 * y eso no es «hoy» para nadie en España durante casi la mitad del día. Un pago
 * hecho a las 01:33 de la madrugada del 21 de agosto en Madrid son las 23:33
 * UTC del 20: el recibo se guardaba con fecha del día ANTERIOR al que lo vivió
 * la clienta y lo vive la propietaria en su panel. Con una clase reservada esa
 * misma noche, la factura y el cobro salían descuadrados un día.
 *
 * Mismo criterio que el resto de fechas de cara al usuario en este repo
 * (`fechaCortaEstudio`, `horaEstudio`): la hora del estudio manda, nunca la del
 * servidor ni la del navegador.
 */
export function hoyEnEstudio(ahora: Date = new Date()): string {
  // 'en-CA' da exactamente 'YYYY-MM-DD', que es el formato que espera una
  // columna `date` de Postgres.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_ESTUDIO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}

/**
 * Suma días a una fecha 'YYYY-MM-DD' y devuelve otra igual.
 *
 * Existe aparte de la aritmética con `Date` normal por dos motivos: no toca el
 * reloj (`Date.UTC` con valores explícitos es determinista, así que se puede
 * llamar durante el render sin saltarse la regla de pureza del compilador de
 * React), y trabaja sobre la fecha del ESTUDIO — sumarle 14 días a un instante
 * UTC puede caer en otro día natural del que se ve en el calendario.
 *
 * Admite días negativos.
 */
export function masDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

// ── Franja horaria local (día de la semana + hora del estudio) ──────────────
//
// Vive aquí, con TZ_ESTUDIO, porque la usan dos lados que no deberían
// importarse entre sí: el motor de decisiones (agrupar franjas recurrentes,
// lib/decision/senales.ts) y el portal de la socia (deducir su costumbre,
// lib/portal-sugerencias.ts).
//
// Por qué no vale el día/hora en UTC: España cambia de offset dos veces al año,
// así que la MISMA clase semanal cae en 18:00 UTC en verano y 19:00 en invierno
// —la costumbre se parte en dos al cruzar el cambio de hora— y una clase de las
// 00:30 del martes cuenta como lunes.
const DOW_POR_ETIQUETA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// `hourCycle: 'h23'` y no `hour12: false`: este último devuelve "24" a
// medianoche en algunas versiones de ICU.
const FORMATO_FRANJA_LOCAL = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ_ESTUDIO, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export interface FranjaLocal {
  dow: number;    // 0=domingo..6=sábado, en hora del estudio
  hora: number;
  minuto: number;
}

/** Día de la semana + hora de un instante, en la zona horaria del estudio. */
export function franjaLocalDe(inicioISO: string): FranjaLocal {
  let dow = 0, hora = 0, minuto = 0;
  for (const p of FORMATO_FRANJA_LOCAL.formatToParts(new Date(inicioISO))) {
    if (p.type === 'weekday') dow = DOW_POR_ETIQUETA[p.value] ?? 0;
    else if (p.type === 'hour') hora = Number(p.value) % 24;
    else if (p.type === 'minute') minuto = Number(p.value);
  }
  return { dow, hora, minuto };
}

/** "sábado, 25 de julio" en hora del estudio. */
export function fechaLargaEstudio(fecha: Date | string): string {
  return new Date(fecha).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ_ESTUDIO,
  });
}

/** "25 de julio" en hora del estudio (sin día de la semana). */
export function fechaCortaEstudio(fecha: Date | string): string {
  return new Date(fecha).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', timeZone: TZ_ESTUDIO,
  });
}

/** "09:00" en hora del estudio. */
export function horaEstudio(fecha: Date | string): string {
  return new Date(fecha).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ_ESTUDIO,
  });
}

/** "sábado, 25 de julio a las 09:00" en hora del estudio. */
export function cuandoEstudio(fecha: Date | string): string {
  return `${fechaLargaEstudio(fecha)} a las ${horaEstudio(fecha)}`;
}

/**
 * Copia al portapapeles y dice SI LO CONSIGUIÓ.
 *
 * ⚠️ Existe porque cinco pantallas hacían `navigator.clipboard.writeText(x)` sin
 * `await` ni `catch` y a continuación anunciaban «Copiado». En Chrome cuela; en
 * Safari `writeText` **rechaza** cuando la llamada no cuelga de un gesto del
 * usuario o el permiso está denegado — así que el aviso decía que sí y el
 * portapapeles se quedaba vacío. Es el patrón de bug que este repo nombra como
 * el más repetido («cero escritura optimista sin comprobar el resultado real»),
 * aplicado al portapapeles, y del mismo tipo que el `BarcodeDetector` de #565:
 * una API que Chrome resuelve y Safari no, en la que CI nunca se fija porque
 * los e2e corren solo en Chromium.
 *
 * `navigator.clipboard` tampoco existe fuera de contexto seguro, así que se
 * comprueba antes de tocarlo.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sin `console.error`: que falle la copia no es un fallo de la aplicación, y
    // quien llama ya tiene que enseñar la alternativa (el texto sigue en
    // pantalla para copiarlo a mano).
    return false;
  }
}

/**
 * "María Soler" → "María S." — la forma en que el kit "Tentare Studio App"
 * nombra a la instructora en las filas del horario ("Marta G. · Studio Alma",
 * CHEATSHEET-CSS.md, "Fila de clase").
 *
 * No es cosmética: esa línea va junto al nombre del estudio en una columna que
 * a 390 px no da para el nombre completo, y salía recortada a mitad de palabra
 * en las filas de Horario. Abreviar es lo que hace el propio diseño, así que
 * se abrevia en vez de dejar que la elipsis corte por donde caiga.
 *
 * Un solo nombre se devuelve tal cual (no hay apellido que abreviar), y los
 * nombres compuestos ("Ana María Ruiz") conservan solo el PRIMER token más la
 * inicial del ÚLTIMO — que es lo que identifica a una persona en una lista
 * corta, no el segundo nombre.
 */
export function nombreCortoInstructora(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length < 2) return partes[0] ?? '';
  const apellido = partes[partes.length - 1];
  return `${partes[0]} ${apellido[0]!.toUpperCase()}.`;
}
