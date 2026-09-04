'use client';

import { useState } from 'react';
import { alternarFavorito } from '@/lib/student/favoritos';
import { useToast } from '@/components/student/ui/Toast';

// El corazón de la hoja de clase. Optimista —un corazón tiene que responder al
// instante— pero se REVIERTE si el servidor dice que no: pintarlo marcado sin
// fila detrás sería el control muerto que no queremos.
export function FavoritoButton({ slug, studioId, tipoClaseId, marcada, onCambio, style }: {
  slug: string; studioId: string; tipoClaseId: string; marcada: boolean;
  onCambio?: (marcada: boolean) => void; style?: React.CSSProperties;
}) {
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState(false);

  const alternar = async () => {
    if (ocupado) return;
    const siguiente = !marcada;
    setOcupado(true);
    onCambio?.(siguiente);
    const ok = await alternarFavorito(slug, studioId, tipoClaseId, siguiente);
    setOcupado(false);
    if (!ok) {
      onCambio?.(marcada);
      toast('No hemos podido guardar el favorito.');
      return;
    }
    toast(siguiente ? 'Guardada en tus favoritas' : 'Quitada de tus favoritas');
  };

  return (
    <button
      type="button" onClick={() => void alternar()} disabled={ocupado}
      aria-pressed={marcada} aria-label={marcada ? 'Quitar de favoritas' : 'Guardar como favorita'}
      data-testid="favorito"
      style={{ width: 34, height: 34, border: 'none', borderRadius: 999, background: 'rgba(250,249,245,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', ...style }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden
        fill={marcada ? 'var(--destructive, #c2410c)' : 'none'} stroke={marcada ? 'var(--destructive, #c2410c)' : 'var(--foreground)'} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"
        style={{ transition: 'transform .25s var(--ease-spring)', transform: marcada ? 'scale(1.12)' : 'none' }}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
