import { CheckCircle2, ClipboardList } from 'lucide-react';

// Los bloques de una guía, con la forma de los de help.shopify.com (medido el 23-nov-2026): pasos numerados sin círculos de color,
// «Sugerencia» en una caja azul clara con icono y el cierre en una caja verde. La API (numero, titulo, children) no cambia: las ~130
// guías escritas siguen valiendo tal cual.

export function AyudaPaso({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="ay-paso">
      <span className="ay-paso-n" aria-hidden="true">{numero}.</span>
      <div className="ay-paso-cuerpo">
        <h3>{titulo}</h3>
        <div>{children}</div>
      </div>
    </div>
  );
}

export function AyudaAntesDeEmpezar({ children }: { children: React.ReactNode }) {
  return (
    <aside className="ay-caja ay-caja--azul">
      <p className="ay-caja-t"><ClipboardList size={16} aria-hidden="true" /> Antes de empezar</p>
      <div>{children}</div>
    </aside>
  );
}

export function AyudaResultado({ children }: { children: React.ReactNode }) {
  return (
    <aside className="ay-caja ay-caja--verde">
      <p className="ay-caja-t"><CheckCircle2 size={16} aria-hidden="true" /> Resultado</p>
      <div>{children}</div>
    </aside>
  );
}
