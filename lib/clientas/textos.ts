// Cómo se cuenta en pantalla el «desde cuándo» de cada estado y las fechas
// relativas de la lista. Puro: se prueba con `node --test`.
import type { EstadoClienta, ResultadoEstado } from './estado.ts';
import { ETIQUETA_MOTIVO_BAJA, esMotivoBaja } from '../socios/baja.ts';
import { hoyEnEstudio } from '../utils.ts';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Días de calendario entre dos 'YYYY-MM-DD' (o el principio de dos fechas ISO). */
export function diasEntre(desde: string, hasta: string): number {
  const ms = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000);
}

/** «12 sep», o «12 sep 2025» si no es de este año. */
export function fechaCorta(ymd: string, hoyISO: string): string {
  const d = Number(ymd.slice(8, 10));
  const m = MESES[Number(ymd.slice(5, 7)) - 1];
  return ymd.slice(0, 4) === hoyISO.slice(0, 4) ? `${d} ${m}` : `${d} ${m} ${ymd.slice(0, 4)}`;
}

/** «hoy», «ayer», «hace 5 días», «hace 3 semanas», «hace 4 meses», «hace más de un año». */
export function haceCuanto(ymd: string, hoyISO: string): string {
  const n = diasEntre(ymd, hoyISO);
  if (n <= 0) return 'hoy';
  if (n === 1) return 'ayer';
  if (n < 14) return `hace ${n} días`;
  if (n < 60) return `hace ${Math.round(n / 7)} semanas`;
  if (n < 365) return `hace ${Math.round(n / 30)} meses`;
  return 'hace más de un año';
}

/** «mañana», «el jue 2», «el 14 oct». `ymd` en el futuro. */
export function cuandoSera(ymd: string, hoyISO: string, diaSemana?: string): string {
  const n = diasEntre(hoyISO, ymd);
  if (n <= 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n < 7 && diaSemana) return `el ${diaSemana} ${Number(ymd.slice(8, 10))}`;
  return `el ${fechaCorta(ymd, hoyISO)}`;
}

/**
 * El complemento que va al lado del estado: «desde mar 2025», «hace 12 días»,
 * «vino el 26 sep». De una clienta de baja, cuándo y por qué, si se sabe (su
 * baja abierta en `bajas_clienta`; las de antes de guardar el motivo, nada).
 */
export function textoDesde(
  r: Pick<ResultadoEstado, 'estado' | 'desde' | 'nueva'>,
  hoyISO: string,
  extra?: { baja?: { motivo: string; bajaEn: string } | null },
): string | null {
  const desde = r.desde;
  const porEstado: Record<EstadoClienta, () => string | null> = {
    ACTIVA: () => {
      if (r.nueva && desde) return `nueva · ${haceCuanto(desde, hoyISO)}`;
      if (!desde) return null;
      return `desde ${MESES[Number(desde.slice(5, 7)) - 1]} ${desde.slice(0, 4)}`;
    },
    DE_PRUEBA: () => (!desde ? null : desde > hoyISO ? `prueba ${cuandoSera(desde, hoyISO)}` : `vino el ${fechaCorta(desde, hoyISO)}`),
    SIN_RENOVAR: () => (desde ? `desde ${haceCuanto(desde, hoyISO)}` : null),
    // «Desde» y no «última vez»: su última actividad puede ser el fin de su
    // plan, no una clase, y al lado de «Última clase: hace 5 meses» un «última
    // vez hace 4 meses» parecía un error.
    INACTIVA: () => (desde ? `desde ${MESES[Number(desde.slice(5, 7)) - 1]} ${desde.slice(0, 4)}` : null),
    INTERESADA: () => (desde ? `desde ${fechaCorta(desde, hoyISO)}` : null),
    PAUSADA: () => null,
    DE_BAJA: () => {
      const b = extra?.baja;
      if (!b) return null;
      const dia = hoyEnEstudio(new Date(b.bajaEn));
      const motivo = esMotivoBaja(b.motivo) ? ETIQUETA_MOTIVO_BAJA[b.motivo].toLowerCase() : null;
      return [`desde ${fechaCorta(dia, hoyISO)}`, motivo].filter(Boolean).join(' · ');
    },
  };
  return porEstado[r.estado]();
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

// Uno por zona, construido una vez: construirlo cuesta mucho más que usarlo, y
// esto se pinta en cada fila con una clase reservada.
const formatosClase = new Map<string, Intl.DateTimeFormat>();
function formatoClase(tz: string): Intl.DateTimeFormat {
  let f = formatosClase.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    });
    formatosClase.set(tz, f);
  }
  return f;
}

/**
 * Cuándo es una clase, en corto y en hora del estudio: «hoy 18:00», «mañana
 * 9:30», «jue 18:00» (esta semana), «14 oct 18:00».
 */
export function cuandoClase(inicioIso: string, hoyISO: string, tz = 'Europe/Madrid'): string {
  const p = Object.fromEntries(formatoClase(tz).formatToParts(new Date(inicioIso)).map(x => [x.type, x.value]));
  const ymd = `${p.year}-${p.month}-${p.day}`;
  const hora = `${Number(p.hour)}:${p.minute}`;
  const n = diasEntre(hoyISO, ymd);
  if (n <= 0) return `hoy ${hora}`;
  if (n === 1) return `mañana ${hora}`;
  if (n < 7) {
    const dow = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))).getUTCDay();
    return `${DIAS_SEMANA[dow]} ${hora}`;
  }
  return `${fechaCorta(ymd, hoyISO)} ${hora}`;
}

/** El color de su avatar cuando no tiene foto: estable por nombre, de la paleta categórica. */
export function colorDeAvatar(nombre: string): string {
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
  return `var(--cat-${(Math.abs(hash) % 9) + 1})`;
}

/**
 * Si su cumpleaños cae en la próxima semana: «hoy», «mañana» o «el sábado».
 * `mmdd`: 'MM-DD' (lo único que ve todo el equipo); `null` si no cae.
 */
export function proximoCumple(mmdd: string | null, hoyISO: string): string | null {
  if (!mmdd) return null;
  for (let n = 0; n < 7; n++) {
    const d = new Date(`${hoyISO}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    if (d.toISOString().slice(5, 10) !== mmdd) continue;
    if (n === 0) return 'hoy';
    if (n === 1) return 'mañana';
    return `el ${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getUTCDay()]}`;
  }
  return null;
}

/**
 * Un teléfono como se lee en voz alta: «600 333 444», «+34 600 333 444». Si no
 * tiene la forma de un número español (otro país, una extensión…), tal cual.
 */
export function telefonoLegible(tel: string): string {
  const limpio = tel.replace(/[\s.-]/g, '');
  const m = /^(\+34|0034)?(\d{9})$/.exec(limpio);
  if (!m) return tel.trim();
  const n = m[2];
  return `${m[1] ? '+34 ' : ''}${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}
