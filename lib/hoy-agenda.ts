// ─────────────────────────────────────────────────────────────────────────────
// «Hoy en el estudio» — la lectura operativa del día, pura y testeable.
//
// Esto NO es un motor nuevo: es una capa de composición sobre reglas que ya
// existían y estaban repartidas por el calendario. Todo lo que decide gravedad
// o color viene de `calendario-estado.ts` (`estadoSesion`, `PINTA`,
// `pideDecision`) y todo lo que cuenta plazas viene de `booking-logic.ts`
// (`plazasOcupadas`) y `ocupacion.ts` (`ratioOcupacion`). Si alguna de esas
// reglas cambia, esta pantalla cambia con ellas — que es justo lo que no pasaba
// cuando la home recalculaba su propio `pct` y su propio `fillColor` a mano.
//
// ⚠️ Ningún número de aquí se inventa. En particular «confirmadas» y
// «pendientes» NO son una estimación: salen de columnas reales
// (`reservas.confirmacion_pedida_en` / `confirmado_en`, migr 0059, y el estado
// PENDIENTE_APROBACION de la Fase 2a). Cuando el estudio no pide confirmación
// —que es el caso por defecto— la reserva CONFIRMADA cuenta como confirmada,
// porque eso es literalmente todo lo que el estudio sabe. Enseñar un
// «pendientes» calculado por otra vía sería el bug de
// `porcentaje-sin-respaldo-en-pantalla` otra vez.
//
// El aforo que se usa es `aforoMaximo` en bruto, el MISMO que pinta el
// calendario (`bloque-clase.tsx`). El aforo efectivo descontando máquinas
// averiadas (`aforoEfectivoSesion`) es cosa del camino de reserva y del radar
// de avisos; usarlo solo aquí haría que la home y el calendario dijeran dos
// cosas distintas del mismo 8/10. Se acepta un `aforo` explícito por si algún
// día se quiere unificar en los dos sitios a la vez.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlanTarifa, Reserva, Sesion, Socio, Suscripcion } from '@/lib/types';
import { estadoSesion, pideDecision, type EstadoSesion } from './calendario-estado.ts';
import { accionParaEstado, type TipoAccion } from './calendario-decisiones.ts';
import { candidatasParaHueco, plazasOcupadas } from './booking-logic.ts';
import { ratioOcupacion } from './ocupacion.ts';
import { franjaLocalDe } from './utils.ts';

/** Semáforo de la fila. Es una LECTURA, no un color: la pantalla lo expresa
 *  sobre todo con jerarquía y texto (punto 7 del encargo). */
export type SenalClase = 'PROBLEMA' | 'ATENCION' | 'OK';

/** Lo mínimo que necesita una sesión para entrar en la agenda. Se acepta
 *  `Sesion` entera, pero se pide solo esto para que los tests no tengan que
 *  fabricar la fila completa. `sustitucionAbierta` viene enriquecido desde
 *  `/api/calendario` (`enriquecerSesiones`): NO se puede deducir de la sesión,
 *  porque `sesiones.instructor_id` nunca se pone a null cuando la instructora
 *  avisa de que no puede venir. */
export interface SesionAgenda {
  id: string;
  tipoClaseId: string;
  salaId: string;
  instructorId: string;
  inicio: string;
  fin: string;
  aforoMaximo: number;
  cancelada: boolean;
  incidenciaTexto?: string | null;
  sustitucionAbierta?: boolean;
  motivoBaja?: string | null;
}

/** Una frase corta de por qué esta clase pide (o no) atención. El orden del
 *  array es el orden de gravedad, así que la fila puede enseñar solo la
 *  primera si no cabe más. */
export interface MotivoClase {
  clave:
    | 'sin-instructora' | 'incidencia' | 'conflicto' | 'sobreaforo' | 'sin-pasar-lista'
    | 'pendientes' | 'huecos' | 'espera-con-hueco' | 'oferta-viva' | 'espera'
    | 'canceladas' | 'cancelada' | 'completa';
  texto: string;
  tono: SenalClase;
}

export interface ClaseDelDia {
  sesionId: string;
  inicio: string;
  fin: string;
  tipoClaseId: string;
  salaId: string;
  instructorId: string;
  estado: EstadoSesion;
  senal: SenalClase;
  /** Acción única sugerida para este estado (misma tabla que usa la franja de
   *  decisiones del calendario). null = no hay nada que hacer. */
  accion: TipoAccion | null;
  aforo: number;
  /** CONFIRMADA + ASISTIDA: las que ocupan plaza de verdad. */
  ocupadas: number;
  asistidas: number;
  /** Las que sabemos que vienen (o que ya vinieron). */
  confirmadas: number;
  /** Las que están a la espera de que alguien conteste o apruebe. */
  pendientes: number;
  /** Canceladas + no presentadas de ESTA clase. */
  canceladas: number;
  noAsistio: number;
  enEspera: number;
  /** Reservas en espera con una oferta de plaza todavía viva. */
  ofertasVivas: number;
  huecos: number;
  sobreaforo: number;
  ratio: number;
  /** CONFIRMADA sin check-in. Solo significa algo con la clase terminada. */
  sinPasarLista: number;
  enCurso: boolean;
  finalizada: boolean;
  motivos: MotivoClase[];
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/**
 * Resume UNA clase: cuenta sus reservas, deriva su estado y decide su señal.
 *
 * `reservasSesion` deben ser ya solo las de esta sesión (el llamador tiene un
 * índice; recorrer la tabla entera por clase es el patrón O(n·m) que la home
 * vieja repetía en cada render).
 */
export function resumirClaseDelDia(
  sesion: SesionAgenda,
  reservasSesion: readonly Reserva[],
  ahora: Date,
  opciones?: { conflicto?: boolean; aforo?: number },
): ClaseDelDia {
  const aforo = opciones?.aforo ?? sesion.aforoMaximo;
  const ahoraMs = ahora.getTime();

  let asistidas = 0, confirmadasBrutas = 0, sinContestar = 0, pendientesAprobacion = 0;
  let canceladas = 0, noAsistio = 0, enEspera = 0, ofertasVivas = 0, sinPasarLista = 0;

  for (const r of reservasSesion) {
    switch (r.estado) {
      case 'ASISTIDA':
        asistidas++;
        break;
      case 'CONFIRMADA':
        confirmadasBrutas++;
        if (!r.checkInEn) sinPasarLista++;
        // Solo cuenta como «pendiente» si de verdad se le pidió confirmar y no
        // ha contestado. Sin petición no hay pregunta abierta.
        if (r.confirmacionPedidaEn && !r.confirmadoEn) sinContestar++;
        break;
      case 'PENDIENTE_APROBACION':
        pendientesAprobacion++;
        break;
      case 'LISTA_ESPERA':
        enEspera++;
        if (r.ofertaExpiraEn && new Date(r.ofertaExpiraEn).getTime() > ahoraMs) ofertasVivas++;
        break;
      case 'CANCELADA':
        canceladas++;
        break;
      case 'NO_ASISTIO':
        noAsistio++;
        break;
    }
  }

  const ocupadas = plazasOcupadas(sesion.id, reservasSesion);
  const huecos = Math.max(0, aforo - ocupadas);
  const sobreaforo = Math.max(0, ocupadas - aforo);
  const finalizada = ahoraMs >= new Date(sesion.fin).getTime();
  const enCurso = !finalizada && ahoraMs >= new Date(sesion.inicio).getTime();

  const estado = estadoSesion(
    { cancelada: sesion.cancelada, inicio: sesion.inicio, fin: sesion.fin, incidenciaTexto: sesion.incidenciaTexto },
    ahora,
    {
      sustitucionAbierta: sesion.sustitucionAbierta ?? false,
      conflicto: opciones?.conflicto ?? false,
      confirmadasSinCheckin: sinPasarLista,
    },
  );

  const decide = pideDecision(estado, { enEspera, sobreaforo, huecosLibres: huecos, finalizada });
  const accion = decide ? accionParaEstado(estado, { enEspera, sobreaforo, huecosLibres: huecos }) : null;

  const motivos: MotivoClase[] = [];
  if (estado === 'CANCELADA') {
    motivos.push({ clave: 'cancelada', texto: 'Clase cancelada', tono: 'OK' });
  } else {
    if (estado === 'SIN_INSTRUCTORA') {
      motivos.push({
        clave: 'sin-instructora',
        texto: finalizada ? 'Pasó sin instructora' : 'Sin instructora',
        tono: finalizada ? 'ATENCION' : 'PROBLEMA',
      });
    }
    if (sesion.incidenciaTexto) motivos.push({ clave: 'incidencia', texto: 'Incidencia abierta', tono: 'PROBLEMA' });
    if (opciones?.conflicto) motivos.push({ clave: 'conflicto', texto: 'Conflicto de sala', tono: 'PROBLEMA' });
    if (sobreaforo > 0) {
      motivos.push({ clave: 'sobreaforo', texto: `${sobreaforo} por encima del aforo`, tono: 'PROBLEMA' });
    }
    if (estado === 'SIN_PASAR_LISTA') {
      motivos.push({ clave: 'sin-pasar-lista', texto: `Falta pasar lista a ${plural(sinPasarLista, 'alumna', 'alumnas')}`, tono: 'PROBLEMA' });
    }
    const pendientes = sinContestar + pendientesAprobacion;
    if (pendientes > 0) {
      motivos.push({
        clave: 'pendientes',
        texto: pendientesAprobacion > 0 && sinContestar === 0
          ? `${plural(pendientesAprobacion, 'reserva', 'reservas')} por aprobar`
          : `${plural(pendientes, 'pendiente', 'pendientes')} de confirmar`,
        tono: 'ATENCION',
      });
    }
    if (ofertasVivas > 0) {
      motivos.push({ clave: 'oferta-viva', texto: `${plural(ofertasVivas, 'plaza ofrecida', 'plazas ofrecidas')}`, tono: 'ATENCION' });
    }
    if (!finalizada && huecos > 0) {
      motivos.push(
        enEspera > ofertasVivas
          ? { clave: 'espera-con-hueco', texto: `${plural(huecos, 'hueco', 'huecos')} y ${enEspera} en espera`, tono: 'PROBLEMA' }
          : { clave: 'huecos', texto: `${plural(huecos, 'hueco', 'huecos')}`, tono: 'ATENCION' },
      );
    } else if (enEspera > 0) {
      motivos.push({ clave: 'espera', texto: `${enEspera} en lista de espera`, tono: 'OK' });
    }
    // Quién ha dicho que no viene. Va en tono neutro a propósito: una baja no
    // es un problema por sí sola —el problema es el hueco que deja, y ese ya
    // está contado arriba—, pero la propietaria pidió verlo para entender por
    // qué una clase que ayer estaba llena hoy tiene sitio.
    if (!finalizada && canceladas + noAsistio > 0) {
      motivos.push({
        clave: 'canceladas',
        texto: `${plural(canceladas + noAsistio, 'cancelación', 'cancelaciones')}`,
        tono: 'OK',
      });
    }
    if (motivos.length === 0 && huecos === 0 && ocupadas > 0) {
      motivos.push({ clave: 'completa', texto: 'Completa', tono: 'OK' });
    }
  }

  const senal: SenalClase = motivos.some(m => m.tono === 'PROBLEMA')
    ? 'PROBLEMA'
    : motivos.some(m => m.tono === 'ATENCION') ? 'ATENCION' : 'OK';

  return {
    sesionId: sesion.id,
    inicio: sesion.inicio,
    fin: sesion.fin,
    tipoClaseId: sesion.tipoClaseId,
    salaId: sesion.salaId,
    instructorId: sesion.instructorId,
    estado,
    senal,
    accion,
    aforo,
    ocupadas,
    asistidas,
    confirmadas: asistidas + (confirmadasBrutas - sinContestar),
    pendientes: sinContestar + pendientesAprobacion,
    canceladas: canceladas + noAsistio,
    noAsistio,
    enEspera,
    ofertasVivas,
    huecos,
    sobreaforo,
    ratio: ratioOcupacion(ocupadas, aforo),
    sinPasarLista,
    enCurso,
    finalizada,
    motivos,
  };
}

/**
 * El día entero, en orden cronológico. Las canceladas se quedan (que una clase
 * de hoy esté cancelada es información, no ruido) pero no suman en el resumen.
 */
export function construirAgendaDelDia(params: {
  sesiones: readonly SesionAgenda[];
  reservas: readonly Reserva[];
  ahora: Date;
  /** ids de sesiones con choque de sala/instructora (detectarConflictos). */
  conflictos?: ReadonlySet<string>;
}): ClaseDelDia[] {
  const porSesion = new Map<string, Reserva[]>();
  for (const r of params.reservas) {
    const lista = porSesion.get(r.sesionId);
    if (lista) lista.push(r); else porSesion.set(r.sesionId, [r]);
  }
  return params.sesiones
    .map(s => resumirClaseDelDia(s, porSesion.get(s.id) ?? [], params.ahora, {
      conflicto: params.conflictos?.has(s.id) ?? false,
    }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export interface ResumenDelDia {
  clases: number;
  alumnas: number;
  huecos: number;
  pendientes: number;
  problemas: number;
  canceladas: number;
}

/** El resumen de la cabecera. Deliberadamente cuatro cifras y ninguna gráfica:
 *  es contexto de la agenda, no un panel de KPIs (punto 10 del encargo). */
export function resumirDia(clases: readonly ClaseDelDia[]): ResumenDelDia {
  let alumnas = 0, huecos = 0, pendientes = 0, problemas = 0, canceladas = 0, activas = 0;
  for (const c of clases) {
    if (c.estado === 'CANCELADA') { canceladas++; continue; }
    activas++;
    alumnas += c.ocupadas;
    if (!c.finalizada) huecos += c.huecos;
    pendientes += c.pendientes;
    if (c.senal === 'PROBLEMA') problemas++;
  }
  return { clases: activas, alumnas, huecos, pendientes, problemas, canceladas };
}

/** La clase que está pasando ahora mismo, si hay alguna. */
export function claseEnCurso(clases: readonly ClaseDelDia[]): ClaseDelDia | null {
  return clases.find(c => c.enCurso && c.estado !== 'CANCELADA') ?? null;
}

/** La siguiente que empieza. null si ya no queda ninguna hoy. */
export function proximaClase(clases: readonly ClaseDelDia[], ahora: Date): ClaseDelDia | null {
  const ms = ahora.getTime();
  return clases.find(c => c.estado !== 'CANCELADA' && new Date(c.inicio).getTime() > ms) ?? null;
}

// ── Rellenar hueco ───────────────────────────────────────────────────────────

export type MotivoCandidata = 'LISTA_ESPERA' | 'SUELE_VENIR' | 'YA_VINO_A_ESTA_CLASE' | 'BONO_ACTIVO';

export interface CandidataHueco {
  socioId: string;
  /** En orden de peso: lo primero es lo que la pantalla enseña como razón. */
  motivos: MotivoCandidata[];
  posicionEspera: number | null;
}

const MS_SEMANA = 7 * 24 * 3600_000;
const SEMANAS_COSTUMBRE = 8;
const VISITAS_PARA_COSTUMBRE = 2;

/**
 * A quién ofrecerle el hueco, y POR QUÉ.
 *
 * No hay motor de recomendación nuevo: las dos reglas duras
 * —tiene derecho a reservar ESTA clase, y ya ha venido antes a este tipo— son
 * literalmente `candidatasParaHueco` (`booking-logic.ts`), la misma que usa el
 * radar que manda los WhatsApp. Lo único que se añade aquí es el ORDEN y la
 * frase, que es lo que faltaba para que la propietaria pueda decidir en vez de
 * disparar a todas.
 *
 * Quien ya está en lista de espera va primero y aparte: `candidatasParaHueco`
 * la excluye a propósito (ya tiene una reserva activa en esa sesión), pero
 * ofrecerle a ella el hueco que acaba de salir es exactamente lo que el
 * estudio quiere hacer primero.
 */
export function candidatasParaRellenar(params: {
  sesion: Sesion;
  sesiones: readonly Sesion[];
  socios: readonly Socio[];
  reservas: readonly Reserva[];
  suscripciones: readonly Suscripcion[];
  planesTarifa: readonly PlanTarifa[];
  hoyISO: string;
  ahora: Date;
  limite?: number;
}): CandidataHueco[] {
  const { sesion, sesiones, socios, reservas, suscripciones, planesTarifa, hoyISO, ahora } = params;

  // 1) Lista de espera de ESTA clase, por posición.
  const espera = reservas
    .filter(r => r.sesionId === sesion.id && r.estado === 'LISTA_ESPERA')
    .sort((a, b) => (a.posicionEspera ?? 0) - (b.posicionEspera ?? 0))
    .map<CandidataHueco>(r => ({
      socioId: r.socioId,
      motivos: ['LISTA_ESPERA'],
      posicionEspera: r.posicionEspera ?? null,
    }));
  const yaListadas = new Set(espera.map(c => c.socioId));

  // 2) Costumbre horaria: quién ha venido a ESTA franja (mismo día de la semana
  //    y misma hora, en hora del estudio) en las últimas semanas. Es la señal
  //    que ya usa el portal para sugerir clase (`franjaLocalDe`), no una nueva.
  const franja = franjaLocalDe(sesion.inicio);
  const desdeMs = ahora.getTime() - SEMANAS_COSTUMBRE * MS_SEMANA;
  const inicioPorSesion = new Map(sesiones.map(s => [s.id, s.inicio]));
  const visitasEnFranja = new Map<string, number>();
  for (const r of reservas) {
    if (r.estado !== 'ASISTIDA' || r.sesionId === sesion.id) continue;
    const inicio = inicioPorSesion.get(r.sesionId);
    if (!inicio) continue;
    const ms = new Date(inicio).getTime();
    if (ms < desdeMs || ms > ahora.getTime()) continue;
    const f = franjaLocalDe(inicio);
    if (f.dow !== franja.dow || f.hora !== franja.hora) continue;
    visitasEnFranja.set(r.socioId, (visitasEnFranja.get(r.socioId) ?? 0) + 1);
  }

  // 3) El resto de candidatas, con las reglas de negocio ya existentes.
  const resto = candidatasParaHueco({
    sesion,
    sesiones: sesiones as Sesion[],
    socios: socios as Socio[],
    reservas: reservas as Reserva[],
    suscripciones: suscripciones as Suscripcion[],
    planesTarifa: planesTarifa as PlanTarifa[],
    hoyISO,
  })
    .filter(s => !yaListadas.has(s.id))
    .map<CandidataHueco>(s => {
      const habitual = (visitasEnFranja.get(s.id) ?? 0) >= VISITAS_PARA_COSTUMBRE;
      return {
        socioId: s.id,
        // `candidatasParaHueco` ya garantiza las dos: bono vigente para este
        // tipo de clase y una asistencia previa al mismo tipo.
        motivos: habitual
          ? ['SUELE_VENIR', 'YA_VINO_A_ESTA_CLASE', 'BONO_ACTIVO']
          : ['YA_VINO_A_ESTA_CLASE', 'BONO_ACTIVO'],
        posicionEspera: null,
      };
    })
    .sort((a, b) => {
      const ha = a.motivos[0] === 'SUELE_VENIR' ? 0 : 1;
      const hb = b.motivos[0] === 'SUELE_VENIR' ? 0 : 1;
      return ha - hb;
    });

  const todas = [...espera, ...resto];
  return params.limite ? todas.slice(0, params.limite) : todas;
}

// Cortas a propósito: en el panel van una detrás de otra en una fila estrecha,
// y una frase larga se corta a mitad («Tiene bono o plan a…»), que es peor que
// no decirla.
export const TEXTO_MOTIVO_CANDIDATA: Record<MotivoCandidata, string> = {
  LISTA_ESPERA: 'En lista de espera',
  SUELE_VENIR: 'Suele venir a esta hora',
  YA_VINO_A_ESTA_CLASE: 'Ya ha venido antes',
  BONO_ACTIVO: 'Bono activo',
};
