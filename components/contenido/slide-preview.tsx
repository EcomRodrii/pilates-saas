'use client';

import { ESTILO_CARRUSEL, type EstiloCarrusel, type SlideCarrusel } from '@/lib/contenido/types';
import { cn } from '@/lib/utils';

// Diapositiva renderizada con el estilo elegido. `compact` para miniaturas.
export function SlidePreview({
  slide, estilo, index, total, compact, className,
}: {
  slide: SlideCarrusel;
  estilo: EstiloCarrusel;
  index?: number;
  total?: number;
  compact?: boolean;
  className?: string;
}) {
  const e = ESTILO_CARRUSEL[estilo];
  return (
    <div
      className={cn('relative aspect-square w-full overflow-hidden flex flex-col', className)}
      style={{ background: e.bg, color: e.fg, fontFamily: e.font }}
    >
      <div className={cn('flex-1 flex flex-col', compact ? 'p-2.5' : 'p-7 sm:p-9')}>
        {slide.tipo === 'portada' ? (
          <div className="flex-1 flex flex-col justify-center">
            <span className="rounded-full self-start mb-3 font-bold uppercase tracking-wide" style={{ background: e.accent, color: e.bg.startsWith('#') ? e.bg : '#111', fontSize: compact ? 6 : 11, padding: compact ? '1px 5px' : '3px 10px' }}>
              Carrusel
            </span>
            <h3 className={cn('font-extrabold leading-tight whitespace-pre-line', compact ? 'text-[11px]' : 'text-3xl sm:text-4xl')}>{slide.titulo}</h3>
            {slide.cuerpo && <p className={cn('mt-2 opacity-80 leading-snug', compact ? 'text-[7px]' : 'text-base')}>{slide.cuerpo}</p>}
          </div>
        ) : slide.tipo === 'cta' ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center">
            <h3 className={cn('font-extrabold leading-tight', compact ? 'text-[11px]' : 'text-2xl sm:text-3xl')} style={{ color: e.accent }}>{slide.titulo}</h3>
            {slide.cuerpo && <p className={cn('mt-2 opacity-90 leading-snug', compact ? 'text-[7px]' : 'text-lg')}>{slide.cuerpo}</p>}
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-center">
            <div className={cn('rounded-full flex items-center justify-center font-extrabold mb-3', compact ? 'w-4 h-4 text-[8px]' : 'w-11 h-11 text-lg')} style={{ background: e.accent, color: e.bg.startsWith('#') ? e.bg : '#111' }}>
              {typeof index === 'number' ? index : ''}
            </div>
            <h3 className={cn('font-bold leading-tight', compact ? 'text-[10px]' : 'text-2xl')}>{slide.titulo}</h3>
            {slide.cuerpo && <p className={cn('mt-2 opacity-85 leading-snug', compact ? 'text-[7px]' : 'text-base')}>{slide.cuerpo}</p>}
          </div>
        )}
        {typeof index === 'number' && typeof total === 'number' && (
          <div className={cn('flex items-center justify-between opacity-60 font-semibold', compact ? 'text-[6px]' : 'text-xs')}>
            <span>@tuestudio</span>
            <span>{index} / {total}</span>
          </div>
        )}
      </div>
    </div>
  );
}
