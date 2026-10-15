import { Check } from 'lucide-react';
import { NombrePlan } from '@/components/planes/nombre-plan';
import {
  FRASE_FOUNDING,
  GRATIS_MARGEN_DIAS,
  SI_PASAS,
  TODO_MENOS_SEDES,
  TOPE_GRATIS,
} from '@/lib/landing/founding-gratis';

// El paso «Tu plan» del alta con FOUNDING_GRATIS encendido para todos
// (lib/alta/founding-gratis-alta.ts). Ya no se elige: todo estudio nuevo empieza
// en Founding Studio gratis, y el panel lo pasa a ese plan al abrirse aunque se
// hubiera elegido otro. Por eso aquí se cuenta qué es y qué pasa si se crece, en
// vez de enseñar un selector que no decide nada. Lo mismo que dicen /precios y la
// home, de la misma fuente (lib/landing/founding-gratis.ts).
export function PlanGratisAlta() {
  const puntos = [
    `${TODO_MENOS_SEDES}.`,
    `${TOPE_GRATIS}.`,
    `${SI_PASAS.charAt(0).toUpperCase()}${SI_PASAS.slice(1)}, sin tope de alumnas ni de reservas. IVA incluido.`,
    `Si te pasas, tienes ${GRATIS_MARGEN_DIAS} días para contratarlo, y te avisamos antes.`,
    'Sin tarjeta y sin permanencia.',
  ];
  return (
    <div className="rounded-2xl border-2 border-brand bg-brand/[0.06] p-4 shadow-sm sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[15px] font-bold text-foreground"><NombrePlan plan="BASE" /></div>
        <span className="text-[28px] font-extrabold leading-none tracking-tight text-foreground">Gratis</span>
      </div>
      {/* La frase del fundador, en la cursiva del nombre del plan, como en /precios. */}
      <p className="nombre-plan-founding mt-3" style={{ fontSize: 17, lineHeight: 1.35 }}>{FRASE_FOUNDING}</p>
      <ul className="mt-4 space-y-2">
        {puntos.map((p) => (
          <li key={p} className="flex gap-2 text-[13.5px] leading-snug text-muted-foreground">
            <Check size={15} className="mt-0.5 shrink-0 text-brand-medio" aria-hidden="true" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
