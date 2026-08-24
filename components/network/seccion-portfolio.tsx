'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { fetchMiPortfolioNetwork, crearFotoPortfolioNetwork, eliminarFotoPortfolioNetwork } from '@/lib/api-client';
import { subirFotoPortfolioNetwork } from '@/lib/network/portfolio-storage';
import { PORTFOLIO_MAX_FOTOS, type MediaNetwork } from '@/lib/network/tipos';
import { cardCls } from '@/app/(dashboard)/configuracion/page';

// Portfolio de fotos (F1, red_perfil_media) — mismo patrón autocontenido que
// SeccionExperienciaNetwork/SeccionReferenciasNetwork: carga su propia lista
// al montar, sin avisar a la página padre (a diferencia de esas dos, nada
// del portfolio alimenta ningún badge de confianza). Sin reordenar en esta
// fase: el orden es el de subida (ver `orden` en
// app/api/network/portfolio/route.ts) — arrastrar y soltar queda para más
// adelante si hace falta.
export function SeccionPortfolioNetwork({ authUserId }: { authUserId: string }) {
  const [fotos, setFotos] = useState<MediaNetwork[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    fetchMiPortfolioNetwork().then(lista => {
      if (!vivo) return;
      setFotos(lista);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || fotos.length >= PORTFOLIO_MAX_FOTOS) return;
    setError('');
    setSubiendo(true);
    const subida = await subirFotoPortfolioNetwork(authUserId, file);
    if ('error' in subida) { setSubiendo(false); setError(subida.error); return; }
    const res = await crearFotoPortfolioNetwork(subida.path);
    setSubiendo(false);
    if (!res.ok) { setError(res.error); return; }
    setFotos(f => [...f, res.foto]);
  }

  async function borrar(id: string) {
    setError('');
    setBorrandoId(id);
    const res = await eliminarFotoPortfolioNetwork(id);
    setBorrandoId(null);
    if (!res.ok) { setError(res.error ?? 'No se ha podido eliminar la foto.'); return; }
    setFotos(f => f.filter(foto => foto.id !== id));
  }

  const completo = fotos.length >= PORTFOLIO_MAX_FOTOS;

  if (cargando) {
    return (
      <div className={`${cardCls} p-6 flex items-center justify-center`}>
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`${cardCls} p-6 space-y-4`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">Portfolio de fotos</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Fotos tuyas dando clase o de tu trabajo — hasta {PORTFOLIO_MAX_FOTOS}.
          </p>
        </div>
        {!completo && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={subiendo}
            className="text-[12px] font-medium text-brand flex items-center gap-1 shrink-0 disabled:opacity-60"
          >
            {subiendo ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            Añadir
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      </div>

      {fotos.length === 0 && (
        <p className="text-[12px] text-muted-foreground">Todavía no has subido ninguna foto.</p>
      )}

      {fotos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {fotos.map(foto => (
            <div key={foto.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de vida corta, no vale la pena que next/image la cachee */}
              <img src={foto.url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              <button
                type="button"
                onClick={() => borrar(foto.id)}
                disabled={borrandoId === foto.id}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white disabled:opacity-60"
                aria-label="Eliminar foto"
              >
                {borrandoId === foto.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
