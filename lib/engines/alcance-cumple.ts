// A cuántas clientas felicitaría hoy «Felicitar el cumpleaños» (P3.10). Lo
// cuenta el servidor, que es quien tiene lo que el panel no: el año de
// nacimiento (dato privado) y el texto exacto del consentimiento. Mismas
// condiciones que la rama CUMPLEANOS del motor (automation-engine.ts), para que
// la cifra de la confirmación sea la de verdad y no una aproximación.

import { tieneConsentimientoMarketingVigente } from '../marketing/consentimiento.ts';
import { EDAD_MINIMA_FELICITAR, edadParaFelicitar } from './automation-engine.ts';

export interface FilaAlcanceCumple {
  activo: boolean;
  email: string | null;
  fecha_nacimiento: string | null;
  consentimiento_marketing_texto: string | null;
}

export interface AlcanceCumple {
  /** Clientas que no están de baja (`socios.activo`): las que el motor mira. */
  activas: number;
  /** De ellas, las que tienen una fecha de nacimiento que sirve. */
  conFecha: number;
  /** De ellas, las que aceptaron las novedades con el texto vigente. */
  conConsentimiento: number;
  /** Las que cumplen todo: fecha, mayoría de edad, consentimiento y un correo al que se puede escribir. */
  alcanzables: number;
}

/** Las direcciones que cumplen todo lo demás: el llamador mira cuáles han rebotado. */
export function correosCandidatosCumple(filas: readonly FilaAlcanceCumple[], textoVigente: string, hoy: string): string[] {
  return filas.filter(f => cumpleTodoMenosElCorreo(f, textoVigente, hoy) && f.email).map(f => f.email as string);
}

function cumpleTodoMenosElCorreo(f: FilaAlcanceCumple, textoVigente: string, hoy: string): boolean {
  const edad = edadParaFelicitar(f.fecha_nacimiento, hoy);
  return f.activo && edad !== null && edad >= EDAD_MINIMA_FELICITAR &&
    tieneConsentimientoMarketingVigente(f.consentimiento_marketing_texto ?? undefined, textoVigente);
}

/**
 * `correoNoSirve`: una dirección a la que el envío no escribiría (rebotó, se
 * quejó, la suprimió el proveedor o es de un dominio de ejemplo). Lo resuelve
 * el llamador, que es quien puede leer `email_rebotes`.
 */
export function alcanceCumple(
  filas: readonly FilaAlcanceCumple[], textoVigente: string, hoy: string,
  correoNoSirve: (email: string) => boolean = () => false,
): AlcanceCumple {
  const a: AlcanceCumple = { activas: 0, conFecha: 0, conConsentimiento: 0, alcanzables: 0 };
  for (const f of filas) {
    if (!f.activo) continue;
    a.activas++;
    if (edadParaFelicitar(f.fecha_nacimiento, hoy) !== null) a.conFecha++;
    if (tieneConsentimientoMarketingVigente(f.consentimiento_marketing_texto ?? undefined, textoVigente)) a.conConsentimiento++;
    if (cumpleTodoMenosElCorreo(f, textoVigente, hoy) && f.email && !correoNoSirve(f.email)) a.alcanzables++;
  }
  return a;
}
