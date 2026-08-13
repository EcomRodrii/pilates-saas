// Contenido de la landing de Tentare Network — separado de
// components/landing/data.ts (que es de Tentare Manager) porque es un
// producto distinto con su propia narrativa, no una sección más de la
// landing principal.

export const NW = '#4F8A5B';
export const NW_SOFT = '#E7F0E6';

export const PROBLEMA_ITEMS = [
  {
    sin: 'Mandas tu currículum a doce estudios y no sabes si alguien lo ha abierto.',
    con: 'Publicas un perfil una vez. Lo ven los estudios que buscan justo tu especialidad.',
  },
  {
    sin: 'Te enteras de una sustitución por un grupo de WhatsApp al que ya casi no perteneces.',
    con: 'Los estudios te contactan a ti directamente cuando tu disponibilidad encaja.',
  },
  {
    sin: 'Negocias tu tarifa desde cero cada vez, sin saber qué es lo normal.',
    con: 'Marcas tu rango de tarifa una vez. Lo ven todos antes de escribirte.',
  },
  {
    sin: 'Das tu teléfono a cualquiera que pregunte por WhatsApp o Instagram.',
    con: 'Tu email y tu teléfono quedan privados hasta que tú aceptas hablar.',
  },
] as const;

export const PASOS = [
  {
    numero: '1',
    titulo: 'Creas tu perfil',
    texto: 'Especialidad (reformer, mat, máquina, yoga, HIIT), años de experiencia, disponibilidad y tarifa orientativa. Cinco minutos, no un formulario largo.',
  },
  {
    numero: '2',
    titulo: 'Los estudios te encuentran',
    texto: 'Buscan por ciudad, especialidad y disponibilidad. No mandas candidaturas a ciegas: apareces cuando encajas de verdad.',
  },
  {
    numero: '3',
    titulo: 'Te contactan y decides tú',
    texto: 'Tu email y tu teléfono se quedan privados hasta que aceptas la solicitud. Nadie te escribe sin tu permiso.',
  },
] as const;

export const CONFIANZA_ITEMS = [
  {
    titulo: 'Email verificado',
    texto: 'Todo perfil confirma su email antes de publicarse.',
  },
  {
    titulo: 'Experiencia confirmada',
    texto: 'Puedes pedir que un estudio que ya usa Tentare confirme que trabajaste ahí — se marca como verificada en tu perfil.',
  },
  {
    titulo: 'Actividad reciente',
    texto: 'Se nota si sigues buscando o si tu perfil lleva meses parado.',
  },
] as const;

export const FAQ_ITEMS_NETWORK = [
  {
    q: '¿Cuesta dinero crear mi perfil?',
    a: 'No. Publicar tu perfil en Tentare Network es gratis y sin comisión sobre lo que cobres a los estudios.',
  },
  {
    q: '¿Tengo que dejar mi trabajo actual?',
    a: 'No. Puedes marcarte como "disponible para sustituciones" aunque ya trabajes en otro estudio, o "buscando trabajo" si es lo que necesitas ahora mismo. Cambias el estado cuando quieras.',
  },
  {
    q: '¿Quién ve mi teléfono y mi email?',
    a: 'Nadie, hasta que tú aceptas una solicitud de contacto de un estudio. Antes de eso, solo ven tu perfil público: especialidad, experiencia, disponibilidad y tarifa orientativa.',
  },
  {
    q: '¿Cómo saben los estudios que mi experiencia es real?',
    a: 'Puedes pedir que un estudio donde trabajaste, si usa Tentare, confirme esa experiencia desde su propia cuenta — se marca como verificada en tu perfil, no es algo que rellenes tú misma.',
  },
  {
    q: '¿Puedo ocultar mi perfil si dejo de buscar?',
    a: 'Sí, en cualquier momento, sin perder los datos que ya rellenaste. Vuelves a publicarlo cuando quieras.',
  },
  {
    q: '¿Necesito que mi estudio use Tentare para unirme?',
    a: 'No. Tu perfil en Network es una cuenta independiente, sin ningún estudio detrás. Da igual el software que use el estudio donde trabajas.',
  },
] as const;
