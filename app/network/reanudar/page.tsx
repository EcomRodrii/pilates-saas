'use client';

// "Hola de nuevo" (2f del rediseño) — destino de app/api/auth/destino-post-
// login para una cuenta de Network con el onboarding a medias. NUNCA
// aterriza en el dashboard de propietaria (esa cuenta no tiene una, es
// justo por lo que está aquí). El paso exacto sale de la MISMA función que
// usa el propio wizard al abrirse solo (lib/network/pasos-onboarding.ts) —
// nunca dos heurísticos que puedan decir un paso distinto.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useAuth } from '@/lib/auth-context';
import { fetchMiPerfilNetwork } from '@/lib/api-client';
import { PASOS_ONBOARDING, pasoIncompletoDe } from '@/lib/network/pasos-onboarding';
import type { PerfilNetwork } from '@/lib/network/tipos';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_BORDE, NW_SAGE, NW_PRODUCTO } from '@/components/network-v2/tokens';

export default function ReanudarNetworkPage() {
  const router = useRouter();
  const { user, loading: cargandoSesion } = useAuth();
  const [perfil, setPerfil] = useState<PerfilNetwork | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!cargandoSesion && !user) router.replace('/network/acceso');
  }, [cargandoSesion, user, router]);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchMiPerfilNetwork().then(p => {
      if (!vivo) return;
      // Sin perfil todavía, o ya completo (publicado o en revisión): esta
      // pantalla no le pertenece — el propio destino-post-login no debería
      // haber mandado aquí a ninguna de las dos, pero por si acaso (carrera,
      // enlace guardado viejo) se manda a donde sí toca en vez de enseñar
      // una pantalla que no aplica.
      if (!p) { router.replace('/network/crear-perfil'); return; }
      if (p.estado === 'published' || p.estado === 'en_revision') { router.replace('/network/mi-perfil'); return; }
      setPerfil(p);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [user, router]);

  if (cargandoSesion || cargando || !perfil) return null;

  const idx = pasoIncompletoDe(perfil);
  const paso = PASOS_ONBOARDING[idx];
  const porcentaje = Math.round((idx / (PASOS_ONBOARDING.length - 1)) * 100);
  const nombrePila = (user?.user_metadata?.nombre as string | undefined)?.split(' ')[0] ?? perfil.nombre.split(' ')[0];

  return (
    <div className="min-h-dvh flex items-center justify-center px-6 py-16" style={{ background: NW_FONDO }}>
      <div className="max-w-[560px] w-full text-center">
        <Link href="/network" className="inline-flex mb-8"><LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={24} decorativo /></Link>

        <p className="text-[28px] sm:text-[32px]" style={{ fontFamily: 'var(--font-display)', color: NW_TINTA }}>
          Hola de nuevo, <em style={{ color: NW_PRODUCTO }}>{nombrePila}</em>
        </p>
        <p className="mt-3 text-[14px]" style={{ color: NW_MUTED }}>
          Al entrar te llevamos a tu sitio: como todavía no has publicado tu perfil de Network, seguimos justo donde lo dejaste.
        </p>

        <div className="mt-8 text-left rounded-2xl p-6 bg-white" style={{ border: `1px solid ${NW_BORDE}` }}>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: NW_SAGE }}>
            <div className="h-full rounded-full" style={{ width: `${porcentaje}%`, background: NW_PRODUCTO }} />
          </div>
          <p className="mt-4 text-[13px] font-semibold" style={{ color: NW_MUTED }}>
            Sigue donde lo dejaste · Paso {String(paso.n).padStart(2, '0')} · {paso.titulo}
          </p>
          <Link
            href="/network/crear-perfil"
            className="inline-block mt-4 px-6 py-3 rounded-full text-[14px] font-bold text-white"
            style={{ background: NW_PRODUCTO }}
          >
            Continuar
          </Link>
        </div>

        <Link href="/network/instructoras" className="inline-block mt-6 text-[13px] font-semibold underline" style={{ color: NW_MUTED }}>
          Explora la network — tu borrador no se pierde
        </Link>
      </div>
    </div>
  );
}
