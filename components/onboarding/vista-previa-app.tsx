'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Así verán tus alumnas tu app»: el nombre, el logo y el color de SU estudio, y
// las clases que acaba de elegir. Es una ilustración honesta: enseña SOLO lo que
// ya es verdad (su nombre, su logo, su color, las clases que ha marcado con su
// duración y su aforo). No inventa horas, no inventa alumnas, no inventa
// reservas: donde aún no hay un horario programado, dice qué falta.
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
  clases: readonly string[];
  /** «55 minutos» → «55 min» */
  duracion?: string;
  /** «8 plazas» */
  plazas?: string;
}

const OLIVA = '#343825';

function marca(color: string | null) {
  const fondo = color && hexARgb(color) ? color : OLIVA;
  return { fondo, texto: foregroundParaFondo(fondo) };
}

function inicial(nombre: string): string {
  return (nombre.trim().charAt(0) || 'T').toUpperCase();
}

const corto = (d?: string) => d?.replace(/\s*minutos?$/i, ' min');

/** La fila compacta del móvil: lo justo para saber que es SU estudio. */
export function MarcaCompacta({ nombre, logoUrl, color }: Pick<PropsVistaPrevia, 'nombre' | 'logoUrl' | 'color'>) {
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

export function VistaPreviaApp({ nombre, logoUrl, color, clases, duracion, plazas }: PropsVistaPrevia) {
  const m = marca(color);
  const filas = clases.slice(0, 4);
  return (
    <figure className="m-0" data-testid="vista-previa-app">
      <div
        className="relative mx-auto w-[248px] overflow-hidden rounded-[34px] border-[6px] border-foreground/90 bg-background shadow-[0_18px_40px_-18px_rgba(26,26,26,0.45)]"
        aria-hidden
      >
        <div className="px-4 pb-4 pt-5" style={{ background: m.fondo, color: m.texto }}>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/90 text-[14px] font-bold text-foreground">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logoUrl ? <img src={logoUrl} alt="" className="size-full object-contain" /> : inicial(nombre)}
            </span>
            <span className="truncate text-[15px] font-bold leading-tight">{nombre}</span>
          </div>
          <p className="mt-3 text-[11.5px] opacity-80">Hola, Ana</p>
          <p className="text-[17px] font-bold leading-tight">¿Qué clase te apetece?</p>
        </div>

        <div className="flex flex-col gap-2 px-3.5 py-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Tus clases</p>
          {filas.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[12px] text-muted-foreground">
              Aquí saldrán tus clases en cuanto las elijas.
            </p>
          )}
          {filas.map((c) => (
            <div key={c} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-foreground">{c}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {[corto(duracion), plazas].filter(Boolean).join(' · ') || 'Clase de grupo'}
                </span>
              </span>
              <span className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold" style={{ background: m.fondo, color: m.texto }}>Reservar</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-around border-t border-border px-2 py-2.5 text-[10px] text-muted-foreground">
          <span className="font-semibold text-foreground">Inicio</span>
          <span>Clases</span>
          <span>Mi bono</span>
          <span>Perfil</span>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[12.5px] text-muted-foreground">
        Así verán tus alumnas tu app
      </figcaption>
    </figure>
  );
}
