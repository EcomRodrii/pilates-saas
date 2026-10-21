import type { Metadata } from 'next';
import { AltaEstudio } from './alta-estudio';
import { AltaNueva } from './alta-nueva';
import { variablesTipografiaAltaNueva } from './fuentes-alta-nueva';
import { foundingGratisEnAltas } from '@/lib/alta/founding-gratis-alta';
import { versionDelAlta } from '@/lib/alta/registro';

// La pantalla del alta es de cliente. Esta página solo decide en el SERVIDOR lo
// que el navegador no puede saber, porque las variables no le llegan:
//
//   · si un estudio nuevo empieza gratis (FOUNDING_GRATIS encendido para todos,
//     lib/alta/founding-gratis-alta.ts);
//   · qué alta ve esta visita (ALTA_NUEVA_REGISTRO, lib/alta/registro.ts): con
//     `on`, la nueva («registro en una pantalla», alta-nueva.tsx) para todos;
//     con `prueba`, solo con `?alta=nueva`; si no, la de siempre
//     (alta-estudio.tsx), idéntica, también con `?alta=nueva`.
//
// `searchParams` es una promesa (Next 16) y la hace dinámica: el interruptor se
// lee en cada petición, no al compilar.
//
// Sin indexar (NOINDEX_PROPIO, lib/seo/no-indexables.ts): es el alta, no
// contenido. Antes heredaba el título y la descripción comerciales del layout
// raíz y robots.txt la bloqueaba, así que Google no podía leer ningún `noindex`.
export const metadata: Metadata = {
  title: 'Crea tu estudio | Tentare',
  robots: { index: false, follow: true },
};

export default async function CrearEstudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { alta } = await searchParams;
  const version = versionDelAlta(process.env.ALTA_NUEVA_REGISTRO, alta);
  const foundingGratis = foundingGratisEnAltas();
  if (!version) return <AltaEstudio foundingGratis={foundingGratis} />;
  // El alta nueva va con la marca (la maqueta aprobada): las letras y el
  // ámbito `.marca-panel`, como el panel al que lleva. `contents` para que el
  // envoltorio no cree caja.
  return (
    <div className={`${variablesTipografiaAltaNueva} marca-panel contents`}>
      <AltaNueva version={version} foundingGratis={foundingGratis} />
    </div>
  );
}
