'use client';

import { Check, CircleDot } from 'lucide-react';
import type { BadgesNetwork } from '@/lib/network/tipos';

// Lista de badges de confianza en el perfil público — docs/NETWORK-
// IMPLEMENTATION-PLAN.md. Cada badge es un hecho verificable con su propio
// origen (Email verificado ↔ Supabase Auth, Experiencia verificada ↔ un
// estudio real la confirmó, Referencia ↔ una persona externa la confirmó),
// nunca una palabra "verificado" genérica. Solo se pintan los badges
// ciertos — ausencia de un badge no se marca en rojo ni se explica, para no
// convertir esto en una lista de carencias.

const ETIQUETAS: { clave: keyof Omit<BadgesNetwork, 'activaRecientemente'>; texto: string }[] = [
  { clave: 'emailVerificado', texto: 'Email verificado' },
  { clave: 'experienciaVerificada', texto: 'Experiencia verificada' },
  { clave: 'referenciaProfesional', texto: 'Referencia profesional' },
  { clave: 'identidadVerificada', texto: 'Identidad verificada' },
];

export function ListaBadgesNetwork({ badges }: { badges: BadgesNetwork }) {
  const activos = ETIQUETAS.filter(({ clave }) => badges[clave]);
  if (activos.length === 0 && !badges.activaRecientemente) return null;

  return (
    <div className="space-y-1.5">
      {activos.map(({ clave, texto }) => (
        <p key={clave} className="text-[12px] text-foreground flex items-center gap-1.5">
          <Check size={14} className="text-success shrink-0" />
          {texto}
        </p>
      ))}
      {badges.activaRecientemente && (
        <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
          <CircleDot size={11} className="text-success shrink-0" fill="currentColor" />
          Activa recientemente
        </p>
      )}
    </div>
  );
}
