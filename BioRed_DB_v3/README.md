# BioRed DB v3 · Base de datos y set de pruebas

Scripts para crear en MySQL la base de datos de BioRed según el modelo `design_3.mermaid`, junto con un set de pruebas en JSON que simula los envíos del ESP32 y valida las reglas del modelo antes de conectar el hardware.

- **Motor** MySQL 8.0.21 o superior. Probado en MySQL 8.0.46, en Ubuntu 22.04 y en Windows con Workbench.
- **Estación registrada** MAC `80:B5:4E:C7:50:94`
- **Resultado esperado** 13 casos de prueba en PASA y 14 verificaciones de calidad en PASA

> Las versiones anteriores a MySQL 8.0.21 no funcionan, porque el procedimiento de ingesta usa `JSON_VALUE`.

> Este README describe el modelo y sus pruebas tal como los construí y validé. Si vas a montar la base para recibir datos reales de las estaciones, lee primero la sección [Uso con la integración actual](#uso-con-la-integración-actual).

## Contenido

| Archivo | Para qué sirve |
|---|---|
| `01_schema_v3.sql` | Crea la base `biored` con las 12 tablas, sus restricciones, índices y columnas calculadas. **Borra la base si ya existe** |
| `02_usuario_app.sql` | Crea el usuario `biored_app`, que puede leer todo e insertar eventos, pero no modificar ni borrar lecturas |
| `03_procedimiento_ingesta.sql` | Crea `sp_ingest_reading`, que recibe el JSON del ESP32 y lo guarda aplicando las reglas del modelo |
| `04_datos_iniciales.sql` | Registra la estación con su MAC y sus cuatro sensores (DHT22, LDR, MQ135, MAX9814) |
| `pruebas_payloads_v3.json` | Set de 13 casos de prueba, 7 válidos y 6 que deben ser rechazados |
| `05_pruebas.sql` | Envía los 13 casos al procedimiento y marca cada uno como PASA o FALLA |
| `06_verificacion.sql` | Revisa directamente en las tablas 14 reglas de calidad de los datos |
| `07_limpiar_pruebas.sql` | Borra los datos de prueba y conserva la estación y sus sensores |

## Orden de ejecución

Este orden sirve para crear el modelo y probarlo de punta a punta en un equipo propio. Ejecutar en orden, como administrador. Para el servidor que recibe datos reales, ver [Uso con la integración actual](#uso-con-la-integración-actual).

**En el servidor Ubuntu**
```bash
sudo mysql --table < 01_schema_v3.sql
sudo mysql --table < 02_usuario_app.sql        # antes cambiar CAMBIAR_ESTA_CLAVE
sudo mysql < 03_procedimiento_ingesta.sql
sudo mysql --table < 04_datos_iniciales.sql
sudo mysql --table < 05_pruebas.sql
sudo mysql --table < 06_verificacion.sql
sudo mysql --table < 07_limpiar_pruebas.sql    # solo antes de recibir datos reales
```

**En MySQL Workbench** abrir cada script con *File → Open SQL Script* y ejecutarlo completo con el primer ícono del rayo. Revisar que en el panel *Output* todas las filas queden con visto verde.

**Avisos**
- La clave de `biored_app` no se debe guardar en el archivo ni subir a ningún repositorio. En Workbench, cambiarla en el editor y cerrar sin guardar.
- El script 04 se ejecuta una sola vez. Si se repite, la MAC duplicada se rechaza, como corresponde.
- Si se vuelve a ejecutar el 01, hay que repetir del 02 al 06.

## Uso con la integración actual

Después de validar el modelo, la base quedó funcionando dentro de un sistema completo que hoy recibe datos reales. Las estaciones ESP32 envían sus lecturas por HTTPS al dominio `https://biored-analytic.brayan36.com`, que publica la API `biored-analytic-app` desde una Raspberry Pi. La API valida cada envío y lo guarda en esta misma base `biored`.

```
ESP32 (firmware modular + módulo EnvioAPI)
  └─ HTTPS POST /api/v1/readings/ingest con key de dispositivo
       └─ Cloudflare (túnel)
            └─ biored-analytic-app (Node.js, en la Raspberry Pi)
                 └─ MySQL, base biored (este modelo v3)
```

| Repositorio | Contenido |
|---|---|
| [biored-analytic-app](https://github.com/Brayan36/biored-analytic-app) | API, ingesta, dashboard y módulo de análisis integrado. Su guía `docs/despliegue.md` explica cómo montar el servidor y `docs/registro-estacion.md` cómo dar de alta una estación |
| [ESP32-S3-FW-BioRed](https://github.com/Brayan36/ESP32-S3-FW-BioRed) | Firmware modular de la estación, con el módulo `EnvioAPI` que envía las lecturas cada 30 s |

Si alguno de los dos repositorios aparece como privado, hay que pedir acceso a su administrador.

### Scripts que se ejecutan en el servidor

| Script | En el servidor real | Motivo |
|---|---|---|
| `01_schema_v3.sql` | **Sí**, una sola vez | Crea la base y las 12 tablas. Borra la base si ya existe, así que nunca se repite con datos reales |
| `02_usuario_app.sql` | Sí, si la API se conecta con `biored_app` | Requiere los permisos adicionales de la tabla de abajo |
| `03_procedimiento_ingesta.sql` | No | La API no usa `sp_ingest_reading`. Aplica las mismas reglas en su propio código. El procedimiento queda como referencia para probar el modelo |
| `04_datos_iniciales.sql` | Opcional | Registra la estación `80:B5:4E:C7:50:94`. Las demás estaciones se registran por la API |
| `05` a `07` | **No** | Son solo para probar el modelo. El 05 inserta lecturas de prueba que se mezclarían con los datos reales |

### Permisos adicionales de `biored_app`

El script 02 deja que la aplicación lea todo e inserte lecturas, pero los catálogos los administraba una persona. Hoy la API también registra lugares, estaciones y sensores, así que necesita estos permisos, ejecutados por un administrador.

```sql
GRANT INSERT, UPDATE ON biored.locations       TO 'biored_app'@'localhost';
GRANT INSERT, UPDATE ON biored.stations        TO 'biored_app'@'localhost';
GRANT INSERT, UPDATE ON biored.sensors         TO 'biored_app'@'localhost';
GRANT UPDATE         ON biored.camera_captures TO 'biored_app'@'localhost';
```

Las lecturas siguen inmutables. Nunca se otorga `UPDATE` ni `DELETE` sobre ellas.

### Registro de estaciones nuevas

Las estaciones nuevas no se agregan editando el script 04. Se registran con la colección de Postman de `biored-analytic-app` usando la key de administración, siguiendo `docs/registro-estacion.md`. Primero se crea la estación con la MAC de la placa y después se instalan sus sensores.

### Diferencias del script 04 con el hardware actual

Diseñé el script 04 con el plan de pines que existía antes del firmware modular. La configuración de los sensores (`metadata`) es informativa y la API no la valida, así que las lecturas se guardan bien aunque los pines no coincidan. Si se quiere dejar la configuración exacta, se retira el sensor y se instala uno nuevo por la API, sin editar el registro.

| Sensor | Script 04 | Firmware modular actual |
|---|---|---|
| DHT22 | Pin 14 | Pin 14, sin cambios |
| LDR | Pin 34 | No existe. El GPIO34 no está en el ESP32-S3. El sensor queda registrado sin lecturas y la API no lo exige porque el firmware no envía la sección `ldr` |
| MQ-135 | Pin 1, divisor con factor 0.6 | Pin 3, sin divisor de voltaje |
| MAX9814 | Pin 3 | Pin 19 |

### El contrato JSON no cambió

La API recibe exactamente el formato de la sección siguiente en `POST /api/v1/readings/ingest`, con la key de la estación en la cabecera `x-api-key`. Las mismas reglas del modelo se aplican en la API. Los casos P01 a P13 de `pruebas_payloads_v3.json` también están en la colección de Postman, pero solo deben ejecutarse contra un servidor de pruebas.

## Formato del JSON (contrato con el firmware)

Es el formato que debe enviar el ESP32 en cada POST y el que recibe `sp_ingest_reading`. Cada sección de sensor es opcional, si no llega no se crea su fila.

```json
{
  "device_uid": "80:B5:4E:C7:50:94",
  "firmware_version": "2.1.0",
  "uptime_s": 3600,
  "dht22": { "valid": true, "temperature_c": 21.6, "humidity_pct": 69.5 },
  "ldr":   { "raw": 1200 },
  "mq135": { "warmed_up": true, "raw": 1340, "output_voltage": 1.8,
             "rs_kohm": 17.778, "alarm": null,
             "estimates": [ { "gas": "CO2", "ppm": 2.83 } ] },
  "audio": { "valid": true, "rms_mv": 61.0, "peak_to_peak_mv": 480,
             "offset_mv": 1220, "sample_rate_hz": 8000 }
}
```

Gases válidos en `estimates` son CO2, CO, NH3, ALCOHOL, TOLUENE y ACETONE. La hora de la lectura no viene en el JSON, la asigna el servidor.

## Reglas que aplica la base

1. La estación se identifica por su MAC (`device_uid`), sin importar mayúsculas o minúsculas.
2. La hora oficial de cada lectura (`received_at`) la pone el servidor, porque el ESP32 no tiene reloj.
3. Si el DHT22 falla y envía -1, se guarda NULL con `is_valid` en 0. El -1 nunca se guarda.
4. Si una sección de sensor no llega, no se crea su fila de detalle.
5. Si el MQ-135 está calentando (`warmed_up` en false), no se guarda la lectura de gas.
6. Las estimaciones de gas desbordadas, fuera de 0 a 99,999,999.99 ppm, se descartan.
7. Cada envío se guarda en una sola transacción. Si algo falla, no queda nada a medias.
8. Las lecturas son inmutables. El usuario de la aplicación no puede modificarlas ni borrarlas.
9. MySQL calcula solo el porcentaje de luz (`percentage`) y el nivel de sonido en dB (`level_db`).

## Casos de prueba

| Caso | Qué se prueba | Resultado esperado |
|---|---|---|
| P01 | Lectura completa en aire limpio con los cuatro sensores | Se guarda, con 6 gases estimados |
| P02 | El DHT22 falla y envía -1 | Se guarda, temperatura y humedad en NULL |
| P03 | MQ-135 en calentamiento | Se guarda, sin fila de gas |
| P04 | Aire con gases y micrófono desconectado | Se guarda, audio con `is_valid` en 0 |
| P05 | Solo llega el DHT22 | Se guarda, solo temperatura y humedad |
| P06 | MAC en minúsculas | Se guarda en la estación 1 |
| P07 | Una estimación de gas desbordada | Se guarda, con 5 gases |
| P08 | MAC no registrada | Rechazado, "Estacion no registrada" |
| P09 | Envío sin `device_uid` | Rechazado, "El envio no trae device_uid" |
| P10 | Humedad de 150 % marcada como válida | Rechazado, `chk_humidity_valor` |
| P11 | LDR con valor 5000 | Rechazado, `chk_light_raw` |
| P12 | Gas desconocido METHANE | Rechazado, "gas no reconocido" |
| P13 | Envío sin datos de sensores | Rechazado, "ningun sensor" |

Los valores del set se basan en lecturas reales del DHT22 y del MAX9814. Para el MQ-135 usé las curvas del sketch `MQ135_EPS32_Release.ino` con R0 = 4.938 kΩ.

## Verificaciones del script 06

| Verificación | Esperado |
|---|---|
| V01 Solo se guardaron los envíos válidos | 7 |
| V02 Los envíos rechazados no dejaron lecturas a medias | 0 |
| V03 Nunca se guardó el -1 del DHT22 | 0 |
| V04 P02 quedó en NULL con `is_valid` falso | 2 |
| V05 P03 sin fila de gas durante el calentamiento | 0 |
| V06 P01 guardó los seis gases | 6 |
| V07 P07 descartó la estimación desbordada | 5 |
| V08 P04 audio con offset 0 quedó inválido | 1 |
| V09 MySQL calculó `level_db` | 35.7 |
| V10 MySQL calculó el porcentaje de luz | 29 |
| V11 La MAC en minúsculas se asignó a la estación 1 | 1 |
| V12 P05 solo creó filas de temperatura y humedad | 2 |
| V13 Todas las lecturas tienen la hora del servidor | 0 |
| V14 `biored_app` no puede modificar ni borrar lecturas | 0 |

## Notas para el backend y el firmware

- **Backend de ingesta.** La API `biored-analytic-app` aplica las reglas de esta sección en su propio código y guarda cada envío en una transacción. No llama a `sp_ingest_reading`, que queda como referencia para las pruebas del modelo. La autenticación que figuraba como pendiente ya existe, porque cada estación envía su propia key de dispositivo en la cabecera `x-api-key`.
- **MQ-135.** El set de pruebas asume un divisor de voltaje con factor 0.6 en el GPIO1. El firmware modular actual lee el sensor en el GPIO3 sin divisor y calcula con 5 V de alimentación y 3,3 V de referencia del ADC. Antes de un despliegue permanente conviene instalar el divisor, porque la salida del sensor puede superar los 3,3 V que admite el ESP32-S3.
- **Curvas del MQ-135.** En aire limpio dan cerca de 2.8 ppm de CO2, mientras el CO2 real en el aire ronda los 400 ppm. Además el firmware recalibra R0 en cada arranque. Por eso las estimaciones son orientativas y cambian de una sesión a otra.
- **Porcentaje de luz.** MySQL redondea (1200 da 29 %, 3100 da 76 %) y el `map()` del sketch anterior truncaba (3100 da 75 %). Hoy no aplica porque el firmware modular no tiene LDR. Queda pendiente para cuando se reubique el sensor.
- **Configuración de sensores.** Si cambia el pin, la ganancia o el R0 de un sensor, no se edita su registro. Se cierra con `removed_at` y se crea uno nuevo en `sensors`, para conservar el historial. Con la API se hace con las peticiones "Retirar sensor" e "Instalar sensor" de Postman.
