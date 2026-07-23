// ─────────────────────────────────────────────────────────────────────────────
// Bandeja diaria (F2 · B2.9). Una lista de ≤5 DECISIONES que la dueña debería
// mirar hoy, DERIVADA de tablas que ya existen (recuperaciones, recibos, plazas
// fijas, averías) — no un panel nuevo pesado, un widget que LEE.
//
// Reglas del informe:
//  · Penalizaciones apagadas: nada punitivo, es un recordatorio amable.
//  · Respeta socio_excepciones: una socia exenta de recordatorio de cobro NO
//    aparece por un cobro pendiente.
//  · Jamás propone auto-cancelar: la avería que deja gente fuera es una DECISIÓN
//    (a quién recolocar), nunca una acción automática.
//
// Lógica pura y testeable; el widget solo la pinta. Todo el tiempo entra por
// `ahoraMs` inyectado (sin Date.now() aquí) para que los tests sean deterministas.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  BloqueoMaquina, PlazaFija, Recuperacion, Recibo, SocioExcepcion,
  Sesion, Reserva, Socio, Sala,
} from '@/lib/types';
import { aforoEfectivoSesion } from './aforo-logic.ts';
import { sociosConExcepcion } from './excepciones.ts';

// Euro en formato ES, idéntico a formatEuro de utils; inline para no arrastrar
// clsx/tailwind-merge a un módulo de lógica pura (y su test con node --test).
function euro(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export type CategoriaBandeja = 'AVERIA' | 'COBRO' | 'RECUPERACION' | 'PLAZA';

export interface ItemBandeja {
  id: string;                 // estable (key de React + descartar)
  categoria: CategoriaBandeja;
  urgencia: number;           // mayor = más arriba
  titulo: string;
  detalle: string;
  socioId: string | null;
  href: string;               // adónde ir a resolverlo
  cta: string;                // etiqueta del botón
}

export interface EntradaBandeja {
  ahoraMs: number;
  recuperaciones: Recuperacion[];
  recibos: Recibo[];
  plazasFijas: PlazaFija[];
  bloqueosMaquina: BloqueoMaquina[];
  sesiones: Sesion[];
  reservas: Reserva[];
  socios: Socio[];
  salas: Sala[];
  excepciones: SocioExcepcion[];
}

const DIA_MS = 86_400_000;
export const MAX_ITEMS_BANDEJA = 5;

const RECUP_AVISO_DIAS = 7;              // recuperación que caduca dentro de 7 días
const AVERIA_HORIZONTE_MS = 3 * DIA_MS;  // overflow en sesiones de las próximas 72 h
const PLAZA_GRACIA_MS = 36 * 3_600_000;  // no marcar una plaza recién creada antes del cron nocturno

// Días enteros entre una fecha 'YYYY-MM-DD' y hoy, en espacio de día UTC (misma
// función en test y en prod → determinista; el desfase de ±1 en la medianoche
// española es tolerable para un aviso diario).
function diasHasta(ymd: string, ahoraMs: number): number {
  const hoy0 = Math.floor(ahoraMs / DIA_MS) * DIA_MS;
  const fecha0 = Date.parse(`${ymd}T00:00:00Z`);
  if (Number.isNaN(fecha0)) return Number.POSITIVE_INFINITY;
  return Math.round((fecha0 - hoy0) / DIA_MS);
}

function plural(n: number, sing: string, plur: string): string {
  return `${n} ${n === 1 ? sing : plur}`;
}

function fechaHoraCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

// Construye la bandeja: junta candidatos de las 4 fuentes, ordena por urgencia y
// se queda con los ≤5 más urgentes. Determinista (desempate por id).
export function construirBandeja(e: EntradaBandeja): ItemBandeja[] {
  const nombreSocia = (id: string | null): string => {
    if (!id) return 'una socia';
    const s = e.socios.find(x => x.id === id);
    return s ? `${s.nombre} ${s.apellidos}`.trim() : 'una socia';
  };
  const nombreSala = (id: string): string => e.salas.find(x => x.id === id)?.nombre ?? 'la sala';

  const items: ItemBandeja[] = [
    ...recuperacionesPorVencer(e, nombreSocia),
    ...cobrosPendientes(e, nombreSocia),
    ...averiaOverflow(e, nombreSala),
    ...plazasSinClase(e, nombreSocia),
  ];

  items.sort((a, b) => b.urgencia - a.urgencia || a.id.localeCompare(b.id));
  return items.slice(0, MAX_ITEMS_BANDEJA);
}

// 1 · Recuperaciones DISPONIBLES que caducan dentro de RECUP_AVISO_DIAS.
function recuperacionesPorVencer(e: EntradaBandeja, nombreSocia: (id: string | null) => string): ItemBandeja[] {
  const out: ItemBandeja[] = [];
  for (const r of e.recuperaciones) {
    if (r.estado !== 'DISPONIBLE') continue;
    const dias = diasHasta(r.caducaEl, e.ahoraMs);
    if (dias < 0 || dias > RECUP_AVISO_DIAS) continue; // ya caducó (otra cosa) o aún lejos
    out.push({
      id: `recup-${r.id}`,
      categoria: 'RECUPERACION',
      urgencia: Math.min(90, 90 - dias * 5), // hoy=90 … 7 d=55
      titulo: dias <= 0 ? 'Recuperación caduca hoy' : `Recuperación caduca en ${plural(dias, 'día', 'días')}`,
      detalle: `${nombreSocia(r.socioId)} tiene una clase pendiente de recuperar${r.motivo ? ` · ${r.motivo}` : ''}.`,
      socioId: r.socioId,
      href: `/clientas/${r.socioId}`,
      cta: 'Ver socia',
    });
  }
  return out;
}

// 2 · Recibos PENDIENTES (respetando la excepción SIN_RECORDATORIO). Un solo
// recibo → item con nombre; varios → un item agregado para no inundar la bandeja.
function cobrosPendientes(e: EntradaBandeja, nombreSocia: (id: string | null) => string): ItemBandeja[] {
  const exentas = sociosConExcepcion(e.excepciones, 'SIN_RECORDATORIO');
  const pend = e.recibos.filter(r => r.estado === 'PENDIENTE' && !(r.socioId && exentas.has(r.socioId)));
  if (pend.length === 0) return [];

  // dias negativo = vencido; urgencia sube con lo vencido, tope 88 (por debajo de una avería inminente).
  const urg = (dias: number) => (dias < 0 ? Math.min(88, 60 + -dias * 2) : 44);

  if (pend.length === 1) {
    const r = pend[0];
    const dias = diasHasta(r.fechaVencimiento, e.ahoraMs);
    return [{
      id: `cobro-${r.id}`,
      categoria: 'COBRO',
      urgencia: urg(dias),
      titulo: dias < 0 ? 'Cobro vencido' : 'Cobro pendiente',
      detalle: `${nombreSocia(r.socioId)} · ${r.concepto} · ${euro(r.importe)}`
        + (dias < 0 ? ` · vencido hace ${plural(-dias, 'día', 'días')}` : ''),
      socioId: r.socioId,
      href: '/cobros',
      cta: 'Ir a cobros',
    }];
  }

  const total = pend.reduce((a, r) => a + r.importe, 0);
  const masVencido = Math.min(...pend.map(r => diasHasta(r.fechaVencimiento, e.ahoraMs)));
  return [{
    id: 'cobro-lote',
    categoria: 'COBRO',
    urgencia: urg(masVencido),
    titulo: `${pend.length} cobros pendientes`,
    detalle: `${euro(total)} en total${masVencido < 0 ? `, el más antiguo vencido hace ${plural(-masVencido, 'día', 'días')}` : ''}.`,
    socioId: null,
    href: '/cobros',
    cta: 'Ir a cobros',
  }];
}

// 3 · Overflow por avería: sesión en las próximas 72 h donde las reservas
// confirmadas superan el aforo efectivo (una máquina averiada bajó la capacidad
// por debajo de lo ya reservado). Decisión: a quién recolocar. Nunca auto-cancela.
function averiaOverflow(e: EntradaBandeja, nombreSala: (id: string) => string): ItemBandeja[] {
  const out: ItemBandeja[] = [];
  const finVentana = e.ahoraMs + AVERIA_HORIZONTE_MS;
  for (const s of e.sesiones) {
    if (s.cancelada) continue;
    const iniMs = Date.parse(s.inicio);
    if (Number.isNaN(iniMs) || iniMs < e.ahoraMs || iniMs > finVentana) continue;
    const efectivo = aforoEfectivoSesion(s.aforoMaximo, s.salaId, s.inicio, s.fin, e.bloqueosMaquina);
    if (efectivo >= s.aforoMaximo) continue; // sin avería que afecte a esta sesión
    const confirmadas = e.reservas.filter(r => r.sesionId === s.id && r.estado === 'CONFIRMADA').length;
    if (confirmadas <= efectivo) continue; // cabe todo el mundo
    const sobra = confirmadas - efectivo;
    const horas = (iniMs - e.ahoraMs) / 3_600_000;
    out.push({
      id: `averia-${s.id}`,
      categoria: 'AVERIA',
      urgencia: Math.max(72, 100 - horas * 0.4), // inminente y no cabe → arriba del todo
      titulo: `Avería: ${plural(sobra, 'reserva sin sitio', 'reservas sin sitio')}`,
      detalle: `${nombreSala(s.salaId)} · ${fechaHoraCorta(s.inicio)} — caben ${efectivo}, hay ${confirmadas} confirmadas.`,
      socioId: null,
      href: '/calendario',
      cta: 'Ver calendario',
    });
  }
  return out;
}

// 4 · Plaza fija sin clase: una plaza ACTIVA cuya socia no tiene NINGUNA reserva
// materializada (id 'res-pf-') futura → el cron no pudo colocarla (aforo lleno o
// sin sesión). Conservador: sin re-derivar el emparejamiento de slot (eso vive en
// SQL), así que una socia con varias plazas se da por colocada si tiene alguna.
function plazasSinClase(e: EntradaBandeja, nombreSocia: (id: string | null) => string): ItemBandeja[] {
  const sesionById = new Map(e.sesiones.map(s => [s.id, s]));
  const conPlazaFutura = new Set<string>();
  for (const r of e.reservas) {
    if (r.estado !== 'CONFIRMADA' || !r.id.startsWith('res-pf-')) continue;
    const s = sesionById.get(r.sesionId);
    if (!s || s.cancelada || Date.parse(s.inicio) <= e.ahoraMs) continue;
    conPlazaFutura.add(r.socioId);
  }

  const out: ItemBandeja[] = [];
  for (const p of e.plazasFijas) {
    if (p.estado !== 'ACTIVA') continue;
    if (diasHasta(p.vigenciaDesde, e.ahoraMs) > 0) continue;                 // aún no empieza
    if (p.vigenciaHasta && diasHasta(p.vigenciaHasta, e.ahoraMs) < 0) continue; // ya terminó
    if (e.ahoraMs - Date.parse(p.creadaEn) < PLAZA_GRACIA_MS) continue;      // el cron aún no ha corrido
    if (conPlazaFutura.has(p.socioId)) continue;                            // sí se materializó
    out.push({
      id: `plaza-${p.id}`,
      categoria: 'PLAZA',
      urgencia: 66,
      titulo: 'Plaza fija sin clase',
      detalle: `${nombreSocia(p.socioId)} tiene plaza fija pero no se le ha asignado clase las próximas semanas (¿aforo lleno?).`,
      socioId: p.socioId,
      href: `/clientas/${p.socioId}`,
      cta: 'Ver socia',
    });
  }
  return out;
}
