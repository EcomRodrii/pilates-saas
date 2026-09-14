'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';

/**
 * La guardia de las pantallas de la instructora (`/portal/<slug>/equipo/**`).
 *
 * Sin sesión → a acceso, como `GuardiaSesion`. Con sesión pero sin ser
 * instructora de este estudio → al inicio de la app, sin explicar nada: una
 * alumna que llegue aquí por un enlace no tiene por qué saber que existe.
 *
 * ⚠️ Es de USABILIDAD, no de seguridad (mismo criterio que `GuardiaSesion`). La
 * cerradura está en cada ruta de `/api/portal/instructora/**`, que verifica el
 * token y el slug con `verificarInstructoraEnEstudio`.
 */
export function GuardiaInstructora({ children }: { children: ReactNode }) {
  const r = useRouter();
  const path = usePathname();
  const { slug } = useEstudio();
  const href = usePortalHref();
  const { autenticado, isLoading } = useSesionStudent(slug);
  // Aquí se pregunta siempre al servidor: quien está en estas pantallas ya
  // debería serlo, y un «no» recordado de hace horas no puede echarla.
  const { instructora, isLoading: cargandoInstructora } = useSesionInstructora(slug, autenticado, true);

  useEffect(() => {
    if (isLoading) return;
    if (!autenticado) {
      r.replace(`${href('/acceso/login')}?next=${encodeURIComponent(path)}`);
      return;
    }
    if (!cargandoInstructora && !instructora) r.replace(href());
  }, [isLoading, autenticado, cargandoInstructora, instructora, href, path, r]);

  if (isLoading || !autenticado || cargandoInstructora || !instructora) {
    return (
      <div className="shell" aria-busy="true">
        <div className="page px" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 'calc(72px + var(--safe-top))' }}>
          <span className="sr-only">Cargando…</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel" style={{ height: 84, borderRadius: 'var(--radius-card)' }} />
          ))}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
