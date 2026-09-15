// Renovar una serie (una clase que se repite) antes de que se acabe.
//
// Qué se crea, qué se omite y si ya estaba renovada lo decide la base de datos
// (`renovar_serie`, migr 20260915094528), en una transacción. Aquí solo se
// traduce su resultado a lo que la pantalla tiene que decir de verdad. Sin I/O.

export const MAX_SEMANAS_RENOVACION = 104;

export type MotivoOmitida = 'ya_existe' | 'sala_ocupada';

export interface ResultadoRenovarSerie {
  estado: 'renovada' | 'ya_renovada' | 'simulacion' | 'sin_cambios';
  /** Período que crea (o que ya existía, con 'ya_renovada'). */
  periodo: number;
  /** Período que había antes: se manda de vuelta al renovar de verdad. */
  periodoActual: number | null;
  semanas: number;
  desde: string;
  hasta: string;
  creadas: number;
  omitidas: { fecha: string; motivo: MotivoOmitida }[];
  sinInstructora: string[];
  instructoraInactiva: boolean;
  plazasFijas: number;
  /** Si la serie se renueva sola cuando se va a acabar. */
  renovacionAutomatica: boolean;
}

export interface SeriePorRenovar {
  serieId: string;
  ultimaFecha: string;
  diaSemana: number;
  hora: string;
  salaId: string | null;
  tipoClaseId: string | null;
  instructorId: string | null;
  aforo: number;
  periodo: number;
  semanasPeriodo: number;
  plazasFijas: number;
  terminada: boolean;
  renovacionAutomatica: boolean;
  /** Último aviso enviado (aviso14, aviso7, final) y a qué fecha de fin se refería. */
  avisoTramo: string | null;
  avisoFin: string | null;
}

const num = (v: unknown, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Del jsonb de `renovar_serie` a la forma de la app. `null` si no tiene esa forma. */
export function resultadoDeRpc(raw: unknown): ResultadoRenovarSerie | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const estado = r.estado;
  if (estado !== 'renovada' && estado !== 'ya_renovada' && estado !== 'simulacion' && estado !== 'sin_cambios') return null;
  const omitidas = Array.isArray(r.omitidas)
    ? r.omitidas.flatMap(o => {
        const x = o as Record<string, unknown>;
        return (x.motivo === 'ya_existe' || x.motivo === 'sala_ocupada') && typeof x.fecha === 'string'
          ? [{ fecha: x.fecha, motivo: x.motivo as MotivoOmitida }] : [];
      })
    : [];
  return {
    estado,
    periodo: num(r.periodo, 1),
    periodoActual: typeof r.periodo_actual === 'number' ? r.periodo_actual : null,
    semanas: num(r.semanas),
    desde: str(r.desde),
    hasta: str(r.hasta),
    creadas: num(r.creadas),
    omitidas,
    sinInstructora: Array.isArray(r.sin_instructora) ? r.sin_instructora.filter((f): f is string => typeof f === 'string') : [],
    instructoraInactiva: r.instructora_inactiva === true,
    plazasFijas: num(r.plazas_fijas),
    renovacionAutomatica: r.renovacion_automatica === true,
  };
}

export function seriePorRenovarDeFila(r: Record<string, unknown>): SeriePorRenovar {
  return {
    serieId: str(r.serie_id),
    ultimaFecha: str(r.ultima_fecha),
    diaSemana: num(r.dia_semana),
    hora: str(r.hora).slice(0, 5),
    salaId: typeof r.sala_id === 'string' ? r.sala_id : null,
    tipoClaseId: typeof r.tipo_clase_id === 'string' ? r.tipo_clase_id : null,
    instructorId: typeof r.instructor_id === 'string' ? r.instructor_id : null,
    aforo: num(r.aforo),
    periodo: num(r.periodo, 1),
    semanasPeriodo: num(r.semanas_periodo, 1),
    plazasFijas: num(r.plazas_fijas),
    terminada: r.terminada === true,
    renovacionAutomatica: r.renovacion_automatica === true,
    avisoTramo: typeof r.aviso_tramo === 'string' ? r.aviso_tramo : null,
    avisoFin: typeof r.aviso_fin === 'string' ? r.aviso_fin : null,
  };
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «Reformer · Martes 18:00 · Sala 1», con los nombres que ya tiene el panel. */
export function nombreSerie(
  s: Pick<SeriePorRenovar, 'diaSemana' | 'hora' | 'salaId' | 'tipoClaseId'>,
  nombreTipo: (id: string) => string | undefined,
  nombreSala: (id: string) => string | undefined,
): string {
  const dia = DIAS[s.diaSemana] ?? '';
  const tipo = (s.tipoClaseId && nombreTipo(s.tipoClaseId)) || 'Clase';
  const sala = (s.salaId && nombreSala(s.salaId)) || 'Sala';
  return `${tipo} · ${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${s.hora.slice(0, 5)} · ${sala}`;
}

export function fechaDMY(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : ymd;
}

/** Días de `hoy` a `fin` (negativo si ya pasó), en fechas YYYY-MM-DD. */
export function diasHastaFin(hoy: string, fin: string): number {
  return diasEntre(hoy, fin);
}

function diasEntre(desdeYmd: string, hastaYmd: string): number {
  return Math.round((Date.parse(`${hastaYmd}T00:00:00Z`) - Date.parse(`${desdeYmd}T00:00:00Z`)) / 86_400_000);
}

/** «Termina el 05/10/2026 · en 20 días», «Termina hoy», «Terminó el 01/10/2026». */
export function textoFinSerie(ultimaFecha: string, hoy: string): string {
  const d = diasEntre(hoy, ultimaFecha);
  if (d < 0) return `Terminó el ${fechaDMY(ultimaFecha)}`;
  if (d === 0) return 'Termina hoy';
  if (d === 1) return 'Termina mañana';
  return `Termina el ${fechaDMY(ultimaFecha)} · en ${d} días`;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/** Lo que ha pasado de verdad, con las cifras de la base de datos. */
export function textoTrasRenovar(r: ResultadoRenovarSerie): string {
  if (r.estado === 'ya_renovada') {
    return `Esta clase ya estaba renovada: sigue hasta el ${fechaDMY(r.hasta)}`;
  }
  if (r.estado === 'sin_cambios') {
    return 'No se ha creado ninguna clase: esas fechas ya estaban en el calendario o la sala está ocupada';
  }
  const partes = [`Clase renovada: ${plural(r.creadas, 'clase más', 'clases más')}, hasta el ${fechaDMY(r.hasta)}`];
  const ocupadas = r.omitidas.filter(o => o.motivo === 'sala_ocupada').length;
  const yaEstaban = r.omitidas.filter(o => o.motivo === 'ya_existe').length;
  if (ocupadas > 0) partes.push(`${plural(ocupadas, 'fecha no se ha creado', 'fechas no se han creado')} porque la sala está ocupada`);
  if (yaEstaban > 0) partes.push(`${plural(yaEstaban, 'ya estaba', 'ya estaban')} en el calendario`);
  if (r.sinInstructora.length > 0) {
    partes.push(`${plural(r.sinInstructora.length, 'queda', 'quedan')} sin instructora: asígnala en el calendario`);
  } else if (r.instructoraInactiva) {
    partes.push('sin instructora (la de antes ya no está en el equipo): asígnala en el calendario');
  }
  if (r.plazasFijas > 0) partes.push(`${plural(r.plazasFijas, 'plaza fija sigue', 'plazas fijas siguen')}`);
  return partes.join(' · ');
}

const ERRORES: Record<string, string> = {
  SERIE_NO_ENCONTRADA: 'No se ha encontrado esta clase.',
  SERIE_SIN_CLASES: 'Todas las clases de esta serie están canceladas: no hay nada que renovar.',
  SEMANAS_INVALIDAS: `Elige entre 1 y ${MAX_SEMANAS_RENOVACION} semanas.`,
  DEMASIADAS_CLASES: 'Son demasiadas clases de una vez (más de 400): renueva menos semanas.',
};

/** El código que lanza la RPC, traducido. Cualquier otro error, un mensaje genérico. */
export function mensajeErrorRenovar(mensajeBd: string | null | undefined): string {
  const codigo = Object.keys(ERRORES).find(c => (mensajeBd ?? '').includes(c));
  return codigo ? ERRORES[codigo] : 'No se ha podido renovar la clase. Inténtalo de nuevo.';
}

export function semanasValidas(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_SEMANAS_RENOVACION;
}
