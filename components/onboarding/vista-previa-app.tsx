'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La marca de SU estudio (nombre, logo y color) y el color del tema publicado.
//
// La maqueta dibujada a mano de «tu app» se retiró (7-oct-2026): fingía ser la
// app. La app de las alumnas se enseña de verdad, en
// components/onboarding/app-alumna-real.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { fetchThemePublicado } from '@/lib/api-client';
import { normalizarHex } from '@/lib/qr/escaparate';
import { foregroundParaFondo, hexARgb } from '@/lib/wcag-contrast';

/**
 * El color de SU marca, el que de verdad verán sus alumnas: el del tema
 * publicado (el mismo que lee el panel y el portal).
 *
 * ⚠️ NO `studios.color_primario`: el alta escribe ahí un índigo que no ha
 * elegido nadie (10 de 11 estudios, medido el 16-sep-2026; ver
 * lib/emails/color-marca.ts). Enseñar ese índigo como «tu color» sería mentir.
 * Mientras llega el tema, o si falla, el oliva del producto.
 */
export function useColorMarca(): string | null {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    fetchThemePublicado()
      .then((t) => { if (vivo) setColor(normalizarHex(t.primary) ?? null); })
      .catch(() => { /* sin tema: se queda el oliva */ });
    return () => { vivo = false; };
  }, []);
  return color;
}

export interface PropsVistaPrevia {
  nombre: string;
  logoUrl: string | null;
  /** Hex del color de marca. Un valor no válido cae al oliva del producto. */
  color: string | null;
}

const OLIVA = '#343825';

function marca(color: string | null) {
  const fondo = color && hexARgb(color) ? color : OLIVA;
  return { fondo, texto: foregroundParaFondo(fondo) };
}

function inicial(nombre: string): string {
  return (nombre.trim().charAt(0) || 'T').toUpperCase();
}

/** La fila compacta del móvil: lo justo para saber que es SU estudio. */
export function MarcaCompacta({ nombre, logoUrl, color }: PropsVistaPrevia) {
  const m = marca(color);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-2.5" data-testid="marca-compacta">
      <span
        className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-[15px] font-bold"
        style={{ background: m.fondo, color: m.texto }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl ? <img src={logoUrl} alt="" className="size-full object-contain bg-white" /> : inicial(nombre)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold text-foreground">{nombre}</span>
        <span className="block text-[12px] text-muted-foreground">Tu app y tu página de reservas llevan tu nombre, tu logo y tu color</span>
      </span>
    </div>
  );
}
