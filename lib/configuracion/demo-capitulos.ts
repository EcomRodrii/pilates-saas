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

export const DURACION_DEMO_SEG: number | null = 1787;

export const CAPITULOS_DEMO: readonly CapituloDemo[] = [
  {
    seccion: 'estudio',
    inicioSeg: 4,
    momentos: [
      {
        tarjeta: 'nombre-y-direccion',
        inicioSeg: 33
      },
      {
        tarjeta: 'contacto',
        inicioSeg: 54
      },
      {
        tarjeta: 'horario',
        inicioSeg: 65
      },
      {
        tarjeta: 'cerrar-el-centro',
        inicioSeg: 91
      },
      {
        tarjeta: 'salas',
        inicioSeg: 127
      },
      {
        tarjeta: 'certificado',
        inicioSeg: 179
      }
    ]
  },
  {
    seccion: 'clases',
    inicioSeg: 198,
    momentos: [
      {
        tarjeta: 'tipos-de-clase',
        inicioSeg: 211
      },
      {
        tarjeta: 'servicios-de-cita',
        inicioSeg: 260
      },
      {
        tarjeta: 'horario-de-citas',
        inicioSeg: 283
      }
    ]
  },
  {
    seccion: 'reservas',
    inicioSeg: 303,
    momentos: [
      {
        tarjeta: 'reservar',
        inicioSeg: 334
      },
      {
        tarjeta: 'lista-de-espera',
        inicioSeg: 391
      },
      {
        tarjeta: 'cancelar-y-recuperar',
        inicioSeg: 412
      },
      {
        tarjeta: 'recuperaciones',
        inicioSeg: 437
      },
      {
        tarjeta: 'si-cancela-tarde-o-no-viene',
        inicioSeg: 457
      },
      {
        tarjeta: 'asistencia',
        inicioSeg: 481
      },
      {
        tarjeta: 'si-se-cancela-una-clase',
        inicioSeg: 501
      },
      {
        tarjeta: 'si-se-queda-sin-cuota',
        inicioSeg: 519
      },
      {
        tarjeta: 'plaza-fija-desde-la-app',
        inicioSeg: 534
      },
      {
        tarjeta: 'si-pausa-su-plaza-fija',
        inicioSeg: 551
      },
      {
        tarjeta: 'ajuste-avisar-alumnas',
        inicioSeg: 566
      }
    ]
  },
  {
    seccion: 'cobros',
    inicioSeg: 592,
    momentos: [
      {
        tarjeta: 'datos-fiscales',
        inicioSeg: 608
      },
      {
        tarjeta: 'facturacion',
        inicioSeg: 641
      },
      {
        tarjeta: 'integracion-stripe',
        inicioSeg: 669
      },
      {
        tarjeta: 'datafono',
        inicioSeg: 684
      },
      {
        tarjeta: 'cuando-se-cobra-la-cuota',
        inicioSeg: 697
      },
      {
        tarjeta: 'domiciliaciones',
        inicioSeg: 717
      },
      {
        tarjeta: 'devoluciones',
        inicioSeg: 734
      },
      {
        tarjeta: 'si-se-cancela-una-cuota',
        inicioSeg: 750
      }
    ]
  },
  {
    seccion: 'altas',
    inicioSeg: 782,
    momentos: [
      {
        tarjeta: 'contrato-y-privacidad',
        inicioSeg: 793
      },
      {
        tarjeta: 'compra-desde-tu-enlace',
        inicioSeg: 810
      },
      {
        tarjeta: 'datos-extra-de-la-ficha',
        inicioSeg: 830
      },
      {
        tarjeta: 'preguntas-en-su-app',
        inicioSeg: 850
      },
      {
        tarjeta: 'valoracion-inicial',
        inicioSeg: 861
      },
      {
        tarjeta: 'cuestionario-de-salud',
        inicioSeg: 872
      }
    ]
  },
  {
    seccion: 'comunicacion',
    inicioSeg: 887,
    momentos: [
      {
        tarjeta: 'correos-automaticos',
        inicioSeg: 898
      },
      {
        tarjeta: 'avisos-del-movil',
        inicioSeg: 948
      },
      {
        tarjeta: 'integracion-resend',
        inicioSeg: 990
      },
      {
        tarjeta: 'integracion-whatsapp',
        inicioSeg: 1005
      }
    ]
  },
  {
    seccion: 'motivacion',
    inicioSeg: 1035,
    momentos: [
      {
        tarjeta: 'reglas',
        inicioSeg: 1054
      },
      {
        tarjeta: 'creditos-por-accion',
        inicioSeg: 1070
      },
      {
        tarjeta: 'recompensas',
        inicioSeg: 1099
      },
      {
        tarjeta: 'canjes',
        inicioSeg: 1126
      },
      {
        tarjeta: 'logros',
        inicioSeg: 1135
      },
      {
        tarjeta: 'niveles',
        inicioSeg: 1146
      },
      {
        tarjeta: 'retos',
        inicioSeg: 1155
      },
      {
        tarjeta: 'codigos-descuento',
        inicioSeg: 1166
      }
    ]
  },
  {
    seccion: 'marca',
    inicioSeg: 1185,
    momentos: [
      {
        tarjeta: 'logo-y-favicon',
        inicioSeg: 1199
      },
      {
        tarjeta: 'textos-de-tu-app',
        inicioSeg: 1220
      },
      {
        tarjeta: 'textos-de-bienvenida',
        inicioSeg: 1243
      },
      {
        tarjeta: 'color-de-marca',
        inicioSeg: 1255
      }
    ]
  },
  {
    seccion: 'web',
    inicioSeg: 1302,
    momentos: [
      {
        tarjeta: 'direccion-y-enlaces',
        inicioSeg: 1315
      },
      {
        tarjeta: 'pagina-publica',
        inicioSeg: 1348
      },
      {
        tarjeta: 'contenido-de-tu-app',
        inicioSeg: 1371
      },
      {
        tarjeta: 'widgets',
        inicioSeg: 1398
      }
    ]
  },
  {
    seccion: 'equipo',
    inicioSeg: 1433,
    momentos: [
      {
        tarjeta: 'ajuste-instructoras-crean-clases',
        inicioSeg: 1445
      },
      {
        tarjeta: 'app-de-tus-instructoras',
        inicioSeg: 1458
      }
    ]
  },
  {
    seccion: 'conexiones',
    inicioSeg: 1503,
    momentos: [
      {
        tarjeta: 'integracion-google_calendar',
        inicioSeg: 1520
      },
      {
        tarjeta: 'integracion-zoom',
        inicioSeg: 1528
      },
      {
        tarjeta: 'integracion-kisi',
        inicioSeg: 1532
      },
      {
        tarjeta: 'integracion-klaviyo',
        inicioSeg: 1544
      },
      {
        tarjeta: 'plataformas-externas',
        inicioSeg: 1554
      },
      {
        tarjeta: 'integracion-zapier',
        inicioSeg: 1566
      },
      {
        tarjeta: 'api-publica',
        inicioSeg: 1577
      }
    ]
  },
  {
    seccion: 'datos',
    inicioSeg: 1590,
    momentos: [
      {
        tarjeta: 'exportar',
        inicioSeg: 1601
      },
      {
        tarjeta: 'doble-factor-equipo',
        inicioSeg: 1632
      },
      {
        tarjeta: 'redaccion-ia',
        inicioSeg: 1649
      }
    ]
  },
  {
    seccion: 'avisos',
    inicioSeg: 1666,
    momentos: [
      {
        tarjeta: 'tus-avisos',
        inicioSeg: 1675
      }
    ]
  },
  {
    seccion: 'panel',
    inicioSeg: 1710,
    momentos: [
      {
        tarjeta: 'menu-del-panel',
        inicioSeg: 1721
      },
      {
        tarjeta: 'inicio-del-panel',
        inicioSeg: 1741
      },
      {
        tarjeta: 'posicion-del-menu',
        inicioSeg: 1752
      },
      {
        tarjeta: 'claro-u-oscuro',
        inicioSeg: 1763
      }
    ]
  }
];
