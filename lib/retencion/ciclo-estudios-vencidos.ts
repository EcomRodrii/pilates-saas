// ─────────────────────────────────────────────────────────────────────────────
// Ciclo de vida de un estudio SIN CONTRATO — parte PURA.
//
// Dos motivos, la misma máquina (plazos ⚠️ pendientes de validación legal):
//
//   · prueba_vencida — la prueba local venció sin pagar. A los 30 días se dejan
//     de hacer copias y se avisa a la propietaria; a los 83, el último aviso; a
//     los 90, se borran sus datos personales.
//   · baja — un estudio de pago cuya suscripción terminó (2-oct-2026, decisión
//     del fundador para el contrato de encargo, art. 28.3.g RGPD). El mismo día
//     se avisa «tienes 30 días para descargar tus datos» y se dejan de hacer
//     copias; a los 23, el último aviso; a los 30, el borrado. El ancla es
//     `studios.contrato_terminado_en`, que pone un trigger mirando la
//     suscripción que manda (la de la cadena, si es sede): migr 20261003102645.
//     «O antes si lo pide»: con `studios.supresion_pedida_en` (lo escribe solo
//     el servidor, con el contrato ya terminado) la purga va en la pasada
//     siguiente, sin esperar a los avisos: es ella quien lo pide.
//
// El borrado real va apagado hasta que el abogado lo valide
// (`PURGA_ESTUDIOS_VENCIDOS=activa`), para los dos motivos.
//
// Aquí solo fechas y la máquina de fases, sin BD, para poder probarlas. Quien
// ejecuta es `avanzar-ciclo-estudios-vencidos.ts`; la guardia final vive en la
// BD (`purgar_estudio_vencido`).
//
// ⚠️ Un aviso NUNCA se salta y un paso NUNCA se adelanta: si el cron no corrió
// o un email no pudo salir, los pasos siguientes se corren para mantener los
// huecos. Borrar a quien no ha recibido el último aviso es justo lo que este
// ciclo existe para no hacer.
// ─────────────────────────────────────────────────────────────────────────────

/** ⚠️ LEGAL. Días desde `trial_ends_at` hasta el primer aviso (y fin de copias). */
export const DIAS_AVISO_CONSERVACION = 30;
/** ⚠️ LEGAL. Días desde `trial_ends_at` hasta el último aviso. */
export const DIAS_AVISO_FINAL = 83;
/** ⚠️ LEGAL. Días desde `trial_ends_at` hasta el borrado. */
export const DIAS_PURGA = 90;

/** ⚠️ LEGAL. Días desde `contrato_terminado_en` hasta el último aviso de una baja. */
export const DIAS_BAJA_AVISO_FINAL = 23;
/** ⚠️ LEGAL. Días desde `contrato_terminado_en` hasta el borrado: el plazo para descargar. */
export const DIAS_BAJA_PURGA = 30;

/** Hueco mínimo entre el primer aviso ENVIADO y el último (prueba vencida). */
export const HUECO_MINIMO_ENTRE_AVISOS_DIAS = DIAS_AVISO_FINAL - DIAS_AVISO_CONSERVACION;
/** Hueco mínimo entre el último aviso ENVIADO y el borrado (prueba vencida). */
export const HUECO_MINIMO_ANTES_DE_PURGA_DIAS = DIAS_PURGA - DIAS_AVISO_FINAL;

/** El informe de la purga no se recalcula más de una vez cada tantas horas. */
export const HORAS_ENTRE_INFORMES = 23;

/**
 * Estados de Stripe en los que la suscripción ya no existe. `unpaid` y
 * `past_due` NO: la suscripción sigue viva y Stripe aún puede cobrarla.
 */
export const ESTADOS_SUSCRIPCION_TERMINADA = ['canceled', 'incomplete_expired'] as const;

const MS_DIA = 86_400_000;

export type MotivoCiclo = 'prueba_vencida' | 'baja';
export type FaseCiclo = 'aviso_30' | 'aviso_baja' | 'aviso_final' | 'purga';

interface PlazosCiclo {
  /** Primera fase del ciclo: la que avisa y para las copias. */
  primeraFase: 'aviso_30' | 'aviso_baja';
  diasPrimerAviso: number;
  diasAvisoFinal: number;
  diasPurga: number;
}

export const PLAZOS_CICLO: Record<MotivoCiclo, PlazosCiclo> = {
  prueba_vencida: { primeraFase: 'aviso_30', diasPrimerAviso: DIAS_AVISO_CONSERVACION, diasAvisoFinal: DIAS_AVISO_FINAL, diasPurga: DIAS_PURGA },
  baja: { primeraFase: 'aviso_baja', diasPrimerAviso: 0, diasAvisoFinal: DIAS_BAJA_AVISO_FINAL, diasPurga: DIAS_BAJA_PURGA },
};

export interface EstudioCiclo {
  trialEndsAt: string | Date | null;
  subscriptionStatus: string | null;
  subscriptionId: string | null;
  /**
   * `studios.contrato_terminado_en`. Ya viene decidido por la BD con la
   * suscripción que manda (la de la cadena en una sede), así que aquí basta con
   * que exista: no se vuelve a mirar el estado.
   */
  contratoTerminadoEn?: string | Date | null;
  /** `studios.supresion_pedida_en`: la propietaria pidió borrar ya, con el contrato terminado. */
  supresionPedidaEn?: string | Date | null;
}

export interface FaseRegistrada {
  fase: FaseCiclo;
  ejecutadaEn: string | Date | null;
  canceladaEn: string | Date | null;
}

export type PasoCiclo =
  | { tipo: 'nada' }
  | { tipo: 'cancelar' }
  | { tipo: 'ejecutar'; motivo: MotivoCiclo; fase: FaseCiclo; programadaPara: Date; fechaPurga: Date };

function aFecha(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const masDias = (d: Date, dias: number) => new Date(d.getTime() + dias * MS_DIA);
const maxFecha = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);

/** Interruptor del borrado real. Cualquier otro valor = modo informe. */
export function purgaEstudiosActiva(env: Record<string, string | undefined>): boolean {
  return env.PURGA_ESTUDIOS_VENCIDOS?.trim() === 'activa';
}

/**
 * ¿Está este estudio en el ciclo de prueba vencida? Solo la prueba LOCAL
 * agotada: una suscripción de Stripe (aunque esté impagada) la gestiona Stripe,
 * y un estudio sin `trial_ends_at` nunca tuvo prueba que pudiera vencer.
 */
export function enCicloDeVencido(e: EstudioCiclo): boolean {
  return e.subscriptionStatus === 'trial_expirado' && !e.subscriptionId && aFecha(e.trialEndsAt) !== null;
}

/** ¿Terminó el contrato de pago de este estudio? La fecha la decide la BD. */
export function enBaja(e: EstudioCiclo): boolean {
  return aFecha(e.contratoTerminadoEn ?? null) !== null;
}

/** El ciclo en el que está el estudio ahora mismo, con su ancla; `null` si tiene contrato. */
export function cicloDelEstudio(e: EstudioCiclo): { motivo: MotivoCiclo; ancla: Date } | null {
  if (enCicloDeVencido(e)) return { motivo: 'prueba_vencida', ancla: aFecha(e.trialEndsAt)! };
  if (enBaja(e)) return { motivo: 'baja', ancla: aFecha(e.contratoTerminadoEn ?? null)! };
  return null;
}

/**
 * ¿Hay que dejar de copiar este estudio? Por fecha y no por «se envió el
 * aviso»: las copias paran aunque el email no haya podido salir. En una baja,
 * desde el primer día: el contrato ya terminó.
 */
export function copiaSuspendidaPorVencimiento(e: EstudioCiclo, ahora: Date = new Date()): boolean {
  const ciclo = cicloDelEstudio(e);
  if (!ciclo) return false;
  return ahora.getTime() >= masDias(ciclo.ancla, PLAZOS_CICLO[ciclo.motivo].diasPrimerAviso).getTime();
}

function ejecutada(registradas: FaseRegistrada[], fase: FaseCiclo): Date | null {
  const r = registradas.find(x => x.fase === fase && !x.canceladaEn);
  return aFecha(r?.ejecutadaEn ?? null);
}

/**
 * Fechas efectivas de cada paso. Parten del ancla y se corren si un paso
 * anterior salió tarde, para no acortar nunca el tiempo que la propietaria
 * tiene entre un aviso y el siguiente.
 */
export function fechasCiclo(
  ancla: Date, registradas: FaseRegistrada[], motivo: MotivoCiclo = 'prueba_vencida',
): { primerAviso: Date; avisoFinal: Date; purga: Date } {
  const p = PLAZOS_CICLO[motivo];
  const primerAviso = masDias(ancla, p.diasPrimerAviso);
  const primerHecho = ejecutada(registradas, p.primeraFase);
  const avisoFinal = maxFecha(
    masDias(ancla, p.diasAvisoFinal),
    masDias(primerHecho ?? primerAviso, p.diasAvisoFinal - p.diasPrimerAviso),
  );
  const avisoFinalHecho = ejecutada(registradas, 'aviso_final');
  const purga = maxFecha(
    masDias(ancla, p.diasPurga),
    masDias(avisoFinalHecho ?? avisoFinal, p.diasPurga - p.diasAvisoFinal),
  );
  return { primerAviso, avisoFinal, purga };
}

/**
 * Siguiente paso para un estudio. `registradas` son las filas de SU ciclo
 * actual (mismo motivo y misma ancla); las canceladas se ignoran.
 *
 * · Fuera de todo ciclo (tiene contrato) con algo vivo y sin purgar → cancelar.
 * · En un ciclo → el primer paso no hecho, solo si ya le toca.
 * · `fechaPurga` es la que se promete en el email si el paso se hace AHORA.
 */
export function siguientePaso(e: EstudioCiclo, registradas: FaseRegistrada[], ahora: Date = new Date()): PasoCiclo {
  const vivas = registradas.filter(r => !r.canceladaEn);
  const purgada = ejecutada(vivas, 'purga') !== null;

  const ciclo = cicloDelEstudio(e);
  if (!ciclo) {
    return vivas.length > 0 && !purgada ? { tipo: 'cancelar' } : { tipo: 'nada' };
  }
  if (purgada) return { tipo: 'nada' };

  const { motivo, ancla } = ciclo;
  // Borrado pedido por la propia propietaria: no hay plazo que respetar.
  const pedida = motivo === 'baja' ? aFecha(e.supresionPedidaEn ?? null) : null;
  if (pedida) return { tipo: 'ejecutar', motivo, fase: 'purga', programadaPara: pedida, fechaPurga: ahora };

  const primera = PLAZOS_CICLO[motivo].primeraFase;
  const f = fechasCiclo(ancla, vivas, motivo);
  const toca = (d: Date) => ahora.getTime() >= d.getTime();
  const conHecha = (fase: FaseCiclo): FaseRegistrada[] => [
    ...vivas.filter(r => r.fase !== fase),
    { fase, ejecutadaEn: ahora, canceladaEn: null },
  ];
  const ejecutar = (fase: FaseCiclo, programadaPara: Date, fechaPurga: Date): PasoCiclo =>
    ({ tipo: 'ejecutar', motivo, fase, programadaPara, fechaPurga });

  if (ejecutada(vivas, primera) === null) {
    if (!toca(f.primerAviso)) return { tipo: 'nada' };
    return ejecutar(primera, f.primerAviso, fechasCiclo(ancla, conHecha(primera), motivo).purga);
  }
  if (ejecutada(vivas, 'aviso_final') === null) {
    if (!toca(f.avisoFinal)) return { tipo: 'nada' };
    return ejecutar('aviso_final', f.avisoFinal, fechasCiclo(ancla, conHecha('aviso_final'), motivo).purga);
  }
  if (!toca(f.purga)) return { tipo: 'nada' };
  return ejecutar('purga', f.purga, f.purga);
}

/** ¿Toca recalcular el informe de una purga en modo informe? */
export function debeRecalcularInforme(actualizadoEn: string | Date | null, ahora: Date = new Date()): boolean {
  const d = aFecha(actualizadoEn);
  return !d || ahora.getTime() - d.getTime() >= HORAS_ENTRE_INFORMES * 3_600_000;
}

/** Misma instantánea del ancla (las cadenas de PostgREST y JS difieren en formato). */
export function mismaAncla(a: string | Date | null, b: string | Date | null): boolean {
  const x = aFecha(a), y = aFecha(b);
  return !!x && !!y && x.getTime() === y.getTime();
}

/** «24 de noviembre de 2026», en hora de España. */
export function formatearFechaAviso(d: Date): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(d);
}

export type FaseAviso = 'aviso_30' | 'aviso_baja' | 'aviso_final';

/**
 * `purgaArmada` = `purgaEstudiosActiva(process.env)`. Por defecto `false`, que
 * es como está producción hoy: sin él, el asunto del último aviso afirmaba un
 * borrado en una fecha concreta que ese día NO ocurre (solo se calcula un
 * informe). Es una declaración sobre los datos de una persona; tiene que ser
 * verdad. Ver `correoEstudioVencido` en lib/emails/tentare/cuenta.ts.
 */
export function asuntoAvisoEstudioVencido(
  fase: FaseAviso,
  fechaPurga: Date,
  purgaArmada = false,
): string {
  const fecha = formatearFechaAviso(fechaPurga);
  if (fase === 'aviso_baja') return `Tu suscripción ha terminado: descarga los datos de tu estudio antes del ${fecha}`;
  if (fase !== 'aviso_final') return `Conservaremos los datos de tu estudio hasta el ${fecha}`;
  return purgaArmada
    ? `Último aviso: los datos de tu estudio se borrarán el ${fecha}`
    : `Último aviso: conservamos los datos de tu estudio solo hasta el ${fecha}`;
}
