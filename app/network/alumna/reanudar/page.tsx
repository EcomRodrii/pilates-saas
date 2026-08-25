'use client';

// Destino de app/api/auth/destino-post-login para una cuenta de alumna cuyo
// perfil de Network (red_perfiles_alumna) está a medias o no existe
// todavía — ver resolverAccesoPorProducto en lib/network/routing-post-login.ts.
//
// A diferencia de app/network/reanudar/page.tsx (instructora), aquí NO hay
// ningún wizard al que continuar: el perfil de alumna en Network es
// opcional/ligero por diseño, no un flujo de varios pasos (fuera de alcance
// de F3 tal como está definida hoy — no construir un wizard de alta de
// alumna sin que se pida expresamente). Esta pantalla es deliberadamente
// simple: un mensaje breve y los mismos enlaces útiles que Inicio, incluido
// el puente al portal si la cuenta ya es socia de algún estudio.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { fetchPuenteAlumnaNetwork, type EstudioPuenteAlumna } from '@/lib/api-client';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_BORDE, NW_PRODUCTO, NW_RADIO } from '@/components/network-v2/tokens';

export default function ReanudarAlumnaNetworkPage() {
  const router = useRouter();
  const { user, loading: cargandoSesion } = useAuth();
  const [estudios, setEstudios] = useState<EstudioPuenteAlumna[]>([]);

  useEffect(() => {
    if (!cargandoSesion && !user) router.replace('/network');
  }, [cargandoSesion, user, router]);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchPuenteAlumnaNetwork().then(lista => { if (vivo) setEstudios(lista); });
    return () => { vivo = false; };
  }, [user]);

  if (cargandoSesion || !user) return null;

  const nombrePila = (user.user_metadata?.nombre as string | undefined)?.split(' ')[0];

  return (
    <div className="min-h-dvh flex items-center justify-center px-6 py-16" style={{ background: NW_FONDO }}>
      <div className="max-w-[560px] w-full text-center">
        <Link href="/network" className="inline-flex mb-8"><LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={24} decorativo /></Link>

        <p className="text-[26px] sm:text-[30px] font-extrabold" style={{ color: NW_TINTA }}>
          Hola{nombrePila ? `, ${nombrePila}` : ''}
        </p>
        <p className="mt-3 text-[14px]" style={{ color: NW_MUTED }}>
          Todavía no tienes un perfil de alumna completo en Tentare Network — de momento puedes explorar la network de instructoras y, si ya eres socia de algún estudio, seguir directamente a tu portal.
        </p>

        {estudios.length > 0 && (
          <div className="mt-8 text-left space-y-3">
            {estudios.map(e => (
              <div
                key={e.studioId}
                className="p-5 flex items-center justify-between gap-4 bg-white"
                style={{ borderRadius: NW_RADIO.tarjeta, border: `1px solid ${NW_BORDE}` }}
              >
                <p className="text-[13px] font-semibold" style={{ color: NW_TINTA }}>
                  Ya eres socia de {e.nombre}
                </p>
                <Link
                  href={`/portal/${e.slug}`}
                  className="inline-flex items-center gap-1 shrink-0 px-4 py-2 rounded-full text-[12.5px] font-bold text-white"
                  style={{ background: NW_PRODUCTO }}
                >
                  Ir a tu portal <ArrowRight size={13} />
                </Link>
              </div>
            ))}
          </div>
        )}

        <Link
          href="/network/instructoras"
          className="inline-block mt-6 text-[13px] font-semibold underline"
          style={{ color: NW_MUTED }}
        >
          Explora la network de instructoras
        </Link>
      </div>
    </div>
  );
}
