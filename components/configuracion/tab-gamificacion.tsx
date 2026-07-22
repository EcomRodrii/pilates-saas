'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TabRecompensas } from './tab-recompensas';
import { TabLogros } from './tab-logros';
import { TabNiveles } from './tab-niveles';
import { TabRetos } from './tab-retos';

// Antes Recompensas/Logros/Niveles/Retos eran 4 pestañas sueltas en el nivel
// superior de Configuración, todas para la misma función (la gamificación que
// ve la socia en su portal: rachas, logros, niveles, recompensas y retos). Se
// unifican aquí bajo UNA pestaña "Gamificación" con su propia sub-navegación,
// para que el nivel superior no se llene de entradas que en realidad son una
// misma pieza. Los 4 componentes internos no se tocan: siguen siendo el mismo
// CRUD de siempre, solo cambia dónde viven.
type Sub = 'recompensas' | 'logros' | 'niveles' | 'retos';
const SUBS: { id: Sub; label: string }[] = [
  { id: 'recompensas', label: 'Recompensas' },
  { id: 'logros', label: 'Logros' },
  { id: 'niveles', label: 'Niveles' },
  { id: 'retos', label: 'Retos' },
];

export function TabGamificacion({ showToast, sub: subInicial }: { showToast: (m: string) => void; sub?: string }) {
  const [sub, setSub] = useState<Sub>(SUBS.some(s => s.id === subInicial) ? (subInicial as Sub) : 'recompensas');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-foreground">Gamificación</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Recompensas, logros, niveles y retos que ven tus socias en su portal.
        </p>
      </div>

      <Tabs value={sub} onValueChange={(v) => setSub(v as Sub)}>
        <TabsList>
          {SUBS.map(s => (
            <TabsTrigger key={s.id} value={s.id}>{s.label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="recompensas"><TabRecompensas showToast={showToast} /></TabsContent>
        <TabsContent value="logros"><TabLogros showToast={showToast} /></TabsContent>
        <TabsContent value="niveles"><TabNiveles showToast={showToast} /></TabsContent>
        <TabsContent value="retos"><TabRetos showToast={showToast} /></TabsContent>
      </Tabs>
    </div>
  );
}
