-- ============================================================
-- BIORED - Script 01 - Esquema de la base de datos (modelo v3)
-- Motor  MySQL 8.0 (probado en 8.0.46, Ubuntu 22.04)
-- Origen design_3.mermaid
--
-- Ejecutar como administrador
--   sudo mysql < 01_schema_v3.sql
--
-- ATENCION  Este script BORRA y vuelve a crear la base de datos
-- biored. Usarlo solo mientras no existan datos reales.
-- ============================================================

DROP DATABASE IF EXISTS biored;
CREATE DATABASE biored
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE biored;

-- ------------------------------------------------------------
-- Catalogos (con auditoria completa y borrado logico)
-- ------------------------------------------------------------

CREATE TABLE locations (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(100)    NOT NULL COMMENT 'Nombre del lugar fisico',
  description  VARCHAR(255)    NULL     COMMENT 'Tipo de sitio, direccion o referencia',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   DATETIME        NULL     DEFAULT NULL COMMENT 'Borrado logico',
  PRIMARY KEY (id)
) ENGINE=InnoDB COMMENT='Lugares fisicos donde se instalan estaciones';

CREATE TABLE stations (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  location_id      BIGINT UNSIGNED NULL     COMMENT 'Opcional, una estacion puede no tener lugar asignado',
  device_uid       CHAR(17)        NOT NULL COMMENT 'MAC del ESP32 en mayusculas, por ejemplo 80:B5:4E:C7:50:94',
  name             VARCHAR(100)    NOT NULL,
  location_detail  VARCHAR(255)    NULL,
  ip_address       VARCHAR(45)     NULL     COMMENT 'Solo informativa, el router la puede cambiar',
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de registro de la estacion',
  updated_at       DATETIME        NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at       DATETIME        NULL     DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_stations_device_uid (device_uid),
  KEY idx_stations_location (location_id),
  CONSTRAINT fk_stations_location FOREIGN KEY (location_id) REFERENCES locations (id),
  CONSTRAINT chk_stations_device_uid CHECK (REGEXP_LIKE(device_uid, '^([0-9A-F]{2}:){5}[0-9A-F]{2}$', 'c'))
) ENGINE=InnoDB COMMENT='Estaciones ESP32, identificadas por su MAC';

CREATE TABLE sensors (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  station_id    BIGINT UNSIGNED NOT NULL,
  model         VARCHAR(30)     NOT NULL COMMENT 'DHT22, LDR, MQ135 o MAX9814',
  metadata      JSON            NULL     COMMENT 'Configuracion segun el modelo, ver encabezado de design_3',
  installed_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at    DATETIME        NULL     DEFAULT NULL COMMENT 'NULL mientras el sensor siga activo',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME        NULL     DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_sensors_activos (station_id, model, removed_at),
  CONSTRAINT fk_sensors_station FOREIGN KEY (station_id) REFERENCES stations (id),
  CONSTRAINT chk_sensors_model CHECK (model IN ('DHT22', 'LDR', 'MQ135', 'MAX9814')),
  CONSTRAINT chk_sensors_fechas CHECK (removed_at IS NULL OR removed_at >= installed_at)
) ENGINE=InnoDB COMMENT='Sensores fisicos y su configuracion. Cambiar configuracion = nuevo registro';

-- ------------------------------------------------------------
-- Eventos de lectura (inmutables, solo created_at)
-- ------------------------------------------------------------

CREATE TABLE readings (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  station_id        BIGINT UNSIGNED NOT NULL,
  received_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Hora oficial, asignada por el servidor',
  device_uptime_s   BIGINT UNSIGNED NULL     COMMENT 'Segundos encendido del ESP32, si baja hubo reinicio',
  firmware_version  VARCHAR(20)     NULL     COMMENT 'Version del firmware, por ejemplo 2.1.0',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_readings_station_time (station_id, received_at),
  CONSTRAINT fk_readings_station FOREIGN KEY (station_id) REFERENCES stations (id)
) ENGINE=InnoDB COMMENT='Un registro por cada envio de la estacion';

CREATE TABLE temperature_readings (
  reading_id  BIGINT UNSIGNED NOT NULL,
  sensor_id   BIGINT UNSIGNED NOT NULL,
  value_c     DECIMAL(4,1)    NULL     COMMENT 'Grados Celsius, NULL si is_valid es falso',
  is_valid    BOOLEAN         NOT NULL COMMENT 'Falso cuando el DHT22 no respondio',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reading_id),
  KEY idx_temperature_sensor (sensor_id),
  CONSTRAINT fk_temperature_reading FOREIGN KEY (reading_id) REFERENCES readings (id),
  CONSTRAINT fk_temperature_sensor  FOREIGN KEY (sensor_id)  REFERENCES sensors (id),
  CONSTRAINT chk_temperature_valor CHECK (
    (is_valid = 1 AND value_c IS NOT NULL AND value_c BETWEEN -40 AND 80)
    OR (is_valid = 0 AND value_c IS NULL))
) ENGINE=InnoDB COMMENT='Rango del DHT22 de -40 a 80 C. El -1 de error nunca se guarda';

CREATE TABLE humidity_readings (
  reading_id  BIGINT UNSIGNED NOT NULL,
  sensor_id   BIGINT UNSIGNED NOT NULL,
  value_pct   DECIMAL(4,1)    NULL     COMMENT 'Humedad relativa en %, NULL si is_valid es falso',
  is_valid    BOOLEAN         NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reading_id),
  KEY idx_humidity_sensor (sensor_id),
  CONSTRAINT fk_humidity_reading FOREIGN KEY (reading_id) REFERENCES readings (id),
  CONSTRAINT fk_humidity_sensor  FOREIGN KEY (sensor_id)  REFERENCES sensors (id),
  CONSTRAINT chk_humidity_valor CHECK (
    (is_valid = 1 AND value_pct IS NOT NULL AND value_pct BETWEEN 0 AND 100)
    OR (is_valid = 0 AND value_pct IS NULL))
) ENGINE=InnoDB;

CREATE TABLE light_readings (
  reading_id  BIGINT UNSIGNED  NOT NULL,
  sensor_id   BIGINT UNSIGNED  NOT NULL,
  raw_value   SMALLINT UNSIGNED NOT NULL COMMENT 'ADC de 12 bits, de 0 a 4095',
  percentage  TINYINT UNSIGNED GENERATED ALWAYS AS (ROUND(raw_value * 100 / 4095)) STORED COMMENT 'Calculado por MySQL',
  created_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reading_id),
  KEY idx_light_sensor (sensor_id),
  CONSTRAINT fk_light_reading FOREIGN KEY (reading_id) REFERENCES readings (id),
  CONSTRAINT fk_light_sensor  FOREIGN KEY (sensor_id)  REFERENCES sensors (id),
  CONSTRAINT chk_light_raw CHECK (raw_value <= 4095)
) ENGINE=InnoDB;

CREATE TABLE gas_readings (
  reading_id       BIGINT UNSIGNED   NOT NULL,
  sensor_id        BIGINT UNSIGNED   NOT NULL,
  raw_value        SMALLINT UNSIGNED NOT NULL COMMENT 'ADC en el pin, despues del divisor',
  output_voltage   DECIMAL(5,3)      NOT NULL COMMENT 'Voltaje real de A-out en V, compensado por el divisor',
  rs_kohm          DECIMAL(8,3)      NULL     COMMENT 'Resistencia del sensor, base para recalcular ppm',
  alarm_triggered  BOOLEAN           NULL     COMMENT 'Salida DO, NULL mientras no este conectada',
  created_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reading_id),
  KEY idx_gas_sensor (sensor_id),
  CONSTRAINT fk_gas_reading FOREIGN KEY (reading_id) REFERENCES readings (id),
  CONSTRAINT fk_gas_sensor  FOREIGN KEY (sensor_id)  REFERENCES sensors (id),
  CONSTRAINT chk_gas_raw CHECK (raw_value <= 4095),
  CONSTRAINT chk_gas_voltaje CHECK (output_voltage BETWEEN 0 AND 5.5),
  CONSTRAINT chk_gas_rs CHECK (rs_kohm IS NULL OR rs_kohm >= 0)
) ENGINE=InnoDB COMMENT='No se insertan filas durante el calentamiento del MQ-135';

CREATE TABLE gas_estimates (
  reading_id  BIGINT UNSIGNED NOT NULL,
  gas         ENUM('CO2', 'CO', 'NH3', 'ALCOHOL', 'TOLUENE', 'ACETONE') NOT NULL,
  ppm         DECIMAL(10,2)   NOT NULL COMMENT 'Valor orientativo calculado con las curvas del datasheet',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reading_id, gas),
  CONSTRAINT fk_gas_estimates_reading FOREIGN KEY (reading_id) REFERENCES gas_readings (reading_id),
  CONSTRAINT chk_gas_estimates_ppm CHECK (ppm >= 0)
) ENGINE=InnoDB COMMENT='Hasta seis gases estimados por cada lectura del MQ-135';

CREATE TABLE audio_readings (
  reading_id       BIGINT UNSIGNED   NOT NULL,
  sensor_id        BIGINT UNSIGNED   NOT NULL,
  rms_mv           DECIMAL(7,2)      NOT NULL COMMENT 'Nivel RMS sin offset, en mV',
  peak_to_peak_mv  DECIMAL(7,2)      NOT NULL COMMENT 'Pico a pico maximo del intervalo, en mV',
  level_db         DECIMAL(5,1)      GENERATED ALWAYS AS (20 * LOG10(GREATEST(rms_mv, 0.1))) STORED COMMENT 'dB relativos a 1 mV, calculado por MySQL',
  offset_mv        DECIMAL(6,1)      NOT NULL COMMENT 'Cerca de 1250 si la conexion esta bien',
  sample_rate_hz   SMALLINT UNSIGNED NOT NULL COMMENT 'Baja cuando los motores se mueven',
  is_valid         BOOLEAN           NOT NULL COMMENT 'Falso si el offset quedo fuera de rango',
  created_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reading_id),
  KEY idx_audio_sensor (sensor_id),
  CONSTRAINT fk_audio_reading FOREIGN KEY (reading_id) REFERENCES readings (id),
  CONSTRAINT fk_audio_sensor  FOREIGN KEY (sensor_id)  REFERENCES sensors (id),
  CONSTRAINT chk_audio_valores CHECK (rms_mv >= 0 AND peak_to_peak_mv >= 0 AND offset_mv >= 0)
) ENGINE=InnoDB COMMENT='Las lecturas invalidas se guardan tal como llegan, offset_mv explica la falla';

-- ------------------------------------------------------------
-- Otros eventos
-- ------------------------------------------------------------

CREATE TABLE motor_commands (
  id           BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  station_id   BIGINT UNSIGNED   NOT NULL,
  motor        ENUM('pan', 'tilt') NOT NULL,
  direction    ENUM('ARRIBA', 'ABAJO', 'IZQ', 'DER') NOT NULL COMMENT 'Mismos valores que usa el firmware',
  steps        SMALLINT UNSIGNED NOT NULL,
  success      BOOLEAN           NOT NULL COMMENT 'Falso si el firmware rechazo la orden',
  executed_at  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Hora asignada por el servidor',
  created_at   DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_motor_station_time (station_id, executed_at),
  CONSTRAINT fk_motor_station FOREIGN KEY (station_id) REFERENCES stations (id),
  CONSTRAINT chk_motor_steps CHECK (steps BETWEEN 1 AND 200),
  CONSTRAINT chk_motor_direccion CHECK (
    (motor = 'tilt' AND direction IN ('ARRIBA', 'ABAJO'))
    OR (motor = 'pan' AND direction IN ('IZQ', 'DER')))
) ENGINE=InnoDB COMMENT='Historial de movimientos de la camara';

CREATE TABLE camera_captures (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  station_id   BIGINT UNSIGNED NOT NULL,
  captured_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Hora asignada por el servidor',
  image_path   VARCHAR(500)    NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   DATETIME        NULL     DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_camera_station_time (station_id, captured_at),
  CONSTRAINT fk_camera_station FOREIGN KEY (station_id) REFERENCES stations (id)
) ENGINE=InnoDB COMMENT='Sin campos de inteligencia artificial por ahora';

-- Resultado esperado  12 tablas
SHOW TABLES;
