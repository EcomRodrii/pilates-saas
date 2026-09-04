'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { PanelPendientes } from '@/components/cobros/panel-pendientes';
import { PanelFacturas } from '@/components/cobros/panel-facturas';
import { BotonRemesaSepa } from '@/components/cobros/boton-remesa-sepa';
import { Toast, useToast } from '@/components/ui/toast';

// "Cobrar" existe ahora como un solo sitio. Antes estaba repartido entre
// Transacciones, Facturas, POS y una ruta /pagos que ni siquiera salía en el
// menú (solo se llegaba por el buscador), así que la acción más frecuente del
// negocio no tenía un lugar propio y había que saberse la estructura para
// encontrarla.
//
// La caja (TPV) se queda fuera a propósito: es otro modo de uso —pantalla
// completa, táctil, de pie en el mostrador— y meterla aquí dentro obligaría a
// entrar en una sección de escritorio para atender a alguien.

// Esta pantalla tenía TRES filas de pestañas apiladas: la de la página
// (Pendientes de cobro · Facturas · Movimientos), la del panel (Cobros ·
// Suscripciones activas · Historial) y la de estados (Todos · Pendientes ·
// Cobrado · Devuelto · En curso · Fallido). Una dueña de estudio que la probó
// un mes no sabía nunca en qué pestaña estaba, y lo resumió así: "yo necesito
// dos cosas, quién me debe y cuánto he cobrado".
//
// Eso son estas dos pestañas. Facturas se queda porque es una obligación
// fiscal, no una vista más. Movimientos e Historial contaban lo mismo —el
// dinero que ha entrado— así que se unifican en "Lo que he cobrado", y
// "Suscripciones activas" pasa a ser un enlace dentro de "Quién me debe".
const TABS = [
  { id: 'deudas', label: 'Quién me debe' },
  { id: 'cobrado', label: 'Lo que he cobrado' },
  { id: 'facturas', label: 'Facturas' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function esTab(v: string | null): v is TabId {
  return TABS.some(t => t.id === v);
}

export default function Cobros() {
  const [tab, setTab] = useState<TabId>('deudas');
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();

  // Se lee de window.location y no con useSearchParams para no suspender el
  // árbol (mismo motivo que en el resto de pantallas del panel).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (esTab(t)) setTab(t);
  }, []);

  function irA(id: TabId) {
    setTab(id);
    // La pestaña queda en la URL para poder enlazarla y para que recargar no
    // devuelva a la primera.
    window.history.replaceState({}, '', `/cobros?tab=${id}`);
  }

  return (
    <div data-tour="cobros-vista" className="space-y-5">
      <PageHeader
        title="Cobros"
        description="Lo que está pendiente, las facturas emitidas y todo el dinero que ha entrado."
      />

      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => irA(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn(
              'px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors',
              tab === t.id ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'deudas' && (
        <>
          <div className="flex justify-end"><BotonRemesaSepa /></div>
          <PanelPendientes vista="deudas" onToast={showToast} />
        </>
      )}
      {tab === 'cobrado' && <PanelPendientes vista="cobrado" onToast={showToast} />}
      {tab === 'facturas' && <PanelFacturas />}
      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}
