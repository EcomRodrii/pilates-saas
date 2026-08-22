// Detecta un intento de travesía de ruta ("..") antes de que la ruta se use
// para componer una clave de objeto en R2.
//
// El ataque real (auditoría 21/22-ago, C-1 — zip-slip): el nombre de una
// entrada del ZIP se usaba tal cual para componer la clave de R2
// (`temas-importados/<studio>/<id>/<ruta>`), y `new URL(...)` COLAPSA los
// ".." antes de firmar y antes de enviar el PUT. Una entrada llamada
// `../../OTRO_STUDIO/index.html` firmaba y subía fuera del prefijo del
// estudio dueño del import — sobrescribiendo el tema publicado o el backup
// de OTRO estudio, mismo bucket.
//
// Se comprueba el segmento de la RUTA, no el pathname de una URL ya
// construida: comparar pathnames rechazaría claves legítimas con espacios o
// acentos (el importador de temas las produce), y normalizar antes de
// comparar reintroduce el mismo problema que esto existe para detectar.
export function rutaConTravesia(ruta: string): boolean {
  return ruta.split('/').some((segmento) => segmento === '..' || segmento === '');
}
