// Datos de muestra compartidos por las vistas previas de emails/.
//
// Este fichero es .ts a propósito: el servidor de `email dev` solo considera
// email un fichero .js/.jsx/.tsx CON export default, así que un .ts nunca
// aparece como una plantilla vacía en la lista.
export const MARCA = {
  estudioNombre: 'Estudio Aravaca',
  // Pon aquí la URL de un logo real (PNG/JPG, nunca SVG) para verlo en cabecera.
  logoUrl: null as string | null,
  colorPrimario: '#343825',
};

export const SOCIA = 'Ana García';
export const PROPIETARIA = 'Laura Méndez';
export const INSTRUCTORA = 'Marta Ruiz';

export const CLASE = {
  claseNombre: 'Reformer Iniciación',
  fecha: 'Lunes 4 de agosto',
  hora: '09:00',
  sala: 'Sala 1',
  instructor: INSTRUCTORA,
};

export const CUANDO = 'lunes 4 de agosto a las 09:00';
export const URL_MUESTRA = 'https://www.tentare.app/ejemplo';
