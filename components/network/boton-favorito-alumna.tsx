'use client';

// Botón de favorito (corazón) para la alumna, en la ficha de instructora
// (app/network/instructoras/[slug]/page.tsx) y de estudio
// (app/network/estudios/[slug]/page.tsx) — ambas Server Components, este es
// el fragmento cliente que se monta dentro, mismo patrón de composición que
// BotonContactar/BotonReportar (components/network-publico/boton-contactar.tsx).
//
// Sin distinción de rol en el cliente (no hay forma fiable de saberlo antes
// de llamar al servidor): igual que BotonContactar, se muestra a cualquier
// sesión iniciada y es el servidor (verificarUsuarioSupabase en
// app/api/network/alumna/favoritos/route.ts) quien decide. Si quien pulsa es
// staff de un estudio en vez de una alumna, el servidor no tiene sesión de
// alumna que resolver — el toggle simplemente no encuentra fila propia y
// crea/borra bajo ESE auth_user_id, que es exactamente lo que se quiere: la
// tabla es por auth_user_id, no por rol, así que cualquier cuenta con sesión
// puede tener su propia lista. No hace falta ocultarlo por rol.
import { useEffect, useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { fetchFavoritosAlumnaNetwork, toggleFavoritoAlumnaNetwork } from '@/lib/api-client';
import { NW_BORDE, NW_MUTED } from '@/components/network-v2/tokens';

interface BotonFavoritoAlumnaProps {
  tipo: 'estudio' | 'instructora';
  id: string;
  /** Variante compacta (solo icono) para la barra sticky móvil de la ficha de instructora. */
  compacto?: boolean;
}

export function BotonFavoritoAlumna({ tipo, id, compacto = false }: BotonFavoritoAlumnaProps) {
  const { user, loading } = useAuth();
  const [favorito, setFavorito] = useState(false);
  const [cargandoEstado, setCargandoEstado] = useState(true);
  const [actualizando, setActualizando] = useState(false);

  useEffect(() => {
    // Sin sesión el componente no pinta nada (return null más abajo) — el
    // efecto no necesita ninguna rama para ese caso.
    if (!user) return;
    let vivo = true;
    fetchFavoritosAlumnaNetwork().then(({ estudios, perfiles }) => {
      if (!vivo) return;
      const ya = tipo === 'estudio' ? estudios.some(e => e.id === id) : perfiles.some(p => p.id === id);
      setFavorito(ya);
      setCargandoEstado(false);
    });
    return () => { vivo = false; };
  }, [user, tipo, id]);

  if (loading || !user) return null;

  async function alternar() {
    if (actualizando) return;
    setActualizando(true);
    const res = await toggleFavoritoAlumnaNetwork(tipo, id);
    setActualizando(false);
    if (res.ok) setFavorito(res.favorito);
  }

  const ocupado = cargandoEstado || actualizando;

  if (compacto) {
    return (
      <button
        onClick={alternar}
        disabled={ocupado}
        aria-label={favorito ? 'Quitar de favoritos' : 'Guardar en favoritos'}
        aria-pressed={favorito}
        className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-60"
        style={{ border: `1px solid ${NW_BORDE}`, background: '#fff' }}
      >
        {ocupado ? (
          <Loader2 size={16} className="animate-spin" style={{ color: NW_MUTED }} />
        ) : (
          <Heart size={16} fill={favorito ? 'currentColor' : 'none'} style={{ color: favorito ? '#C4536B' : NW_MUTED }} />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={alternar}
      disabled={ocupado}
      aria-pressed={favorito}
      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13.5px] font-semibold disabled:opacity-60 transition-colors"
      style={{ border: `1px solid ${NW_BORDE}`, background: '#fff', color: favorito ? '#C4536B' : NW_MUTED }}
    >
      {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Heart size={14} fill={favorito ? 'currentColor' : 'none'} />}
      {favorito ? 'Guardado en favoritos' : 'Guardar en favoritos'}
    </button>
  );
}
