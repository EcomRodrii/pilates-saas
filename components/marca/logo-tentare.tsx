'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { TRAZADOS } from './trazados';

// El logotipo de Tentare, en línea y no como <img>: así el CSS alcanza cada
// pieza (modo oscuro, color por producto, y las animaciones de marca si algún
// día se importan) y desaparecen del camino crítico ~1,1 MB de PNG.
//
// Un solo componente en vez de cincuenta archivos porque el kit de marca es,
// de hecho, un solo dibujo: los cuatro trazados del isotipo son idénticos en
// los cincuenta SVG y lo único que cambia es color y encuadre.
//
// 'use client' es por useId(): cada instancia necesita su propio id de
// degradado. Con un id fijo, dos logos en la misma página (la barra móvil y la
// de escritorio conviven en el DOM, ocultas con lg:hidden, no desmontadas)
// harían que url(#…) resolviera siempre al primero — y el segundo se pintaría
// con los colores del primero.

export type FormatoMarca = 'isotipo' | 'horizontal' | 'vertical';
export type TintaMarca = 'auto' | 'color' | 'negativo' | 'tinta' | 'blanco';
/** Solo los productos con uso real hoy. Añadir uno es copiar su trazado de
 *  docs/marca/productos/<producto>/ a `trazados.ts`; el resto ya es genérico. */
export type ProductoMarca = 'core' | 'manager';
/** Las tres del kit que tienen uso real. Las otras siete siguen en
 *  docs/marca/animaciones/tentare-motion.css, sin enganchar. */
export type AnimacionMarca = 'construccion' | 'cargando' | 'barrido';

// Encuadres ceñidos al dibujo, no al lienzo del kit. El lienzo trae hasta un
// 22 % de aire abajo, que es justo lo que obligaba al hack documentado en la
// versión PNG de sidebar.tsx: `alto` acababa midiendo el aire, no el logo.
const ENCUADRE: Record<FormatoMarca, { sin: string; con: string; isotipo: string | undefined }> = {
  isotipo: { sin: '7 11 106 98', con: '7 11 106 98', isotipo: undefined },
  horizontal: { sin: '7 17 369.08 98', con: '7 17 369.08 111.22', isotipo: 'translate(0,6)' },
  vertical: { sin: '26.82 11 181.86 169.54', con: '26.82 11 181.86 197.16', isotipo: 'translate(58,0)' },
};

// Cada tinta es un juego de custom properties; los trazados solo leen las
// variables. `auto` no aparece aquí a propósito: sus valores viven en
// globals.css (.marca-auto) porque un style en línea gana siempre a una clase,
// y entonces la regla de modo oscuro no podría pisarlo.
const TINTA: Record<Exclude<TintaMarca, 'auto'>, React.CSSProperties> = {
  color: { '--marca-solido': '#222A33', '--marca-disco': '#B4537E', '--marca-a': '#4C9CB0', '--marca-b': '#B4537E', '--marca-producto': '#5C6779' } as React.CSSProperties,
  negativo: { '--marca-solido': '#FFFFFF', '--marca-disco': '#FFFFFF', '--marca-a': '#8FD0DF', '--marca-b': '#E9A7C2', '--marca-producto': '#A9B4C0' } as React.CSSProperties,
  tinta: { '--marca-solido': '#222A33', '--marca-disco': '#222A33', '--marca-a': '#222A33', '--marca-b': '#222A33', '--marca-producto': '#5C6779' } as React.CSSProperties,
  blanco: { '--marca-solido': '#FFFFFF', '--marca-disco': '#FFFFFF', '--marca-a': '#FFFFFF', '--marca-b': '#FFFFFF', '--marca-producto': '#FFFFFF' } as React.CSSProperties,
};

/** Regla 1 del kit: un producto nunca redibuja la marca, solo tiñe su disco. */
const DISCO_PRODUCTO: Record<ProductoMarca, string> = { core: '#4C9CB0', manager: '#B4537E' };

/** Regla 4: a una tinta el disco pierde su color, así que ahí el producto se
 *  distingue por el nombre y no por el disco. */
const TINE_EL_DISCO = (tinta: TintaMarca) => tinta === 'color' || tinta === 'auto';

export function LogoTentare({
  formato = 'horizontal',
  tinta = 'color',
  producto,
  animacion,
  alto,
  titulo = 'Tentare',
  decorativo = false,
  className,
}: {
  formato?: FormatoMarca;
  tinta?: TintaMarca;
  producto?: ProductoMarca;
  /** Ninguna gira: girar el isotipo rompe el degradado a 135° y la lectura de
   *  la «t». `barrido` se dispara al pasar el ratón, las otras dos al montar. */
  animacion?: AnimacionMarca;
  /** Altura en px del dibujo. El ancho sale del viewBox, así que no hay salto
   *  de maquetación. Si prefieres dimensionar por CSS, omítelo y usa className. */
  alto?: number;
  /** Se anuncia como imagen con este nombre. Varía por rol: «Tentare Core». */
  titulo?: string;
  /** Cuando el enlace que lo envuelve ya tiene nombre accesible, para no
   *  anunciar la marca dos veces. */
  decorativo?: boolean;
  className?: string;
}) {
  // useId da un id estable entre servidor y cliente, así que no hay desajuste
  // de hidratación aunque haya varios logos montados a la vez.
  const propio = useId();
  const idDegradado = `marca-tallo-${propio}`;
  const idLuz = `marca-luz-${propio}`;
  const idRecorte = `marca-recorte-${propio}`;
  const conNombre = formato !== 'isotipo' && producto !== undefined;
  const encuadre = ENCUADRE[formato];
  const tineDisco = TINE_EL_DISCO(tinta) && producto !== undefined;

  return (
    <svg
      viewBox={conNombre ? encuadre.con : encuadre.sin}
      className={cn('t-logo', tinta === 'auto' && 'marca-auto', animacion && `t-${animacion}`, className)}
      style={{
        // Los trazados leen SIEMPRE --marca-disco, nunca el color de producto
        // directamente: si lo leyeran, el style en línea ganaría a la regla de
        // modo oscuro y el disco se quedaría con el color del producto sobre
        // fondo oscuro, donde a una tinta manda el nombre (regla 4 del kit).
        ...(tinta === 'auto'
          ? tineDisco && ({ '--marca-disco-producto': DISCO_PRODUCTO[producto] } as React.CSSProperties)
          : { ...TINTA[tinta], ...(tineDisco && { '--marca-disco': DISCO_PRODUCTO[producto] }) } as React.CSSProperties),
        ...(alto === undefined ? undefined : { height: alto, width: 'auto' }),
      }}
      role={decorativo ? undefined : 'img'}
      aria-label={decorativo ? undefined : titulo}
      aria-hidden={decorativo || undefined}
    >
      <defs>
        <linearGradient id={idDegradado} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--marca-a)" />
          <stop offset="1" stopColor="var(--marca-b)" />
        </linearGradient>
        {/* El barrido de luz solo se monta si se pide: el CSS del kit lo dispara
            con .t-logo:hover, así que dejarlo siempre haría brillar también el
            logo del pie de la landing o el de las páginas legales. */}
        {animacion === 'barrido' && (
          <>
            <linearGradient id={idLuz} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
              <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.85" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <clipPath id={idRecorte}>
              <path d={TRAZADOS.tallo} transform={encuadre.isotipo} />
            </clipPath>
          </>
        )}
      </defs>

      <g className="t-marca">
        <g transform={encuadre.isotipo}>
          <path className="t-hoja-i" fill="var(--marca-solido)" d={TRAZADOS.hojaIzquierda} />
          <path className="t-hoja-d" fill="var(--marca-solido)" d={TRAZADOS.hojaDerecha} />
          <path className="t-disco" fill="var(--marca-disco)" d={TRAZADOS.disco} />
          <path className="t-tallo" fill={`url(#${idDegradado})`} d={TRAZADOS.tallo} />
        </g>
        {animacion === 'barrido' && (
          <g clipPath={`url(#${idRecorte})`}>
            <rect className="t-brillo" x="10" y="0" width="34" height="130" fill={`url(#${idLuz})`} />
          </g>
        )}
      </g>

      {/* Regla 3 del kit: en horizontal el isotipo va en línea y hace de «t»,
          así que se escribe «entare»; en vertical queda encima, y abajo va
          «tentare» entero con la inicial del color del disco. */}
      {formato === 'horizontal' && (
        <path className="t-palabra" fill="var(--marca-solido)" d={TRAZADOS.entare80} />
      )}
      {formato === 'vertical' && (
        <>
          {/* La «t» va del color del disco, no del sólido: es la inicial que el
              isotipo pone en horizontal (regla 3 del kit). */}
          <path className="t-palabra" fill={tineDisco ? 'var(--marca-disco)' : 'var(--marca-solido)'} d={TRAZADOS.t54} />
          <path className="t-palabra" fill="var(--marca-solido)" d={TRAZADOS.entare54} />
        </>
      )}

      {conNombre && (
        <path
          className="t-producto"
          fill="var(--marca-producto)"
          d={TRAZADOS.nombreProducto[`${producto}-${formato === 'vertical' ? 'v' : 'h'}`]}
        />
      )}
    </svg>
  );
}
