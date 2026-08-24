'use client';

// Paso 12 del wizard: enviar a revisión / estado final. Extraído tal cual
// de app/network/crear-perfil/page.tsx (paso === 11) — F0 del roadmap de
// Tentare Network 2.0, sin cambios de comportamiento.
import Link from 'next/link';
import { NW_TINTA, NW_MUTED, NW_PRODUCTO } from '@/components/network-v2/tokens';
import type { PerfilNetwork } from '@/lib/network/tipos';

export function PasoPublicar({
  perfil, publicando, onPublicar,
}: {
  perfil: PerfilNetwork; publicando: boolean; onPublicar: () => void;
}) {
  if (perfil.estado === 'en_revision' || perfil.estado === 'published') {
    return (
      <div className="text-center py-8">
        <p className="text-[20px] font-extrabold" style={{ color: NW_TINTA }}>
          {perfil.estado === 'published' ? 'Tu perfil ya está publicado.' : 'Tu perfil está en revisión.'}
        </p>
        {perfil.estado === 'en_revision' && (
          <p className="mt-2 text-[14px] max-w-sm mx-auto" style={{ color: NW_MUTED }}>
            El equipo de Tentare lo revisa antes de que aparezca en la network — normalmente en menos de 48 h.
          </p>
        )}
        <Link
          href="/network/mi-perfil"
          className="inline-block mt-6 px-8 py-3.5 rounded-full text-[15px] font-bold text-white"
          style={{ background: NW_PRODUCTO }}
        >
          Ir a mi perfil
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <p className="text-[20px] font-extrabold" style={{ color: NW_TINTA }}>Tu perfil está listo.</p>
      <p className="mt-2 text-[14px] max-w-sm mx-auto" style={{ color: NW_MUTED }}>
        Lo revisa el equipo de Tentare antes de publicarlo — así evitamos perfiles falsos o spam en la network.
      </p>
      <button
        type="button" disabled={publicando}
        onClick={onPublicar}
        className="mt-6 px-8 py-3.5 rounded-full text-[15px] font-bold text-white disabled:opacity-60"
        style={{ background: NW_PRODUCTO }}
      >
        {publicando ? 'Enviando…' : 'Enviar a revisión'}
      </button>
    </div>
  );
}
