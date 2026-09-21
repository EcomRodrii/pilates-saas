import Link from 'next/link';
import { Clock } from 'lucide-react';

/**
 * «Control horario» explicado a quien gestiona el equipo, en el sitio donde ya
 * está: mientras quede alguna instructora sin relación con el estudio
 * (contratada/autónoma), se enseña; en cuanto no queda ninguna, desaparece.
 *
 * Existe porque la función cambia lo que pasa a fin de mes (una clase sin
 * confirmar no deja confirmar la liquidación) y eso no se puede descubrir
 * leyendo la ayuda cuando ya estás bloqueada.
 */
export function AvisoControlHorario({ pendientes, enLiquidaciones = false }: {
  pendientes: { id: string; nombre: string }[];
  enLiquidaciones?: boolean;
}) {
  if (pendientes.length === 0) return null;
  const nombres = pendientes.length <= 3
    ? pendientes.map((p) => p.nombre).join(', ')
    : `${pendientes.slice(0, 3).map((p) => p.nombre).join(', ')} y ${pendientes.length - 3} más`;

  return (
    <section data-testid="aviso-control-horario" aria-labelledby="aviso-control-horario-titulo"
      className="rounded-2xl border border-brand/30 bg-brand/5 p-5 text-[13px]">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Clock size={16} />
        </span>
        <div className="min-w-0 space-y-2">
          <h2 id="aviso-control-horario-titulo" className="text-[14px] font-semibold text-foreground">
            Control horario: dinos cómo trabaja cada instructora
          </h2>
          <p className="text-muted-foreground">
            Tus instructoras empiezan cada clase desde su app («Empezar clase») y Tentare anota si la dieron y a qué hora.
            {' '}<strong className="text-foreground">Contratada</strong>: además ficha su jornada, como exige la ley.
            {' '}<strong className="text-foreground">Autónoma</strong>: no ficha, y se le paga por las clases que da.
          </p>
          <p className="text-muted-foreground">
            A fin de mes, una clase que terminó sin saberse si se dio no deja confirmar la liquidación: lo confirma ella
            desde su app, o tú en <Link href="/equipo/tiempo-trabajado" className="underline">Tiempo trabajado</Link>.
          </p>
          <p className="text-foreground" data-testid="aviso-control-horario-faltan">
            {enLiquidaciones ? 'Elige la relación en su tarjeta, aquí abajo. ' : ''}
            Falta decirlo de {pendientes.length === 1 ? 'una instructora' : `${pendientes.length} instructoras`}: {nombres}.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {!enLiquidaciones && (
              <Link href="/equipo/liquidaciones" className="px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12px] font-semibold hover:brightness-95">
                Elegir contratada o autónoma
              </Link>
            )}
            <Link href="/ayuda/instructores/control-horario" className="px-3 py-1.5 rounded-lg border border-border bg-card text-[12px] font-semibold hover:bg-muted">
              Cómo funciona
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
