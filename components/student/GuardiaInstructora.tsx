'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { comprobarFaltaDisponibilidad, faltaDisponibilidadSabida } from '@/lib/student/disponibilidad-obligatoria';

/**
 * La guardia de las pantallas de la instructora (`/portal/<slug>/equipo/**`).
 *
 * Sin sesión → a acceso, como `GuardiaSesion`. Con sesión pero sin ser
 * instructora de este estudio → al inicio de la app, sin explicar nada: una
 * alumna que llegue aquí por un enlace no tiene por qué saber que existe.
 *
 * Y sin ninguna franja de disponibilidad → a «Tus horarios», desde cualquier
 * pantalla de su parte y hasta que la marque (sí o sí, 15-sep-2026; ver
 * `lib/student/disponibilidad-obligatoria.ts`).
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

  const instructorId = instructora?.instructorId ?? null;
  const enHorarios = path.endsWith('/equipo/disponibilidad');
  const [horarios, setHorarios] = useState<{ clave: string; falta: boolean } | null>(null);
  const claveHorarios = instructorId ? `${slug}:${instructorId}` : null;
  // Lo ya sabido pinta sin esperar: la guardia monta en cada pantalla.
  const faltaHorarios = !instructorId ? null
    : horarios?.clave === claveHorarios ? horarios.falta
      : faltaDisponibilidadSabida(slug, instructorId);

  useEffect(() => {
    if (!instructorId) return;
    let vivo = true;
    void comprobarFaltaDisponibilidad(slug, instructorId)
      .then((falta) => { if (vivo) setHorarios({ clave: `${slug}:${instructorId}`, falta }); });
    return () => { vivo = false; };
  }, [slug, instructorId]);

  useEffect(() => {
    // Al login solo cuando ya se sabe que NO hay sesión.
    if (!autenticado) {
      if (!isLoading) r.replace(`${href('/acceso/login')}?next=${encodeURIComponent(path)}`);
      return;
    }
    if (cargandoInstructora) return;
    if (!instructora) { r.replace(href()); return; }
    if (faltaHorarios && !enHorarios) r.replace(href('/equipo/disponibilidad'));
  }, [isLoading, autenticado, cargandoInstructora, instructora, faltaHorarios, enHorarios, href, path, r]);

  // ⚠️ Sin `isLoading` (15-sep-2026): esa bandera sigue encendida hasta que
  // responde `/api/public/session` —la ficha de ALUMNA, que aquí no se usa—,
  // aunque `autenticado` ya se sabe en local. Esperarla era una petición más en
  // serie antes de pintar cada pantalla de la instructora.
  if (!autenticado || cargandoInstructora || !instructora || faltaHorarios === null || (faltaHorarios && !enHorarios)) {
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
