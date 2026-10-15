'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { TabCrecimientoWeb } from '@/components/configuracion/tab-crecimiento-web';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { PantallaVacia, Pildoras } from '@/components/dashboard/vivo';
import { Link2 } from 'lucide-react';
import { ConstructorWidgets } from '@/components/widgets/constructor-widgets';

// «Widgets para tu web» (Configuración → Mi app y mi web → `?abrir=widgets`).
//
// El constructor vive en components/widgets/ («Tentare Widgets»): un catálogo
// (lib/widgets/catalogo.ts), un generador de código probado contra el parser
// del motor (lib/widgets/integracion.ts) y una vista previa que ES el motor.
// Cada widget es una vista de la MISMA página pública de reservas de siempre
// (/reservar/[slug]?embed=1) o del bundle nativo (public/widget.js) — cero
// maquetas.
//
// «Cómo le va a tu página» (antes «Crecimiento web») vive en la misma tarjeta:
// el widget público es el canal y esto es su cuadro de mando. Un enlace viejo
// `?tab=api&sub=crecimiento` abre esta tarjeta (lib/configuracion/destino.ts).
//
// «Ver resultados» de un widget (Fase D) la abre CENTRADA en su fila de «Por
// widget» (`enfoque`, su etiqueta), no filtrada: la gráfica diaria no se puede
// partir por etiqueta, y filtrar solo los totales dejaría una gráfica de todo
// bajo un filtro. Pulsar el chip la abre sin centrar en ninguna.
type Vista = 'widgets' | 'crecimiento';

export function TabApi({ showToast }: { showToast: (m: string) => void }) {
  const { studio } = useStudio();
  const panelNuevo = usePanelNuevo();
  const [vista, setVista] = useState<Vista>('widgets');
  const [enfoque, setEnfoque] = useState<string | null>(null);

  if (!studio?.slug) {
    // Hasta ahora, en blanco. Con el panel nuevo, se dice qué falta y a dónde ir.
    return panelNuevo && studio ? (
      <PantallaVacia
        tono="azul"
        Icono={Link2}
        titulo="Primero, la dirección de tu página"
        texto="Los widgets enseñan tu horario, tus precios y la cuenta de tus alumnas dentro de tu web, y necesitan la dirección de tu página de reservas para funcionar."
        accion={{ label: 'Poner mi dirección', href: '/configuracion?tab=web#direccion-y-enlaces' }}
      />
    ) : null;
  }

  return (
    // Ancha (`ancho: 'amplio'` en secciones.ts): biblioteca + vista previa +
    // ajustes no caben en una columna estrecha.
    <TarjetaAjuste id="widgets" marco={false}>
      <div className="space-y-5">
        {panelNuevo ? (
          <Pildoras
            opciones={[{ valor: 'widgets' as Vista, label: 'Widgets' }, { valor: 'crecimiento' as Vista, label: 'Cómo le va a tu página' }]}
            etiqueta="Qué ver"
            valor={vista}
            onCambio={v => { setVista(v); setEnfoque(null); }}
          />
        ) : (
          <div role="group" aria-label="Qué ver" className="flex flex-wrap gap-1.5">
            {([['widgets', 'Widgets'], ['crecimiento', 'Cómo le va a tu página']] as const).map(([id, etiqueta]) => (
              <button
                key={id}
                type="button"
                onClick={() => { setVista(id); setEnfoque(null); }}
                aria-pressed={vista === id}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors',
                  vista === id ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        )}
        {vista === 'widgets'
          ? <ConstructorWidgets slug={studio.slug} showToast={showToast} onVerResultados={e => { setEnfoque(e); setVista('crecimiento'); }} />
          : <TabCrecimientoWeb showToast={showToast} enfoque={enfoque} />}
      </div>
    </TarjetaAjuste>
  );
}
