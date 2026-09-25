import type { Articulo } from './tipos.ts';

const articulo: Articulo = {
  slug: 'software-pilates-gratis',
  titulo: 'Software de pilates gratis: qué puedes montar sin pagar y qué pierdes',
  tituloSeo: 'Software de pilates gratis: qué sirve y qué pierdes',
  descripcion:
    'Google, WhatsApp, Excel y planes a 0 €: qué puedes montar gratis en tu estudio de pilates, qué pierdes por el camino y cuándo compensa empezar a pagar.',
  resumen:
    'Lo que de verdad puedes usar sin pagar en un estudio de pilates, con los límites que publica cada herramienta, el coste oculto de hacerlo a mano y cuándo compensa pagar.',
  categoria: 'software',
  seccion: 'Elegir software',
  publicado: '2026-09-25',
  consultaPrincipal: 'software de pilates gratis',
  consultas: [
    'programa de gestión de pilates gratis',
    'app para reservar clases gratis',
    'sistema de reservas online gratuito',
  ],
  respuesta:
    'Sí hay software de pilates gratis, pero con límites. Con una cuenta de Google personal puedes publicar una página de reservas, WhatsApp Business es gratuita y hay planes a 0 € pensados para centros, como Bonsai Seed (hasta 100 reservas grupales al mes y un 3 % extra por cobro) o Flowstark Free (cobros, hasta 50 clientes). Sirven para arrancar con pocas alumnas; con bonos, cuotas y varias instructoras, el trabajo a mano crece rápido.',
  entradilla:
    'Cuando abres un estudio, cada euro cuenta y pagar un programa antes de tener alumnas da vértigo. Esto es lo que de verdad puedes montar con software de pilates gratis y herramientas sin coste, con los límites que publica cada una, y las señales de que ha llegado el momento de pagar.',
  secciones: [
    {
      id: 'que-puedes-montar-gratis',
      titulo: 'Software de pilates gratis: qué puedes montar de verdad',
      bloques: [
        {
          t: 'p',
          texto:
            'Hay dos caminos: juntar herramientas generales que puedes usar sin pagar (Google, WhatsApp, una hoja de cálculo) o usar el plan gratuito de un programa de reservas. Esto es lo que ofrece cada opción según su web oficial, a 25 de septiembre de 2026:',
        },
        {
          t: 'tabla',
          cabecera: ['Herramienta', 'Qué te da gratis', 'El límite que más se nota en un estudio'],
          filas: [
            ['Agenda de citas de Google Calendar', 'Con una cuenta personal, una página de reservas que puedes enlazar o insertar en tu web', 'Está pensada para citas; tener más de una agenda, recordatorios automáticos por correo o cobrar la reserva exige suscripción'],
            ['WhatsApp Business', 'App gratuita con perfil de empresa, respuestas rápidas, mensajes de ausencia y etiquetas', 'Cada reserva y cada cambio pasan por tu móvil'],
            ['Hoja de cálculo', 'Llevar asistencia y bonos con fórmulas, como la plantilla que te dejamos', 'No avisa, no cobra y depende de que la actualices'],
            ['Square Citas, plan Gratuito', '0 € para un único punto de venta: reservas en línea y recordatorios por mensaje de texto y correo', 'Es una agenda de citas; las citas con varios empleados van en los planes de pago y cada cobro con tarjeta tiene comisión'],
            ['SimplyBook.me, plan Free', '0 €: hasta 50 reservas al mes, un proveedor y widget de reservas', 'Con clases de grupo, 50 reservas al mes se acaban pronto'],
            ['Bonsai, plan Seed', '0 € para siempre: hasta 100 reservas grupales al mes, pensado para yoga y pilates', 'Un 3 % extra en cada cobro por su pasarela de pago'],
            ['Flowstark, plan Free', '0 €: hasta 50 clientes, 30 servicios y 30 suscripciones', 'Es una herramienta de cobros: en su web no consta que gestione reservas'],
            ['Aplicación de facturación de la AEAT', 'Gratuita: emite facturas y envía los registros a Hacienda con VERI*FACTU', 'Va aparte de reservas y cobros, y está pensada para un volumen reducido de facturas'],
          ],
          nota:
            'Fuente: web oficial de cada herramienta, consultada el 25-sep-2026 (enlaces en las fuentes). Las condiciones de los planes gratuitos cambian: compruébalas antes de empezar.',
        },
        {
          t: 'p',
          texto:
            'Con una combinación sensata —una página de reservas, WhatsApp Business para las dudas y la [plantilla de control de asistencia](/recursos/plantilla-control-de-asistencia-pilates) para los bonos— un estudio pequeño puede funcionar sin pagar suscripción. Un aviso sobre Google: según su ayuda, la página de reservas es siempre pública y enseña el nombre y la foto de la cuenta, así que mejor créala con una cuenta del estudio y no con la tuya personal.',
        },
      ],
    },
    {
      id: 'sistema-de-reservas-online-gratuito',
      titulo: 'Cómo montar un sistema de reservas online gratuito, paso a paso',
      bloques: [
        {
          t: 'pasos',
          items: [
            {
              titulo: 'Abre una cuenta de Google para el estudio',
              texto:
                'Que sea distinta de la tuya personal. En ella tendrás juntas la agenda de citas, los formularios y las hojas de cálculo.',
            },
            {
              titulo: 'Publica tus clases',
              texto:
                'Si das sesiones privadas o en dúo, la agenda de citas de Google encaja. Si son de grupo, busca una herramienta que admita varias personas por sesión, como el plan gratuito de SimplyBook.me o el de Bonsai, o publica un formulario con las clases de la semana.',
            },
            {
              titulo: 'Lleva la asistencia y los bonos en una hoja',
              texto:
                'Apunta quién reserva, quién viene y quién cancela tarde, y deja que las fórmulas descuenten las sesiones. La plantilla gratuita que te enlazamos arriba ya lo hace.',
            },
            {
              titulo: 'Usa WhatsApp Business para lo que no cabe',
              texto:
                'Respuestas rápidas para «¿queda sitio?», un mensaje de ausencia fuera de horario y etiquetas para saber quién tiene bono y a quién le toca renovar.',
            },
            {
              titulo: 'Factura con una herramienta preparada',
              texto:
                'Si emites facturas, la aplicación gratuita de la AEAT las genera y envía los registros a Hacienda. Según la AEAT, Excel o Word no te hacen entrar en el reglamento de sistemas de facturación si solo los usas para escribir, emitir e imprimir facturas, pero sí si con ellos generas tus libros registro, por ejemplo con una macro.',
            },
          ],
        },
      ],
    },
    {
      id: 'app-para-reservar-clases-gratis',
      titulo: 'App para reservar clases gratis: lo que hay y lo que no',
      bloques: [
        {
          t: 'p',
          texto:
            'Si buscas una app con el nombre de tu estudio en el móvil de tus alumnas, no la vas a encontrar en los planes gratuitos que hemos revisado: en Bonsai, la app personalizable aparece a partir del plan Starter, y en SimplyBook.me la app de cliente con tu marca no está entre las opciones del plan Free.',
        },
        {
          t: 'p',
          texto:
            'Lo que sí es gratis es la página de reservas: la de Google, la de Square Citas o la de tu plan gratuito se abre con un enlace desde cualquier móvil, y tus alumnas pueden guardarla en la pantalla de inicio. Para empezar, basta. Si quieres ponerla en tu web, tienes los pasos para WordPress, Wix y Squarespace en [cómo poner las reservas en tu web](/recursos/widget-vs-iframe-reservas-pilates).',
        },
      ],
    },
    {
      id: 'lo-que-pierdes',
      titulo: 'Lo que pierdes con un programa de gestión de pilates gratis',
      bloques: [
        {
          t: 'p',
          texto:
            'Montarlo gratis funciona mientras todo pase por ti. Lo que se pierde, sobre todo con el kit de Google, WhatsApp y hoja de cálculo:',
        },
        {
          t: 'lista',
          items: [
            '**Bonos con caducidad que se controlan solos.** Una hoja calcula las sesiones que quedan, pero nadie avisa a la alumna de que su bono caduca el viernes. Si aún los estás diseñando, mira [cómo plantear los bonos de pilates](/recursos/bonos-de-pilates).',
            '**Lista de espera.** Cuando alguien cancela, eres tú quien escribe a la siguiente, si te enteras a tiempo.',
            '**Cobros recurrentes.** Sin cobro automático de cuotas, cada mes persigues transferencias y apuntas quién ha pagado. La agenda de Google, por ejemplo, solo deja cobrar la cita con una suscripción de pago.',
            '**Facturación conectada.** La aplicación de la AEAT emite la factura, pero no sabe qué vendiste ni a quién: lo copias tú.',
            '**Reservas de verdad en autoservicio.** Con WhatsApp, cada reserva es un mensaje que contestas tú; con una agenda de citas, cada clase de grupo es un apaño.',
            '**Reglas que se cumplen solas.** Plazo de cancelación, aforo por máquina, qué pasa con una cancelación tarde: todo depende de que lo recuerdes y lo apliques igual a todas.',
          ],
        },
      ],
    },
    {
      id: 'coste-oculto',
      titulo: 'El coste oculto de lo gratis: horas, errores e impagos',
      bloques: [
        {
          t: 'p',
          texto:
            'Lo gratis se paga en tiempo. Haz la cuenta con tus números; aquí va un ejemplo para que veas el orden de magnitud.',
        },
        {
          t: 'cifras',
          titulo: 'Ejemplo: lo que cuesta llevarlo todo a mano',
          cifras: [
            { valor: '7 h', etiqueta: 'al mes, si dedicas 20 minutos cada día laborable a reservas y cambios' },
            { valor: '105 €', etiqueta: 'lo que valen esas horas si tu hora vale 15 €' },
            { valor: '120 €', etiqueta: 'una cuota de 60 € que nadie reclama durante dos meses' },
          ],
          nota:
            'Cifras de ejemplo, no medidas: 20 minutos por 21 días laborables son 420 minutos (7 horas); 7 horas por 15 € son 105 €; dos meses de una cuota de 60 € son 120 €. Cambia cada número por los tuyos.',
        },
        {
          t: 'p',
          texto:
            'Súmale los errores: dos alumnas en la misma plaza porque una reservó por WhatsApp y otra por el formulario, un bono que se descuenta dos veces o ninguna, una cancelación tarde que cobras a una y perdonas a otra. Cada uno cuesta poco dinero y bastante confianza.',
        },
        {
          t: 'p',
          texto:
            'Y los datos: una hoja con los teléfonos y correos de tus alumnas es un tratamiento de datos personales. La AEPD ofrece Facilita RGPD, una herramienta gratuita para negocios que tratan datos de escaso riesgo; no sirve si guardas datos de salud, así que no los metas en la hoja.',
        },
      ],
    },
    {
      id: 'cuando-compensa-pagar',
      titulo: 'Cuándo compensa pagar un software',
      bloques: [
        {
          t: 'lista',
          items: [
            'Vendes cuotas mensuales y cada mes persigues pagos.',
            'La lista de espera vive en tu WhatsApp y se te escapan plazas.',
            'Hay más de una persona reservando o dando clase: la hoja se desordena y las bajas de instructoras las cubres a base de llamadas.',
            'Tienes que emitir facturas: el programa con el que factures tendrá que cumplir el reglamento de sistemas de facturación antes del 1 de enero de 2027 si tu estudio es una sociedad, y antes del 1 de julio de 2027 si eres autónoma.',
            'Pasas más horas cuadrando que dando clase.',
          ],
        },
        {
          t: 'p',
          texto:
            'La cuenta es sencilla: compensa cuando el software cuesta menos que las horas que te quita. Ejemplo: con tu hora a 15 €, uno de 30 € al mes compensa en cuanto te ahorra dos horas al mes. Para comparar precios, planes y permanencias, tienes la [comparativa del mejor software para estudios de pilates](/recursos/mejor-software-para-estudios-de-pilates).',
        },
        {
          t: 'p',
          texto:
            'Si llegas a ese punto, Tentare no es gratis: cuesta desde 29 €/mes con IVA incluido, sin permanencia, y puedes probarlo 7 días gratis y sin tarjeta con el plan que elijas. Si empezaste con una hoja de cálculo, su importador lee Excel y te enseña un acta de lo importado, con botón de deshacer. Tienes los planes en [precios](/precios).',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Existe un software de pilates gratis de verdad?',
      a: 'Sí, con límites. Bonsai tiene un plan gratuito para siempre con hasta 100 reservas grupales al mes y un 3 % extra en cada cobro, SimplyBook.me uno con 50 reservas al mes y Square Citas uno para un único punto de venta. Ninguno es ilimitado: el tope está en las reservas, en los clientes o en las comisiones.',
    },
    {
      q: '¿Qué app para reservar clases gratis puedo usar?',
      a: 'Para tus alumnas sirve cualquier página de reservas que se abra en el móvil: la agenda de citas de Google, la de Square Citas o la de un plan gratuito como el de SimplyBook.me o Bonsai. Una app con el nombre y el icono de tu estudio no aparece en los planes gratuitos que hemos revisado.',
    },
    {
      q: '¿Puedo tener un sistema de reservas online gratuito en mi web?',
      a: 'Sí. Google permite insertar la página de reservas o un botón en tu web copiando un código, SimplyBook.me incluye un widget de reservas en su plan Free y Square Citas, un botón de «Reservar ahora» en su plan Gratuito.',
    },
    {
      q: '¿Puedo facturar con Excel?',
      a: 'Según la AEAT, el reglamento de sistemas de facturación no te afecta si usas Excel o Word solo para introducir los datos, emitir e imprimir las facturas y guardarlas; sí te afecta si además generas con ellos tus libros registro, por ejemplo con una macro. La alternativa gratuita es la aplicación de facturación de la AEAT. Confírmalo con tu gestoría.',
    },
    {
      q: '¿Pierdo mis datos si luego paso a un software de pago?',
      a: 'No, si los tienes ordenados: una fila por alumna con nombre, teléfono, correo, bono, sesiones y caducidad. Antes de cambiar, pregunta al programa nuevo si importa hojas de cálculo, en qué formato y si puedes revisar la importación antes de darla por buena.',
    },
  ],
  fuentes: [
    { titulo: 'Google Calendar: información sobre las agendas de citas', url: 'https://support.google.com/calendar/answer/10729749?hl=es', consultada: '2026-09-25' },
    { titulo: 'Google Calendar: comparar las funciones premium de las agendas de citas', url: 'https://support.google.com/calendar/answer/16287038?hl=es', consultada: '2026-09-25' },
    { titulo: 'Google Calendar: compartir una agenda de citas', url: 'https://support.google.com/calendar/answer/10733297?hl=es', consultada: '2026-09-25' },
    { titulo: 'WhatsApp Business en App Store (WhatsApp Inc.)', url: 'https://apps.apple.com/es/app/whatsapp-business/id1386412985', consultada: '2026-09-25' },
    { titulo: 'Square Citas: precios', url: 'https://squareup.com/es/es/appointments/pricing', consultada: '2026-09-25' },
    { titulo: 'SimplyBook.me: pricing', url: 'https://simplybook.me/en/pricing', consultada: '2026-09-25' },
    { titulo: 'Bonsai: precios y preguntas frecuentes', url: 'https://mybonsai.app/precios', consultada: '2026-09-25' },
    { titulo: 'Flowstark: página principal y precios', url: 'https://www.flowstark.com/', consultada: '2026-09-25' },
    { titulo: 'AEAT: aplicación gratuita de facturación VERI*FACTU', url: 'https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2025/octubre/13/aplicacion-gratuita-facturacion-verifactu.html', consultada: '2026-09-25' },
    { titulo: 'AEAT: preguntas frecuentes sobre el ámbito de aplicación (hojas de cálculo y procesadores de texto)', url: 'https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/cuestiones-generales-ambitos-aplicacion.html', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto 1007/2023, texto consolidado (disposición final cuarta)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840', consultada: '2026-09-25' },
    { titulo: 'AEPD: Facilita RGPD', url: 'https://www.aepd.es/guias-y-herramientas/herramientas/facilita-rgpd', consultada: '2026-09-25' },
  ],
  relacionadas: [
    '/recursos/mejor-software-para-estudios-de-pilates',
    '/recursos/plantilla-control-de-asistencia-pilates',
    '/recursos/checklist-elegir-software-estudio',
    '/precios',
  ],
  cta: {
    titulo: 'Cuando lo gratis se te quede corto',
    texto:
      'Prueba Tentare 7 días gratis y sin tarjeta con el plan que elijas: bonos con caducidad, lista de espera automática y cobros recurrentes con Stripe, desde 29 €/mes con IVA incluido y sin permanencia.',
  },
  revision: [
    'Planes gratuitos de terceros (Google, Square, SimplyBook.me, Bonsai, Flowstark) revisados el 25-sep-2026: cambian a menudo, repasarlos cada trimestre.',
    'SimplyBook.me: su FAQ dice que el plan Free incluye «client app», pero en la tabla de planes la «Branded Client App» aparece en planes de pago; el texto solo afirma lo segundo.',
  ],
};

export default articulo;
