'use client';

import { useEffect, useMemo, useState } from 'react';
import { Landmark, Plus } from 'lucide-react';
import { cn, formatEuro } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { useRol, puedeVerAuditoriaFinanciera } from '@/lib/permisos';
import { situacionRecibo } from '@/lib/billing/situacion-recibo';
import { agruparDeudas } from '@/lib/cobros/deudas';
import { cobradoEnTramo, mismoTramoAnterior, textoDeLaComparacion, tramoVisible } from '@/lib/cobros/lo-cobrado';
import { PageHeader } from '@/components/ui/page-header';
import { MenuAcciones } from '@/components/ui/menu-acciones';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { QuienMeDebe } from '@/components/cobros/quien-me-debe';
import { LoQueHeCobrado } from '@/components/cobros/lo-que-he-cobrado';
import { ParaTuGestoria } from '@/components/cobros/para-tu-gestoria';
import { PanelFacturas } from '@/components/cobros/panel-facturas';
import { BotonRemesaSepa, DialogoRemesaSepa } from '@/components/cobros/boton-remesa-sepa';
import { DialogoNuevoCobro } from '@/components/cobros/dialogo-nuevo-cobro';
import { useAccionesRecibo, type AvisosCobros } from '@/components/cobros/use-acciones-recibo';
import { useDatosCobros, type DatosCobros } from '@/components/cobros/use-datos-cobros';
import { HistorialDinero } from '@/components/auditoria/historial-dinero';
import { Toast, useToast } from '@/components/ui/toast';

// "Cobrar" existe como un solo sitio. La caja (TPV) se queda fuera a propósito:
// es otro modo de uso —pantalla completa, táctil, de pie en el mostrador—.
//
// Rediseño del 2-oct-2026 (maquetas aprobadas): una dueña de estudio lo resumió
// en «yo necesito dos cosas, quién me debe y cuánto he cobrado», y eso es la
// línea de arriba y las dos primeras pestañas. La tercera depende de si factura
// con Tentare: «Facturas» si sí, «Para tu gestoría» si no.
const TABS = ['deudas', 'cobrado', 'facturas', 'historial'] as const;
type TabId = (typeof TABS)[number];

function tabDeLaUrl(v: string | null): TabId | null {
  // `pendientes` era el nombre antiguo de «Quién me debe»: hay enlaces vivos.
  if (v === 'pendientes') return 'deudas';
  return TABS.includes(v as TabId) ? (v as TabId) : null;
}

export default function Cobros() {
  const [tab, setTab] = useState<TabId>('deudas');
  const [nuevoCobro, setNuevoCobro] = useState(false);
  const [remesa, setRemesa] = useState(false);
  const toast = useToast();
  const { studio, recibos, resetDatosPilates } = useStudio();
  const verHistorial = puedeVerAuditoriaFinanciera(useRol());
  const datos = useDatosCobros();
  // Un solo canal de avisos para toda la pantalla, con el error en su color.
  const avisos: AvisosCobros = useMemo(() => ({ ok: toast.show, error: toast.showError }), [toast.show, toast.showError]);
  const acciones = useAccionesRecibo(avisos);

  // Se lee de window.location y no con useSearchParams para no suspender el
  // árbol (mismo motivo que en el resto de pantallas del panel).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = tabDeLaUrl(params.get('tab'));
    // `?tab=historial` no abre la pestaña a quien no puede verla.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee la URL al entrar
    if (t && (t !== 'historial' || verHistorial)) setTab(t);
    // «Emitir una factura» / «Cobrar una mensualidad» del buscador: abre «Nuevo cobro».
    if (params.get('nuevo') === 'cobro') setNuevoCobro(true);
  }, [verHistorial]);

  // Vuelta de un pago de Stripe. SEGURIDAD: aquí no se escribe nada —el webhook
  // marca el recibo con el importe verificado contra Stripe—; solo se relee el
  // estado real. Antes bastaba el parámetro en la URL para dar un recibo por pagado.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_success') && params.get('recibo')) {
      toast.show('Pago completado. Actualizando…');
      window.history.replaceState({}, '', '/cobros?tab=deudas');
      resetDatosPilates();
      // El webhook casi siempre llega antes que este redirect; por si hay carrera,
      // se relee una vez más tras un margen breve.
      const t = setTimeout(() => resetDatosPilates(), 2500);
      return () => clearTimeout(t);
    }
    if (params.get('stripe_cancel')) {
      toast.showError('Pago cancelado.');
      window.history.replaceState({}, '', '/cobros?tab=deudas');
    }
    // Solo al entrar: la URL de vuelta se limpia en el acto.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function irA(id: TabId) {
    setTab(id);
    // La pestaña queda en la URL para poder enlazarla y para que recargar no
    // devuelva a la primera.
    window.history.replaceState({}, '', `/cobros?tab=${id}`);
  }

  // Mientras carga el estudio, «Facturas»: la de siempre, sin parpadeo.
  const sinFacturacion = studio?.modoFacturacion === 'sin_facturas';
  const nDeudas = useMemo(() => agruparDeudas(recibos, id => !!datos.socioDe(id)).length, [recibos, datos]);
  const etiquetas: Record<TabId, string> = {
    deudas: 'Quién me debe',
    cobrado: 'Lo que he cobrado',
    facturas: sinFacturacion ? 'Para tu gestoría' : 'Facturas',
    historial: 'Cambios del equipo',
  };
  const tabs = TABS.filter(t => t !== 'historial' || verHistorial);

  return (
    <div data-tour="cobros-vista" className="space-y-5">
      <PageHeader
        title="Cobros"
        description={<LineaResumen datos={datos} />}
        actions={(
          <div className="flex items-center gap-2">
            {datos.estudioHaceRemesas && (
              <>
                <span className="hidden md:inline-flex"><BotonRemesaSepa /></span>
                <span className="md:hidden">
                  <MenuAcciones
                    etiqueta="Más acciones de Cobros"
                    acciones={[{ texto: 'Preparar recibos para el banco', icono: Landmark, onClick: () => setRemesa(true) }]}
                  />
                </span>
              </>
            )}
            <button
              type="button" onClick={() => setNuevoCobro(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:brightness-95"
            >
              <Plus size={15} aria-hidden />Nuevo cobro
            </button>
          </div>
        )}
      />

      {/* `max-w-full` + scroll: en un móvil de 375 px las cuatro no caben. */}
      <div role="tablist" aria-label="Cobros" className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-muted p-1">
        {tabs.map(t => (
          <button
            key={t} type="button" role="tab" aria-selected={tab === t}
            onClick={() => irA(t)}
            className={cn(
              'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              tab === t ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {etiquetas[t]}
            {t === 'deudas' && nDeudas > 0 && <span className="ml-1.5 tabular-nums text-muted-foreground">{nDeudas}</span>}
          </button>
        ))}
      </div>

      {tab === 'deudas' && <QuienMeDebe datos={datos} acciones={acciones} avisos={avisos} />}
      {tab === 'cobrado' && <LoQueHeCobrado datos={datos} acciones={acciones} avisos={avisos} />}
      {tab === 'facturas' && (sinFacturacion ? <ParaTuGestoria hoy={datos.hoy} avisos={avisos} /> : <PanelFacturas />)}
      {tab === 'historial' && verHistorial && studio && <HistorialDinero studioId={studio.id} />}

      {acciones.dialogos}
      <DialogoNuevoCobro abierto={nuevoCobro} onCerrar={() => setNuevoCobro(false)} avisos={avisos} />
      {datos.estudioHaceRemesas && <DialogoRemesaSepa abierto={remesa} onCerrar={() => setRemesa(false)} />}
      {toast.message && (
        <Toast key={toast.message} message={toast.message} variant={toast.variant} action={toast.action} onDismiss={toast.dismiss} />
      )}
    </div>
  );
}

/** La línea que responde a las dos preguntas: quién me debe y cuánto he cobrado. */
function LineaResumen({ datos }: { datos: DatosCobros }) {
  const { recibos } = useStudio();
  const r = useMemo(() => {
    const grupos = agruparDeudas(recibos, id => !!datos.socioDe(id));
    const enElBanco = recibos.filter(x => situacionRecibo(x) === 'EN_CURSO').reduce((t, x) => t + x.importe, 0);
    const mes = tramoVisible('MES', datos.hoy, datos.hoy)!;
    const anterior = mismoTramoAnterior('MES', mes);
    const cobrado = cobradoEnTramo(recibos, mes).neto;
    return {
      deben: grupos.reduce((t, g) => t + g.total, 0),
      clientas: grupos.length,
      enElBanco,
      cobrado,
      diferencia: anterior ? Math.round((cobrado - cobradoEnTramo(recibos, anterior).neto) * 100) / 100 : null,
      comparacion: textoDeLaComparacion('MES', mes, datos.hoy),
      nombreMes: new Date(`${datos.hoy}T12:00:00Z`).toLocaleDateString('es-ES', { month: 'long', timeZone: 'UTC' }),
    };
  }, [recibos, datos]);

  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px] text-foreground" data-testid="linea-resumen-cobros">
      <span>Te deben <b className="font-semibold tabular-nums"><CifraPrivada inline>{formatEuro(r.deben)}</CifraPrivada></b></span>
      {r.clientas > 0 && <span className="text-muted-foreground">· {r.clientas} {r.clientas === 1 ? 'clienta' : 'clientas'}</span>}
      {r.enElBanco > 0 && <span className="text-muted-foreground">· <CifraPrivada inline>{formatEuro(r.enElBanco)}</CifraPrivada> en el banco</span>}
      <span className="mx-1 hidden text-border sm:inline" aria-hidden>|</span>
      <span className="basis-full sm:basis-auto">Cobrado en {r.nombreMes} <b className="font-semibold tabular-nums"><CifraPrivada inline>{formatEuro(r.cobrado)}</CifraPrivada></b></span>
      {r.diferencia != null && r.comparacion && (
        <span className="text-muted-foreground">
          · <CifraPrivada inline>{`${r.diferencia >= 0 ? '+' : '−'}${formatEuro(Math.abs(r.diferencia))}`}</CifraPrivada> que {r.comparacion}
        </span>
      )}
    </span>
  );
}
