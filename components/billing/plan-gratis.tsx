'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Founding Studio gratis en pantalla (reglas en lib/billing/plan-gratis.ts),
// como «Planes» de Bonsai (captura b-87-planes): el plan que tienes, el cálculo
// de lo que usas con su barra («te corresponde plan gratis») y los planes a los
// que se sube. Mejor que Bonsai: las dos cifras que cuentan, cada una con su
// límite, el 80 % marcado, desde cuándo y hasta cuándo, y qué cuenta y qué no.
//
// Todo sale de /api/billing/status, ya derivado: aquí no se cuenta nada.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { CalendarClock, Gift, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TZ_ESTUDIO } from '@/lib/utils';
import { AVISO_PCT, FRASE_PLAN_GRATIS, textoLimite, textoLimites, type EstadoGratisApi, type PlanQueToca } from '@/lib/billing/plan-gratis';
import { PLAN_INFO } from '@/lib/billing/entitlements';
import { DIAS_VINO_HACE_POCO } from '@/lib/clientas/estado';
import { Baldosa } from '@/components/dashboard/vivo';

const fechaLarga = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: TZ_ESTUDIO });


/** A qué se pasa, con su precio: «Founding Studio de pago (29 €/mes)» o «Estudio (59 €/mes)». */
function destino(p: PlanQueToca | null): string {
  return p === 'ESTUDIO'
    ? `Estudio (${PLAN_INFO.ESTUDIO.precioMes} €/mes)`
    : `Founding Studio de pago (${PLAN_INFO.BASE.precioMes} €/mes)`;
}

/** La frase que resume dónde está, por fase. */
export function mensajeGratis(g: EstadoGratisApi): { titulo: string; texto: string; tono: 'bien' | 'aviso' | 'problema' | 'neutro' } {
  switch (g.fase) {
    case 'DENTRO':
      return {
        titulo: 'Te corresponde Founding Studio: gratis',
        texto: `Todo Tentare, sin pagar nada. Si un día pasas de ${textoLimite('cobros')}, pasas a ${PLAN_INFO.BASE.precioMes} €/mes y sigues igual; con más de ${textoLimite('alumnas')}, a Estudio. Te avisamos antes y tienes ${g.margenDias} días para elegir.`,
        tono: 'bien',
      };
    case 'CERCA':
      return { titulo: 'Tu estudio está creciendo', texto: `Te acercas a ${textoLimites(g.motivos)}. Sigue siendo gratis; cuando lo pases tendrás ${g.margenDias} días para elegir.`, tono: 'aviso' };
    case 'MARGEN':
      return {
        titulo: `Te quedan ${g.diasRestantes} ${g.diasRestantes === 1 ? 'día' : 'días'} en Founding Studio gratis`,
        texto: `Has pasado de ${textoLimites(g.motivos)}. Tienes hasta el ${fechaLarga(g.cierraEl!)} para pasarte a ${destino(g.planQueToca)}${g.planQueToca === 'ESTUDIO' ? ', sin límite de alumnas' : ': todo igual, sin límite de cobros'}. Si antes vuelves a estar por debajo, no tienes que hacer nada.`,
        tono: 'problema',
      };
    case 'CERRADO':
      return {
        titulo: g.planQueToca === 'ESTUDIO' ? 'Tu estudio ha crecido: es hora de Estudio' : 'Tu estudio ha crecido',
        texto: `Pasaste de ${textoLimites(g.motivos)} y se acabaron los ${g.margenDias} días de margen. Elige ${destino(g.planQueToca)} para seguir usando el panel. La app de tus alumnas sigue funcionando: reservan y pagan como siempre.`,
        tono: 'problema',
      };
    case 'SIN_MEDIR':
      return { titulo: 'Estamos midiendo lo que usas', texto: 'Tarda un momento. Mientras tanto, todo sigue funcionando.', tono: 'neutro' };
  }
}

const COLOR_TONO = {
  bien: 'var(--success)',
  aviso: 'var(--warning)',
  problema: 'var(--destructive)',
  neutro: 'var(--muted-foreground)',
} as const;

/** El plan que tienes, con la frase del fundador. */
export function CabeceraPlanGratis({ className }: { className?: string }) {
  return (
    <section aria-label="Tu plan" className={cn('rounded-t-card border border-border bg-card p-5 shadow-t-card sm:p-6', className)}>
      <div className="flex items-start gap-4">
        <Baldosa tono="magenta" Icono={Gift} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Plan actual</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[24px] font-extrabold leading-tight tracking-tight text-foreground">
            Founding Studio
            <span className="rounded-full px-2.5 py-0.5 text-[12.5px] font-bold" style={{ color: 'var(--success)', backgroundColor: 'color-mix(in srgb, var(--success) 12%, var(--card))' }}>Gratis</span>
          </p>
          <p className="mt-2 text-[15px] font-semibold text-foreground text-pretty">{FRASE_PLAN_GRATIS}</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground text-pretty">
            Todo Tentare, sin tarjeta y sin pagar nada, mientras tu estudio tenga hasta 150 alumnas activas y 30 cobros al mes.
          </p>
        </div>
      </div>
    </section>
  );
}

function Medidor({ Icono, titulo, valor, limite, pie, href }: {
  Icono: typeof Users; titulo: string; valor: number; limite: number; pie: React.ReactNode; href?: string;
}) {
  const pct = Math.min(100, Math.round((valor / limite) * 100));
  const tono = valor > limite ? 'problema' : valor >= Math.ceil(limite * AVISO_PCT) ? 'aviso' : 'bien';
  const cifra = <span className="tabular-nums">{valor} <span className="font-medium text-muted-foreground">de {limite}</span></span>;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
          <Icono size={15} aria-hidden className="text-muted-foreground" />{titulo}
        </span>
        {href
          ? <Link href={href} className="text-[15px] font-bold text-foreground underline-offset-2 hover:underline">{cifra}</Link>
          : <span className="text-[15px] font-bold text-foreground">{cifra}</span>}
      </div>
      <div
        className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={titulo}
        aria-valuenow={valor}
        aria-valuemin={0}
        aria-valuemax={limite}
      >
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(pct, valor > 0 ? 3 : 0)}%`, backgroundColor: COLOR_TONO[tono] }} />
        {/* El 80 %: desde ahí se avisa. */}
        <span aria-hidden className="absolute inset-y-0 w-px bg-foreground/25" style={{ left: `${AVISO_PCT * 100}%` }} />
      </div>
      <p className="mt-1.5 text-[12px] text-muted-foreground text-pretty">{pie}</p>
    </div>
  );
}

/** Lo que usas frente a los dos límites, y qué te corresponde. */
export function UsoPlanGratis({ gratis, className }: { gratis: EstadoGratisApi; className?: string }) {
  const m = mensajeGratis(gratis);
  const u = gratis.uso;
  return (
    <section aria-label="Lo que usas" className={cn('rounded-t-card border border-border bg-card p-5 shadow-t-card sm:p-6', className)}>
      <h2 className="text-[16px] font-semibold text-foreground">Lo que usas</h2>
      <p className="text-[12.5px] text-muted-foreground">Se mide solo, varias veces al día. Si tienes más de un estudio gratis, se suman.</p>

      {u ? (
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Medidor
            Icono={Users}
            titulo="Alumnas activas"
            valor={u.alumnasActivas}
            limite={gratis.limites.alumnas}
            href="/clientas?estado=ACTIVA"
            pie={`Las que pueden reservar ahora o han venido en los últimos ${DIAS_VINO_HACE_POCO} días. Las fichas antiguas no cuentan.`}
          />
          <Medidor
            Icono={TrendingUp}
            titulo="Cobros en los últimos 30 días"
            valor={u.cobros30Dias}
            limite={gratis.limites.cobrosMes}
            pie="Cuenta cada cobro con dinero ingresado, por el día en que se cobró; lo devuelto no."
          />
        </div>
      ) : null}

      <div
        role={gratis.fase === 'MARGEN' || gratis.fase === 'CERRADO' ? 'alert' : 'status'}
        className="mt-5 flex items-start gap-3 rounded-[12px] px-4 py-3"
        style={{ backgroundColor: `color-mix(in srgb, ${COLOR_TONO[m.tono]} 9%, var(--card))` }}
      >
        <span className="mt-0.5 shrink-0" style={{ color: COLOR_TONO[m.tono] }} aria-hidden>
          {gratis.fase === 'MARGEN' || gratis.fase === 'CERRADO' ? <CalendarClock size={18} /> : <TrendingUp size={18} />}
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-bold text-foreground">{m.titulo}</span>
          <span className="block text-[13px] text-muted-foreground text-pretty">{m.texto}</span>
        </span>
      </div>
    </section>
  );
}
