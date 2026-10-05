// El «hoy» del resumen de /automatizaciones (MorningBriefing), en hora del
// ESTUDIO. Puro: se prueba sin pantalla (automatizaciones-hoy.test.ts).
//
// Contaba como «de hoy» los registros cuyo `ejecutadoEn` (un instante UTC)
// empezaba por la fecha UTC del navegador: de 00:00 a 02:00 de Madrid (01:00 en
// invierno) «Acciones hoy» y «Fallidas hoy» enseñaban las de AYER, y las de esas
// primeras horas del día no contaban hasta que en UTC también era el día nuevo.
import { franjaLocalDe, hoyEnEstudio } from './utils.ts';

/** Los registros ejecutados el mismo día del estudio que `ahora`. */
export function registrosDeHoy<T extends { ejecutadoEn: string }>(registros: readonly T[], ahora: Date): T[] {
  const hoy = hoyEnEstudio(ahora);
  return registros.filter(r => {
    const t = new Date(r.ejecutadoEn);
    return !Number.isNaN(t.getTime()) && hoyEnEstudio(t) === hoy;
  });
}

/** El saludo según la hora del estudio (la del navegador podía ser otra). */
export function saludoDelEstudio(ahora: Date): 'Buenos días' | 'Buenas tardes' | 'Buenas noches' {
  const { hora } = franjaLocalDe(ahora.toISOString());
  return hora < 13 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
}
