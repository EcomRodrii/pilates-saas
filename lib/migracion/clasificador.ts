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
  autoMapear, autoMapearMembresia, autoMapearClase, autoMapearReserva, autoMapearCita, autoMapearPago,
  autoMapearRecuperacion,
  validarFilas, validarFilasMembresia, validarFilasClase, validarFilasReserva, validarFilasCita, validarFilasPago,
  validarFilasRecuperacion,
  CAMPOS_SOCIA, CAMPOS_MEMBRESIA, CAMPOS_CLASE, CAMPOS_RESERVA, CAMPOS_CITA, CAMPOS_PAGO, CAMPOS_RECUPERACION,
  inferirOrdenFecha,
} from '../csv.ts';

export type EntidadMigracion = 'socias' | 'membresias' | 'clases' | 'reservas' | 'citas' | 'pagos' | 'recuperaciones';

// Orden de ejecución con dependencias: membresías/reservas/citas/pagos/
// recuperaciones necesitan que las socias existan; las reservas necesitan las
// clases.
export const ORDEN_EJECUCION: EntidadMigracion[] = ['socias', 'clases', 'membresias', 'reservas', 'citas', 'pagos', 'recuperaciones'];

export interface FilaValidadaComun {
  fila: number;
  datos: Record<string, unknown>;
  estado: 'ok' | 'error' | 'duplicada';
  motivo?: string;
}

interface DefEntidad {
  etiqueta: string;
  campos: { campo: string; etiqueta: string; obligatorio: boolean }[];
  /**
   * Campos de los que hace falta AL MENOS UNO para que el archivo pueda ser de
   * esta entidad. Existe por las recuperaciones: su único campo obligatorio es
   * el email, así que sin esto cualquier CSV con una columna de email
   * (empezando por el de clientas) encajaba en ellas y podía ganar la
   * clasificación por tener menos exigencias que nadie.
   */
  requiereAlguno?: string[];
  mapear: (headers: string[]) => Record<string, number>;
  validar: (rows: string[][], mapeo: Record<string, number>) => FilaValidadaComun[];
}

// Registro uniforme de las entidades. ⚠️ EL ORDEN DE LAS CLAVES SE VE: de él
// sale la lista que el dropzone enseña como «lo que acepta». Va de lo que
// primero trae un estudio a lo último, igual que ORDEN_EJECUCION — no por
// orden de aparición en el código. Los casts son seguros: los Record de
// Los casts son seguros: los Record de mapeo de lib/csv son Record<CampoX, number> (subconjunto de string→number) y
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
  pagos: {
    etiqueta: 'Pagos históricos',
    campos: CAMPOS_PAGO,
    mapear: (h) => autoMapearPago(h) as Record<string, number>,
    validar: (r, m) => validarFilasPago(r, m as Parameters<typeof validarFilasPago>[1]) as unknown as FilaValidadaComun[],
  },
  recuperaciones: {
    etiqueta: 'Recuperaciones pendientes',
    campos: CAMPOS_RECUPERACION,
    // Con el email a secas no basta: eso lo cumple hasta el CSV de clientas.
    //
    // ⚠️ Y con una FECHA tampoco. `caduca_el` estaba aquí, y sus sinónimos son
    // «expiry date», «caducidad», «vencimiento», «validez» — que es exactamente
    // como llama cualquier plataforma a la caducidad del BONO. Resultado: un
    // export de clientas con una columna «Expiry Date» generaba un bloque
    // «Recuperaciones pendientes: 4 se importarán», una por socia, incluidas
    // las que tenían esa celda vacía. Y una recuperación es una clase gratis
    // que el estudio le debe a alguien: la migración inventaba deudas.
    //
    // Solo `cantidad` identifica esta entidad, con el mismo criterio que ya
    // aplica el comentario de sus sinónimos: aquí solo van palabras que
    // únicamente significan recuperación. Una fecha suelta no dice nada, y ante
    // la duda es mejor no importarlas que inventarlas (el estudio siempre puede
    // subir un archivo con su columna de recuperaciones).
    requiereAlguno: ['cantidad'],
    mapear: (h) => autoMapearRecuperacion(h) as Record<string, number>,
    validar: (r, m) => validarFilasRecuperacion(r, m as Parameters<typeof validarFilasRecuperacion>[1]) as unknown as FilaValidadaComun[],
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
  // Archivo del que salen las filas. Distinto de `nombre` solo en los análisis
  // DERIVADOS (un mismo CSV que trae dos entidades, p.ej. socias + sus bonos):
  // el derivado se muestra con nombre propio para no pisar overrides ni plegados,
  // pero lee las filas del archivo original.
  origenNombre?: string;
  entidad: EntidadMigracion | null; // null = sin clasificar (decide el humano)
  entidadEtiqueta: string | null;
  origen: 'auto' | 'ia' | 'manual' | null;
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
  const obligatoriosCubiertos = def.campos.filter(c => c.obligatorio).every(c => (mapeo[c.campo] ?? -1) !== -1)
    && (!def.requiereAlguno || def.requiereAlguno.some(c => (mapeo[c] ?? -1) !== -1));
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
  entidad: EntidadMigracion, origen: 'auto' | 'ia' | 'manual',
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
    avisos: [...avisosDeContexto(entidad, validadas, ctx), ...avisoFechasAmericanas(rows, mapeo)],
  };
}

/**
 * Momence y Mindbody exportan MM/DD/YYYY. El parser lo detecta solo mirando la
 * columna entera y lee las fechas bien, pero esa es una decisión que hemos
 * tomado NOSOTROS sobre las fechas de sus bonos: conviene que se vea antes de
 * ejecutar, no descubrirlo cuando a una clienta le caduca el bono antes de
 * tiempo. Si el archivo ya viene en formato español no se dice nada.
 */
function avisoFechasAmericanas(rows: string[][], mapeo: Record<string, number>): string[] {
  const idx = Object.entries(mapeo)
    .filter(([campo, i]) => i >= 0 && /fecha|vigencia|caduc/.test(campo))
    .map(([, i]) => i);
  if (idx.length === 0) return [];
  const valores = rows.flatMap(f => idx.map(i => f[i] ?? ''));
  if (inferirOrdenFecha(valores) !== 'mda') return [];
  return ['Las fechas vienen en formato americano (mes/día/año), como exporta Momence. Se leen así — revisa un par en la muestra antes de ejecutar.'];
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

// Reanaliza UN archivo con una entidad y un mapeo elegidos A MANO por la
// propietaria (paso de revisión). Client-safe: reutiliza el mismo validador y
// la misma construcción de análisis que la vía automática, así lo que ve en la
// muestra es EXACTAMENTE lo que se importará. entidad=null → "no importar".
export function analizarConMapeoManual(
  archivo: ArchivoEntrada,
  entidad: EntidadMigracion | null,
  mapeo: Record<string, number>,
  ctx: ContextoEstudio = CTX_VACIO,
): ArchivoAnalizado {
  let headers: string[] = [];
  let rows: string[][] = [];
  try { ({ headers, rows } = parseCsv(archivo.contenido)); } catch { /* archivo ilegible */ }
  if (!entidad) return sinClasificar(archivo.nombre, headers, rows.length, 'Marcado como "no importar".');
  const def = ENTIDADES[entidad];
  const faltan = def.campos.filter(c => c.obligatorio && (mapeo[c.campo] ?? -1) === -1).map(c => c.etiqueta);
  const validadas = def.validar(rows, mapeo);
  const analisis = construirAnalisis(archivo.nombre, headers, rows, entidad, 'manual', mapeo, validadas, ctx);
  if (faltan.length) {
    analisis.avisos.unshift(`Asigna una columna para: ${faltan.join(', ')} — sin eso no se importará ninguna fila.`);
  }
  return analisis;
}

// ── Un mismo CSV que trae DOS entidades ──────────────────────────────────────
// Los exports reales (Momence, Timp, Eversports, bsport) ponen la clienta y su
// bono en la MISMA fila. Como `entidad` es singular, el archivo ganaba como
// "socias" (más columnas reconocidas) y las de la membresía se descartaban sin
// decir nada: 850 clientas importadas y 0 bonos, con acta en verde.
//
// Tras clasificar la entidad principal probamos las demás; si alguna cubre sus
// obligatorios y aporta al menos UNA columna que la principal no usa, emitimos
// un análisis DERIVADO sobre el mismo contenido. El resto del flujo ya lo trata
// como un archivo más: ORDEN_EJECUCION importa socias antes que membresías, y
// el acta y el deshacer lo cuentan aparte.
export function derivarEntidadesSecundarias(
  nombre: string, headers: string[], rows: string[][],
  principal: EntidadMigracion, mapeoPrincipal: Record<string, number>,
  ctx: ContextoEstudio,
): ArchivoAnalizado[] {
  const usadasPorPrincipal = new Set(Object.values(mapeoPrincipal).filter(i => i !== -1));
  const derivados: ArchivoAnalizado[] = [];

  for (const [id, def] of Object.entries(ENTIDADES) as [EntidadMigracion, DefEntidad][]) {
    if (id === principal) continue;
    const mapeo = def.mapear(headers);
    const propias = Object.values(mapeo).filter(i => i !== -1 && !usadasPorPrincipal.has(i));
    // Sin columnas propias no hay una segunda entidad: es la misma información
    // releída (p.ej. solo el email, que ya usa la principal).
    if (propias.length === 0) continue;
    const ev = evaluarMapeo(def, headers, rows, mapeo);
    if (!ev.obligatoriosCubiertos || ev.tasaOk < UMBRAL_CONFIANZA) continue;

    const analisis = construirAnalisis(nombre, headers, rows, id, 'auto', mapeo, ev.validadas, ctx);
    analisis.nombre = `${nombre} · ${def.etiqueta.toLowerCase()}`;
    analisis.origenNombre = nombre;
    analisis.avisos.unshift(
      `Salen de las mismas filas que "${nombre}", de las columnas ${headers.filter((_, i) => propias.includes(i)).map(h => `«${h}»`).join(', ')}. ` +
      'Si no las quieres, marca este bloque como "no importar".',
    );
    derivados.push(analisis);
  }
  return derivados;
}

// Red de seguridad: ninguna columna debe desaparecer en silencio. Se calcula
// sobre TODOS los análisis del mismo archivo (principal + derivados), así que
// solo se avisa de lo que de verdad no va a ninguna parte.
export function avisarColumnasIgnoradas(delMismoArchivo: ArchivoAnalizado[]): void {
  const principal = delMismoArchivo[0];
  if (!principal || principal.entidad === null) return;
  const usadas = new Set<number>();
  for (const a of delMismoArchivo) {
    for (const i of Object.values(a.mapeo ?? {})) if (i !== -1) usadas.add(i);
  }
  const ignoradas = principal.columnas.filter((_, i) => !usadas.has(i)).filter(h => h.trim() !== '');
  if (ignoradas.length === 0) return;
  principal.avisos.push(
    `No se importan estas columnas: ${ignoradas.map(h => `«${h}»`).join(', ')}. ` +
    'Si alguna te hace falta, ajusta la entidad o las columnas antes de ejecutar.',
  );
}

// Envuelve un análisis ya clasificado con sus entidades derivadas y el aviso de
// columnas ignoradas. Punto único por el que pasan las dos vías (determinista
// en el navegador y con IA en el servidor).
export function completarConDerivadas(
  archivo: ArchivoEntrada, principal: ArchivoAnalizado, ctx: ContextoEstudio,
): ArchivoAnalizado[] {
  if (!principal.entidad || !principal.mapeo) return [principal];
  let headers: string[] = [];
  let rows: string[][] = [];
  try { ({ headers, rows } = parseCsv(archivo.contenido)); } catch { return [principal]; }
  const salida = [
    principal,
    ...derivarEntidadesSecundarias(principal.nombre, headers, rows, principal.entidad, principal.mapeo, ctx),
  ];
  avisarColumnasIgnoradas(salida);
  return salida;
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
  const resultados = archivos.flatMap(a => {
    const r = clasificarArchivoDeterminista(a, ctx);
    if (r.tipo === 'ok') return completarConDerivadas(a, r.analisis, ctx);
    if (r.tipo === 'vacio') return [r.analisis];
    return [sinClasificar(a.nombre, r.headers, r.rows.length, r.motivoSinClasificar)];
  });
  return { archivos: resultados, ...avisosGlobalesYOrden(resultados) };
}
