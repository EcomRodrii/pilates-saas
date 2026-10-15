'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icono } from '@/components/student/ui/Icono';
import { useAppNativa } from '@/lib/nativo/use-app-nativa';
import { portalAuthHeader } from '@/lib/student/api-publica';
import { bundleIdDeLaApp } from '@/lib/nativo/puente';
import { esAppDeEstudio, sedesDeLaApp, tipoDeApp } from '@/lib/app-nativa/app-estudio';

// «Cambiar de estudio», en el Perfil de la app del estudio, SOLO dentro de la app
// de iOS «Tentare»: ahí una misma cuenta puede estar en varios estudios y la
// entrada (`/app`) es la que los lista. En la web cada estudio tiene su propia
// app, y la fila no tendría a dónde llevar. En la app de tienda de un estudio
// suelto, tampoco: está fijada en él. En la de una CADENA es «Cambiar de sede»:
// su entrada lista solo las sedes de la cadena.
//
// `?elegir=1`: la entrada enseña la lista en vez de entrar directo al último
// estudio, que sería justo este. Los iconos son un adorno: si la lista no llega,
// la fila sigue ahí, solo con el texto.

type IconoEstudio = { slug: string; icono: string };

export const HREF_CAMBIAR_DE_ESTUDIO = '/app?elegir=1';

export function CambiarDeEstudio() {
  const nativa = useAppNativa();
  const [iconos, setIconos] = useState<IconoEstudio[]>([]);
  // Hasta saber que es la app genérica (`app.tentare`), la fila no se pinta: en la de un
  // estudio no debe ni parpadear. Un hueco de milisegundos en «Tentare», aceptado.
  const [generica, setGenerica] = useState(false);
  // App de una cadena: la fila es «Cambiar de sede», con los iconos de sus sedes.
  const [deCadena, setDeCadena] = useState(false);

  useEffect(() => {
    if (!nativa) return;
    let vivo = true;
    void bundleIdDeLaApp().then(async (b) => {
      if (!vivo) return;
      if (tipoDeApp(b) === 'general') { setGenerica(true); return; }
      try {
        const res = await fetch(`/api/public/app/app-estudio?bundle=${encodeURIComponent(b as string)}`, { cache: 'no-store' });
        const app = await res.json().catch(() => null);
        const sedes = res.ok && esAppDeEstudio(app) ? sedesDeLaApp(app) : null;
        if (vivo && sedes) { setDeCadena(true); setIconos(sedes.slice(0, 3).map((s) => ({ slug: s.slug, icono: s.icono }))); }
      } catch { /* sin saberlo, no se enseña: mejor que llevar a una lista equivocada */ }
    });
    void (async () => {
      try {
        const res = await fetch('/api/app/mis-estudios', { headers: await portalAuthHeader(), cache: 'no-store' });
        const d = (await res.json().catch(() => null)) as { estudios?: unknown } | null;
        if (!vivo || !res.ok || !Array.isArray(d?.estudios)) return;
        const suyos = d.estudios
          .filter((e): e is IconoEstudio => !!e && typeof (e as IconoEstudio).slug === 'string' && typeof (e as IconoEstudio).icono === 'string')
          .slice(0, 3);
        // En la app de una cadena mandan los iconos de sus sedes (si ya llegaron, no se pisan).
        setIconos((antes) => (antes.length > 0 ? antes : suyos));
      } catch { /* sin iconos: la fila sirve igual */ }
    })();
    return () => { vivo = false; };
  }, [nativa]);

  if (!nativa || (!generica && !deCadena)) return null;

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
        <p className="t-card-title trunc">{deCadena ? 'Cambiar de sede' : 'Cambiar de estudio'}</p>
        <p className="t-meta" style={{ marginTop: 1 }}>Sin cerrar sesión</p>
      </div>
      <span aria-hidden className="push t-faint" style={{ display: 'flex' }}>
        <Icono nombre="chevron-derecha" tamano={18} />
      </span>
    </Link>
  );
}
