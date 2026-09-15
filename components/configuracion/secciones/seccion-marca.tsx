'use client';

import { TabMarca } from '@/components/configuracion/tab-marca';
import { TabColorMarca } from '@/components/configuracion/tab-color-marca';
import { TabTextosApp } from '@/components/configuracion/tab-textos-app';

// Marca: cómo te reconocen tus alumnas. El logo estaba en «Mi app y mi web» y
// el color en otra pantalla (/configuracion/apariencia/panel); ahora van juntos.
// Cada tarjeta guarda lo suyo: el logo al subirlo, el color con su botón y los
// textos con su barra.
//
// La portada y la tipografía del portal no tienen fila: su editor está en
// mantenimiento y su ruta no se abre (app/(dashboard)/configuracion/apariencia).
export function SeccionMarca({ showToast }: { showToast: (m: string) => void }) {
  return (
    <>
      <TabMarca showToast={showToast} />
      <TabColorMarca showToast={showToast} />
      <TabTextosApp showToast={showToast} />
    </>
  );
}
