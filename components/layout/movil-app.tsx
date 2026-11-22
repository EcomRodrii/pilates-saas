'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, Menu, Search, Sparkles } from 'lucide-react';
import { estadoBilling, type EstadoBilling } from '@/lib/api-client';
import { useCore } from '@/lib/core-context';
import { useAuth } from '@/lib/auth-context';
import { usePuertaAsistente } from '@/lib/asistente-context';
import { EVENTO_ABRIR_BUSCADOR } from '@/lib/buscador-evento';
import { TRANSICION_SECCION } from '@/lib/panel/transiciones';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// El panel en móvil (< 768 px) como una app, copiando la de Shopify en iPhone (capturas del fundador, 19-nov-2026).
// Solo con `SHELL_NUEVO`: sin él, ni se monta. Medidas tomadas de las capturas (1206 px de ancho = 402 pt):
//   · barra inferior: redondo de buscar (56) · píldora de 4 iconos (56 de alto, círculo gris en el activo) · redondo del asistente (56),
//     a 24 pt de los bordes y 10 de hueco entre ellos;
//   · píldora negra de la prueba (52 de alto) a 24 pt por encima de la barra.
// Todo vive en el CSS de `app/globals.css` bajo `.panel-app[data-shell-nuevo]` (atributos `data-movil-*`).
// ─────────────────────────────────────────────────────────────────────────────

/** La píldora negra de la prueba: «Elige tu plan | Quedan N días». Solo la propietaria entra a contratar, así que lleva a Configuración → Plan. */
function PildoraPruebaMovil() {
  const [estado, setEstado] = useState<EstadoBilling | null>(null);
  useEffect(() => {
    let vivo = true;
    estadoBilling().then(e => { if (vivo) setEstado(e); });
    return () => { vivo = false; };
  }, []);
  const trial = estado?.trial;
  if (!trial || trial.fase === 'SUSCRITO' || trial.fase === 'SIN_PRUEBA' || estado?.gratis) return null;
  const expirada = trial.fase === 'EXPIRADA';
  const dias = trial.diasRestantes;
  return (
    <Link href="/configuracion?tab=plan" data-movil-prueba className="flex items-center justify-between">
      <span>Elige tu plan</span>
      <span data-movil-prueba-dias>
        <i aria-hidden="true" className={expirada ? 'bg-[#f08a7e]' : 'bg-[#c9e79a]'} />
        {expirada ? 'Prueba finalizada' : `Quedan ${dias} ${dias === 1 ? 'día' : 'días'}`}
      </span>
    </Link>
  );
}

type ItemBarra = { href: string; label: string; icon: React.ElementType };

/** La barra flotante: buscar · píldora (inicio, clases, clientes, menú) · asistente. */
export function BarraInferiorMovil({ items, onMenu, menuAbierto, porDecidir }: {
  items: ItemBarra[]; onMenu: () => void; menuAbierto: boolean; porDecidir?: number;
}) {
  const pathname = usePathname();
  const puertaAsistente = usePuertaAsistente();
  return (
    <div data-movil-barra className="md:hidden">
      <PildoraPruebaMovil />
      <nav data-tour="menu-principal" aria-label="Navegación principal" className="flex items-center">
        <button type="button" data-movil-redondo aria-label="Buscar" onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_BUSCADOR))}>
          <Search size={22} strokeWidth={1.9} aria-hidden="true" />
        </button>
        <div data-movil-pildora>
          {items.map(({ href, label, icon: Icono }) => {
            const activo = !menuAbierto && (pathname === href || (href !== '/dashboard' && pathname.startsWith(href)));
            return (
              <Link key={href} href={href} transitionTypes={TRANSICION_SECCION} aria-label={label} aria-current={activo ? 'page' : undefined} data-activo={activo ? '' : undefined}>
                <Icono size={22} strokeWidth={activo ? 2.4 : 1.7} aria-hidden="true" />
                {href === '/dashboard' && Boolean(porDecidir) && <b aria-label={`${porDecidir} por decidir`} />}
              </Link>
            );
          })}
          <button type="button" aria-label="Abrir el menú" aria-expanded={menuAbierto} onClick={onMenu} data-activo={menuAbierto ? '' : undefined}>
            <Menu size={22} strokeWidth={menuAbierto ? 2.4 : 1.7} aria-hidden="true" />
          </button>
        </div>
        {puertaAsistente
          ? <Link href="/asistente" data-movil-redondo aria-label="Pregúntale a Tentare"><Sparkles size={22} strokeWidth={1.8} aria-hidden="true" /></Link>
          : <span data-movil-redondo-hueco aria-hidden="true" />}
      </nav>
    </div>
  );
}

/** Solo en Inicio: avatar · nombre del estudio en píldora · campana, sobre el marco oscuro. La hoja blanca va debajo (CSS). */
export function CabeceraInicioMovil() {
  const pathname = usePathname();
  const { studio } = useCore();
  const { user } = useAuth();
  if (pathname !== '/dashboard') return null;
  const nombre = studio?.nombre?.trim() || 'Mi estudio';
  const metaNombre = user?.user_metadata?.nombre as string | undefined;
  const inicial = (metaNombre || user?.email || 'T').trim().slice(0, 1).toUpperCase();
  return (
    <header data-movil-cabecera className={cn('md:hidden')}>
      <Link href="/mi-perfil" aria-label="Tu perfil" data-movil-avatar>{inicial}</Link>
      <div data-movil-estudio>
        <span aria-hidden="true">{nombre.slice(0, 2)}</span>
        <p>{nombre}</p>
      </div>
      <Link href="/notificaciones" aria-label="Avisos" data-movil-campana><Bell size={22} strokeWidth={1.8} aria-hidden="true" /></Link>
    </header>
  );
}
