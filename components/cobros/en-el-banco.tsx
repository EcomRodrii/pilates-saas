'use client';

// Lo que está en el banco (EN_CURSO): todavía no es deuda, porque el banco no ha
// contestado, y desde #2468 tiene salida. Con un cargo de Stripe en marcha lo
// cierra Stripe; lo que salió en una remesa lo cierra quien mira el banco.
//
// La fecha de preparación y el día de cargo solo existen desde la migración
// `recibos_marcas_de_tiempo`: lo antiguo dice «Enviado al banco, sin respuesta».
// Y «cargo PEDIDO para», nunca «se carga»: el banco puede moverlo a un día hábil.

import { Landmark } from 'lucide-react';
import type { Recibo } from '@/lib/types';
import { formatEuro } from '@/lib/utils';
import { aCentimos, importeEnCurso } from '@/lib/billing/situacion-recibo';
import { fechaCorta } from '@/lib/clientas/textos';
import { hoyEnEstudio } from '@/lib/utils';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { CabeceraTarjeta } from '@/components/dashboard/vivo';
import { MenuRecibo } from './menu-recibo';
import type { AccionesRecibo } from './use-acciones-recibo';
import type { DatosCobros } from './use-datos-cobros';

export function textoEnElBanco(r: Recibo, hoy: string): string {
  if (r.stripePaymentIntentId) return 'Adeudo de Stripe en curso: se cerrará solo';
  if (!r.enviadoAlBancoEn) return 'Enviado al banco, sin respuesta';
  const preparado = `Fichero preparado el ${fechaCorta(hoyEnEstudio(new Date(r.enviadoAlBancoEn)), hoy)}`;
  return r.cargoPedidoPara ? `${preparado} · cargo pedido para el ${fechaCorta(r.cargoPedidoPara, hoy)}` : preparado;
}

/** `nueva`: con la forma de las tarjetas del panel nuevo; las filas y sus botones son los mismos. */
export function EnElBanco({ recibos, datos, acciones, nueva = false }: { recibos: Recibo[]; datos: DatosCobros; acciones: AccionesRecibo; nueva?: boolean }) {
  if (recibos.length === 0) return null;
  const total = aCentimos(recibos.reduce((t, r) => t + importeEnCurso(r), 0));
  return (
    <section aria-label="En el banco" className={nueva ? 'rounded-t-card border border-border bg-card p-4 shadow-t-card sm:p-5' : 'rounded-2xl border border-border bg-card p-4'}>
      {nueva ? (
        <CabeceraTarjeta
          tono="indigo"
          Icono={Landmark}
          titulo={`En el banco · ${recibos.length} ${recibos.length === 1 ? 'recibo' : 'recibos'}`}
          sub="Todavía no es deuda: el banco no ha contestado."
          derecha={<CifraPrivada inline className="shrink-0 pt-0.5 text-[15px] font-semibold tabular-nums text-foreground">{formatEuro(total)}</CifraPrivada>}
        />
      ) : (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Landmark size={15} className="text-muted-foreground" aria-hidden />
        <h2 className="text-[13.5px] font-semibold text-foreground">
          En el banco · {recibos.length} {recibos.length === 1 ? 'recibo' : 'recibos'} · <CifraPrivada inline>{formatEuro(total)}</CifraPrivada>
        </h2>
        <span className="text-[12.5px] text-muted-foreground">Todavía no es deuda: el banco no ha contestado.</span>
      </div>
      )}
      <ul className="mt-3 divide-y divide-border">
        {recibos.map(r => {
          const acc = datos.accionesDe(r);
          const rapidas = acc.filter(a => a.id === 'EL_BANCO_LO_HA_COBRADO' || a.id === 'EL_BANCO_LO_DEVOLVIO');
          return (
            <li key={r.id} data-recibo={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              {/* En el móvil el texto va en su propia línea y los botones debajo. */}
              <div className="min-w-0 flex-1 basis-full md:basis-0">
                <p className="truncate text-[13.5px] font-medium text-foreground">{datos.nombreDe(r.socioId)}</p>
                <p className="text-[12.5px] text-muted-foreground">{r.concepto} · {textoEnElBanco(r, datos.hoy)}</p>
              </div>
              <span className="text-[14px] font-semibold tabular-nums text-foreground"><CifraPrivada inline>{formatEuro(r.importe)}</CifraPrivada></span>
              {rapidas.map(a => (
                <button
                  key={a.id} type="button"
                  onClick={() => acciones.ejecutar(a.id, r)}
                  disabled={acciones.enVuelo(r.id)}
                  className="inline-flex min-h-9 items-center rounded-lg border border-border bg-card px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {a.texto}
                </button>
              ))}
              {acc.some(a => a.id === 'LO_CIERRA_STRIPE') && <span className="text-[12px] text-muted-foreground">Lo cierra Stripe</span>}
              <MenuRecibo recibo={r} datos={datos} acciones={acciones} quitar={['EL_BANCO_LO_HA_COBRADO', 'EL_BANCO_LO_DEVOLVIO', 'LO_CIERRA_STRIPE']} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
