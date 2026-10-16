'use client';

// TEMPORAL — maqueta del rediseño de /interno para enseñar al fundador. No se commitea.
// Datos inventados (estudios ficticios): nada real.
import type { ReactNode } from 'react';
import {
  AlertTriangle, ArrowRight, Building2, ChevronDown, CreditCard, FileCheck2, Flag, Home, LifeBuoy, Megaphone,
  Network, Phone, Route, ScrollText, Search, Smartphone, Smile, Sprout, TrendingDown, TrendingUp, Users, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Item = { icono: typeof Home; etiqueta: string; n?: number; activo?: boolean };
const GRUPOS: { titulo: string; items: Item[] }[] = [
  { titulo: '', items: [{ icono: Home, etiqueta: 'Hoy', activo: true, n: 6 }] },
  { titulo: 'Clientes', items: [
    { icono: Building2, etiqueta: 'Estudios' },
    { icono: CreditCard, etiqueta: 'Cobros a estudios', n: 1 },
    { icono: Smartphone, etiqueta: 'Apps en la App Store', n: 1 },
    { icono: Route, etiqueta: 'Visita guiada' },
    { icono: FileCheck2, etiqueta: 'Veri*Factu' },
  ] },
  { titulo: 'Captar', items: [
    { icono: Phone, etiqueta: 'Llamadas pedidas', n: 2 },
    { icono: Sprout, etiqueta: 'Altas y prospectos' },
    { icono: Zap, etiqueta: 'Sales OS' },
  ] },
  { titulo: 'Moderar', items: [
    { icono: Flag, etiqueta: 'Denuncias', n: 1 },
    { icono: Network, etiqueta: 'Network' },
  ] },
  { titulo: 'Contenido', items: [
    { icono: Megaphone, etiqueta: 'Novedades' },
    { icono: LifeBuoy, etiqueta: 'Ayuda' },
    { icono: Smile, etiqueta: 'Tenti' },
  ] },
  { titulo: 'Seguridad', items: [
    { icono: Users, etiqueta: 'Equipo interno' },
    { icono: ScrollText, etiqueta: 'Registro de cambios' },
  ] },
];

function Lateral({ movil }: { movil?: boolean }) {
  if (movil) return null;
  return (
    <aside className="flex w-[244px] shrink-0 flex-col bg-[#14161c] text-slate-300">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-[15px] font-bold text-[#14161c]">T</span>
        <div className="leading-tight">
          <p className="text-[14px] font-semibold text-white">Tentare</p>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-amber-300/90">Zona interna</p>
        </div>
      </div>
      <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-[13px] text-slate-400">
        <Search size={14} /> Buscar un estudio…<span className="ml-auto rounded bg-white/10 px-1.5 text-[11px]">⌘K</span>
      </div>
      <nav className="flex-1 space-y-4 overflow-hidden px-3">
        {GRUPOS.map(g => (
          <div key={g.titulo || 'inicio'}>
            {g.titulo && <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{g.titulo}</p>}
            {g.items.map(it => (
              <span key={it.etiqueta}
                className={cn('flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13.5px]',
                  it.activo ? 'bg-white/10 font-medium text-white' : 'text-slate-300')}>
                <it.icono size={16} className={it.activo ? 'text-white' : 'text-slate-500'} />
                {it.etiqueta}
                {it.n ? <span className={cn('ml-auto rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                  it.activo ? 'bg-white text-[#14161c]' : 'bg-amber-400/15 text-amber-300')}>{it.n}</span> : null}
              </span>
            ))}
          </div>
        ))}
      </nav>
      <div className="m-3 flex items-center gap-2.5 rounded-lg px-2 py-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-700 text-[12px] font-semibold text-white">MR</span>
        <div className="leading-tight">
          <p className="text-[13px] font-medium text-white">Marcos</p>
          <p className="text-[11.5px] text-slate-500">Fundador · todos los permisos</p>
        </div>
      </div>
    </aside>
  );
}

type Tarea = { tono: 'rojo' | 'ambar' | 'gris'; icono: typeof Home; titulo: string; porque: string; boton: string };
const TAREAS: Tarea[] = [
  { tono: 'rojo', icono: CreditCard, titulo: 'Estudio Aurora no ha pagado octubre',
    porque: 'Stripe rechazó la tarjeta hace 3 días. Si no paga en 4 días más, se le cierra el panel.', boton: 'Ver su cobro' },
  { tono: 'rojo', icono: Flag, titulo: '1 denuncia sin revisar en la app de un estudio',
    porque: 'Apple exige responder en 24 h. Llegó hace 9 h.', boton: 'Revisarla' },
  { tono: 'ambar', icono: Phone, titulo: '2 estudios nuevos pidieron que les llames',
    porque: 'Se dieron de alta ayer y eligieron «Prefiero que me llamen». Los que reciben la llamada el primer día se quedan el doble.', boton: 'Ver teléfonos' },
  { tono: 'ambar', icono: Smartphone, titulo: 'Pilates Mar pidió su app en la App Store',
    porque: 'Ya se le ha puesto el nombre y se está compilando sola. Te toca probarla en TestFlight y enviarla a revisión.', boton: 'Abrir la cola' },
  { tono: 'gris', icono: Sprout, titulo: '3 altas se quedaron a medias',
    porque: 'Crearon cuenta pero no su estudio. La más antigua, hace 2 días.', boton: 'Ver quiénes' },
  { tono: 'gris', icono: Building2, titulo: '2 estudios de pago llevan 7 días sin reservas',
    porque: 'Antes tenían 40 por semana. Suele ser que se fueron a otro programa o que algo se rompió.', boton: 'Ver cuáles' },
];

const TONO = {
  rojo: 'bg-red-50 text-red-600',
  ambar: 'bg-amber-50 text-amber-600',
  gris: 'bg-slate-100 text-slate-500',
} as const;

function Cifra({ titulo, valor, cambio, sube, fuente }: { titulo: string; valor: string; cambio: string; sube: boolean; fuente: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5">
      <p className="text-[12.5px] text-slate-500">{titulo}</p>
      <p className="mt-1 text-[26px] font-semibold tabular-nums leading-none tracking-tight text-slate-900">{valor}</p>
      <p className={cn('mt-2 flex items-center gap-1 text-[12px] font-medium', sube ? 'text-emerald-600' : 'text-red-600')}>
        {sube ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{cambio}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">Fuente: {fuente}</p>
    </div>
  );
}

const ESTUDIOS = [
  ['Estudio Aurora', 'Estudio · 59 €', 'Impago 3 días', 'rojo', '212 reservas / 30 d'],
  ['Pilates Norte', 'Founding · 29 €', 'Sin reservas 7 días', 'ambar', '0 esta semana (antes 41)'],
  ['Flow Barcelona', 'Cadena · 2 sedes', 'Bien', 'verde', '486 reservas / 30 d'],
  ['Core & Barre', 'Gratis', 'Cerca del límite', 'ambar', '231 de 250 reservas'],
] as const;

function Contenido({ movil }: { movil?: boolean }) {
  return (
    <main className={cn('min-w-0 flex-1 bg-[#f6f6f4]', movil ? 'px-4 py-5' : 'px-10 py-8')}>
      {movil && (
        <div className="-mx-4 -mt-5 mb-5 flex items-center gap-2.5 bg-[#14161c] px-4 py-3 text-white">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-white text-[13px] font-bold text-[#14161c]">T</span>
          <span className="text-[13px] font-semibold">Tentare <span className="text-amber-300/90">· Zona interna</span></span>
          <span className="ml-auto flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[12.5px]">Menú <ChevronDown size={14} /></span>
        </div>
      )}
      <p className="text-[13px] text-slate-500">Jueves 16 de octubre</p>
      <h1 className={cn('font-semibold tracking-tight text-slate-900', movil ? 'text-[22px]' : 'text-[28px]')}>
        6 cosas te esperan hoy
      </h1>
      <p className="mt-1 text-[14px] text-slate-500">Ordenadas por lo que cuesta dejarlas: primero dinero y Apple, luego clientes nuevos.</p>

      <div className={cn('mt-6 grid gap-6', !movil && 'grid-cols-[minmax(0,1fr)_340px]')}>
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          {TAREAS.map((t, i) => (
            <div key={t.titulo} className={cn('flex items-start gap-3.5 px-5 py-4', i > 0 && 'border-t border-slate-100')}>
              <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl', TONO[t.tono])}><t.icono size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold text-slate-900">{t.titulo}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-slate-500 text-pretty">{t.porque}</p>
                {movil && <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-slate-900">{t.boton} <ArrowRight size={14} /></span>}
              </div>
              {!movil && (
                <span className="shrink-0 self-center rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-800">
                  {t.boton}
                </span>
              )}
            </div>
          ))}
        </section>

        <div className="space-y-6">
          <section>
            <h2 className="mb-2.5 text-[13px] font-semibold text-slate-900">Cómo va el negocio</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <Cifra titulo="Lo que cobramos al mes" valor="1.247 €" cambio="+118 € este mes" sube fuente="Stripe" />
              <Cifra titulo="Estudios que pagan" valor="31" cambio="+3 este mes" sube fuente="Stripe" />
              <Cifra titulo="Estudios usándolo" valor="58" cambio="+6 este mes" sube fuente="reservas 30 d" />
              <Cifra titulo="Reservas (7 días)" valor="4.912" cambio="−2 % que la anterior" sube={false} fuente="reservas" />
            </div>
          </section>
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-2.5 flex items-baseline">
          <h2 className="text-[13px] font-semibold text-slate-900">Estudios que miraría hoy</h2>
          <span className="ml-auto text-[13px] font-medium text-slate-500">Todos los estudios →</span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          {ESTUDIOS.map(([n, plan, estado, tono, uso], i) => (
            <div key={n} className={cn('flex items-center gap-3 px-5 py-3 text-[13.5px]', i > 0 && 'border-t border-slate-100')}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-[12px] font-semibold text-slate-600">{n.slice(0, 2)}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{n}</p>
                <p className="text-[12.5px] text-slate-500">{plan}{movil ? ` · ${uso}` : ''}</p>
              </div>
              {!movil && <span className="w-56 text-[13px] tabular-nums text-slate-500">{uso}</span>}
              <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-medium',
                tono === 'rojo' ? 'bg-red-50 text-red-600' : tono === 'ambar' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>{estado}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-6 flex items-center gap-1.5 text-[12.5px] text-slate-400">
        <AlertTriangle size={13} /> Cada cifra dice de dónde sale. Si una fuente no contesta, sale «—» con el motivo, nunca un 0.
      </p>
    </main>
  );
}

function Marco({ ancho, alto, children, titulo }: { ancho: number; alto: number; children: ReactNode; titulo: string }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-slate-500">{titulo}</p>
      <div className="flex overflow-hidden rounded-2xl border border-slate-300 shadow-xl" style={{ width: ancho, height: alto }}>{children}</div>
    </div>
  );
}

export default function MaquetaInterno() {
  return (
    <div className="min-h-screen bg-slate-200 p-10">
      <div className="flex items-start gap-10">
        <Marco ancho={1440} alto={940} titulo="Escritorio · Hoy"><Lateral /><Contenido /></Marco>
        <Marco ancho={390} alto={940} titulo="Móvil"><Contenido movil /></Marco>
      </div>
    </div>
  );
}
