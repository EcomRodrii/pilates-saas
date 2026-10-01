import { PLAN_INFO, type Plan } from '@/lib/billing/entitlements';

// El nombre del plan tal como se enseña. «Founding Studio» va en Cormorant
// Garamond cursiva —la serif fina de tantos estudios de pilates— para que se
// lea como un nombre propio y no como una etiqueta (decisión del fundador,
// 2-oct-2026). Los otros dos planes heredan la letra de donde se pinten.
//
// ⚠️ Anula `text-transform`: varias tarjetas pintan el nombre en versalitas
// mono, y «FOUNDING STUDIO» en mayúsculas era justo lo que se quería quitar.
export function NombrePlan({ plan, className = '', tamano }: { plan: Plan; className?: string; tamano?: number }) {
  const nombre = PLAN_INFO[plan].nombre;
  if (plan !== 'BASE') return <>{nombre}</>;
  return <span className={`nombre-plan-founding ${className}`.trim()} style={tamano ? { fontSize: tamano } : undefined}>{nombre}</span>;
}
