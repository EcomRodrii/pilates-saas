// «Mi cuenta → Bonos» de /reservar y del widget nativo (F5 del rediseño
// «/reservar = estilo de la app de la alumna», 29-sep-2026): lo que dice la
// tarjeta de cada bono de la socia.
//
// Es la tarjeta de «Bonos» de la app (components/student/domain/CreditCard.tsx)
// ADAPTADA: el nombre y su insignia, una barra, «Te quedan» con la cifra grande
// («5», «de 8 sesiones») y «caduca jue 31 dic» a la derecha. Antes aquí se leía
// «5/8» en gris pequeño junto al nombre y «Caduca en 141 días» debajo: la única
// pregunta con la que se abre esta pestaña —¿cuántas me quedan?— había que
// sacarla de una fracción.
//
// ⚠️ No recalcula nada del saldo: parte de lo que ya devuelve `bonoActivo()`
// (lib/bonos-portal.ts, con sus tests), bono a bono. Solo decide las palabras.
//
// Relativo y con `.ts`: `node --test` no resuelve el alias `@/`.

import { fechaCorta } from '../student/formato.ts';

/** Un bono tal como lo da `bonoActivo(…).bonos`. */
export interface BonoDeLaSocia {
  restantes: number | null;
  total: number | null;
  caducaEn: string | null;
  textoCaducidad: string | null;
  agotado: boolean;
}

export interface SaldoBono {
  /** La insignia de la tarjeta. */
  etiqueta: 'Activo' | 'Agotado' | 'Caducado';
  /**
   * Las sesiones que le quedan: la cifra grande. `null` en un plan que no cuenta
   * sesiones (el mensual ilimitado): ahí no hay saldo, y un «0» mentiría.
   */
  cifra: number | null;
  /** «de 8 sesiones», o solo «sesiones» si el plan no dice cuántas traía. `null` sin cifra. */
  deTotal: string | null;
  /**
   * 0..1 para la barra, que se llena con lo que QUEDA (como en la app: un bono
   * recién comprado va lleno). `null` sin total: una barra al 100 % en un
   * ilimitado sugeriría que se ha gastado todo.
   */
  progreso: number | null;
  /** «caduca jue 31 dic», «caducó mar 4 ago», «sin caducidad» o, en un mensual, su renovación. */
  caduca: string;
}

/**
 * La tarjeta de un bono. `hoy` es el día del estudio ('YYYY-MM-DD',
 * `hoyEnEstudio()`): decide si una fecha de caducidad ya pasó.
 *
 * ⚠️ «Te quedan» va ENCIMA de la cifra y «de 8 sesiones» debajo, nunca «5 ·
 * sesiones de 8»: eso se lee «llevo 5 hechas», el bug que la app ya fijó en su
 * día (student-bono-detalle.spec.ts). La cifra se agranda; la palabra que la
 * desambigua no se quita.
 */
export function saldoBono(b: BonoDeLaSocia, hoy: string): SaldoBono {
  const caducado = !!b.caducaEn && b.caducaEn.slice(0, 10) < hoy;
  const etiqueta: SaldoBono['etiqueta'] = b.agotado ? 'Agotado' : caducado ? 'Caducado' : 'Activo';

  const cifra = b.restantes;
  const plural = (n: number) => (n === 1 ? 'sesión' : 'sesiones');
  const deTotal = cifra == null
    ? null
    : b.total != null ? `de ${b.total} ${plural(b.total)}` : plural(cifra);
  const progreso = cifra != null && b.total != null && b.total > 0
    ? Math.max(0, Math.min(1, cifra / b.total))
    : null;

  // Un plan sin sesiones (el mensual) no caduca: su `caducaEn` es el próximo
  // cobro, y eso ya lo dice `textoCaducidad` con las palabras de siempre
  // («Próxima renovación en 6 días»). Pintarle «caduca…» sería prometer que se
  // acaba.
  const caduca = cifra == null
    ? (b.textoCaducidad ?? 'Sin caducidad')
    : !b.caducaEn
      ? 'Sin caducidad'
      : `${caducado ? 'caducó' : 'caduca'} ${fechaCorta(b.caducaEn.slice(0, 10))}`;

  return { etiqueta, cifra, deTotal, progreso, caduca };
}
