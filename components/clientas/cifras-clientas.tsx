'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Las cuatro cifras de arriba de Clientas en el panel nuevo (14-oct-2026), como
// las de la home: etiqueta pequeña, icono de color, número grande con su
// explicación al lado y la tarjeta teñida de su tono.
//
// Cada una sale de la misma cuenta que ya usa la lista (o Cobros), así que el
// número de la tarjeta es el de las filas que enseña al pulsarla:
//   · Clientas activas → el estado `ACTIVA` (`lib/clientas/estado.ts`), el chip
//     «Activa» y la cifra de Resumen. Al lado, cuántas son nuevas (la marca de su fila).
//   · Altas este mes → `altasDelMes` (`lib/inicio/cifras.ts`), la gráfica
//     «Nuevas clientas»; comparada con el mes pasado al mismo día.
//   · Sin venir en 30 días → `contarSinVenir`, el filtro «Sin venir en 30 días».
//   · Pagos pendientes (solo quien ve la facturación) → «Quién me debe» de
//     Cobros (`lib/clientas/cifras-lista.ts`). Sin facturación, «Sin renovar».
//
// Las tres primeras (y «Sin renovar») filtran ESTA lista; la de dinero lleva a
// Cobros. Mientras falten datos, «—»: ausente no es cero.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, type ReactNode } from 'react';
import { Clock, CreditCard, RefreshCw, UserPlus, Users } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { TarjetaCifra } from '@/components/dashboard/vivo';
import { TarjetaCifraFiltro } from '@/components/dashboard/vivo-seccion';
import { contarSinVenir } from '@/lib/clientas/estado';
import { contarActivasNuevas, deudaDeClientas } from '@/lib/clientas/cifras-lista';
import { euros } from '@/lib/clientas/euros';
import type { EstadosClientas } from '@/lib/clientas/use-estados-clientas';
import { MESES_LARGOS, altasDelMes } from '@/lib/inicio/cifras';
import { hoyEnEstudio } from '@/lib/utils';

/** Las cifras que filtran la lista. */
export type CifraClientas = 'activas' | 'altas' | 'sin_venir' | 'sin_renovar';

const diaDe = (instante: string) => hoyEnEstudio(new Date(instante));

export function CifrasClientas({ estados, verFinanzas, irACobros, activa, onCifra }: {
  estados: EstadosClientas;
  /** Ve la facturación (propietaria y recepción): la cuarta es lo que le deben. */
  verFinanzas: boolean;
  /** Puede entrar en Cobros: si no, la cifra de dinero no es un enlace. */
  irACobros: boolean;
  /** La cifra cuyo filtro está puesto ahora en la lista. */
  activa: CifraClientas | null;
  onCifra: (c: CifraClientas) => void;
}) {
  const { socios, recibos, dataLoaded, datosIncompletos } = useStudio();
  const { listo, porSocio, hechos, conteos, ahora } = estados;
  const hoy = ahora ? hoyEnEstudio(ahora) : null;

  const nuevas = useMemo(() => (listo ? contarActivasNuevas(porSocio) : null), [listo, porSocio]);
  const sinVenir = useMemo(
    () => (listo && ahora ? contarSinVenir(socios, porSocio, hechos, ahora) : null),
    [listo, ahora, socios, porSocio, hechos],
  );
  // Las altas cuentan fichas: con las socias a medias (`listo` falso) saldrían de menos.
  const altas = useMemo(() => (listo && hoy ? altasDelMes(socios, hoy, diaDe) : null), [listo, hoy, socios]);
  const recibosCompletos = dataLoaded && !datosIncompletos.includes('recibos');
  const deuda = useMemo(() => {
    if (!verFinanzas || !recibosCompletos) return null;
    const ids = new Set(socios.map(s => s.id));
    return deudaDeClientas(recibos, id => ids.has(id));
  }, [verFinanzas, recibosCompletos, socios, recibos]);

  const mesPasado = hoy ? MESES_LARGOS[(Number(hoy.slice(5, 7)) + 10) % 12].slice(0, 3) : '';

  return (
    // 2 × 2 hasta que caben cuatro con aire, como en la home.
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4" data-testid="cifras-clientas">
      <TarjetaCifraFiltro
        etiqueta="Clientas activas"
        tono="magenta"
        Icono={Users}
        valor={conteos ? String(conteos.ACTIVA) : '—'}
        {...ladoActivas(conteos?.ACTIVA ?? null, nuevas)}
        activo={activa === 'activas'}
        onClick={() => onCifra('activas')}
        accion="Ver solo las activas"
      />
      <TarjetaCifraFiltro
        etiqueta="Altas este mes"
        tono="azul"
        Icono={UserPlus}
        valor={altas ? String(altas.total) : '—'}
        {...ladoAltas(altas, mesPasado)}
        activo={activa === 'altas'}
        onClick={() => onCifra('altas')}
        accion="Ordenar la lista por fecha de alta, las más nuevas arriba"
      />
      <TarjetaCifraFiltro
        etiqueta="Sin venir 30 días"
        tono="indigo"
        Icono={Clock}
        valor={sinVenir === null ? '—' : String(sinVenir)}
        abajo={sinVenir === null ? 'Contando…' : sinVenir === 0 ? 'Nadie lleva un mes sin venir' : sinVenir === 1 ? 'lleva más de 30 días sin clase' : 'llevan más de 30 días sin clase'}
        activo={activa === 'sin_venir'}
        onClick={() => onCifra('sin_venir')}
        accion="Ver quién lleva un mes sin venir"
      />
      {verFinanzas ? (
        <TarjetaCifra
          etiqueta="Pagos pendientes"
          tono="verde"
          Icono={CreditCard}
          href={irACobros ? '/cobros?tab=deudas' : null}
          valor={deuda ? String(deuda.clientas) : '—'}
          arriba={deuda && deuda.clientas > 0 ? <CifraPrivada inline>{euros(deuda.importe)}</CifraPrivada> : undefined}
          abajo={!deuda ? 'Contando…' : deuda.clientas === 0 ? 'Nadie te debe nada' : deuda.clientas === 1 ? 'clienta con algo sin cobrar' : 'clientas con algo sin cobrar'}
        />
      ) : (
        <TarjetaCifraFiltro
          etiqueta="Sin renovar"
          tono="verde"
          Icono={RefreshCw}
          valor={conteos ? String(conteos.SIN_RENOVAR) : '—'}
          abajo={!conteos ? 'Contando…' : conteos.SIN_RENOVAR === 0 ? 'Nadie se ha quedado sin plan' : 'se les acabó el plan hace poco'}
          activo={activa === 'sin_renovar'}
          onClick={() => onCifra('sin_renovar')}
          accion="Ver a quién se le acabó el plan hace poco"
        />
      )}
    </div>
  );
}

/** Al lado de las activas: cuántas son nuevas, o qué cuenta como activa. */
function ladoActivas(activas: number | null, nuevas: number | null): { arriba?: ReactNode; abajo: ReactNode } {
  if (activas === null || nuevas === null) return { abajo: 'Contando…' };
  if (activas === 0) return { abajo: 'Aún no tienes clientas activas' };
  if (nuevas > 0) {
    return {
      arriba: <span style={{ color: 'var(--success)' }}>{nuevas} nueva{nuevas === 1 ? '' : 's'}</span>,
      abajo: 'en los últimos 30 días',
    };
  }
  return { abajo: 'con plan o que han venido en 30 días' };
}

/** Al lado de las altas: la diferencia con el mes pasado a estas alturas. */
function ladoAltas(altas: { total: number; hoy: number; mesPasadoAlDia: number } | null, mesPasado: string): { arriba?: ReactNode; abajo: ReactNode } {
  if (!altas) return { abajo: 'Contando…' };
  if (altas.total === 0 && altas.mesPasadoAlDia === 0) return { abajo: 'Aún no hay altas este mes' };
  const dif = altas.total - altas.mesPasadoAlDia;
  const color = dif > 0 ? 'var(--success)' : dif < 0 ? 'var(--destructive)' : 'var(--muted-foreground)';
  return {
    arriba: <span style={{ color }}>{dif > 0 ? '+' : ''}{dif}</span>,
    abajo: `vs 1–${altas.hoy} ${mesPasado}.`,
  };
}
