import { Heart, TrendingUp, Calendar, Megaphone, Wallet, UserCog, UserPlus, Rocket, type LucideIcon } from 'lucide-react';

// Nombre corto + icono por especialista — única fuente de verdad, usada por
// SpecialistCard ("Mi Equipo") y por RecommendationCard (atribución de cada
// recomendación). Antes vivía solo dentro de specialist-card.tsx; extraído
// para que un especialista nuevo (como pasó con CAPTACION en DecisionFlag,
// P2-5) no pueda faltar en un sitio y no en el otro.
export const ESPECIALISTA_INFO: Record<string, { nombre: string; icon: LucideIcon }> = {
  RETENCION: { nombre: 'Retención', icon: Heart },
  INGRESOS: { nombre: 'Ingresos', icon: TrendingUp },
  AGENDA: { nombre: 'Agenda', icon: Calendar },
  CAPTACION: { nombre: 'Captación', icon: UserPlus },
  MARKETING: { nombre: 'Marketing', icon: Megaphone },
  FINANZAS: { nombre: 'Finanzas', icon: Wallet },
  // UserCog y no UsersRound: es el mismo concepto que la entrada /equipo del
  // sidebar, y "personas" a secas ya significa clientas en todo el panel.
  EQUIPO: { nombre: 'Equipo', icon: UserCog },
  ONBOARDING: { nombre: 'Onboarding', icon: Rocket },
};
