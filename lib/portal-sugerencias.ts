// ─────────────────────────────────────────────────────────────────────────────
// La clase que le proponemos a ESTA socia, y por qué.
//
// El hueco que cierra: `getHomeCardContext` (portal-home-logic.ts) clasifica muy
// bien en qué momento está la socia —tiene clase, se le acaba el bono, va a
// perder la racha, lleva 10 días sin venir, nunca ha reservado— pero ninguno de
// esos cinco estados propone NADA concreto. Todos acaban mandándola a la lista
// entera de clases con un texto genérico ("Hay clases con hueco esta semana").
// "Te echamos de menos" sin un botón que lleve a una clase real no cambia el
// comportamiento de nadie.
//
// Regla no negociable: NADA de recomendaciones aleatorias. Cada sugerencia sale
// de un hecho comprobable de su historial y se acompaña SIEMPRE del motivo. Si
// no hay ningún hecho que la sostenga, esto devuelve `null` y la tarjeta se
// queda como estaba — mismo principio que prediccion.ts en el lado del motor.
//
// Puro y sin I/O (ver portal-sugerencias.test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import type { Reserva, Sesion, TipoClase, Suscripcion, PlanTarifa } from '@/lib/types';
import { tieneEntitlementActivo } from './bono-logic.ts';
import { franjaLocalDe, TZ_ESTUDIO } from './utils.ts';

const MS_DIA = 86400000;

/** Ventana de historial con la que se deduce su costumbre. */
const VENTANA_COSTUMBRE_DIAS = 90;
/** Por debajo de esto no hay "costumbre" que valga: son visitas sueltas. */
const MIN_ASISTENCIAS_COSTUMBRE = 3;
/** Margen horario que cuenta como "su hora" (clases consecutivas de un estudio). */
const MARGEN_HORAS = 2;
/** No se propone nada más allá de esto: deja de parecer una respuesta a hoy. */
const DIAS_VISTA_MAX = 10;

export interface SugerenciaClase {
  sesion: Sesion;
  tipo: TipoClase | null;
  plazasLibres: number;
  /** Por qué esta y no otra, en su idioma. Nunca vacío. */
  motivo: string;
  /** true si sale de su costumbre real; false si es solo "la próxima con hueco". */
  porCostumbre: boolean;
}

const DIAS = ['los domingos', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados'];

function franjaDelDia(hora: number): string {
  if (hora < 12) return 'por la mañana';
  if (hora < 18) return 'por la tarde';
  return 'por la noche';
}

export interface EntradaSugerencia {
  now: Date;
  socioId: string;
  /** Reservas de ESTA socia (cualquier estado). */
  misReservas: Reserva[];
  /** Reservas de TODO el estudio — hacen falta para saber el aforo libre. */
  reservas: Reserva[];
  sesiones: Sesion[];
  tiposClase: TipoClase[];
  suscripciones: Suscripcion[];
  planesTarifa: PlanTarifa[];
}

/**
 * La clase que mejor le encaja de las próximas, o `null`.
 *
 * Devuelve `null` —y esto importa tanto como el resto— cuando no hay ninguna
 * clase que su plan cubra, cuando no queda hueco en ninguna, o cuando no hay
 * nada futuro. Proponerle una clase que no puede reservar es peor que no
 * proponerle ninguna: gasta su confianza y la manda a un callejón.
 */
export function sugerirClase(e: EntradaSugerencia): SugerenciaClase | null {
  const { now, socioId, misReservas, reservas, sesiones, tiposClase, suscripciones, planesTarifa } = e;
  const hoyISO = now.toISOString().slice(0, 10);
  const tMax = now.getTime() + DIAS_VISTA_MAX * MS_DIA;

  // Sesiones donde ya tiene sitio (o está esperándolo): no se le vuelve a ofrecer.
  const yaTieneSitio = new Set(
    misReservas.filter(r => r.estado !== 'CANCELADA').map(r => r.sesionId),
  );

  const ocupadas = new Map<string, number>();
  for (const r of reservas) {
    // Mismo criterio de "ocupa asiento" que la RPC reservar_plaza: la lista de
    // espera y las pendientes de aprobación no bloquean plaza.
    if (r.estado !== 'CONFIRMADA' && r.estado !== 'ASISTIDA' && r.estado !== 'NO_ASISTIO') continue;
    ocupadas.set(r.sesionId, (ocupadas.get(r.sesionId) ?? 0) + 1);
  }

  const candidatas = sesiones.filter(s => {
    if (s.cancelada || yaTieneSitio.has(s.id)) return false;
    const t = new Date(s.inicio).getTime();
    if (t <= now.getTime() || t > tMax) return false;
    if (!s.aforoMaximo || s.aforoMaximo - (ocupadas.get(s.id) ?? 0) <= 0) return false;
    // Su plan tiene que cubrir ESTE tipo de clase: un bono de Reformer no da
    // derecho a Mat, y ofrecérselo la llevaría a un error al reservar.
    return tieneEntitlementActivo(socioId, suscripciones, planesTarifa, hoyISO, s.tipoClaseId);
  });
  if (candidatas.length === 0) return null;

  // ── Su costumbre, deducida de lo que ha hecho de verdad ───────────────────
  const sesionPorId = new Map(sesiones.map(s => [s.id, s]));
  const desde = now.getTime() - VENTANA_COSTUMBRE_DIAS * MS_DIA;
  const asistidas = misReservas
    .filter(r => r.estado === 'ASISTIDA')
    .map(r => sesionPorId.get(r.sesionId))
    .filter((s): s is Sesion => !!s && new Date(s.inicio).getTime() >= desde);

  const hayCostumbre = asistidas.length >= MIN_ASISTENCIAS_COSTUMBRE;

  const porFranja = new Map<string, number>();   // `${dow}` → veces
  const porHora = new Map<number, number>();
  const porTipo = new Map<string, number>();
  for (const s of asistidas) {
    const f = franjaLocalDe(s.inicio);
    porFranja.set(String(f.dow), (porFranja.get(String(f.dow)) ?? 0) + 1);
    porHora.set(f.hora, (porHora.get(f.hora) ?? 0) + 1);
    porTipo.set(s.tipoClaseId, (porTipo.get(s.tipoClaseId) ?? 0) + 1);
  }

  const tipoDe = (id: string) => tiposClase.find(t => t.id === id) ?? null;
  const libresDe = (s: Sesion) => Math.max(0, s.aforoMaximo - (ocupadas.get(s.id) ?? 0));

  if (!hayCostumbre) {
    // Sin historial suficiente (socia nueva, o que vuelve tras mucho tiempo) no
    // se inventa una costumbre: se ofrece la más próxima que su plan cubre, y el
    // motivo lo dice tal cual. Es un hecho, no una recomendación fabricada.
    const proxima = [...candidatas].sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
    return {
      sesion: proxima,
      tipo: tipoDe(proxima.tipoClaseId),
      plazasLibres: libresDe(proxima),
      motivo: 'es la próxima con hueco que te cubre tu plan',
      porCostumbre: false,
    };
  }

  // ── Puntuación ────────────────────────────────────────────────────────────
  // El día y la hora pesan más que la disciplina: quien viene los martes por la
  // tarde puede probar otra clase a su hora, pero no cambiar de vida para venir
  // un domingo a las 9. Empate → la más próxima.
  const puntuar = (s: Sesion): number => {
    const f = franjaLocalDe(s.inicio);
    const mismoDia = (porFranja.get(String(f.dow)) ?? 0) / asistidas.length;
    let mismaHora = 0;
    for (const [h, veces] of porHora) {
      if (Math.abs(h - f.hora) <= MARGEN_HORAS) mismaHora += veces;
    }
    mismaHora /= asistidas.length;
    const mismoTipo = (porTipo.get(s.tipoClaseId) ?? 0) / asistidas.length;
    return 2 * mismoDia + 2 * mismaHora + mismoTipo;
  };

  const mejor = [...candidatas].sort((a, b) => {
    const d = puntuar(b) - puntuar(a);
    return d !== 0 ? d : a.inicio.localeCompare(b.inicio);
  })[0];

  const f = franjaLocalDe(mejor.inicio);
  const vecesEseDia = porFranja.get(String(f.dow)) ?? 0;
  const vecesEseTipo = porTipo.get(mejor.tipoClaseId) ?? 0;

  // El motivo dice la razón MÁS FUERTE que sostiene esta clase, no todas.
  let motivo: string;
  if (vecesEseDia > 0) {
    motivo = `sueles entrenar ${DIAS[f.dow]} ${franjaDelDia(f.hora)}`;
  } else if (vecesEseTipo > 0) {
    const t = tipoDe(mejor.tipoClaseId);
    motivo = t ? `${t.nombre} es lo que más haces` : 'es la disciplina que más haces';
  } else {
    motivo = 'es la próxima con hueco que te cubre tu plan';
  }

  return {
    sesion: mejor,
    tipo: tipoDe(mejor.tipoClaseId),
    plazasLibres: libresDe(mejor),
    motivo,
    porCostumbre: vecesEseDia > 0 || vecesEseTipo > 0,
  };
}

/**
 * "hoy a las 18:00" · "mañana a las 18:00" · "el martes a las 20:00".
 *
 * En hora del estudio, y por DÍA NATURAL, no por horas de diferencia: una clase
 * a las 09:00 del día siguiente es "mañana" aunque falten 20 horas, y una a las
 * 23:00 de hoy es "hoy" aunque falten 11. Mismo criterio que `selloTemporal`
 * (lib/avisos-portal.ts) para que el portal hable siempre igual.
 */
export function cuandoSugerencia(inicioISO: string, now: Date): string {
  const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ_ESTUDIO });
  const inicio = new Date(inicioISO);
  const hora = inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ_ESTUDIO });

  const manana = new Date(now.getTime() + MS_DIA);
  if (dia(inicio) === dia(now)) return `hoy a las ${hora}`;
  if (dia(inicio) === dia(manana)) return `mañana a las ${hora}`;

  const diaSemana = inicio.toLocaleDateString('es-ES', { weekday: 'long', timeZone: TZ_ESTUDIO });
  return `el ${diaSemana} a las ${hora}`;
}

/**
 * Las alternativas a una clase que acaba de cancelar. Mismo criterio que
 * `sugerirClase` pero devolviendo varias y priorizando las del MISMO tipo:
 * quien cancela un Reformer quiere recuperar ese Reformer, no descubrir Mat.
 */
export function alternativasTras(
  cancelada: Sesion,
  e: EntradaSugerencia,
  limite = 3,
): SugerenciaClase[] {
  const resultado: SugerenciaClase[] = [];
  const yaPropuestas = new Set<string>();

  // Se llama repetidamente excluyendo lo ya propuesto: reutiliza toda la
  // elegibilidad (aforo, plan que cubre, no duplicar sitio) sin copiarla.
  for (let i = 0; i < limite; i++) {
    const sugerencia = sugerirClase({
      ...e,
      sesiones: e.sesiones.filter(s => !yaPropuestas.has(s.id) && s.id !== cancelada.id),
    });
    if (!sugerencia) break;
    resultado.push(sugerencia);
    yaPropuestas.add(sugerencia.sesion.id);
  }

  // Las del mismo tipo primero, conservando el orden de afinidad dentro de cada
  // grupo (sort estable en todos los motores modernos).
  return resultado.sort((a, b) => {
    const mismoA = a.sesion.tipoClaseId === cancelada.tipoClaseId ? 0 : 1;
    const mismoB = b.sesion.tipoClaseId === cancelada.tipoClaseId ? 0 : 1;
    return mismoA - mismoB;
  });
}
