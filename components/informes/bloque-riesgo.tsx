'use client';

// «Clientas en riesgo» (Informes, panel nuevo; como el de «Estadísticas» de
// Bonsai). Sin regla nueva: las dos listas de lib/informes/riesgo.ts son los
// filtros de Clientas, y cada una enlaza al suyo con la lista entera.

import Link from 'next/link';
import { haceCuanto } from '@/lib/clientas/textos';
import { hoyEnEstudio } from '@/lib/utils';
import { DIAS_SIN_RENOVAR, DIAS_SIN_VENIR } from '@/lib/clientas/estado';
import { ENLACE_ACTIVAS_SIN_VENIR, ENLACE_SIN_RENOVAR, type ClientaEnRiesgo, type ClientasEnRiesgo } from '@/lib/informes/riesgo';
import { CabeceraBloque, useClaseBloque } from './piezas';

/** Cuántas se enseñan por lista; el resto, en Clientas. */
const MAXIMO = 6;

/** El día del estudio de una fecha o de un instante (la última clase llega como instante). */
const diaDe = (d: string) => (d.length > 10 ? hoyEnEstudio(new Date(d)) : d);

export function BloqueRiesgo({ riesgo, hoy, nombreDe }: {
  /** `null`: los datos no han llegado enteros y no se enseña ninguna lista. */
  riesgo: ClientasEnRiesgo | null;
  hoy: string;
  nombreDe: (socioId: string) => string;
}) {
  const claseBloque = useClaseBloque();
  return (
    <section aria-labelledby="informe-riesgo" className={`space-y-4 ${claseBloque}`} data-testid="informe-riesgo">
      <CabeceraBloque id="informe-riesgo" titulo="Clientas en riesgo">
        Hoy, no en el periodo. Son las mismas listas que en Clientas, con el mismo cálculo que sus etiquetas.
      </CabeceraBloque>

      {!riesgo ? (
        <p role="alert" className="rounded-xl bg-warning/10 px-4 py-3 text-[13px] font-medium text-foreground">
          No se han podido cargar tus clientas del todo, así que no enseñamos listas que podrían estar mal. Recarga la
          página; si sigue pasando, contacta con soporte.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Lista
            testId="informe-riesgo-sin-renovar"
            titulo="Sin renovar"
            explicacion={`Se les acabó el plan o el bono hace ${DIAS_SIN_RENOVAR} días o menos y no han vuelto a comprar.`}
            vacio="Nadie se ha quedado sin plan."
            clientas={riesgo.sinRenovar}
            href={ENLACE_SIN_RENOVAR}
            detalle={(c) => (c.desde ? `sin plan ${haceCuanto(diaDe(c.desde), hoy)}` : 'sin plan')}
            nombreDe={nombreDe}
          />
          <Lista
            testId="informe-riesgo-sin-venir"
            titulo={`Activas que llevan más de ${DIAS_SIN_VENIR} días sin venir`}
            explicacion="Pueden reservar, pero no vienen. La que más tiempo lleva, primero."
            vacio={`Todas las activas han venido en los últimos ${DIAS_SIN_VENIR} días.`}
            clientas={riesgo.activasSinVenir}
            href={ENLACE_ACTIVAS_SIN_VENIR}
            detalle={(c) => (c.desde ? `última clase ${haceCuanto(diaDe(c.desde), hoy)}` : 'no ha venido nunca')}
            nombreDe={nombreDe}
          />
        </div>
      )}
    </section>
  );
}

function Lista({ testId, titulo, explicacion, vacio, clientas, href, detalle, nombreDe }: {
  testId: string;
  titulo: string;
  explicacion: string;
  vacio: string;
  clientas: ClientaEnRiesgo[];
  href: string;
  detalle: (c: ClientaEnRiesgo) => string;
  nombreDe: (socioId: string) => string;
}) {
  const vistas = clientas.slice(0, MAXIMO);
  return (
    <div data-testid={testId}>
      <h3 className="flex items-baseline gap-2 text-[13.5px] font-semibold text-foreground">
        {titulo}
        <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold tabular-nums text-foreground">{clientas.length}</span>
      </h3>
      <p className="text-[12.5px] text-muted-foreground text-pretty">{explicacion}</p>
      {clientas.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{vacio}</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-border">
            {vistas.map((c) => (
              <li key={c.socioId} className="flex items-baseline justify-between gap-3 py-2">
                <Link href={`/clientas/${c.socioId}`} className="min-w-0 truncate text-[13.5px] font-medium text-foreground hover:underline">
                  {nombreDe(c.socioId)}
                </Link>
                <span className="shrink-0 text-[12.5px] text-muted-foreground">{detalle(c)}</span>
              </li>
            ))}
          </ul>
          <Link href={href} className="mt-2 inline-block text-[13px] font-semibold text-brand-medio underline-offset-2 hover:underline">
            {clientas.length > MAXIMO ? `Ver las ${clientas.length} en Clientas →` : 'Verlas en Clientas →'}
          </Link>
        </>
      )}
    </div>
  );
}
