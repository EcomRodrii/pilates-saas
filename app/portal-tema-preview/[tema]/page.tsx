import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PortalApp } from '@/components/portal-tema/PortalApp';
import { TEMAS_PORTAL, TEMAS_PORTAL_IDS, esTemaPortal } from '@/themes/registro';
import '@/components/portal-tema/portal-tema.css';

/**
 * Previsualización del portal en React, un tema por URL.
 *
 * No es una pantalla de producto: no hay sesión, no hay estudio y los datos
 * son los de muestra que entregó diseño (`components/portal-tema/data`). Existe
 * para poder MIRAR los tres temas mientras se conecta el portal de verdad —
 * hasta ahora nadie los había visto renderizar dentro de esta app, y ni `tsc`
 * ni el lint enseñan una tipografía que no resuelve o una hoja que no carga.
 *
 * Se cae en producción a propósito. Cuando el portal nuevo esté montado detrás
 * de su flag, esta ruta sobra y se borra entera.
 */
export const dynamic = 'force-static';

export function generateStaticParams() {
  return TEMAS_PORTAL_IDS.map((tema) => ({ tema }));
}

export default async function Page({ params }: { params: Promise<{ tema: string }> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const { tema } = await params;
  if (!esTemaPortal(tema)) notFound();
  const config = TEMAS_PORTAL[tema];

  return (
    <main className="desk">
      <div className="desk__head">
        <p className="desk__eyebrow">Tentare · Previsualización del portal</p>
        <h1 className="desk__title">Tema {config.name}</h1>
        <p className="desk__text">{config.tagline}</p>
        <div className="desk__actions">
          {TEMAS_PORTAL_IDS.map((id) => (
            <Link key={id} href={`/portal-tema-preview/${id}`} className="desk__button">
              {TEMAS_PORTAL[id].name}
            </Link>
          ))}
        </div>
      </div>
      <PortalApp tema={config} />
    </main>
  );
}
