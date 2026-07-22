'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { tieneFeature, planMinimoPara, PLAN_INFO, type Entitlements } from '@/lib/billing/entitlements';
import { Badge } from '@/components/ui/badge';

// Bloqueo suave para una función que el plan del estudio no incluye. Construido
// para P2.3 de la auditoría de filosofía ("Amplía tu estudio"), pero NO está
// conectado a ninguna página todavía: hoy en producción ningún estudio tiene
// `plan` asignado y BILLING_ENFORCED está apagado a propósito (falla abierto,
// ver lib/billing/billing-rules.ts) — conectar esto ahora ocultaría, a estudios
// que ya usan la función libremente, algo que nunca se les prometió quitar.
// Enchufar página a página cuando el negocio defina los planes de verdad.
//
// Uso previsto:
//   <PlanGate studio={studio} feature="marketing">
//     <BotonCampana />
//   </PlanGate>
function PlanGate({
  studio,
  feature,
  children,
}: {
  studio: { plan?: string | null; subscriptionStatus?: string | null };
  feature: keyof Entitlements['features'];
  children: React.ReactNode;
}) {
  if (tieneFeature(studio, feature)) return <>{children}</>;

  const planNecesario = planMinimoPara(feature);
  const nombrePlan = planNecesario ? PLAN_INFO[planNecesario].nombre : null;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-40 grayscale-[40%]" aria-hidden="true">
        {children}
      </div>
      <Link
        href="/suscripcion"
        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-[inherit] bg-card/70 backdrop-blur-[1px] text-center px-4"
      >
        <Badge variant="secondary" className="gap-1">
          <Lock aria-hidden="true" />
          {nombrePlan ? `Disponible en el plan ${nombrePlan}` : 'No disponible en tu plan'}
        </Badge>
        <span className="text-[11px] text-muted-foreground">Ver planes y precios</span>
      </Link>
    </div>
  );
}

export { PlanGate };
