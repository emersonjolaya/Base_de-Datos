# BioRed DB v3 · Base de datos y set de pruebas

Scripts para crear en MySQL la base de datos de BioRed según el modelo `design_3.mermaid`, junto con un set de pruebas en JSON que simula los envíos del ESP32 y valida las reglas del modelo antes de conectar el hardware.

- **Motor** MySQL 8.0.21 o superior. Probado en MySQL 8.0.46, en Ubuntu 22.04 y en Windows con Workbench.
- **Estación registrada** MAC `80:B5:4E:C7:50:94`
- **Resultado esperado** 13 casos de prueba en PASA y 14 verificaciones de calidad en PASA

> Las versiones anteriores a MySQL 8.0.21 no funcionan, porque el procedimiento de ingesta usa `JSON_VALUE`.

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

Ejecutar en orden, como administrador.

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

Los valores del set se basan en lecturas reales del DHT22 y del MAX9814, y en las curvas del sketch `MQ135_EPS32_Release.ino` con R0 = 4.938 kΩ.

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

- **Backend de ingesta.** Puede conectarse como `biored_app` y llamar `CALL sp_ingest_reading(json, @reading_id)`. El procedimiento ya valida y guarda todo en una transacción. Queda pendiente un token secreto por estación para autenticar los envíos.
- **MQ-135.** Los datos asumen el divisor de voltaje (factor 0.6) instalado y la salida en el GPIO1, según el plan de pines propuesto. También conviene usar `setVCC(5.0)` en la librería, porque por defecto calcula con 3.3 V. Si el pin final es otro, se ajusta en el script 04.
- **Curvas del MQ-135.** En aire limpio dan cerca de 2.8 ppm de CO2, mientras el CO2 real en el aire ronda los 400 ppm. Las estimaciones son orientativas.
- **Porcentaje de luz.** MySQL redondea (1200 da 29 %, 3100 da 76 %) y el `map()` del sketch trunca (3100 da 75 %). Pendiente decidir cuál criterio queda.
- **Configuración de sensores.** Si cambia el pin, la ganancia o el R0 de un sensor, no se edita su registro. Se cierra con `removed_at` y se crea uno nuevo en `sensors`, para conservar el historial.
