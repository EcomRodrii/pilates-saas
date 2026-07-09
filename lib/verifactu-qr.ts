// ─────────────────────────────────────────────────────────────────────────────
// Veri*Factu — parte CLIENTE-SEGURA: formateadores, fechas y URL del QR de
// cotejo de la AEAT. NO usa node:crypto, así que puede importarse desde
// componentes de navegador (la huella SHA-256 vive en verifactu.ts, solo servidor).
// ─────────────────────────────────────────────────────────────────────────────

// Endpoints oficiales del servicio de cotejo (QR) de la AEAT.
export const QR_ENDPOINT_PRODUCCION = 'https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR';
export const QR_ENDPOINT_PRUEBAS = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';

// Importe con punto decimal y 2 decimales (formato de la cadena de huella AEAT).
export function formatImporte(n: number): string {
  return n.toFixed(2);
}

// Fecha de expedición en formato dd-mm-yyyy exigido por la AEAT.
export function formatFechaExpedicion(fecha: Date): string {
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const yyyy = fecha.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

// Fecha de expedición dd-mm-yyyy a partir de una fecha ISO ('YYYY-MM-DD' o ISO
// completa). Trabaja sobre la parte de fecha textual: no desplaza por huso.
export function fechaExpedicionDesdeISO(iso: string): string {
  const [yyyy, mm, dd] = iso.slice(0, 10).split('-');
  return `${dd}-${mm}-${yyyy}`;
}

// FechaHoraHusoGenRegistro: instante actual en ISO-8601 con el huso real de
// España (Europe/Madrid → +01:00 en invierno, +02:00 en verano). La AEAT exige
// el huso; el servidor corre en UTC, así que lo derivamos con Intl.
export function fechaHoraHusoMadrid(fecha: Date, tz = 'Europe/Madrid'): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZoneName: 'longOffset',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(fecha)) p[part.type] = part.value;
  const hour = p.hour === '24' ? '00' : p.hour; // algunos entornos devuelven 24
  const m = (p.timeZoneName ?? '').match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  const offset = m ? `${m[1]}${m[2].padStart(2, '0')}:${m[3] ?? '00'}` : 'Z';
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}${offset}`;
}

// ── Código QR ────────────────────────────────────────────────────────────────
export interface DatosQrVerifactu {
  nif: string;
  numSerie: string;      // número + serie
  fecha: string;         // dd-mm-yyyy
  importeTotal: number;
}

// URL HTTPS del QR de cotejo de la AEAT. La AEAT admite '/' sin codificar en
// numserie (así aparece en su ejemplo oficial); el resto de valores se codifican.
export function urlQrVerifactu(d: DatosQrVerifactu, opciones?: { produccion?: boolean }): string {
  const base = opciones?.produccion === false ? QR_ENDPOINT_PRUEBAS : QR_ENDPOINT_PRODUCCION;
  const enc = (v: string) => encodeURIComponent(v).replace(/%2F/g, '/');
  const qs =
    `nif=${enc(d.nif)}` +
    `&numserie=${enc(d.numSerie)}` +
    `&fecha=${enc(d.fecha)}` +
    `&importe=${formatImporte(d.importeTotal)}`;
  return `${base}?${qs}`;
}
