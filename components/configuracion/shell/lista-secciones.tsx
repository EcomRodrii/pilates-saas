'use client';

import type { MouseEvent } from 'react';
import Link from 'next/link';
import {
  Building2, Calendar, CalendarCheck, CircleUser, CreditCard, Download, Globe, Mail, Plug,
  Settings, Trophy, UserCog, UserPlus, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hrefDeSeccion } from '@/lib/configuracion/destino';
import { MI_CUENTA, type SeccionConfiguracion, type SeccionId } from '@/lib/configuracion/secciones';
import { esClicNormal } from './contexto';

// La columna de secciones, a partir de 768 px: el inicio de Configuración y
// cada sección a un clic, estés donde estés. En el móvil no se pinta: allí el
// inicio (inicio-configuracion.tsx) ya es la lista, y además dice cómo está
// cada sección.
//
// Son enlaces de verdad (se pueden abrir en otra pestaña o compartir), no
// pestañas: por eso `aria-current` y no `tablist`.

// El mismo icono que el menú lateral cuando es el mismo concepto (Clases,
// Cobros, Equipo), y sin colores de categoría: el color aquí no distingue nada.
export const ICONOS_SECCION: Record<SeccionId, LucideIcon> = {
  estudio: Building2,
  clases: Calendar,
  reservas: CalendarCheck,
  cobros: CreditCard,
  altas: UserPlus,
  comunicacion: Mail,
  equipo: UserCog,
  web: Globe,
  motivacion: Trophy,
  conexiones: Plug,
  datos: Download,
};

const foco = 'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

// La fila activa, en el mismo lenguaje que el menú principal: relleno de marca y
// texto de marca. Antes era `bg-muted` sobre el fondo —1,07:1— y solo una raya
// de 3 px decía dónde estabas.
// ⚠️ El contorno no es decoración: en oscuro `panel-theme` deja el oliva en línea
// sobre un fondo casi negro (1,5:1), y con marca blanca pastel el relleno se
// funde con el fondo claro. En los dos casos el color de TEXTO de la marca
// contrasta con el fondo, así que el borde en ese color sostiene los 3:1.
// Transparente en las demás para que activar no mueva 1 px.
const fila = (actual: boolean) => cn(
  'relative flex min-h-11 items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-sm transition-colors',
  foco,
  actual ? 'border-brand-foreground/50 bg-brand font-semibold text-brand-foreground' : 'text-foreground hover:bg-muted',
);
const icono = (actual: boolean) => cn('shrink-0', actual ? 'text-brand-foreground' : 'text-muted-foreground');

export function ListaSecciones({
  secciones,
  activa,
  onElegir,
}: {
  secciones: readonly SeccionConfiguracion[];
  /** `null` = el inicio. */
  activa: SeccionId | null;
  onElegir: (id: SeccionId | null) => void;
}) {
  const elegir = (id: SeccionId | null) => (e: MouseEvent) => {
    if (!esClicNormal(e)) return;
    e.preventDefault();
    onElegir(id);
  };
  const enInicio = activa === null;

  return (
    <nav aria-label="Secciones de Configuración" className="space-y-2">
      <ul className="space-y-0.5">
        <li>
          <Link id="rail-inicio" href="/configuracion" aria-current={enInicio ? 'page' : undefined} onClick={elegir(null)} className={fila(enInicio)}>
            <Settings size={16} className={icono(enInicio)} aria-hidden />
            <span className="min-w-0 flex-1">Configuración</span>
          </Link>
        </li>
        {secciones.map(s => {
          const Icono = ICONOS_SECCION[s.id];
          const actual = activa === s.id;
          return (
            <li key={s.id}>
              <Link
                id={`rail-seccion-${s.id}`}
                href={hrefDeSeccion(s.id)}
                aria-current={actual ? 'page' : undefined}
                onClick={elegir(s.id)}
                className={fila(actual)}
              >
                <Icono size={16} className={icono(actual)} aria-hidden />
                <span className="min-w-0 flex-1">{s.titulo}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* «Mi cuenta» no es configuración del estudio: es de quien entra, y tiene
          su propia pantalla. Va aparte para que no se lea como una sección más. */}
      <div className="border-t border-border pt-2">
        <Link
          href={MI_CUENTA.href}
          className={cn('flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted', foco)}
        >
          <CircleUser size={16} className="shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">{MI_CUENTA.titulo}</span>
        </Link>
      </div>
    </nav>
  );
}
