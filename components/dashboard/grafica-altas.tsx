'use client';

// «Nuevas clientas»: las altas de cada mes y la tira de cada día del mes en
// curso, como «Clientes activos» y «Altas por día este mes» de Bonsai.
//
// Salió de la home nueva (`resumen-nuevo.tsx`, 14-oct-2026) para que Clientas
// enseñe la MISMA gráfica, con las mismas cuentas (`lib/inicio/cifras.ts`), sin
// arrastrar a su pantalla todo lo demás que importa la home.

import { useMemo, useState } from 'react';
import { GraficaArea } from '@/components/dashboard/grafica-area';
import { Comparacion, Pildoras, TarjetaGrafica, VerMas } from '@/components/dashboard/vivo';
import { MESES_LARGOS, altasDelMes, altasPorMes } from '@/lib/inicio/cifras';
import { cn, hoyEnEstudio } from '@/lib/utils';

// El día del alta es el del estudio. Se recuerda por hora UTC: cientos de
// fichas, una sola llamada a Intl por hora distinta (y Madrid no cambia de día
// a mitad de una hora UTC).
const DIA_POR_HORA = new Map<string, string>();
function diaDelEstudio(instante: string): string {
  const k = instante.slice(0, 13);
  let d = DIA_POR_HORA.get(k);
  if (!d) { d = hoyEnEstudio(new Date(instante)); DIA_POR_HORA.set(k, d); }
  return d;
}

const nombreMes = (clave: string) => `${MESES_LARGOS[Number(clave.slice(5, 7)) - 1]} de ${clave.slice(0, 4)}`;
const ejeMes = (clave: string) => MESES_LARGOS[Number(clave.slice(5, 7)) - 1].slice(0, 3);

export function GraficaAltas({ socios, hoy, href }: { socios: readonly { fechaAlta?: string | null }[]; hoy: string; href: string | null }) {
  const [meses, setMeses] = useState<3 | 6 | 12>(6);
  const serie = useMemo(() => altasPorMes(socios, hoy, meses, diaDelEstudio), [socios, hoy, meses]);
  const mes = useMemo(() => altasDelMes(socios, hoy, diaDelEstudio), [socios, hoy]);
  const mesPasado = MESES_LARGOS[(Number(hoy.slice(5, 7)) + 10) % 12].slice(0, 3);
  return (
    <TarjetaGrafica
      id="grafica-altas"
      titulo="Nuevas clientas"
      sub="Las que se han dado de alta en tu estudio cada mes"
      cifra={mes.total}
      // «este mes · +2 vs 1–14 sep.»: la cifra es la de este mes, comparada con el mismo tramo del anterior.
      comparacion={<>este mes · <Comparacion diferencia={mes.total - mes.mesPasadoAlDia} contra={`1–${mes.hoy} ${mesPasado}.`} /></>}
      controles={<Pildoras opciones={[{ valor: 3, label: '3 meses' }, { valor: 6, label: '6 meses' }, { valor: 12, label: '1 año' }]} valor={meses} onCambio={setMeses} />}
      pie={href ? <VerMas href={href} label="Ver clientas" /> : null}
    >
      <GraficaArea
        titulo="Altas por mes"
        alto={190}
        color="var(--t-magenta-500)"
        colorPunto="var(--t-blue-500)"
        puntos={serie.map(m => ({ eje: ejeMes(m.clave), nombre: nombreMes(m.clave), valor: m.valor }))}
        formato={n => `${n} alta${n === 1 ? '' : 's'}`}
        enteros
        vacio="Cada alumna que se dé de alta, en el mostrador o desde tu página, sumará aquí."
      />
      {/* La tira de Bonsai: cada día del mes, con su número encima si hubo altas. */}
      <p className="mt-4 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-foreground/55">Altas por día este mes</p>
      <div className="@container mt-2 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${mes.porDia.length}, minmax(0, 1fr))` }}>
        {mes.porDia.map((v, i) => {
          const dia = i + 1;
          const futuro = dia > mes.hoy;
          // En estrecho (el móvil, la columna de la derecha) los 31 números se
          // pisan: salen el 1, los múltiplos de 5, el último y hoy, sin pegarse a hoy.
          const ultimo = mes.porDia.length;
          const clave = dia === mes.hoy || ((dia === 1 || dia === ultimo || (dia % 5 === 0 && dia <= ultimo - 2)) && Math.abs(dia - mes.hoy) > 1);
          return (
            <div key={dia} className="flex flex-col items-center gap-1" title={`${dia}: ${v} alta${v === 1 ? '' : 's'}`}>
              <span className="h-3 text-[9.5px] font-bold leading-3 tabular-nums" style={{ color: 'var(--t-magenta-500)' }}>{v > 0 ? v : ''}</span>
              <span
                className="h-7 w-full rounded-[5px]"
                style={v > 0
                  ? { backgroundColor: 'var(--t-magenta-500)' }
                  : { backgroundColor: futuro ? 'color-mix(in srgb, var(--foreground) 3%, transparent)' : 'color-mix(in srgb, var(--foreground) 7%, transparent)' }}
              />
              <span className={cn('text-[9px] tabular-nums', !clave && 'invisible @lg:visible', dia === mes.hoy ? 'font-bold text-foreground' : futuro ? 'text-muted-foreground' : 'text-foreground/80')}>{dia}</span>
            </div>
          );
        })}
      </div>
    </TarjetaGrafica>
  );
}
