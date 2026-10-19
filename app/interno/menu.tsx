'use client';

// El menú de /interno: lateral y oscuro en escritorio, una barra oscura con
// «Menú» desplegable en el móvil (nada de scroll horizontal: con 17 secciones en
// fila, media navegación quedaba fuera de alcance).
//
// Qué se pinta lo decide `tieneAlguno` con los permisos de la sesión, igual que
// antes: es USABILIDAD, no seguridad. Quien autoriza de verdad es cada ruta de
// /api/interno.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Building2, ChevronDown, CreditCard, FileCheck2, Flag, Home, Hourglass, LifeBuoy, Loader2, Megaphone, Network, Phone, Route,
  ScrollText, Search, Smartphone, Smile, Sprout, Users, X, Zap,
} from 'lucide-react';
import { fetchEstudios, type EstudioFila, type SesionInterna } from '@/lib/interno/client';
import type { Hoy } from '@/lib/interno/hoy';
import { tieneAlguno, tienePermiso, type Permiso } from '@/lib/interno/permisos';

type Seccion = { href: string; etiqueta: string; icono: typeof Home; permisos: Permiso[] };

// Agrupado por para qué sirve. Los permisos son los de siempre: cambiar de grupo
// o de nombre una sección no cambia quién la ve.
export const GRUPOS: Array<{ titulo: string; secciones: Seccion[] }> = [
  // «Hoy» lo ve todo el equipo: cada uno, lo que le toca con sus permisos (lo decide /api/interno/hoy).
  { titulo: '', secciones: [{ href: '/interno', etiqueta: 'Hoy', icono: Home, permisos: [] }] },
  {
    titulo: 'Clientes',
    secciones: [
      { href: '/interno/estudios', etiqueta: 'Estudios', icono: Building2, permisos: ['studios.read'] },
      { href: '/interno/facturacion', etiqueta: 'Cobros a estudios', icono: CreditCard, permisos: ['billing.read'] },
      { href: '/interno/apps-estudio', etiqueta: 'Apps en la App Store', icono: Smartphone, permisos: ['studios.read'] },
      { href: '/interno/visita-guiada', etiqueta: 'Visita guiada', icono: Route, permisos: ['studios.read'] },
      // Lo que diría la máquina de bajas, sin hacer nada (solo lectura).
      { href: '/interno/bajas', etiqueta: 'Bajas (en seco)', icono: Hourglass, permisos: ['studios.read'] },
      // Veri*Factu: la declaración responsable y los poderes IZ860 los gestiona el
      // productor/apoderado en persona, así que solo `admin.full`.
      { href: '/interno/verifactu', etiqueta: 'Veri*Factu', icono: FileCheck2, permisos: ['admin.full'] },
    ],
  },
  {
    titulo: 'Captar',
    secciones: [
      { href: '/interno/llamadas', etiqueta: 'Llamadas pedidas', icono: Phone, permisos: ['crm.update'] },
      { href: '/interno/crecimiento', etiqueta: 'Altas y prospectos', icono: Sprout, permisos: ['crm.update'] },
      { href: '/interno/sales', etiqueta: 'Sales OS', icono: Zap, permisos: ['crm.update'] },
    ],
  },
  {
    titulo: 'Moderar',
    secciones: [
      // Denuncias de la app de los estudios que le tocan a Tentare (App Store 1.2).
      { href: '/interno/denuncias', etiqueta: 'Denuncias', icono: Flag, permisos: ['app.moderate'] },
      { href: '/interno/network', etiqueta: 'Network', icono: Network, permisos: ['network.moderate'] },
    ],
  },
  {
    titulo: 'Contenido',
    secciones: [
      { href: '/interno/actualizaciones', etiqueta: 'Novedades', icono: Megaphone, permisos: ['content.write'] },
      { href: '/interno/ayuda', etiqueta: 'Ayuda', icono: LifeBuoy, permisos: ['content.write'] },
      // El catálogo de la mascota: el único sitio con toques a mano, insignias, la
      // mirada de 'pensando' y los estados que el panel no usa. Dónde vive Tenti en
      // el panel lo dice lib/tenti/donde-vive-tenti.test.ts.
      { href: '/interno/tenti', etiqueta: 'Tenti', icono: Smile, permisos: ['content.write'] },
    ],
  },
  {
    titulo: 'Seguridad',
    secciones: [
      { href: '/interno/equipo', etiqueta: 'Equipo interno', icono: Users, permisos: ['users.create', 'users.delete'] },
      { href: '/interno/auditoria', etiqueta: 'Registro de cambios', icono: ScrollText, permisos: ['logs.read'] },
    ],
  },
];

const FONDO = 'bg-[#14161c]';

export function MarcaInterna({ pequena }: { pequena?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className={`grid shrink-0 place-items-center rounded-lg bg-white font-bold text-[#14161c] ${pequena ? 'h-7 w-7 text-[13px]' : 'h-8 w-8 text-[15px]'}`}>T</span>
      {pequena ? (
        <span className="text-[13px] font-semibold text-white">Tentare <span className="text-amber-300/90">· Zona interna</span></span>
      ) : (
        <span className="leading-tight">
          <span className="block text-[14px] font-semibold text-white">Tentare</span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-amber-300/90">Zona interna</span>
        </span>
      )}
    </span>
  );
}

function gruposVisibles(permisos: readonly string[]) {
  return GRUPOS
    .map(g => ({ ...g, secciones: g.secciones.filter(s => s.permisos.length === 0 || tieneAlguno(permisos, s.permisos)) }))
    .filter(g => g.secciones.length > 0);
}

/** El contador de una sección: lo pendiente que lleva a ella. En «Hoy», cuántas cosas te esperan. */
function contadorDe(href: string, hoy: Hoy | null): number {
  if (!hoy) return 0;
  return href === '/interno' ? hoy.tareas.length : hoy.pendientes[href] ?? 0;
}

function Navegacion({ sesion, hoy }: { sesion: SesionInterna; hoy: Hoy | null }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Zona interna" className="space-y-4">
      {gruposVisibles(sesion.permisos).map(g => (
        <div key={g.titulo || 'inicio'}>
          {g.titulo && <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{g.titulo}</p>}
          {g.secciones.map(s => {
            const activo = s.href === '/interno' ? pathname === s.href : pathname.startsWith(s.href);
            const n = contadorDe(s.href, hoy);
            const Icono = s.icono;
            return (
              <Link key={s.href} href={s.href} aria-current={activo ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13.5px] transition-colors ${
                  activo ? 'bg-white/10 font-medium text-white' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'}`}>
                <Icono size={16} className={activo ? 'text-white' : 'text-slate-500'} aria-hidden />
                {s.etiqueta}
                {n > 0 && (
                  <span className={`ml-auto rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                    activo ? 'bg-white text-[#14161c]' : 'bg-amber-400/15 text-amber-300'}`}
                    aria-label={`${n} pendiente${n === 1 ? '' : 's'}`}>
                    {n}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Persona({ sesion }: { sesion: SesionInterna }) {
  const iniciales = sesion.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || 'T';
  const detalle = [sesion.cargo, sesion.permisos.includes('admin.full') ? 'todos los permisos' : null].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-700 text-[12px] font-semibold text-white">{iniciales}</span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[13px] font-medium text-white">{sesion.nombre}</span>
        {detalle && <span className="block text-[11.5px] text-slate-500">{detalle}</span>}
      </span>
    </div>
  );
}

function BotonBuscar({ onClick, atajo }: { onClick: () => void; atajo?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-left text-[13px] text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200">
      <Search size={14} aria-hidden /> Buscar un estudio…
      {atajo && <kbd className="ml-auto rounded bg-white/10 px-1.5 font-sans text-[11px]">⌘K</kbd>}
    </button>
  );
}

// ── Buscador de estudios (⌘K) ──────────────────────────────────────────────
// Usa la MISMA ruta que la pantalla de Estudios (`studios.read`): no abre nada
// que esa pantalla no enseñe ya. La lista se pide al abrirlo por primera vez y
// se filtra aquí; con decenas de estudios no merece la pena una búsqueda en el
// servidor por cada tecla.

function useBuscador(puede: boolean) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!puede) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAbierto(a => !a); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [puede]);
  return { abierto, abrir: useCallback(() => setAbierto(true), []), cerrar: useCallback(() => setAbierto(false), []) };
}

function BuscadorEstudios({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter();
  const [estudios, setEstudios] = useState<EstudioFila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [marcado, setMarcado] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    let vivo = true;
    fetchEstudios()
      .then(r => { if (vivo) setEstudios(Array.isArray(r?.estudios) ? r.estudios : []); })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se han podido cargar los estudios.'); });
    return () => { vivo = false; };
  }, []);

  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const lista = estudios ?? [];
    return (t ? lista.filter(e => e.nombre.toLowerCase().includes(t) || e.slug.toLowerCase().includes(t)) : lista).slice(0, 8);
  }, [estudios, q]);

  const ir = (e: EstudioFila) => { onCerrar(); router.push(`/interno/estudios/${e.id}`); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onMouseDown={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label="Buscar un estudio"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search size={16} className="text-muted-foreground" aria-hidden />
          <input ref={input} value={q} placeholder="Nombre del estudio o su enlace"
            aria-label="Nombre del estudio o su enlace"
            onChange={e => { setQ(e.target.value); setMarcado(0); }}
            onKeyDown={e => {
              if (e.key === 'Escape') onCerrar();
              else if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado(m => Math.min(m + 1, resultados.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado(m => Math.max(m - 1, 0)); }
              else if (e.key === 'Enter' && resultados[marcado]) ir(resultados[marcado]);
            }}
            className="h-12 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground" />
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {error ? <p className="px-3 py-3 text-[13px] text-destructive">{error}</p>
            : !estudios ? <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Cargando estudios…</p>
            : resultados.length === 0 ? <p className="px-3 py-3 text-[13px] text-muted-foreground">Ningún estudio se llama así.</p>
            : (
              <ul role="listbox" aria-label="Estudios">
                {resultados.map((e, i) => (
                  <li key={e.id} role="option" aria-selected={i === marcado}>
                    <button type="button" onClick={() => ir(e)} onMouseEnter={() => setMarcado(i)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === marcado ? 'bg-muted' : ''}`}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-[12px] font-semibold text-muted-foreground">{e.nombre.slice(0, 2)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium text-foreground">{e.nombre}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">/{e.slug} · {e.socias} socias · {e.clases} clases</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
    </div>
  );
}

// ── Escritorio ─────────────────────────────────────────────────────────────

export function MenuLateral({ sesion, hoy }: { sesion: SesionInterna; hoy: Hoy | null }) {
  const puedeBuscar = tienePermiso(sesion.permisos, 'studios.read');
  const buscador = useBuscador(puedeBuscar);
  return (
    <>
      <aside className={`hidden lg:sticky lg:top-0 lg:flex lg:h-screen w-[244px] shrink-0 flex-col ${FONDO} text-slate-300`}>
        <div className="px-5 pb-4 pt-5"><MarcaInterna /></div>
        {puedeBuscar && <div className="mx-3 mb-3"><BotonBuscar onClick={buscador.abrir} atajo /></div>}
        <div className="flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:thin]">
          <Navegacion sesion={sesion} hoy={hoy} />
        </div>
        <div className="m-3 mt-0"><Persona sesion={sesion} /></div>
      </aside>
      {buscador.abierto && <BuscadorEstudios onCerrar={buscador.cerrar} />}
    </>
  );
}

// ── Móvil ──────────────────────────────────────────────────────────────────

export function BarraMovil({ sesion, hoy }: { sesion: SesionInterna; hoy: Hoy | null }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const puedeBuscar = tienePermiso(sesion.permisos, 'studios.read');
  // Al navegar desde el menú, se cierra solo.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setAbierto(false); }, [pathname]);
  const total = hoy?.tareas.length ?? 0;

  return (
    <div className={`sticky top-0 z-40 lg:hidden ${FONDO} text-white`}>
      <div className="flex items-center gap-2.5 px-4 py-3">
        <MarcaInterna pequena />
        <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto} aria-controls="menu-interno-movil"
          className="ml-auto flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[12.5px] font-medium">
          Menú
          {total > 0 && !abierto && <span className="rounded-full bg-amber-400/20 px-1.5 text-[11px] font-semibold text-amber-300">{total}</span>}
          <ChevronDown size={14} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      {abierto && (
        <div id="menu-interno-movil" className="max-h-[calc(100dvh-56px)] overflow-y-auto border-t border-white/10 px-3 pb-4 pt-3 text-slate-300">
          {puedeBuscar && <div className="mb-3"><BotonBuscar onClick={() => { setAbierto(false); setBuscando(true); }} /></div>}
          <Navegacion sesion={sesion} hoy={hoy} />
          <div className="mt-3 border-t border-white/10 pt-2"><Persona sesion={sesion} /></div>
        </div>
      )}
      {buscando && <BuscadorEstudios onCerrar={() => setBuscando(false)} />}
    </div>
  );
}
