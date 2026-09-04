import Link from 'next/link';
import { NavPublico } from '@/components/network-v2/NavPublico';
import { PieNetwork } from '@/components/network-v2/PieNetwork';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_PRODUCTO } from '@/components/network-v2/tokens';

// 404 propio de /network/** (cohesión de navegación, pedido del fundador):
// sin este fichero, un enlace roto a un perfil (`notFound()` en
// [slug]/page.tsx) caía en app/not-found.tsx — el 404 genérico del sitio,
// que solo enlaza a "/" (la home de marca general). Alguien siguiendo un
// enlace roto a una instructora salía COMPLETAMENTE de Network sin ruta de
// vuelta al marketplace ni al CTA de publicar perfil — callejón sin salida
// real. Next.js resuelve el `not-found.tsx` más cercano al segmento donde
// se lanzó `notFound()`, así que uno solo aquí cubre toda la rama
// (landing, listado, perfil individual).
export default function NetworkNotFound() {
  return (
    <div style={{ background: NW_FONDO, color: NW_TINTA }} className="min-h-dvh flex flex-col">
      <NavPublico />
      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-sm text-center">
          <p className="text-sm font-bold uppercase tracking-wider" style={{ color: NW_MUTED }}>404</p>
          <h1 className="mt-2 text-2xl font-bold">Esta página no existe.</h1>
          <p className="mt-2 text-sm" style={{ color: NW_MUTED }}>
            Puede que el enlace esté mal escrito, o que el perfil se haya movido o dejado de estar disponible.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/network/instructoras"
              className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold text-white"
              style={{ background: NW_PRODUCTO }}
            >
              Buscar instructoras
            </Link>
            <Link
              href="/network/crear-perfil"
              className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold"
              style={{ border: `1px solid ${NW_MUTED}`, color: NW_TINTA }}
            >
              Publicar mi perfil
            </Link>
          </div>
        </div>
      </main>
      <PieNetwork />
    </div>
  );
}
