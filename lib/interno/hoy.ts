// ─────────────────────────────────────────────────────────────────────────────
// /interno → «Hoy»: qué te espera hoy, cómo va el negocio y qué estudios
// miraría. Lógica pura y client-safe (imports relativos con extensión: la
// ejecuta `node --test`); la lectura vive en app/api/interno/hoy/route.ts.
//
// Las dos reglas que sostienen la pantalla (decisión del fundador, 16-oct-2026):
//   · Ninguna tarea inventada. Cada una sale de una fuente que ya tiene su
//     pantalla (Facturación, Denuncias, Llamadas, Apps, Crecimiento, Estudios)
//     y lleva a ella. Si no hay nada, se dice; si una fuente no se pudo leer,
//     también: «nada pendiente» solo vale para lo que se ha podido mirar.
//   · Ningún número sin procedencia. Cada cifra dice de dónde sale, y si su
//     fuente falla o no tienes permiso, sale «—» con el motivo, nunca un 0
//     (mismo criterio que tenía el Resumen; ver la cabecera de
//     app/api/interno/kpis/route.ts).
// ─────────────────────────────────────────────────────────────────────────────
import type Stripe from 'stripe';
import { eurosAlMes } from './facturacion-real.ts';
import { estadoGratis, LIMITE_ALUMNAS, LIMITE_RESERVAS_MES, type EstadoGratis, type UsoGratis } from '../billing/plan-gratis.ts';
import { PLAN_INFO, type Plan } from '../billing/entitlements.ts';
import type { EstadoApp } from '../app-nativa/pedir-app.ts';

// ── Tareas ──────────────────────────────────────────────────────────────────

/** El tipo de tarea, en el ORDEN en que se enseñan: lo que cuesta dejarlo primero. */
export const TIPOS_TAREA = [
  'impago', // dinero que no entra
  'descuadre', // damos acceso sin que Stripe lo respalde (o al revés)
  'denuncias', // App Store 1.2: la app de los estudios depende de que se modere
  'apps', // una app de estudio esperando a una persona
  'llamadas', // un estudio nuevo pidió que le llamen
  'altas', // altas que se quedaron a medias
  'sin-reservas', // un cliente de pago que ha dejado de usarlo
] as const;
export type TipoTarea = (typeof TIPOS_TAREA)[number];

export type Tono = 'rojo' | 'ambar' | 'gris';

export interface Tarea {
  tipo: TipoTarea;
  tono: Tono;
  titulo: string;
  porque: string;
  boton: string;
  /** Dónde se resuelve. También es la sección del menú cuyo contador suma `n`. */
  href: string;
  /** Cuántas cosas agrupa (para el contador del menú). */
  n: number;
}

export interface FuentesTareas {
  /** `null` = sin permiso o sin leer (lo dice `noLeidos`/`sinPermiso`). */
  facturacion: {
    impagos: { nombre: string }[];
    descuadres: { nombre: string; motivo: string | null }[];
  } | null;
  denuncias: { n: number; masAntigua: string | null } | null;
  llamadas: { n: number; masAntigua: string | null } | null;
  /** Solo las que esperan a una persona (ver `appEsperaAPersona`). */
  apps: { estudio: string; estado: EstadoApp; sinHueco: boolean }[] | null;
  altas: { n: number; fallidas: number; masAntigua: string | null } | null;
  sinReservas: { id: string; nombre: string; semanaAnterior: number | null }[] | null;
}

const MS_HORA = 3_600_000;

/** «hace 9 h», «hace 2 días»: lo que lleva esperando. */
export function haceCuanto(iso: string, ahora: Date): string {
  const horas = Math.max(0, Math.floor((ahora.getTime() - Date.parse(iso)) / MS_HORA));
  if (horas < 1) return 'hace menos de una hora';
  if (horas < 48) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} días`;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Los nombres, para una frase: «A», «A y B», «A, B y 2 más». */
export function listaNombres(nombres: string[], max = 2): string {
  if (nombres.length <= 1) return nombres[0] ?? '';
  if (nombres.length <= max) return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  return `${nombres.slice(0, max).join(', ')} y ${nombres.length - max} más`;
}

/**
 * ¿Espera esta app a una persona? La automatización (workflow «Apps de estudio ·
 * automático») hace sola todo lo de una app con hueco del lote salvo enviarla a
 * revisión; una pedida sin hueco hay que crearla a mano en App Store Connect.
 */
export function appEsperaAPersona(a: { estado: EstadoApp; sinHueco: boolean }): boolean {
  return a.estado === 'EN_PRUEBAS' || (a.estado === 'PEDIDA' && a.sinHueco);
}

/** Las tareas de hoy, ya ordenadas. Una por tipo como mucho: el número va dentro. */
export function tareasDeHoy(f: FuentesTareas, ahora: Date): Tarea[] {
  const out: Tarea[] = [];

  const impagos = f.facturacion?.impagos ?? [];
  if (impagos.length > 0) {
    const uno = impagos.length === 1;
    out.push({
      tipo: 'impago', tono: 'rojo', n: impagos.length, href: '/interno/facturacion',
      titulo: uno ? `${impagos[0].nombre} no ha pagado su plan` : `${impagos.length} estudios no han pagado su plan`,
      porque: `${uno ? 'Stripe tiene su suscripción' : `Stripe tiene sus suscripciones (${listaNombres(impagos.map(i => i.nombre))})`} como impagada: ese dinero no está entrando.`,
      boton: uno ? 'Ver su cobro' : 'Ver sus cobros',
    });
  }

  const descuadres = f.facturacion?.descuadres ?? [];
  if (descuadres.length > 0) {
    const primero = descuadres[0];
    out.push({
      tipo: 'descuadre', tono: 'rojo', n: descuadres.length, href: '/interno/facturacion',
      titulo: `${descuadres.length} ${plural(descuadres.length, 'cuenta no cuadra', 'cuentas no cuadran')} con Stripe`,
      porque: `${primero.nombre}${primero.motivo ? `: ${primero.motivo.charAt(0).toLowerCase()}${primero.motivo.slice(1)}` : ''}. O es una cortesía o es un cobro que se ha perdido.`,
      boton: plural(descuadres.length, 'Revisarla', 'Revisarlas'),
    });
  }

  if (f.denuncias && f.denuncias.n > 0) {
    const n = f.denuncias.n;
    out.push({
      tipo: 'denuncias', tono: 'rojo', n, href: '/interno/denuncias',
      titulo: `${n} ${plural(n, 'denuncia', 'denuncias')} de la app de los estudios sin revisar`,
      porque: `Te ${plural(n, 'toca', 'tocan')} a ti: ${plural(n, 'va', 'van')} contra el estudio o el estudio no ${plural(n, 'la', 'las')} revisó en 24 h. Apple exige actuar sobre lo denunciado (App Store 1.2).${f.denuncias.masAntigua ? ` La más antigua llegó ${haceCuanto(f.denuncias.masAntigua, ahora)}.` : ''}`,
      boton: plural(n, 'Revisarla', 'Revisarlas'),
    });
  }

  const apps = (f.apps ?? []).filter(appEsperaAPersona);
  if (apps.length > 0) {
    const aRevision = apps.filter(a => a.estado === 'EN_PRUEBAS');
    const aMano = apps.filter(a => a.estado === 'PEDIDA');
    const partes: string[] = [];
    if (aRevision.length > 0) {
      partes.push(`${listaNombres(aRevision.map(a => a.estudio))} ya ${plural(aRevision.length, 'está', 'están')} en TestFlight: enviar${plural(aRevision.length, 'la', 'las')} a revisión desde App Store Connect es lo único que no va solo.`);
    }
    if (aMano.length > 0) {
      partes.push(`${listaNombres(aMano.map(a => a.estudio))} no ${plural(aMano.length, 'tiene', 'tienen')} hueco en el lote: hay que crear${plural(aMano.length, 'la', 'las')} a mano en App Store Connect.`);
    }
    out.push({
      tipo: 'apps', tono: 'ambar', n: apps.length, href: '/interno/apps-estudio',
      titulo: apps.length === 1
        ? `La app de ${apps[0].estudio} espera que hagas algo`
        : `${apps.length} apps de estudio esperan que hagas algo`,
      porque: partes.join(' '),
      boton: 'Abrir la cola',
    });
  }

  if (f.llamadas && f.llamadas.n > 0) {
    const n = f.llamadas.n;
    out.push({
      tipo: 'llamadas', tono: 'ambar', n, href: '/interno/llamadas',
      titulo: `${n} ${plural(n, 'estudio nuevo pidió', 'estudios nuevos pidieron')} que le${plural(n, '', 's')} llames`,
      porque: `${plural(n, 'Eligió', 'Eligieron')} «Prefiero que me llamen» al empezar.${f.llamadas.masAntigua ? ` ${plural(n, 'Lo pidió', 'La más antigua la pidió')} ${haceCuanto(f.llamadas.masAntigua, ahora)}.` : ''}`,
      boton: 'Ver teléfonos',
    });
  }

  if (f.altas && f.altas.n > 0) {
    const { n, fallidas } = f.altas;
    out.push({
      tipo: 'altas', tono: 'gris', n, href: '/interno/crecimiento',
      titulo: `${n} ${plural(n, 'alta se quedó', 'altas se quedaron')} a medias esta semana`,
      porque: `Empezaron a darse de alta y no llegaron a tener su estudio${fallidas > 0 ? ` (${fallidas} porque falló al montarlo)` : ''}.${f.altas.masAntigua ? ` La más antigua, ${haceCuanto(f.altas.masAntigua, ahora)}.` : ''} A las 24 h les llega un correo solo.`,
      boton: 'Ver quiénes',
    });
  }

  const sinReservas = f.sinReservas ?? [];
  if (sinReservas.length > 0) {
    const uno = sinReservas.length === 1;
    const antes = uno ? sinReservas[0].semanaAnterior : null;
    out.push({
      tipo: 'sin-reservas', tono: 'gris', n: sinReservas.length,
      href: uno ? `/interno/estudios/${sinReservas[0].id}` : '/interno/estudios',
      titulo: uno
        ? `${sinReservas[0].nombre} lleva 7 días sin reservas`
        : `${sinReservas.length} estudios de pago llevan 7 días sin reservas`,
      porque: `${uno ? (antes !== null && antes > 0 ? `La semana anterior tuvo ${antes}. ` : '') : `${listaNombres(sinReservas.map(s => s.nombre))}. `}Paga y no lo está usando: puede que algo se haya roto o que se esté yendo.`,
      boton: uno ? 'Ver su ficha' : 'Ver cuáles',
    });
  }

  return out.sort((a, b) => TIPOS_TAREA.indexOf(a.tipo) - TIPOS_TAREA.indexOf(b.tipo));
}

/** El contador de cada sección del menú: lo que suman sus tareas. */
export function pendientesPorSeccion(tareas: readonly Tarea[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tareas) {
    // Una tarea que lleva a la ficha de un estudio cuenta en «Estudios».
    const seccion = t.href.startsWith('/interno/estudios/') ? '/interno/estudios' : t.href;
    out[seccion] = (out[seccion] ?? 0) + t.n;
  }
  return out;
}

// ── Cifras ──────────────────────────────────────────────────────────────────

export interface Cifra {
  id: 'mrr' | 'pagan' | 'actividad' | 'reservas';
  titulo: string;
  /** `null` = no se sabe: la pantalla pinta «—» y `motivo`. Nunca un 0 de relleno. */
  valor: string | null;
  /** El cambio frente al periodo anterior. `sube: null` = ni sube ni baja. */
  cambio: { texto: string; sube: boolean | null } | null;
  fuente: string;
  motivo: string | null;
}

// `useGrouping: 'always'`: en es-ES, Intl no pone el punto de miles a los
// números de cuatro cifras («1247 €»), y en una cifra de dinero se lee mal.
const NUMERO = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' as unknown as boolean });
export const miles = (n: number) => NUMERO.format(n);
export const eur = (n: number) => `${miles(n)} €`;
const conSigno = (n: number, f: (x: number) => string = String) => (n > 0 ? `+${f(n)}` : n < 0 ? `−${f(-n)}` : f(0));

/**
 * Altas y bajas de suscripciones de PLATAFORMA en los últimos `dias`, de
 * Stripe. Alta = se creó en la ventana y hoy cobra; baja = terminó en la
 * ventana. No mide subidas ni bajadas de precio de una misma suscripción: por
 * eso la pantalla dice «altas − bajas» y no «crecimiento del MRR».
 */
export function movimientoSuscripciones(subs: readonly Stripe.Subscription[], ahora: Date, dias = 30) {
  const desde = ahora.getTime() / 1000 - dias * 86_400;
  let altas = 0; let eurosAltas = 0; let bajas = 0; let eurosBajas = 0;
  for (const s of subs) {
    if (s.status === 'active' && s.created >= desde) { altas++; eurosAltas += eurosAlMes(s); }
    const fin = s.ended_at ?? (s.status === 'canceled' ? s.canceled_at : null);
    if (s.status === 'canceled' && fin && fin >= desde) { bajas++; eurosBajas += eurosAlMes(s); }
  }
  const r = (x: number) => Math.round(x * 100) / 100;
  return { altas, bajas, eurosAltas: r(eurosAltas), eurosBajas: r(eurosBajas) };
}

export type Movimiento = ReturnType<typeof movimientoSuscripciones>;

export interface EntradaCifras {
  /** `null` + motivo si no hay Stripe o no tienes `billing.read`. */
  dinero: { mrrEuros: number; pagando: number; movimiento: Movimiento } | { motivo: string };
  /** Estudios con alguna reserva hecha en los últimos 30 días y en los 30 anteriores. */
  actividad: { ahora: number; antes: number } | { motivo: string };
  reservas: { ultimos7: number; anteriores7: number } | { motivo: string };
}

export function cifrasDelNegocio(e: EntradaCifras): Cifra[] {
  const cifras: Cifra[] = [];
  if ('motivo' in e.dinero) {
    const motivo = e.dinero.motivo;
    cifras.push(
      { id: 'mrr', titulo: 'Lo que cobramos al mes', valor: null, cambio: null, fuente: 'Stripe', motivo },
      { id: 'pagan', titulo: 'Estudios que pagan', valor: null, cambio: null, fuente: 'Stripe', motivo },
    );
  } else {
    const { mrrEuros, pagando, movimiento: m } = e.dinero;
    const neto = Math.round((m.eurosAltas - m.eurosBajas) * 100) / 100;
    cifras.push({
      id: 'mrr', titulo: 'Lo que cobramos al mes', valor: eur(mrrEuros), motivo: null,
      fuente: 'Stripe · altas − bajas en 30 días',
      cambio: m.altas === 0 && m.bajas === 0
        ? { texto: 'Sin altas ni bajas en 30 días', sube: null }
        : { texto: `${conSigno(neto, eur)} en 30 días`, sube: neto === 0 ? null : neto > 0 },
    });
    const partes = [m.altas > 0 ? `+${m.altas} ${plural(m.altas, 'alta', 'altas')}` : null, m.bajas > 0 ? `−${m.bajas} ${plural(m.bajas, 'baja', 'bajas')}` : null].filter(Boolean);
    cifras.push({
      id: 'pagan', titulo: 'Estudios que pagan', valor: String(pagando), motivo: null, fuente: 'Stripe',
      cambio: partes.length === 0
        ? { texto: 'Sin altas ni bajas en 30 días', sube: null }
        : { texto: `${partes.join(' · ')} en 30 días`, sube: m.altas === m.bajas ? null : m.altas > m.bajas },
    });
  }

  if ('motivo' in e.actividad) {
    cifras.push({ id: 'actividad', titulo: 'Estudios usándolo', valor: null, cambio: null, fuente: 'Reservas de 30 días', motivo: e.actividad.motivo });
  } else {
    const d = e.actividad.ahora - e.actividad.antes;
    cifras.push({
      id: 'actividad', titulo: 'Estudios usándolo', valor: String(e.actividad.ahora), motivo: null,
      fuente: 'Con alguna reserva en 30 días',
      cambio: { texto: d === 0 ? 'Igual que los 30 días anteriores' : `${conSigno(d)} frente a los 30 días anteriores`, sube: d === 0 ? null : d > 0 },
    });
  }

  if ('motivo' in e.reservas) {
    cifras.push({ id: 'reservas', titulo: 'Reservas (7 días)', valor: null, cambio: null, fuente: 'Reservas hechas', motivo: e.reservas.motivo });
  } else {
    const { ultimos7, anteriores7 } = e.reservas;
    let cambio: Cifra['cambio'];
    if (anteriores7 === 0) cambio = { texto: ultimos7 === 0 ? 'Ninguna tampoco la semana anterior' : 'Ninguna la semana anterior', sube: ultimos7 > 0 ? true : null };
    else {
      const pct = Math.round(((ultimos7 - anteriores7) / anteriores7) * 100);
      cambio = { texto: pct === 0 ? 'Igual que la semana anterior' : `${conSigno(pct)} % que la semana anterior`, sube: pct === 0 ? null : pct > 0 };
    }
    cifras.push({
      id: 'reservas', titulo: 'Reservas (7 días)', valor: miles(ultimos7), motivo: null,
      fuente: 'Reservas hechas en toda la plataforma', cambio,
    });
  }
  return cifras;
}

// ── Plan gratis, por dueña ─────────────────────────────────────────────────

export interface FilaUsoGratis {
  studioId: string;
  ownerId: string | null;
  alumnasActivas: number | null;
  reservas30Dias: number | null;
  excedidoDesde: string | null;
  medidoEn: string | null;
}

/**
 * El estado del plan gratis de cada estudio, con el uso SUMADO de todos los
 * estudios gratis de su dueña (la misma regla que el gate, uso-gratis-servidor:
 * trocear un estudio no lo hace gratis). Un grupo con algún estudio sin medir
 * queda SIN_MEDIR, salvo que su margen ya se acabara. No mide: lee lo guardado.
 */
export function estadosGratisPorEstudio(filas: readonly FilaUsoGratis[], hoy: string): Map<string, EstadoGratis & { estudiosDelGrupo: number }> {
  const grupos = new Map<string, FilaUsoGratis[]>();
  for (const f of filas) {
    const k = f.ownerId ?? `estudio:${f.studioId}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const out = new Map<string, EstadoGratis & { estudiosDelGrupo: number }>();
  for (const g of grupos.values()) {
    const excedidoDesde = g.reduce<string | null>((m, f) => (f.excedidoDesde && (!m || f.excedidoDesde < m) ? f.excedidoDesde : m), null);
    const medidos = g.every(f => f.medidoEn && f.alumnasActivas !== null && f.reservas30Dias !== null);
    const uso: UsoGratis | null = medidos
      ? g.reduce((t, f) => ({ alumnasActivas: t.alumnasActivas + f.alumnasActivas!, reservas30Dias: t.reservas30Dias + f.reservas30Dias! }), { alumnasActivas: 0, reservas30Dias: 0 })
      : null;
    const estado = { ...estadoGratis({ uso, excedidoDesde, hoy }), estudiosDelGrupo: g.length };
    for (const f of g) out.set(f.studioId, estado);
  }
  return out;
}

// ── Estudios que miraría hoy ───────────────────────────────────────────────

export interface EstudioAMirar {
  id: string;
  nombre: string;
  plan: string;
  /** Qué le pasa, en dos palabras. */
  estado: string;
  tono: 'rojo' | 'ambar' | 'verde';
  /** El dato que lo sostiene («0 reservas en 7 días (antes 41)»). */
  uso: string;
}

export interface EntradaEstudioDePago {
  id: string; nombre: string; plan: string | null;
  impago: boolean;
  /** `null` = no se pudo leer. */
  reservas7d: number | null;
  semanaAnterior: number | null;
  /** El veredicto de salud (salud-estudio.ts) y su primer aviso. */
  nivel: 'bien' | 'atencion' | 'riesgo';
  primerAviso: string | null;
}

export interface EntradaEstudioGratis {
  id: string; nombre: string;
  estado: EstadoGratis & { estudiosDelGrupo: number };
}

export function nombrePlan(plan: string | null): string {
  return plan && plan in PLAN_INFO ? PLAN_INFO[plan as Plan].nombre : (plan ?? 'Sin plan');
}

const ORDEN_TONO = { rojo: 0, ambar: 1, verde: 2 } as const;

/**
 * Los clientes de pago (todos: son pocos y son los que importan) y los gratis
 * que se acercan al límite o lo han pasado, los peores primero.
 */
export function estudiosAMirar(pago: readonly EntradaEstudioDePago[], gratis: readonly EntradaEstudioGratis[], max = 8): EstudioAMirar[] {
  const filas: EstudioAMirar[] = [];
  for (const p of pago) {
    const uso = p.reservas7d === null
      ? 'Sin leer sus reservas'
      : `${p.reservas7d} ${plural(p.reservas7d, 'reserva', 'reservas')} en 7 días${p.semanaAnterior !== null ? ` (antes ${p.semanaAnterior})` : ''}`;
    let estado: string; let tono: EstudioAMirar['tono'];
    if (p.impago) { estado = 'Impago'; tono = 'rojo'; }
    else if (p.reservas7d === 0) { estado = 'Sin reservas 7 días'; tono = p.nivel === 'riesgo' ? 'rojo' : 'ambar'; }
    else if (p.nivel === 'riesgo') { estado = p.primerAviso ?? 'En riesgo'; tono = 'rojo'; }
    else if (p.nivel === 'atencion') { estado = p.primerAviso ?? 'Atención'; tono = 'ambar'; }
    else { estado = 'Bien'; tono = 'verde'; }
    filas.push({ id: p.id, nombre: p.nombre, plan: nombrePlan(p.plan), estado, tono, uso });
  }
  for (const g of gratis) {
    const e = g.estado;
    if (e.fase !== 'CERCA' && e.fase !== 'MARGEN' && e.fase !== 'CERRADO') continue;
    const grupo = e.estudiosDelGrupo > 1 ? ` · sumando sus ${e.estudiosDelGrupo} estudios` : '';
    const uso = e.uso
      ? `${e.uso.reservas30Dias} de ${LIMITE_RESERVAS_MES} reservas · ${e.uso.alumnasActivas} de ${LIMITE_ALUMNAS} alumnas${grupo}`
      : 'Sin medir todavía';
    filas.push({
      id: g.id, nombre: g.nombre, plan: 'Founding Studio gratis', uso,
      estado: e.fase === 'CERRADO' ? 'Panel cerrado: tiene que elegir plan'
        : e.fase === 'MARGEN' ? `Pasó el límite · ${e.diasRestantes} ${plural(e.diasRestantes, 'día', 'días')} de margen`
        : 'Cerca del límite',
      tono: e.fase === 'CERCA' ? 'ambar' : 'rojo',
    });
  }
  return filas.sort((a, b) => ORDEN_TONO[a.tono] - ORDEN_TONO[b.tono]).slice(0, max);
}

// ── Lo que viaja a la pantalla ─────────────────────────────────────────────

export interface Hoy {
  tareas: Tarea[];
  /** Contador por sección del menú (href → n). */
  pendientes: Record<string, number>;
  cifras: Cifra[];
  /** `null` sin `studios.read`. */
  estudios: EstudioAMirar[] | null;
  /** Fuentes que fallaron al leerse: lo que digan las tareas no las incluye. */
  noLeidos: string[];
  /** Fuentes que no se miran por falta de permiso. */
  sinPermiso: string[];
}
