'use client';

// Ayuda contextual de la guía paso a paso: en la pantalla donde se hace un paso (salas, equipo,
// tipos de clase, tarifas), una banda que explica qué es y para qué sirve, y lleva a la guía.
// Solo con la guía encendida y mientras el paso NO esté hecho: luego desaparece sola.
// `FaltanParaProgramar` es la del Calendario vacío: qué base falta (sala, instructora, tipo) y a dónde ir.

import Link from 'next/link';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { hrefPaso, siguienteBase, type IdPaso } from '@/lib/guia/ruta-puesta-en-marcha';
import { Baldosa } from '@/components/dashboard/vivo';
import { ICONOS_PASO, TONO_PASO } from './guia-paso-a-paso-vista';
import { useGuiaPasoAPaso } from './use-guia-paso-a-paso';

export function AyudaDelPaso({ paso }: { paso: IdPaso }) {
  const { activo, ruta } = useGuiaPasoAPaso();
  const p = activo === true ? ruta?.pasos.find(x => x.id === paso) : null;
  if (!p || p.estado === 'hecho') return null;
  return (
    <aside data-testid="ayuda-del-paso" data-paso={paso} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-t-card">
      <Baldosa tono={TONO_PASO[p.icono]} Icono={ICONOS_PASO[p.icono]} tamano="sm" />
      <div className="min-w-0 flex-1">
        <p className="font-t-mono text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">Paso {p.numero} de {ruta?.total} · {p.titulo}</p>
        <p className="mt-1 text-[14px] leading-[20px] text-foreground text-pretty">{p.que}</p>
        <p className="mt-1 text-[13px] leading-[19px] text-muted-foreground text-pretty">{p.porque}</p>
        <Link href={hrefPaso(p.id)} className="zona-tactil mt-2 inline-flex min-h-10 items-center gap-1 text-[13.5px] font-semibold text-[color:var(--t-text-link)] hover:underline">
          Ver el paso a paso<ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </aside>
  );
}

export function FaltanParaProgramar() {
  const { activo, ruta } = useGuiaPasoAPaso();
  if (activo !== true || !ruta) return null;
  const falta = siguienteBase(ruta);
  if (!falta) return null;
  const bases = ruta.pasos.filter(p => p.id === 'salas' || p.id === 'instructoras' || p.id === 'tipos');
  return (
    <div data-testid="faltan-para-programar" className="my-4 w-full rounded-2xl border border-border bg-card p-4 text-left">
      <p className="text-[14px] font-semibold text-foreground">Para programar una clase te faltan tres cosas</p>
      <ul className="mt-2 grid gap-1.5">
        {bases.map(b => (
          <li key={b.id} className="flex items-center gap-2.5 text-[14px]">
            <span aria-hidden className="flex size-5 items-center justify-center rounded-full text-[color:var(--card)]" style={b.estado === 'hecho' ? { backgroundColor: 'var(--success)' } : { boxShadow: 'inset 0 0 0 1.5px var(--border)' }}>
              {b.estado === 'hecho' ? <Check size={11} strokeWidth={3} /> : <Circle size={0} />}
            </span>
            <span className={b.estado === 'hecho' ? 'text-muted-foreground' : 'text-foreground'}>{b.titulo}</span>
          </li>
        ))}
      </ul>
      <Link href={hrefPaso(falta.id)} className="zona-tactil mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground">
        Empezar por: {falta.titulo}<ArrowRight size={15} aria-hidden />
      </Link>
    </div>
  );
}
