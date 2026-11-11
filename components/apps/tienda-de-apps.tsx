'use client';

// «Tienda de apps» (12-nov-2026, petición del fundador, con el listón de la de
// Momence): lo que el estudio puede encender, en tarjetas con aire, un icono con
// volumen y un único botón. Pestañas: Todas · Complementos · Integraciones ·
// Próximamente · Módulos · Mis apps activas.
//
// Cada cosa tiene SU dueño; aquí no se duplica ninguna decisión:
//   · Módulos del menú → el interruptor sigue siendo el de «Módulos»
//     (`/explorar-funciones`, `useTusModulos`): ocultar uno pregunta antes qué
//     deja de verse. En la tienda se ven y se va a ellos; no se cambian.
//   · Complementos de pago → la suscripción de Stripe (`/suscripcion#complementos`).
//   · Integraciones → su ficha en /apps/integraciones.
// Propietaria y gerencia lo ven; lo que cuesta dinero o toca credenciales lo
// activa la propietaria (y lo vuelve a exigir el servidor).
//
// «Todas» NO mezcla los 20 módulos del menú: son el esqueleto del producto, no
// algo que se «enciende», y tapaban lo que de verdad hay que descubrir.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Search } from 'lucide-react';
import { usePermisos } from '@/lib/permisos';
import { useCore } from '@/lib/core-context';
import { useStudio } from '@/lib/studio-context';
import { addonsDe, pagaAddonsAparte } from '@/lib/billing/entitlements';
import { planQueFalta, complementoQueFalta, type ModuloTuTentare } from '@/lib/tu-tentare/catalogo';
import { APPS_DE_TIENDA, disponible, textoPrecio, type AppDeTienda } from '@/lib/apps/catalogo';
import { useTusModulos } from '@/components/configuracion/tu-tentare/use-tus-modulos';
import { PageHeader } from '@/components/ui/page-header';
import { TONO_DE_SECCION, ICONO_PROPIO } from '@/components/dashboard/icono-seccion';
import type { TipoIntegracion } from '@/lib/types';
import { cn } from '@/lib/utils';
import { IconoApp, type TonoApp } from './icono-app';
import { VISUAL, VISUAL_POR_DEFECTO } from './visual-apps';

type Filtro = 'todas' | 'complementos' | 'integraciones' | 'proximamente' | 'modulos' | 'activas';

const TIPO_DE_INTEGRACION: Record<string, TipoIntegracion> = {
  stripe: 'STRIPE', whatsapp: 'WHATSAPP', 'google-calendar': 'GOOGLE_CALENDAR', zoom: 'ZOOM', kisi: 'KISI',
  klaviyo: 'KLAVIYO', mailchimp: 'MAILCHIMP', zapier: 'ZAPIER', classpass: 'CLASSPASS',
  'urban-sports-club': 'URBAN_SPORTS_CLUB', wellhub: 'WELLHUB',
};

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// El botón de Momence: contorneado, discreto, en el color de acento. Se rellena al pasar el ratón.
const BOTON = cn(
  'zona-tactil inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
  'border-[color:color-mix(in_srgb,var(--t-blue-500)_45%,var(--border))] text-[color:var(--t-text-link)]',
  'hover:bg-[color:color-mix(in_srgb,var(--t-blue-500)_10%,var(--card))] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
);

function ChapaActivo({ texto = 'Activo' }: { texto?: string }) {
  return (
    <span
      data-testid="chapa-app"
      className="inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold"
      style={{ color: 'var(--success)', backgroundColor: 'color-mix(in srgb, var(--success) 13%, var(--card))' }}
    >
      <Check size={11} strokeWidth={3} aria-hidden /> {texto}
    </span>
  );
}

function ChapaNeutra({ texto }: { texto: string }) {
  return (
    <span data-testid="chapa-app" className="inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
      {texto}
    </span>
  );
}

interface TarjetaProps {
  id: string;
  testid: string;
  nombre: string;
  frase: string;
  precio: string;
  nota?: string;
  icono: React.ReactNode;
  chapa?: React.ReactNode;
  accion: React.ReactNode;
}

function Tarjeta({ id, testid, nombre, frase, precio, nota, icono, chapa, accion }: TarjetaProps) {
  return (
    <li
      data-testid={testid}
      data-app={id}
      className="group flex gap-4 rounded-[22px] border border-border bg-card p-5 transition-[box-shadow,border-color] hover:border-[color:color-mix(in_srgb,var(--t-blue-500)_28%,var(--border))] hover:shadow-t-floating"
    >
      {icono}
      <div className="flex min-w-0 flex-1 flex-col">
        {chapa && <div className="mb-1.5">{chapa}</div>}
        <h3 className="text-[16px] font-semibold leading-snug text-foreground">{nombre}</h3>
        <p className="mt-1 text-[13.5px] leading-[1.5] text-muted-foreground text-pretty">{frase}</p>
        <p className="mt-2.5 text-[13px] text-muted-foreground">
          <span data-testid="precio-app" className="font-semibold tabular-nums text-foreground/80">{precio}</span>
          {nota && <span> · {nota}</span>}
        </p>
        <div className="mt-3.5">{accion}</div>
      </div>
    </li>
  );
}

export function TiendaDeApps() {
  const { rol } = usePermisos();
  const { studio } = useCore();
  const { integracionActiva } = useStudio();
  const { grupos, estadoDe, ocultos } = useTusModulos();
  const esPropietaria = rol === 'PROPIETARIO';
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busqueda, setBusqueda] = useState('');

  const activosAddon = useMemo(() => new Set<string>(studio ? addonsDe(studio) : []), [studio]);
  const aparte = !!studio && pagaAddonsAparte(studio);
  const leido = ocultos !== null;

  // La tienda no se lista a sí misma como un módulo más.
  const modulos = useMemo(() => grupos.flatMap(g => g.modulos).filter(m => m.href !== '/apps'), [grupos]);
  const moduloActivo = (m: ModuloTuTentare) => m.fijo || (leido && estadoDe(m) !== 'fuera');
  const integracionConectada = (a: AppDeTienda) => { const t = TIPO_DE_INTEGRACION[a.id]; return t ? integracionActiva(t) : false; };
  const complementoActivo = (a: AppDeTienda) => !!a.addon && (!aparte || activosAddon.has(a.addon));
  const estaActiva = (a: AppDeTienda) => a.origen === 'complemento' ? complementoActivo(a) : a.origen === 'integracion' ? integracionConectada(a) : false;

  const q = sinTildes(busqueda.trim());
  const coincide = (texto: string) => !q || sinTildes(texto).includes(q);
  const apps = APPS_DE_TIENDA.filter(a => coincide(`${a.nombre} ${a.frase}`));
  const mods = modulos.filter(m => coincide(`${m.label} ${m.frase}`));

  const porFiltro: Record<Filtro, AppDeTienda[]> = {
    todas: apps,
    complementos: apps.filter(a => a.origen === 'complemento'),
    integraciones: apps.filter(a => a.origen === 'integracion'),
    proximamente: apps.filter(a => !disponible(a)),
    modulos: [],
    activas: apps.filter(estaActiva),
  };
  const conteo: Partial<Record<Filtro, number>> = {
    complementos: APPS_DE_TIENDA.filter(a => a.origen === 'complemento').length,
    integraciones: APPS_DE_TIENDA.filter(a => a.origen === 'integracion').length,
    proximamente: APPS_DE_TIENDA.filter(a => !disponible(a)).length,
    modulos: modulos.length,
    activas: APPS_DE_TIENDA.filter(estaActiva).length,
  };
  const FILTROS: { id: Filtro; label: string }[] = [
    { id: 'todas', label: 'Todas las apps' }, { id: 'complementos', label: 'Complementos' },
    { id: 'integraciones', label: 'Integraciones' }, { id: 'proximamente', label: 'Próximamente' },
    { id: 'modulos', label: 'Módulos' }, { id: 'activas', label: 'Mis apps activas' },
  ];

  const appsVisibles = porFiltro[filtro];
  const modulosVisibles = filtro === 'modulos' ? mods : [];
  const total = appsVisibles.length + modulosVisibles.length;

  // La destacada: el primer complemento que todavía no está encendido. Sin él, no hay cabecera
  // (no se inventa una recomendación).
  const destacada = filtro === 'todas' && !q ? APPS_DE_TIENDA.find(a => a.origen === 'complemento' && !complementoActivo(a)) : undefined;

  function accion(a: AppDeTienda) {
    if (!disponible(a)) return <span className="text-[13px] text-muted-foreground">Aún no disponible</span>;
    if (a.origen === 'complemento') {
      if (complementoActivo(a)) return <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">Incluido en tu plan</span>;
      return esPropietaria
        ? <Link href={a.href} className={BOTON}>Activar</Link>
        : <span className="text-[13px] text-muted-foreground">Lo activa la propietaria</span>;
    }
    return <Link href={a.href} className={BOTON}>{integracionConectada(a) ? 'Gestionar' : 'Conectar'}<ArrowRight size={13} aria-hidden /></Link>;
  }

  function tarjetaApp(a: AppDeTienda) {
    const v = VISUAL[a.id] ?? VISUAL_POR_DEFECTO;
    const activa = estaActiva(a);
    const proxima = !disponible(a);
    const precio = a.origen === 'complemento' && !aparte ? 'Incluido' : textoPrecio(a.precio);
    const nota = a.origen === 'complemento' && aparte && !activa ? 'se suma a tu suscripción' : undefined;
    return (
      <Tarjeta
        key={a.id} id={a.id} testid="tarjeta-app" nombre={a.nombre} frase={a.frase} precio={proxima ? 'Próximamente' : precio} nota={nota}
        icono={<IconoApp tamano="lg" tono={v.tono} glifo={v.glifo} logo={v.logo} apagada={proxima} />}
        chapa={activa ? <ChapaActivo texto={a.origen === 'complemento' ? 'Activo' : 'Conectada'} /> : proxima ? <ChapaNeutra texto="Próximamente" /> : a.origen === 'complemento' ? <ChapaNeutra texto="Complemento" /> : undefined}
        accion={accion(a)}
      />
    );
  }

  function tarjetaModulo(m: ModuloTuTentare) {
    const tono = (TONO_DE_SECCION[m.href] ?? 'azul') as TonoApp;
    const Icono = ICONO_PROPIO[m.href] ?? m.icon;
    const activo = moduloActivo(m);
    const plan = planQueFalta(m, studio);
    const complemento = complementoQueFalta(m, studio);
    return (
      <Tarjeta
        key={m.href} id={m.href} testid="tarjeta-modulo" nombre={m.label} frase={m.frase}
        precio={complemento ? 'Con complemento' : plan ? `Desde el plan ${plan}` : 'Incluido'}
        icono={<IconoApp tamano="lg" tono={tono} glifo={Icono} />}
        chapa={m.fijo ? <ChapaActivo texto="Siempre activo" /> : leido ? (activo ? <ChapaActivo /> : <ChapaNeutra texto="Oculto" />) : undefined}
        accion={<Link href={m.href} className={BOTON}>Abrir<ArrowRight size={13} aria-hidden /><span className="sr-only"> {m.label}</span></Link>}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-7" data-testid="tienda-de-apps">
      <PageHeader title="Tienda de apps" />

      {destacada && (() => {
        const v = VISUAL[destacada.id] ?? VISUAL_POR_DEFECTO;
        return (
          <section
            aria-label="App destacada"
            data-testid="app-destacada"
            className="relative overflow-hidden rounded-[28px] border border-border bg-muted/40 px-6 py-7 sm:px-9 sm:py-8"
          >
            {/* Dos arcos muy tenues, en el color de la app: dan fondo sin competir con ella. */}
            <span aria-hidden className="pointer-events-none absolute -right-24 -top-28 size-[22rem] rounded-full border border-border/70" />
            <span aria-hidden className="pointer-events-none absolute -bottom-32 right-24 size-[18rem] rounded-full border border-border/50" />
            <span
              aria-hidden
              className="pointer-events-none absolute right-10 top-1/2 size-56 -translate-y-1/2 rounded-full blur-3xl"
              style={{ backgroundColor: `color-mix(in srgb, ${v.tono === 'magenta' ? 'var(--t-magenta-500)' : v.tono === 'indigo' ? 'var(--cat-5)' : 'var(--t-blue-500)'} 14%, transparent)` }}
            />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
              <IconoApp tamano="xl" tono={v.tono} glifo={v.glifo} logo={v.logo} />
              <div className="min-w-0 max-w-xl">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Complemento</p>
                <h2 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-foreground">{destacada.nombre}</h2>
                <p className="mt-1.5 text-[14.5px] leading-[1.55] text-muted-foreground text-pretty">{destacada.frase}</p>
                <p className="mt-2 text-[13.5px] text-muted-foreground">
                  <span className="font-semibold tabular-nums text-foreground/80">{aparte ? textoPrecio(destacada.precio) : 'Incluido'}</span>
                  {aparte && ' · se suma a tu suscripción de Tentare'}
                </p>
                <div className="mt-4">{accion(destacada)}</div>
              </div>
            </div>
          </section>
        );
      })()}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <div role="tablist" aria-label="Filtrar apps" className="flex flex-wrap gap-1">
            {FILTROS.map(f => {
              const on = filtro === f.id;
              return (
                <button
                  key={f.id}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  onClick={() => setFiltro(f.id)}
                  className={cn(
                    'zona-tactil inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    on ? 'bg-[color:color-mix(in_srgb,var(--t-blue-500)_12%,var(--card))] text-[color:var(--t-text-link)]' : 'text-foreground/75 hover:bg-muted hover:text-foreground',
                  )}
                >
                  {f.label}
                  {f.id !== 'todas' && conteo[f.id] !== undefined && <span className={cn('text-[12px] tabular-nums', on ? 'opacity-80' : 'text-muted-foreground')}>{conteo[f.id]}</span>}
                </button>
              );
            })}
          </div>
          <label className="ml-auto flex h-9 w-full items-center gap-2 rounded-xl border border-border bg-card px-3 focus-within:border-[color:var(--t-blue-500)] sm:w-64">
            <Search size={15} className="shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">Buscar una app</span>
            <input
              type="search"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar app…"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
        {filtro === 'modulos' && (
          <p className="px-1 text-[13.5px] text-muted-foreground">
            Los módulos son lo que sale en el menú de tu equipo. Ocultar uno no borra nada.{' '}
            <Link href="/explorar-funciones" className="font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--t-text-link)' }}>
              Elegir cuáles salen en el menú
            </Link>
          </p>
        )}
        {!esPropietaria && (
          <p className="px-1 text-[13px] text-muted-foreground">Activar un complemento o conectar una herramienta es cosa de la propietaria del estudio. Tú puedes verlo todo.</p>
        )}
      </div>

      {total === 0 ? (
        <p className="rounded-[22px] border border-dashed border-border bg-card px-4 py-12 text-center text-[14px] text-muted-foreground" data-testid="tienda-vacia">
          {filtro === 'activas' ? 'Todavía no has encendido ninguna app. Empieza por «Complementos» o «Integraciones».' : 'Ninguna app se llama así. Prueba con otra palabra: «zoom», «cobros», «equipo»…'}
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {appsVisibles.map(tarjetaApp)}
          {modulosVisibles.map(tarjetaModulo)}
        </ul>
      )}
    </div>
  );
}
