'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icono } from '@/components/student/ui/Icono';
import { useAppNativa } from '@/lib/nativo/use-app-nativa';
import { portalAuthHeader } from '@/lib/student/api-publica';

// «Cambiar de estudio», en el Perfil de la app del estudio, SOLO dentro de la app
// de iOS «Tentare»: ahí una misma cuenta puede estar en varios estudios y la
// entrada (`/app`) es la que los lista. En la web cada estudio tiene su propia
// app, y la fila no tendría a dónde llevar.
//
// `?elegir=1`: la entrada enseña la lista en vez de entrar directo al último
// estudio, que sería justo este. Los iconos son un adorno: si la lista no llega,
// la fila sigue ahí, solo con el texto.

type IconoEstudio = { slug: string; icono: string };

export const HREF_CAMBIAR_DE_ESTUDIO = '/app?elegir=1';

export function CambiarDeEstudio() {
  const nativa = useAppNativa();
  const [iconos, setIconos] = useState<IconoEstudio[]>([]);

  useEffect(() => {
    if (!nativa) return;
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch('/api/app/mis-estudios', { headers: await portalAuthHeader(), cache: 'no-store' });
        const d = (await res.json().catch(() => null)) as { estudios?: unknown } | null;
        if (!vivo || !res.ok || !Array.isArray(d?.estudios)) return;
        setIconos(d.estudios
          .filter((e): e is IconoEstudio => !!e && typeof (e as IconoEstudio).slug === 'string' && typeof (e as IconoEstudio).icono === 'string')
          .slice(0, 3));
      } catch { /* sin iconos: la fila sirve igual */ }
    })();
    return () => { vivo = false; };
  }, [nativa]);

  if (!nativa) return null;

  return (
    <Link
      href={HREF_CAMBIAR_DE_ESTUDIO}
      className="card card--tap row"
      data-testid="cambiar-de-estudio"
      style={{ ['--gap' as string]: '13px', padding: '13px 15px' }}
    >
      {iconos.length > 0 && (
        <span aria-hidden style={{ display: 'flex', flexShrink: 0 }}>
          {iconos.map((e, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- icono servido por nuestra propia ruta
            <img
              key={e.slug}
              src={e.icono}
              alt=""
              width={30}
              height={30}
              style={{
                borderRadius: 9, marginLeft: i === 0 ? 0 : -10,
                boxShadow: '0 0 0 2px var(--card)', position: 'relative', zIndex: iconos.length - i,
              }}
            />
          ))}
        </span>
      )}
      <div className="trunc">
        <p className="t-card-title trunc">Cambiar de estudio</p>
        <p className="t-meta" style={{ marginTop: 1 }}>Sin cerrar sesión</p>
      </div>
      <span aria-hidden className="push t-faint" style={{ display: 'flex' }}>
        <Icono nombre="chevron-derecha" tamano={18} />
      </span>
    </Link>
  );
}
