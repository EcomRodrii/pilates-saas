'use client';

import { useState, type ReactNode } from 'react';
import { useStudio } from '@/lib/studio-context';
import { REWARD_TRIGGERS } from '@/lib/engines/reward-engine';
import { nombreCreditos } from '@/lib/creditos-nombre';
import { hoyEnEstudio } from '@/lib/utils';
import { INSIGNIA_DE_FORMA, insigniaDeNivel } from '@/lib/gamificacion/insignias';
import { MiniaturaInsignia } from '@/components/configuracion/selector-insignia';

// Lo que ve una alumna en su app con lo que hay guardado ahora mismo: cómo se
// ganan los créditos, el primer nivel, las recompensas, los logros y los retos
// en curso. Sin cifras de ninguna alumna (su saldo, su progreso): una cifra de
// ejemplo se leería como un dato. Se actualiza sola al guardar cualquier bloque.

const MAX = 3;

export function VistaPreviaAlumna() {
  const {
    studio, gamificacionCargada, rewardRules, rewardCatalog, achievementDefinitions, levelDefinitions, challengeDefinitions,
  } = useStudio();
  const moneda = nombreCreditos(studio?.creditosNombre);
  // Una vez por montaje: el «hoy» de Madrid, para saber qué retos están en curso.
  const [hoy] = useState(() => hoyEnEstudio());

  const formas = REWARD_TRIGGERS
    .map(d => ({ d, regla: rewardRules.find(r => r.trigger === d.trigger && r.activa && r.creditos > 0) }))
    .filter(x => x.regla);
  const niveles = levelDefinitions.filter(l => l.activo !== false).sort((a, b) => a.umbralCreditos - b.umbralCreditos);
  const recompensas = rewardCatalog.filter(r => r.activo).sort((a, b) => a.costeCreditos - b.costeCreditos);
  const logros = achievementDefinitions.filter(a => a.activo).sort((a, b) => a.umbral - b.umbral);
  const retos = challengeDefinitions.filter(c => c.activo && c.fechaInicio <= hoy && c.fechaFin >= hoy);
  const vacio = formas.length + niveles.length + recompensas.length + logros.length + retos.length === 0;

  return (
    <figure aria-label="Vista previa de la app de tu alumna" className="mx-auto w-full max-w-[300px]">
      <div className="overflow-hidden rounded-[34px] border-[6px] border-foreground/85 bg-background shadow-sm">
        <div className="flex justify-center pt-2" aria-hidden>
          <span className="h-1.5 w-16 rounded-full bg-foreground/15" />
        </div>
        <div className="max-h-[560px] space-y-4 overflow-y-auto px-4 pb-5 pt-3">
          <p className="text-lg font-semibold text-foreground">Mis logros</p>

          {!gamificacionCargada ? (
            <div className="space-y-2" aria-hidden>
              {[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}
            </div>
          ) : vacio ? (
            <p className="rounded-xl bg-muted px-3 py-4 text-center text-sm text-muted-foreground text-pretty">
              Aún no hay nada que enseñarle. En cuanto actives una forma de ganar {moneda}, aparecerá aquí.
            </p>
          ) : (
            <>
              {niveles.length > 0 && (
                <Bloque titulo="Tu nivel">
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                    <MiniaturaInsignia icono={insigniaDeNivel(niveles[0].icono, niveles.length === 1).clave} tamano={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{niveles[0].nombre}</span>
                      {niveles[1] && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {niveles[1].nombre} a los {niveles[1].umbralCreditos} {moneda}
                        </span>
                      )}
                    </span>
                  </div>
                </Bloque>
              )}

              {formas.length > 0 && (
                <Bloque titulo={`Cómo ganar ${moneda}`}>
                  <ul className="space-y-1.5">
                    {formas.map(({ d, regla }) => (
                      <li key={d.trigger} className="flex items-center gap-2.5 text-sm">
                        <MiniaturaInsignia icono={INSIGNIA_DE_FORMA[d.trigger]} tamano={22} />
                        <span className="min-w-0 flex-1 truncate text-foreground">{d.nombre}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          +{regla!.creditos}{regla!.unidadEuros ? ` / ${regla!.unidadEuros} €` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Bloque>
              )}

              {recompensas.length > 0 && (
                <Bloque titulo="Canjea">
                  <ul className="space-y-1.5">
                    {recompensas.slice(0, MAX).map(r => (
                      <li key={r.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2 text-sm">
                        <MiniaturaInsignia icono={r.icono} porDefecto={r.efecto === 'CLASE_GRATIS' ? 'entrada' : 'regalo'} tamano={26} />
                        <span className="min-w-0 flex-1 truncate text-foreground">{r.nombre}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{r.costeCreditos}</span>
                      </li>
                    ))}
                  </ul>
                  <Mas n={recompensas.length - MAX} />
                </Bloque>
              )}

              {logros.length > 0 && (
                <Bloque titulo="Logros">
                  <ul className="grid grid-cols-3 gap-2">
                    {logros.slice(0, 6).map(a => (
                      <li key={a.id} className="flex flex-col items-center gap-1 rounded-xl bg-muted px-1 py-2 text-center">
                        <MiniaturaInsignia icono={a.icono} porDefecto="trofeo" tamano={34} />
                        <span className="line-clamp-2 text-[11px] leading-tight text-foreground">{a.nombre}</span>
                      </li>
                    ))}
                  </ul>
                  <Mas n={logros.length - 6} />
                </Bloque>
              )}

              {retos.length > 0 && (
                <Bloque titulo="Retos de ahora">
                  <ul className="space-y-1.5">
                    {retos.slice(0, MAX).map(c => (
                      <li key={c.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2 text-sm">
                        <MiniaturaInsignia icono={c.icono} porDefecto="objetivo" tamano={26} />
                        <span className="min-w-0 flex-1 truncate text-foreground">{c.nombre}</span>
                      </li>
                    ))}
                  </ul>
                  <Mas n={retos.length - MAX} />
                </Bloque>
              )}
            </>
          )}
        </div>
      </div>
      <figcaption className="mt-2 text-center text-xs text-muted-foreground text-pretty">
        Así lo ve tu alumna en su app, con lo que tienes guardado.
      </figcaption>
    </figure>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {children}
    </section>
  );
}

function Mas({ n }: { n: number }) {
  if (n <= 0) return null;
  return <p className="text-xs text-muted-foreground">y {n} más</p>;
}
