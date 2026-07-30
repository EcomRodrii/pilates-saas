// Novedades del panel — qué se ha implementado, en datos y no dentro del
// componente, para que crecer la lista sea añadir una entrada, no tocar UI.
//
// Pensado para que la propietaria vea que esto avanza cada día: mejoras,
// arreglos de errores y de rendimiento, contados en una frase, sin jerga
// técnica. Se añade una entrada por cada cambio real que le llega al panel o
// a la app de sus clientas — no hace falta detallar el cómo.

export type TipoNovedad = 'MEJORA' | 'ARREGLO' | 'RENDIMIENTO' | 'SEGURIDAD';

export interface Novedad {
  fecha: string; // YYYY-MM-DD
  titulo: string;
  descripcion: string;
  tipo: TipoNovedad;
}

export const NOVEDADES: Novedad[] = [
  {
    fecha: '2026-07-31', tipo: 'MEJORA',
    titulo: 'Reglas de reserva por tipo de clase',
    descripcion: 'Ahora puedes exigir plan, poner antelación mínima/máxima y permitir o no lista de espera de forma distinta para cada tipo de clase, no solo para todo el estudio.',
  },
  {
    fecha: '2026-07-31', tipo: 'SEGURIDAD',
    titulo: 'Ficha de la clienta mejor protegida',
    descripcion: 'La nota de seguimiento con IA de una clienta ya solo la ve quien debe (propietaria/instructora), no cualquier perfil con acceso al panel.',
  },
  {
    fecha: '2026-07-30', tipo: 'MEJORA',
    titulo: 'Bonos y Compras, cada cosa en su sitio',
    descripcion: '"Mi plan" se ha dividido en dos pantallas más claras en la app de tus clientas: Bonos (su saldo) y Compras (comprar, pagar y facturas).',
  },
  {
    fecha: '2026-07-30', tipo: 'ARREGLO',
    titulo: 'La plaza fija ya aparece en la app de la clienta',
    descripcion: 'Si una clienta tiene una plaza fija contratada, ahora se lo enseña su app — antes no llegaba a verse ahí aunque estuviera pagada.',
  },
  {
    fecha: '2026-07-30', tipo: 'MEJORA',
    titulo: 'El icono de tus avisos ya lleva tu logo',
    descripcion: 'Las notificaciones que reciben tus clientas en el móvil muestran el logo de tu estudio en vez del genérico de Tentare.',
  },
  {
    fecha: '2026-07-30', tipo: 'ARREGLO',
    titulo: 'Instalar el panel como app ya funciona bien',
    descripcion: 'Si añades el panel a la pantalla de inicio de tu móvil, ya abre el panel de verdad — antes te llevaba a la web pública por error.',
  },
  {
    fecha: '2026-07-30', tipo: 'RENDIMIENTO',
    titulo: 'Dos pantallas del móvil ya no se salían de la pantalla',
    descripcion: 'La ficha de una clienta y la pantalla de marcar entrada ("Leer un pase") desbordaban un poco a los lados en el móvil. Arreglado.',
  },
  {
    fecha: '2026-07-30', tipo: 'SEGURIDAD',
    titulo: 'Fotos y logos, mejor protegidos entre estudios',
    descripcion: 'Se ha cerrado un hueco que, en teoría, podía dejar sobrescribir el logo o una foto de perfil de otro estudio.',
  },
  {
    fecha: '2026-07-29', tipo: 'MEJORA',
    titulo: 'Aviso automático si hay una disputa de un cobro',
    descripcion: 'Si un banco reclama un cobro con tarjeta (disputa), ahora te avisamos en el panel en cuanto ocurre.',
  },
  {
    fecha: '2026-07-29', tipo: 'SEGURIDAD',
    titulo: 'Registro de quién mira la ficha de salud',
    descripcion: 'Queda constancia de cada vez que alguien del equipo abre la ficha de salud de una clienta — trazabilidad para tu tranquilidad y la suya.',
  },
];
