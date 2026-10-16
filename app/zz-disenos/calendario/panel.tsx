'use client';

// TEMPORAL — maquetas del panel de la clase. No se commitea.
// Todo lo que hace hoy el panel sigue aquí (inventario del 1-oct-2026); lo que
// cambia es el orden: lo principal del momento arriba, el resto en ⋯.
import type { ReactNode } from 'react';
import {
  Ban, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, HeartPulse, Mic, MoreHorizontal,
  Pencil, QrCode, RefreshCw, Search, Sparkles, Trash2, UserCheck, UserMinus, UserPlus, UserX, Wrench, X, CalendarPlus, Pin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EN_CURSO, PASADA, TIPOS, type Alumna } from './datos';
import { Avatar, BotonC, Nota } from './comun';

// ─── Piezas comunes ──────────────────────────────────────────────────────────
function Cabeza({ tipo, linea1, linea2, serie, estado, extra }: {
  tipo: keyof typeof TIPOS; linea1: string; linea2: string; serie?: string; estado: ReactNode; extra?: ReactNode;
}) {
  return (
    <div className="border-b border-border px-5 pt-4 pb-3.5">
      <div className="flex items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: TIPOS[tipo].color }} aria-hidden />
        <h2 className="text-[19px] font-semibold text-foreground">{TIPOS[tipo].nombre}</h2>
        <span className="ml-auto flex items-center gap-0.5 text-muted-foreground">
          <span className="flex size-8 items-center justify-center rounded-lg" title="Clase anterior"><ChevronLeft size={17} /></span>
          <span className="flex size-8 items-center justify-center rounded-lg" title="Clase siguiente"><ChevronRight size={17} /></span>
          <span className="flex size-8 items-center justify-center rounded-lg" title="Más acciones"><MoreHorizontal size={17} /></span>
          <span className="flex size-8 items-center justify-center rounded-lg" title="Cerrar"><X size={17} /></span>
        </span>
      </div>
      <p className="mt-1 text-[14px] font-medium text-foreground">{linea1}</p>
      <p className="text-[13px] text-muted-foreground">{linea2}</p>
      {serie && <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted-foreground"><RefreshCw size={12} aria-hidden />{serie}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">{estado}</div>
      {extra}
    </div>
  );
}

export function Pastilla({ children, tono }: { children: ReactNode; tono: 'exito' | 'aviso' | 'peligro' | 'neutro' }) {
  const t = {
    exito: 'bg-success/12 text-success',
    aviso: 'bg-warning/15 text-foreground',
    peligro: 'bg-destructive/10 text-destructive',
    neutro: 'bg-muted text-foreground',
  }[tono];
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold', t)}>{children}</span>;
}

function Etiqueta({ texto, tono = 'muted' }: Alumna['etiquetas'][number]) {
  const t = {
    info: 'bg-info/12 text-info',
    warning: 'bg-warning/15 text-foreground',
    brand: 'bg-brand/10 text-brand',
    muted: 'bg-muted text-muted-foreground',
  }[tono];
  return <span className={cn('rounded-md px-1.5 py-0.5 text-[11.5px] font-medium', t)}>{texto}</span>;
}

function Pestanas({ activa }: { activa: 'Alumnas' | 'Plazas' | 'Sustituciones' }) {
  return (
    <div className="flex gap-1 border-b border-border px-4">
      {(['Alumnas', 'Plazas', 'Sustituciones'] as const).map(p => (
        <span key={p} className={cn('relative px-2.5 py-2.5 text-[13.5px] font-medium', p === activa ? 'text-foreground' : 'text-muted-foreground')}>
          {p}{p === 'Alumnas' && <span className="ml-1 tabular-nums text-muted-foreground">6</span>}
          {p === activa && <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-foreground" />}
        </span>
      ))}
    </div>
  );
}

function FilaAlumna({ a, i, accion, menu = true }: { a: Alumna; i: number; accion: ReactNode; menu?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <Avatar ini={a.ini} tono={i} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[14px] font-medium text-foreground">
          <span className="truncate">{a.nombre}</span>
          {a.salud && <HeartPulse size={14} className="shrink-0 text-destructive" aria-label="Tiene notas de salud" />}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground text-pretty">
          {[a.maquina, ...a.etiquetas.map(e => e.texto)].filter(Boolean).map((t, k, todos) => {
            const e = a.etiquetas.find(x => x.texto === t);
            return (
              <span key={t}>
                <span className={cn(e?.tono === 'info' && 'font-medium text-info', e?.tono === 'warning' && 'font-medium text-warning', e?.tono === 'brand' && 'text-foreground')}>{t}</span>
                {k < todos.length - 1 && ' · '}
              </span>
            );
          })}
        </p>
      </div>
      {accion}
      {menu && <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground" title="Más: no vino, repetir, hacer fija, nota de voz, quitar"><MoreHorizontal size={16} /></span>}
    </li>
  );
}

function BotonCheckin({ hecho }: { hecho?: boolean }) {
  return hecho ? (
    <span className="inline-flex min-h-11 min-w-[92px] items-center justify-center gap-1.5 rounded-xl bg-success/15 px-3 text-[13.5px] font-semibold text-success">
      <Check size={16} strokeWidth={2.5} aria-hidden />Vino
    </span>
  ) : (
    <span className="inline-flex min-h-11 min-w-[92px] items-center justify-center rounded-xl border border-border bg-card px-3 text-[13.5px] font-semibold text-foreground shadow-xs">
      Check-in
    </span>
  );
}

function Caja({ titulo, children, className }: { titulo?: string; children: ReactNode; className?: string }) {
  return (
    <aside className={cn('flex w-[400px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm', className)}>
      {titulo && <p className="border-b border-border px-5 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>}
      {children}
    </aside>
  );
}

// ─── La clase en curso: el mostrador ─────────────────────────────────────────
export function PanelEnCurso() {
  const llegaron = EN_CURSO.filter(a => a.llego).length;
  return (
    <aside className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <Cabeza
        tipo="reformer"
        linea1="Jueves 1 oct · 10:30 – 11:20"
        linea2="Sala Reformer · Marta Ruiz"
        serie="Se repite cada jueves · hasta el 31 oct"
        estado={<>
          <Pastilla tono="exito"><span className="size-1.5 rounded-full bg-success" aria-hidden />En curso · acaba en 40 min</Pastilla>
          <span className="ml-auto text-[13px] tabular-nums text-muted-foreground"><b className="text-foreground">{llegaron} de 6</b> han venido</span>
        </>}
      />
      <Pestanas activa="Alumnas" />
      <div className="space-y-2 px-5 pt-3">
        <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-[13px] text-foreground">
          <HeartPulse size={15} className="shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0 flex-1"><b>Adaptaciones:</b> 1 alumna con notas de salud</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-foreground"><Sparkles size={13} aria-hidden />Preparar con IA</span>
        </div>
        <div className="flex gap-2">
          <span className="flex min-h-10 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[13.5px] text-muted-foreground"><UserPlus size={15} aria-hidden />Añadir alumna…</span>
          <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground" title="Escanear el QR de una alumna"><QrCode size={16} /></span>
        </div>
      </div>
      <ul className="divide-y divide-border pt-1">
        {EN_CURSO.map((a, i) => <FilaAlumna key={a.nombre} a={a} i={i} accion={<BotonCheckin hecho={a.llego} />} />)}
      </ul>
      <p className="border-t border-border px-5 py-2.5 text-[12.5px] text-muted-foreground">Lista de espera vacía · 2 plazas fijas en pausa esta semana</p>
    </aside>
  );
}

// ─── Terminada: pasar lista marcando solo a quien no vino ────────────────────
export function PanelPasarLista() {
  const noVinieron = PASADA.filter(a => a.noVino).length;
  return (
    <aside className="flex w-[400px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <Cabeza
        tipo="mat"
        linea1="Jueves 1 oct · 09:00 – 09:50"
        linea2="Sala Mat · Irene Sanz"
        estado={<Pastilla tono="aviso">Terminada · falta pasar lista</Pastilla>}
      />
      <p className="px-5 pt-3 text-[13px] text-muted-foreground text-pretty">
        Marca solo a quien <b className="text-foreground">no vino</b>. Al guardar, las demás quedan como que vinieron, y la que faltó cuenta como ausencia (y su cargo, si lo tienes puesto).
      </p>
      <ul className="divide-y divide-border pt-1">
        {PASADA.map((a, i) => (
          <FilaAlumna key={a.nombre} a={a} i={i + 2} menu={false} accion={
            <span className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold',
              a.noVino ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-border bg-card text-muted-foreground',
            )}>
              <UserX size={15} aria-hidden />No vino
            </span>
          } />
        ))}
      </ul>
      <div className="flex items-center gap-3 border-t border-border bg-background/60 px-5 py-3">
        <BotonC primario grande className="flex-1">Guardar · {PASADA.length - noVinieron} vinieron, {noVinieron} no</BotonC>
      </div>
      <p className="px-5 pb-3 text-center text-[12.5px] text-muted-foreground">¿No vino nadie? <span className="font-medium text-foreground underline underline-offset-2">Márcalo así</span></p>
    </aside>
  );
}

// ─── Sin cubrir: el motor de sustituciones, desde la propia clase ────────────
export function PanelSinCubrir() {
  return (
    <aside className="relative flex w-[400px] flex-col rounded-xl border border-border bg-card shadow-sm">
      <Cabeza
        tipo="reformer"
        linea1="Viernes 2 oct · 18:00 – 18:50"
        linea2="Sala Reformer · 5 apuntadas de 6 · 3 fijas"
        serie="Se repite cada viernes · hasta el 19 dic"
        estado={<Pastilla tono="peligro"><UserX size={14} aria-hidden />Sin cubrir</Pastilla>}
        extra={<p className="mt-2 text-[13.5px] text-foreground text-pretty">La da <b>Lucía Gómez</b>, que está de vacaciones del 2 al 9 de octubre.</p>}
      />
      <div className="space-y-3 px-5 py-4">
        <div className="relative rounded-xl border border-border p-4">
          <span className="absolute -right-2.5 -top-2.5"><Nota n={3} /></span>
          <BotonC primario grande className="w-full"><Search size={16} aria-hidden />Buscar sustituta</BotonC>
          <p className="mt-2.5 text-[13px] text-muted-foreground text-pretty">
            Avisamos por orden a quien mejor encaja: <b className="text-foreground">Irene Sanz</b> (da Barre a las 18:30 en la otra sala, libre a esta hora), Marta Ruiz y Cloe. La primera que acepte se queda la clase.
          </p>
          <p className="mt-2 text-[12.5px] text-muted-foreground">Tu modo es <b className="text-foreground">asistido</b>: antes de avisar a nadie, te pedimos el visto bueno.</p>
        </div>
        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="text-[13.5px] font-medium text-foreground">¿Ya sabes quién la da?</p>
          <div className="mt-2 flex gap-2">
            <span className="flex min-h-10 flex-1 items-center justify-between rounded-lg border border-border bg-background px-3 text-[13.5px] text-foreground">Irene Sanz<ChevronDown size={15} className="text-muted-foreground" /></span>
            <BotonC>Asignar y avisarla</BotonC>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Menús ⋯ ─────────────────────────────────────────────────────────────────
function Opcion({ icono: I, children, peligro, sub, nota }: { icono: typeof Pencil; children: ReactNode; peligro?: boolean; sub?: boolean; nota?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg px-2.5 py-2', sub && 'pl-8')}>
      <I size={15} className={cn('mt-0.5 shrink-0', peligro ? 'text-destructive' : 'text-muted-foreground')} />
      <div className="min-w-0">
        <p className={cn('text-[13.5px]', peligro ? 'text-destructive' : 'text-foreground')}>{children}</p>
        {nota && <p className="text-[12px] text-muted-foreground text-pretty">{nota}</p>}
      </div>
    </div>
  );
}

export function MenuMas({ pasada }: { pasada?: boolean }) {
  return (
    <div className="w-[300px] rounded-xl border border-border bg-card p-1.5 shadow-lg">
      <p className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{pasada ? '⋯ de una clase que ya se dio' : '⋯ de una clase futura'}</p>
      {pasada ? (
        <>
          <Opcion icono={Copy}>Duplicar</Opcion>
          <Opcion icono={Wrench}>Anotar incidencia de sala</Opcion>
          <div className="my-1 border-t border-border" />
          <p className="px-2.5 py-2 text-[12.5px] text-muted-foreground text-pretty">Una clase que ya se dio no se cancela ni se borra: su asistencia es la historia de tus alumnas.</p>
        </>
      ) : (
        <>
          <Opcion icono={Pencil}>Editar esta clase</Opcion>
          <Opcion icono={Copy}>Duplicar</Opcion>
          <Opcion icono={UserCheck}>Buscar sustituta</Opcion>
          <Opcion icono={Wrench}>Anotar incidencia de sala</Opcion>
          <div className="my-1 border-t border-border" />
          <p className="px-2.5 pt-1 pb-0.5 text-[11.5px] font-semibold text-muted-foreground">La serie (se repite cada viernes)</p>
          <Opcion icono={Copy} sub nota="Lo que queda de la serie, desde su última clase">Duplicar serie</Opcion>
          <Opcion icono={RefreshCw} sub nota="La misma clase, más semanas">Renovar serie</Opcion>
          <Opcion icono={Ban} sub peligro>Cancelar esta y las siguientes</Opcion>
          <div className="my-1 border-t border-border" />
          <Opcion icono={Ban} peligro nota="Avisa a las 5 apuntadas y les devuelve la sesión">Cancelar esta clase</Opcion>
          <Opcion icono={Trash2} peligro nota="Solo si la creaste por error: no avisa a nadie">Eliminar</Opcion>
        </>
      )}
    </div>
  );
}

export function MenuAlumna() {
  return (
    <div className="w-[300px] rounded-xl border border-border bg-card p-1.5 shadow-lg">
      <p className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">⋯ de una alumna · Carmen López</p>
      <Opcion icono={UserX}>Marcar que no vino</Opcion>
      <Opcion icono={CalendarPlus} nota="La misma clase, la semana que viene">Apuntarla la semana que viene</Opcion>
      <Opcion icono={Pin} nota="Que venga cada semana a este hueco, sin apuntarla clase a clase">Hacerle plaza fija</Opcion>
      <Opcion icono={Mic} nota="Piloto">Nota de voz</Opcion>
      <div className="my-1 border-t border-border" />
      <Opcion icono={UserMinus} peligro nota="Se le devuelve la sesión si toca">Quitar de la clase</Opcion>
    </div>
  );
}

// ─── Añadir a la clase: alumna, o reserva de una plataforma ──────────────────
export function PanelAnadir() {
  return (
    <Caja titulo="Añadir a la clase · Reformer, jueves 18:00">
      <div className="space-y-3 px-5 py-4">
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1 text-[12.5px] font-medium">
          {['Alumna', 'ClassPass', 'Urban Sports Club'].map(o => <span key={o} className={cn('rounded-md px-2.5 py-1', o === 'Alumna' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground')}>{o}</span>)}
        </div>
        <div className="flex min-h-10 items-center gap-2 rounded-lg border border-foreground/40 bg-background px-3 text-[14px] text-foreground"><Search size={15} className="text-muted-foreground" />Raq<span className="h-4 w-px bg-foreground" /></div>
        <ul className="space-y-1">
          <li className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <Avatar ini="RM" tono={2} />
            <div className="min-w-0 flex-1"><p className="text-[14px] font-medium text-foreground">Raquel Moreno</p><p className="text-[12px] text-muted-foreground">Bono 10 clases · le quedan 3</p></div>
            <BotonC peque>Añadir</BotonC>
          </li>
          <li className="rounded-lg border border-border px-2 py-2">
            <div className="flex items-center gap-3">
              <Avatar ini="RS" tono={4} />
              <div className="min-w-0 flex-1"><p className="text-[14px] font-medium text-foreground">Raquel Sanz</p><p className="text-[12px] text-warning">No tiene bono ni cuota que valga para esta clase</p></div>
            </div>
            <div className="mt-3 space-y-2 pl-12">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] text-muted-foreground">Paga en</span>
                <span className="inline-flex rounded-lg bg-muted p-0.5 text-[12px] font-medium">
                  {['Efectivo', 'Tarjeta', 'Bizum'].map(m => <span key={m} className={cn('rounded-md px-2 py-1', m === 'Efectivo' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground')}>{m}</span>)}
                </span>
              </div>
              <BotonC peque primario className="w-full">Cobrar 15 € y añadirla</BotonC>
              <div className="grid grid-cols-2 gap-1.5"><BotonC peque>Venderle un bono</BotonC><BotonC peque>Cortesía, sin cargo</BotonC></div>
            </div>
          </li>
        </ul>
        <label className="flex items-center gap-2 text-[13px] text-foreground"><span className="flex size-4 items-center justify-center rounded bg-brand text-brand-foreground"><Check size={11} strokeWidth={3} /></span>Avisarla de la reserva</label>
        <p className="text-[12.5px] text-muted-foreground">Si la clase está llena, va a la lista de espera y se lo decimos antes de añadirla.</p>
      </div>
    </Caja>
  );
}

// ─── Plazas: el mapa de la sala ──────────────────────────────────────────────
export function PanelPlazas() {
  const plazas = [
    { n: 'Reformer 1', q: 'María G.', ok: true }, { n: 'Reformer 2', q: 'Laura M.', ok: true }, { n: 'Reformer 3', q: 'Carmen L.' },
    { n: 'Reformer 4', q: 'Paula R.', ok: true }, { n: 'Reformer 5', q: 'Elena N.' }, { n: 'Reformer 6 · ClassPass', q: 'Sara T.', ok: true },
  ];
  return (
    <Caja>
      <div className="border-b border-border px-5 pt-4 pb-3">
        <p className="text-[15px] font-semibold text-foreground">Reformer · jueves 10:30</p>
        <p className="text-[12.5px] text-muted-foreground">Sala Reformer · 6 máquinas</p>
      </div>
      <Pestanas activa="Plazas" />
      <div className="px-5 py-4">
        <p className="mb-2 text-center text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Frente · instructora</p>
        <div className="grid grid-cols-3 gap-2">
          {plazas.map(p => (
            <div key={p.n} className={cn('rounded-lg border px-2.5 py-2', p.ok ? 'border-success/40 bg-success/8' : 'border-border bg-background')}>
              <p className="text-[11.5px] text-muted-foreground">{p.n}</p>
              <p className="truncate text-[13px] font-medium text-foreground">{p.q}</p>
              <p className={cn('mt-0.5 text-[11.5px] font-semibold', p.ok ? 'text-success' : 'text-muted-foreground')}>{p.ok ? '✓ Ha venido' : 'Check-in'}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-muted-foreground">Toca una máquina para hacer el check-in, cambiar a la alumna de máquina o dejarla libre.</p>
      </div>
    </Caja>
  );
}

// ─── Sustituciones: el historial de la clase ─────────────────────────────────
export function PanelSustituciones() {
  const eventos: [string, string, string, string?][] = [
    ['mar 6 · 08:12', 'Lucía Gómez avisó que no puede', 'Motivo: enferma'],
    ['08:13', 'Avisada Irene Sanz', 'Por correo y WhatsApp', 'No contestó en 45 min'],
    ['08:58', 'Avisada Marta Ruiz', 'Por correo y WhatsApp'],
    ['09:40', 'Marta Ruiz aceptó', 'Clase cubierta'],
  ];
  return (
    <Caja>
      <div className="border-b border-border px-5 pt-4 pb-3">
        <p className="text-[15px] font-semibold text-foreground">Reformer · martes 19:15</p>
        <p className="text-[12.5px] text-muted-foreground">Sala Reformer · ahora la da Marta Ruiz</p>
      </div>
      <Pestanas activa="Sustituciones" />
      <ol className="space-y-3 px-5 py-4">
        {eventos.map(([cuando, que, detalle, extra], i) => (
          <li key={i} className="flex gap-3">
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', i === eventos.length - 1 ? 'bg-success' : 'bg-foreground/35')} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-foreground">{que}</p>
              <p className="text-[12.5px] text-muted-foreground">{cuando} · {detalle}{extra ? ` · ${extra}` : ''}</p>
            </div>
          </li>
        ))}
      </ol>
    </Caja>
  );
}

// ─── Adaptaciones y «Preparar clase con IA» ──────────────────────────────────
export function PanelIA() {
  return (
    <Caja titulo="Adaptaciones · Reformer, jueves 10:30">
      <div className="space-y-3 px-5 py-4">
        <div className="rounded-lg bg-warning/10 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground"><HeartPulse size={14} className="text-destructive" />Laura Martín</p>
          <p className="mt-0.5 text-[12.5px] text-foreground text-pretty">Hernia discal L4-L5: evitar flexión de tronco con carga.</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground"><Sparkles size={14} />Preparación sugerida</p>
          <p className="mt-1 text-[12.5px] text-foreground text-pretty">Clase sin cambios para el grupo; a Laura, variantes en neutro.</p>
          <p className="mt-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Evitar</p>
          <p className="text-[12.5px] text-foreground">· Roll up con muelles pesados · Teaser completo</p>
          <p className="mt-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Variantes</p>
          <p className="text-[12.5px] text-foreground">· Footwork con columna neutra · Bridging corto</p>
          <p className="mt-2 text-[11.5px] italic text-muted-foreground">Sugerencia de IA: revísala antes de aplicarla. No es consejo médico.</p>
        </div>
      </div>
    </Caja>
  );
}

