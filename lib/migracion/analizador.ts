// ─────────────────────────────────────────────────────────────────────────────
// Migración Mágica · Fase A — el ANALIZADOR: convierte archivos arbitrarios
// (exports de Timp/Momence/Eversports/Excel casero…) en un PLAN de importación
// sobre los 5 importadores existentes (socias/membresías/clases/reservas/citas).
//
// Principio de diseño (el listón es 30/30 propietarias satisfechas): la IA
// PROPONE, nunca ejecuta. Este módulo solo analiza y devuelve un plan con
// muestras, cuarentena y avisos que un humano revisa antes de tocar la BD.
// Cadena de decisión por archivo:
//   1) mapeo DETERMINISTA (autoMapear* por sinónimos de lib/csv) + validación
//      completa → si cubre obligatorios y ≥80% de filas válidas, no hay IA.
//   2) fallback IA (Claude, mismo patrón que automatizaciones): solo ve
//      CABECERAS + 10 filas de muestra, devuelve entidad+mapeo en JSON, y el
//      mapeo se aplica DETERMINISTA en código sobre todas las filas — la IA
//      jamás transforma datos fila a fila.
//   3) sin clave de IA o sin confianza → 'sin clasificar': la UI pide asignar
//      entidad/columnas a mano. Nunca se adivina en silencio.
// ─────────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk';
// Import relativo con extensión (no alias @/): igual que theme-runtime.ts, para
// que el runner de node:test pueda ejecutar el .test.ts sin resolver alias.
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

interface FilaValidadaComun {
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
const ENTIDADES: Record<EntidadMigracion, DefEntidad> = {
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
  // Primeras filas ya MAPEADAS (campo→valor) para que el humano vea qué va a entrar.
  muestra: Record<string, unknown>[];
  // Filas que NO se importarían, con su motivo — visibles, nunca descartadas en silencio.
  cuarentena: { fila: number; motivo: string }[];
  avisos: string[];
}

export interface PlanMigracion {
  archivos: ArchivoAnalizado[];
  orden: EntidadMigracion[];
  avisos: string[];
}

const UMBRAL_CONFIANZA = 0.8;
const MAX_CUARENTENA = 50;
const MAX_MUESTRA = 5;

function evaluarMapeo(def: DefEntidad, headers: string[], rows: string[][], mapeo: Record<string, number>) {
  const obligatoriosCubiertos = def.campos.filter(c => c.obligatorio).every(c => (mapeo[c.campo] ?? -1) !== -1);
  if (!obligatoriosCubiertos) {
    return { obligatoriosCubiertos, validadas: [] as FilaValidadaComun[], tasaOk: 0, columnasReconocidas: 0 };
  }
  const validadas = def.validar(rows, mapeo);
  const ok = validadas.filter(v => v.estado === 'ok').length;
  // Proporción de columnas del ARCHIVO que el mapeo reconoce: mide si las
  // cabeceras "hablan el idioma" de esta entidad. Es la señal de CLASIFICACIÓN;
  // la tasa de filas válidas mide la CALIDAD de los datos (→ cuarentena), y no
  // debe impedir clasificar un archivo claramente identificado pero sucio.
  const mapeadas = new Set(Object.values(mapeo).filter(i => i !== -1)).size;
  return {
    obligatoriosCubiertos,
    validadas,
    tasaOk: rows.length > 0 ? ok / rows.length : 0,
    columnasReconocidas: headers.length > 0 ? mapeadas / headers.length : 0,
  };
}

// ── Fallback IA: clasificar + mapear con Claude ──────────────────────────────
// Solo cabeceras + muestra. Mismo modelo y patrón falla-suave que el resto del
// proyecto (automatizaciones): si no hay clave o no parsea → null, sin romper.
async function clasificarConIA(
  nombre: string,
  headers: string[],
  muestra: string[][],
): Promise<{ entidad: EntidadMigracion; mapeo: Record<string, number> } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const anthropic = new Anthropic();
    const esquemas = (Object.entries(ENTIDADES) as [EntidadMigracion, DefEntidad][])
      .map(([id, def]) => `- ${id}: ${def.campos.map(c => `${c.campo}${c.obligatorio ? '*' : ''} (${c.etiqueta})`).join(', ')}`)
      .join('\n');
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system:
        'Clasificas exports de software de gestión de estudios de pilates/fitness (Timp, Momence, Eversports, bsport, Mindbody, Excel casero...) para migrarlos. ' +
        'Devuelves SOLO un JSON: {"entidad": "<socias|membresias|clases|reservas|citas|ninguna>", "mapeo": {"<campo>": <índice de columna 0-based>}}. ' +
        'Solo incluye en el mapeo campos que EXISTAN claramente en las columnas; nunca inventes. Si el archivo no encaja con ninguna entidad, entidad="ninguna". ' +
        'Los campos con * son obligatorios: si no puedes mapearlos, la entidad no es válida.\n\nEntidades y campos:\n' + esquemas,
      messages: [{
        role: 'user',
        content:
          `Archivo: ${nombre}\nColumnas (índice: nombre):\n` +
          headers.map((h, i) => `${i}: ${h}`).join('\n') +
          `\n\nPrimeras filas:\n` +
          muestra.map(f => f.join(' | ')).join('\n'),
      }],
    });
    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json) as { entidad?: string; mapeo?: Record<string, number> };
    if (!parsed.entidad || parsed.entidad === 'ninguna' || !(parsed.entidad in ENTIDADES) || !parsed.mapeo) return null;
    const entidad = parsed.entidad as EntidadMigracion;
    // Mapeo saneado: solo campos conocidos, con índices de columna válidos.
    const mapeo: Record<string, number> = {};
    for (const c of ENTIDADES[entidad].campos) {
      const idx = parsed.mapeo[c.campo];
      mapeo[c.campo] = Number.isInteger(idx) && idx >= 0 && idx < headers.length ? idx : -1;
    }
    return { entidad, mapeo };
  } catch {
    return null;
  }
}

// ── Avisos de contexto: referencias a cosas que no existen en el estudio ─────
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

function construirAnalisis(
  nombre: string,
  headers: string[],
  rows: string[][],
  entidad: EntidadMigracion,
  origen: 'auto' | 'ia',
  mapeo: Record<string, number>,
  validadas: FilaValidadaComun[],
  ctx: ContextoEstudio,
): ArchivoAnalizado {
  const ok = validadas.filter(v => v.estado === 'ok');
  const dup = validadas.filter(v => v.estado === 'duplicada');
  const err = validadas.filter(v => v.estado === 'error');
  return {
    nombre,
    entidad,
    entidadEtiqueta: ENTIDADES[entidad].etiqueta,
    origen,
    confianza: rows.length > 0 ? ok.length / rows.length : 0,
    columnas: headers,
    mapeo,
    total: rows.length,
    ok: ok.length,
    duplicadas: dup.length,
    errores: err.length,
    muestra: ok.slice(0, MAX_MUESTRA).map(v => v.datos),
    cuarentena: [...err, ...dup].slice(0, MAX_CUARENTENA).map(v => ({ fila: v.fila, motivo: v.motivo ?? 'Duplicada en el archivo' })),
    avisos: avisosDeContexto(entidad, validadas, ctx),
  };
}

function sinClasificar(nombre: string, headers: string[], total: number, motivo: string): ArchivoAnalizado {
  return {
    nombre, entidad: null, entidadEtiqueta: null, origen: null, confianza: 0,
    columnas: headers, mapeo: null, total, ok: 0, duplicadas: 0, errores: 0,
    muestra: [], cuarentena: [], avisos: [motivo],
  };
}

export async function analizarArchivos(archivos: ArchivoEntrada[], ctx: ContextoEstudio): Promise<PlanMigracion> {
  const resultados: ArchivoAnalizado[] = [];

  for (const archivo of archivos) {
    let parsed: ReturnType<typeof parseCsv>;
    try {
      parsed = parseCsv(archivo.contenido);
    } catch {
      resultados.push(sinClasificar(archivo.nombre, [], 0, 'No se ha podido leer el archivo (¿está vacío o corrupto?)'));
      continue;
    }
    const { headers, rows } = parsed;
    if (headers.length === 0 || rows.length === 0) {
      resultados.push(sinClasificar(archivo.nombre, headers, rows.length, 'El archivo no tiene filas de datos'));
      continue;
    }

    // 1) Determinista: probar el auto-mapeo de las 5 entidades y quedarse con
    //    la mejor por puntuación combinada (clasificación + calidad).
    let mejor: { entidad: EntidadMigracion; mapeo: Record<string, number>; validadas: FilaValidadaComun[]; tasaOk: number; columnasReconocidas: number } | null = null;
    for (const [id, def] of Object.entries(ENTIDADES) as [EntidadMigracion, DefEntidad][]) {
      const mapeo = def.mapear(headers);
      const ev = evaluarMapeo(def, headers, rows, mapeo);
      if (!ev.obligatoriosCubiertos) continue;
      const puntua = (x: { tasaOk: number; columnasReconocidas: number }) => x.tasaOk * 0.6 + x.columnasReconocidas * 0.4;
      if (!mejor || puntua(ev) > puntua(mejor)) mejor = { entidad: id, mapeo, ...ev };
    }
    // Se acepta si los datos son buenos (≥80% filas válidas) O si las cabeceras
    // identifican claramente la entidad (≥60% de columnas reconocidas) — en el
    // segundo caso las filas sucias van a cuarentena, no bloquean clasificar.
    if (mejor && (mejor.tasaOk >= UMBRAL_CONFIANZA || mejor.columnasReconocidas >= 0.6)) {
      const analisis = construirAnalisis(archivo.nombre, headers, rows, mejor.entidad, 'auto', mejor.mapeo, mejor.validadas, ctx);
      if (mejor.tasaOk < UMBRAL_CONFIANZA) {
        analisis.avisos.unshift(`Solo ${Math.round(mejor.tasaOk * 100)}% de las filas son válidas — revisa la cuarentena antes de ejecutar.`);
      }
      resultados.push(analisis);
      continue;
    }

    // 2) IA: clasificar + mapear con muestra; el mapeo se aplica en código.
    const ia = await clasificarConIA(archivo.nombre, headers, rows.slice(0, 10));
    if (ia) {
      const def = ENTIDADES[ia.entidad];
      const ev = evaluarMapeo(def, headers, rows, ia.mapeo);
      const gananciaIA = ev.obligatoriosCubiertos && ev.tasaOk > (mejor?.tasaOk ?? 0);
      if (gananciaIA && ev.tasaOk >= UMBRAL_CONFIANZA) {
        resultados.push(construirAnalisis(archivo.nombre, headers, rows, ia.entidad, 'ia', ia.mapeo, ev.validadas, ctx));
        continue;
      }
      // La IA propuso algo pero no llega al listón → se enseña como propuesta
      // de baja confianza, NUNCA como plan listo (el humano decide en la UI).
      if (ev.obligatoriosCubiertos && ev.tasaOk > 0) {
        const analisis = construirAnalisis(archivo.nombre, headers, rows, ia.entidad, 'ia', ia.mapeo, ev.validadas, ctx);
        analisis.avisos.unshift(`Solo ${Math.round(ev.tasaOk * 100)}% de las filas pasan la validación con este mapeo — revísalo a mano antes de ejecutar.`);
        resultados.push(analisis);
        continue;
      }
    }

    // 3) Nadie llega al listón: sin clasificar, decide el humano.
    resultados.push(sinClasificar(
      archivo.nombre, headers, rows.length,
      mejor
        ? `Se parece a "${ENTIDADES[mejor.entidad].etiqueta}" pero solo ${Math.round(mejor.tasaOk * 100)}% de filas válidas — asigna la entidad y columnas a mano.`
        : 'No se ha reconocido el formato — asigna la entidad y las columnas a mano.',
    ));
  }

  const entidadesPresentes = new Set(resultados.map(r => r.entidad).filter((e): e is EntidadMigracion => e !== null));
  const avisos: string[] = [];
  if (entidadesPresentes.has('membresias') && !entidadesPresentes.has('socias')) {
    avisos.push('Hay bonos/membresías pero ningún archivo de clientas: las membresías de emails que no existan ya en Tentare fallarán.');
  }
  if (entidadesPresentes.has('reservas') && !entidadesPresentes.has('clases')) {
    avisos.push('Hay reservas pero ningún archivo de clases: las reservas de clases que no existan ya en Tentare fallarán.');
  }

  return {
    archivos: resultados,
    orden: ORDEN_EJECUCION.filter(e => entidadesPresentes.has(e)),
    avisos,
  };
}
