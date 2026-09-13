'use client';

import { useState } from 'react';
import { alternarFavorito } from '@/lib/student/favoritos';
import { useToast } from '@/components/student/ui/Toast';
import { Icono } from '@/components/student/ui/Icono';

// El corazón de la hoja de clase. Optimista —un corazón tiene que responder al
// instante— pero se REVIERTE si el servidor dice que no: pintarlo marcado sin
// fila detrás sería el control muerto que no queremos.
export function FavoritoButton({ slug, studioId, tipoClaseId, marcada, onCambio, style }: {
  slug: string; studioId: string; tipoClaseId: string; marcada: boolean;
  onCambio?: (marcada: boolean) => void; style?: React.CSSProperties;
}) {
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState(false);
  // El LATIDO. `apHeart` (escala 1 → 1,45 → 1) estaba definida en el sistema
  // desde el principio y no la usaba nadie: el corazón se limitaba a quedarse
  // un 12 % más grande, así que guardar una clase no se sentía como un gesto,
  // solo cambiaba de color.
  //
  // Se dispara desde el CLIC, no desde un efecto que mire `marcada`: si
  // dependiera de la prop, latiría también al ENTRAR en una clase que ya
  // estaba en favoritas, que es un latido que nadie ha pedido. Y se apaga en
  // `onAnimationEnd`, que es cuando de verdad ha terminado.
  const [latiendo, setLatiendo] = useState(false);

  const alternar = async () => {
    if (ocupado) return;
    const siguiente = !marcada;
    setOcupado(true);
    // Solo al GUARDAR: quitar de favoritas no se celebra.
    if (siguiente) setLatiendo(true);
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
      // Redondo y suelto sobre la foto: crece en las dos direcciones.
      className="tap tap--icono"
      type="button" onClick={() => void alternar()} disabled={ocupado}
      aria-pressed={marcada} aria-label={marcada ? 'Quitar de favoritas' : 'Guardar como favorita'}
      data-testid="favorito"
      style={{ width: 34, height: 34, border: 'none', borderRadius: 999, background: 'rgba(250,249,245,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', ...style }}
    >
      {/* El corazón de HugeIcons (Favourite), el mismo set y grosor que la
          barra y las baldosas de Inicio: esto era el de Feather, con otra
          silueta, y a un toque de distancia se veían dos corazones distintos. */}
      <Icono nombre="favorito"
        fill={marcada ? 'var(--destructive)' : 'none'} stroke={marcada ? 'var(--destructive)' : 'var(--foreground)'}
        onAnimationEnd={() => setLatiendo(false)}
        style={{
          transition: 'transform .25s var(--ease-spring)',
          transform: marcada ? 'scale(1.12)' : 'none',
          animation: latiendo ? 'apHeart .45s var(--ease-spring)' : undefined,
        }} />
    </button>
  );
}
