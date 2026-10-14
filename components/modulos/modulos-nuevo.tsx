'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Módulos (panel nuevo, 14-oct-2026), como la pantalla de Bonsai (b-74):
// «Personaliza tu plataforma» con el recuento, un buscador, los módulos por
// grupos y cada uno en su tarjeta con icono de color, qué hace, el interruptor
// y «Ir». Sustituye a «Explorar todas las funciones» (filas iguales con el
// mismo icono) cuando el estudio tiene el panel nuevo.
//
// La lógica es la de «Tus módulos» (`useTusModulos`): el interruptor pone o
// quita el módulo DEL MENÚ (no lo apaga ni quita permisos, y la tarjeta lo
// dice) y guardar solo lo deja el servidor a la propietaria, así que al resto
// del equipo no se le enseña el interruptor.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search, Settings2 } from 'lucide-react';
import { usePermisos } from '@/lib/permisos';
import { useTutorial } from '@/lib/tutorial-context';
import { guardarModoMenu } from '@/lib/nav-modo';
import { estadoEnMenu, incluidoEnPlan, planQueLoIncluye, type ModuloTuTentare } from '@/lib/tu-tentare/catalogo';
import { useTusModulos } from '@/components/configuracion/tu-tentare/use-tus-modulos';
import { Interruptor } from '@/components/ui/interruptor';
import { TONOS } from '@/components/dashboard/vivo';
import { TONO_DE_SECCION } from '@/components/dashboard/icono-seccion';
import { cn } from '@/lib/utils';

/** Qué resuelve cada grupo del menú, en una línea (como «Funcionalidades esenciales…» de Bonsai). */
const QUE_RESUELVE: Record<string, string> = {
  Principal: 'Tu día, lo que merece tu atención y lo que Tentare hace solo',
  'Operación': 'Clases, citas, alumnas y lo que os escribís',
  Equipo: 'Quién da las clases y cómo se cubren las bajas',
  Negocio: 'Lo que vendes, lo que cobras y cómo va',
  Estudio: 'Cómo está montado tu estudio y lo que te traes de antes',
};

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

export function ModulosNuevo() {
  const { rol } = usePermisos();
  const tutorial = useTutorial();
  const esPropietaria = rol === 'PROPIETARIO';
  const { grupos, ocultos, vistos, cuenta, plan, modo, setModo, guardando, errores, recien, errorLectura, cambiar } = useTusModulos();
  const [busqueda, setBusqueda] = useState('');

  const visibles = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    return conRotulos(grupos)
      .map(g => ({ ...g, modulos: q ? g.modulos.filter(m => sinTildes(`${m.label} ${m.frase}`).includes(q)) : g.modulos }))
      .filter(g => g.modulos.length > 0);
  }, [grupos, busqueda]);

  return (
    <div className="space-y-6" data-testid="modulos-nuevo">
      {/* La cabecera de color, como «Personaliza tu plataforma» de Bonsai. */}
      <section
        aria-labelledby="modulos-titulo"
        className="relative overflow-hidden rounded-t-card p-6 text-white shadow-t-card sm:p-8"
        style={{ backgroundImage: 'linear-gradient(120deg, var(--t-blue-700), var(--t-magenta-700))' }}
      >
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-white/10" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 right-40 size-48 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <h1 id="modulos-titulo" className="text-[26px] font-bold leading-tight">Tus módulos</h1>
            <p className="mt-2 text-[14.5px] text-white/85 text-pretty">
              Todo lo que puede hacer Tentare por tu estudio. Pon en tu menú lo que usas: quitar un módulo no lo apaga ni borra nada.
            </p>
          </div>
          {ocultos !== null && (
            <div className="flex items-stretch rounded-2xl bg-white/15 px-2 py-3 backdrop-blur-sm">
              <div className="px-4 text-center">
                <p className="text-[34px] font-bold leading-none tabular-nums">{cuenta.en}</p>
                <p className="mt-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-white/80">En tu menú</p>
              </div>
              <div className="w-px bg-white/25" />
              <div className="px-4 text-center">
                <p className="text-[34px] font-bold leading-none tabular-nums">{cuenta.de}</p>
                <p className="mt-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-white/80">En total</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5 shadow-t-card focus-within:ring-3 focus-within:ring-ring/40">
          <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Buscar un módulo</span>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar módulo…"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <p className="text-[12.5px] text-muted-foreground">
          {modo === 'esencial' ? 'Tu menú está en «Esencial»: algunos no se ven aunque estén puestos.' : 'Tu menú está en «Todo».'}{' '}
          <button
            type="button"
            className="font-semibold underline-offset-2 hover:underline"
            style={{ color: 'var(--t-text-link)' }}
            onClick={() => { const otro = modo === 'esencial' ? 'avanzado' : 'esencial'; guardarModoMenu(otro); setModo(otro); }}
          >
            {modo === 'esencial' ? 'Ver «Todo»' : 'Volver a «Esencial»'}
          </button>
        </p>
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

      {visibles.map(g => (
        <section key={g.label} aria-labelledby={`grupo-${g.label}`} className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border pb-2">
            <h2 id={`grupo-${g.label}`} className="text-[12.5px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--t-text-accent)' }}>{g.label}</h2>
            {QUE_RESUELVE[g.label] && <p className="text-[12.5px] text-muted-foreground">{QUE_RESUELVE[g.label]}</p>}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {g.modulos.map(m => {
              const estado = estadoEnMenu(m, vistos);
              const enMenu = estado !== 'fuera';
              const tono = TONO_DE_SECCION[m.href] ?? 'azul';
              const c = TONOS[tono];
              const incluido = plan ? incluidoEnPlan(m, plan.plan, true) : null;
              const minimo = planQueLoIncluye(m);
              const Icono = m.icon;
              return (
                <li
                  key={m.href}
                  data-testid="modulo-nuevo"
                  data-modulo={m.href}
                  className={cn('flex flex-col rounded-t-card border p-4 shadow-t-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-t-floating', recien === m.href && 'ring-2')}
                  style={{
                    backgroundImage: enMenu ? `linear-gradient(160deg, var(--card) 40%, color-mix(in srgb, ${c} 12%, var(--card)) 100%)` : undefined,
                    backgroundColor: 'var(--card)',
                    borderColor: enMenu ? `color-mix(in srgb, ${c} 26%, var(--border))` : 'var(--border)',
                    ['--tw-ring-color' as string]: c,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: enMenu ? c : `color-mix(in srgb, ${c} 35%, var(--card))`, color: 'var(--card)', boxShadow: enMenu ? `0 10px 20px -12px ${c}` : undefined }}>
                      <Icono size={19} strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold leading-tight text-foreground">{m.label}</p>
                      <span
                        className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                        style={m.fijo
                          ? { color: 'var(--muted-foreground)', backgroundColor: 'var(--muted)' }
                          : enMenu
                            ? { color: 'var(--success)', backgroundColor: 'color-mix(in srgb, var(--success) 14%, transparent)' }
                            : { color: 'var(--muted-foreground)', backgroundColor: 'var(--muted)' }}
                      >
                        {m.fijo ? 'Siempre' : ocultos === null ? '…' : enMenu ? 'En tu menú' : 'Fuera del menú'}
                      </span>
                    </div>
                    {esPropietaria && !m.fijo && ocultos !== null && (
                      <Interruptor
                        on={enMenu}
                        ariaLabel={`${m.label} en el menú`}
                        disabled={guardando !== null && guardando !== m.href}
                        ocupado={guardando === m.href}
                        onChange={v => { void cambiar(m, v); }}
                      />
                    )}
                  </div>
                  <p className="mt-3 flex-1 text-[13px] leading-snug text-muted-foreground text-pretty">{m.frase}</p>
                  {incluido === false && minimo && (
                    <p className="mt-2 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ color: 'var(--warning)', backgroundColor: 'color-mix(in srgb, var(--warning) 12%, transparent)' }}>
                      Incluido en el plan {minimo}
                    </p>
                  )}
                  {errores[m.href] && <p role="alert" className="mt-2 text-[12px] font-medium text-destructive">{errores[m.href]}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    {m.href !== '/explorar-funciones' && (
                      <Link
                        href={m.href}
                        onClick={() => { if (m.tutorial) tutorial?.abrirAlLlegar(m.href); }}
                        className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold text-white"
                        style={{ backgroundColor: c }}
                      >
                        Ir <ArrowRight size={13} aria-hidden /><span className="sr-only"> a {m.label}</span>
                      </Link>
                    )}
                    {m.configurar && (
                      <Link href={m.configurar} className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-muted">
                        <Settings2 size={13} aria-hidden /> Configurar<span className="sr-only"> {m.label}</span>
                      </Link>
                    )}
                    {incluido === false && (
                      <Link href="/suscripcion" className="ml-auto text-[12.5px] font-semibold" style={{ color: 'var(--t-text-link)' }}>Ver planes</Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
