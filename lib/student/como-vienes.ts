// «Cómo vienes» (P02): la tarjeta de la ficha que le dice a la alumna, con SUS datos, con qué viene a esta clase.
//
// Solo informa: no vende ni cobra (sin dinero en este bloque, decisión del fundador del 5-oct-2026). Y no decide nada:
// lo que paga la clase sale de `bonoParaClase` (con «la mensual gana», atada al servidor por un test de paridad) y de
// `tieneBonoQueNoCubre`, las mismas que la fila corta y la hoja, para que las tres digan lo mismo.
//
// Puro, imports relativos con `.ts` (como-vienes.test.ts). Nada de `enlaces-clase.ts`: arrastra el puente nativo.

import { bonoParaClase, esCuota, tieneBonoQueNoCubre } from './bono-cubre.ts';
import { euros } from './formato.ts';
import { textoSaldoBono, textoTopes } from './saldo-bono.ts';
import { hayALaVentaQueCubra, type PlanTienda } from './tienda.ts';
import { type ComoVieneSinBono, type TonoPago } from './como-se-paga.ts';
import type { Bono, Clase, Disponibilidad, Reserva } from './tipos.ts';

export type CasoComoVienes = 'clase-fija' | 'cuota' | 'ilimitado' | 'bono' | 'bono-no-cubre' | 'sin-nada';

export interface ComoVienesVista {
  caso: CasoComoVienes;
  titulo: string;
  detalle: string | null;
  /** «Ver» su bono o cuota, o «Ver opciones» de la tienda (solo si algo de la tienda cubre la clase). */
  enlace?: { texto: string; destino: 'bono'; bonoId: string } | { texto: string; destino: 'tienda' };
  tono: TonoPago;
}

/** El prefijo de las reservas de una clase fija: es CONTRATO, no un nombre (lib/plazas-fijas-cancelacion.ts). */
const PREFIJO_CLASE_FIJA = 'res-pf-';

export function comoVienes({ clase, bonos, disp, reservas, yaNoSeReserva, planesTarifa, nombresTipo, hoy, sinBono }: {
  clase: Pick<Clase, 'id' | 'tipo' | 'tipoClaseId' | 'precioSuelto' | 'sinPrecioSuelto'>;
  bonos: Bono[];
  disp: Disponibilidad;
  reservas: Pick<Reserva, 'id' | 'claseId' | 'estado'>[];
  /** La clase ha empezado o terminado y no es suya: ya no se reserva. */
  yaNoSeReserva: boolean;
  planesTarifa: readonly PlanTienda[] | null | undefined;
  nombresTipo: Record<string, string>;
  hoy: string;
  /**
   * Sin nada que la cubra, cuál de los cuatro casos es (`comoVieneSinBono`, P01, bloque de dinero). Con él, la tarjeta
   * dice lo MISMO que la hoja (pagar aquí, pedirlo en recepción, pagar en el estudio). Sin él, lo de antes.
   */
  sinBono?: ComoVieneSinBono | null;
}): ComoVienesVista | null {
  // La suya, con el mismo criterio que `disponibilidad()` (estados proyectados, en minúscula).
  const mia = reservas.find((r) => r.claseId === clase.id && (r.estado === 'confirmada' || r.estado === 'en-espera'));
  const pagaria = bonoParaClase(bonos, clase.tipoClaseId);

  if (mia?.estado === 'confirmada') {
    // De una reserva YA hecha solo se sabe con certeza con qué viene si es de su clase fija. «Incluida en tu cuota»,
    // solo si hay una cuota que la cubre: sin ella, el barrido nocturno cancela las `res-pf-` (no se promete nada).
    if (mia.id.startsWith(PREFIJO_CLASE_FIJA)) {
      // UNA vez, en una línea (la ficha ya no repite «Incluida en tu cuota» en la fila corta: ver `pagoCortoSobra`).
      return { caso: 'clase-fija', titulo: esCuota(pagaria) ? 'Tu clase fija · incluida en tu cuota' : 'Tu clase fija', detalle: null, tono: 'ok' };
    }
    return null;
  }
  if (yaNoSeReserva || disp === 'no-disponible') return null;

  const topes = (b: Bono) => textoTopes(b, nombresTipo, { soloTipo: clase.tipoClaseId, hasta: true });
  const verBono = (b: Bono) => ({ texto: 'Ver', destino: 'bono' as const, bonoId: b.id });

  if (pagaria && esCuota(pagaria)) {
    return { caso: 'cuota', titulo: 'Incluida en tu cuota', detalle: unir(pagaria.nombre, topes(pagaria)), enlace: verBono(pagaria), tono: 'ok' };
  }
  if (pagaria && !Number.isFinite(pagaria.creditosTotales)) {
    // Un bono sin límite que no es cuota: no gasta sesiones. Sus topes, si los tiene; nunca «sin límite» (el servidor
    // tiene topes por día y a la vez que la app no conoce).
    return { caso: 'ilimitado', titulo: `Incluida en tu ${pagaria.nombre.toLowerCase()}`, detalle: topes(pagaria), enlace: verBono(pagaria), tono: 'ok' };
  }
  if (pagaria) {
    return { caso: 'bono', titulo: pagaria.nombre, detalle: unir(textoSaldoBono(pagaria, hoy), topes(pagaria)), enlace: verBono(pagaria), tono: 'ok' };
  }

  // Nada la cubre: lo que costaría, y la tienda SOLO si algo de la tienda la cubre (si no, sería mandarla a buscar algo
  // que no está). Sin las 2-3 opciones con precio: esperan al bloque de dinero (decisión del fundador, 5-oct-2026).
  const tienda = hayALaVentaQueCubra(planesTarifa, clase.tipoClaseId)
    ? { texto: 'Ver opciones', destino: 'tienda' as const }
    : undefined;
  // Sin plan exigido y sin nada que cobrar (`RESERVA_SIN_PAGAR`): «solo se reserva con bono o cuota» o «clase suelta ·
  // 15 €» mentirían, el servidor la reserva sin cobrar (6-oct-2026). Otra frase que la de la hoja («Reservas sin pagar
  // nada ahora», `notaSinBono`): las dos en la misma pantalla romperían a getByText (ver la guardia del test).
  const precio = sinBono?.caso === 'RESERVA_SIN_PAGAR' && (clase.sinPrecioSuelto || clase.precioSuelto !== 0)
    ? { texto: 'Esta clase no necesita bono', tono: 'ok' as const }
    : clase.sinPrecioSuelto
    ? { texto: 'Esta clase solo se reserva con bono o cuota', tono: 'bloqueo' as const }
    : clase.precioSuelto === 0
      ? { texto: 'Esta clase es gratis', tono: 'ok' as const }
      : { texto: `Clase suelta · ${euros(clase.precioSuelto)}`, tono: 'coste' as const };

  // El bloque de dinero (P01): la tarjeta y la hoja salen de la MISMA decisión. «Clase suelta · 15 €» con un enlace a
  // la tienda, en un estudio que no vende online, era invitarla a comprar algo que aquí no se puede comprar.
  const conSaldo = bonos.filter((b) => b.estado === 'activo');
  // «Tu Bono Mat no sirve para Reformer»: no es lo mismo que «no tienes bono». Nunca la frase de la hoja («tu bono no
  // incluye este tipo de clase»): saldría dos veces en la misma pantalla.
  const tituloNoCubre = () => {
    const conCredito = conSaldo.filter((b) => !Number.isFinite(b.creditosTotales) || b.creditosUsados < b.creditosTotales);
    return conCredito.length === 1
      ? `Tu ${conCredito[0].nombre} no sirve para ${clase.tipo}`
      : `Ninguno de tus bonos sirve para ${clase.tipo}`;
  };

  if (sinBono && sinBono.caso !== 'RESERVA_SIN_PAGAR') {
    if (sinBono.caso === 'PAGA_AQUI') {
      return {
        caso: tieneBonoQueNoCubre(bonos, clase.tipoClaseId) ? 'bono-no-cubre' : 'sin-nada',
        titulo: 'Sin bono para esta clase',
        detalle: `Clase suelta o bono, desde ${euros(sinBono.desde)}`,
        enlace: { texto: 'Ver opciones', destino: 'tienda' },
        tono: 'coste',
      };
    }
    if (sinBono.caso === 'PAGA_EN_ESTUDIO') {
      return { caso: 'sin-nada', titulo: `Pagas ${euros(sinBono.importe)} en el estudio`, detalle: 'El día de la clase', tono: 'coste' };
    }
    // PIDE_BONO_EN_ESTUDIO. Con sus palabras, no con la nota de la hoja (`notaSinBono`): la llevaba de detalle y, con la
    // hoja abierta, la misma frase salía dos veces (lo destapó la fixture con «exigir plan», como en producción).
    const noCubre = tieneBonoQueNoCubre(bonos, clase.tipoClaseId);
    if (sinBono.motivo === 'precio-especial') {
      return { caso: noCubre ? 'bono-no-cubre' : 'sin-nada', titulo: noCubre ? tituloNoCubre() : 'Esta clase se reserva en el estudio', detalle: noCubre ? 'Tiene precio especial: se reserva en el estudio' : 'Tiene precio especial', tono: 'bloqueo' };
    }
    return { caso: noCubre ? 'bono-no-cubre' : 'sin-nada', titulo: noCubre ? tituloNoCubre() : 'Esta clase necesita bono', detalle: 'Se consigue en recepción', tono: 'bloqueo' };
  }

  if (tieneBonoQueNoCubre(bonos, clase.tipoClaseId)) {
    return { caso: 'bono-no-cubre', titulo: tituloNoCubre(), detalle: precio.texto, enlace: tienda, tono: precio.tono };
  }
  return { caso: 'sin-nada', titulo: precio.texto, detalle: null, enlace: tienda, tono: precio.tono };
}

function unir(...partes: Array<string | null | undefined>): string | null {
  const v = partes.filter((p): p is string => !!p && p.trim() !== '');
  return v.length > 0 ? v.join(' · ') : null;
}

/**
 * La fila corta de la ficha («Incluida en tu cuota», «Con tu bono · 1 sesión») sobra cuando «Cómo vienes» ya dice lo
 * mismo justo debajo: era la misma frase dos y tres veces en la misma pantalla.
 */
export function pagoCortoSobra(v: ComoVienesVista | null): boolean {
  return !!v && (v.caso === 'clase-fija' || v.caso === 'cuota' || v.caso === 'ilimitado' || v.caso === 'bono');
}
