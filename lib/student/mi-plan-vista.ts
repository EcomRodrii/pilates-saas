// Lo que dicen Mi plan, «Lo tuyo» (Inicio) y Recibos (6-oct-2026, maqueta «Clase fija y bonos, ordenados»).
// Puro, sin `@/` y con imports relativos con `.ts`: lo prueba `node --test` (mi-plan-vista.test.ts).
//
// ⚠️ La regla de siempre en esta app: sin un dato que lo sostenga, no se dice. «Próxima renovación» solo para una cuota
// que de verdad se renueva (el cron renueva las MENSUAL activas sin `baja_al_vencer`, el día siguiente a su fin), y
// «Lo cobrará tu banco» solo cuando el servidor dice que lo cobra el banco.

import { addDias, etiquetaDia, euros, fechaCorta } from './formato.ts';
import { esCuota } from './bono-cubre.ts';
import { primerDiaDeCobro } from '../billing/renovacion-adoptable.ts';
import type { CobroDeReciboAlumna } from '../billing/cobro-recibo-alumna.ts';
import type { FamiliaProducto } from './tienda.ts';
import type { Bono, Pago, PlazaFijaVista } from './tipos.ts';
import { nombreDia } from './plaza-fija.ts';
import { pagosPendientes } from './pagos-agrupados.ts';

/** «31 oct», sin el día de la semana. */
export function diaMes(iso: string): string {
  return fechaCorta(iso.slice(0, 10)).split(' ').slice(1).join(' ');
}

function diasHasta(hoy: string, fecha: string): number {
  return Math.round((Date.parse(`${fecha.slice(0, 10)}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
}

// ── La cuota ────────────────────────────────────────────────────────────────

/**
 * La línea de la vigencia de una cuota.
 *   · «Próxima renovación: 1 nov · 89 €» — una MENSUAL activa sin baja programada: el cron de renovaciones genera su
 *     recibo el día siguiente a su fin (`primerDiaDeCobro`), por el precio de su plan.
 *   · «Termina el 31 oct · no se renueva» — con baja programada (`baja_al_vencer`).
 *   · «Vigente hasta el 31 oct» — cuando no se sabe si se renueva (sin tipo de plan).
 *   · «Sin fecha de fin».
 */
export function textoRenovacionCuota(c: Pick<Bono, 'expiraEn' | 'bajaAlVencer' | 'tipoPlan' | 'precio' | 'estado'>): string {
  if (!c.expiraEn) return 'Sin fecha de fin';
  if (c.bajaAlVencer) return `Termina el ${diaMes(c.expiraEn)} · no se renueva`;
  if (c.tipoPlan === 'MENSUAL' && c.estado === 'activo') {
    const cuando = diaMes(primerDiaDeCobro(c.expiraEn.slice(0, 10)));
    return c.precio > 0 ? `Próxima renovación: ${cuando} · ${euros(c.precio)}` : `Próxima renovación: ${cuando}`;
  }
  return `Vigente hasta el ${diaMes(c.expiraEn)}`;
}

/** «Próxima renovación: 1 nov» sin importe, para la línea corta de Inicio. */
export function textoRenovacionCorto(c: Pick<Bono, 'expiraEn' | 'bajaAlVencer' | 'tipoPlan' | 'precio' | 'estado'>): string {
  return textoRenovacionCuota({ ...c, precio: 0 });
}

/**
 * Debajo de «Esta semana 1 de 2»: lo que le queda HASTA EL DOMINGO (la semana del tope va de lunes a lunes en la hora
 * del estudio, `lib/student/semana-cuota.ts`). Con el tope ya lleno, se dice; pasado (el estudio la apuntó a mano), igual.
 */
export function textoQuedaSemana(s: { limite: number | null; cuentan: number }): string | null {
  if (s.limite === null) return null;
  const quedan = s.limite - s.cuentan;
  if (quedan <= 0) return 'Ya tienes todas las de esta semana.';
  return quedan === 1 ? 'Te queda 1 clase hasta el domingo.' : `Te quedan ${quedan} clases hasta el domingo.`;
}

// ── El bono ─────────────────────────────────────────────────────────────────

/** «7 de 10 sesiones», «7 sesiones» (sin «de» verdadero), «1 sesión». Lo que dice el anillo, sin la cifra suelta. */
export function textoSaldoDe(saldo: { quedan: number; de: number | null }): string {
  const ud = (n: number) => (n === 1 ? 'sesión' : 'sesiones');
  return saldo.de != null ? `${saldo.quedan} de ${saldo.de} ${ud(saldo.de)}` : `${saldo.quedan} ${ud(saldo.quedan)}`;
}

/** La etiqueta de caducidad del bono: «Caduca en 26 días», «Caduca mañana», «Caduca hoy». `aviso` = en una semana o menos. */
export function etiquetaCaducidad(b: Pick<Bono, 'expiraEn'>, hoy: string): { texto: string; aviso: boolean; dias: number } | null {
  if (!b.expiraEn) return null;
  const n = diasHasta(hoy, b.expiraEn);
  if (n < 0) return null;
  const texto = n === 0 ? 'Caduca hoy' : n === 1 ? 'Caduca mañana' : `Caduca en ${n} días`;
  return { texto, aviso: n <= 7, dias: n };
}

/** «Hasta el 31 oct» o «Sin caducidad». */
export function textoHasta(b: Pick<Bono, 'expiraEn'>): string {
  return b.expiraEn ? `Hasta el ${diaMes(b.expiraEn)}` : 'Sin caducidad';
}

/** Con cuota y bono a la vez, cuál se usa primero («la mensual gana», `bonoParaClase`). */
export const SE_USA_SI_LA_CUOTA_NO_CUBRE = 'Se usa cuando tu cuota no cubre la clase.';

// ── La clase fija ───────────────────────────────────────────────────────────

/**
 * El resumen de su clase fija, en el MISMO formato en Inicio y en Mi plan: «lunes 10:00» y «Próxima: mañana». Con varias,
 * «lunes 10:00 · jueves 18:00» y la más cercana. En pausa o sin clase en ese horario, se dice en vez de la próxima.
 */
export function resumenClaseFija(fijas: readonly PlazaFijaVista[], hoy: string): { titulo: string; dias: string; sub: string | null } | null {
  if (fijas.length === 0) return null;
  const dias = fijas.map((p) => `${nombreDia(p.diaSemana)} ${p.hora}`).join(' · ');
  const titulo = fijas.length === 1 ? 'Tu clase fija' : 'Tus clases fijas';
  const enPausa = fijas.filter((p) => p.pausa?.enCurso || p.estado === 'PAUSADA');
  const proximas = fijas.map((p) => p.proximas[0]?.fecha ?? p.proximaFecha).filter((f): f is string => !!f).sort();
  let sub: string | null = null;
  if (proximas[0]) sub = `Próxima: ${etiquetaDia(proximas[0], hoy).toLowerCase()}`;
  else if (enPausa.length === fijas.length) {
    const hasta = enPausa[0].pausa?.enCurso ? enPausa[0].pausa.hasta : null;
    sub = hasta ? `En pausa hasta el ${diaMes(hasta)}` : 'En pausa';
  } else if (fijas.every((p) => p.sinClase)) sub = 'Ahora no hay clase en ese horario';
  return { titulo, dias, sub };
}

// ── Recuperaciones ──────────────────────────────────────────────────────────

export function textoRecuperaciones(r: { disponibles: number; proximaCaducidad: string | null }): { titulo: string; sub: string | null } | null {
  if (r.disponibles <= 0) return null;
  return {
    titulo: r.disponibles === 1 ? '1 clase por recuperar' : `${r.disponibles} clases por recuperar`,
    sub: r.proximaCaducidad ? `${r.disponibles === 1 ? 'Caduca' : 'La primera caduca'} el ${diaMes(r.proximaCaducidad)}` : null,
  };
}

// ── La tienda ───────────────────────────────────────────────────────────────

const NOMBRE_FAMILIA: [FamiliaProducto, string][] = [
  ['bono', 'bonos'], ['suscripcion', 'cuotas'], ['suelta', 'clases sueltas'], ['servicio', 'sesiones'], ['producto', 'productos'],
];

/** «Bonos, cuotas y clases sueltas»: lo que de verdad vende ESTE estudio, en el orden de la tienda. `null` = nada. */
export function subtituloTienda(productos: readonly { familia: FamiliaProducto }[]): string | null {
  const hay = new Set(productos.map((p) => p.familia));
  const nombres = NOMBRE_FAMILIA.filter(([f]) => hay.has(f)).map(([, n]) => n);
  if (nombres.length === 0) return null;
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  return lista.charAt(0).toUpperCase() + lista.slice(1);
}

// ── Recibos: lo que debe y quién lo cobra ───────────────────────────────────

/** Lo que debe, con quién lo cobra (lo decide el servidor). Los que puede pagar ella, primero; luego el más antiguo. */
export function recibosQueDebe(pagos: readonly Pago[]): (Pago & { cobro: CobroDeReciboAlumna })[] {
  return pagos
    .filter((p): p is Pago & { cobro: CobroDeReciboAlumna } => !!p.cobro)
    .sort((a, b) => {
      const pa = a.cobro.como === 'APP' ? 0 : 1;
      const pb = b.cobro.como === 'APP' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (a.vence ?? a.fecha ?? '').localeCompare(b.vence ?? b.fecha ?? '');
    });
}

/**
 * ¿Hay algo que debe y que NO se paga desde la app (lo cobra el banco, su tarjeta, está en pausa…) o de lo que el servidor
 * no ha podido decir quién lo cobra? Entonces «Renovar mi plan» no se ofrece: reutilizaría ESE recibo de renovación y lo
 * abriría a pagar con tarjeta, saltándose lo que dice el servidor.
 */
export function hayDeudaQueNoSePagaAqui(pagos: readonly Pago[], deudas: readonly Pago[]): boolean {
  return deudas.some((d) => {
    const p = pagos.find((x) => x.id === d.id);
    return !p?.cobro || p.cobro.como !== 'APP';
  });
}

/** Lo que puede pagar ella desde la app ahora mismo. */
export function recibosPagables(pagos: readonly Pago[]): (Pago & { cobro: CobroDeReciboAlumna })[] {
  return recibosQueDebe(pagos).filter((p) => p.cobro.como === 'APP');
}

/**
 * Lo que se dice de un recibo que NO se paga desde la app. `null` para los que sí (llevan el botón).
 * ⚠️ «Lo cobrará tu banco» solo cuando el servidor dice que lo cobra el banco: es la frase que evita pagarlo dos veces.
 */
export function textoCobro(c: CobroDeReciboAlumna, hoy: string): string | null {
  const el = (f: string | null) => {
    if (!f) return '';
    if (f <= hoy) return ' en los próximos días';
    if (f === addDias(hoy, 1)) return ' mañana';
    return ` el ${diaMes(f)}`;
  };
  switch (c.como) {
    case 'APP': return null;
    case 'BANCO':
      // La remesa la prepara el estudio a mano: su fecha no se sabe y no se promete. La del SEPA del cobro diario, sí.
      if (c.via === 'remesa') {
        return c.cuandoVenza
          ? 'Tu estudio lo pasará a tu banco cuando venza tu cuota. No tienes que hacer nada.'
          : 'Tu estudio lo pasará a tu banco. No tienes que hacer nada.';
      }
      return `Lo cobrará tu banco${el(c.desde)}. No tienes que hacer nada.`;
    case 'TARJETA': return `Se cobrará de tu tarjeta guardada${el(c.desde)}. No tienes que hacer nada.`;
    case 'EN_MARCHA': return 'Se está cobrando ahora mismo. Si no se completa, podrás pagarlo aquí.';
    case 'ESTUDIO':
      return c.motivo === 'cuota-en-pausa' ? 'Tu cuota está en pausa. Habla con tu estudio para reanudarla.'
        : c.motivo === 'pendiente-estudio' ? 'Tu estudio todavía tiene que revisarlo: aún no tienes que pagarlo.'
          : 'Págalo en el estudio.';
  }
}

/** «Vence el 5 oct» / «Venció el 5 oct». */
export function textoVence(vence: string, hoy: string): string {
  return `${vence < hoy ? 'Venció' : 'Vence'} el ${diaMes(vence)}`;
}

/** «Cuota de octubre · vence el 5 oct», o solo el concepto si no hay vencimiento. */
export function lineaRecibo(p: Pick<Pago, 'concepto' | 'vence'>, hoy: string): string {
  if (!p.vence) return p.concepto;
  return `${p.concepto} · ${textoVence(p.vence, hoy).toLowerCase()}`;
}

/** «Ver tu cuota» o «Ver tu bono» según lo que es (la palabra de cada cosa, nunca «bono» para una cuota). */
export function verLoQueEs(b: Pick<Bono, 'creditosTotales' | 'tipoPlan'> | null | undefined): string {
  return esCuota(b) ? 'Ver tu cuota' : 'Ver tu bono';
}

/**
 * El recibo que debe de SU cuota, para la línea de la cuota (Inicio y Mi plan), y cómo se dice. Primero el que puede pagar
 * ella; si lo cobra otro (su banco, su tarjeta guardada, el estudio), `aviso` es la MISMA frase que Recibos
 * (`textoCobro`): «Pendiente de pago» al lado de «Lo cobrará tu banco… No tienes que hacer nada» era decirle dos cosas.
 * Sin `cobro` del servidor (no se pudo leer), `aviso` es `null` y se dice «pendiente», que es lo único seguro.
 */
export function deudaDeLaCuota(
  pagos: readonly Pago[], cuotaId: string, hoy: string,
): { reciboId: string; concepto: string; importe: number; pagaElla: boolean; aviso: string | null } | null {
  const suyos = pagosPendientes(pagos).filter((p) => p.bonoId === cuotaId);
  const p = suyos.find((x) => x.cobro?.como === 'APP') ?? suyos[0];
  if (!p) return null;
  const pagaElla = p.cobro?.como === 'APP';
  return { reciboId: p.id, concepto: p.concepto, importe: p.importe, pagaElla, aviso: p.cobro && !pagaElla ? textoCobro(p.cobro, hoy) : null };
}

export interface PorPagar {
  reciboId: string; concepto: string; importe: number; vence: string | null;
  /** Es SU renovación sin cobro automático (`renovacionPorPagar` del servidor): se dice por qué no se cobró sola. */
  esRenovacion: boolean;
}

/**
 * Lo que puede pagar ella desde la app, lo primero de Mi plan y de Recibos. Manda lo que dice el servidor de cada recibo
 * (`cobro`); la renovación sin tarjeta (`renovacionPorPagar`, la regla de siempre) solo entra si el servidor no ha dicho
 * otra cosa de ESE recibo: si dice que lo cobra el banco, el banco.
 */
export function porPagarEnLaApp(
  pagos: readonly Pago[],
  renovacion: { reciboId: string; concepto: string; importe: number; vence: string | null; pagableOnline: boolean } | null,
): PorPagar[] {
  const lista: PorPagar[] = recibosPagables(pagos).map((p) => ({
    reciboId: p.id, concepto: p.concepto, importe: p.importe, vence: p.vence ?? null, esRenovacion: p.id === renovacion?.reciboId,
  }));
  if (renovacion?.pagableOnline && !lista.some((x) => x.reciboId === renovacion.reciboId)) {
    const suyo = pagos.find((p) => p.id === renovacion.reciboId);
    if (!suyo?.cobro) lista.unshift({ reciboId: renovacion.reciboId, concepto: renovacion.concepto, importe: renovacion.importe, vence: renovacion.vence, esRenovacion: true });
  }
  return lista;
}
