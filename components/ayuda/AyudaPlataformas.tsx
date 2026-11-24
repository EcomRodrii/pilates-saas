'use client';

import { useEffect, useState, type ReactNode } from 'react';

// Las pestañas «Escritorio» y «Móvil» de las guías de Shopify, para un paso que de verdad cambia según el aparato (casi siempre, cómo se llega a
// una pantalla: en el ordenador, el menú de la izquierda; en el móvil, el botón de menú de la barra de abajo). ⚠️ Solo se usa donde hay una
// diferencia real que se pueda comprobar en el panel: una pestaña con el mismo texto en las dos es ruido.
// Por defecto sale la de «Escritorio» (así la ve el servidor y quien no tiene JS); al montar, en una pantalla estrecha pasa a «Móvil».
export function AyudaPlataformas({ escritorio, movil }: { escritorio: ReactNode; movil: ReactNode }) {
  const [ver, setVer] = useState<'escritorio' | 'movil'>('escritorio');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depende del ancho de la pantalla, que el servidor no conoce
    if (window.matchMedia('(max-width: 767px)').matches) setVer('movil');
  }, []);
  const pestanas = [['escritorio', 'Escritorio'], ['movil', 'Móvil']] as const;
  return (
    <div className="ay-plat">
      <div role="tablist" aria-label="Según tu dispositivo" className="ay-plat-lista">
        {pestanas.map(([id, texto]) => (
          <button key={id} type="button" role="tab" id={`ay-plat-${id}`} aria-selected={ver === id} aria-controls={`ay-plat-panel-${id}`}
            tabIndex={ver === id ? 0 : -1} onClick={() => setVer(id)}
            onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') setVer(ver === 'escritorio' ? 'movil' : 'escritorio'); }}>
            {texto}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`ay-plat-panel-${ver}`} aria-labelledby={`ay-plat-${ver}`} className="ay-plat-panel">
        {ver === 'escritorio' ? escritorio : movil}
      </div>
    </div>
  );
}
