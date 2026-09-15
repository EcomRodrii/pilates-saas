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
// Desde el 15-sep (v2) cada tarjeta es una FILA con su cajón, y el «Guardar» del
// cajón manda SOLO las columnas de esa tarjeta (`reglasDeTarjetaAGuardar`,
// #2027). «Cancelar y recuperar» llevaba siete campos y un cajón lleva seis: la
// clase cancelada entera salió a «Si se cancela una clase entera».
//
// Puro: se prueba con `node --test`. El `import type` desaparece al ejecutarlo.

import type { Studio, TipoClase } from '../types.ts';
import { heredaOverride } from '../booking-logic.ts';
import { frasesPoliticaEstudio } from '../politica-estudio-textos.ts';
import { listaEsperaDesdeValores, valoresDeListaEspera, type ListaEsperaElegida } from './lista-espera-modo.ts';

export type TarjetaReglasId =
  | 'reservar' | 'cancelar-y-recuperar' | 'si-se-cancela-una-clase' | 'lista-de-espera' | 'asistencia' | 'si-cancela-tarde-o-no-viene';

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
  'cancelar-y-recuperar': ['cancelacionVentanaHoras', 'cancelacionDevolverBonoTardia', 'recuperacionCaducidadTipo', 'recuperacionCaducidadDias', 'recuperacionAutoSemanal'],
  'si-se-cancela-una-clase': ['cancelacionClaseDevuelveBono', 'minimoAsistentesPorClase'],
  'lista-de-espera': ['permiteListaEspera', 'listaEsperaPlazoAceptacionMinutos'],
  asistencia: ['requiereCheckinQr'],
  'si-cancela-tarde-o-no-viene': ['penalizacionImporteEur', 'penalizacionAplicaCancelacionTardia', 'penalizacionAplicaNoShow', 'penalizacionCobroAutomatico'],
};

/** El orden en que se pintan las filas. */
export const TARJETAS_REGLAS: readonly TarjetaReglasId[] = [
  'reservar', 'cancelar-y-recuperar', 'si-se-cancela-una-clase', 'lista-de-espera', 'asistencia', 'si-cancela-tarde-o-no-viene',
];

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

/**
 * Lo que manda el «Guardar» del cajón de UNA tarjeta: sus columnas y ninguna
 * más (#2027). Solo se comprueba lo que se edita en ella: un plazo imposible
 * guardado de antes en «Reservar» no puede dejar sin guardar la lista de espera.
 */
export function reglasDeTarjetaAGuardar(
  tarjeta: TarjetaReglasId,
  form: ReglasReservaForm,
  guardado: ReglasReserva,
): { ok: true; cambios: Partial<ReglasReserva> } | { ok: false; texto: string } {
  if (tarjeta === 'reservar' && antelacionImposible(form.reservaVentanaMinimaMinutos, form.reservaAntelacionMaximaDias)) {
    return { ok: false, texto: 'La reserva se cerraría antes de abrirse: cambia los días o los minutos.' };
  }
  if (tarjeta === 'lista-de-espera') {
    const lista = valoresDeListaEspera(form.listaEspera, guardado);
    return lista.ok ? { ok: true, cambios: lista.valores } : { ok: false, texto: lista.error };
  }
  const enPantalla = form as unknown as Record<keyof ReglasReserva, unknown>;
  return { ok: true, cambios: Object.fromEntries(COLUMNAS_POR_TARJETA[tarjeta].map(k => [k, enPantalla[k]])) as Partial<ReglasReserva> };
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

// ─── Los tipos de clase que cambian una regla ────────────────────────────────
//
// «Hasta 12 h antes · 2 tipos lo cambian»: la fila de una regla dice si alguna
// clase no la sigue. Se resuelve igual que al reservar (`heredaOverride`: NULL =
// hereda del estudio) y solo cuenta lo que CAMBIA de verdad: un tipo con su
// propio valor igual al del estudio no le lleva la contraria a nadie.

type ReglasDeTipo = Pick<TipoClase,
  | 'ventanaCancelacionHoras' | 'reservaExigirPlan' | 'reservaVentanaMinimaMinutos'
  | 'reservaAntelacionMaximaDias' | 'permiteListaEspera' | 'requiereAprobacion' | 'listaEsperaPlazoAceptacionMinutos'
  | 'minimoAsistentesPorClase' | 'requiereCheckinQr' | 'penalizacionImporteEur'
>;

export type TipoConReglas = Partial<ReglasDeTipo> & Pick<TipoClase, 'id' | 'nombre'>;

/** ≤ 0 o sin valor = nada (sin plazo, sin mínimo, sin cargo): así se comparan. */
const cifra = (v: number | null | undefined) => (typeof v === 'number' && v > 0 ? v : 0);

/** La lista de espera que se aplica: sin lista, el plazo no decide nada. */
function modoLista(permite: boolean, plazo: number | null | undefined): string {
  if (!permite) return 'sin-lista';
  return cifra(plazo) > 0 ? `con-plazo:${cifra(plazo)}` : 'al-momento';
}

function cambiaRegla(tarjeta: TarjetaReglasId, t: TipoConReglas, e: ReglasReserva): boolean {
  switch (tarjeta) {
    case 'reservar':
      return heredaOverride(t.reservaExigirPlan, e.reservaExigirPlan) !== e.reservaExigirPlan
        || heredaOverride(t.reservaVentanaMinimaMinutos, e.reservaVentanaMinimaMinutos) !== e.reservaVentanaMinimaMinutos
        || heredaOverride(t.reservaAntelacionMaximaDias, e.reservaAntelacionMaximaDias) !== e.reservaAntelacionMaximaDias
        || heredaOverride(t.requiereAprobacion, e.requiereAprobacion) !== e.requiereAprobacion;
    case 'cancelar-y-recuperar':
      return cifra(heredaOverride(t.ventanaCancelacionHoras, e.cancelacionVentanaHoras)) !== cifra(e.cancelacionVentanaHoras);
    case 'si-se-cancela-una-clase':
      return cifra(heredaOverride(t.minimoAsistentesPorClase, e.minimoAsistentesPorClase)) !== cifra(e.minimoAsistentesPorClase);
    case 'lista-de-espera':
      return modoLista(heredaOverride(t.permiteListaEspera, e.permiteListaEspera), heredaOverride(t.listaEsperaPlazoAceptacionMinutos, e.listaEsperaPlazoAceptacionMinutos))
        !== modoLista(e.permiteListaEspera, e.listaEsperaPlazoAceptacionMinutos);
    case 'asistencia':
      return heredaOverride(t.requiereCheckinQr, e.requiereCheckinQr) !== e.requiereCheckinQr;
    case 'si-cancela-tarde-o-no-viene':
      // `coalesce(tc.penalizacion_importe_eur, st.penalizacion_importe_eur)`: un 0 propio apaga el cargo.
      return cifra(heredaOverride(t.penalizacionImporteEur, e.penalizacionImporteEur)) !== cifra(e.penalizacionImporteEur);
  }
}

/** Qué tipos de clase cambian cada regla del estudio, en el orden de su lista. */
export function excepcionesPorRegla(
  estudio: ReglasReserva,
  tipos: readonly TipoConReglas[],
): Record<TarjetaReglasId, { id: string; nombre: string }[]> {
  return Object.fromEntries(TARJETAS_REGLAS.map(tarjeta => [
    tarjeta,
    tipos.filter(t => cambiaRegla(tarjeta, t, estudio)).map(t => ({ id: t.id, nombre: t.nombre })),
  ])) as Record<TarjetaReglasId, { id: string; nombre: string }[]>;
}

// ─── La consecuencia, en una línea ───────────────────────────────────────────
//
// Lo último que se lee en cada cajón antes de «Guardar»: qué va a pasar con lo
// que hay en pantalla. Sale de donde ya se explicaba (`frasesPoliticaEstudio`,
// `fraseAntelacion`) o, lo que no tenía frase, de lo que hace el código: el corte
// del mínimo (`debeCancelarPorMinimoNoAlcanzado`, a 2 h fijas del inicio), el
// barrido de asistidas (marcar-asistidas-automatico.ts) y la detección del cargo.

const euros = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`;

export function consecuenciaRegla(tarjeta: TarjetaReglasId, r: ReglasReserva): string {
  const politica = frasesPoliticaEstudio({ ...r, avisarAlumnas: null });
  const frase = (id: string) => politica.find(f => f.id === id)?.texto ?? '';
  switch (tarjeta) {
    case 'reservar':
      return fraseAntelacion(r.reservaVentanaMinimaMinutos, r.reservaAntelacionMaximaDias);
    case 'cancelar-y-recuperar':
      return frase('cancela-tarde') || frase('cancela-a-tiempo');
    case 'si-se-cancela-una-clase': {
      const minimo = cifra(r.minimoAsistentesPorClase);
      if (minimo === 0) return frase('estudio-cancela');
      return `Si a 2 h del inicio hay menos de ${minimo === 1 ? '1 alumna' : `${minimo} alumnas`}, se cancela sola y ${r.cancelacionClaseDevuelveBono ? 'devuelve' : 'no devuelve'} la sesión.`;
    }
    case 'lista-de-espera':
      return frase('plaza-liberada');
    case 'asistencia':
      return r.requiereCheckinQr
        ? 'Solo cuenta como asistida quien marques al pasar lista.'
        : 'Toda reserva confirmada cuenta como asistida al terminar la clase.';
    case 'si-cancela-tarde-o-no-viene': {
      const importe = cifra(r.penalizacionImporteEur);
      if (importe === 0) return 'Cancelar tarde o no venir no cuesta nada.';
      // Sin plazo de cancelación no hay cancelación tardía que cobrar.
      const ventana = cifra(r.cancelacionVentanaHoras);
      const tarde = r.penalizacionAplicaCancelacionTardia && ventana > 0 ? `cancela con menos de ${ventana} h` : null;
      const falta = r.penalizacionAplicaNoShow ? 'no viene sin avisar' : null;
      if (!tarde && !falta) return `Tal como está, nunca se cobran los ${euros(importe)}: elige cuándo se aplican.`;
      return `Si ${[tarde, falta].filter(Boolean).join(' o ')}, se le cobran ${euros(importe)} ${r.penalizacionCobroAutomatico ? 'sin esperar a que lo apruebes' : 'cuando lo apruebes'}.`;
    }
  }
}

/**
 * Lo que se pregunta antes de guardar el cargo: es dinero de tus alumnas. Dice
 * lo que va a pasar, y lo que NO va a pasar aunque lo pongas (con términos
 * propios no se cobra: `consentimientoCubrePenalizacion`) o aunque lo quites
 * (un tipo de clase con su propio cargo lo sigue cobrando).
 */
export function confirmarPenalizacion(
  antes: ReglasReserva,
  ahora: ReglasReserva,
  e: { terminosPropios: boolean; tiposConCargoPropio: number },
): { titulo: string; descripcion: string; textoConfirmar: string } {
  const importe = cifra(ahora.penalizacionImporteEur);
  if (importe === 0) {
    const siguen = e.tiposConCargoPropio === 0 ? ''
      : e.tiposConCargoPropio === 1 ? ' El tipo de clase con su propio cargo lo sigue cobrando.'
      : ` Los ${e.tiposConCargoPropio} tipos de clase con su propio cargo lo siguen cobrando.`;
    return {
      titulo: '¿Quitar el cargo?',
      descripcion: `Desde ahora, cancelar tarde o no venir no le cuesta nada a tus alumnas.${siguen}`,
      textoConfirmar: 'Sí, quitarlo',
    };
  }
  const aviso = e.terminosPropios ? ' Con tus términos propios no se cobrará: tus alumnas no han aceptado este cargo.' : '';
  return {
    titulo: cifra(antes.penalizacionImporteEur) === 0 ? `¿Cobrar ${euros(importe)}?` : '¿Cambiar el cargo?',
    descripcion: `${consecuenciaRegla('si-cancela-tarde-o-no-viene', ahora)} Va a su tarjeta guardada, si tiene una y aceptó tus condiciones.${aviso}`,
    textoConfirmar: 'Sí, guardarlo',
  };
}
