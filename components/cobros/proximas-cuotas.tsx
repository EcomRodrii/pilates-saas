'use client';

// «Próximas cuotas» (decisión 7): en lugar de «Ver las N suscripciones activas»,
// cuyos botones no hacían nada, cómo se va a cobrar cada cuota que se renueva en
// los próximos 30 días. Cambiar o cancelar un plan sigue en la ficha de la clienta.

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, Banknote, Building2, CalendarOff, CreditCard, HelpCircle, type LucideIcon } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { cn, formatEuro } from '@/lib/utils';
import { fechaCorta } from '@/lib/clientas/textos';
import { proximasCuotas, textoComoSeCobrara, type ComoSeCobraraLaCuota } from '@/lib/cobros/proximas-cuotas';
import { CifraPrivada } from '@/components/ui/cifra-privada';
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

export function ProximasCuotas({ datos }: { datos: DatosCobros }) {
  const { suscripciones, planesTarifa, socios } = useStudio();
  const { cuotas, sinFechaDeFin } = useMemo(() => {
    const planes = new Map(planesTarifa.map(p => [p.id, { tipo: p.tipo, nombre: p.nombre, precio: p.precio }]));
    const activas = new Map(socios.map(s => [s.id, s.activo !== false]));
    return proximasCuotas({
      suscripciones, planes, hoy: datos.hoy,
      clienta: id => {
        const s = datos.socioDe(id);
        return s ? { activa: activas.get(id) ?? true, pago: datos.datosDePagoLeidos ? s : null } : undefined;
      },
      tieneMandatoVigente: datos.mandatoVigente,
      estudioConStripe: datos.estudioConStripe,
      estudioHaceRemesas: datos.estudioHaceRemesas,
    });
  }, [suscripciones, planesTarifa, socios, datos]);

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
