// Rediseño del Calendario — punto 10: la página NUNCA hace scroll, solo la
// rejilla (VistaDiaSalas/VistaSemana ya scrollean internamente con su propio
// overflow-y-auto). Este contenedor es el contrato: todo lo que no sea la
// rejilla (cabecera, métricas, filtros, franja de decisiones) es de altura
// fija; el hueco que sobra se lo lleva el hijo marcado `flex-1 min-h-0`.
//
// Verificable con `document.documentElement.scrollHeight === innerHeight`.
export function LienzoCalendario({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {children}
    </div>
  );
}
