'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Módulos (panel nuevo), calcada sobre la de Bonsai (b-74, 15-oct-2026):
//   · la cabecera en color, «Personaliza tu plataforma», con cuántos hay
//     activos y cuántos en total (la única tarjeta fuerte del panel: el
//     degradado del logo va aquí y en casi ningún sitio más);
//   · el buscador;
//   · los grupos con su título en color y su frase («Operación: clases, citas,
//     alumnas…»), y cuántos de cada uno están activos;
//   · cada módulo en su tarjeta: icono, nombre, chapa «Activo», qué hace, el
//     interruptor e «Ir →» (y «Configurar» abajo cuando tiene ajustes).
// Y lo que Bonsai no tiene: al ocultar un módulo, ANTES de confirmar, qué deja
// de verse, qué notan las alumnas en su app, qué sigue igual y un aviso con su
// cifra si algo les toca (`DialogoOcultar`). Sustituye a «Explorar todas las
// funciones» cuando el estudio tiene el panel nuevo.
//
// «Activo» = en el menú del estudio, y Módulos es el único sitio que lo decide:
// sustituye al conmutador «Esencial / Todo» (lib/modulos/menu.ts). Es lo que
// guarda el interruptor (`ocultos` y `activados`, con la lógica de `useTusModulos`):
// ocultar un módulo lo quita del menú de TODO el equipo, no lo apaga ni quita
// permisos ni borra nada. Por eso la otra chapa es «Oculto» y no «Inactivo», y
// la cabecera lo dice. Guardar solo lo deja el servidor a la propietaria
// (`guardarLayoutAction`, y la RLS de `studio_layout`): al resto del equipo no
// se le enseña el interruptor.
//
// La chapa del plan la decide `tieneFeature` (`planQueFalta`): si el plan del
// estudio ya lo incluye, no hay chapa.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type CSSProperties, type ElementType } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Building2, CalendarDays, Search, Settings2, Star, TrendingUp, Users,
} from 'lucide-react';
import { usePermisos } from '@/lib/permisos';
import { useCore } from '@/lib/core-context';
import { useStudio } from '@/lib/studio-context';
import { useTutorial } from '@/lib/tutorial-context';
import { planQueFalta, type EstadoEnMenu, type ModuloTuTentare } from '@/lib/tu-tentare/catalogo';
import { alOcultar, type DatosAlOcultar } from '@/lib/modulos/al-ocultar';
import { estaSinCobrar } from '@/lib/billing/situacion-recibo';
import { useMensajesSinLeerStaff } from '@/lib/mensajeria/use-sin-leer-staff';
import { useTusModulos } from '@/components/configuracion/tu-tentare/use-tus-modulos';
import { Interruptor } from '@/components/ui/interruptor';
import { PageHeader } from '@/components/ui/page-header';
import { Toast, useToast } from '@/components/ui/toast';
import { TONOS } from '@/components/dashboard/vivo';
import { TONO_DE_SECCION, ICONO_PROPIO } from '@/components/dashboard/icono-seccion';
import { DialogoOcultar } from './dialogo-ocultar';
import { cn } from '@/lib/utils';

/**
 * Cada grupo del menú con su frase, su icono y su color, como «CORE» (rosa),
 * «STARTER» (azul), «PRO» (verde) y «PREMIUM» (ámbar) de Bonsai. `texto` es la
 * versión del tono que se lee a 12 px en claro y en oscuro; `tinte`, el que
 * tiñe sus tarjetas.
 */
const GRUPOS: Record<string, { frase: string; Icono: ElementType; texto: string; tinte: string }> = {
  Principal: { frase: 'Tu día, lo que merece tu atención y lo que Tentare hace solo', Icono: Star, texto: 'var(--t-text-accent)', tinte: 'var(--t-magenta-500)' },
  'Operación': { frase: 'Clases, citas, alumnas y lo que os escribís', Icono: CalendarDays, texto: 'var(--t-text-link)', tinte: 'var(--t-blue-500)' },
  Equipo: { frase: 'Quién da las clases y cómo se cubren las bajas', Icono: Users, texto: 'var(--cat-2)', tinte: 'var(--cat-2)' },
  Negocio: { frase: 'Lo que vendes, lo que cobras y cómo va', Icono: TrendingUp, texto: 'var(--cat-5)', tinte: 'var(--cat-5)' },
  Estudio: { frase: 'Cómo está montado tu estudio y lo que te traes de antes', Icono: Building2, texto: 'var(--cat-9)', tinte: 'var(--cat-9)' },
};
const GRUPO_POR_DEFECTO = GRUPOS['Operación'];

/** Los grupos sin rótulo de arriba del menú (Resumen, Centro de Control…) van juntos, como en «Tus módulos». */
function conRotulos(grupos: { label: string | null; modulos: ModuloTuTentare[] }[]) {
  const out: { label: string; modulos: ModuloTuTentare[] }[] = [];
  for (const g of grupos) {
    const label = g.label ?? 'Principal';
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.label === label) ultimo.modulos.push(...g.modulos);
    else out.push({ label, modulos: [...g.modulos] });
  }
  return out;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** «Ir →» y «Configurar»: el botón pequeño azul de Bonsai, con el azul del logo. */
const BOTON_PEQUENO =
  'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';
const ESTILO_BOTON_PEQUENO: CSSProperties = {
  color: 'var(--t-text-link)',
  borderColor: 'color-mix(in srgb, var(--t-blue-500) 30%, var(--border))',
  backgroundColor: 'color-mix(in srgb, var(--t-blue-500) 9%, var(--card))',
};

function Chapa({ estado }: { estado: 'activo' | 'oculto' | 'siempre' | 'cargando' }) {
  const azul = estado === 'activo' || estado === 'siempre';
  return (
    <span
      data-testid="chapa-modulo"
      className="inline-flex h-[18px] items-center rounded-md px-1.5 text-[10px] font-bold uppercase tracking-[0.05em]"
      style={azul
        ? { color: 'var(--t-text-link)', backgroundColor: 'color-mix(in srgb, var(--t-blue-500) 14%, var(--card))' }
        : { color: 'var(--muted-foreground)', backgroundColor: 'var(--muted)' }}
    >
      {estado === 'activo' ? 'Activo' : estado === 'siempre' ? 'Siempre activo' : estado === 'oculto' ? 'Oculto' : '…'}
    </span>
  );
}

function TarjetaModulo({ m, estado, tinte, plan, puedeCambiar, guardando, otroGuardando, recien, error, onCambiar, onIr }: {
  m: ModuloTuTentare;
  /** `null`: el menú no se ha podido leer (o no ha llegado): no se dice si está puesto. */
  estado: EstadoEnMenu | null;
  tinte: string;
  plan: string | null;
  puedeCambiar: boolean;
  guardando: boolean;
  otroGuardando: boolean;
  recien: boolean;
  error: string | null;
  onCambiar: (activo: boolean) => void;
  onIr: () => void;
}) {
  const activo = estado !== null && estado !== 'fuera';
  const tono = TONOS[TONO_DE_SECCION[m.href] ?? 'azul'];
  const Icono = ICONO_PROPIO[m.href] ?? m.icon;
  const chapa = m.fijo ? 'siempre' : estado === null ? 'cargando' : activo ? 'activo' : 'oculto';
  const encendida = m.fijo || activo;

  const ir = (
    <Link href={m.href} onClick={onIr} className={BOTON_PEQUENO} style={ESTILO_BOTON_PEQUENO}>
      Ir <ArrowRight size={12} aria-hidden /><span className="sr-only"> a {m.label}</span>
    </Link>
  );

  return (
    <li
      data-testid="modulo-nuevo"
      data-modulo={m.href}
      data-activo={estado === null ? undefined : encendida ? 'si' : 'no'}
      className={cn(
        'flex flex-col rounded-t-card border p-4 shadow-t-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-t-floating',
        recien && 'ring-2',
      )}
      style={{
        backgroundColor: 'var(--card)',
        // Como las tarjetas de Bonsai: blancas, y su grupo entra suave por la esquina de abajo.
        backgroundImage: encendida
          ? `radial-gradient(130% 110% at 0% 100%, color-mix(in srgb, ${tinte} 13%, transparent), transparent 62%)`
          : undefined,
        borderColor: encendida ? `color-mix(in srgb, ${tinte} 14%, var(--border))` : 'var(--border)',
        ['--tw-ring-color' as string]: tono,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors"
          style={encendida
            ? { backgroundColor: tono, color: 'var(--card)', boxShadow: `0 8px 18px -10px ${tono}` }
            : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          <Icono size={18} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[14.5px] font-semibold leading-tight text-foreground">{m.label}</h3>
            <Chapa estado={chapa} />
          </div>
          <p className="mt-1.5 text-[12.5px] leading-[1.45] text-muted-foreground text-pretty">{m.frase}</p>
          {plan && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                data-testid="chapa-plan"
                className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                style={{ color: 'var(--warning)', backgroundColor: 'color-mix(in srgb, var(--warning) 12%, var(--card))' }}
              >
                Desde el plan {plan}
              </span>
              <Link href="/suscripcion" className="text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--t-text-link)' }}>
                Ver planes
              </Link>
            </p>
          )}
        </div>
        {/* Como en Bonsai: el interruptor arriba a la derecha y, debajo, «Ir». */}
        <div className="flex shrink-0 flex-col items-end gap-2.5">
          {!m.fijo && puedeCambiar && estado !== null && (
            <Interruptor
              on={activo}
              ariaLabel={`${m.label} en el menú`}
              disabled={otroGuardando}
              ocupado={guardando}
              onChange={onCambiar}
            />
          )}
          <span className="hidden sm:block">{ir}</span>
        </div>
      </div>
      {error && <p role="alert" className="mt-2.5 text-[12px] font-medium text-destructive">{error}</p>}
      {/* En el móvil, «Ir» abajo para que el texto tenga todo el ancho; «Configurar», siempre abajo a la derecha. */}
      <div className={cn('mt-auto flex items-center justify-end gap-2 pt-3', !m.configurar && 'sm:hidden')}>
        <span className="mr-auto sm:hidden">{ir}</span>
        {m.configurar && (
          <Link href={m.configurar} className={BOTON_PEQUENO} style={ESTILO_BOTON_PEQUENO}>
            <Settings2 size={12} aria-hidden /> Configurar<span className="sr-only"> {m.label}</span>
          </Link>
        )}
      </div>
    </li>
  );
}

export function ModulosNuevo() {
  const { rol } = usePermisos();
  const { studio } = useCore();
  const { citas, citasServicios, automatizaciones, planesTarifa, recibos, reservas, sesiones, dataLoaded } = useStudio();
  const tutorial = useTutorial();
  const esPropietaria = rol === 'PROPIETARIO';
  const { grupos, ocultos, estadoDe, cuenta, guardando, errores, recien, errorLectura, cambiar } = useTusModulos();
  const [busqueda, setBusqueda] = useState('');
  const [ocultando, setOcultando] = useState<ModuloTuTentare | null>(null);
  // El error de un intento anterior no es de ESTE diálogo: solo se enseña el de pulsar «Ocultar» en él.
  const [intentado, setIntentado] = useState(false);
  // «Próximas» respecto a cuándo se abrió el diálogo (no se puede leer el reloj al pintar).
  const [abiertoEn, setAbiertoEn] = useState(0);
  const toast = useToast();
  const mensajesSinLeer = useMensajesSinLeerStaff(ocultando?.href === '/mensajeria');

  const visibles = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    return conRotulos(grupos)
      .map(g => ({ ...g, modulos: q ? g.modulos.filter(m => sinTildes(`${m.label} ${m.frase}`).includes(q)) : g.modulos }))
      .filter(g => g.modulos.length > 0);
  }, [grupos, busqueda]);

  const leido = ocultos !== null;

  // Las cifras del aviso, solo con el diálogo abierto. Sin datos cargados, `null`:
  // `alOcultar` no afirma ninguna cifra que no sepa.
  const datos = useMemo<DatosAlOcultar | null>(() => {
    if (!ocultando) return null;
    const futura = (iso: string) => new Date(iso).getTime() > abiertoEn;
    const sesionesFuturas = new Set(sesiones.filter(s => !s.cancelada && futura(s.inicio)).map(s => s.id));
    const si = <T,>(v: T) => (dataLoaded ? v : null);
    return {
      reservasProximas: si(reservas.filter(r => r.estado === 'CONFIRMADA' && sesionesFuturas.has(r.sesionId)).length),
      citasProximas: si(citas.filter(c => (c.estado === 'PENDIENTE' || c.estado === 'CONFIRMADA') && futura(c.inicio)).length),
      serviciosCitaOnline: si(citasServicios.filter(s => s.activo && s.autoReservable).length),
      automatizacionesEncendidas: si(automatizaciones.filter(a => a.activa).length),
      paquetesActivos: si(planesTarifa.filter(p => p.activo).length),
      recibosSinCobrar: si(recibos.filter(estaSinCobrar).length),
      mensajesSinLeer: mensajesSinLeer > 0 ? mensajesSinLeer : null,
      enCadena: !!studio?.cadenaId,
    };
  }, [ocultando, abiertoEn, sesiones, reservas, citas, citasServicios, automatizaciones, planesTarifa, recibos, dataLoaded, mensajesSinLeer, studio?.cadenaId]);

  async function activar(m: ModuloTuTentare) {
    if (await cambiar(m, true)) toast.show(`${m.label} vuelve a estar en tu menú`);
  }

  async function confirmarOcultar() {
    const m = ocultando;
    if (!m) return;
    setIntentado(true);
    if (await cambiar(m, false)) {
      setOcultando(null);
      toast.show(`${m.label} ya no está en tu menú`, { texto: 'Deshacer', onClick: () => { void activar(m); } });
    }
  }

  return (
    <div className="space-y-6" data-testid="modulos-nuevo">
      <PageHeader title="Módulos" />

      {/* La cabecera en color, como «Personaliza tu plataforma» de Bonsai. */}
      <section
        aria-labelledby="modulos-titulo"
        className="relative overflow-hidden rounded-t-card px-6 py-6 text-white shadow-t-card sm:px-8"
        style={{ backgroundImage: 'linear-gradient(120deg, var(--t-blue-700), var(--t-magenta-700))' }}
      >
        {/* Los círculos de Bonsai, apenas insinuados: más blancos lavaban el degradado. */}
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-32 size-72 rounded-full bg-white/[0.06]" />
        <span aria-hidden className="pointer-events-none absolute -bottom-32 right-52 size-52 rounded-full bg-white/[0.04]" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0 max-w-xl">
            <h2 id="modulos-titulo" className="text-[20px] font-bold leading-tight">Personaliza tu plataforma</h2>
            <p className="mt-1.5 text-[13.5px] leading-snug text-white/85 text-pretty">
              Lo que activas aquí es lo que sale en el menú de tu equipo. Ocultar un módulo no borra nada, y lo que hace solo sigue funcionando.
            </p>
          </div>
          <div className="flex items-stretch rounded-2xl bg-white/15 px-1.5 py-3 ring-1 ring-white/20 backdrop-blur-sm" data-testid="cifras-modulos">
            <div className="px-4 text-center">
              <p className="text-[28px] font-bold leading-none tabular-nums" aria-busy={!leido || undefined}>{leido ? cuenta.en : '–'}</p>
              <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/80">Activos</p>
            </div>
            <div className="w-px bg-white/25" />
            <div className="px-4 text-center">
              <p className="text-[28px] font-bold leading-none tabular-nums">{cuenta.de}</p>
              <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/80">En total</p>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-2">
        <label className="flex h-11 items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 shadow-t-card transition-colors focus-within:border-[color:var(--t-blue-500)] focus-within:ring-3 focus-within:ring-ring/30">
          <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Buscar un módulo</span>
          <input
            type="search"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar módulo…"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        {!esPropietaria && (
          <p className="px-1 text-[12.5px] text-muted-foreground">Activar u ocultar un módulo es cosa de la propietaria del estudio.</p>
        )}
      </div>

      {errorLectura && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          No hemos podido leer tu menú, así que aquí no se puede cambiar nada. Recarga la página para intentarlo de nuevo.
        </p>
      )}

      {visibles.length === 0 && (
        <p className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-[13.5px] text-muted-foreground">
          Ningún módulo se llama así. Prueba con otra palabra: «cobros», «clases», «equipo»…
        </p>
      )}

      {visibles.map(g => {
        const grupo = GRUPOS[g.label] ?? GRUPO_POR_DEFECTO;
        const activosDelGrupo = leido ? g.modulos.filter(m => estadoDe(m) !== 'fuera').length : 0;
        const id = `grupo-${sinTildes(g.label)}`;
        return (
          <section key={g.label} aria-labelledby={id} className="space-y-3" data-testid="grupo-modulos">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border pb-2.5">
              <span aria-hidden className="flex size-6 items-center justify-center rounded-md" style={{ backgroundColor: `color-mix(in srgb, ${grupo.tinte} 14%, var(--card))`, color: grupo.texto }}>
                <grupo.Icono size={13} strokeWidth={2.4} />
              </span>
              <h2 id={id} className="text-[12.5px] font-bold uppercase tracking-[0.08em]" style={{ color: grupo.texto }}>{g.label}</h2>
              <p className="text-[12.5px] text-muted-foreground">{grupo.frase}</p>
              {leido && !busqueda && (
                <p className="ml-auto hidden text-[12px] tabular-nums text-muted-foreground sm:block">{activosDelGrupo} de {g.modulos.length} activos</p>
              )}
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {g.modulos.map(m => {
                const estado = leido ? estadoDe(m) : null;
                return (
                  <TarjetaModulo
                    key={m.href}
                    m={m}
                    estado={estado}
                    tinte={grupo.tinte}
                    plan={planQueFalta(m, studio)}
                    puedeCambiar={esPropietaria}
                    guardando={guardando === m.href}
                    otroGuardando={guardando !== null && guardando !== m.href}
                    recien={recien === m.href}
                    error={ocultando?.href === m.href ? null : errores[m.href] ?? null}
                    onCambiar={v => { if (v) void activar(m); else { setIntentado(false); setAbiertoEn(Date.now()); setOcultando(m); } }}
                    onIr={() => { if (m.tutorial) tutorial?.abrirAlLlegar(m.href); }}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}

      {ocultando && datos && (
        <DialogoOcultar
          nombre={ocultando.label}
          Icono={ICONO_PROPIO[ocultando.href] ?? ocultando.icon}
          color={TONOS[TONO_DE_SECCION[ocultando.href] ?? 'azul']}
          texto={alOcultar(ocultando, datos)}
          guardando={guardando === ocultando.href}
          error={intentado ? errores[ocultando.href] ?? null : null}
          onConfirmar={() => { void confirmarOcultar(); }}
          onCerrar={() => setOcultando(null)}
        />
      )}
      {toast.message && <Toast message={toast.message} action={toast.action} variant={toast.variant} onDismiss={toast.dismiss} />}
    </div>
  );
}
