-- ============================================================
-- BIORED - Script 05 - Pruebas automaticas con el set JSON
--
-- Envia cada caso de pruebas_payloads_v3.json al procedimiento
-- de ingesta y compara el resultado obtenido con el esperado.
-- Las llamadas de abajo se generaron desde ese archivo JSON.
--
-- Ejecutar como administrador
--   sudo mysql --table < 05_pruebas.sql
--
-- Resultado esperado  los 13 casos en PASA
-- Despues de probar, ejecuta 07_limpiar_pruebas.sql para borrar
-- los datos de prueba antes de recibir datos reales.
-- ============================================================

USE biored;

DROP TABLE IF EXISTS test_results;
CREATE TABLE test_results (
  case_id      VARCHAR(10)  NOT NULL,
  description  VARCHAR(255) NOT NULL,
  expected     VARCHAR(10)  NOT NULL,
  obtained     VARCHAR(10)  NOT NULL,
  reading_id   BIGINT UNSIGNED NULL,
  detail       VARCHAR(500) NULL,
  result       VARCHAR(10)  NOT NULL,
  PRIMARY KEY (case_id)
) ENGINE=InnoDB COMMENT='Tabla temporal de pruebas, se borra con el script 07';

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_run_test $$
CREATE PROCEDURE sp_run_test(IN p_case VARCHAR(10), IN p_desc VARCHAR(255),
                             IN p_expected VARCHAR(10), IN p_expected_msg VARCHAR(100),
                             IN p_payload JSON)
BEGIN
  DECLARE v_error   VARCHAR(500) DEFAULT NULL;
  DECLARE v_reading BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_obtained VARCHAR(10);
  DECLARE v_pasa    BOOLEAN;

  -- Captura el error sin detener el script
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
  BEGIN
    GET DIAGNOSTICS CONDITION 1 v_error = MESSAGE_TEXT;
  END;

  CALL sp_ingest_reading(p_payload, v_reading);

  SET v_obtained = IF(v_error IS NULL, 'ok', 'error');
  SET v_pasa = (v_obtained = p_expected)
               AND (p_expected = 'ok' OR v_error LIKE CONCAT('%', p_expected_msg, '%'));

  INSERT INTO test_results (case_id, description, expected, obtained, reading_id, detail, result)
  VALUES (p_case, p_desc, p_expected, v_obtained, v_reading, v_error, IF(v_pasa, 'PASA', 'FALLA'));
END $$

DELIMITER ;

-- ------------------------------------------------------------
-- Casos de prueba
-- ------------------------------------------------------------

-- P01  Lectura completa en aire limpio con los cuatro sensores y seis gases
CALL sp_run_test('P01', 'Lectura completa en aire limpio con los cuatro sensores y seis gases', 'ok', '',
  '{"device_uid": "80:B5:4E:C7:50:94", "firmware_version": "2.1.0", "uptime_s": 3600, "dht22": {"valid": true, "temperature_c": 21.6, "humidity_pct": 69.5}, "ldr": {"raw": 1200}, "mq135": {"warmed_up": true, "raw": 1340, "output_voltage": 1.8, "rs_kohm": 17.778, "alarm": null, "estimates": [{"gas": "CO2", "ppm": 2.83}, {"gas": "CO", "ppm": 3.91}, {"gas": "NH3", "ppm": 4.3}, {"gas": "ALCOHOL", "ppm": 1.31}, {"gas": "TOLUENE", "ppm": 0.54}, {"gas": "ACETONE", "ppm": 0.46}]}, "audio": {"valid": true, "rms_mv": 61.0, "peak_to_peak_mv": 480, "offset_mv": 1220, "sample_rate_hz": 8000}}');

-- P02  El DHT22 falla y el firmware envia -1. Debe guardarse NULL con is_valid falso
CALL sp_run_test('P02', 'El DHT22 falla y el firmware envia -1. Debe guardarse NULL con is_valid falso', 'ok', '',
  '{"device_uid": "80:B5:4E:C7:50:94", "firmware_version": "2.1.0", "uptime_s": 3660, "dht22": {"valid": false, "temperature_c": -1.0, "humidity_pct": -1.0}, "ldr": {"raw": 1250}, "mq135": {"warmed_up": true, "raw": 1355, "output_voltage": 1.82, "rs_kohm": 17.473, "alarm": null, "estimates": [{"gas": "CO2", "ppm": 2.97}, {"gas": "CO", "ppm": 4.18}, {"gas": "NH3", "ppm": 4.49}, {"gas": "ALCOHOL", "ppm": 1.39}, {"gas": "TOLUENE", "ppm": 0.58}, {"gas": "ACETONE", "ppm": 0.49}]}, "audio": {"valid": true, "rms_mv": 51.6, "peak_to_peak_mv": 395, "offset_mv": 1220, "sample_rate_hz": 8000}}');

-- P03  MQ-135 en calentamiento. No debe crearse fila de gas
CALL sp_run_test('P03', 'MQ-135 en calentamiento. No debe crearse fila de gas', 'ok', '',
  '{"device_uid": "80:B5:4E:C7:50:94", "firmware_version": "2.1.0", "uptime_s": 60, "dht22": {"valid": true, "temperature_c": 21.4, "humidity_pct": 70.1}, "ldr": {"raw": 980}, "mq135": {"warmed_up": false, "raw": 2159, "output_voltage": 2.9, "rs_kohm": 7.241, "alarm": null, "estimates": [{"gas": "CO2", "ppm": 36.93}, {"gas": "CO", "ppm": 134.05}, {"gas": "NH3", "ppm": 39.65}, {"gas": "ALCOHOL", "ppm": 22.87}, {"gas": "TOLUENE", "ppm": 12.02}, {"gas": "ACETONE", "ppm": 9.54}]}, "audio": {"valid": true, "rms_mv": 24.2, "peak_to_peak_mv": 213, "offset_mv": 1220, "sample_rate_hz": 7600}}');

-- P04  Aire con gases y microfono desconectado. Audio se guarda con is_valid falso
CALL sp_run_test('P04', 'Aire con gases y microfono desconectado. Audio se guarda con is_valid falso', 'ok', '',
  '{"device_uid": "80:B5:4E:C7:50:94", "firmware_version": "2.1.0", "uptime_s": 3720, "dht22": {"valid": true, "temperature_c": 21.7, "humidity_pct": 69.2}, "ldr": {"raw": 3100}, "mq135": {"warmed_up": true, "raw": 1936, "output_voltage": 2.6, "rs_kohm": 9.231, "alarm": true, "estimates": [{"gas": "CO2", "ppm": 18.44}, {"gas": "CO", "ppm": 51.55}, {"gas": "NH3", "ppm": 21.76}, {"gas": "ALCOHOL", "ppm": 10.57}, {"gas": "TOLUENE", "ppm": 5.21}, {"gas": "ACETONE", "ppm": 4.21}]}, "audio": {"valid": false, "rms_mv": 15.2, "peak_to_peak_mv": 1319, "offset_mv": 0, "sample_rate_hz": 7976}}');

-- P05  Solo llega el DHT22. Solo deben crearse filas de temperatura y humedad
CALL sp_run_test('P05', 'Solo llega el DHT22. Solo deben crearse filas de temperatura y humedad', 'ok', '',
  '{"device_uid": "80:B5:4E:C7:50:94", "firmware_version": "2.1.0", "uptime_s": 3780, "dht22": {"valid": true, "temperature_c": 21.6, "humidity_pct": 69.6}}');

-- P06  La MAC llega en minusculas. Debe reconocerse la misma estacion
CALL sp_run_test('P06', 'La MAC llega en minusculas. Debe reconocerse la misma estacion', 'ok', '',
  '{"device_uid": "80:b5:4e:c7:50:94", "firmware_version": "2.1.0", "uptime_s": 3840, "dht22": {"valid": true, "temperature_c": 21.6, "humidity_pct": 69.5}, "audio": {"valid": true, "rms_mv": 61.0, "peak_to_peak_mv": 480, "offset_mv": 1220, "sample_rate_hz": 8000}}');

-- P07  Una estimacion se desborda (3.4e38). Se descarta y se guardan las otras cinco
CALL sp_run_test('P07', 'Una estimacion se desborda (3.4e38). Se descarta y se guardan las otras cinco', 'ok', '',
  '{"device_uid": "80:B5:4E:C7:50:94", "firmware_version": "2.1.0", "uptime_s": 3900, "mq135": {"warmed_up": true, "raw": 1377, "output_voltage": 1.85, "rs_kohm": 17.027, "alarm": null, "estimates": [{"gas": "CO2", "ppm": 3.2}, {"gas": "CO", "ppm": 3.4028235e+38}, {"gas": "NH3", "ppm": 4.79}, {"gas": "ALCOHOL", "ppm": 1.51}, {"gas": "TOLUENE", "ppm": 0.63}, {"gas": "ACETONE", "ppm": 0.54}]}}');

-- P08  Estacion con una MAC que no esta registrada
CALL sp_run_test('P08', 'Estacion con una MAC que no esta registrada', 'error', 'no registrada',
  '{"device_uid": "AA:BB:CC:DD:EE:FF", "firmware_version": "2.1.0", "uptime_s": 3600, "dht22": {"valid": true, "temperature_c": 21.6, "humidity_pct": 69.5}}');

-- P09  El envio no trae device_uid
CALL sp_run_test('P09', 'El envio no trae device_uid', 'error', 'device_uid',
  '{"firmware_version": "2.1.0", "uptime_s": 3600, "dht22": {"valid": true, "temperature_c": 21.6, "humidity_pct": 69.5}}');

-- P10  Humedad de 150 % marcada como valida. No debe quedar nada guardado
CALL sp_run_test('P10', 'Humedad de 150 % marcada como valida. No debe quedar nada guardado', 'error', 'chk_humidity_valor',
  '{"device_uid": "80:B5:4E:C7:50:94", "firmware_version": "2.1.0", "uptime_s": 3600, "dht22": {"valid": true, "temperature_c": 21.6, "humidity_pct": 150.0}, "ldr": {"raw": 1200}}');

-- P11  LDR con valor 5000, fuera del rango del ADC de 12 bits
CALL sp_run_test('P11', 'LDR con valor 5000, fuera del rango del ADC de 12 bits', 'error', 'chk_light_raw',
  '{"device_uid": "80:B5:4E:C7:50:94", "firmware_version": "2.1.0", "uptime_s": 3600, "ldr": {"raw": 5000}}');

-- P12  Gas desconocido METHANE en las estimaciones
CALL sp_run_test('P12', 'Gas desconocido METHANE en las estimaciones', 'error', 'gas',
  '{"device_uid": "80:B5:4E:C7:50:94", "firmware_version": "2.1.0", "uptime_s": 3600, "mq135": {"warmed_up": true, "raw": 1340, "output_voltage": 1.8, "rs_kohm": 17.778, "alarm": null, "estimates": [{"gas": "METHANE", "ppm": 5.0}]}}');

-- P13  El envio no trae datos de ningun sensor
CALL sp_run_test('P13', 'El envio no trae datos de ningun sensor', 'error', 'ningun sensor',
  '{"device_uid": "80:B5:4E:C7:50:94", "firmware_version": "2.1.0", "uptime_s": 3600}');

-- ------------------------------------------------------------
-- Resultado
-- ------------------------------------------------------------
SELECT case_id, expected, obtained, reading_id, result, detail
  FROM test_results
 ORDER BY case_id;

SELECT SUM(result = 'PASA')  AS casos_que_pasan,
       SUM(result = 'FALLA') AS casos_que_fallan
  FROM test_results;
