'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cardCls } from '@/components/configuracion/estilos';
import { Interruptor } from '@/components/ui/interruptor';
import { tarjetaPorId, type TarjetaId } from '@/lib/configuracion/secciones';
import type { ResumenFila } from '@/lib/configuracion/resumenes';
import { FILA, IconoFila } from './fila-herramienta';
import { EstadoAjuste } from './estado-ajuste';

// Una sección de Configuración como grupos de filas, no como formularios
// apilados (§4.2). Cada fila dice qué es y cómo está HOY —«L-V 8:00–22:00 · D
// cerrado»— y su FORMA dice cómo se guarda:
//   · FilaAjuste: abre su cajón (cajon-ajuste.tsx), que se guarda con «Guardar»;
//   · FilaInterruptor: se guarda al tocarlo, y vuelve atrás si el servidor dice
//     que no. Solo para un sí/no sin dinero ni consecuencias en cadena;
//   · FilaExterna: lleva a otra pantalla del panel (icono de salida).
// El título y la descripción salen de lib/configuracion/secciones.ts por el
// `id`, que es también el ancla de sus enlaces (`#horario`).

/** Un grupo con su título, en frase normal. */
export function GrupoFilas({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="max-w-2xl space-y-2">
      <h3 id={id} className="px-1 text-sm font-semibold text-foreground">{titulo}</h3>
      <ul data-tarjeta-ajuste="" className={cn(cardCls, 'divide-y divide-border overflow-hidden')}>
        {children}
      </ul>
    </section>
  );
}

/** El título de una fila y, si lo lleva, su ÚNICO estado. */
export function TituloFila({ titulo, estado }: { titulo: string; estado?: ResumenFila['estado'] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-[15px] font-semibold text-foreground">{titulo}</span>
      {estado && <EstadoAjuste tono={estado.tono}>{estado.etiqueta}</EstadoAjuste>}
    </span>
  );
}

/**
 * El valor, en UNA línea (§4.2): lo que no cabe a 375 px se corta con «…» y está
 * entero en el cajón. La descripción —si no se sabe el valor— y lo que acompaña
 * a un estado («Revisa el NIF: tus facturas salen con uno que Hacienda no reconoce») pueden ocupar dos:
 * cortado, un aviso deja de decir qué pasa.
 */
export function ValorFila({ valor, descripcion, entero, title }: {
  valor: string | null;
  descripcion: string;
  entero?: boolean;
  title?: string;
}) {
  return (
    <span
      data-resumen={valor ? 'valor' : 'descripcion'}
      title={title}
      className={cn('block text-sm text-muted-foreground', valor && !entero ? 'truncate' : 'line-clamp-2 text-pretty')}
    >
      {valor ?? descripcion}
    </span>
  );
}

/**
 * `valor`: cómo está (lib/configuracion/resumenes.ts); `null` = no se sabe, y va su descripción.
 * `entero`: el valor puede ocupar dos líneas (con estado, o si lleva «2 tipos lo cambian», que cortado no se ve).
 */
export function FilaAjuste({
  id,
  icono,
  valor,
  estado,
  entero,
  onAbrir,
}: {
  id: TarjetaId;
  icono: LucideIcon;
  valor: string | null;
  estado?: ResumenFila['estado'];
  entero?: boolean;
  onAbrir: (id: TarjetaId) => void;
}) {
  const tarjeta = tarjetaPorId(id);
  return (
    <li>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        onClick={() => onAbrir(id)}
        className={cn(FILA, 'w-full scroll-mt-32 scroll-mb-32 text-left')}
      >
        <IconoFila icono={icono} />
        <span className="min-w-0 flex-1">
          <TituloFila titulo={tarjeta.titulo} estado={estado} />
          <ValorFila valor={valor} descripcion={tarjeta.frase} entero={entero || !!estado} />
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

// Algunos errores ya empiezan por «No se ha guardado:» (lib/db/actualizar-studio.ts).
function textoDeError(error: string): string {
  const limpio = error.trim().replace(/[.\s]+$/, '');
  return `${/^no se ha guardado/i.test(limpio) ? limpio : `No se ha guardado: ${limpio}`}.`;
}

/**
 * Un sí/no que se guarda al tocarlo. Mientras se guarda, el interruptor enseña
 * lo pedido y no se deja tocar; solo se da por bueno cuando `onCambiar` confirma,
 * y si no, vuelve a lo guardado y la fila dice por qué (el bug más repetido del
 * repo: un interruptor encendido con el servidor diciendo que no).
 *
 * ⚠️ El título NO lleva `${id}-titulo`: con él, el shell creería que el ancla
 * (`#valoracion-inicial`) es una tarjeta y le daría el foco al título; sin él, se
 * lo da al interruptor, que es lo que se viene a tocar.
 */
export function FilaInterruptor({
  id,
  icono,
  on,
  onCambiar,
}: {
  id: TarjetaId;
  icono: LucideIcon;
  /** Lo guardado; `null` = sin cargar, y el interruptor espera. */
  on: boolean | null;
  /** `null` = guardado de verdad; un texto = no se ha guardado, y por qué. */
  onCambiar: (valor: boolean) => Promise<string | null>;
}) {
  const tarjeta = tarjetaPorId(id);
  const enVuelo = useRef(false);
  const [pedido, setPedido] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(valor: boolean) {
    if (enVuelo.current || on === null) return;
    enVuelo.current = true;
    setPedido(valor);
    setError(null);
    try {
      const fallo = await onCambiar(valor);
      if (fallo) setError(fallo);
    } catch {
      setError('No hemos podido hablar con el servidor');
    } finally {
      enVuelo.current = false;
      setPedido(null);
    }
  }

  return (
    <li id={id} className="flex min-h-16 scroll-mt-32 scroll-mb-32 items-center gap-3 px-4 py-3">
      <IconoFila icono={icono} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-foreground">{tarjeta.titulo}</span>
        {error
          ? <span role="alert" className="block text-sm font-medium text-destructive text-pretty">{textoDeError(error)}</span>
          : <span className="block text-sm text-muted-foreground text-pretty">{tarjeta.frase}</span>}
      </span>
      <Interruptor
        on={pedido ?? on ?? false}
        onChange={v => { void cambiar(v); }}
        ariaLabel={tarjeta.titulo}
        disabled={on === null}
        ocupado={pedido !== null}
      />
    </li>
  );
}

/**
 * Lo que Tentare hace de serie y no se configura («Tentare lo hace así»): se
 * cuenta en una fila, sin chevron ni interruptor, para que no parezca un ajuste
 * que no lleva a ningún sitio. Cada frase, comprobada contra el código que lo hace.
 */
export function FilaInformativa({ icono, titulo, detalle }: { icono: LucideIcon; titulo: string; detalle?: string }) {
  return (
    <li data-fila-informativa="" className="flex min-h-16 items-center gap-3 px-4 py-3">
      <IconoFila icono={icono} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-foreground text-pretty">{titulo}</span>
        {detalle && <span className="block text-sm text-muted-foreground text-pretty">{detalle}</span>}
      </span>
    </li>
  );
}

/** Una fila que lleva a OTRA pantalla del panel: el icono de salida lo dice antes de tocarla. */
export function FilaExterna({ id, icono, titulo, valor, descripcion, href }: {
  id: string;
  icono: LucideIcon;
  titulo: string;
  valor: string | null;
  descripcion: string;
  href: string;
}) {
  return (
    <li>
      <Link id={id} href={href} className={cn(FILA, 'scroll-mt-32 scroll-mb-32')}>
        <IconoFila icono={icono} />
        <span className="min-w-0 flex-1">
          <TituloFila titulo={titulo} />
          <ValorFila valor={valor} descripcion={descripcion} />
        </span>
        <ArrowUpRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
