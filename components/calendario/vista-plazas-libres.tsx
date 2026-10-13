'use client';

// «Plazas libres» (P3.9): solo pinta lo que cuenta `lib/calendario/plazas-libres.ts`.
// Semana: cada clase con sus cifras. Mes: una fila por franja con «sitio del…
// al…» y un chip por clase. Tocar una clase (o un chip) abre su ficha en el
// Calendario, y desde ahí se apunta a la alumna por el camino de siempre. Sin
// Tenti y sin colores escritos a mano: lo parcial en ámbar (`text-warning`), lo
// que no tiene sitio en gris.

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn, franjaLocalDe, horaEstudio, hoyEnEstudio } from '@/lib/utils';
import { diaMes, fechaEnFrase, resumirFranjas, textoFranja, type FranjaResumen, type HuecoSesion } from '@/lib/calendario/plazas-libres';

const DIA_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export interface NombresPlazasLibres {
  sala: (id: string) => string | undefined;
  tipo: (id: string) => string | undefined;
}

export function SemanaPlazasLibres({ sesiones, nombres, ofertaOcupa }: {
  sesiones: readonly HuecoSesion[];
  nombres: NombresPlazasLibres;
  ofertaOcupa: boolean;
}) {
  const porDia = new Map<string, HuecoSesion[]>();
  for (const s of sesiones) {
    const dia = hoyEnEstudio(new Date(s.inicio));
    const l = porDia.get(dia);
    if (l) l.push(s); else porDia.set(dia, [s]);
  }
  return (
    <div className="max-w-3xl space-y-4" data-testid="plazas-libres-semana">
      {[...porDia.entries()].map(([dia, lista]) => (
        <section key={dia}>
          <h2 className="mb-1.5 flex items-baseline justify-between text-[13px] font-semibold text-foreground">
            <span>{DIA_LARGO[franjaLocalDe(lista[0].inicio).dow]} {fechaEnFrase(dia)}</span>
            <span className="text-[12px] font-normal text-muted-foreground">{plural(lista.length, 'clase', 'clases')}</span>
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {lista.map(s => <FilaClase key={s.id} s={s} nombres={nombres} ofertaOcupa={ofertaOcupa} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FilaClase({ s, nombres, ofertaOcupa }: { s: HuecoSesion; nombres: NombresPlazasLibres; ofertaOcupa: boolean }) {
  const sinReservar = s.fijasPorVenir - s.vuelvenDePausa;
  // Por qué las cifras son las que son: en su propia línea, sin recortar (en el
  // móvil, recortada, «6 de 8 ocupadas» al lado de «Completa» parecía mentira).
  const porque = [
    s.apartadas > 0 && `${s.apartadas} ${s.apartadas === 1 ? 'apartada' : 'apartadas'} para ClassPass`,
    ofertaOcupa && s.ofrecidas > 0 && `${s.ofrecidas} ${s.ofrecidas === 1 ? 'ofrecida' : 'ofrecidas'} a la lista de espera`,
    s.enEspera > 0 && `+${s.enEspera} en espera`,
    s.porAprobar > 0 && `${s.porAprobar} por aprobar`,
    s.vuelvenDePausa > 0 && `guarda el sitio de ${plural(s.vuelvenDePausa, 'alumna en pausa', 'alumnas en pausa')}`,
    sinReservar > 0 && `guarda el sitio de ${plural(sinReservar, 'alumna con clase fija que aún no la ha reservado', 'alumnas con clase fija que aún no la han reservado')}`,
  ].filter(Boolean) as string[];
  return (
    <li>
      <Link
        href={`/calendario?sesion=${encodeURIComponent(s.id)}`}
        className="flex min-h-14 items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        data-plazas-sesion={s.id}
      >
        <span className="w-12 shrink-0 text-[13.5px] font-semibold tabular-nums text-foreground">{horaEstudio(s.inicio)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] text-foreground">{nombres.tipo(s.tipoClaseId) ?? 'Clase'}</span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {[nombres.sala(s.salaId), `${s.ocupadas} de ${s.aforo} ocupadas`].filter(Boolean).join(' · ')}
          </span>
          {porque.length > 0 && <span className="block text-[12px] text-muted-foreground text-pretty">{porque.join(' · ')}</span>}
        </span>
        {s.cancelada ? (
          <span className="shrink-0 text-[12.5px] text-muted-foreground">Cancelada</span>
        ) : (
          <span className="shrink-0 text-right">
            <span className={cn('block text-[14px] font-semibold tabular-nums', s.libres > 0 ? 'text-foreground' : 'text-muted-foreground')}>
              {s.libres > 0 ? plural(s.libres, 'libre', 'libres') : 'Completa'}
            </span>
            {/* La segunda cifra solo cuando dice algo distinto: casi siempre es la misma. */}
            {s.libres > 0 && s.paraFija < s.libres && (
              <span className="block text-[12px] tabular-nums text-warning">
                {s.paraFija > 0 ? `${s.paraFija} para clase fija` : 'Sin sitio para clase fija'}
              </span>
            )}
          </span>
        )}
        <ChevronRight size={15} className="shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export function MesPlazasLibres({ sesiones, hasta, nombres }: { sesiones: readonly HuecoSesion[]; hasta: string; nombres: NombresPlazasLibres }) {
  const franjas = resumirFranjas(sesiones, { hasta });
  // Por día, como la semana: «Martes» se encuentra de un vistazo.
  const porDia = new Map<number, FranjaResumen[]>();
  for (const f of franjas) {
    const l = porDia.get(f.dow);
    if (l) l.push(f); else porDia.set(f.dow, [f]);
  }
  return (
    <div className="max-w-3xl space-y-4" data-testid="plazas-libres-mes">
      {[...porDia.entries()].map(([dow, lista]) => (
        <section key={dow}>
          <h2 className="mb-1.5 text-[13px] font-semibold text-foreground">{DIA_LARGO[dow]}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {lista.map(f => <FilaFranja key={f.clave} f={f} nombres={nombres} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FilaFranja({ f, nombres }: { f: FranjaResumen; nombres: NombresPlazasLibres }) {
  return (
    <li className="space-y-2 px-3.5 py-3" data-franja={f.clave}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="min-w-0">
          <span className="text-[13.5px] font-semibold text-foreground">{f.hora} · {nombres.tipo(f.tipoClaseId) ?? 'Clase'}</span>
          <span className="ml-2 text-[12px] text-muted-foreground">{nombres.sala(f.salaId)}</span>
        </span>
        <span
          className={cn(
            'text-[13px] font-medium',
            f.estado === 'TODAS' && 'text-foreground',
            (f.estado === 'DESDE' || f.estado === 'ALGUNAS') && 'text-warning',
            f.estado === 'COMPLETA' && 'text-muted-foreground',
          )}
          data-testid="franja-texto"
        >
          {textoFranja(f)}
        </span>
      </div>
      {/* Un chip por clase, con su día a la vista: «sitio en 2 de 4», ¿cuáles? Cada uno abre su clase. */}
      <ul className="flex flex-wrap gap-1.5" aria-label="Sus clases">
        {f.clases.map(c => {
          const dia = Number(c.fecha.slice(8, 10));
          const texto = c.cancelada ? 'cancelada' : c.paraFija > 0 ? plural(c.paraFija, 'sitio para clase fija', 'sitios para clase fija') : 'sin sitio para clase fija';
          return (
            <li key={c.id}>
              <Link
                href={`/calendario?sesion=${encodeURIComponent(c.id)}`}
                aria-label={`${fechaEnFrase(c.fecha)}: ${texto}`}
                title={`${diaMes(c.fecha)}: ${texto}`}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border text-[12px] font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  c.cancelada ? 'border-dashed border-muted-foreground text-muted-foreground line-through'
                    : c.paraFija > 0 ? 'border-foreground bg-foreground text-background'
                      : 'border-muted-foreground text-muted-foreground',
                )}
              >
                {dia}
              </Link>
            </li>
          );
        })}
      </ul>
      {f.programadasHasta && f.estado !== 'TODAS' && (
        <p className="text-[12px] text-muted-foreground">Clases programadas hasta el {diaMes(f.programadasHasta)}</p>
      )}
    </li>
  );
}
