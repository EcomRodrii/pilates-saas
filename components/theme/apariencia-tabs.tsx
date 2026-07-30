'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ThemeEditor } from './theme-editor';
import { HomeEditor } from './home-editor';
import { ContenidoPortalEditor } from './contenido-portal-editor';

// Pestañas de Apariencia. (La personalización del menú lateral se retiró
// temporalmente: rompía el render del menú y hay que rehacerla verificándola.)
export function AparienciaTabs() {
  return (
    <Tabs defaultValue="marca" className="w-full">
      <TabsList className="h-9">
        <TabsTrigger value="marca">Marca y colores</TabsTrigger>
        <TabsTrigger value="inicio">Inicio</TabsTrigger>
        <TabsTrigger value="contenido-portal">Contenido del portal</TabsTrigger>
      </TabsList>

      <TabsContent value="marca" className="pt-6">
        <ThemeEditor />
      </TabsContent>

      <TabsContent value="inicio" className="pt-6">
        <div className="mb-4">
          <h2 className="text-[15px] font-bold text-foreground">Pantalla de inicio</h2>
          <p className="text-[13px] text-muted-foreground">Reordena y oculta las secciones del dashboard (KPIs, ingresos, clases…).</p>
        </div>
        <HomeEditor />
      </TabsContent>

      <TabsContent value="contenido-portal" className="pt-6">
        <div className="mb-4">
          <h2 className="text-[15px] font-bold text-foreground">Contenido del portal</h2>
          <p className="text-[13px] text-muted-foreground">Mensaje destacado y banners que ven tus clientas en la app del estudio.</p>
        </div>
        <ContenidoPortalEditor />
      </TabsContent>
    </Tabs>
  );
}
