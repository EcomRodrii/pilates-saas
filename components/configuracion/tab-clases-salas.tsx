'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TabClases } from './tab-clases';
import { TabSalas } from './tab-salas';

// Clases y Salas eran 2 pestañas sueltas en el nivel superior de
// Configuración, pero ambas configuran el mismo dominio (la agenda de clases
// en grupo). Se unifican aquí bajo UNA pestaña "Clases y salas" con su propia
// sub-navegación, mismo patrón que Gamificación. Los 2 componentes internos
// no se tocan: siguen siendo el mismo CRUD de siempre, solo cambia dónde viven.
type Sub = 'clases' | 'salas';
const SUBS: { id: Sub; label: string }[] = [
  { id: 'clases', label: 'Clases' },
  { id: 'salas', label: 'Salas' },
];

export function TabClasesSalas({ showToast, sub: subInicial }: { showToast: (m: string) => void; sub?: string }) {
  const [sub, setSub] = useState<Sub>(SUBS.some(s => s.id === subInicial) ? (subInicial as Sub) : 'clases');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-foreground">Clases y salas</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Los tipos de clase que ofreces y las salas donde se imparten.
        </p>
      </div>

      <Tabs value={sub} onValueChange={(v) => setSub(v as Sub)}>
        <TabsList>
          {SUBS.map(s => (
            <TabsTrigger key={s.id} value={s.id}>{s.label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="clases"><TabClases showToast={showToast} /></TabsContent>
        <TabsContent value="salas"><TabSalas showToast={showToast} /></TabsContent>
      </Tabs>
    </div>
  );
}
