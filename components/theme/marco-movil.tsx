// El marco de móvil de las vistas previas del editor.
//
// Un solo componente y no las mismas clases copiadas en cada preview. El
// motivo no es ahorrar líneas: es que `HomePreview` (el de las páginas) y
// `ThemePreview` (el de Ajustes) se ven UNO DESPUÉS DEL OTRO en el mismo
// hueco de la pantalla, al cambiar de modo. Con las clases duplicadas basta
// tocar una para que el móvil cambie de tamaño delante de quien está
// editando — pasó de verdad al actualizar solo el primero.
//
// 390 × 844 es el iPhone 12/13/14. El tamaño anterior, 320 con relación 9/19,
// no era ningún dispositivo: 320 dejó de existir con el iPhone SE de 2016 y
// la proporción estaba puesta a ojo.

// ⚠️ `w-[390px]` FIJO, no `w-full max-w-[390px]`. El marco vive dentro de un
// contenedor flex que se encoge al contenido, y ahí `w-full` es circular: el
// navegador lo resuelve por el ancho intrínseco de lo que hay DENTRO. Con dos
// placeholders de textos distintos, el mismo marco medía 293 px en un modo y
// 312 en el otro — un móvil que cambia de tamaño según la frase que lleve
// dentro. Medido, no supuesto: por eso está escrito aquí.
// `max-w-full` para que siga pudiendo encogerse si la columna es estrecha.
const ANCHO = 'mx-auto w-[390px] max-w-full';
const MARCO = 'aspect-[390/844] rounded-[2rem] border-[6px] border-black/85 overflow-hidden';

export function MarcoMovil({ children }: { children: React.ReactNode }) {
  return (
    <div className={ANCHO}>
      <div className={`${MARCO} shadow-xl bg-white`}>{children}</div>
    </div>
  );
}

/** El mismo marco, vacío, mientras no hay nada que enseñar dentro. */
export function MarcoMovilVacio({ children }: { children: React.ReactNode }) {
  return (
    <div className={ANCHO}>
      <div className={`${MARCO} bg-muted flex items-center justify-center text-center px-6`}>
        <p className="text-[12px] text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
