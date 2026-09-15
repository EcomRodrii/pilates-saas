'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { debeElegirComoEntrar, useSesionInstructora } from '@/lib/student/sesion-instructora';

/**
 * Deja pasar solo a quien tiene sesión; al resto lo manda a acceso conservando
 * a dónde iba.
 *
 * ⚠️ De CLIENTE, y no puede ser de otra forma: la sesión de la alumna vive en
 * `localStorage` bajo el storageKey 'sb-portal-auth' (lib/db/supabase-portal.ts),
 * no en cookie. No hay `middleware.ts` en este repo y un Server Component no
 * puede leer localStorage, así que no existe manera de decidir esto antes de
 * pintar. Es una guardia de USABILIDAD, no de seguridad — mismo criterio que
 * `app/interno/layout.tsx`, cuyo comentario dice exactamente eso.
 *
 * La cerradura de verdad está en el servidor: cada ruta de `/api/public/**`
 * verifica el JWT y resuelve la socia con `socioAutenticado(userId, studioId)`,
 * así que sin sesión no sale ni un dato aunque alguien fuerce la pantalla.
 *
 * Mientras resuelve NO se pinta el esqueleto de la app: enseñar la pantalla
 * llena y luego mandar a acceso es peor que esperar un instante.
 *
 * ⚠️ Con sesión pero SIN ficha de alumna puede ser una instructora del estudio
 * (la app es la misma para las dos, decisión del 14-sep-2026). Las pantallas de
 * alumna no le sirven —todo lo que piden exige ficha—, así que se la lleva a su
 * parte. Y si el estudio la tiene dada de alta como instructora pero aún no ha
 * entrado como tal, a elegir cómo entra (15-sep-2026). Solo se pregunta en esos
 * casos: una alumna con ficha no paga ninguna petición.
 */
export function GuardiaSesion({ children }: { children: ReactNode }) {
  const r = useRouter();
  const path = usePathname();
  const { slug } = useEstudio();
  const href = usePortalHref();
  const { socia, autenticado, isLoading } = useSesionStudent(slug);
  const sinFicha = !isLoading && autenticado && !socia;
  const { instructora, isLoading: cargandoInstructora } = useSesionInstructora(slug, sinFicha);

  const preguntarEleccion = sinFicha && !cargandoInstructora && !instructora;
  const [eleccion, setEleccion] = useState<{ slug: string; elegir: boolean } | null>(null);
  const elegir = preguntarEleccion && eleccion?.slug === slug ? eleccion.elegir : null;

  useEffect(() => {
    if (!preguntarEleccion) return;
    let vivo = true;
    void debeElegirComoEntrar(slug).then((valor) => { if (vivo) setEleccion({ slug, elegir: valor }); });
    return () => { vivo = false; };
  }, [preguntarEleccion, slug]);

  useEffect(() => {
    if (isLoading) return;
    if (!autenticado) {
      // `?next=` para volver justo a donde iba después de entrar. El destino se
      // valida en la pantalla de acceso: solo se acepta una ruta de ESTE estudio.
      const destino = `${href('/acceso/login')}?next=${encodeURIComponent(path)}`;
      r.replace(destino);
      return;
    }
    if (instructora) { r.replace(href('/equipo')); return; }
    if (elegir) r.replace(href('/acceso/elegir'));
  }, [isLoading, autenticado, instructora, elegir, href, path, r]);

  const esperando = isLoading || !autenticado || (sinFicha && cargandoInstructora) || instructora
    || (preguntarEleccion && elegir !== false);
  if (esperando) {
    return (
      <div className="shell" aria-busy="true">
        <div className="page px" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 'calc(72px + var(--safe-top))' }}>
          <span className="sr-only">Cargando…</span>
          {/* Esqueleto del kit: tres tarjetas, como cualquier lista del diseño. */}
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel" style={{ height: 84, borderRadius: 'var(--radius-card)' }} />
          ))}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
