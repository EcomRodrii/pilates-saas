'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La home del panel nuevo (interruptor `panelNuevo`, 14-oct-2026), hecha sobre
// la de Bonsai (capturas b-70…b-73 en estudio-bonsai-v2), que el fundador puso
// de listón: «llamativa, muy intuitiva, colores; mira las cards, mira el
// gráfico».
//
//   · Arriba, cuatro cifras como las suyas: etiqueta pequeña, icono de color,
//     número grande con su explicación al lado y la barra que se pone roja,
//     ámbar o verde; cada tarjeta, teñida de su color hacia la esquina.
//   · Debajo, dos columnas: a la izquierda HOY (primeros pasos, lo que espera tu
//     visto bueno, la agenda, lo que viene, lo que te deben, ingresos y altas);
//     a la derecha CÓMO VA (accesos rápidos, reservas, renovaciones, ventas y lo
//     último que ha pasado).
//   · Las gráficas son las suyas: curva suave rellena, cuadrícula, cifra grande
//     arriba a la derecha con su comparación y el periodo en píldoras.
//   · Lo vacío habla en positivo y dice qué hacer.
//
// No calcula lo que la home de siempre ya calcula: la bandeja, los pagos
// pendientes (con sus botones de cobrar), el Centro de Control y las ventas
// llegan hechos desde la página (`app/(dashboard)/dashboard/page.tsx`), así que
// sus reglas de rol y de dinero siguen viviendo en un solo sitio. Aquí solo se
// calcula lo nuevo, con funciones puras y probadas (`lib/inicio/cifras.ts`).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity, ArrowRight, Bell, CalendarCheck, CalendarPlus, CreditCard, Euro, ExternalLink,
  MessageCircle, Package, RefreshCw, UserPlus, Users, Zap,
} from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { PageHeader } from '@/components/ui/page-header';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { HoyEnElEstudio } from '@/components/dashboard/hoy-en-el-estudio';
import { ProximasClases } from '@/components/dashboard/proximas-clases';
import { PrimerosPasosTarjeta } from '@/components/guia/primeros-pasos-tarjeta';
import { PonEnMarchaTarjeta } from '@/components/guia/pon-en-marcha';
import { TuPlanTarjeta } from '@/components/guia/tu-plan-tarjeta';
import { useAltaNuevaPropia } from '@/components/guia/use-pon-en-marcha';
import { GraficaArea } from '@/components/dashboard/grafica-area';
import { GraficaAltas } from '@/components/dashboard/grafica-altas';
import {
  MESES_LARGOS, ingresosAlDia, ocupacionEntre, ocupadasPorSesion,
  reservasPorDia, semanaDe, semanaISO,
} from '@/lib/inicio/cifras';
import { GraficaIngresos, formatoEuros, ladoIngresos } from '@/components/dashboard/ingresos-nuevo';
import { cn, hoyEnEstudio } from '@/lib/utils';
import { rutaApp } from '@/lib/enlaces-estudio';
import {
  CabeceraTarjeta, Comparacion, TONOS, TarjetaCifra, TarjetaGrafica, TarjetaOcupacion, VacioPositivo, VerMas, type Tono,
} from '@/components/dashboard/vivo';

// El día de una clase es el del estudio. Se recuerda por hora UTC: cientos de
// clases, una sola llamada a Intl por hora distinta (y Madrid no cambia de día
// a mitad de una hora UTC).
const DIA_POR_HORA = new Map<string, string>();
function diaDelEstudio(inicio: string): string {
  const k = inicio.slice(0, 13);
  let d = DIA_POR_HORA.get(k);
  if (!d) { d = hoyEnEstudio(new Date(inicio)); DIA_POR_HORA.set(k, d); }
  return d;
}

export interface RenovacionResumen {
  id: string;
  socioId: string;
  nombre: string;
  plan: string;
  precio: number;
  fechaFin: string;
}

export interface ActividadResumen {
  id: string;
  etiqueta: string;
  color: string;
  bg: string;
  texto: string;
  enlace?: string | null;
  hace: string;
}

export interface ResumenNuevoProps {
  titulo: string;
  fecha: string;
  ahora: Date;
  /** Las secciones que el estudio ha ocultado en «Tu Resumen» siguen ocultas. */
  visible: (id: string) => boolean;
  puedeIr: (href: string) => boolean;
  verFinanzas: boolean;
  verPrimerosPasos: boolean;
  gestionaClientas: boolean;
  gestionaCalendario: boolean;
  mueveDinero: boolean;
  sociasActivas: number | null;
  sinVenir30d: number | null;
  pendientesTotal: number;
  renovaciones: RenovacionResumen[];
  actividad: ActividadResumen[];
  avisos: ReactNode;
  bandeja: ReactNode;
  centroDeControl: ReactNode;
  pagosPendientes: ReactNode;
  ventasRecientes: ReactNode;
  crecimiento: ReactNode;
  graficos: ReactNode;
}

export function ResumenNuevo(props: ResumenNuevoProps) {
  const { sesiones, reservas, recibos, socios, studio } = useStudio();
  const { ahora, visible, verFinanzas } = props;
  const hoy = hoyEnEstudio(ahora);

  const ocupadas = useMemo(() => ocupadasPorSesion(reservas), [reservas]);
  const ocupacionHoy = useMemo(() => ocupacionEntre(sesiones, ocupadas, hoy, hoy, diaDelEstudio), [sesiones, ocupadas, hoy]);
  const semana = semanaDe(hoy);
  const ocupacionSemana = useMemo(
    () => ocupacionEntre(sesiones, ocupadas, semana.desde, semana.hasta, diaDelEstudio),
    [sesiones, ocupadas, semana.desde, semana.hasta],
  );
  const alDia = useMemo(() => ingresosAlDia(recibos, hoy), [recibos, hoy]);

  const conGraficas = visible('kpis');
  const slug = studio?.slug ?? null;
  // El alta nueva (PR-5): su «Pon en marcha tu estudio» va LO PRIMERO, antes de
  // las cifras (en un estudio recién abierto son ceros, y lo que toca es la
  // lista), con «Tu plan, sin sorpresas» al lado tras la primera reserva. Sin
  // ella, la tarjeta de siempre en su sitio; mientras se pregunta, ninguna.
  const altaNueva = useAltaNuevaPropia().activo;
  const conPrimerosPasos = props.verPrimerosPasos && visible('onboarding');

  return (
    <div className="flex flex-col gap-5" data-testid="resumen-nuevo">
      <PageHeader title={props.titulo} description={props.fecha} />

      {props.avisos}

      {conPrimerosPasos && altaNueva === true && (
        <div className="flex flex-col gap-5 empty:hidden xl:flex-row xl:items-start [&>*]:min-w-0 xl:[&>*:first-child]:flex-[7] xl:[&>*:last-child:not(:first-child)]:flex-[5]">
          <PonEnMarchaTarjeta />
          <TuPlanTarjeta />
        </div>
      )}

      {/* ── Cifras ──────────────────────────────────────────────────────────── */}
      {visible('kpis') && (
        // 2 × 2 hasta que caben cuatro con aire (brand: «máximo 4 por fila; nunca 3+1»).
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
          <TarjetaOcupacion etiqueta="Ocupación hoy" tono="azul" Icono={CalendarCheck} ocupacion={ocupacionHoy} vacio="Hoy no hay clases" href={props.puedeIr('/calendario') ? '/calendario' : null} />
          <TarjetaOcupacion etiqueta="Ocupación semana" tono="indigo" Icono={Activity} ocupacion={ocupacionSemana} vacio={`Semana ${semanaISO(hoy)} sin clases`} contexto={`Semana ${semanaISO(hoy)}`} href={props.puedeIr('/informes') ? '/informes' : null} />
          {verFinanzas ? (
            <TarjetaCifra
              etiqueta="Ingresos del mes"
              tono="verde"
              Icono={Euro}
              href={props.puedeIr('/informes') ? '/informes' : null}
              valor={<CifraPrivada inline>{formatoEuros(alDia.actual)}</CifraPrivada>}
              {...ladoIngresos(alDia.actual, alDia.anterior, alDia.mesAnterior)}
            />
          ) : (
            <TarjetaCifra
              etiqueta="Clases hoy"
              tono="verde"
              Icono={CalendarCheck}
              href={props.puedeIr('/calendario') ? '/calendario' : null}
              valor={String(ocupacionHoy.clases)}
              arriba={`${ocupacionHoy.ocupadas}`}
              abajo={ocupacionHoy.ocupadas === 1 ? 'alumna apuntada' : 'alumnas apuntadas'}
            />
          )}
          <TarjetaCifra
            etiqueta="Clientas activas"
            tono="magenta"
            Icono={Users}
            href={props.puedeIr('/clientas') ? (props.sinVenir30d ? '/clientas?mas=sin_venir_30d' : '/clientas') : null}
            valor={props.sociasActivas === null ? '—' : String(props.sociasActivas)}
            {...ladoClientas(props.sociasActivas, props.sinVenir30d)}
          />
        </div>
      )}

      {/* En una sola columna (móvil e iPad), los accesos van justo debajo de las
          cifras: al final de todo quedaban a seis pantallas de distancia. */}
      <div className="xl:hidden"><AccesosRapidos {...props} slug={slug} /></div>

      {/* ── Dos columnas ────────────────────────────────────────────────────── */}
      {/* Dos columnas solo desde 1280: a 1024 (iPad con el menú) la de la izquierda
          medía 400 px y las filas de la agenda se pisaban. */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* Hoy */}
        <div className="flex min-w-0 flex-col gap-5">
          {conPrimerosPasos && altaNueva === false && <PrimerosPasosTarjeta />}
          {props.bandeja}
          {visible('accion') && props.centroDeControl}
          {visible('hoy') && <HoyEnElEstudio nueva />}
          {visible('proximas') && <div className="empty:hidden"><ProximasClases nueva /></div>}
          {verFinanzas && visible('principal') && (
            props.pendientesTotal > 0 ? props.pagosPendientes : (
              <VacioPositivo
                titulo="Cobros al día"
                texto="Nadie te debe nada ahora mismo. Cuando un recibo quede pendiente, lo cobrarás desde aquí."
              />
            )
          )}
          {verFinanzas && visible('ingresos') && <GraficaIngresos recibos={recibos} hoy={hoy} alDia={alDia} href={props.puedeIr('/informes') ? '/informes' : null} />}
          {conGraficas && <GraficaAltas socios={socios} hoy={hoy} href={props.puedeIr('/clientas') ? '/clientas' : null} />}
        </div>

        {/* Cómo va */}
        <div className="flex min-w-0 flex-col gap-5">
          <div className="hidden xl:block"><AccesosRapidos {...props} slug={slug} /></div>
          {conGraficas && <GraficaReservas reservas={reservas} hoy={hoy} href={props.puedeIr('/calendario') ? '/calendario' : null} />}
          {verFinanzas && visible('principal') && <Renovaciones renovaciones={props.renovaciones} hoy={hoy} />}
          {verFinanzas && visible('ingresos') && props.ventasRecientes}
          {visible('crecimiento') && props.crecimiento}
          {visible('principal') && <Actividad actividad={props.actividad} verTodo={props.puedeIr('/notificaciones')} />}
        </div>
      </div>

      {visible('graficos') && props.graficos}
    </div>
  );
}

// ─── Cifras ───────────────────────────────────────────────────────────────────

/** Lo que va al lado de las clientas activas: con cero clientas no hay «todas han venido». */
function ladoClientas(activas: number | null, sinVenir: number | null): { arriba?: ReactNode; abajo: ReactNode } {
  if (activas === null || sinVenir === null) return { abajo: 'Contando…' };
  if (activas === 0 && sinVenir === 0) return { abajo: 'Aún no tienes clientas activas' };
  if (sinVenir === 0) return { arriba: 'Todas', abajo: 'han venido en 30 días' };
  return { arriba: <span style={{ color: 'var(--warning)' }}>{sinVenir} sin venir</span>, abajo: 'en 30 días' };
}

// ─── Accesos rápidos ──────────────────────────────────────────────────────────

function AccesosRapidos(props: ResumenNuevoProps & { slug: string | null }) {
  // Un atajo a una puerta cerrada es peor que no tener atajo: cada uno, con el
  // mismo permiso que pide su pantalla. Cada uno con su color, como en Bonsai.
  const accesos: { href: string; label: string; Icono: React.ElementType; tono: Tono; externo?: boolean }[] = [
    ...(props.gestionaClientas ? [{ href: '/clientas?nuevo=1', label: 'Nueva clienta', Icono: UserPlus, tono: 'magenta' as Tono }] : []),
    ...(props.gestionaCalendario ? [{ href: '/calendario?nueva=1', label: 'Crear clase', Icono: CalendarPlus, tono: 'azul' as Tono }] : []),
    ...(props.mueveDinero ? [{ href: '/cobros?nuevo=cobro', label: 'Cobrar', Icono: CreditCard, tono: 'verde' as Tono }] : []),
    ...(props.puedeIr('/mensajeria') ? [{ href: '/mensajeria', label: 'Mensajes', Icono: MessageCircle, tono: 'indigo' as Tono }] : []),
    ...(props.puedeIr('/productos') ? [{ href: '/productos', label: 'Cuotas y bonos', Icono: Package, tono: 'verde' as Tono }] : []),
    ...(props.slug ? [{ href: rutaApp(props.slug), label: 'Tu app', Icono: ExternalLink, tono: 'magenta' as Tono, externo: true }] : []),
  ];
  if (accesos.length === 0) return null;
  return (
    <section aria-labelledby="accesos-titulo" className="rounded-t-card border border-border bg-card p-4 shadow-t-card sm:p-5">
      <CabeceraTarjeta tono="azul" Icono={Zap} titulo="Accesos rápidos" id="accesos-titulo" />
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {accesos.map(({ href, label, Icono, tono, externo }) => {
          const c = TONOS[tono];
          const contenido = (
            <>
              <span
                className="flex size-10 items-center justify-center rounded-full transition-transform group-hover:scale-110"
                // Como Bonsai: la baldosa neutra y el color solo en el icono.
                style={{ backgroundColor: `color-mix(in srgb, ${c} 13%, var(--card))`, color: c }}
                aria-hidden
              >
                <Icono size={18} strokeWidth={2.2} />
              </span>
              <span className="text-center text-[12.5px] font-semibold leading-tight text-foreground">{label}</span>
            </>
          );
          const clase = 'group flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-t-card focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';
          const estilo = { backgroundColor: 'color-mix(in srgb, var(--muted) 45%, var(--card))', borderColor: 'var(--border)' };
          return externo ? (
            <a key={href} href={href} target="_blank" rel="noreferrer" className={clase} style={estilo} aria-label={`${label} (se abre en otra pestaña)`}>{contenido}</a>
          ) : (
            <Link key={href} href={href} className={clase} style={estilo}>{contenido}</Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── Gráficas, como las de Bonsai ─────────────────────────────────────────────

function GraficaReservas({ reservas, hoy, href }: { reservas: ReturnType<typeof useStudio>['reservas']; hoy: string; href: string | null }) {
  // 28 días: los 14 que se ven y los 14 de antes, para comparar.
  const serie = useMemo(() => reservasPorDia(reservas, hoy, 28, diaDelEstudio), [reservas, hoy]);
  const ultimos = serie.slice(14);
  const total = ultimos.reduce((t, d) => t + d.valor, 0);
  const antes = serie.slice(0, 14).reduce((t, d) => t + d.valor, 0);
  return (
    <TarjetaGrafica
      id="grafica-reservas"
      titulo="Reservas"
      sub="Las que se han hecho cada día, desde tu página o en el mostrador"
      cifra={total}
      comparacion={<Comparacion diferencia={total - antes} contra="los 14 días anteriores" />}
      pie={href ? <VerMas href={href} label="Ver calendario" /> : null}
    >
      <GraficaArea
        titulo="Reservas por día, últimos 14 días"
        alto={190}
        puntos={ultimos.map(d => ({ eje: diaCorto(d.clave), nombre: diaLargo(d.clave), valor: d.valor }))}
        formato={n => `${n} reserva${n === 1 ? '' : 's'}`}
        enteros
        vacio="Cada reserva que hagan tus alumnas, desde tu página o en el mostrador, sumará aquí."
      />
    </TarjetaGrafica>
  );
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function diaCorto(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number);
  return `${DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
}
function diaLargo(dia: string): string {
  const m = Number(dia.slice(5, 7));
  return `${diaCorto(dia)} de ${MESES_LARGOS[m - 1]}`;
}
// ─── Renovaciones ─────────────────────────────────────────────────────────────

function Renovaciones({ renovaciones, hoy }: { renovaciones: RenovacionResumen[]; hoy: string }) {
  return (
    <section aria-labelledby="renovaciones-titulo" className="overflow-hidden rounded-t-card border border-border bg-card shadow-t-card">
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <CabeceraTarjeta
          tono="indigo"
          Icono={RefreshCw}
          titulo="Cuotas que renuevan"
          id="renovaciones-titulo"
          sub="En los próximos 30 días"
        />
      </div>
      {renovaciones.length === 0 ? (
        <p className="px-4 pb-5 pt-3 text-[13px] text-muted-foreground sm:px-5">Ninguna cuota vence en los próximos 30 días.</p>
      ) : (
        <ul className="mt-3 divide-y divide-muted">
          {renovaciones.map(r => {
            const dias = Math.round((Date.parse(r.fechaFin) - Date.parse(hoy)) / 86_400_000);
            const urge = dias <= 5;
            return (
              <li key={r.id}>
                <Link href={`/clientas/${r.socioId}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted sm:px-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold" style={{ backgroundColor: 'color-mix(in srgb, var(--cat-5) 14%, var(--card))', color: 'var(--cat-5)' }} aria-hidden>
                    {iniciales(r.nombre)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">{r.nombre}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{r.plan}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <CifraPrivada inline className="block text-[13px] font-semibold text-foreground tabular-nums">{formatoEuros(r.precio)}</CifraPrivada>
                    <span
                      className="mt-0.5 inline-block rounded-full px-2 py-px text-[11px] font-semibold"
                      style={{ color: urge ? 'var(--warning)' : 'var(--muted-foreground)', backgroundColor: urge ? 'color-mix(in srgb, var(--warning) 14%, transparent)' : 'var(--muted)' }}
                    >
                      {dias <= 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
}

// ─── Actividad ────────────────────────────────────────────────────────────────

function Actividad({ actividad, verTodo }: { actividad: ActividadResumen[]; verTodo: boolean }) {
  return (
    <section aria-labelledby="actividad-titulo" className="rounded-t-card border border-border bg-card p-4 shadow-t-card sm:p-5">
      <CabeceraTarjeta
        tono="magenta"
        Icono={Bell}
        titulo="Lo último"
        id="actividad-titulo"
        derecha={verTodo ? (
          <Link href="/notificaciones" className="zona-tactil inline-flex shrink-0 items-center gap-1 pt-1 text-[13px] font-semibold" style={{ color: 'var(--t-text-link)' }}>
            Ver todo <ArrowRight size={14} aria-hidden />
          </Link>
        ) : null}
      />
      {actividad.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-muted/60 px-4 py-4 text-[13px] text-muted-foreground text-pretty">
          Aquí verás cada reserva, alta y cobro en cuanto pasen.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {actividad.slice(0, 6).map(a => {
            const caja = (
              <>
                <span className="flex items-center gap-2">
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: a.bg, color: a.color }}>{a.etiqueta}</span>
                  <span className="ml-auto shrink-0 text-[11.5px] text-muted-foreground tabular-nums">hace {a.hace}</span>
                </span>
                <span className="mt-1.5 block text-[13px] leading-snug text-foreground">{a.texto}</span>
              </>
            );
            const clase = 'block rounded-2xl border border-border bg-[color-mix(in_srgb,var(--foreground)_2.5%,var(--card))] px-3.5 py-3';
            return (
              <li key={a.id}>
                {a.enlace ? (
                  <Link href={a.enlace} className={cn(clase, 'transition-colors hover:bg-muted')}>{caja}</Link>
                ) : (
                  <div className={clase}>{caja}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
