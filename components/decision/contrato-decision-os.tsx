'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStudio } from '@/lib/studio-context';
import { Handshake } from 'lucide-react';
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { Baldosa, BotonVivo, fondoTenido } from '@/components/dashboard/vivo';

// El Contrato del Decision OS — se dice UNA sola vez (mismo patrón que
// bienvenidaVistaEn/onboardingDescartadoEn) y no se repite: se demuestra
// solo, mensaje a mensaje, o su ausencia. A diferencia de la bienvenida (que
// sustituye el layout entero), este vive dentro de Centro de Control — es una
// promesa sobre ESTA pantalla, no sobre el producto entero.
//
// `hayAnalisis`: se enseña cuando ya hay algo que la pantalla pueda cumplir.
// Antes salía el primer día, encima de «Todavía no he hecho mi primer
// análisis», y una promesa sobre una pantalla vacía no se entendía
// (evaluación del 13-sep). Como se guarda al pulsar «Entendido», esperar al
// primer análisis no hace que se pierda: sale entonces, una vez.
export function ContratoDecisionOS({ hayAnalisis }: { hayAnalisis: boolean }) {
  const { studio, updateStudio } = useStudio();
  const panelNuevo = usePanelNuevo();
  if (!studio || studio.decisionContratoVistoEn || !hayAnalisis) return null;
  const entendido = async () => { await updateStudio({ decisionContratoVistoEn: new Date().toISOString() }); };

  if (panelNuevo) {
    return (
      <section aria-labelledby="contrato-cdc" className="flex flex-col gap-4 rounded-t-card border border-border p-5 shadow-t-card sm:flex-row sm:items-start sm:p-6" style={fondoTenido('magenta', 14)}>
        <Baldosa tono="magenta" Icono={Handshake} />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-foreground/55">El contrato del Centro de Control</p>
          <h2 id="contrato-cdc" className="mt-1 text-[18px] font-bold leading-snug text-foreground">Solo te interrumpiré cuando crea que merece la pena.</h2>
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground text-pretty">
            Si te escribo, es porque creo que esa decisión puede cambiar el rumbo de tu negocio.
            El resto de los días — la mayoría — no tendrás nada mío, y eso también es una buena señal.
          </p>
          <BotonVivo label="Entendido" onClick={entendido} className="mt-4" />
        </div>
      </section>
    );
  }

  return (
    <Card style={{ borderLeft: '4px solid var(--brand-secondary)' }}>
      <CardContent className="flex flex-col gap-3">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          El contrato del Centro de Control
        </span>
        <p className="text-[16px] font-semibold leading-snug text-foreground">
          Solo te interrumpiré cuando crea que merece la pena.
        </p>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Si te escribo, es porque creo que esa decisión puede cambiar el rumbo de tu negocio.
          El resto de los días — la mayoría — no tendrás nada mío, y eso también es una buena señal.
        </p>
        <Button
          size="sm"
          className="w-fit"
          onClick={entendido}
        >
          Entendido
        </Button>
      </CardContent>
    </Card>
  );
}
