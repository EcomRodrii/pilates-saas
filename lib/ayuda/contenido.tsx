import type { ComponentType } from 'react';

// Mapa slug → componente de contenido, para los artículos con estado
// 'publicado' en lib/ayuda/registro.ts. Cada componente vive en
// components/ayuda/articulos/ y exporta el cuerpo del artículo (sin chrome:
// eso lo pone ArticuloShell). Un slug sin entrada aquí nunca debería tener
// estado 'publicado' — app/ayuda/[categoria]/[articulo]/page.tsx lo comprueba.
const CONTENIDO: Record<string, () => Promise<{ default: ComponentType }>> = {
  'empezar/crear-tu-cuenta': () => import('@/components/ayuda/articulos/empezar-crear-tu-cuenta'),
  'portal/que-es-el-portal': () => import('@/components/ayuda/articulos/portal-que-es-el-portal'),
  'portal/acceso-de-una-clienta': () => import('@/components/ayuda/articulos/portal-acceso-de-una-clienta'),
  'reservas/crear-una-clase': () => import('@/components/ayuda/articulos/reservas-crear-una-clase'),
  'reservas/editar-o-cancelar-una-clase': () => import('@/components/ayuda/articulos/reservas-editar-o-cancelar-una-clase'),
  'reservas/lista-de-espera': () => import('@/components/ayuda/articulos/reservas-lista-de-espera'),
  'reservas/reglas-de-reserva-por-clase': () => import('@/components/ayuda/articulos/reservas-reglas-de-reserva-por-clase'),
  'reservas/no-shows': () => import('@/components/ayuda/articulos/reservas-no-shows'),
  'clientes/crear-una-clienta': () => import('@/components/ayuda/articulos/clientes-crear-una-clienta'),
  'clientes/ficha-de-clienta': () => import('@/components/ayuda/articulos/clientes-ficha-de-clienta'),
  'clientes/importar-clientes': () => import('@/components/ayuda/articulos/clientes-importar-clientes'),
  'instructores/dar-de-alta-una-instructora': () => import('@/components/ayuda/articulos/instructores-dar-de-alta-una-instructora'),
  'instructores/disponibilidad-y-tarifas': () => import('@/components/ayuda/articulos/instructores-disponibilidad-y-tarifas'),
  'instructores/sustituciones': () => import('@/components/ayuda/articulos/instructores-sustituciones'),
  'instructores/permisos-por-rol': () => import('@/components/ayuda/articulos/instructores-permisos-por-rol'),
  'pagos/conectar-stripe': () => import('@/components/ayuda/articulos/pagos-conectar-stripe'),
  'pagos/tarjeta-guardada-y-cobro-automatico': () => import('@/components/ayuda/articulos/pagos-tarjeta-guardada-y-cobro-automatico'),
  'pagos/cobros-fallidos': () => import('@/components/ayuda/articulos/pagos-cobros-fallidos'),
  'pagos/reembolsos': () => import('@/components/ayuda/articulos/pagos-reembolsos'),
  'pagos/facturas': () => import('@/components/ayuda/articulos/pagos-facturas'),
  'pagos/prueba-de-7-dias': () => import('@/components/ayuda/articulos/pagos-prueba-de-7-dias'),
  'bonos/tipos-de-bono': () => import('@/components/ayuda/articulos/bonos-tipos-de-bono'),
  'bonos/crear-un-plan': () => import('@/components/ayuda/articulos/bonos-crear-un-plan'),
  'bonos/caducidad-de-un-bono': () => import('@/components/ayuda/articulos/bonos-caducidad-de-un-bono'),
  'bonos/renovaciones': () => import('@/components/ayuda/articulos/bonos-renovaciones'),
  'problemas/no-puedo-iniciar-sesion': () => import('@/components/ayuda/articulos/problemas-no-puedo-iniciar-sesion'),
  'problemas/una-clienta-no-puede-entrar': () => import('@/components/ayuda/articulos/problemas-una-clienta-no-puede-entrar'),
  'problemas/no-llega-un-email': () => import('@/components/ayuda/articulos/problemas-no-llega-un-email'),
  'problemas/no-llega-un-whatsapp': () => import('@/components/ayuda/articulos/problemas-no-llega-un-whatsapp'),
  'problemas/el-pago-falla-en-el-checkout': () => import('@/components/ayuda/articulos/problemas-el-pago-falla-en-el-checkout'),
  'problemas/una-reserva-no-aparece': () => import('@/components/ayuda/articulos/problemas-una-reserva-no-aparece'),
  'problemas/el-widget-no-carga': () => import('@/components/ayuda/articulos/problemas-el-widget-no-carga'),
  'problemas/un-bono-no-aparece': () => import('@/components/ayuda/articulos/problemas-un-bono-no-aparece'),
  'empezar/configurar-tu-estudio': () => import('@/components/ayuda/articulos/empezar-configurar-tu-estudio'),
  'empezar/primera-semana-de-clases': () => import('@/components/ayuda/articulos/empezar-primera-semana-de-clases'),
  'widget/que-es-el-widget': () => import('@/components/ayuda/articulos/widget-que-es-el-widget'),
  'widget/instalar-con-html': () => import('@/components/ayuda/articulos/widget-instalar-con-html'),
  'widget/instalar-en-wordpress': () => import('@/components/ayuda/articulos/widget-instalar-en-wordpress'),
  'automatizaciones/recordatorios-automaticos': () => import('@/components/ayuda/articulos/automatizaciones-recordatorios-automaticos'),
  'integraciones/integraciones-disponibles': () => import('@/components/ayuda/articulos/integraciones-integraciones-disponibles'),
  'app/que-ve-una-alumna': () => import('@/components/ayuda/articulos/app-que-ve-una-alumna'),
  'configuracion/datos-del-estudio': () => import('@/components/ayuda/articulos/configuracion-datos-del-estudio'),
  'configuracion/usuarios-y-permisos': () => import('@/components/ayuda/articulos/configuracion-usuarios-y-permisos'),
  'configuracion/marca': () => import('@/components/ayuda/articulos/configuracion-marca'),
  'informes/informes-disponibles': () => import('@/components/ayuda/articulos/informes-informes-disponibles'),
  'portal/personalizar-tu-portal': () => import('@/components/ayuda/articulos/portal-personalizar-tu-portal'),
};

export function contenidoDe(categoria: string, slug: string) {
  return CONTENIDO[`${categoria}/${slug}`];
}
