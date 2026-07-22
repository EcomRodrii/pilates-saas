'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TabServiciosCita } from './tab-servicios-cita';
import { TabHorarioCitas } from './tab-horario-citas';

// Servicios de cita y Horario de citas eran 2 pestañas sueltas en el nivel
// superior de Configuración, pero ambas configuran el mismo dominio (las
// citas 1:1 auto-reservables). Se unifican aquí bajo UNA pestaña "Citas" con
// su propia sub-navegación, mismo patrón que Gamificación y Clases y salas.
// Los 2 componentes internos no se tocan: siguen siendo el mismo CRUD de
// siempre, solo cambia dónde viven.
type Sub = 'servicios' | 'horario';
const SUBS: { id: Sub; label: string }[] = [
  { id: 'servicios', label: 'Servicios' },
  { id: 'horario', label: 'Horario' },
];

export function TabCitas({ showToast, sub: subInicial }: { showToast: (m: string) => void; sub?: string }) {
  const [sub, setSub] = useState<Sub>(SUBS.some(s => s.id === subInicial) ? (subInicial as Sub) : 'servicios');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-foreground">Citas</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Servicios de cita 1:1 auto-reservables y el horario en que están disponibles.
        </p>
      </div>

      <Tabs value={sub} onValueChange={(v) => setSub(v as Sub)}>
        <TabsList>
          {SUBS.map(s => (
            <TabsTrigger key={s.id} value={s.id}>{s.label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="servicios"><TabServiciosCita showToast={showToast} /></TabsContent>
        <TabsContent value="horario"><TabHorarioCitas showToast={showToast} /></TabsContent>
      </Tabs>
    </div>
  );
}
