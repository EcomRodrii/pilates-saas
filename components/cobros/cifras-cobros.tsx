'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Lo de arriba de Cobros en el panel nuevo (14-oct-2026), como «Cuentas» de
// Bonsai (b-80): cuatro cifras con su color que responden a las dos preguntas de
// siempre —quién me debe y cuánto he cobrado— y a la que faltaba, qué viene; y
// la gráfica de lo cobrado cada mes, la misma que la del Resumen.
//
// Ninguna cifra se calcula aquí:
//   · «Cobrado este mes»: `ingresosAlDia` (lib/inicio/cifras.ts), la del Resumen,
//     con su comparación con el mes pasado a estas alturas.
//   · «Te deben» y «Devueltos y fallidos»: `resumenDeLaDeuda` sobre los grupos de
//     `agruparDeudas`, la misma cuenta que la lista de abajo.
//   · «Próximos 7 días»: `proximasCuotas` (vía `useProximasCuotas`), la lista de
//     «Próximas cuotas» con el plazo a 7 días.
// Cada cifra lleva a su pestaña o a su filtro sin salir de la pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Clock, Euro } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { ingresosAlDia } from '@/lib/inicio/cifras';
import { agruparDeudas } from '@/lib/cobros/deudas';
import { resumenDeLaDeuda, resumenProximasCuotas, type ResumenProximas } from '@/lib/cobros/cifras-cobros';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { TarjetaCifra } from '@/components/dashboard/vivo';
import { GraficaIngresos, formatoEuros, ladoIngresos } from '@/components/dashboard/ingresos-nuevo';
import { useProximasCuotas } from './proximas-cuotas';
import type { DatosCobros } from './use-datos-cobros';

/** A dónde lleva cada cifra. */
export type DestinoCifra = 'cobrado' | 'deudas' | 'atencion' | 'proximas';

const clientas = (n: number) => `${n} ${n === 1 ? 'clienta' : 'clientas'}`;

export function CifrasCobros({ datos, onIr }: { datos: DatosCobros; onIr: (d: DestinoCifra) => void }) {
  const { recibos } = useStudio();
  const alDia = useMemo(() => ingresosAlDia(recibos, datos.hoy), [recibos, datos.hoy]);
  const deuda = useMemo(() => resumenDeLaDeuda(agruparDeudas(recibos, id => !!datos.socioDe(id)), recibos), [recibos, datos]);
  const { cuotas } = useProximasCuotas(datos, 7);
  const proximas = useMemo(() => resumenProximasCuotas(cuotas), [cuotas]);
  // El enlace se queda (⌘-clic abre la pestaña aparte); el clic normal cambia la pestaña aquí.
  const ir = (d: DestinoCifra) => (e: { preventDefault: () => void }) => { e.preventDefault(); onIr(d); };
  const nAtencion = deuda.atencion.grupos;

  return (
    // 2 × 2 hasta que caben cuatro con aire, como en el Resumen.
    <div data-tour="cobros-resumen" className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
      <TarjetaCifra
        etiqueta="Cobrado este mes"
        tono="verde"
        Icono={Euro}
        href="/cobros?tab=cobrado"
        onNavigate={ir('cobrado')}
        valor={<CifraPrivada inline>{formatoEuros(alDia.actual)}</CifraPrivada>}
        {...ladoIngresos(alDia.actual, alDia.anterior, alDia.mesAnterior)}
      />
      <TarjetaCifra
        etiqueta="Te deben"
        tono="azul"
        Icono={Clock}
        href="/cobros?tab=deudas"
        onNavigate={ir('deudas')}
        valor={<CifraPrivada inline>{formatoEuros(deuda.teDeben)}</CifraPrivada>}
        arriba={deuda.grupos > 0 ? clientas(deuda.grupos) : undefined}
        abajo={deuda.enElBanco > 0
          ? <>{deuda.grupos > 0 ? 'y ' : 'Nadie te debe; '}<CifraPrivada inline>{formatoEuros(deuda.enElBanco)}</CifraPrivada> en el banco</>
          : deuda.grupos > 0 ? 'con algo por pagar' : 'Nadie te debe nada'}
      />
      <TarjetaCifra
        etiqueta="Devueltos y fallidos"
        tono="magenta"
        Icono={AlertTriangle}
        // Sin ninguno, no hay a dónde ir: la lista filtrada saldría vacía.
        href={nAtencion > 0 ? '/cobros?tab=deudas' : null}
        onNavigate={ir('atencion')}
        valor={<CifraPrivada inline>{formatoEuros(deuda.atencion.importe)}</CifraPrivada>}
        arriba={nAtencion > 0 ? <span style={{ color: 'var(--destructive)' }}>{clientas(nAtencion)}</span> : undefined}
        abajo={nAtencion > 0 ? 'devuelto o sin poder cobrar' : 'Nada devuelto ni fallido'}
      />
      <TarjetaCifra
        etiqueta="Próximos 7 días"
        tono="indigo"
        Icono={CalendarClock}
        href="/cobros?tab=deudas#proximas-cuotas"
        onNavigate={ir('proximas')}
        valor={<CifraPrivada inline>{formatoEuros(proximas.importe)}</CifraPrivada>}
        arriba={proximas.n > 0 ? `${proximas.n} ${proximas.n === 1 ? 'cuota' : 'cuotas'}` : undefined}
        abajo={ladoProximas(proximas)}
      />
    </div>
  );
}

/** Lo que va al lado de lo que se renueva: primero lo que fallará o tendrás que cobrar tú. */
function ladoProximas(p: ResumenProximas) {
  if (p.n === 0) return 'Ninguna cuota se renueva';
  const aviso = (texto: string) => <span style={{ color: 'var(--warning)' }}>{texto}</span>;
  if (p.tarjetaCaduca > 0) return aviso(p.tarjetaCaduca === 1 ? '1 tarjeta caduca antes' : `${p.tarjetaCaduca} tarjetas caducan antes`);
  if (p.aMano > 0) return aviso(p.aMano === 1 ? '1 la cobras tú' : `${p.aMano} las cobras tú`);
  return p.n === 1 ? 'se renueva' : 'se renuevan';
}

/** La gráfica de lo cobrado cada mes (la del Resumen), con el enlace a «Lo que he cobrado». */
export function GraficaCobros({ datos, onVerCobrado }: { datos: DatosCobros; onVerCobrado: () => void }) {
  const { recibos } = useStudio();
  const alDia = useMemo(() => ingresosAlDia(recibos, datos.hoy), [recibos, datos.hoy]);
  return (
    <GraficaIngresos
      recibos={recibos}
      hoy={datos.hoy}
      alDia={alDia}
      href={null}
      pie={(
        <button type="button" onClick={onVerCobrado} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: 'var(--t-text-link)' }}>
          Ver lo que he cobrado <ArrowRight size={14} aria-hidden />
        </button>
      )}
    />
  );
}
