'use client';

// «Próximas cuotas» (decisión 7): en lugar de «Ver las N suscripciones activas»,
// cuyos botones no hacían nada, cómo se va a cobrar cada cuota que se renueva en
// los próximos 30 días. Cambiar o cancelar un plan sigue en la ficha de la clienta.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Banknote, Building2, CalendarClock, CalendarOff, CreditCard, HelpCircle, type LucideIcon } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { cn, formatEuro } from '@/lib/utils';
import { diasEntre, fechaCorta } from '@/lib/clientas/textos';
import { proximasCuotas, textoComoSeCobrara, type ComoSeCobraraLaCuota } from '@/lib/cobros/proximas-cuotas';
import { resumenProximasCuotas } from '@/lib/cobros/cifras-cobros';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { CabeceraTarjeta, Pildoras } from '@/components/dashboard/vivo';
import type { DatosCobros } from './use-datos-cobros';

const ICONO: Record<ComoSeCobraraLaCuota, LucideIcon> = {
  SOLA_TARJETA: CreditCard,
  SOLA_DOMICILIACION: Building2,
  TARJETA_CADUCA: AlertTriangle,
  REMESA: Building2,
  A_MANO: Banknote,
  NO_SE_RENUEVA: CalendarOff,
  NO_SE_SABE: HelpCircle,
};

/**
 * Las cuotas que se renuevan en los próximos `dias` (30 si no se dice), con cómo
 * se va a cobrar cada una. La comparten la lista de abajo y la cifra «Próximos
 * 7 días» del panel nuevo: las dos dicen lo mismo porque es la misma cuenta.
 */
export function useProximasCuotas(datos: DatosCobros, dias?: number) {
  const { suscripciones, planesTarifa, socios } = useStudio();
  return useMemo(() => {
    const planes = new Map(planesTarifa.map(p => [p.id, { tipo: p.tipo, nombre: p.nombre, precio: p.precio }]));
    const activas = new Map(socios.map(s => [s.id, s.activo !== false]));
    return proximasCuotas({
      suscripciones, planes, hoy: datos.hoy, dias,
      clienta: id => {
        const s = datos.socioDe(id);
        return s ? { activa: activas.get(id) ?? true, pago: datos.datosDePagoLeidos ? s : null } : undefined;
      },
      tieneMandatoVigente: datos.mandatoVigente,
      estudioConStripe: datos.estudioConStripe,
      estudioHaceRemesas: datos.estudioHaceRemesas,
    });
  }, [suscripciones, planesTarifa, socios, datos, dias]);
}

export function ProximasCuotas({ datos }: { datos: DatosCobros }) {
  const { cuotas, sinFechaDeFin } = useProximasCuotas(datos);

  return (
    <section aria-label="Próximas cuotas" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3.5">
        <h2 className="text-[13.5px] font-semibold text-foreground">Próximas cuotas · 30 días · {cuotas.length}</h2>
        <span className="ml-auto text-[12.5px] text-muted-foreground">Cambiar o cancelar un plan, en la ficha de la clienta</span>
      </div>
      {cuotas.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-muted-foreground">No se renueva ninguna cuota en los próximos 30 días.</p>
      ) : (
        <ul className="divide-y divide-border">
          {cuotas.map(c => {
            const Icono = ICONO[c.como];
            const malo = c.como === 'TARJETA_CADUCA';
            return (
              <li key={c.suscripcionId} className="grid grid-cols-1 gap-1 px-4 py-2.5 text-[13px] md:grid-cols-[minmax(0,1fr)_150px_70px_minmax(0,260px)] md:items-center md:gap-3">
                <Link href={`/clientas/${c.socioId}`} className="truncate font-medium text-foreground hover:underline">{datos.nombreDe(c.socioId)}</Link>
                <span className="truncate text-muted-foreground">{c.planNombre} · <CifraPrivada inline>{formatEuro(c.importe)}</CifraPrivada></span>
                <span className="tabular-nums text-muted-foreground">{fechaCorta(c.dia, datos.hoy)}</span>
                <span className={cn('flex items-start gap-1.5', malo ? 'text-destructive' : 'text-foreground')}>
                  <Icono size={13} className="mt-0.5 shrink-0" aria-hidden />{textoComoSeCobrara(c.como, fechaCorta(c.dia, datos.hoy))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {sinFechaDeFin > 0 && (
        <p className="border-t border-border px-4 py-2.5 text-[12.5px] text-muted-foreground">
          {sinFechaDeFin === 1 ? '1 cuota no tiene fecha de fin' : `${sinFechaDeFin} cuotas no tienen fecha de fin`}: no se renueva{sinFechaDeFin === 1 ? '' : 'n'} sola{sinFechaDeFin === 1 ? '' : 's'}.
        </p>
      )}
    </section>
  );
}

// ─── Panel nuevo ──────────────────────────────────────────────────────────────

export const PLAZOS_PROXIMAS = [7, 15, 30, 60] as const;
export type PlazoProximas = (typeof PLAZOS_PROXIMAS)[number];

/**
 * «Próximas cuotas» en el panel nuevo, como «Próximos vencimientos» de Bonsai
 * (b-80): la MISMA lista de arriba (`useProximasCuotas`), en su tarjeta, con el
 * plazo en píldoras (7, 15, 30 o 60 días) y lo que suman a la derecha.
 */
export function ProximasCuotasNueva({ datos, diasIniciales = 30 }: { datos: DatosCobros; diasIniciales?: PlazoProximas }) {
  const [dias, setDias] = useState<PlazoProximas>(diasIniciales);
  const { cuotas, sinFechaDeFin } = useProximasCuotas(datos, dias);
  const resumen = resumenProximasCuotas(cuotas);
  return (
    <section id="proximas-cuotas" aria-labelledby="proximas-cuotas-titulo" className="scroll-mt-4 overflow-hidden rounded-t-card border border-border bg-card shadow-t-card">
      <div className="space-y-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <CabeceraTarjeta
          tono="indigo"
          Icono={CalendarClock}
          titulo="Próximas cuotas"
          id="proximas-cuotas-titulo"
          sub="Las que vencen y cómo se cobrará cada una"
          derecha={resumen.n > 0 ? (
            <span className="shrink-0 text-right leading-tight">
              <CifraPrivada inline className="block text-[15px] font-semibold tabular-nums text-foreground">{formatEuro(resumen.importe)}</CifraPrivada>
              <span className="text-[11.5px] text-muted-foreground">{resumen.n} {resumen.n === 1 ? 'se renueva' : 'se renuevan'}</span>
            </span>
          ) : null}
        />
        <Pildoras opciones={PLAZOS_PROXIMAS.map(d => ({ valor: d, label: `${d} días` }))} valor={dias} onCambio={setDias} />
      </div>
      {cuotas.length === 0 ? (
        <p className="px-4 pb-5 pt-3 text-[13px] text-muted-foreground sm:px-5">No se renueva ninguna cuota en los próximos {dias} días.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {cuotas.map(c => {
            const Icono = ICONO[c.como];
            const malo = c.como === 'TARJETA_CADUCA';
            const nombre = datos.nombreDe(c.socioId);
            const dentroDe = diasEntre(datos.hoy, c.dia);
            return (
              <li key={c.suscripcionId} className="px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--cat-5) 14%, var(--card))', color: 'var(--cat-5)' }}
                  >
                    {iniciales(nombre)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link href={`/clientas/${c.socioId}`} className="block truncate text-[13.5px] font-semibold text-foreground hover:underline">{nombre}</Link>
                    <span className="block truncate text-[12px] text-muted-foreground">{c.planNombre}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <CifraPrivada inline className="block text-[13px] font-semibold tabular-nums text-foreground">{formatEuro(c.importe)}</CifraPrivada>
                    <span
                      className="mt-0.5 inline-block rounded-full px-2 py-px text-[11px] font-semibold"
                      style={dentroDe <= 3
                        ? { color: 'var(--warning)', backgroundColor: 'color-mix(in srgb, var(--warning) 14%, transparent)' }
                        : { color: 'var(--muted-foreground)', backgroundColor: 'var(--muted)' }}
                    >
                      {fechaCorta(c.dia, datos.hoy)}
                    </span>
                  </span>
                </div>
                <p className={cn('mt-1.5 flex items-start gap-1.5 pl-12 text-[12.5px] leading-snug', malo ? 'text-destructive' : 'text-muted-foreground')}>
                  <Icono size={13} className="mt-0.5 shrink-0" aria-hidden />{textoComoSeCobrara(c.como, fechaCorta(c.dia, datos.hoy))}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground sm:px-5">
        {sinFechaDeFin > 0 && (
          <>{sinFechaDeFin === 1 ? '1 cuota no tiene fecha de fin' : `${sinFechaDeFin} cuotas no tienen fecha de fin`}: no se renueva{sinFechaDeFin === 1 ? '' : 'n'} sola{sinFechaDeFin === 1 ? '' : 's'}. </>
        )}
        Cambiar o cancelar un plan, en la ficha de la clienta.
      </p>
    </section>
  );
}

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
}
