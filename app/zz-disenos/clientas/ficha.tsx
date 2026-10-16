'use client';

// TEMPORAL — maqueta de la ficha de una clienta. No se commitea.
import {
  ArrowLeft, Bell, CalendarCheck, CalendarPlus, CalendarX, Check, ChevronRight, CircleDollarSign, Clock, Gift, HeartPulse, Mail,
  MessageCircle, MoreHorizontal, Pause, Phone, Pin, Plus, RotateCcw, Send, Sparkles, StickyNote, Tag, UserRound, Users, Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, Boton, Nota, PastillaEstado, Senal, Tarjeta, TituloTarjeta } from './comun';

export function CabeceraFicha({ movil, enPanel }: { movil?: boolean; enPanel?: boolean }) {
  const datos: [LucideIcon, string, string][] = [
    [CircleDollarSign, 'Plan', 'Mensual 2×/semana · 59 € el 12 oct'],
    [CalendarCheck, 'Próxima clase', 'Ninguna reservada'],
    [Clock, 'Última clase', 'Reformer, 10 sep · hace 3 semanas'],
    [RotateCcw, 'Recuperaciones', '1 sin usar · caduca el 31 oct'],
  ];
  const dosColumnas = movil || enPanel;
  return (
    <Tarjeta className={cn('overflow-hidden', movil && 'rounded-2xl')}>
      <div className={cn('flex gap-4 p-5', movil && 'flex-col gap-3 p-4')}>
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <Avatar ini="CR" grande />
          <div className="min-w-0">
            <h1 className={cn('font-semibold leading-tight text-foreground', movil ? 'text-[21px]' : 'text-[24px]')}>Carmen Del Río</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <PastillaEstado estado="activa" desde="desde mar 2025" grande />
              <Senal>Viene menos</Senal>
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">600 111 201 · carmen@example.com{!movil && ' · Recomendada por Laura Martín'}</p>
          </div>
        </div>
        <div className={cn('flex shrink-0 items-start gap-2', movil && 'grid grid-cols-3')}>
          <Boton icono={MessageCircle} primario className={cn(movil && 'min-h-12 flex-col gap-0.5 py-1.5 text-[12.5px]')}>WhatsApp</Boton>
          <Boton icono={Phone} className={cn(movil && 'min-h-12 flex-col gap-0.5 py-1.5 text-[12.5px]')}>Llamar</Boton>
          <Boton icono={CalendarPlus} className={cn(movil && 'min-h-12 flex-col gap-0.5 py-1.5 text-[12.5px]')}>Reservar</Boton>
          {!movil && <Boton icono={MoreHorizontal} className="px-2.5" />}
        </div>
      </div>
      <dl className={cn('grid border-t border-border', dosColumnas ? 'grid-cols-2' : 'grid-cols-4')}>
        {datos.map(([I, k, v], i) => (
          <div key={k} className={cn(
            'px-5 py-3',
            movil && 'px-4',
            !dosColumnas && i > 0 && 'border-l border-border',
            dosColumnas && i % 2 === 1 && 'border-l border-border',
            dosColumnas && i > 1 && 'border-t border-border',
          )}>
            <dt className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground"><I size={13} aria-hidden />{k}</dt>
            <dd className="mt-0.5 text-[13.5px] font-medium text-foreground text-pretty">{v}</dd>
          </div>
        ))}
      </dl>
      <div className={cn('flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border bg-muted/50 px-5 py-2.5', movil && 'px-4')}>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground"><Pin size={13} className="shrink-0 text-muted-foreground" aria-hidden /><span><strong className="font-semibold">Prefiere que no la corrijan delante de otras</strong> <span className="text-muted-foreground">· Ana, recepción</span></span></span>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground"><HeartPulse size={13} className="shrink-0 text-warning" aria-hidden />Salud: tiene algo que mirar antes de clase</span>
      </div>
    </Tarjeta>
  );
}

export function SenalExplicada({ movil }: { movil?: boolean }) {
  return (
    <Tarjeta className="border-warning/40 bg-warning/[0.06]">
      <div className={cn('flex gap-4 p-4', movil && 'flex-col gap-3')}>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-warning">Por qué te aviso</p>
          <p className="mt-0.5 text-[14.5px] font-semibold text-foreground text-pretty">Venía 2 veces por semana desde marzo. Desde el 10 de septiembre no ha vuelto.</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Nadie le ha escrito desde entonces. Su cuota renueva el 12 de octubre.</p>
        </div>
        <div className={cn('flex shrink-0 flex-col gap-2', movil && 'flex-row flex-wrap')}>
          <Boton icono={MessageCircle} primario>Escribirle por WhatsApp</Boton>
          <div className="flex gap-2">
            <Boton peque icono={Check}>Ya hablé con ella</Boton>
            <Boton peque icono={Bell}>Recuérdamelo</Boton>
          </div>
        </div>
      </div>
    </Tarjeta>
  );
}

export function Pestanas({ activa = 'Resumen', movil }: { activa?: string; movil?: boolean }) {
  const p = ['Resumen', 'Historia', 'Reservas', 'Pagos', 'Salud', 'Documentos'];
  return (
    <div role="tablist" className={cn('flex gap-1 border-b border-border', movil && '-mx-4 overflow-hidden px-4')}>
      {p.map(x => (
        <span key={x} role="tab" aria-selected={x === activa} className={cn(
          '-mb-px whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[14px] font-medium',
          x === activa ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground',
        )}>{x}</span>
      ))}
    </div>
  );
}

type Evento = { cuando: string; icono: LucideIcon; quien?: string; que: string; detalle?: string; tono?: 'contacto' | 'motor' };
const HISTORIA: Evento[] = [
  { cuando: 'Hoy · 11:20', icono: Phone, quien: 'Ana (recepción)', que: 'La llamó · contestó', detalle: '«Ha tenido mucho lío en el trabajo, vuelve la semana que viene.»', tono: 'contacto' },
  { cuando: '28 sep', icono: Zap, que: 'Centro de Control: «Viene menos»', detalle: 'De 2 clases por semana a ninguna en 3 semanas.', tono: 'motor' },
  { cuando: '24 sep', icono: CalendarX, que: 'Canceló Reformer · jue 25, 18:00', detalle: 'A tiempo: le quedó 1 recuperación.' },
  { cuando: '12 sep', icono: CircleDollarSign, que: 'Cobro de 59 € · Mensual de septiembre', detalle: 'Tarjeta ···· 4242' },
  { cuando: '10 sep', icono: Check, que: 'Vino a Reformer con Laura' },
  { cuando: '9 sep', icono: Mail, que: 'Recordatorio de su clase', detalle: 'Correo automático · entregado' },
  { cuando: '3 sep', icono: StickyNote, quien: 'Ana (recepción)', que: 'Fijó una nota', detalle: '«Prefiere que no la corrijan delante de otras.»' },
];

function LineaHistoria({ max }: { max?: number }) {
  return (
    <ol className="relative px-4 pb-2">
      <span className="absolute top-2 bottom-4 left-[31px] w-px bg-border" aria-hidden />
      {HISTORIA.slice(0, max).map((e, i) => (
        <li key={i} className="relative flex gap-3 py-2">
          <span className={cn(
            'z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground',
            e.tono === 'contacto' && 'border-transparent bg-brand text-brand-foreground',
            e.tono === 'motor' && 'border-warning/40 bg-warning/10 text-warning',
          )}><e.icono size={14} aria-hidden /></span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[13.5px] font-semibold text-foreground">{e.que}</p>
            {e.detalle && <p className="text-[12.5px] text-muted-foreground text-pretty">{e.detalle}</p>}
            <p className="text-[11.5px] text-muted-foreground">{e.cuando}{e.quien && ` · ${e.quien}`}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Constancia() {
  const semanas = [2, 2, 1, 2, 2, 2, 1, 2, 1, 0, 0, 0];
  return (
    <Tarjeta>
      <TituloTarjeta accion={<span className="text-[12px] text-muted-foreground">Últimas 12 semanas</span>}>Constancia</TituloTarjeta>
      <div className="flex h-10 items-end gap-2 px-4 pb-1">
        {semanas.map((s, i) => (
          <span key={i} className={cn('flex-1 rounded-t-[3px]', s === 0 ? 'h-[3px] rounded-[3px] bg-border' : 'bg-brand/75')} style={s ? { height: s * 16 } : undefined} />
        ))}
      </div>
      <p className="px-4 pb-3 text-[12.5px] text-muted-foreground"><strong className="font-semibold text-foreground">1,6 clases por semana</strong> de media hasta septiembre · 0 en las últimas 3</p>
    </Tarjeta>
  );
}

export function Notas() {
  return (
    <Tarjeta>
      <TituloTarjeta icono={StickyNote}>Notas del equipo</TituloTarjeta>
      <div className="px-4">
        <div className="rounded-lg border border-input bg-card px-3 py-2.5 text-[13px] text-muted-foreground">Escribe una nota…</div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11.5px] text-muted-foreground">Lesiones y salud, en la pestaña Salud: esto lo lee todo el equipo.</p>
          <span className="flex items-center gap-1 rounded-full border border-border p-0.5 text-[11.5px]">
            <span className="rounded-full bg-foreground px-2 py-0.5 text-background">Equipo</span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-foreground">Solo yo <Nota n={6} /></span>
          </span>
        </div>
      </div>
      <ul className="mt-2 divide-y divide-border">
        <li className="px-4 py-2.5">
          <p className="flex items-center gap-1.5 text-[13px] text-foreground"><Pin size={13} className="shrink-0 text-muted-foreground" />Prefiere que no la corrijan delante de otras.</p>
          <p className="text-[11.5px] text-muted-foreground">Ana · recepción · 3 sep · fijada</p>
        </li>
        <li className="px-4 py-2.5">
          <p className="text-[13px] text-foreground">Viene con su hermana los jueves; si una cancela, suele cancelar la otra.</p>
          <p className="text-[11.5px] text-muted-foreground">Tú · 14 ago</p>
        </li>
      </ul>
    </Tarjeta>
  );
}

export function Seguimientos() {
  return (
    <Tarjeta>
      <TituloTarjeta icono={Bell} accion={<span className="flex items-center gap-1 text-[12.5px] font-medium text-foreground"><Plus size={14} />Recuérdamelo</span>}>Seguimiento</TituloTarjeta>
      <div className="px-4 pb-3">
        <div className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2">
          <span className="mt-0.5 size-4 shrink-0 rounded border border-input" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-foreground">Confirmar que vuelve la semana que viene</span>
            <span className="block text-[11.5px] text-muted-foreground">Lunes 6 oct · para Ana · ese día sale en «Por decidir»</span>
          </span>
        </div>
      </div>
    </Tarjeta>
  );
}

function Etiquetas() {
  return (
    <Tarjeta>
      <TituloTarjeta icono={Tag}>Etiquetas</TituloTarjeta>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3.5">
        {['Mañanas', 'Reformer', 'Viene con su hermana'].map(t => <span key={t} className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[12.5px] text-foreground">{t}</span>)}
        <span className="flex items-center gap-1 rounded-full border border-dashed border-input px-2.5 py-0.5 text-[12.5px] text-muted-foreground"><Plus size={12} />Añadir</span>
      </div>
    </Tarjeta>
  );
}

function SobreElla() {
  const f: [LucideIcon, string, string][] = [
    [Users, 'Cómo llegó', 'Recomendada por Laura Martín · 12 mar 2025'],
    [Sparkles, 'Su prueba', 'Reformer con Laura · 14 mar 2025 · compró a los 2 días'],
    [Gift, 'Cumpleaños', '17 de noviembre'],
    [UserRound, 'Créditos', '120 · 3 logros'],
  ];
  return (
    <Tarjeta>
      <TituloTarjeta icono={UserRound} accion={<span className="text-[12.5px] font-medium text-foreground">Editar</span>}>Sobre ella</TituloTarjeta>
      <dl className="space-y-2 px-4 pb-3.5">
        {f.map(([I, k, v]) => (
          <div key={k} className="flex gap-2.5">
            <I size={15} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
            <div><dt className="text-[11.5px] text-muted-foreground">{k}</dt><dd className="text-[13px] text-foreground">{v}</dd></div>
          </div>
        ))}
      </dl>
    </Tarjeta>
  );
}

function Plan() {
  return (
    <Tarjeta>
      <TituloTarjeta icono={CircleDollarSign} accion={<span className="flex gap-2"><Boton peque icono={Pause}>Pausar</Boton><Boton peque>Cambiar plan</Boton></span>}>Plan</TituloTarjeta>
      <div className="flex items-end justify-between gap-4 px-4 pb-3.5">
        <div>
          <p className="text-[16px] font-semibold text-foreground">Mensual 2×/semana</p>
          <p className="text-[12.5px] text-muted-foreground text-pretty">Desde mar 2025 · renueva el 12 oct con la tarjeta ···· 4242 · este mes: 0 de 8 clases</p>
        </div>
        <p className="shrink-0 text-[20px] font-semibold text-foreground">59 €<span className="text-[12px] font-normal text-muted-foreground">/mes</span></p>
      </div>
    </Tarjeta>
  );
}

export function ResumenFicha({ estrecho }: { estrecho?: boolean }) {
  return (
    <div className={cn('grid gap-4', !estrecho && 'grid-cols-[minmax(0,1fr)_340px]')}>
      <div className="space-y-4">
        <Plan />
        <Constancia />
        <Tarjeta>
          <TituloTarjeta icono={Clock} accion={<span className="flex items-center gap-1 text-[12.5px] font-medium text-foreground">Toda la historia <ChevronRight size={14} /></span>}>Lo último</TituloTarjeta>
          <LineaHistoria max={estrecho ? 3 : 5} />
        </Tarjeta>
      </div>
      <div className="space-y-4">
        <Seguimientos />
        <Notas />
        {!estrecho && <Etiquetas />}
        {!estrecho && <SobreElla />}
      </div>
    </div>
  );
}

export function DisenoFicha() {
  return (
    <>
      <p className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground"><ArrowLeft size={15} />Clientas · Activas</p>
      <div className="space-y-4">
        <CabeceraFicha />
        <SenalExplicada />
        <Pestanas />
        <ResumenFicha />
      </div>
    </>
  );
}

export function DisenoHistoria() {
  return (
    <div className="space-y-4">
      <CabeceraFicha />
      <Pestanas activa="Historia" />
      <div className="flex flex-wrap items-center gap-1.5">
        {['Todo', 'Contactos', 'Clases', 'Pagos', 'Avisos automáticos', 'Notas'].map((x, i) => (
          <span key={x} className={cn('rounded-full border px-3 py-1 text-[12.5px] font-medium', i === 0 ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-foreground')}>{x}</span>
        ))}
        <span className="ml-auto"><Boton peque icono={Send}>Apuntar contacto</Boton></span>
      </div>
      <Tarjeta className="pt-2">
        <LineaHistoria />
        <p className="border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground text-pretty">Junta lo que hoy está repartido en ocho sitios: mensajes de Mensajería, correos y avisos automáticos, campañas, reservas, cobros, notas y lo que apunta el equipo. Se lee; lo único que se escribe aquí es «Apuntar contacto».</p>
      </Tarjeta>
    </div>
  );
}
