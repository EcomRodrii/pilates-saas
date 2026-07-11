'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/entitlements';

// Redirect condicional (DECISION-OS-ARQUITECTURA.md §9, cambio de ~5 líneas,
// reversible): PROPIETARIO con el plan/feature `decisiones` → Centro de
// Control; el resto sigue exactamente igual que antes, a /dashboard.
export default function Home() {
  const router = useRouter();
  const { studio } = useStudio();
  const rol = useRol();

  useEffect(() => {
    if (!studio) return; // espera a que cargue el estudio antes de decidir
    const tieneDecisionOS = rol === 'PROPIETARIO' && tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscriptionStatus }, 'decisiones');
    router.replace(tieneDecisionOS ? '/centro-de-control' : '/dashboard');
  }, [studio, rol, router]);

  return null;
}
