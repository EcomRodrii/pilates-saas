'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que todas las piezas de Cobros necesitan saber de un recibo y de una
// clienta, calculado una vez por render y no por fila: mapas por id (no `.find`
// en cada fila, que con cientos de recibos se nota) y las reglas puras de
// `lib/cobros/` ya alimentadas con los datos del contexto.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { useStudio } from '@/lib/studio-context';
import type { Factura, Recibo, Socio, Suscripcion } from '@/lib/types';
import { accionesDeRecibo, type AccionDeRecibo } from '@/lib/cobros/acciones-de-recibo';
import { comoSeLePuedeCobrar, type MedioDeCobro } from '@/lib/cobros/medio-de-cobro';
import { reintentoAutomatico, type ReintentoAutomatico } from '@/lib/cobros/reintento-automatico';
import { cuandoSera } from '@/lib/clientas/textos';
import { hoyEnEstudio } from '@/lib/utils';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export interface DatosCobros {
  hoy: string;
  ahora: Date;
  socioDe: (id: string | null) => Socio | undefined;
  nombreDe: (id: string | null) => string;
  facturaDe: (reciboId: string) => Factura | undefined;
  cuotaDe: (suscripcionId: string | null) => Suscripcion | undefined;
  estudioConStripe: boolean;
  estudioHaceRemesas: boolean;
  estudioFactura: boolean;
  /** ¿Se han leído sus datos de pago? (la RPC privada puede fallar) */
  datosDePagoLeidos: boolean;
  mandatosCargados: boolean;
  mandatoVigente: (socioId: string | null) => boolean;
  algunMandato: (socioId: string | null) => boolean;
  medioDe: (socioId: string) => MedioDeCobro;
  reintentoDe: (r: Recibo) => ReintentoAutomatico | null;
  /** «el martes 6 oct», o `null` si no se cobra solo. */
  seCobraSoloEl: (r: Recibo) => string | null;
  accionesDe: (r: Recibo) => AccionDeRecibo[];
}

/** «el martes 6 oct» / «mañana» / «hoy», en día del estudio. */
export function cuandoEnPalabras(instante: Date, hoy: string): string {
  const dia = hoyEnEstudio(instante);
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return cuandoSera(dia, hoy, DIAS[dow]);
}

export function useDatosCobros(): DatosCobros {
  const { studio, socios, facturas, suscripciones, mandatosSepa, estadoMandatosSepa, datosIncompletos } = useStudio();

  return useMemo(() => {
    const ahora = new Date();
    const hoy = hoyEnEstudio(ahora);
    const sociosPorId = new Map(socios.map(s => [s.id, s]));
    const facturaPorRecibo = new Map<string, Factura>();
    for (const f of facturas) if (f.reciboId) facturaPorRecibo.set(f.reciboId, f);
    const cuotaPorId = new Map(suscripciones.map(s => [s.id, s]));
    const vigentes = new Set<string>(), alguno = new Set<string>();
    for (const m of mandatosSepa) {
      alguno.add(m.socioId);
      if (m.estado === 'VIGENTE') vigentes.add(m.socioId);
    }
    const estudioConStripe = !!studio?.stripeAccountId;
    const estudioHaceRemesas = !!(studio?.sepaAcreedorId && studio?.sepaIban && studio?.sepaTitular);
    const estudioFactura = studio?.modoFacturacion === 'verifactu';
    const datosDePagoLeidos = !datosIncompletos.includes('socios');
    const mandatosCargados = estadoMandatosSepa === 'listo';

    const socioDe = (id: string | null) => (id ? sociosPorId.get(id) : undefined);
    const pagoDe = (socioId: string | null) => {
      const s = socioDe(socioId);
      return s && datosDePagoLeidos ? s : null;
    };
    const medios = new Map<string, MedioDeCobro>();
    const medioDe = (socioId: string): MedioDeCobro => {
      let m = medios.get(socioId);
      if (!m) {
        m = comoSeLePuedeCobrar({
          clienta: pagoDe(socioId), estudioConStripe, estudioHaceRemesas, mandatosCargados,
          tieneMandatoVigente: vigentes.has(socioId), ahora,
        });
        medios.set(socioId, m);
      }
      return m;
    };
    const reintentoDe = (r: Recibo) => reintentoAutomatico({
      recibo: { estado: r.estado, proximoReintento: r.proximoReintento ?? null, trasCancelarCuota: r.trasCancelarCuota ?? null },
      cuota: r.suscripcionId ? (cuotaPorId.get(r.suscripcionId) ?? null) : null,
      estudioConStripe, clienta: pagoDe(r.socioId), ahora,
    });
    const seCobraSoloEl = (r: Recibo) => {
      const x = reintentoDe(r);
      return x?.tipo === 'SE_COBRA_SOLO' ? cuandoEnPalabras(x.cuando, hoy) : null;
    };
    const accionesDe = (r: Recibo) => {
      const medio = r.socioId ? medioDe(r.socioId) : null;
      const f = facturaPorRecibo.get(r.id);
      return accionesDeRecibo(r, {
        factura: f ? { numero: f.numeroCompleto } : null,
        estudioFactura, estudioHaceRemesas,
        mandatoVigente: !!r.socioId && vigentes.has(r.socioId),
        algunMandato: !r.socioId ? false : mandatosCargados ? alguno.has(r.socioId) : null,
        cobroSinElla: medio?.estado === 'LISTO' && medio.online ? { boton: medio.online.boton } : null,
        cuota: r.suscripcionId ? (cuotaPorId.get(r.suscripcionId) ?? null) : null,
        seCobraSoloEl: seCobraSoloEl(r),
      });
    };
    return {
      hoy, ahora, socioDe,
      nombreDe: (id: string | null) => {
        if (!id) return 'Venta de mostrador';
        const s = sociosPorId.get(id);
        return s ? `${s.nombre} ${s.apellidos ?? ''}`.trim() : 'Clienta eliminada';
      },
      facturaDe: (reciboId: string) => facturaPorRecibo.get(reciboId),
      cuotaDe: (id: string | null) => (id ? cuotaPorId.get(id) : undefined),
      estudioConStripe, estudioHaceRemesas, estudioFactura, datosDePagoLeidos, mandatosCargados,
      mandatoVigente: (id: string | null) => !!id && vigentes.has(id),
      algunMandato: (id: string | null) => !!id && alguno.has(id),
      medioDe, reintentoDe, seCobraSoloEl, accionesDe,
    };
  }, [studio, socios, facturas, suscripciones, mandatosSepa, estadoMandatosSepa, datosIncompletos]);
}
