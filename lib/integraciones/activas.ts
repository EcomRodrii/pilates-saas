// ¿Tiene el estudio encendida esta conexión? Lo pregunta el panel para cualquiera
// del equipo (qué plataformas venden plazas, si hay cerradura que abrir al pasar
// lista).
//
// `integraciones` (salud y, en `config`, las credenciales cifradas) solo la lee la
// propietaria (migr 20260930110315); para gerencia y recepción llega vacía, y el
// panel les escondía ClassPass y no abría la puerta con Kisi. El resto del equipo
// recibe al arrancar solo los TIPOS activos (`integraciones_activas()`, migr
// 20261007144207).
//
// Si la fila está (la propietaria), manda su `activo`: es lo que cambia al
// encender o apagar en Conexiones sin recargar. Si no, lo que dijo el servidor.
import type { Integracion, TipoIntegracion } from '../types.ts';

export function integracionActiva(
  tipo: TipoIntegracion,
  integraciones: readonly Pick<Integracion, 'tipo' | 'activo'>[],
  activasDelServidor: readonly string[],
): boolean {
  const fila = integraciones.find(i => i.tipo === tipo);
  return fila ? fila.activo : activasDelServidor.includes(tipo);
}
