-- ============================================================
-- BIORED - Script 03 - Procedimiento de ingesta
--
-- Recibe el JSON que enviara el ESP32 y lo guarda aplicando las
-- reglas del modelo v3. Sirve para probar el set de pruebas sin
-- tener todavia el backend, y el backend lo puede reutilizar.
--
-- Ejecutar como administrador
--   sudo mysql < 03_procedimiento_ingesta.sql
--
-- Reglas que aplica
--   1. Identifica la estacion por device_uid (MAC), sin importar
--      si llega en mayusculas o minusculas.
--   2. La hora oficial (received_at) la pone el servidor.
--   3. Si el DHT22 llega invalido guarda NULL, nunca el -1.
--   4. Si una seccion no llega, no se crea su fila de detalle.
--   5. Si el MQ-135 esta calentando (warmed_up false) no guarda gas.
--   6. Descarta estimaciones de gas fuera de rango, como el valor
--      maximo que devuelve la libreria cuando se desborda.
--   7. Todo se guarda en una sola transaccion. Si algo falla no
--      queda nada a medias.
--
-- Formato del JSON (contrato con el firmware)
-- {
--   "device_uid": "80:B5:4E:C7:50:94",
--   "firmware_version": "2.1.0",
--   "uptime_s": 3600,
--   "dht22": {"valid": true, "temperature_c": 21.6, "humidity_pct": 69.5},
--   "ldr":   {"raw": 1200},
--   "mq135": {"warmed_up": true, "raw": 1340, "output_voltage": 1.8,
--             "rs_kohm": 17.778, "alarm": null,
--             "estimates": [{"gas": "CO2", "ppm": 2.82}]},
--   "audio": {"valid": true, "rms_mv": 61.0, "peak_to_peak_mv": 480,
--             "offset_mv": 1220, "sample_rate_hz": 8000}
-- }
-- ============================================================

USE biored;

DELIMITER $$

-- Devuelve el id del unico sensor activo de un modelo en una estacion
DROP FUNCTION IF EXISTS fn_sensor_activo $$
CREATE FUNCTION fn_sensor_activo(p_station_id BIGINT UNSIGNED, p_model VARCHAR(30))
RETURNS BIGINT UNSIGNED
READS SQL DATA
BEGIN
  DECLARE v_total INT DEFAULT 0;
  DECLARE v_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_msg VARCHAR(255);

  SELECT COUNT(*), MAX(id) INTO v_total, v_id
    FROM sensors
   WHERE station_id = p_station_id
     AND model = p_model
     AND removed_at IS NULL
     AND deleted_at IS NULL;

  IF v_total = 0 THEN
    SET v_msg = CONCAT('No hay un sensor ', p_model, ' activo registrado en la estacion');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  ELSEIF v_total > 1 THEN
    SET v_msg = CONCAT('Hay mas de un sensor ', p_model, ' activo en la estacion');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  RETURN v_id;
END $$

DROP PROCEDURE IF EXISTS sp_ingest_reading $$
CREATE PROCEDURE sp_ingest_reading(IN p_payload JSON, OUT p_reading_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_uid      VARCHAR(64);
  DECLARE v_station  BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_reading  BIGINT UNSIGNED;
  DECLARE v_sensor   BIGINT UNSIGNED;
  DECLARE v_valid    BOOLEAN;
  DECLARE v_msg      VARCHAR(255);

  -- Cualquier error deshace todo y se reporta a quien llamo
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_reading_id = NULL;

  -- Regla 1  identificar la estacion
  SET v_uid = UPPER(JSON_VALUE(p_payload, '$.device_uid'));
  IF v_uid IS NULL OR v_uid = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El envio no trae device_uid';
  END IF;

  SELECT id INTO v_station
    FROM stations
   WHERE device_uid = v_uid AND deleted_at IS NULL;

  IF v_station IS NULL THEN
    SET v_msg = CONCAT('Estacion no registrada o dada de baja ', v_uid);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  IF NOT JSON_CONTAINS_PATH(p_payload, 'one', '$.dht22', '$.ldr', '$.mq135', '$.audio') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El envio no trae datos de ningun sensor';
  END IF;

  START TRANSACTION;

  -- Regla 2  evento de lectura con la hora del servidor
  INSERT INTO readings (station_id, device_uptime_s, firmware_version)
  VALUES (v_station,
          JSON_VALUE(p_payload, '$.uptime_s' RETURNING UNSIGNED),
          JSON_VALUE(p_payload, '$.firmware_version'));
  SET v_reading = LAST_INSERT_ID();

  -- DHT22  temperatura y humedad (regla 3)
  IF JSON_CONTAINS_PATH(p_payload, 'one', '$.dht22') THEN
    SET v_sensor = fn_sensor_activo(v_station, 'DHT22');
    SET v_valid  = COALESCE(JSON_EXTRACT(p_payload, '$.dht22.valid') = CAST('true' AS JSON), FALSE);

    INSERT INTO temperature_readings (reading_id, sensor_id, value_c, is_valid)
    VALUES (v_reading, v_sensor,
            IF(v_valid, JSON_VALUE(p_payload, '$.dht22.temperature_c' RETURNING DECIMAL(10,3)), NULL),
            v_valid);

    INSERT INTO humidity_readings (reading_id, sensor_id, value_pct, is_valid)
    VALUES (v_reading, v_sensor,
            IF(v_valid, JSON_VALUE(p_payload, '$.dht22.humidity_pct' RETURNING DECIMAL(10,3)), NULL),
            v_valid);
  END IF;

  -- LDR  luz
  IF JSON_CONTAINS_PATH(p_payload, 'one', '$.ldr') THEN
    SET v_sensor = fn_sensor_activo(v_station, 'LDR');
    INSERT INTO light_readings (reading_id, sensor_id, raw_value)
    VALUES (v_reading, v_sensor, JSON_VALUE(p_payload, '$.ldr.raw' RETURNING UNSIGNED));
  END IF;

  -- MQ-135  gas (reglas 5 y 6)
  IF JSON_CONTAINS_PATH(p_payload, 'one', '$.mq135')
     AND NOT COALESCE(JSON_EXTRACT(p_payload, '$.mq135.warmed_up') = CAST('false' AS JSON), FALSE) THEN

    SET v_sensor = fn_sensor_activo(v_station, 'MQ135');

    INSERT INTO gas_readings (reading_id, sensor_id, raw_value, output_voltage, rs_kohm, alarm_triggered)
    VALUES (v_reading, v_sensor,
            JSON_VALUE(p_payload, '$.mq135.raw' RETURNING UNSIGNED),
            JSON_VALUE(p_payload, '$.mq135.output_voltage' RETURNING DECIMAL(10,3)),
            JSON_VALUE(p_payload, '$.mq135.rs_kohm' RETURNING DECIMAL(12,3)),
            CASE JSON_TYPE(JSON_EXTRACT(p_payload, '$.mq135.alarm'))
              WHEN 'BOOLEAN' THEN JSON_EXTRACT(p_payload, '$.mq135.alarm') = CAST('true' AS JSON)
              ELSE NULL
            END);

    -- Se valida el nombre del gas antes de insertar. MySQL reporta un
    -- valor invalido de ENUM como advertencia convertida en error, y
    -- ese tipo de error no lo captura el manejador de excepciones.
    IF EXISTS (SELECT 1
                 FROM JSON_TABLE(p_payload, '$.mq135.estimates[*]'
                        COLUMNS (gas VARCHAR(20) PATH '$.gas')) AS jt
                WHERE jt.gas IS NULL
                   OR jt.gas NOT IN ('CO2', 'CO', 'NH3', 'ALCOHOL', 'TOLUENE', 'ACETONE')) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Las estimaciones traen un gas no reconocido';
    END IF;

    INSERT INTO gas_estimates (reading_id, gas, ppm)
    SELECT v_reading, jt.gas, jt.ppm
      FROM JSON_TABLE(p_payload, '$.mq135.estimates[*]'
             COLUMNS (gas VARCHAR(20) PATH '$.gas',
                      ppm DOUBLE      PATH '$.ppm')) AS jt
     WHERE jt.ppm IS NOT NULL
       AND jt.ppm BETWEEN 0 AND 99999999.99;
  END IF;

  -- MAX9814  audio (las invalidas se guardan tal como llegan)
  IF JSON_CONTAINS_PATH(p_payload, 'one', '$.audio') THEN
    SET v_sensor = fn_sensor_activo(v_station, 'MAX9814');
    INSERT INTO audio_readings (reading_id, sensor_id, rms_mv, peak_to_peak_mv, offset_mv, sample_rate_hz, is_valid)
    VALUES (v_reading, v_sensor,
            JSON_VALUE(p_payload, '$.audio.rms_mv' RETURNING DECIMAL(10,2)),
            JSON_VALUE(p_payload, '$.audio.peak_to_peak_mv' RETURNING DECIMAL(10,2)),
            JSON_VALUE(p_payload, '$.audio.offset_mv' RETURNING DECIMAL(10,1)),
            JSON_VALUE(p_payload, '$.audio.sample_rate_hz' RETURNING UNSIGNED),
            COALESCE(JSON_EXTRACT(p_payload, '$.audio.valid') = CAST('true' AS JSON), FALSE));
  END IF;

  COMMIT;
  SET p_reading_id = v_reading;
END $$

DELIMITER ;

-- Permiso para que la aplicacion use el procedimiento
GRANT EXECUTE ON PROCEDURE biored.sp_ingest_reading TO 'biored_app'@'localhost';
