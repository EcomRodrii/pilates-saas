// Lo que le queda a la alumna y hasta cuándo, dicho UNA vez para toda la app.
//
// La tarjeta del bono, «Cómo vienes» de la ficha, la tarjeta de Perfil y Bonos enseñan las mismas tres cosas —cuántas
// le quedan, «de cuántas» y cuándo caducan— y cada pantalla las escribía a su manera. Aquí están las piezas; cada
// pantalla compone su frase con ellas. Imports relativos con `.ts` y sin `@/`: así lo prueba `node --test`.

import { addDias, fechaCorta } from './formato.ts';
import { esCuota } from './bono-cubre.ts';

interface BonoSaldo {
  creditosTotales: number;
  creditosUsados: number;
  tipoPlan?: string | null;
  sesionesDelPlan?: number | null;
  renovado?: boolean;
}

/**
 * Cuántas le quedan y, solo si es verdad, «de cuántas».
 *
 * ⚠️ «de M» se calla en tres casos, los tres reales:
 *   · el bono se ha RENOVADO: renovar SUMA al mismo bono (`renovar_bono_idempotente`), y con 3 del ciclo anterior más
 *     8 nuevas no quedan «11 de 8»;
 *   · le quedan MÁS de las que trae su plan (un ajuste del estudio, o un saldo que viene de antes);
 *   · su plan no dice cuántas trae (sin plan, o sin límite).
 * Sin «de M» la cifra sigue siendo verdad; con un «de M» falso, no.
 */
export function saldoBono(b: BonoSaldo): { quedan: number; de: number | null; ilimitado: boolean } {
  const ilimitado = !Number.isFinite(b.creditosTotales);
  if (ilimitado) return { quedan: Infinity, de: null, ilimitado };
  const quedan = Math.max(0, b.creditosTotales - b.creditosUsados);
  const plan = b.sesionesDelPlan ?? null;
  const de = !b.renovado && plan != null && plan > 0 && quedan <= plan ? plan : null;
  return { quedan, de, ilimitado };
}

/**
 * Cuándo caduca, en corto y con el reloj del estudio: «caduca hoy», «caduca mañana», «caduca mié 31 dic», «caducó…» o
 * «sin caducidad». En pausa o cancelado no se dice nada: «caducó <fecha que aún no ha llegado>» era lo que veía una
 * cuota cancelada, y de una en pausa no se sabe cuándo vuelve.
 */
export function textoCaduca(b: { expiraEn: string | null; estado: string }, hoy: string): string | null {
  if (b.estado === 'pausado' || b.estado === 'cancelado') return null;
  if (!b.expiraEn) return 'sin caducidad';
  if (b.estado === 'expirado') return `caducó ${fechaCorta(b.expiraEn)}`;
  if (b.expiraEn === hoy) return 'caduca hoy';
  if (b.expiraEn === addDias(hoy, 1)) return 'caduca mañana';
  return `caduca ${fechaCorta(b.expiraEn)}`;
}

/**
 * «Te quedan 5 · caduca mié 31 dic» — la línea de un bono con sesiones (la ficha de la clase la pone bajo su nombre).
 * `null` para una cuota o un bono sin límite: no hay contador que enseñar.
 */
export function textoSaldoBono(b: BonoSaldo & { expiraEn: string | null; estado: string }, hoy: string): string | null {
  if (esCuota(b)) return null;
  const { quedan, ilimitado } = saldoBono(b);
  if (ilimitado) return null;
  const cifra = quedan === 1 ? 'Te queda 1' : `Te quedan ${quedan}`;
  const caduca = textoCaduca(b, hoy);
  return caduca ? `${cifra} · ${caduca}` : cifra;
}

/**
 * Los topes semanales de un plan, en palabras y UNA sola vez para toda la app: «2 clases a la semana», «Reformer: 1 a
 * la semana» o los dos. `null` = sin ningún tope.
 *
 * ⚠️ Nunca «sin límite»: aunque no haya tope semanal, el servidor tiene topes por día y de reservas a la vez que la
 * app no conoce. Quien llama decide qué decir sin topes (Bonos: «Sin máximo semanal»; Perfil: el nombre del plan).
 *
 * `soloTipo`: solo los que afectan a una clase de ese tipo (el total y el de su actividad), para la ficha de una clase.
 * `hasta`: «hasta 2 clases a la semana», que es como lo dice la ficha antes de reservar.
 */
export function textoTopes(
  b: { limiteSemanal?: number | null; limitePorTipo?: Record<string, number> },
  nombresTipo: Record<string, string>,
  opciones: { soloTipo?: string | null; hasta?: boolean } = {},
): string | null {
  const h = opciones.hasta ? 'hasta ' : '';
  const partes: string[] = [];
  const total = b.limiteSemanal ?? 0;
  if (total > 0) partes.push(`${h}${total} ${total === 1 ? 'clase' : 'clases'} a la semana`);
  for (const [tipo, limite] of Object.entries(b.limitePorTipo ?? {})) {
    if (!(limite > 0)) continue;
    if (opciones.soloTipo && tipo !== opciones.soloTipo) continue;
    const nombre = nombresTipo[tipo];
    // Un tope de un tipo que ya no está en el horario no se nombra con un id: no se dice.
    if (!nombre) continue;
    partes.push(`${nombre}: ${h}${limite} a la semana`);
  }
  return partes.length > 0 ? partes.join(' · ') : null;
}
