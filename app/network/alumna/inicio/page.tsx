'use client';

// Home del autoservicio de ALUMNA en Tentare Network — primera pieza de
// código de F3 (docs/tentare-os.md, "F3 de Network"). F0 ya resuelve el
// destino `/network/alumna/inicio` en resolverAccesoPorProducto
// (lib/network/routing-post-login.ts) desde antes de que esta página
// existiera: hasta ahora un login con producto=network-alumna no tenía a
// dónde ir.
//
// Deliberadamente mínima, mismo criterio que app/network/inicio/page.tsx
// (instructora): solo bienvenida + el puente hacia el portal si la cuenta
// ya es socia de algún estudio, + enlaces a lo que las siguientes piezas de
// F3 añadirán (descubrir instructoras/estudios). Nada de contadores o
// métricas que no tengan una tabla real detrás todavía.
//
// Sin acceso propio de alumna todavía (app/network/acceso solo resuelve
// producto=network, el de instructora) — si no hay sesión, se manda a la
// landing general de Network en vez de a una puerta que le pediría el
// producto equivocado.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowRight, Heart, Users, Building2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { fetchPuenteAlumnaNetwork, fetchFavoritosAlumnaNetwork, type EstudioPuenteAlumna, type FavoritosAlumnaNetwork } from '@/lib/api-client';
import { FotoInstructora } from '@/components/network-v2/FotoInstructora';
import { HeaderAlumna } from '@/components/network-v2/HeaderAlumna';
import { BottomNavAlumna } from '@/components/network-v2/BottomNavAlumna';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAGE, NW_PRODUCTO, NW_RADIO } from '@/components/network-v2/tokens';

export default function InicioAlumnaNetworkPage() {
  const router = useRouter();
  const { user, loading: cargandoSesion } = useAuth();
  const [estudios, setEstudios] = useState<EstudioPuenteAlumna[]>([]);
  const [favoritos, setFavoritos] = useState<FavoritosAlumnaNetwork>({ estudios: [], perfiles: [] });
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!cargandoSesion && !user) router.replace('/network');
  }, [cargandoSesion, user, router]);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchPuenteAlumnaNetwork().then(lista => {
      if (!vivo) return;
      setEstudios(lista);
      setCargando(false);
    });
    fetchFavoritosAlumnaNetwork().then(res => {
      if (!vivo) return;
      setFavoritos(res);
    });
    return () => { vivo = false; };
  }, [user]);

  if (cargandoSesion || cargando || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: NW_FONDO }}>
        <Loader2 size={20} className="animate-spin" style={{ color: NW_MUTED }} />
      </div>
    );
  }

  const nombrePila = (user.user_metadata?.nombre as string | undefined)?.split(' ')[0];

  return (
    <div className="min-h-dvh" style={{ background: NW_FONDO }}>
      <HeaderAlumna />
      <main className="max-w-2xl mx-auto px-4 py-8 pb-24 space-y-5">
        <h1 className="text-[22px] font-extrabold" style={{ color: NW_TINTA }}>
          {nombrePila ? `Hola, ${nombrePila}` : 'Hola'}
        </h1>

        {estudios.length > 0 && (
          <div className="space-y-3">
            {estudios.map(e => (
              <div
                key={e.studioId}
                className="p-5 flex items-center justify-between gap-4 bg-white"
                style={{ borderRadius: NW_RADIO.tarjeta, border: `1px solid ${NW_BORDE}` }}
              >
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: NW_TINTA }}>
                    Ya eres socia de {e.nombre}
                  </p>
                  <p className="text-[12.5px] mt-0.5" style={{ color: NW_MUTED }}>
                    Tus reservas, bonos y datos viven en tu portal de este estudio, no aquí.
                  </p>
                </div>
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

        <div className="p-5" style={{ borderRadius: NW_RADIO.tarjeta, background: NW_SAGE }}>
          <Users size={16} style={{ color: NW_MUTED }} className="mb-2" />
          <p className="text-[13px] font-semibold" style={{ color: NW_TINTA }}>Descubre instructoras</p>
          <p className="text-[12.5px] mt-0.5 mb-3" style={{ color: NW_MUTED }}>
            Explora la network de profesionales de Pilates y Yoga.
          </p>
          <Link
            href="/network/instructoras"
            className="inline-flex items-center gap-1 text-[12.5px] font-bold"
            style={{ color: NW_PRODUCTO }}
          >
            Ver instructoras <ArrowRight size={13} />
          </Link>
        </div>

        <div className="p-5" style={{ borderRadius: NW_RADIO.tarjeta, background: NW_SAGE }}>
          <Building2 size={16} style={{ color: NW_MUTED }} className="mb-2" />
          <p className="text-[13px] font-semibold" style={{ color: NW_TINTA }}>Descubre estudios</p>
          <p className="text-[12.5px] mt-0.5 mb-3" style={{ color: NW_MUTED }}>
            Explora estudios de Pilates y Yoga en el directorio de Tentare Network.
          </p>
          <Link
            href="/network/estudios"
            className="inline-flex items-center gap-1 text-[12.5px] font-bold"
            style={{ color: NW_PRODUCTO }}
          >
            Ver estudios <ArrowRight size={13} />
          </Link>
        </div>

        {/* "Mis favoritos" — tercera pieza de F3 (el corazón de las fichas de
            /network/instructoras/[slug] y /network/estudios/[slug]). Este
            bloque reemplaza el aviso "muy pronto" que había aquí: la
            funcionalidad que prometía ya existe. Sin tocar los dos bloques
            de descubrimiento de arriba. */}
        <div id="mis-favoritos" className="p-5 scroll-mt-20" style={{ borderRadius: NW_RADIO.tarjeta, border: `1px solid ${NW_BORDE}` }}>
          <div className="flex items-center gap-2 mb-3">
            <Heart size={16} style={{ color: NW_MUTED }} />
            <p className="text-[13px] font-semibold" style={{ color: NW_TINTA }}>Mis favoritos</p>
          </div>
          {favoritos.estudios.length === 0 && favoritos.perfiles.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: NW_MUTED }}>
              Guarda estudios e instructoras que te interesen desde su ficha, con el corazón.
            </p>
          ) : (
            <div className="space-y-2">
              {favoritos.perfiles.map(p => (
                <Link
                  key={`instructora-${p.id}`}
                  href={`/network/instructoras/${p.slug}`}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-black/[0.03] transition-colors"
                >
                  <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden">
                    <FotoInstructora fotoUrl={p.fotoUrl} nombre={p.nombre} aspectRatio="1 / 1" radius={999} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: NW_TINTA }}>{p.nombre}</p>
                    <p className="text-[11.5px]" style={{ color: NW_MUTED_2 }}>Instructora{p.ciudad ? ` · ${p.ciudad}` : ''}</p>
                  </div>
                </Link>
              ))}
              {favoritos.estudios.map(e => (
                <Link
                  key={`estudio-${e.id}`}
                  href={`/network/estudios/${e.slug}`}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-black/[0.03] transition-colors"
                >
                  <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden">
                    <FotoInstructora fotoUrl={e.fotoUrl ?? e.logoUrl} nombre={e.nombre} aspectRatio="1 / 1" radius={999} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: NW_TINTA }}>{e.nombre}</p>
                    <p className="text-[11.5px]" style={{ color: NW_MUTED_2 }}>Estudio{e.ciudad ? ` · ${e.ciudad}` : ''}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <BottomNavAlumna />
    </div>
  );
}
