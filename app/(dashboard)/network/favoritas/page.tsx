'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { TarjetaResultadoNetwork } from '@/components/network/tarjeta-resultado';
import { fetchFavoritosNetwork } from '@/lib/api-client';
import type { PerfilNetworkPublico } from '@/lib/network/tipos';
import { cardCls } from '@/app/(dashboard)/configuracion/page';

// Brief §19: "Network → Buscar instructoras / Mis favoritas / Solicitudes".
// Reusa TarjetaResultadoNetwork (la card del panel privado, no la del
// marketplace público) — mismo contexto que el buscador, misma tarjeta.
export default function FavoritasNetworkPage() {
  const [perfiles, setPerfiles] = useState<PerfilNetworkPublico[] | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchFavoritosNetwork().then(p => { if (vivo) setPerfiles(p); });
    return () => { vivo = false; };
  }, []);

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader title="Mis favoritas" description="Instructoras que has guardado para volver a verlas." />

      {!perfiles ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : perfiles.length === 0 ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-[13px] text-muted-foreground">Todavía no has guardado ninguna instructora.</p>
          <Link href="/network/buscar" className="text-[12px] text-brand font-medium mt-2 inline-block">Buscar instructoras</Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {perfiles.map(perfil => <TarjetaResultadoNetwork key={perfil.id} perfil={perfil} />)}
        </div>
      )}
    </div>
  );
}
