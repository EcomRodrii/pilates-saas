import type { AnalisisCapacidad } from './capacidad.ts';

// Solo nombra los supuestos que se han usado de verdad: decir «a 2 clases por
// semana» a un estudio que solo vende bonos sería explicar una cifra con otra.
export function notaEstimacion(a: AnalisisCapacidad, sinTope: number): string {
  const n = a.desglose.ESTIMADA_POR_PLAN.suscripciones;
  const m = a.estimadasPorMotivo;
  const partes: string[] = [];
  if (m.BONO) partes.push(m.BONO === 1 ? 'el bono, repartiendo lo que le queda hasta que caduca' : `los ${m.BONO} bonos, repartiendo lo que les queda hasta que caducan`);
  if (m.TOPE_PLAN) partes.push(m.TOPE_PLAN === 1 ? 'la cuota con tope, a su tope semanal' : `las ${m.TOPE_PLAN} cuotas con tope, a su tope semanal`);
  if (m.SIN_TOPE) partes.push(`${m.SIN_TOPE === 1 ? 'la ilimitada' : `las ${m.SIN_TOPE} ilimitadas`}, a ${sinTope} clases por semana`);
  const sujeto = n === 1 ? '1 de tus cuotas aún no tiene historial: la estimamos' : `${n} de tus cuotas aún no tienen historial: las estimamos`;
  return `${sujeto} por su plan (${partes.join('; ')}).`;
}
