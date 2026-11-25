'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { subItemActivo, type SubItem } from '@/lib/nav-submenus';

// La lista de vistas que cuelga de un módulo del menú a sangre (`SHELL_NUEVO`), como el desplegable de Shopify:
// sin iconos, sangrada bajo el nombre y con la vista activa en vidrio. Se abre y se cierra animando el alto
// (`grid-template-rows` 0fr → 1fr, 400 ms, medido en Shopify) con la curva del resto del marco, y cerrada no recibe foco ni toques (`inert`).
// Va dentro de un `<Suspense>` porque lee `useSearchParams` para saber qué vista de la pantalla está abierta.

export function useVistaActiva(hijos: readonly SubItem[]): number {
  const pathname = usePathname();
  const params = useSearchParams();
  // La más específica: la que lleva parámetro y coincide gana a la de por defecto.
  const i = hijos.findIndex(f => f.href.includes('?') && subItemActivo(f, pathname, params));
  if (i >= 0) return i;
  return hijos.findIndex(f => subItemActivo(f, pathname, params));
}

export function SubListaMenu({ abierta, hijos, etiqueta, onNavegar }: {
  abierta: boolean;
  hijos: readonly SubItem[];
  etiqueta: string;
  onNavegar?: () => void;
}) {
  const activa = useVistaActiva(hijos);
  return (
    <div
      data-sublista
      data-abierta={abierta ? '' : undefined}
      inert={!abierta}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-400 ease-(--pn-ease-out-emphasized) motion-reduce:transition-none',
        abierta ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
    >
      <ul role="group" aria-label={etiqueta} className="min-h-0 space-y-0.5 overflow-hidden pb-0.5 pt-0.5">
        {hijos.map((f, i) => (
          <li key={f.href}>
            <Link
              href={f.href}
              onClick={onNavegar}
              aria-current={i === activa ? 'page' : undefined}
              className={cn(
                'zona-tactil flex h-[30px] items-center rounded-xl pl-[38px] pr-3 text-[13px] transition-colors tactil:min-h-11',
                i === activa ? 'shell-vidrio font-medium text-[#fcfcfc]' : 'font-[450] text-[#a6a6a6] hover:bg-white/[0.06] hover:text-white',
              )}
            >
              <span className="truncate">{f.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
