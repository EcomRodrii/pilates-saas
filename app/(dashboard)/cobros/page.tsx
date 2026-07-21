'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { PanelPendientes } from '@/components/cobros/panel-pendientes';
import { PanelFacturas } from '@/components/cobros/panel-facturas';
import { PanelMovimientos } from '@/components/cobros/panel-movimientos';

// "Cobrar" existe ahora como un solo sitio. Antes estaba repartido entre
// Transacciones, Facturas, POS y una ruta /pagos que ni siquiera salía en el
// menú (solo se llegaba por el buscador), así que la acción más frecuente del
// negocio no tenía un lugar propio y había que saberse la estructura para
// encontrarla.
//
// La caja (TPV) se queda fuera a propósito: es otro modo de uso —pantalla
// completa, táctil, de pie en el mostrador— y meterla aquí dentro obligaría a
// entrar en una sección de escritorio para atender a alguien.

const TABS = [
  { id: 'pendientes', label: 'Pendientes de cobro' },
  { id: 'facturas', label: 'Facturas' },
  { id: 'movimientos', label: 'Movimientos' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function esTab(v: string | null): v is TabId {
  return TABS.some(t => t.id === v);
}

export default function Cobros() {
  const [tab, setTab] = useState<TabId>('pendientes');

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
    <div className="space-y-5">
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

      {tab === 'pendientes' && <PanelPendientes />}
      {tab === 'facturas' && <PanelFacturas />}
      {tab === 'movimientos' && <PanelMovimientos />}
    </div>
  );
}
