'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStudio } from '@/lib/studio-context';

// El Contrato del Decision OS — se dice UNA sola vez (mismo patrón que
// bienvenidaVistaEn/onboardingDescartadoEn) y no se repite: se demuestra
// solo, mensaje a mensaje, o su ausencia. A diferencia de la bienvenida (que
// sustituye el layout entero), este vive dentro de Centro de Control — es una
// promesa sobre ESTA pantalla, no sobre el producto entero.
export function ContratoDecisionOS() {
  const { studio, updateStudio } = useStudio();
  if (!studio || studio.decisionContratoVistoEn) return null;

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
