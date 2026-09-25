// Historial de cambios de dinero del estudio: de una fila del libro
// `auditoria_estudio` (migración 20260925152253) a una frase que la propietaria
// entienda —«Recepción cambió un recibo: Importe 85,00 € → 86,00 €»—.
//
// Puro, sin I/O: la vista lo llama y los tests lo cubren. Lo que NO hace es
// decidir qué se registra (eso es el trigger en la base de datos) ni quién lo ve
// (la RLS y `puedeVerAuditoriaFinanciera`).
//
// ⚠️ Solo describe lo que el libro guarda. En un UPDATE `antes`/`despues` llevan
// únicamente las columnas que cambiaron, y la fila se identifica por `contexto`
// (el concepto del recibo, el plan de la cuota…). Si una columna nueva aparece en
// el libro sin etiqueta aquí, se enseña con su nombre en claro en vez de
// esconderla: un cambio de dinero que no se lee no es una auditoría.

import { capitalizarPrimera, formatEuro, fechaCortaEstudio, horaEstudio, TZ_ESTUDIO } from './utils.ts';

export type OperacionAuditoria = 'INSERT' | 'UPDATE' | 'DELETE';

/** La fila tal como llega de PostgREST. */
export interface FilaAuditoria {
  id: number;
  studio_id: string;
  ocurrido_en: string;
  actor_uid: string;
  actor_rol: string;
  origen: string;
  tabla: string;
  fila_id: string;
  operacion: string;
  socio_id: string | null;
  cambios: string[] | null;
  contexto: Record<string, unknown> | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}

export interface EntradaAuditoria {
  id: number;
  ocurridoEn: string;
  actorUid: string;
  actorRol: string;
  origen: 'panel' | 'servidor';
  tabla: string;
  filaId: string;
  operacion: OperacionAuditoria;
  socioId: string | null;
  cambios: string[];
  contexto: Record<string, unknown>;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
}

const OPERACIONES: readonly OperacionAuditoria[] = ['INSERT', 'UPDATE', 'DELETE'];

/** null si la fila no es válida: una fila rara se descarta, no rompe la lista. */
export function entradaDeFila(f: FilaAuditoria): EntradaAuditoria | null {
  const operacion = OPERACIONES.find(o => o === f.operacion);
  if (!operacion || typeof f.id !== 'number' || !f.ocurrido_en || !f.tabla) return null;
  return {
    id: f.id,
    ocurridoEn: f.ocurrido_en,
    actorUid: f.actor_uid,
    actorRol: f.actor_rol,
    origen: f.origen === 'servidor' ? 'servidor' : 'panel',
    tabla: f.tabla,
    filaId: f.fila_id,
    operacion,
    socioId: f.socio_id,
    cambios: Array.isArray(f.cambios) ? f.cambios : [],
    contexto: f.contexto ?? {},
    antes: f.antes ?? {},
    despues: f.despues ?? {},
  };
}

// ── Qué es cada tabla ────────────────────────────────────────────────────────

interface InfoTabla {
  /** «un recibo»: va tras el verbo («Cambió un recibo»). */
  uno: string;
  /** Etiqueta corta para el filtro. */
  etiqueta: string;
  /**
   * ¿Se escribe desde el panel con la sesión de una persona del equipo? Si NO
   * (todo pasa por una ruta de servidor), el trigger solo recoge lo que alguien
   * escriba a mano contra la API, y ofrecer un filtro o prometer «queda aquí» sería
   * mentir: `ingresos_manuales` va por `/api/ingresos-manuales` con service-role.
   */
  desdeElPanel: boolean;
  /** Columnas que se enseñan al crear o borrar la fila, en este orden. */
  principales: readonly string[];
}

export const TABLAS_AUDITADAS: Readonly<Record<string, InfoTabla>> = {
  recibos: { uno: 'un recibo', etiqueta: 'Recibos', desdeElPanel: true, principales: ['concepto', 'importe', 'estado', 'fecha_vencimiento', 'metodo_cobro'] },
  suscripciones: { uno: 'una cuota o bono', etiqueta: 'Cuotas y bonos', desdeElPanel: true, principales: ['plan_id', 'estado', 'sesiones_restantes', 'fecha_inicio', 'fecha_fin'] },
  ingresos_manuales: { uno: 'un ingreso manual', etiqueta: 'Ingresos manuales', desdeElPanel: false, principales: ['concepto', 'fecha', 'base_imponible', 'total'] },
  planes_tarifa: { uno: 'un plan', etiqueta: 'Planes', desdeElPanel: true, principales: ['nombre', 'precio', 'tipo', 'sesiones', 'activo'] },
};

type TipoValor = 'euros' | 'fecha' | 'fechahora' | 'estado' | 'si-no' | 'texto';

// Etiqueta y tipo de las columnas conocidas. El ORDEN de este objeto es el orden
// en el que se enseñan las líneas de un cambio.
const CAMPOS: Readonly<Record<string, { etiqueta: string; tipo: TipoValor }>> = {
  concepto: { etiqueta: 'Concepto', tipo: 'texto' },
  nombre: { etiqueta: 'Nombre', tipo: 'texto' },
  plan_id: { etiqueta: 'Plan', tipo: 'texto' },
  importe: { etiqueta: 'Importe', tipo: 'euros' },
  importe_devuelto: { etiqueta: 'Importe devuelto', tipo: 'euros' },
  precio: { etiqueta: 'Precio', tipo: 'euros' },
  base_imponible: { etiqueta: 'Base imponible', tipo: 'euros' },
  cuota_iva: { etiqueta: 'IVA', tipo: 'euros' },
  total: { etiqueta: 'Total', tipo: 'euros' },
  estado: { etiqueta: 'Estado', tipo: 'estado' },
  metodo_cobro: { etiqueta: 'Método de cobro', tipo: 'estado' },
  sesiones_restantes: { etiqueta: 'Sesiones restantes', tipo: 'texto' },
  sesiones: { etiqueta: 'Sesiones', tipo: 'texto' },
  tipo: { etiqueta: 'Tipo', tipo: 'estado' },
  activo: { etiqueta: 'Activo', tipo: 'si-no' },
  fecha: { etiqueta: 'Fecha', tipo: 'fecha' },
  fecha_inicio: { etiqueta: 'Inicio', tipo: 'fecha' },
  fecha_fin: { etiqueta: 'Fin', tipo: 'fecha' },
  fecha_vencimiento: { etiqueta: 'Vencimiento', tipo: 'fecha' },
  fecha_cobro: { etiqueta: 'Fecha de cobro', tipo: 'fecha' },
  fecha_devolucion: { etiqueta: 'Fecha de devolución', tipo: 'fecha' },
  proximo_reintento: { etiqueta: 'Próximo reintento', tipo: 'fechahora' },
  intentos_reintento: { etiqueta: 'Reintentos', tipo: 'texto' },
  baja_al_vencer: { etiqueta: 'Baja al vencer', tipo: 'si-no' },
};

const ORDEN_CAMPOS = Object.keys(CAMPOS);

// ── Quién ────────────────────────────────────────────────────────────────────

const ROLES: Readonly<Record<string, string>> = {
  PROPIETARIO: 'Propietaria',
  MANAGER: 'Gerencia',
  RECEPCION: 'Recepción',
  INSTRUCTOR: 'Instructora',
};

/**
 * «Lucía · Recepción», o «Propietaria» si no se sabe el nombre. El libro guarda
 * el uid y el rol, NO el nombre (no se podría suprimir ni rectificar): lo pone
 * quien pinta, con la plantilla del equipo.
 */
export function quienDe(e: Pick<EntradaAuditoria, 'actorRol'>, nombre?: string | null): string {
  const rol = ROLES[e.actorRol] ?? capitalizarPrimera(e.actorRol.toLowerCase());
  const limpio = nombre?.trim();
  return limpio ? `${limpio} · ${rol}` : rol;
}

// ── Cuándo ───────────────────────────────────────────────────────────────────

function anioEstudio(d: Date): string {
  return d.toLocaleDateString('es-ES', { year: 'numeric', timeZone: TZ_ESTUDIO });
}

/** «25 de septiembre · 14:32» en hora del estudio; con el año si no es el actual. */
export function cuandoDe(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const anio = anioEstudio(d) === anioEstudio(ahora) ? '' : ` de ${anioEstudio(d)}`;
  return `${fechaCortaEstudio(d)}${anio} · ${horaEstudio(d)}`;
}

// ── Valores ──────────────────────────────────────────────────────────────────

const SIN_VALOR = '—';
const MAX_TEXTO = 80;

/** 'YYYY-MM-DD' → «3 nov 2026». Sin pasar por el huso del navegador. */
function fechaSola(v: string): string {
  const d = new Date(`${v.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatearValor(campo: string, valor: unknown, ahora: Date = new Date()): string {
  if (valor === null || valor === undefined || valor === '') return SIN_VALOR;
  const tipo = CAMPOS[campo]?.tipo ?? 'texto';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (tipo === 'euros') {
    const n = typeof valor === 'number' ? valor : Number(valor);
    return Number.isFinite(n) ? formatEuro(n) : String(valor);
  }
  if (typeof valor === 'object') return SIN_VALOR;
  const texto = String(valor);
  if (tipo === 'fecha') return fechaSola(texto);
  if (tipo === 'fechahora') return cuandoDe(texto, ahora);
  if (tipo === 'estado') return capitalizarPrimera(texto.toLowerCase().replace(/_/g, ' '));
  return texto.length > MAX_TEXTO ? `${texto.slice(0, MAX_TEXTO - 1)}…` : texto;
}

function etiquetaCampo(campo: string): string {
  return CAMPOS[campo]?.etiqueta ?? capitalizarPrimera(campo.replace(/_/g, ' '));
}

function porOrdenDeCampos(a: string, b: string): number {
  const ia = ORDEN_CAMPOS.indexOf(a);
  const ib = ORDEN_CAMPOS.indexOf(b);
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
}

// ── La entrada descrita ──────────────────────────────────────────────────────

export interface OpcionesDescripcion {
  ahora?: Date;
  /** Para pintar «Mensual Ilimitado» en vez de `plan-4`. */
  nombreDePlan?: (id: string) => string | null | undefined;
  /** Nombre de quien actuó, por su uid de cuenta (la plantilla del equipo). */
  nombreDeActor?: (uid: string) => string | null | undefined;
}

export interface LineaCambio {
  campo: string;
  /** Presente en un cambio y en una baja. */
  antes?: string;
  /** Presente en un cambio y en un alta. */
  despues?: string;
}

export interface EntradaDescrita {
  id: number;
  tabla: string;
  socioId: string | null;
  cuando: string;
  quien: string;
  /** «Cambió un recibo». */
  titulo: string;
  /** Qué fila era, si el libro lo sabe: «Mensual Ilimitado — Jul 2026». */
  objeto: string | null;
  lineas: LineaCambio[];
  /** Un descuento o devolución de UNA sesión de un bono: ruido diario, no un ajuste. */
  rutina: boolean;
}

const VERBOS: Readonly<Record<OperacionAuditoria, string>> = { INSERT: 'Creó', UPDATE: 'Cambió', DELETE: 'Eliminó' };

function objetoDe(e: EntradaAuditoria, o: OpcionesDescripcion): string | null {
  const ctx = e.contexto;
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  if (e.tabla === 'suscripciones') {
    const plan = texto(ctx.plan_id) ?? texto(e.despues.plan_id) ?? texto(e.antes.plan_id);
    return plan ? (o.nombreDePlan?.(plan) ?? null) : null;
  }
  return texto(ctx.concepto) ?? texto(ctx.nombre);
}

/** Descuento o devolución de una sola sesión: solo cambia `sesiones_restantes`, ±1. */
export function esRutina(e: EntradaAuditoria): boolean {
  if (e.tabla !== 'suscripciones' || e.operacion !== 'UPDATE') return false;
  if (e.cambios.length !== 1 || e.cambios[0] !== 'sesiones_restantes') return false;
  const antes = Number(e.antes.sesiones_restantes);
  const despues = Number(e.despues.sesiones_restantes);
  return Number.isFinite(antes) && Number.isFinite(despues) && Math.abs(despues - antes) === 1;
}

function lineasDe(e: EntradaAuditoria, o: OpcionesDescripcion): LineaCambio[] {
  const ahora = o.ahora ?? new Date();
  const valor = (campo: string, v: unknown) =>
    campo === 'plan_id' && typeof v === 'string' ? (o.nombreDePlan?.(v) ?? SIN_VALOR) : formatearValor(campo, v, ahora);

  if (e.operacion === 'UPDATE') {
    return [...e.cambios].sort(porOrdenDeCampos).map(campo => ({
      campo: etiquetaCampo(campo),
      antes: valor(campo, e.antes[campo]),
      despues: valor(campo, e.despues[campo]),
    }));
  }
  const fila = e.operacion === 'INSERT' ? e.despues : e.antes;
  const columnas = TABLAS_AUDITADAS[e.tabla]?.principales ?? Object.keys(fila).sort(porOrdenDeCampos);
  return columnas
    .filter(c => fila[c] !== undefined && fila[c] !== null && fila[c] !== '')
    .map(campo => {
      const v = valor(campo, fila[campo]);
      return e.operacion === 'INSERT' ? { campo: etiquetaCampo(campo), despues: v } : { campo: etiquetaCampo(campo), antes: v };
    });
}

export function describirEntrada(e: EntradaAuditoria, o: OpcionesDescripcion = {}): EntradaDescrita {
  const uno = TABLAS_AUDITADAS[e.tabla]?.uno ?? `un registro de ${e.tabla.replace(/_/g, ' ')}`;
  return {
    id: e.id,
    tabla: e.tabla,
    socioId: e.socioId,
    cuando: cuandoDe(e.ocurridoEn, o.ahora),
    quien: quienDe(e, o.nombreDeActor?.(e.actorUid)),
    titulo: `${VERBOS[e.operacion]} ${uno}`,
    objeto: objetoDe(e, o),
    lineas: lineasDe(e, o),
    rutina: esRutina(e),
  };
}
