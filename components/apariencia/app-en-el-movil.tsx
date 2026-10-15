'use client';

import { useMemo, useState } from 'react';
import { btnSecondary } from '@/components/configuracion/estilos';
import { urlIconoEstudio } from '@/lib/monograma-estudio';
import { qrSvgMarkup } from '@/lib/qr-svg';
import { copiarAlPortapapeles } from '@/lib/utils';

// «Instalar en el móvil» (Apariencia de tu app). Qué verá una alumna que instale
// la app del estudio y cómo hacérselo llegar: el enlace, su QR y los pasos.
//
// Es la web app instalable del estudio (su manifest: `app/portal/[slug]/manifest.webmanifest`),
// no una app de las tiendas, y lo dice en pantalla: el estudio no debe prometer
// «búscanos en la App Store» a sus alumnas por una frase nuestra.
//
// El enlace sale del origen desde el que se abre el panel (como la invitación de
// la alumna): en local, en preview y en producción es el de DONDE está.
export function AppEnElMovil({ nombre, slug, colorPrimario, faviconUrl, logoUrl }: {
  nombre: string;
  slug: string;
  colorPrimario: string;
  faviconUrl: string | null;
  logoUrl: string | null;
}) {
  const [copiado, setCopiado] = useState<boolean | null>(null);
  const enlace = typeof window !== 'undefined' ? `${window.location.origin}/portal/${encodeURIComponent(slug)}` : '';

  // La misma precedencia que el manifest (icono › logo › inicial): lo que se ve
  // aquí es lo que acabará en la pantalla de inicio de la alumna.
  const icono = urlIconoEstudio(nombre, colorPrimario, 192, { iconoUrl: faviconUrl, logoUrl }, process.env.NEXT_PUBLIC_SUPABASE_URL ?? null);
  const qr = useMemo(
    () => (enlace ? qrSvgMarkup(enlace, { etiqueta: `Código QR para instalar la app de ${nombre}` }) : ''),
    [enlace, nombre],
  );

  async function copiar() {
    // ⚠️ «Copiado» solo si el portapapeles lo aceptó de verdad.
    setCopiado(await copiarAlPortapapeles(enlace));
  }

  return (
    <div className="flex flex-col gap-5" data-testid="app-en-el-movil">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- la ruta pinta el PNG a medida; no pasa por el optimizador */}
        <img src={icono} alt="" width={64} height={64} className="size-16 shrink-0 rounded-2xl border border-border" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-foreground" data-testid="nombre-app">{nombre}</p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Así la verá tu alumna en su pantalla de inicio. Si el nombre es largo, el móvil lo recorta bajo el icono.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        {qr && (
          <div
            className="size-36 shrink-0 rounded-xl border border-border bg-white p-2 [&_svg]:size-full"
            dangerouslySetInnerHTML={{ __html: qr }}
            data-testid="qr-app"
          />
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <p className="break-all rounded-lg bg-muted px-3 py-2 text-[12px] text-muted-foreground" data-testid="enlace-app">{enlace}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnSecondary} onClick={() => void copiar()} data-testid="copiar-enlace-app">
              Copiar enlace
            </button>
            {copiado !== null && (
              <span role="status" className="text-[12px] text-muted-foreground" data-testid="copiado-app">
                {copiado ? 'Copiado.' : 'No hemos podido copiarlo. Selecciónalo y cópialo a mano.'}
              </span>
            )}
          </div>
        </div>
      </div>

      <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-foreground">
        <li>
          <span className="font-medium">En iPhone:</span> abre el enlace en Safari, toca Compartir y elige «Añadir a pantalla de inicio».
        </li>
        <li>
          <span className="font-medium">En Android:</span> abre el enlace en Chrome y elige «Instalar app» en su menú. Dentro de la app, en Perfil, también ven «Instala la app».
        </li>
      </ul>

      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Es la app web de tu estudio: se abre a pantalla completa, con tu nombre y tu icono. No está en la App Store ni en Google Play.
        En iPhone, los avisos de plaza libre y los recordatorios solo llegan desde la app instalada.
      </p>
    </div>
  );
}
