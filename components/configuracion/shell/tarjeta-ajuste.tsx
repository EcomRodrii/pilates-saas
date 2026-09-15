'use client';

import type { ReactNode } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cardCls } from '@/components/configuracion/estilos';
import { tarjetaPorId, tarjetasDeHerramienta, type TarjetaId } from '@/lib/configuracion/secciones';
import { EstadoAjuste } from './estado-ajuste';

// Una tarjeta de Configuración: un título que dice QUÉ es, una línea que dice
// qué hace y, si se guarda sola, que lo diga antes de tocar nada.
//
// El título y la frase salen de lib/configuracion/secciones.ts por el `id`: así
// el copy vive en un sitio, el id es el ancla de los enlaces (`#datos-fiscales`)
// y un id que no existe no compila.
//
// `marco={false}` para los catálogos que ya pintan sus propias tarjetas (la
// tabla de salas, la rejilla de tipos de clase): una caja dentro de otra no
// ordena nada, solo resta ancho.
export function TarjetaAjuste({
  id,
  marco = true,
  acciones,
  className,
  children,
}: {
  id: TarjetaId;
  marco?: boolean;
  /** Botones de la cabecera («Nuevo logro»), a la derecha del título. */
  acciones?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const tarjeta = tarjetaPorId(id);
  const tituloId = `${id}-titulo`;
  // La tarjeta que ES una herramienta (el constructor de widgets, los correos):
  // su pantalla ya lleva su título y su frase arriba, no se repiten.
  if (tarjeta.herramienta && tarjetasDeHerramienta(tarjeta.herramienta).length === 1) {
    return (
      <section
        id={id}
        aria-labelledby="herramienta-titulo"
        data-tarjeta-ajuste=""
        className={cn('scroll-mt-32', marco && cn(cardCls, 'p-4 @md/config:p-6'), className)}
      >
        {acciones && <div className="mb-4 flex flex-wrap items-center justify-end gap-2">{acciones}</div>}
        {children}
      </section>
    );
  }
  return (
    // scroll-mt: al llegar por un ancla, las barras fijas del móvil taparían el título.
    <section
      id={id}
      aria-labelledby={tituloId}
      data-tarjeta-ajuste=""
      className={cn(
        'scroll-mt-32',
        tarjeta.ancho === 'amplio' ? 'max-w-5xl' : 'max-w-2xl',
        marco && cn(cardCls, 'p-4 @md/config:p-6'),
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id={tituloId} tabIndex={-1} className="text-base font-semibold text-foreground text-balance outline-none">
              {tarjeta.titulo}
            </h3>
            {tarjeta.guardado === 'al-pulsar' && <EstadoAjuste tono="neutro" icono={Zap}>Se guarda al momento</EstadoAjuste>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{tarjeta.frase}</p>
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
