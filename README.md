# design-db-biored

Diseño y base de datos de **BioRed**, la red de estaciones ambientales de bajo costo del semillero de investigación BioRed de UNIMINUTO. Cada estación es un ESP32 que mide temperatura, humedad, gases y sonido. Este repositorio contiene el modelo de datos donde se guardan esas lecturas, los scripts para crearlo en MySQL con su set de pruebas y el prototipo del módulo de análisis.

Lo construí durante mi práctica profesional en el semillero. Hoy la base recibe lecturas reales de las estaciones a través de la API publicada en `https://biored-analytic.brayan36.com`.

## Contenido

| Carpeta o archivo | Qué contiene |
|---|---|
| [`design_3.mermaid`](design_3.mermaid) | **Modelo de datos vigente (v3).** Diagrama entidad relación con las 12 tablas y el registro de cambios respecto a la versión anterior |
| [`BioRed_DB_v3/`](BioRed_DB_v3/) | Scripts SQL para crear la base en MySQL, el usuario de la aplicación, los datos iniciales, el set de 13 casos de prueba y las evidencias de su ejecución |
| [`BioRed_Analisis_v2/`](BioRed_Analisis_v2/) | **Prototipo** del módulo de análisis (HTML, CSS y JavaScript con ECharts). La versión que se usa hoy vive integrada en [biored-analytic-app](https://github.com/Brayan36/biored-analytic-app) |
| `design_1.mermaid` y `design_2.mermaid` | Versiones anteriores del modelo. Se conservan como historial del diseño |

Cada carpeta tiene su propio README con el detalle.

## Por dónde empezar

1. **Entender el modelo.** Abrir `design_3.mermaid` en un visor de Mermaid, por ejemplo la extensión de Mermaid para VS Code o [mermaid.live](https://mermaid.live). Los comentarios del inicio explican cada decisión del diseño.
2. **Crear y probar la base en un equipo propio.** Seguir el [README de BioRed_DB_v3](BioRed_DB_v3/README.md) y ejecutar los scripts del 01 al 07. El resultado esperado es 13 casos de prueba y 14 verificaciones en PASA.
3. **Montar la base para datos reales.** Leer la sección [Uso con la integración actual](BioRed_DB_v3/README.md#uso-con-la-integración-actual) del mismo README. Explica qué scripts se ejecutan en el servidor, qué permisos necesita la API y cómo se registran las estaciones nuevas.
4. **Conectar una estación.** Con el firmware de [ESP32-S3-FW-BioRed](https://github.com/Brayan36/ESP32-S3-FW-BioRed) y la guía `docs/registro-estacion.md` de [biored-analytic-app](https://github.com/Brayan36/biored-analytic-app).

## Cómo encaja en el sistema completo

```
Estación ESP32            firmware modular con el módulo EnvioAPI
  │  HTTPS cada 30 s
  ▼
Cloudflare                 túnel hacia el servidor
  │
  ▼
biored-analytic-app        API, ingesta, dashboard y módulo de análisis (Raspberry Pi)
  │
  ▼
MySQL, base biored         modelo v3 de este repositorio
```

| Repositorio | Responsable | Contenido |
|---|---|---|
| design-db-biored (este) | Carlos Andrés Rico Castellanos | Modelo de datos, scripts SQL, pruebas y prototipo del módulo de análisis |
| [biored-analytic-app](https://github.com/Brayan36/biored-analytic-app) | Brayan Montealegre | API en Node.js, dashboard web y módulo de análisis integrado |
| [ESP32-S3-FW-BioRed](https://github.com/Brayan36/ESP32-S3-FW-BioRed) | Brayan Montealegre y Carlos Andrés Rico Castellanos | Firmware modular de la estación y envío de lecturas a la API |

Si alguno de los repositorios aparece como privado, hay que pedir acceso a su responsable.

## Requisitos

| Herramienta | Para qué |
|---|---|
| MySQL 8.0.21 o superior | Crear la base. Las versiones anteriores no tienen `JSON_VALUE`, que usa el procedimiento de pruebas |
| MySQL Workbench (opcional) | Ejecutar los scripts en Windows sin usar la terminal |
| Un navegador | Abrir el prototipo del módulo de análisis con doble clic en `BioRed_Analisis_v2/index.html` |
| Node.js 20 o superior (opcional) | Correr las 69 pruebas del prototipo del módulo de análisis |

## Buenas prácticas para quien continúe

- **Nunca subir claves.** El script `02_usuario_app.sql` trae `CAMBIAR_ESTA_CLAVE`. La clave real se cambia solo al ejecutarlo y no se guarda en el archivo.
- **No modificar los scripts ya validados.** Los cambios al modelo se hacen en un `design_4.mermaid` y una carpeta de scripts nueva, como se hizo de la v2 a la v3, para conservar el historial y las evidencias.
- **Las lecturas son inmutables.** Ningún usuario de aplicación debe tener permiso para modificarlas o borrarlas.
