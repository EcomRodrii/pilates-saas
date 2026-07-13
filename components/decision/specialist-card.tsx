'use client';

import { Heart, TrendingUp, Calendar, Megaphone, Wallet, UsersRound, UserPlus, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PorEspecialistaAPI } from './use-decisiones';

// "Mi Equipo" (Bible doc 4/doc 3): cada especialista es una tarjeta con
// estado, trabajo pendiente e impacto — nunca gráficos.
const ESPECIALISTA_INFO: Record<string, { nombre: string; icon: LucideIcon }> = {
  RETENCION: { nombre: 'Especialista en Retención', icon: Heart },
  INGRESOS: { nombre: 'Especialista en Ingresos', icon: TrendingUp },
  AGENDA: { nombre: 'Especialista en Agenda', icon: Calendar },
  CAPTACION: { nombre: 'Especialista en Captación', icon: UserPlus },
  MARKETING: { nombre: 'Especialista en Marketing', icon: Megaphone },
  FINANZAS: { nombre: 'Especialista Financiero', icon: Wallet },
  EQUIPO: { nombre: 'Especialista en Equipo', icon: UsersRound },
};

const ESTADO_INFO: Record<PorEspecialistaAPI['estado'], { label: string; color: string; bg: string }> = {
  EXCELENTE: { label: 'Excelente', color: '#059669', bg: '#ECFDF5' },
  BUENO: { label: 'Bueno', color: '#059669', bg: '#ECFDF5' },
  ATENCION: { label: 'Atención', color: '#D97706', bg: '#FFFBEB' },
  CRITICO: { label: 'Crítico', color: '#DC2626', bg: '#FEF2F2' },
};

export function SpecialistCard({ data }: { data: PorEspecialistaAPI }) {
  const info = ESPECIALISTA_INFO[data.especialista];
  if (!info) return null;
  const estado = ESTADO_INFO[data.estado];
  const Icon = info.icon;

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon size={16} className="shrink-0 text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground truncate">{info.nombre}</span>
          </div>
          <Badge style={{ backgroundColor: estado.bg, color: estado.color }} className="shrink-0">
            {estado.label}
          </Badge>
        </div>

        <p className="text-[13px] text-muted-foreground">
          {data.pendientes === 0
            ? 'Todo en orden.'
            : `${data.pendientes} ${data.pendientes === 1 ? 'situación pendiente' : 'situaciones pendientes'}.`}
        </p>

        {data.impactoTotal && (
          <p className="text-[16px] font-bold text-foreground">
            {data.impactoTotal.valor >= 0 ? '+' : ''}{data.impactoTotal.valor}€/mes
          </p>
        )}

        {data.pendientes > 0 && (
          <a href="#prioridades" className="text-[12px] font-semibold" style={{ color: 'var(--brand-secondary)' }}>
            Revisar
          </a>
        )}
      </CardContent>
    </Card>
  );
}
