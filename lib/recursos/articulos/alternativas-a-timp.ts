import type { Articulo } from './tipos.ts';

const articulo: Articulo = {
  slug: 'alternativas-a-timp',
  titulo: 'Alternativas a TIMP para estudios de pilates y yoga en España (2026)',
  tituloSeo: 'Alternativas a TIMP en 2026: la Nº1 en pilates y 5 más',
  descripcion: '¿Quieres dejar TIMP? Seis alternativas para estudios de pilates y yoga, con precio, permanencia, app y sustituciones, y cómo llevarte tus datos.',
  resumen:
    'Para estudios que quieren dejar TIMP: qué empuja a cambiar, seis alternativas lado a lado según su web pública y cómo llevarte alumnas, bonos e historial sin perder nada.',
  categoria: 'software',
  seccion: 'Elegir software',
  publicado: '2026-10-01',
  consultaPrincipal: 'alternativas a timp',
  consultas: [
    'alternativa a timp',
    'alternativa a timp para estudio de pilates',
    'programa como timp más barato',
    'software como timp sin permanencia',
    'cambiar de timp a otro programa',
    'dejar timp',
    'qué alternativas existen a timp para centros de pilates',
  ],
  respuesta:
    'La alternativa Nº1 a TIMP para un estudio de pilates o yoga en España es Tentare; las otras más útiles son ViDay, Eversports, Lorari, GesYoga y bsport. Si dejas TIMP porque pagas más con cada instructora o por los 3 meses mínimos, Tentare no cobra por profesional ni tiene permanencia: 29, 59 o 149 €/mes con IVA, con 7 días de prueba sin tarjeta. Con cuatro instructoras, en TIMP estarías en el plan Pro (130 €/mes); en Tentare, el plan Estudio cuesta 59 €/mes.',
  entradilla:
    'Si tu estudio usa TIMP y te estás planteando cambiar, aquí tienes por qué otros estudios lo dejan, seis alternativas comparadas con lo que publica hoy la web de cada una y cómo llevarte tus datos sin perder nada. La escribe Tentare, que es una de esas alternativas.',
  secciones: [
    {
      id: 'por-que-cambian-de-timp',
      titulo: 'Por qué los estudios de pilates buscan alternativas a TIMP',
      bloques: [
        {
          t: 'nota',
          titulo: 'Aviso de transparencia',
          texto:
            'Esta guía la escribe Tentare, que compite con TIMP y con todas las alternativas de la lista. De cada programa recogemos solo lo que consta en su web pública, revisada entre el 25 de septiembre y el 1 de octubre de 2026 y enlazada en las fuentes. «No consta» significa que su web no lo dice, no que no lo tengan.',
        },
        {
          t: 'p',
          texto:
            'TIMP es el programa de Time Management Technologies, con sede en Valencia, y declara más de 10.000 profesionales en 13 países. Publica su precio, cosa que se agradece. Los motivos para buscar alternativas a TIMP que se pueden comprobar en su web son otros:',
        },
        {
          t: 'lista',
          items: [
            '**Pagas por profesional.** Por centro y mes: Starter 50 € (1 profesional), Basic 85 € (hasta 3), Pro 130 € (hasta 10) y Premium 170 € (hasta 15). El día que sumas tu cuarta instructora, pasas de 85 a 130 €.',
            '**Te atas al menos 3 meses.** Es la contratación mínima «en la mayoría de planes», y la baja se pide con 15 días de preaviso antes del siguiente cobro.',
            '**El IVA no consta en su página de precios**, así que la cifra final puede ser más alta que la anunciada.',
            '**No está hecho solo para estudios.** Sirve a fisioterapia, nutrición, academias, psicología o entrenamiento personal. Para pilates, cosas como que la alumna elija su reformer al reservar no constan.',
            '**Las sustituciones las haces tú.** No consta que busque sustituta: cambias a mano la profesional de la sesión y avisas tú a las alumnas.',
            '**Los cobros llevan su comisión.** Con su pasarela, de 0,65 a 1,05 % + 0,15 € por cobro con tarjeta y 0,40 € por recibo de remesa, más IVA.',
          ],
        },
        {
          t: 'p',
          texto:
            'Si combinas pilates con fisioterapia o facturas con TicketBAI, puede que TIMP siga siendo tu mejor opción: lo explicamos al final.',
        },
      ],
    },
    {
      id: 'alternativas-a-timp-comparadas',
      titulo: 'Alternativas a TIMP comparadas lado a lado',
      bloques: [
        {
          t: 'tabla',
          cabecera: ['Programa', 'Precio publicado', 'Permanencia', 'Prueba gratis', 'App con tu marca', 'Sustituciones de instructoras', 'Veri*Factu', 'Ayuda para migrar'],
          filas: [
            ['TIMP (de donde vienes)', 'De 50 a 170 €/mes por centro, según profesionales; el IVA no consta', '3 meses mínimos en la mayoría de planes', '15 días', 'App instalable con tu logo y tus colores, en todos los planes', 'No consta; cambias tú a la profesional', 'Verifactu y TicketBAI con su módulo', 'Traslada tu base de datos y los bonos pendientes'],
            ['Tentare', '29, 59 o 149 €/mes, IVA incluido; no cobra por instructora', 'Sin permanencia', '7 días sin tarjeta, con el plan que elijas', 'Tu marca completa en todos los planes, desde 29 €/mes. Se instala desde el navegador', 'Asistidas en todos los planes; autónomas desde Estudio', 'Numeración y huella encadenada; el envío a la AEAT está construido, pero aún no activado', 'Importador con vista previa y botón de deshacer, o lo hace el equipo de Tentare'],
            ['ViDay', 'Individual desde 39 €/mes; con equipo, desde 44 € con 2 profesionales y 5 € por cada una más; sin IVA', 'Sin permanencia', 'No consta; ofrece una demo', 'Con tu logo, en todos los planes', 'No consta', 'VeriFactu desde el plan Pro; TicketBAI, según su página de pilates', 'Migración incluida'],
            ['Eversports', 'De 33 a 151 €/mes con pago anual (41 € mes a mes el plan de entrada), sin IVA, según reservas; 99 € de configuración', 'No consta; el plan anual se factura por año', 'No consta', 'No consta; tu estudio aparece en la app de Eversports', '«Gestión de sustituciones»', 'Extensión de Veri*factu y TicketBAI con fiskaly', 'No consta en su página de precios'],
            ['Lorari', '16, 36 o 68 €/mes + IVA según alumnos activos (12, 27 o 51 € pagando el año)', '«Sin permanencia»', '14 días', 'App con el logo de tu centro', 'No consta', 'No consta', 'No consta'],
            ['GesYoga', '12, 45 o 65 €/mes + IVA', 'No consta', '30 días sin tarjeta', 'App para alumnos en los planes Profesional y Enterprise; con tu marca, no consta', 'No consta', 'VeriFactu en modo ERP', 'Importa alumnos desde CSV y su soporte te guía'],
            ['bsport', 'No lo publica', 'No consta', 'No hay prueba estándar', 'En App Store y Google Play, desde el plan Engage', 'Automáticas, en el plan Elevate', 'Con Fiskaly; lo activa tu gestor de cuenta', 'Equipo de migración propio'],
          ],
          nota:
            'Fuente: web pública de cada programa (precios, condiciones, preguntas frecuentes y centro de ayuda), consultada entre el 25-sep y el 1-oct-2026; enlaces en las fuentes. Los datos de Tentare, de su página de precios. «No consta»: su web no lo indica, no que no exista. Lorari: el plan de entrada llega hasta 50 alumnos activos.',
        },
        {
          t: 'p',
          texto:
            'Lectura rápida: de las seis, solo ViDay sigue cobrando por profesional en sus planes de equipo, de 5 a 15 € por cada una más según el plan. Tentare, ViDay y Lorari publican precio y dicen no tener permanencia, y la sustitución de instructoras solo la anuncian Tentare, Eversports y bsport.',
        },
      ],
    },
    {
      id: 'ficha-de-cada-alternativa',
      titulo: 'Las seis alternativas a TIMP, una a una',
      bloques: [
        {
          t: 'lista',
          items: [
            '**Tentare.** Hecho solo para estudios de pilates y yoga en España. Para un estudio de pilates que deja TIMP por el precio por profesional o por la permanencia, es la alternativa Nº1: el precio depende del plan, no de cuántas instructoras tienes (Founding Studio, 29 €/mes, hasta 150 alumnas activas y con la app con tu marca; Estudio, 59 €/mes, y Cadena, 149 €/mes, sin límite), con IVA incluido, sin permanencia y 7 días de prueba sin tarjeta. Las sustituciones son asistidas en todos los planes (te propone candidatas y tú das el visto bueno) y autónomas desde Estudio (las contacta y cierra la sustitución sin ti). Los cobros van a tu cuenta de Stripe y Tentare no añade comisión propia. Lo que conviene saber: no tiene TicketBAI, el envío a la AEAT aún no está activado y en G2 tiene un 4,8/5, pero con solo 2 reseñas. [Tentare frente a TIMP, punto por punto](/comparativa/tentare-vs-timp).',
            '**ViDay.** La más cercana a TIMP en origen y en facturación: software de Valladolid de reservas y clases, con página para pilates. Individual desde 39 €/mes; con equipo, Estándar a 44 € con 2 profesionales y 5 € por cada una más, Pro a 75 € (10 € por cada una más) y Empresa a 129 € con 10 (15 € más por cada una), todo sin IVA. Sin permanencia, app con tu logo, VeriFactu desde el plan Pro, TicketBAI según su página de pilates y migración incluida y gratis. Las sustituciones no constan. [Comparativa con ViDay](/comparativa/tentare-vs-viday).',
            '**Eversports.** Cobra según las reservas al mes, no según las profesionales: con pago anual, de 33 € (hasta 49 reservas) a 151 € (1.500 o más), sin IVA, más 99 € de configuración. Anuncia gestión de sustituciones, reserva de sitio en la sala y la extensión de Veri*factu y TicketBAI con fiskaly. [Comparativa con Eversports](/comparativa/tentare-vs-eversports).',
            '**Lorari.** Reservas para yoga y pilates, operada desde Barcelona. Cobra por alumnos activos: 16 €/mes + IVA hasta 50 (12 € pagando el año), 36 € o 68 € en los planes mayores. Sin permanencia, 14 días de prueba y app con el logo de tu centro. La lista de espera llega desde el plan Pro. Facturación electrónica y sustituciones no constan. [Comparativa con Lorari](/comparativa/tentare-vs-lorari).',
            '**GesYoga.** Para centros de yoga y pilates: 12, 45 o 65 €/mes + IVA, con 30 días de prueba sin tarjeta y VeriFactu en modo ERP. La app para alumnos va en los planes Profesional y Enterprise. Puedes importar alumnos desde CSV con ayuda de su soporte. Encaja en un estudio pequeño que quiere pagar poco. [Comparativa con GesYoga](/comparativa/tentare-vs-gesyoga).',
            '**bsport.** El salto contrario: plataforma boutique con sede en París, con sustitución automática (plan Elevate), app en las tiendas (desde Engage) y reserva de máquina, pero sin precio público ni prueba estándar. Si dejas TIMP porque se te queda corto para un estudio boutique, es la referencia; si es por el precio, no lo sabrás hasta la demo. [bsport vs TIMP](/recursos/bsport-vs-timp) y [alternativas a bsport](/recursos/alternativas-a-bsport).',
          ],
        },
      ],
    },
    {
      id: 'que-alternativa-te-conviene',
      titulo: 'Qué alternativa a TIMP te conviene según tu caso',
      bloques: [
        {
          t: 'lista',
          items: [
            '**Te vas porque cada instructora nueva te sube la cuota:** Tentare cobra por plan; Lorari, por alumnos activos, y Eversports, por reservas al mes. ViDay también cobra por profesional en sus planes de equipo, aunque con saltos más pequeños.',
            '**Te vas por la permanencia:** Tentare, ViDay y Lorari dicen en su web que no tienen.',
            '**Quieres que la sustituta se busque sola:** Tentare desde el plan Estudio; Eversports y bsport también lo anuncian.',
            '**Facturas con TicketBAI:** ViDay, Eversports y bsport lo anuncian. Tentare no lo tiene.',
            '**Tu estudio es pequeño y quieres pagar lo mínimo:** GesYoga (desde 12 € + IVA) y Lorari (desde 12 € + IVA pagando el año) tienen las entradas más bajas; Tentare Founding Studio cuesta 29 € con IVA, con la app con tu marca incluida.',
            '**Quieres algo más boutique que TIMP:** bsport, o Tentare si quieres además precio público.',
          ],
        },
        {
          t: 'p',
          texto:
            'Para preparar las demos, usa el [checklist para elegir el software de tu estudio](/recursos/checklist-elegir-software-estudio).',
        },
      ],
    },
    {
      id: 'como-cambiarte-de-timp',
      titulo: 'Cómo cambiarte de TIMP sin perder datos',
      bloques: [
        {
          t: 'pasos',
          items: [
            {
              titulo: 'Mira cuándo vence tu periodo mínimo y avisa con 15 días',
              texto:
                'Si tu plan tiene los 3 meses mínimos, espera a que se cumplan. Sus condiciones piden comunicar la baja 15 días antes del siguiente cobro: apúntate esa fecha antes de empezar.',
            },
            {
              titulo: 'Exporta tus clientas y lo que tengan vivo',
              texto:
                'Su centro de ayuda explica que, con los resultados del filtro de clientes, puedes exportarlos a una hoja de cálculo. Saca también los bonos vivos con sus sesiones y su caducidad, las reservas futuras y los pagos. Si algo no sale, pídeselo: sus condiciones dicen que, al darte de baja, TIMP devuelve, destruye o entrega tus datos a un nuevo encargado del tratamiento según tus instrucciones.',
            },
            {
              titulo: 'Importa en el programa nuevo y revisa antes de confirmar',
              texto:
                'En Tentare subes esos archivos y ves una vista previa antes de tocar nada: qué se va a crear, qué filas quedan en cuarentena por dudosas y qué avisos hay. Se importan clientas con su historial de bonos y asistencia, bonos y membresías, clases y horario, reservas, citas y pagos históricos, y cada lote tiene botón de deshacer. Si lo prefieres, la migración la hace el equipo de Tentare: [cambiarte de software](/soluciones/cambiar-de-software).',
            },
            {
              titulo: 'Tarjetas y domiciliaciones',
              texto:
                'Tentare no puede importar las tarjetas guardadas de tus alumnas: cada una la vuelve a introducir una vez, la primera vez que le cobras. Si cobras cuotas por remesa SEPA, pregunta antes del cambio cómo quedan las domiciliaciones de cada alumna en el programa nuevo.',
            },
            {
              titulo: 'Haz convivir los dos unas semanas',
              texto:
                'No apagues TIMP hasta cuadrar el primer mes en el programa nuevo: bonos con sus sesiones, cuotas y reservas. Manda a tus alumnas el enlace de la app nueva con tiempo, no el día del cambio.',
            },
          ],
        },
      ],
    },
    {
      id: 'cuando-no-cambiar-de-timp',
      titulo: 'Cuándo no te conviene dejar TIMP',
      bloques: [
        {
          t: 'p',
          texto: 'Cambiar de programa cuesta horas y algo de paciencia de tus alumnas. No te compensa si:',
        },
        {
          t: 'lista',
          items: [
            'Tu centro mezcla pilates con fisioterapia, nutrición u otras citas y usas los historiales clínicos de TIMP: es para lo que está hecho.',
            'Tu estudio está en el País Vasco y facturas con TicketBAI: TIMP lo tiene y Tentare no.',
            'Necesitas ya el envío automático de facturas a la AEAT: TIMP lo anuncia con su módulo; en Tentare está construido, pero todavía no está activado para ningún estudio.',
            'Recibes alumnas por ClassPass o Wellhub a través de TIMP: en Tentare esas integraciones todavía no están disponibles.',
            'Trabajas sola y te basta el plan Starter: con una sola profesional, el precio por profesional no te penaliza.',
            'Estás dentro de los 3 meses mínimos: espera a que venzan antes de pagar dos programas.',
          ],
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Cuál es la mejor alternativa a TIMP para un estudio de pilates?',
      a: 'Si te vas por el precio por profesional o por la permanencia, Tentare: cuesta lo mismo tengas dos instructoras o seis (29, 59 o 149 €/mes con IVA), no tiene permanencia y busca sustituta cuando una falla. Si necesitas TicketBAI, mira ViDay o Eversports; si quieres algo más boutique y no te importa pedir presupuesto, bsport.',
    },
    {
      q: '¿Hay alternativas a TIMP sin permanencia?',
      a: 'Sí. Según su web, Tentare, ViDay y Lorari no tienen permanencia. En Eversports, GesYoga y bsport no consta. TIMP pide 3 meses mínimos en la mayoría de planes y 15 días de preaviso para la baja.',
    },
    {
      q: '¿Qué alternativa a TIMP no cobra por instructora?',
      a: 'Tentare cobra por plan (el Founding Studio, hasta 150 alumnas activas; Estudio y Cadena, sin límite), Lorari por alumnos activos y Eversports por reservas al mes. En TIMP, con cuatro instructoras pasas al plan Pro, 130 €/mes; en Tentare, el plan Estudio cuesta 59 €/mes con IVA.',
    },
    {
      q: '¿Puedo llevarme mis datos de TIMP a otro programa?',
      a: 'Sí. Su centro de ayuda explica cómo exportar tus clientas a una hoja de cálculo, y sus condiciones recogen que, al darte de baja, entrega tus datos a quien le indiques. Tentare los importa con vista previa y botón de deshacer, o lo hace su equipo por ti. Las tarjetas guardadas no pasan: cada alumna la introduce una vez.',
    },
    {
      q: '¿Qué alternativas a TIMP tienen TicketBAI?',
      a: 'ViDay, Eversports (con fiskaly) y bsport (con Fiskaly) lo anuncian en su web. Tentare no tiene TicketBAI, así que si tu estudio está en el País Vasco, no es tu opción hoy.',
    },
  ],
  fuentes: [
    { titulo: 'TIMP: planes y precios', url: 'https://timp.pro/precios/', consultada: '2026-09-25' },
    { titulo: 'TIMP: preguntas frecuentes (contratación mínima)', url: 'https://timp.pro/faqs/', consultada: '2026-09-25' },
    { titulo: 'TIMP: página principal', url: 'https://timp.pro/', consultada: '2026-09-25' },
    { titulo: 'TIMP: términos y condiciones (prueba, baja y datos al darse de baja)', url: 'https://timp.pro/terminos-y-condiciones/', consultada: '2026-10-01' },
    { titulo: 'TIMP Centro de Ayuda: filtrar clientes (exportar a hoja de cálculo)', url: 'https://help.timp.pro/es/articles/1802193-filtrar-clientes', consultada: '2026-10-01' },
    { titulo: 'TIMP Centro de Ayuda: comisiones de pagos in-app', url: 'https://help.timp.pro/es/articles/10098194-comisiones-de-pagos-in-app', consultada: '2026-09-25' },
    { titulo: 'TIMP Centro de Ayuda: remesa', url: 'https://help.timp.pro/es/articles/1801968-remesa', consultada: '2026-09-25' },
    { titulo: 'TIMP Centro de Ayuda: facturación electrónica (Verifactu y TicketBAI)', url: 'https://help.timp.pro/es/articles/12301349-facturacion-electronica', consultada: '2026-09-25' },
    { titulo: 'TIMP Centro de Ayuda: App Progressive', url: 'https://help.timp.pro/es/articles/10288989-app-progressive', consultada: '2026-09-25' },
    { titulo: 'TIMP Centro de Ayuda: sesión del calendario (cambiar el profesional)', url: 'https://help.timp.pro/es/articles/11424735-sesion-del-calendario', consultada: '2026-09-25' },
    { titulo: 'TIMP Centro de Ayuda: ClassPass', url: 'https://help.timp.pro/es/articles/6209096-classpass', consultada: '2026-09-25' },
    { titulo: 'TIMP Centro de Ayuda: Wellhub', url: 'https://help.timp.pro/es/articles/6209172-wellhub', consultada: '2026-09-25' },
    { titulo: 'ViDay: precios (planes individuales y de equipo)', url: 'https://viday.es/precios/', consultada: '2026-10-01' },
    { titulo: 'ViDay: software para estudios de pilates (Verifactu, TicketBAI y migración)', url: 'https://viday.es/app-gestion-negocios/estudio-pilates/', consultada: '2026-10-01' },
    { titulo: 'Eversports Manager: precios', url: 'https://www.eversportsmanager.com/es-ES/precios', consultada: '2026-10-01' },
    { titulo: 'Eversports Help Center: cumplimiento fiscal en España (Veri*factu y TicketBAI)', url: 'https://helpcenter.eversportsmanager.com/es/cumplimiento-fiscal-en-espa%C3%B1a-verifactu-ticketbai', consultada: '2026-09-25' },
    { titulo: 'Lorari: precios', url: 'https://www.lorari.com/pricing/', consultada: '2026-09-25' },
    { titulo: 'Lorari: página principal (prueba, permanencia, app y lista de espera)', url: 'https://www.lorari.com/', consultada: '2026-10-01' },
    { titulo: 'GesYoga: planes, precios, migración y VeriFactu', url: 'https://www.gesyoga.com/', consultada: '2026-10-01' },
    { titulo: 'bsport: tarifas y preguntas frecuentes', url: 'https://pro.bsport.io/es/precios', consultada: '2026-09-25' },
    { titulo: 'bsport: app personalizada para miembros', url: 'https://pro.bsport.io/es/caracteristicas/aplicacion-personalizada', consultada: '2026-09-25' },
    { titulo: 'bsport Centro de Ayuda: cómo activar VeriFactu o TicketBai', url: 'https://intercom.help/bsport-helpcenter/es/articles/13375112-como-activar-verifactu-o-ticketbai-en-tu-plataforma', consultada: '2026-09-25' },
    { titulo: 'Tentare en G2: reseñas', url: 'https://www.g2.com/products/tentare/reviews', consultada: '2026-10-01' },
  ],
  relacionadas: [
    '/comparativa/tentare-vs-timp',
    '/recursos/bsport-vs-timp',
    '/recursos/alternativas-a-bsport',
    '/soluciones/cambiar-de-software',
    '/recursos/mejor-software-para-estudios-de-pilates',
    '/funcionalidades/sustituciones',
  ],
  cta: {
    titulo: 'Prueba Tentare con tu horario de TIMP',
    texto:
      'Tentare cuesta lo mismo tengas dos instructoras o seis, desde 29 €/mes con IVA y sin permanencia, y se prueba 7 días gratis, sin tarjeta, con el plan que elijas. Tus datos de TIMP los importas tú con vista previa y botón de deshacer, o te los pasamos nosotros.',
  },
  revision: [
    'Precios y condiciones de TIMP, ViDay, Eversports, Lorari, GesYoga y bsport: repasar cada trimestre.',
    'TIMP: la comisión publicada es la de tarjetas de España y la UE en Starter y Basic (en Pro y Premium el máximo es el 0,95 %); comprobar que no ha cambiado.',
    'Tentare y SEPA: confirmar con producto qué pasa con las domiciliaciones (mandatos) al importar, y concretar el paso 4 si se pueden traer.',
    'Integraciones con agregadores en Tentare: actualizar «Cuándo no te conviene dejar TIMP» cuando ClassPass o Wellhub estén disponibles.',
    'Cuando el envío automático a la AEAT esté activado, actualizar la fila de Tentare y la sección «Cuándo no te conviene dejar TIMP».',
    'Nota de G2: 4,8/5 con 2 reseñas a 1-oct-2026 (lib/seo/g2.ts); actualizar el número de reseñas si cambia.',
  ],
};

export default articulo;
