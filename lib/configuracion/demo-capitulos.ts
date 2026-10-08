// GENERADO por demo/montar.mjs — no se edita a mano (ver lib/configuracion/demo.ts).
import type { SeccionId, TarjetaId } from './secciones.ts';

export interface MomentoDemo {
  /** La tarjeta (o herramienta) de la que habla el vídeo en ese minuto. */
  readonly tarjeta: TarjetaId;
  readonly inicioSeg: number;
}

export interface CapituloDemo {
  readonly seccion: SeccionId;
  readonly inicioSeg: number;
  readonly momentos: readonly MomentoDemo[];
}

export const DURACION_DEMO_SEG: number | null = 1567;

export const CAPITULOS_DEMO: readonly CapituloDemo[] = [
  {
    seccion: 'estudio',
    inicioSeg: 0,
    momentos: [
      {
        tarjeta: 'nombre-y-direccion',
        inicioSeg: 22
      },
      {
        tarjeta: 'contacto',
        inicioSeg: 41
      },
      {
        tarjeta: 'horario',
        inicioSeg: 51
      },
      {
        tarjeta: 'cerrar-el-centro',
        inicioSeg: 73
      },
      {
        tarjeta: 'salas',
        inicioSeg: 104
      },
      {
        tarjeta: 'certificado',
        inicioSeg: 149
      }
    ]
  },
  {
    seccion: 'clases',
    inicioSeg: 166,
    momentos: [
      {
        tarjeta: 'tipos-de-clase',
        inicioSeg: 177
      },
      {
        tarjeta: 'servicios-de-cita',
        inicioSeg: 220
      },
      {
        tarjeta: 'horario-de-citas',
        inicioSeg: 240
      }
    ]
  },
  {
    seccion: 'reservas',
    inicioSeg: 257,
    momentos: [
      {
        tarjeta: 'reservar',
        inicioSeg: 283
      },
      {
        tarjeta: 'lista-de-espera',
        inicioSeg: 335
      },
      {
        tarjeta: 'cancelar-y-recuperar',
        inicioSeg: 353
      },
      {
        tarjeta: 'recuperaciones',
        inicioSeg: 375
      },
      {
        tarjeta: 'si-cancela-tarde-o-no-viene',
        inicioSeg: 393
      },
      {
        tarjeta: 'asistencia',
        inicioSeg: 414
      },
      {
        tarjeta: 'si-se-cancela-una-clase',
        inicioSeg: 431
      },
      {
        tarjeta: 'si-se-queda-sin-cuota',
        inicioSeg: 447
      },
      {
        tarjeta: 'plaza-fija-desde-la-app',
        inicioSeg: 461
      },
      {
        tarjeta: 'si-pausa-su-plaza-fija',
        inicioSeg: 476
      },
      {
        tarjeta: 'ajuste-avisar-alumnas',
        inicioSeg: 490
      }
    ]
  },
  {
    seccion: 'cobros',
    inicioSeg: 514,
    momentos: [
      {
        tarjeta: 'datos-fiscales',
        inicioSeg: 528
      },
      {
        tarjeta: 'facturacion',
        inicioSeg: 556
      },
      {
        tarjeta: 'integracion-stripe',
        inicioSeg: 582
      },
      {
        tarjeta: 'datafono',
        inicioSeg: 594
      },
      {
        tarjeta: 'cuando-se-cobra-la-cuota',
        inicioSeg: 606
      },
      {
        tarjeta: 'domiciliaciones',
        inicioSeg: 624
      },
      {
        tarjeta: 'devoluciones',
        inicioSeg: 640
      },
      {
        tarjeta: 'si-se-cancela-una-cuota',
        inicioSeg: 655
      }
    ]
  },
  {
    seccion: 'altas',
    inicioSeg: 682,
    momentos: [
      {
        tarjeta: 'contrato-y-privacidad',
        inicioSeg: 691
      },
      {
        tarjeta: 'compra-desde-tu-enlace',
        inicioSeg: 705
      },
      {
        tarjeta: 'datos-extra-de-la-ficha',
        inicioSeg: 724
      },
      {
        tarjeta: 'preguntas-en-su-app',
        inicioSeg: 743
      },
      {
        tarjeta: 'valoracion-inicial',
        inicioSeg: 753
      },
      {
        tarjeta: 'cuestionario-de-salud',
        inicioSeg: 763
      }
    ]
  },
  {
    seccion: 'comunicacion',
    inicioSeg: 776,
    momentos: [
      {
        tarjeta: 'correos-automaticos',
        inicioSeg: 785
      },
      {
        tarjeta: 'avisos-del-movil',
        inicioSeg: 831
      },
      {
        tarjeta: 'integracion-resend',
        inicioSeg: 867
      },
      {
        tarjeta: 'integracion-whatsapp',
        inicioSeg: 880
      }
    ]
  },
  {
    seccion: 'motivacion',
    inicioSeg: 907,
    momentos: [
      {
        tarjeta: 'reglas',
        inicioSeg: 919
      },
      {
        tarjeta: 'creditos-por-accion',
        inicioSeg: 934
      },
      {
        tarjeta: 'recompensas',
        inicioSeg: 960
      },
      {
        tarjeta: 'canjes',
        inicioSeg: 985
      },
      {
        tarjeta: 'logros',
        inicioSeg: 993
      },
      {
        tarjeta: 'niveles',
        inicioSeg: 1003
      },
      {
        tarjeta: 'retos',
        inicioSeg: 1011
      },
      {
        tarjeta: 'codigos-descuento',
        inicioSeg: 1021
      }
    ]
  },
  {
    seccion: 'marca',
    inicioSeg: 1038,
    momentos: [
      {
        tarjeta: 'logo-y-favicon',
        inicioSeg: 1047
      },
      {
        tarjeta: 'textos-de-tu-app',
        inicioSeg: 1064
      },
      {
        tarjeta: 'textos-de-bienvenida',
        inicioSeg: 1085
      },
      {
        tarjeta: 'color-de-marca',
        inicioSeg: 1096
      }
    ]
  },
  {
    seccion: 'web',
    inicioSeg: 1137,
    momentos: [
      {
        tarjeta: 'direccion-y-enlaces',
        inicioSeg: 1146
      },
      {
        tarjeta: 'pagina-publica',
        inicioSeg: 1175
      },
      {
        tarjeta: 'contenido-de-tu-app',
        inicioSeg: 1196
      },
      {
        tarjeta: 'widgets',
        inicioSeg: 1221
      }
    ]
  },
  {
    seccion: 'equipo',
    inicioSeg: 1253,
    momentos: [
      {
        tarjeta: 'ajuste-instructoras-crean-clases',
        inicioSeg: 1262
      },
      {
        tarjeta: 'app-de-tus-instructoras',
        inicioSeg: 1276
      }
    ]
  },
  {
    seccion: 'conexiones',
    inicioSeg: 1316,
    momentos: [
      {
        tarjeta: 'integracion-google_calendar',
        inicioSeg: 1330
      },
      {
        tarjeta: 'integracion-zoom',
        inicioSeg: 1338
      },
      {
        tarjeta: 'integracion-kisi',
        inicioSeg: 1342
      },
      {
        tarjeta: 'integracion-klaviyo',
        inicioSeg: 1353
      },
      {
        tarjeta: 'plataformas-externas',
        inicioSeg: 1362
      },
      {
        tarjeta: 'integracion-zapier',
        inicioSeg: 1372
      },
      {
        tarjeta: 'api-publica',
        inicioSeg: 1382
      }
    ]
  },
  {
    seccion: 'datos',
    inicioSeg: 1394,
    momentos: [
      {
        tarjeta: 'exportar',
        inicioSeg: 1403
      },
      {
        tarjeta: 'doble-factor-equipo',
        inicioSeg: 1431
      },
      {
        tarjeta: 'redaccion-ia',
        inicioSeg: 1446
      }
    ]
  },
  {
    seccion: 'avisos',
    inicioSeg: 1460,
    momentos: [
      {
        tarjeta: 'tus-avisos',
        inicioSeg: 1469
      }
    ]
  },
  {
    seccion: 'panel',
    inicioSeg: 1500,
    momentos: [
      {
        tarjeta: 'menu-del-panel',
        inicioSeg: 1510
      },
      {
        tarjeta: 'inicio-del-panel',
        inicioSeg: 1526
      },
      {
        tarjeta: 'posicion-del-menu',
        inicioSeg: 1536
      },
      {
        tarjeta: 'claro-u-oscuro',
        inicioSeg: 1546
      }
    ]
  }
];
