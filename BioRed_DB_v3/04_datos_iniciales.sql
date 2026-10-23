-- ============================================================
-- BIORED - Script 04 - Datos iniciales (catalogo real)
--
-- Registra la estacion con la MAC de tu ESP32 y sus cuatro
-- sensores. Sin este registro el procedimiento de ingesta
-- rechaza cualquier envio.
--
-- Ejecutar como administrador
--   sudo mysql < 04_datos_iniciales.sql
-- ============================================================

USE biored;

-- Lugar fisico (opcional). Si quieres asignarlo, quita los
-- comentarios, ajusta los datos y usa su id en location_id.
-- INSERT INTO locations (name, description)
-- VALUES ('Semillero BioRed', 'Lugar de instalacion de la estacion');

-- Estacion  la MAC se leyo del chip con esp_read_mac
INSERT INTO stations (location_id, device_uid, name, location_detail)
VALUES (NULL, '80:B5:4E:C7:50:94', 'Estacion BioRed 01', 'Prototipo en pruebas');

SET @estacion = LAST_INSERT_ID();

-- Sensores y su configuracion (claves definidas en design_3)
INSERT INTO sensors (station_id, model, metadata) VALUES
(@estacion, 'DHT22',
 JSON_OBJECT('pin', 14)),

-- El LDR sigue en GPIO34. Cuando se mueva a su pin definitivo hay
-- que cerrar este registro con removed_at y crear uno nuevo.
(@estacion, 'LDR',
 JSON_OBJECT('pin', 34, 'adc_bits', 12)),

-- Pin propuesto en el plan de pines. r0_kohm queda en NULL hasta
-- calibrar el MQ-135 en aire limpio.
(@estacion, 'MQ135',
 JSON_OBJECT(
   'pin', 3,
   'vcc_v', 5.0,
   'rl_kohm', 10,
   'r0_kohm', NULL,
   'clean_air_ratio', 3.6,
   'divider_factor', 0.6,
   'curves', JSON_OBJECT(
     'CO2',     JSON_OBJECT('a', 110.47, 'b', -2.862),
     'CO',      JSON_OBJECT('a', 605.18, 'b', -3.937),
     'NH3',     JSON_OBJECT('a', 102.2,  'b', -2.473),
     'ALCOHOL', JSON_OBJECT('a', 77.255, 'b', -3.18),
     'TOLUENE', JSON_OBJECT('a', 44.947, 'b', -3.445),
     'ACETONE', JSON_OBJECT('a', 34.668, 'b', -3.369)))),

(@estacion, 'MAX9814',
 JSON_OBJECT('pin', 19, 'gain_db', 50, 'ar_ratio', '1:4000',
             'unit', 'dB_rel', 'target_sample_rate_hz', 8000));

-- Resultado esperado  1 estacion y 4 sensores activos
SELECT id, device_uid, name FROM stations;
SELECT id, station_id, model, metadata FROM sensors;
