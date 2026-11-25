'use client';

// El Inicio de configuración (24-nov-2026, `SHELL_NUEVO`): lo que se ve mientras el estudio no ha terminado sus primeros pasos,
// calcado de la home de Shopify antes de configurar la tienda. El saludo en dos líneas con el nombre subrayado con puntos, la caja
// «Trabaja con Tenti» y una rejilla de tarjetas (ilustración, título, frase gris y un botón pequeño), de tres en tres, con la última
// fila centrada. Las tarjetas son los pasos REALES de la guía de puesta en marcha (`lib/guia/ruta-puesta-en-marcha.ts`) con su
// estado real; las ilustraciones son propias (`components/ilustraciones/inicio-configuracion.tsx`).
// Medidas tomadas en vivo del admin de Shopify: tarjeta de 300 de ancho con 7 de relleno, imagen de 286 × 140 (radio 12, fondo
// #f5f6f7), título 15/500, texto 13 #707070, botón de 12/500 y 28 de alto, rejilla de 6 columnas con 16 de hueco.

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Check, Clock, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { avisoAlCompartir } from '@/lib/alta/estado';
import { cn } from '@/lib/utils';
import { columnaDeTarjeta, tarjetasDeConfiguracion, textoTareas, type TarjetaInicio } from '@/lib/inicio/tarjetas-configuracion';
import type { EstadoAlta } from '@/lib/alta/estado';
import type { RutaPuestaEnMarcha } from '@/lib/guia/ruta-puesta-en-marcha';
import { ESTILOS_ILUSTRACION, IlustracionInicio } from '@/components/ilustraciones/inicio-configuracion';
import { PalabrasQueEntran } from '@/components/dashboard/bienvenida-inicio';
import { CompositorTenti } from '@/components/asistente/compositor-tenti';

const CompartirEnlace = dynamic(() => import('@/components/guia/compartir-enlace').then(m => m.CompartirEnlace), { ssr: false });

const SOMBRA_TARJETA = 'shadow-[0_5px_5px_-2.5px_#00000008,0_3px_3px_-1.5px_#00000005,0_2px_2px_-1px_#00000005,0_1px_1px_-0.5px_#00000008,0_0.5px_0.5px_0_#0000000a,0_0_0_1px_#0000000f]';
const BOTON = 'zona-tactil inline-flex h-7 items-center rounded-full bg-card px-3 text-[12px] font-medium tracking-[-0.01em] text-foreground shadow-[0_0_0_1px_#00000012,0_2px_6px_#0000000a] transition-[background-color,box-shadow] duration-150 hover:bg-muted';

const ESTILOS = `${ESTILOS_ILUSTRACION}
@keyframes ic-entra { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: none; } }
.ic-tarjeta { animation: ic-entra .5s var(--pn-ease) both; animation-delay: calc(var(--i, 0) * 60ms); }
.ic-cerrar { opacity: 0; transition: opacity .2s var(--pn-ease); }
.ic-tarjeta:hover .ic-cerrar, .ic-cerrar:focus-visible { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .ic-tarjeta { animation: none; } }
`;

function Pastilla({ tarjeta }: { tarjeta: TarjetaInicio }) {
  const base = 'absolute left-2 top-2 z-10 inline-flex h-6 items-center gap-1.5 rounded-lg bg-[#303030]/85 px-2 text-[12px] font-medium leading-none text-white backdrop-blur-[6px]';
  if (tarjeta.estado === 'hecha') return <span className={base}><Check size={12} strokeWidth={3} aria-hidden="true" />Hecho</span>;
  if (tarjeta.tareas) {
    return (
      <span className={base}>
        <span aria-hidden="true" className="size-3 rounded-full border-[1.5px] border-white/70" />
        {textoTareas(tarjeta.tareas)}
      </span>
    );
  }
  if (tarjeta.minutos) return <span className={base}><Clock size={12} aria-hidden="true" />≈ {tarjeta.minutos} min</span>;
  return null;
}

function Tarjeta({ t, i, columna, onCompartir, onSaltar }: {
  t: TarjetaInicio; i: number; columna: number | null; onCompartir: () => void; onSaltar: () => void;
}) {
  const estilo = { '--i': i, ...(columna ? { '--col': columna } : {}) } as CSSProperties;
  return (
    <li
      data-tarjeta-inicio={t.id}
      data-estado={t.estado}
      style={estilo}
      className={cn('ic-tarjeta flex min-w-0 flex-col rounded-[20px] bg-card p-[7px]', columna ? 'md:[grid-column:var(--col)_/_span_2]' : 'md:col-span-2', SOMBRA_TARJETA)}
    >
      <div className="relative">
        <IlustracionInicio id={t.id} />
        <Pastilla tarjeta={t} />
        {t.saltables.length > 0 && (
          <button
            type="button"
            onClick={onSaltar}
            aria-label={`Saltar: ${t.titulo}`}
            className="ic-cerrar absolute right-2 top-2 z-10 inline-flex size-6 items-center justify-center rounded-full bg-white/80 text-[#1b1b1b]/70 shadow-[0_2px_8px_#0000001f] backdrop-blur-[8px] focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="px-1 pt-3">
        <h3 className="px-1 text-[15px] font-medium leading-[1.25] tracking-[-0.01em] text-foreground">
          {t.titulo}
          <span className="sr-only">{t.estado === 'hecha' ? ' (hecho)' : t.estado === 'saltada' ? ' (saltado)' : ''}</span>
        </h3>
        <p className="mt-1 px-1 text-[13px] leading-[1.375] text-[#707070] dark:text-muted-foreground">{t.texto}</p>
      </div>
      <div className="mt-auto px-3 pb-3 pt-4">
        {'abre' in t.boton
          ? <button type="button" onClick={onCompartir} className={BOTON}>{t.boton.label}</button>
          : <Link href={t.boton.href} className={BOTON}>{t.boton.label}</Link>}
      </div>
    </li>
  );
}

export function InicioConfiguracion({ ruta, saltar, bienvenida, estado }: {
  ruta: RutaPuestaEnMarcha;
  estado?: EstadoAlta | null;
  saltar: (id: string) => void;
  /** Con la bienvenida animada, el saludo entra palabra a palabra (`PalabrasQueEntran`). */
  bienvenida: boolean;
}) {
  const { studio } = useStudio();
  const [compartir, setCompartir] = useState(false);
  const tarjetas = tarjetasDeConfiguracion(ruta);
  const nombre = studio?.nombre?.trim() || 'tu estudio';
  const linea1 = 'Te damos la bienvenida a Tentare';
  const palabras1 = linea1.split(' ').length;
  return (
    <>
      <style>{ESTILOS}</style>
      <header className="text-center">
        <h1 className="text-balance text-[28px] font-medium leading-[1.2] tracking-[-0.025em] text-foreground">
          <span className="block">{bienvenida ? <PalabrasQueEntran texto={linea1} /> : linea1}</span>
          <span className="block">
            {bienvenida ? <PalabrasQueEntran texto="Configuremos" desde={palabras1} /> : 'Configuremos'}{' '}
            <Link
              href="/configuracion?tab=estudio"
              className={cn('underline decoration-dotted decoration-2 underline-offset-2', bienvenida && 'bv-palabra')}
              style={bienvenida ? ({ '--p': palabras1 + 1 } as CSSProperties) : undefined}
            >
              {nombre}
            </Link>
          </span>
        </h1>
      </header>
      <CompositorTenti />
      <ul data-testid="inicio-configuracion" className="mx-auto grid w-full max-w-[940px] grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-6">
        {tarjetas.map((t, i) => (
          <Tarjeta
            key={t.id}
            t={t}
            i={i}
            columna={columnaDeTarjeta(i, tarjetas.length)}
            onCompartir={() => setCompartir(true)}
            onSaltar={() => t.saltables.forEach(saltar)}
          />
        ))}
      </ul>
      {compartir && studio?.slug && (
        <CompartirEnlace
          abierto
          onCerrar={() => setCompartir(false)}
          slug={studio.slug}
          nombreEstudio={studio.nombre ?? 'tu estudio'}
          esPropietaria
          avisoSinClase={avisoAlCompartir(estado)}
        />
      )}
    </>
  );
}
