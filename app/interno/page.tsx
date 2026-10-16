'use client';

// «Hoy»: lo primero que se ve al entrar en /interno (antes «Resumen», una
// pared de KPIs). Rediseño aprobado por el fundador el 16-oct-2026.
//
// Las reglas de la pantalla, que no cambian con el diseño:
//   · **Ningún número sin procedencia.** Cada cifra dice de dónde sale; si su
//     fuente falla o no tienes permiso, «—» con el motivo, nunca 0. Un panel
//     que enseña un MRR inventado es peor que no tener panel: decides con él.
//   · **Ninguna tarea inventada.** Cada fila sale de una pantalla que ya existe
//     y lleva a ella. Si una fuente no se pudo leer, «no hay nada» se dice solo
//     de lo que se ha podido mirar.
// La lógica (qué es tarea, en qué orden, qué texto) vive en lib/interno/hoy.ts.

import { useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, Building2, CheckCircle2, CreditCard, Flag, Phone, Scale, Smartphone, Sprout,
  TrendingDown, TrendingUp, type LucideIcon,
} from 'lucide-react';
import type { Cifra, EstudioAMirar, Tarea, TipoTarea } from '@/lib/interno/hoy';
import { tienePermiso } from '@/lib/interno/permisos';
import { useHoyInterno, useSesionInterna } from './layout';

const ICONO: Record<TipoTarea, LucideIcon> = {
  impago: CreditCard, descuadre: Scale, denuncias: Flag, apps: Smartphone,
  llamadas: Phone, altas: Sprout, 'sin-reservas': Building2,
};

const TONO_TAREA: Record<Tarea['tono'], string> = {
  rojo: 'bg-red-500/10 text-red-600 dark:text-red-400',
  ambar: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  gris: 'bg-muted text-muted-foreground',
};

const TONO_ESTUDIO: Record<EstudioAMirar['tono'], string> = {
  rojo: 'bg-red-500/10 text-red-600 dark:text-red-400',
  ambar: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  verde: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

/** Una vuelta a «Hoy» antes de esto no vuelve a preguntar (es la misma respuesta que acaba de pintar el menú). */
const FRESCO_MS = 60_000;

const fechaDeHoy = () => {
  const t = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export default function HoyInterno() {
  const sesion = useSesionInterna();
  const { hoy, error, cargadoEn, recargar } = useHoyInterno();

  // Al volver a «Hoy» desde otra pantalla (donde quizá se resolvió algo), se
  // vuelve a preguntar; al entrar por primera vez ya lo ha pedido el layout.
  useEffect(() => {
    if (cargadoEn && Date.now() - cargadoEn > FRESCO_MS) void recargar();
    // Solo al montar: lo que cambie después lo trae `recargar` por su cuenta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hoy) {
    return error
      ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[13.5px] text-muted-foreground">No se ha podido cargar «Hoy»: {error}</p>
          <button type="button" onClick={() => void recargar()} className="rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-foreground">
            Reintentar
          </button>
        </div>
      )
      : <p className="text-[13.5px] text-muted-foreground">Mirando qué te espera hoy…</p>;
  }

  const n = hoy.tareas.length;
  const mirado = hoy.noLeidos.length > 0 || hoy.sinPermiso.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-[13px] text-muted-foreground">{fechaDeHoy()}</p>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground sm:text-[28px]">
          {n === 0 ? 'Nada te espera hoy' : `${n} ${n === 1 ? 'cosa te espera' : 'cosas te esperan'} hoy`}
        </h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {n === 0
            ? (mirado ? 'En lo que se ha podido mirar no hay nada pendiente.' : 'Ni cobros, ni denuncias, ni llamadas, ni apps, ni altas, ni clientes parados.')
            : 'Ordenadas por lo que cuesta dejarlas: primero dinero y Apple, luego clientes nuevos.'}
        </p>
      </header>

      {hoy.noLeidos.length > 0 && (
        <p role="status" className="-mt-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] text-foreground">
          <strong className="font-semibold">Faltan datos, no son ceros.</strong>{' '}
          No se ha podido leer: {hoy.noLeidos.join(', ')}. Lo que venga de ahí no está en esta lista.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {n > 0 ? (
          <section aria-label="Lo que te espera hoy" className="self-start overflow-hidden rounded-2xl border border-border bg-card">
            <ul>
              {hoy.tareas.map((t, i) => <FilaTarea key={t.tipo} t={t} primera={i === 0} />)}
            </ul>
          </section>
        ) : (
          <section className="flex items-center gap-3 self-start rounded-2xl border border-border bg-card px-5 py-5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={17} aria-hidden /></span>
            <p className="text-[14px] text-muted-foreground">
              Al día. {hoy.sinPermiso.length > 0 && <>Con tus permisos no se mira: {hoy.sinPermiso.join(', ')}.</>}
            </p>
          </section>
        )}

        <section aria-labelledby="como-va">
          <h2 id="como-va" className="mb-2.5 text-[13px] font-semibold text-foreground">Cómo va el negocio</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {hoy.cifras.map(c => <TarjetaCifra key={c.id} c={c} />)}
          </div>
        </section>
      </div>

      {hoy.estudios && (
        <section aria-labelledby="estudios-mirar">
          <div className="mb-2.5 flex items-baseline gap-3">
            <h2 id="estudios-mirar" className="text-[13px] font-semibold text-foreground">Estudios que miraría hoy</h2>
            {tienePermiso(sesion.permisos, 'studios.read') && (
              <Link href="/interno/estudios" className="ml-auto text-[13px] font-medium text-muted-foreground hover:text-foreground">Todos los estudios →</Link>
            )}
          </div>
          {hoy.estudios.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card px-5 py-4 text-[13.5px] text-muted-foreground">
              Ningún estudio paga todavía y ninguno gratis se acerca a su límite.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-border bg-card">
              {hoy.estudios.map((e, i) => (
                <li key={e.id} className={i > 0 ? 'border-t border-border/70' : ''}>
                  <Link href={`/interno/estudios/${e.id}`} className="flex items-center gap-3 px-4 py-3 text-[13.5px] transition-colors hover:bg-muted/40 sm:px-5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-[12px] font-semibold text-muted-foreground" aria-hidden>{e.nombre.slice(0, 2)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{e.nombre}</span>
                      <span className="block text-[12.5px] text-muted-foreground">{e.plan}<span className="sm:hidden"> · {e.uso}</span></span>
                    </span>
                    <span className="hidden w-64 shrink-0 text-[13px] tabular-nums text-muted-foreground sm:block">{e.uso}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${TONO_ESTUDIO[e.tono]}`}>{e.estado}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <AlertTriangle size={13} aria-hidden /> Cada cifra dice de dónde sale. Si una fuente no contesta, sale «—» con el motivo, nunca un 0.
      </p>
    </div>
  );
}

function FilaTarea({ t, primera }: { t: Tarea; primera: boolean }) {
  const Icono = ICONO[t.tipo];
  return (
    <li data-tarea={t.tipo} className={`flex items-start gap-3.5 px-4 py-4 sm:px-5 ${primera ? '' : 'border-t border-border/70'}`}>
      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONO_TAREA[t.tono]}`}><Icono size={17} aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold text-foreground">{t.titulo}</p>
        <p className="mt-0.5 text-pretty text-[13px] leading-snug text-muted-foreground">{t.porque}</p>
        <Link href={t.href} className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-foreground sm:hidden">
          {t.boton} <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
      <Link href={t.href}
        className="hidden shrink-0 self-center rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted sm:inline-flex">
        {t.boton}
      </Link>
    </li>
  );
}

function TarjetaCifra({ c }: { c: Cifra }) {
  return (
    <div data-cifra={c.id} className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <p className="text-[12.5px] text-muted-foreground">{c.titulo}</p>
      <p className="mt-1 text-[26px] font-semibold leading-none tracking-tight text-foreground tabular-nums">{c.valor ?? '—'}</p>
      {c.valor === null ? (
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{c.motivo}</p>
      ) : c.cambio && (
        <p className={`mt-2 flex items-start gap-1 text-[12px] font-medium leading-snug ${
          c.cambio.sube === null ? 'text-muted-foreground' : c.cambio.sube ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {c.cambio.sube === true && <TrendingUp size={13} className="mt-px shrink-0" aria-hidden />}
          {c.cambio.sube === false && <TrendingDown size={13} className="mt-px shrink-0" aria-hidden />}
          {c.cambio.texto}
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground/80">Fuente: {c.fuente}</p>
    </div>
  );
}
