// «Cómo reservan mis alumnas»: qué columnas guarda la sección, en qué tarjeta
// vive cada una, y cómo se pasa de lo que hay en pantalla a lo que se guarda.
//
// Era un solo formulario con veintidós campos y «Opciones avanzadas» plegando
// quince. Ahora son cinco tarjetas con UNA barra de guardar que dice cuáles
// tienen cambios. Lo que NO cambia: las columnas y los valores. Esta sección
// guarda las mismas que guardaba el formulario de antes, menos dos que se fueron
// a su sitio —`compraPublicaModo` a «Alta de alumnas» e `instructorasCreanClases`
// a «Mi equipo»—, que se guardan allí con los mismos valores.
//
// «Pedir confirmación a quien suele no venir» está en la tarjeta «Asistencia»
// pero NO en estas columnas: la escribe `/api/decisiones/confirmacion-riesgo`,
// que comprueba el plan (ver tab-estudio-reservas.tsx).
//
// Puro: se prueba con `node --test`. El `import type` desaparece al ejecutarlo.

import type { Studio } from '../types.ts';
import { listaEsperaDesdeValores, valoresDeListaEspera, type ListaEsperaElegida } from './lista-espera-modo.ts';

export type TarjetaReglasId = 'reservar' | 'cancelar-y-recuperar' | 'lista-de-espera' | 'asistencia' | 'si-cancela-tarde-o-no-viene';

/** Las columnas de `studios` que guarda esta sección. */
export interface ReglasReserva {
  reservaExigirPlan: boolean;
  reservaVentanaMinimaMinutos: number;
  reservaAntelacionMaximaDias: number | null;
  reservaMaxSimultaneas: number | null;
  bloquearReservaImpago: boolean;
  requiereAprobacion: boolean;
  cancelacionVentanaHoras: number;
  cancelacionDevolverBonoTardia: boolean;
  cancelacionClaseDevuelveBono: boolean;
  minimoAsistentesPorClase: number;
  recuperacionCaducidadTipo: 'DIAS' | 'FIN_MES' | 'FIN_MES_SIGUIENTE';
  recuperacionCaducidadDias: number | null;
  recuperacionAutoSemanal: boolean;
  permiteListaEspera: boolean;
  listaEsperaPlazoAceptacionMinutos: number;
  requiereCheckinQr: boolean;
  penalizacionImporteEur: number | null;
  penalizacionAplicaCancelacionTardia: boolean;
  penalizacionAplicaNoShow: boolean;
  penalizacionCobroAutomatico: boolean;
}

/** En qué tarjeta vive cada columna. Cada columna, en una sola. */
export const COLUMNAS_POR_TARJETA: Readonly<Record<TarjetaReglasId, readonly (keyof ReglasReserva)[]>> = {
  reservar: ['reservaExigirPlan', 'reservaVentanaMinimaMinutos', 'reservaAntelacionMaximaDias', 'reservaMaxSimultaneas', 'bloquearReservaImpago', 'requiereAprobacion'],
  'cancelar-y-recuperar': ['cancelacionVentanaHoras', 'cancelacionDevolverBonoTardia', 'cancelacionClaseDevuelveBono', 'minimoAsistentesPorClase', 'recuperacionCaducidadTipo', 'recuperacionCaducidadDias', 'recuperacionAutoSemanal'],
  'lista-de-espera': ['permiteListaEspera', 'listaEsperaPlazoAceptacionMinutos'],
  asistencia: ['requiereCheckinQr'],
  'si-cancela-tarde-o-no-viene': ['penalizacionImporteEur', 'penalizacionAplicaCancelacionTardia', 'penalizacionAplicaNoShow', 'penalizacionCobroAutomatico'],
};

/** El orden en que se pintan, que es también el de «Cambios sin guardar en: …». */
export const TARJETAS_REGLAS: readonly TarjetaReglasId[] = ['reservar', 'cancelar-y-recuperar', 'lista-de-espera', 'asistencia', 'si-cancela-tarde-o-no-viene'];

/**
 * Lo guardado, con los mismos valores por defecto que usaba el formulario de
 * antes cuando a la fila le falta una columna.
 */
export function reglasGuardadas(s: Partial<Studio> | null | undefined): ReglasReserva {
  return {
    reservaExigirPlan: s?.reservaExigirPlan ?? true,
    reservaVentanaMinimaMinutos: s?.reservaVentanaMinimaMinutos ?? 0,
    reservaAntelacionMaximaDias: s?.reservaAntelacionMaximaDias ?? null,
    reservaMaxSimultaneas: s?.reservaMaxSimultaneas ?? null,
    bloquearReservaImpago: s?.bloquearReservaImpago ?? false,
    requiereAprobacion: s?.requiereAprobacion ?? false,
    cancelacionVentanaHoras: s?.cancelacionVentanaHoras ?? 12,
    cancelacionDevolverBonoTardia: s?.cancelacionDevolverBonoTardia ?? false,
    cancelacionClaseDevuelveBono: s?.cancelacionClaseDevuelveBono ?? true,
    minimoAsistentesPorClase: s?.minimoAsistentesPorClase ?? 0,
    recuperacionCaducidadTipo: s?.recuperacionCaducidadTipo ?? 'FIN_MES_SIGUIENTE',
    recuperacionCaducidadDias: s?.recuperacionCaducidadDias ?? null,
    recuperacionAutoSemanal: s?.recuperacionAutoSemanal ?? false,
    permiteListaEspera: s?.permiteListaEspera ?? true,
    listaEsperaPlazoAceptacionMinutos: s?.listaEsperaPlazoAceptacionMinutos ?? 0,
    requiereCheckinQr: s?.requiereCheckinQr ?? true,
    penalizacionImporteEur: s?.penalizacionImporteEur ?? null,
    penalizacionAplicaCancelacionTardia: s?.penalizacionAplicaCancelacionTardia ?? true,
    penalizacionAplicaNoShow: s?.penalizacionAplicaNoShow ?? true,
    penalizacionCobroAutomatico: s?.penalizacionCobroAutomatico ?? false,
  };
}

/** Lo que hay en pantalla: las columnas, salvo la lista de espera, que es un solo control. */
export type ReglasReservaForm =
  Omit<ReglasReserva, 'permiteListaEspera' | 'listaEsperaPlazoAceptacionMinutos'> & { listaEspera: ListaEsperaElegida };

export function formularioReglas(s: Partial<Studio> | null | undefined): ReglasReservaForm {
  const { permiteListaEspera, listaEsperaPlazoAceptacionMinutos, ...resto } = reglasGuardadas(s);
  return { ...resto, listaEspera: listaEsperaDesdeValores({ permiteListaEspera, listaEsperaPlazoAceptacionMinutos }) };
}

/** La reserva se cerraría antes de abrirse. Mismo criterio que el tipo de clase (#867): en minutos. */
export function antelacionImposible(minimaMinutos: number, maximaDias: number | null): boolean {
  return maximaDias != null && minimaMinutos > maximaDias * 24 * 60;
}

export type Problema = { tarjeta: TarjetaReglasId; texto: string };

/**
 * Lo que se manda al pulsar «Guardar»: las veinte columnas de la sección.
 * `guardado` hace falta para la lista de espera («sin lista» conserva el plazo).
 */
export function reglasAGuardar(
  form: ReglasReservaForm,
  guardado: ReglasReserva,
): { ok: true; reglas: ReglasReserva } | { ok: false; problema: Problema } {
  if (antelacionImposible(form.reservaVentanaMinimaMinutos, form.reservaAntelacionMaximaDias)) {
    return { ok: false, problema: { tarjeta: 'reservar', texto: 'Revisa «Reservar»: la reserva se cerraría antes de abrirse.' } };
  }
  const lista = valoresDeListaEspera(form.listaEspera, guardado);
  if (!lista.ok) return { ok: false, problema: { tarjeta: 'lista-de-espera', texto: `Revisa «Lista de espera»: ${lista.error}` } };
  const { listaEspera: _elegida, ...resto } = form;
  return { ok: true, reglas: { ...resto, ...lista.valores } };
}

function igual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** Las tarjetas cuyo contenido difiere de lo guardado, en su orden. */
export function tarjetasConCambios(form: ReglasReservaForm, guardado: ReglasReserva): TarjetaReglasId[] {
  const lista = valoresDeListaEspera(form.listaEspera, guardado);
  const enPantalla: Omit<ReglasReserva, 'permiteListaEspera' | 'listaEsperaPlazoAceptacionMinutos'> = form;
  return TARJETAS_REGLAS.filter(t => {
    if (t === 'lista-de-espera') {
      // Una cifra que no vale también es un cambio: si no, la barra se iría con
      // un error en pantalla y nada que guardar.
      return !lista.ok
        || lista.valores.permiteListaEspera !== guardado.permiteListaEspera
        || lista.valores.listaEsperaPlazoAceptacionMinutos !== guardado.listaEsperaPlazoAceptacionMinutos;
    }
    return COLUMNAS_POR_TARJETA[t].some(k => !igual(enPantalla[k as keyof typeof enPantalla], guardado[k]));
  });
}

function duracion(minutos: number): string {
  return minutos >= 60 && minutos % 60 === 0 ? `${minutos / 60} h` : `${minutos} min`;
}

/**
 * La antelación, dicha en una frase. Lo que aplican `puedeReservarPorAntelacionMaxima`
 * (se abre `dias` antes del inicio; null = sin límite) y `puedeReservarPorVentanaMinima`
 * (se cierra `minutos` antes; 0 = hasta el inicio), en lib/booking-logic.ts.
 */
export function fraseAntelacion(minimaMinutos: number, maximaDias: number | null): string {
  if (antelacionImposible(minimaMinutos, maximaDias)) {
    return 'Así la reserva se cerraría antes de abrirse: nunca habría un momento para reservar.';
  }
  const hasta = minimaMinutos > 0 ? `hasta ${duracion(minimaMinutos)} antes de que empiece la clase` : 'hasta que empieza la clase';
  if (maximaDias == null) return `Se puede reservar con cualquier antelación, ${hasta}.`;
  if (maximaDias === 0) return 'La reserva no se abre hasta que empieza la clase.';
  return `Se puede reservar desde ${maximaDias === 1 ? '1 día' : `${maximaDias} días`} antes ${hasta}.`;
}
