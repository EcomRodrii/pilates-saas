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

/** "sábado, 25 de julio" en hora del estudio. */
export function fechaLargaEstudio(fecha: Date | string): string {
  return new Date(fecha).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ_ESTUDIO,
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
