'use client';

// «Estado de los bonos» (Informes, panel nuevo; como el de «Estadísticas» de
// Bonsai). Las cifras salen de lib/informes/bonos.ts, que reutiliza las dueñas:
// `saldoSesionesBono` y la regla de `leerBonosPorCaducar`. Una foto de hoy.

import Link from 'next/link';
import { diasEntre, fechaCorta } from '@/lib/clientas/textos';
import { DIAS_CADUCAN_PRONTO, type EstadoBonos } from '@/lib/informes/bonos';
import { CabeceraBloque, useClaseBloque } from './piezas';

export function BloqueBonos({ estado, hoy, nombreDe, nombrePlan }: {
  /** `null`: los datos no han llegado enteros y no se enseña ninguna cifra. */
  estado: EstadoBonos | null;
  hoy: string;
  nombreDe: (socioId: string) => string;
  nombrePlan: (planId: string) => string;
}) {
  const claseBloque = useClaseBloque();
  return (
    <section aria-labelledby="informe-bonos" className={`space-y-4 ${claseBloque}`} data-testid="informe-bonos">
      <CabeceraBloque id="informe-bonos" titulo="Estado de los bonos">
        Así están hoy, sin depender del periodo que mires arriba.
      </CabeceraBloque>

      {!estado ? (
        <p role="alert" className="rounded-xl bg-warning/10 px-4 py-3 text-[13px] font-medium text-foreground">
          No se han podido cargar los bonos del todo, así que no enseñamos cifras que podrían estar mal. Recarga la
          página; si sigue pasando, contacta con soporte.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Cifra etiqueta="Bonos en uso" valor={estado.vivos} nota="Sin caducar, les queden sesiones o no." />
            <Cifra etiqueta="Sesiones por dar" valor={estado.sesionesQueQuedan} nota="Lo que les queda a tus alumnas entre todos sus bonos." />
            <Cifra
              etiqueta={`Caducan en ${DIAS_CADUCAN_PRONTO} días`}
              valor={estado.caducanPronto.length}
              nota={estado.sesionesQueCaducan === 0
                ? 'Ninguno con sesiones sin usar.'
                : `Con ${estado.sesionesQueCaducan} ${estado.sesionesQueCaducan === 1 ? 'sesión' : 'sesiones'} sin usar.`}
            />
          </div>

          <div>
            <h3 className="text-[13.5px] font-semibold text-foreground">Caducan pronto con sesiones sin usar</h3>
            <p className="text-[12.5px] text-muted-foreground text-pretty">
              El más cercano primero. Es la misma regla con la que Tentare le avisa al móvil cuando le queda una semana, si tiene los avisos activados.
            </p>
            {estado.caducanPronto.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">
                Ningún bono caduca en los próximos {DIAS_CADUCAN_PRONTO} días con sesiones sin usar.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border" data-testid="informe-bonos-caducan">
                {estado.caducanPronto.map((b) => {
                  const dias = diasEntre(hoy, b.fechaFin);
                  return (
                    <li key={b.suscripcionId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5">
                      <span className="min-w-0">
                        <Link href={`/clientas/${b.socioId}`} className="text-[13.5px] font-medium text-foreground hover:underline">
                          {nombreDe(b.socioId)}
                        </Link>
                        <span className="text-[12.5px] text-muted-foreground"> · {nombrePlan(b.planId)}</span>
                      </span>
                      <span className="text-[12.5px] tabular-nums text-muted-foreground">
                        <b className="font-semibold text-foreground">{b.restantes} {b.restantes === 1 ? 'sesión' : 'sesiones'}</b>
                        {' · '}caduca el {fechaCorta(b.fechaFin, hoy)}{dias <= 0 ? ' (hoy)' : dias === 1 ? ' (mañana)' : ` (en ${dias} días)`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: number; nota: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-[12.5px] text-muted-foreground">{etiqueta}</p>
      <p className="text-[24px] font-semibold tabular-nums text-foreground">{valor}</p>
      <p className="text-[12px] text-muted-foreground text-pretty">{nota}</p>
    </div>
  );
}
