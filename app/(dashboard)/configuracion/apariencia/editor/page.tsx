import { redirect } from 'next/navigation';

// La ruta del editor de marca del portal, que existió hasta el 22-sep-2026.
//
// Se cerró el 7-sep y se borró el 22 al sustituirlo «Apariencia de tu app»
// (/configuracion/apariencia): de sus ~20 ajustes, 19 no llegaban a la app de
// la alumna y su vista previa apuntaba a una ruta ya borrada.
//
// La ruta se queda como redirección y no se borra: quien la tuviera guardada
// en marcadores —o la encuentre en un correo viejo— llega a la pantalla de
// hoy en vez de a un 404.
export default function AparienciaEditorPage() {
  redirect('/configuracion/apariencia');
}
