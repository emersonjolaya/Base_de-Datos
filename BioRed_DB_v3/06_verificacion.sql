-- ============================================================
-- BIORED - Script 06 - Verificacion de calidad de los datos
--
-- Revisa directamente en las tablas que las reglas del modelo v3
-- se cumplieron con los datos que dejo el script 05.
--
-- Ejecutar como administrador, despues del script 05
--   sudo mysql --table < 06_verificacion.sql
--
-- Resultado esperado  todas las verificaciones en PASA
-- ============================================================

USE biored;

SET @p01 = (SELECT reading_id FROM test_results WHERE case_id = 'P01');
SET @p02 = (SELECT reading_id FROM test_results WHERE case_id = 'P02');
SET @p03 = (SELECT reading_id FROM test_results WHERE case_id = 'P03');
SET @p04 = (SELECT reading_id FROM test_results WHERE case_id = 'P04');
SET @p05 = (SELECT reading_id FROM test_results WHERE case_id = 'P05');
SET @p06 = (SELECT reading_id FROM test_results WHERE case_id = 'P06');
SET @p07 = (SELECT reading_id FROM test_results WHERE case_id = 'P07');

SELECT verificacion, esperado, obtenido,
       IF(esperado = obtenido, 'PASA', 'FALLA') AS resultado
FROM (
  SELECT 'V01 Solo se guardaron los 7 envios validos' AS verificacion,
         '7' AS esperado,
         CAST((SELECT COUNT(*) FROM readings) AS CHAR) AS obtenido
  UNION ALL
  SELECT 'V02 Los envios rechazados no dejaron lecturas a medias', '0',
         CAST((SELECT COUNT(*) FROM readings r
                WHERE NOT EXISTS (SELECT 1 FROM temperature_readings t WHERE t.reading_id = r.id)
                  AND NOT EXISTS (SELECT 1 FROM light_readings l WHERE l.reading_id = r.id)
                  AND NOT EXISTS (SELECT 1 FROM gas_readings g WHERE g.reading_id = r.id)
                  AND NOT EXISTS (SELECT 1 FROM audio_readings a WHERE a.reading_id = r.id)) AS CHAR)
  UNION ALL
  SELECT 'V03 Nunca se guardo el -1 del DHT22', '0',
         CAST((SELECT COUNT(*) FROM temperature_readings WHERE value_c = -1)
            + (SELECT COUNT(*) FROM humidity_readings WHERE value_pct = -1) AS CHAR)
  UNION ALL
  SELECT 'V04 P02 DHT22 invalido quedo en NULL con is_valid falso', '2',
         CAST((SELECT COUNT(*) FROM temperature_readings WHERE reading_id = @p02 AND value_c IS NULL AND is_valid = 0)
            + (SELECT COUNT(*) FROM humidity_readings WHERE reading_id = @p02 AND value_pct IS NULL AND is_valid = 0) AS CHAR)
  UNION ALL
  SELECT 'V05 P03 sin fila de gas durante el calentamiento', '0',
         CAST((SELECT COUNT(*) FROM gas_readings WHERE reading_id = @p03) AS CHAR)
  UNION ALL
  SELECT 'V06 P01 guardo los seis gases estimados', '6',
         CAST((SELECT COUNT(*) FROM gas_estimates WHERE reading_id = @p01) AS CHAR)
  UNION ALL
  SELECT 'V07 P07 descarto la estimacion desbordada', '5',
         CAST((SELECT COUNT(*) FROM gas_estimates WHERE reading_id = @p07) AS CHAR)
  UNION ALL
  SELECT 'V08 P04 audio con offset 0 quedo con is_valid falso', '1',
         CAST((SELECT COUNT(*) FROM audio_readings WHERE reading_id = @p04 AND is_valid = 0 AND offset_mv = 0) AS CHAR)
  UNION ALL
  SELECT 'V09 P01 MySQL calculo level_db (20 log10 de 61 mV)', '35.7',
         CAST((SELECT level_db FROM audio_readings WHERE reading_id = @p01) AS CHAR)
  UNION ALL
  SELECT 'V10 P01 MySQL calculo el porcentaje de luz (1200 de 4095)', '29',
         CAST((SELECT percentage FROM light_readings WHERE reading_id = @p01) AS CHAR)
  UNION ALL
  SELECT 'V11 P06 la MAC en minusculas se asigno a la estacion 1', '1',
         CAST((SELECT station_id FROM readings WHERE id = @p06) AS CHAR)
  UNION ALL
  SELECT 'V12 P05 solo creo filas de temperatura y humedad', '2',
         CAST((SELECT COUNT(*) FROM temperature_readings WHERE reading_id = @p05)
            + (SELECT COUNT(*) FROM humidity_readings WHERE reading_id = @p05)
            + (SELECT COUNT(*) FROM light_readings WHERE reading_id = @p05)
            + (SELECT COUNT(*) FROM gas_readings WHERE reading_id = @p05)
            + (SELECT COUNT(*) FROM audio_readings WHERE reading_id = @p05) AS CHAR)
  UNION ALL
  SELECT 'V13 Todas las lecturas tienen la hora del servidor', '0',
         CAST((SELECT COUNT(*) FROM readings WHERE received_at IS NULL) AS CHAR)
  UNION ALL
  SELECT 'V14 biored_app no puede modificar ni borrar lecturas', '0',
         CAST((SELECT COUNT(*) FROM information_schema.TABLE_PRIVILEGES
                WHERE GRANTEE = '''biored_app''@''localhost'''
                  AND PRIVILEGE_TYPE IN ('UPDATE', 'DELETE')) AS CHAR)
) AS v;

-- ------------------------------------------------------------
-- Ejemplo de consulta para el futuro modulo de analisis
-- Una fila por envio con todas las magnitudes de la estacion
-- ------------------------------------------------------------
SELECT r.id                AS lectura,
       r.received_at       AS hora,
       t.value_c           AS temperatura_c,
       h.value_pct         AS humedad_pct,
       l.percentage        AS luz_pct,
       co2.ppm             AS co2_ppm,
       a.level_db          AS sonido_db,
       a.is_valid          AS audio_valido
  FROM readings r
  JOIN stations s                  ON s.id = r.station_id
  LEFT JOIN temperature_readings t ON t.reading_id = r.id
  LEFT JOIN humidity_readings h    ON h.reading_id = r.id
  LEFT JOIN light_readings l       ON l.reading_id = r.id
  LEFT JOIN gas_estimates co2      ON co2.reading_id = r.id AND co2.gas = 'CO2'
  LEFT JOIN audio_readings a       ON a.reading_id = r.id
 WHERE s.device_uid = '80:B5:4E:C7:50:94'
 ORDER BY r.received_at, r.id;
