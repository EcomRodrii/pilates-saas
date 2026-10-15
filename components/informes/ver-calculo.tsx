// «Ver cálculo»: una cifra con su base, línea a línea, para que nadie tenga que
// fiarse de un número que no puede comprobar («nunca una cifra sin respaldo»).
// Local a Informes por ahora; si otra pantalla lo necesita, se asciende.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Signo = '' | '−' | '+' | '=' | '÷';

/** Lo que oye un lector de pantalla en lugar del símbolo. */
const SIGNO_LEIDO: Record<Exclude<Signo, ''>, string> = { '−': 'menos', '+': 'más', '=': 'igual a', '÷': 'entre' };

export interface LineaCalculo {
  /** Corto: «Caja (TPV)». */
  etiqueta: ReactNode;
  /** La explicación, debajo y en gris: «un ticket puede llevar un bono dentro». */
  detalle?: ReactNode;
  signo?: Signo;
  valor: ReactNode;
  /** El resultado: en negrita y con una raya encima. */
  resultado?: boolean;
}

export function VerCalculo({ lineas, nota, testId }: { lineas: readonly LineaCalculo[]; nota?: ReactNode; testId?: string }) {
  return (
    <div className="max-w-xl" data-testid={testId}>
      <table className="w-full text-[12.5px]">
        <tbody>
          {lineas.map((l, k) => (
            <tr key={k} className={cn(l.resultado ? 'border-t border-border font-semibold text-foreground' : 'text-foreground')}>
              <td className="w-5 py-1 pr-1 align-top tabular-nums text-muted-foreground">
                {l.signo && <><span aria-hidden>{l.signo}</span><span className="sr-only">{SIGNO_LEIDO[l.signo]}</span></>}
              </td>
              <td className="py-1 pr-3 text-pretty">
                {l.etiqueta}
                {l.detalle && <span className="block text-[12px] font-normal text-muted-foreground">{l.detalle}</span>}
              </td>
              <td className="whitespace-nowrap py-1 text-right align-top tabular-nums">{l.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {nota && <p className="mt-2 text-[12px] text-muted-foreground text-pretty">{nota}</p>}
    </div>
  );
}
