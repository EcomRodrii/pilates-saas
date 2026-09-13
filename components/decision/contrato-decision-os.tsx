'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStudio } from '@/lib/studio-context';

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
  if (!studio || studio.decisionContratoVistoEn || !hayAnalisis) return null;

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
          onClick={async () => { await updateStudio({ decisionContratoVistoEn: new Date().toISOString() }); }}
        >
          Entendido
        </Button>
      </CardContent>
    </Card>
  );
}
