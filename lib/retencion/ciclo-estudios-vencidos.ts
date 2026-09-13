// ─────────────────────────────────────────────────────────────────────────────
// Ciclo de vida de un estudio cuya prueba venció sin pagar — parte PURA.
//
// Decisión del usuario (plazos ⚠️ pendientes de validación legal): a los 30 días
// de vencer se dejan de hacer copias y se avisa a la propietaria; a los 83, el
// último aviso; a los 90, se borran sus datos personales. El borrado real va
// apagado hasta que el abogado lo valide (`PURGA_ESTUDIOS_VENCIDOS=activa`).
//
// Aquí solo fechas y la máquina de fases, sin BD, para poder probarlas. Quien
// ejecuta es `avanzar-ciclo-estudios-vencidos.ts`; la guardia final vive en la
// BD (`purgar_estudio_vencido`, migr 20260913172100).
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

/** Hueco mínimo entre el primer aviso ENVIADO y el último. */
export const HUECO_MINIMO_ENTRE_AVISOS_DIAS = DIAS_AVISO_FINAL - DIAS_AVISO_CONSERVACION;
/** Hueco mínimo entre el último aviso ENVIADO y el borrado. */
export const HUECO_MINIMO_ANTES_DE_PURGA_DIAS = DIAS_PURGA - DIAS_AVISO_FINAL;

/** El informe de la purga no se recalcula más de una vez cada tantas horas. */
export const HORAS_ENTRE_INFORMES = 23;

const MS_DIA = 86_400_000;

export type FaseCiclo = 'aviso_30' | 'aviso_final' | 'purga';

export interface EstudioCiclo {
  trialEndsAt: string | Date | null;
  subscriptionStatus: string | null;
  subscriptionId: string | null;
}

export interface FaseRegistrada {
  fase: FaseCiclo;
  ejecutadaEn: string | Date | null;
  canceladaEn: string | Date | null;
}

export type PasoCiclo =
  | { tipo: 'nada' }
  | { tipo: 'cancelar' }
  | { tipo: 'ejecutar'; fase: FaseCiclo; programadaPara: Date; fechaPurga: Date };

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
 * ¿Está este estudio dentro del ciclo? Solo la prueba LOCAL agotada: una
 * suscripción de Stripe (aunque esté impagada) la gestiona Stripe, y un estudio
 * sin `trial_ends_at` nunca tuvo prueba que pudiera vencer.
 */
export function enCicloDeVencido(e: EstudioCiclo): boolean {
  return e.subscriptionStatus === 'trial_expirado' && !e.subscriptionId && aFecha(e.trialEndsAt) !== null;
}

/**
 * ¿Hay que dejar de copiar este estudio? Por fecha y no por «se envió el
 * aviso»: las copias paran aunque el email no haya podido salir.
 */
export function copiaSuspendidaPorVencimiento(e: EstudioCiclo, ahora: Date = new Date()): boolean {
  if (!enCicloDeVencido(e)) return false;
  const fin = aFecha(e.trialEndsAt)!;
  return ahora.getTime() >= masDias(fin, DIAS_AVISO_CONSERVACION).getTime();
}

function ejecutada(registradas: FaseRegistrada[], fase: FaseCiclo): Date | null {
  const r = registradas.find(x => x.fase === fase && !x.canceladaEn);
  return aFecha(r?.ejecutadaEn ?? null);
}

/**
 * Fechas efectivas de cada paso. Parten de `trial_ends_at` y se corren si un
 * paso anterior salió tarde, para no acortar nunca el tiempo que la propietaria
 * tiene entre un aviso y el siguiente.
 */
export function fechasCiclo(
  trialEndsAt: Date, registradas: FaseRegistrada[],
): { aviso30: Date; avisoFinal: Date; purga: Date } {
  const aviso30 = masDias(trialEndsAt, DIAS_AVISO_CONSERVACION);
  const aviso30Hecho = ejecutada(registradas, 'aviso_30');
  const avisoFinal = maxFecha(
    masDias(trialEndsAt, DIAS_AVISO_FINAL),
    masDias(aviso30Hecho ?? aviso30, HUECO_MINIMO_ENTRE_AVISOS_DIAS),
  );
  const avisoFinalHecho = ejecutada(registradas, 'aviso_final');
  const purga = maxFecha(
    masDias(trialEndsAt, DIAS_PURGA),
    masDias(avisoFinalHecho ?? avisoFinal, HUECO_MINIMO_ANTES_DE_PURGA_DIAS),
  );
  return { aviso30, avisoFinal, purga };
}

/**
 * Siguiente paso para un estudio. `registradas` son las filas de SU ciclo
 * actual (mismo `trial_ends_at`); las canceladas se ignoran.
 *
 * · Fuera del ciclo (pagó) con algo vivo y sin purgar → cancelar.
 * · En el ciclo → el primer paso no hecho, solo si ya le toca.
 * · `fechaPurga` es la que se promete en el email si el paso se hace AHORA.
 */
export function siguientePaso(e: EstudioCiclo, registradas: FaseRegistrada[], ahora: Date = new Date()): PasoCiclo {
  const vivas = registradas.filter(r => !r.canceladaEn);
  const purgada = ejecutada(vivas, 'purga') !== null;

  if (!enCicloDeVencido(e)) {
    return vivas.length > 0 && !purgada ? { tipo: 'cancelar' } : { tipo: 'nada' };
  }
  if (purgada) return { tipo: 'nada' };

  const fin = aFecha(e.trialEndsAt)!;
  const f = fechasCiclo(fin, vivas);
  const toca = (d: Date) => ahora.getTime() >= d.getTime();
  const conHecha = (fase: FaseCiclo): FaseRegistrada[] => [
    ...vivas.filter(r => r.fase !== fase),
    { fase, ejecutadaEn: ahora, canceladaEn: null },
  ];

  if (ejecutada(vivas, 'aviso_30') === null) {
    if (!toca(f.aviso30)) return { tipo: 'nada' };
    return { tipo: 'ejecutar', fase: 'aviso_30', programadaPara: f.aviso30, fechaPurga: fechasCiclo(fin, conHecha('aviso_30')).purga };
  }
  if (ejecutada(vivas, 'aviso_final') === null) {
    if (!toca(f.avisoFinal)) return { tipo: 'nada' };
    return { tipo: 'ejecutar', fase: 'aviso_final', programadaPara: f.avisoFinal, fechaPurga: fechasCiclo(fin, conHecha('aviso_final')).purga };
  }
  if (!toca(f.purga)) return { tipo: 'nada' };
  return { tipo: 'ejecutar', fase: 'purga', programadaPara: f.purga, fechaPurga: f.purga };
}

/** ¿Toca recalcular el informe de una purga en modo informe? */
export function debeRecalcularInforme(actualizadoEn: string | Date | null, ahora: Date = new Date()): boolean {
  const d = aFecha(actualizadoEn);
  return !d || ahora.getTime() - d.getTime() >= HORAS_ENTRE_INFORMES * 3_600_000;
}

/** Misma instantánea de `trial_ends_at` (las cadenas de PostgREST y JS difieren en formato). */
export function mismaAncla(a: string | Date | null, b: string | Date | null): boolean {
  const x = aFecha(a), y = aFecha(b);
  return !!x && !!y && x.getTime() === y.getTime();
}

/** «24 de noviembre de 2026», en hora de España. */
export function formatearFechaAviso(d: Date): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(d);
}

export function asuntoAvisoEstudioVencido(fase: 'aviso_30' | 'aviso_final', fechaPurga: Date): string {
  const fecha = formatearFechaAviso(fechaPurga);
  return fase === 'aviso_final'
    ? `Último aviso: los datos de tu estudio se borrarán el ${fecha}`
    : `Conservaremos los datos de tu estudio hasta el ${fecha}`;
}
