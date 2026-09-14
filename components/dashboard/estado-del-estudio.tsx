'use client';

import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { TentareOrb } from '@/components/marca/tentare-orb';
import { useEstadoEstudio } from '@/lib/estado-estudio-cliente';
import type { LineaEstado } from '@/lib/estado-estudio';

// «Lo que espera tu visto bueno» — la bandeja única de la home, justo debajo de
// la agenda del día. Contesta la segunda pregunta con la que se abre el panel:
// después de «qué pasa hoy», «¿tengo que hacer algo, o Tentare ya se encarga?».
//
// Tres bloques, en este orden y por este motivo:
//   1. Lo que espera tu decisión — lo único que es trabajo tuyo.
//   2. Tentare lo está haciendo — procesos en marcha que no tienes que tocar.
//   3. Resuelto por Tentare — para que se vea que el sistema trabaja.
//
// Sin nada en ninguno de los tres queda una sola línea discreta. No se oculta
// del todo porque «nada espera tu visto bueno» ES información (es lo que la
// deja cerrar la pantalla tranquila), pero tampoco ocupa una tarjeta: un bloque
// grande que dice lo mismo cada mañana entrena a no mirarlo.
export function EstadoDelEstudio() {
  const e = useEstadoEstudio();
  if (!e || !e.aplica) return null;

  const hayActividad = e.enMarcha.length > 0 || e.resuelto.length > 0;

  if (e.nDecidir === 0 && !hayActividad) {
    return (
      <p className="flex items-center gap-2 px-1 text-[13px] text-muted-foreground">
        <Check size={15} style={{ color: 'var(--success)' }} aria-hidden />
        {e.titulo}
      </p>
    );
  }

  return (
    <section
      aria-label="Lo que espera tu visto bueno"
      className="flex flex-col gap-3 rounded-xl border p-4"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
    >
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-[15px] font-bold text-foreground">
          {e.nDecidir === 0 && <Check size={16} style={{ color: 'var(--success)' }} aria-hidden />}
          {e.titulo}
        </p>
        {e.decidir.length > 0 && <Lineas lineas={e.decidir} />}
      </div>

      {e.enMarcha.length > 0 && (
        <Bloque titulo="Tentare lo está haciendo" icono={<TentareOrb tam={14} />}>
          <Lineas lineas={e.enMarcha} tenue />
        </Bloque>
      )}

      {e.resuelto.length > 0 && (
        <Bloque titulo="Resuelto por Tentare" icono={<Check size={14} style={{ color: 'var(--success)' }} aria-hidden />}>
          <Lineas lineas={e.resuelto} tenue />
        </Bloque>
      )}
    </section>
  );
}

function Bloque({ titulo, icono, children }: { titulo: string; icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icono}
        {titulo}
      </p>
      {children}
    </div>
  );
}

function Lineas({ lineas, tenue }: { lineas: LineaEstado[]; tenue?: boolean }) {
  return (
    <ul className="flex flex-col gap-1">
      {lineas.map(l => {
        const texto = <span className="flex-1 leading-snug">{l.texto}</span>;
        const clase = tenue ? 'text-[13px] text-muted-foreground' : 'text-[13px] text-foreground';
        return (
          <li key={l.id}>
            {l.href ? (
              <Link href={l.href} className={`flex items-center gap-2 rounded-md py-0.5 hover:underline ${clase}`}>
                {texto}
                <ArrowRight size={13} className="shrink-0 opacity-60" aria-hidden />
              </Link>
            ) : (
              // Se resuelve en una tarjeta de esta misma pantalla, un poco más
              // abajo: enlazar a otra sería mandarla lejos de donde se actúa.
              <span className={`flex items-center gap-2 py-0.5 ${clase}`}>{texto}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
