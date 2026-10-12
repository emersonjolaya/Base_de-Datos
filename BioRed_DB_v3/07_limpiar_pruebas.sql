-- ============================================================
-- BIORED - Script 07 - Limpiar los datos de prueba
--
-- Borra las lecturas que dejaron las pruebas y reinicia los
-- contadores. Conserva la estacion y sus sensores (script 04).
--
-- ATENCION  Ejecutarlo SOLO antes de empezar a recibir datos
-- reales. Despues de eso las lecturas son inmutables y no se
-- deben borrar.
--
-- Ejecutar como administrador
--   sudo mysql < 07_limpiar_pruebas.sql
-- ============================================================

USE biored;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE gas_estimates;
TRUNCATE TABLE gas_readings;
TRUNCATE TABLE audio_readings;
TRUNCATE TABLE light_readings;
TRUNCATE TABLE humidity_readings;
TRUNCATE TABLE temperature_readings;
TRUNCATE TABLE readings;
TRUNCATE TABLE motor_commands;
TRUNCATE TABLE camera_captures;
SET FOREIGN_KEY_CHECKS = 1;

DROP PROCEDURE IF EXISTS sp_run_test;
DROP TABLE IF EXISTS test_results;

-- Resultado esperado  0 lecturas, 1 estacion y 4 sensores
SELECT (SELECT COUNT(*) FROM readings) AS lecturas,
       (SELECT COUNT(*) FROM stations) AS estaciones,
       (SELECT COUNT(*) FROM sensors)  AS sensores;
