// ─────────────────────────────────────────────────────────────────────────────
// Migración Mágica · CLASIFICADOR (puro, sin IA) — el núcleo determinista que
// convierte un archivo en un ArchivoAnalizado usando SOLO los mapeos por
// sinónimos de lib/csv. Client-safe (no importa el SDK de Anthropic), así que
// la demo pública de la landing puede correrlo EN EL NAVEGADOR sin login: el
// mismo código exacto que la migración real, sobre un archivo de ejemplo,
// habiendo subido cero datos.
//
// El analizador completo (lib/migracion/analizador.ts, server-only) reutiliza
// todo esto y añade el fallback de IA cuando el mapeo determinista no llega.
// ─────────────────────────────────────────────────────────────────────────────
import {
  parseCsv,
  autoMapear, autoMapearMembresia, autoMapearClase, autoMapearReserva, autoMapearCita,
  validarFilas, validarFilasMembresia, validarFilasClase, validarFilasReserva, validarFilasCita,
  CAMPOS_SOCIA, CAMPOS_MEMBRESIA, CAMPOS_CLASE, CAMPOS_RESERVA, CAMPOS_CITA,
} from '../csv.ts';

export type EntidadMigracion = 'socias' | 'membresias' | 'clases' | 'reservas' | 'citas';

// Orden de ejecución con dependencias: membresías/reservas/citas necesitan que
// las socias existan; las reservas necesitan las clases.
export const ORDEN_EJECUCION: EntidadMigracion[] = ['socias', 'clases', 'membresias', 'reservas', 'citas'];

export interface FilaValidadaComun {
  fila: number;
  datos: Record<string, unknown>;
  estado: 'ok' | 'error' | 'duplicada';
  motivo?: string;
}

interface DefEntidad {
  etiqueta: string;
  campos: { campo: string; etiqueta: string; obligatorio: boolean }[];
  mapear: (headers: string[]) => Record<string, number>;
  validar: (rows: string[][], mapeo: Record<string, number>) => FilaValidadaComun[];
}

// Registro uniforme de las 5 entidades. Los casts son seguros: los Record de
// mapeo de lib/csv son Record<CampoX, number> (subconjunto de string→number) y
// las Fila*Validada comparten la forma {fila, datos, estado, motivo}.
export const ENTIDADES: Record<EntidadMigracion, DefEntidad> = {
  socias: {
    etiqueta: 'Clientas',
    campos: CAMPOS_SOCIA,
    mapear: (h) => autoMapear(h) as Record<string, number>,
    validar: (r, m) => validarFilas(r, m as Parameters<typeof validarFilas>[1]) as unknown as FilaValidadaComun[],
  },
  membresias: {
    etiqueta: 'Bonos y membresías',
    campos: CAMPOS_MEMBRESIA,
    mapear: (h) => autoMapearMembresia(h) as Record<string, number>,
    validar: (r, m) => validarFilasMembresia(r, m as Parameters<typeof validarFilasMembresia>[1]) as unknown as FilaValidadaComun[],
  },
  clases: {
    etiqueta: 'Clases y horario',
    campos: CAMPOS_CLASE,
    mapear: (h) => autoMapearClase(h) as Record<string, number>,
    validar: (r, m) => validarFilasClase(r, m as Parameters<typeof validarFilasClase>[1]) as unknown as FilaValidadaComun[],
  },
  reservas: {
    etiqueta: 'Reservas',
    campos: CAMPOS_RESERVA,
    mapear: (h) => autoMapearReserva(h) as Record<string, number>,
    validar: (r, m) => validarFilasReserva(r, m as Parameters<typeof validarFilasReserva>[1]) as unknown as FilaValidadaComun[],
  },
  citas: {
    etiqueta: 'Citas',
    campos: CAMPOS_CITA,
    mapear: (h) => autoMapearCita(h) as Record<string, number>,
    validar: (r, m) => validarFilasCita(r, m as Parameters<typeof validarFilasCita>[1]) as unknown as FilaValidadaComun[],
  },
};

export interface ContextoEstudio {
  planes: string[];
  instructores: string[];
  salas: string[];
  servicios: string[];
}
export const CTX_VACIO: ContextoEstudio = { planes: [], instructores: [], salas: [], servicios: [] };

export interface ArchivoEntrada {
  nombre: string;
  contenido: string; // texto CSV (la UI convierte XLSX→CSV en el navegador)
}

export interface ArchivoAnalizado {
  nombre: string;
  entidad: EntidadMigracion | null; // null = sin clasificar (decide el humano)
  entidadEtiqueta: string | null;
  origen: 'auto' | 'ia' | null;
  confianza: number; // 0-1 (proporción de filas válidas del mapeo elegido)
  columnas: string[];
  mapeo: Record<string, number> | null;
  total: number;
  ok: number;
  duplicadas: number;
  errores: number;
  muestra: Record<string, unknown>[];
  cuarentena: { fila: number; motivo: string }[];
  avisos: string[];
}

export interface PlanMigracion {
  archivos: ArchivoAnalizado[];
  orden: EntidadMigracion[];
  avisos: string[];
}

export const UMBRAL_CONFIANZA = 0.8;
const MAX_CUARENTENA = 50;
const MAX_MUESTRA = 5;

export interface EvalMapeo {
  obligatoriosCubiertos: boolean;
  validadas: FilaValidadaComun[];
  tasaOk: number;
  columnasReconocidas: number;
}

export function evaluarMapeo(def: DefEntidad, headers: string[], rows: string[][], mapeo: Record<string, number>): EvalMapeo {
  const obligatoriosCubiertos = def.campos.filter(c => c.obligatorio).every(c => (mapeo[c.campo] ?? -1) !== -1);
  if (!obligatoriosCubiertos) {
    return { obligatoriosCubiertos, validadas: [], tasaOk: 0, columnasReconocidas: 0 };
  }
  const validadas = def.validar(rows, mapeo);
  const ok = validadas.filter(v => v.estado === 'ok').length;
  // "Columnas reconocidas" mide si las cabeceras hablan el idioma de la entidad
  // (señal de CLASIFICACIÓN); la tasa de filas válidas mide la CALIDAD (→
  // cuarentena) y no debe impedir clasificar un archivo claro pero sucio.
  const mapeadas = new Set(Object.values(mapeo).filter(i => i !== -1)).size;
  return {
    obligatoriosCubiertos,
    validadas,
    tasaOk: rows.length > 0 ? ok / rows.length : 0,
    columnasReconocidas: headers.length > 0 ? mapeadas / headers.length : 0,
  };
}

function avisosDeContexto(entidad: EntidadMigracion, validadas: FilaValidadaComun[], ctx: ContextoEstudio): string[] {
  const avisos: string[] = [];
  const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
  const contar = (campo: string, existentes: string[], etiqueta: string, consecuencia: string) => {
    const set = new Set(existentes.map(e => e.trim().toLowerCase()));
    const desconocidos = new Map<string, number>();
    for (const v of validadas) {
      if (v.estado !== 'ok') continue;
      const val = norm((v.datos as Record<string, unknown>)[campo]);
      if (val && !set.has(val)) desconocidos.set(val, (desconocidos.get(val) ?? 0) + 1);
    }
    if (desconocidos.size > 0) {
      const top = [...desconocidos.entries()].slice(0, 5).map(([n, c]) => `"${n}" (${c})`).join(', ');
      avisos.push(`${etiqueta} que no existen en tu estudio: ${top}${desconocidos.size > 5 ? '…' : ''} — ${consecuencia}`);
    }
  };
  if (entidad === 'membresias') contar('plan', ctx.planes, 'Planes', 'crea esos planes antes de ejecutar o esas filas fallarán');
  if (entidad === 'clases') {
    contar('instructor', ctx.instructores, 'Instructoras', 'esas clases entrarán sin instructora asignada');
    contar('sala', ctx.salas, 'Salas', 'esas clases entrarán sin sala');
  }
  if (entidad === 'citas') {
    contar('servicio', ctx.servicios, 'Servicios', 'esas citas fallarán (el catálogo no se crea solo)');
    contar('instructor', ctx.instructores, 'Instructoras', 'esas citas entrarán sin instructora');
  }
  return avisos;
}

export function construirAnalisis(
  nombre: string, headers: string[], rows: string[][],
  entidad: EntidadMigracion, origen: 'auto' | 'ia',
  mapeo: Record<string, number>, validadas: FilaValidadaComun[], ctx: ContextoEstudio,
): ArchivoAnalizado {
  const ok = validadas.filter(v => v.estado === 'ok');
  const dup = validadas.filter(v => v.estado === 'duplicada');
  const err = validadas.filter(v => v.estado === 'error');
  return {
    nombre, entidad, entidadEtiqueta: ENTIDADES[entidad].etiqueta, origen,
    confianza: rows.length > 0 ? ok.length / rows.length : 0,
    columnas: headers, mapeo, total: rows.length,
    ok: ok.length, duplicadas: dup.length, errores: err.length,
    muestra: ok.slice(0, MAX_MUESTRA).map(v => v.datos),
    cuarentena: [...err, ...dup].slice(0, MAX_CUARENTENA).map(v => ({ fila: v.fila, motivo: v.motivo ?? 'Duplicada en el archivo' })),
    avisos: avisosDeContexto(entidad, validadas, ctx),
  };
}

export function sinClasificar(nombre: string, headers: string[], total: number, motivo: string): ArchivoAnalizado {
  return {
    nombre, entidad: null, entidadEtiqueta: null, origen: null, confianza: 0,
    columnas: headers, mapeo: null, total, ok: 0, duplicadas: 0, errores: 0,
    muestra: [], cuarentena: [], avisos: [motivo],
  };
}

export interface MejorDeterminista {
  entidad: EntidadMigracion;
  mapeo: Record<string, number>;
  validadas: FilaValidadaComun[];
  tasaOk: number;
  columnasReconocidas: number;
}

// Prueba el auto-mapeo de las 5 entidades sobre un archivo ya parseado y
// devuelve el mejor candidato por puntuación combinada, o null si ninguno cubre
// los campos obligatorios.
export function mejorMapeoDeterminista(headers: string[], rows: string[][]): MejorDeterminista | null {
  let mejor: MejorDeterminista | null = null;
  for (const [id, def] of Object.entries(ENTIDADES) as [EntidadMigracion, DefEntidad][]) {
    const mapeo = def.mapear(headers);
    const ev = evaluarMapeo(def, headers, rows, mapeo);
    if (!ev.obligatoriosCubiertos) continue;
    const puntua = (x: { tasaOk: number; columnasReconocidas: number }) => x.tasaOk * 0.6 + x.columnasReconocidas * 0.4;
    if (!mejor || puntua(ev) > puntua(mejor)) mejor = { entidad: id, mapeo, ...ev };
  }
  return mejor;
}

// Resultado de clasificar UN archivo por la vía determinista:
//  - 'ok': clasificado, listo (el analizador lo usa tal cual).
//  - 'necesita-ia': el determinista no llega; el analizador probará IA y, si
//    tampoco, marcará sin-clasificar con el mensaje de `mejor`.
export type ResultadoDeterminista =
  | { tipo: 'ok'; analisis: ArchivoAnalizado }
  | { tipo: 'necesita-ia'; headers: string[]; rows: string[][]; mejor: MejorDeterminista | null; motivoSinClasificar: string };

export function clasificarArchivoDeterminista(archivo: ArchivoEntrada, ctx: ContextoEstudio): { tipo: 'vacio'; analisis: ArchivoAnalizado } | ResultadoDeterminista {
  let parsed: ReturnType<typeof parseCsv>;
  try {
    parsed = parseCsv(archivo.contenido);
  } catch {
    return { tipo: 'vacio', analisis: sinClasificar(archivo.nombre, [], 0, 'No se ha podido leer el archivo (¿está vacío o corrupto?)') };
  }
  const { headers, rows } = parsed;
  if (headers.length === 0 || rows.length === 0) {
    return { tipo: 'vacio', analisis: sinClasificar(archivo.nombre, headers, rows.length, 'El archivo no tiene filas de datos') };
  }

  const mejor = mejorMapeoDeterminista(headers, rows);
  if (mejor && (mejor.tasaOk >= UMBRAL_CONFIANZA || mejor.columnasReconocidas >= 0.6)) {
    const analisis = construirAnalisis(archivo.nombre, headers, rows, mejor.entidad, 'auto', mejor.mapeo, mejor.validadas, ctx);
    if (mejor.tasaOk < UMBRAL_CONFIANZA) {
      analisis.avisos.unshift(`Solo ${Math.round(mejor.tasaOk * 100)}% de las filas son válidas — revisa la cuarentena antes de ejecutar.`);
    }
    return { tipo: 'ok', analisis };
  }

  return {
    tipo: 'necesita-ia', headers, rows, mejor,
    motivoSinClasificar: mejor
      ? `Se parece a "${ENTIDADES[mejor.entidad].etiqueta}" pero solo ${Math.round(mejor.tasaOk * 100)}% de filas válidas — asigna la entidad y columnas a mano.`
      : 'No se ha reconocido el formato — asigna la entidad y las columnas a mano.',
  };
}

// Avisos globales de dependencias + orden de ejecución filtrado a lo presente.
export function avisosGlobalesYOrden(resultados: ArchivoAnalizado[]): { orden: EntidadMigracion[]; avisos: string[] } {
  const presentes = new Set(resultados.map(r => r.entidad).filter((e): e is EntidadMigracion => e !== null));
  const avisos: string[] = [];
  if (presentes.has('membresias') && !presentes.has('socias')) {
    avisos.push('Hay bonos/membresías pero ningún archivo de clientas: las membresías de emails que no existan ya en Tentare fallarán.');
  }
  if (presentes.has('reservas') && !presentes.has('clases')) {
    avisos.push('Hay reservas pero ningún archivo de clases: las reservas de clases que no existan ya en Tentare fallarán.');
  }
  return { orden: ORDEN_EJECUCION.filter(e => presentes.has(e)), avisos };
}

// Analizador SOLO-DETERMINISTA (sin IA, client-safe). Es lo que corre la demo
// de la landing en el navegador. Los archivos que el determinista no clasifica
// quedan sin-clasificar (en la app real, el server prueba IA antes de rendirse).
export function analizarDeterminista(archivos: ArchivoEntrada[], ctx: ContextoEstudio = CTX_VACIO): PlanMigracion {
  const resultados = archivos.map(a => {
    const r = clasificarArchivoDeterminista(a, ctx);
    if (r.tipo === 'ok' || r.tipo === 'vacio') return r.analisis;
    return sinClasificar(a.nombre, r.headers, r.rows.length, r.motivoSinClasificar);
  });
  return { archivos: resultados, ...avisosGlobalesYOrden(resultados) };
}
