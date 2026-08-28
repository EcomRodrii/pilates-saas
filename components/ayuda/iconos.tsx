import {
  BarChart3, CalendarDays, CodeXml, CreditCard, LayoutTemplate, LifeBuoy, Plug,
  Settings2, Smartphone, Sparkles, Ticket, UserRound, Users, Zap, type LucideIcon, type LucideProps,
} from 'lucide-react';

// Los slugs de icono del registro (lib/ayuda/registro.ts) son texto para que ese
// archivo no dependa de React — este mapa es el único sitio que los resuelve a
// un componente de verdad.
const ICONOS_AYUDA: Record<string, LucideIcon> = {
  Sparkles, CalendarDays, Users, UserRound, CreditCard, Ticket, LayoutTemplate,
  CodeXml, Zap, Plug, Smartphone, Settings2, BarChart3, LifeBuoy,
};

// Componente en vez de una función que devuelve un componente: resolver el
// icono y usarlo como JSX en el mismo render (`const Icono = iconoDe(...)`)
// dispara la regla react-hooks/static-components (un componente no puede
// "crearse" durante el render). Envolverlo aquí es la forma estable.
export function AyudaIcono({ nombre, ...props }: { nombre: string } & LucideProps) {
  const Icono = ICONOS_AYUDA[nombre] ?? Sparkles;
  return <Icono {...props} />;
}
