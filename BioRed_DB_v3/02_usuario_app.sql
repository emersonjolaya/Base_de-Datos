-- ============================================================
-- BIORED - Script 02 - Usuario de la aplicacion
--
-- ANTES DE EJECUTAR cambia CAMBIAR_ESTA_CLAVE por una clave
-- segura. No la compartas ni la subas a ningun repositorio.
--
-- Ejecutar como administrador
--   sudo mysql < 02_usuario_app.sql
--
-- El backend nunca debe conectarse como root. Este usuario puede
-- leer todo e insertar lecturas, pero NO puede modificar ni borrar
-- lecturas, porque en el modelo v3 son inmutables.
-- ============================================================

CREATE USER IF NOT EXISTS 'biored_app'@'localhost' IDENTIFIED BY 'CAMBIAR_ESTA_CLAVE';

-- Lectura de toda la base (para el modulo de analisis y la API de consulta)
GRANT SELECT ON biored.* TO 'biored_app'@'localhost';

-- Insercion de eventos (lecturas, comandos de motor y capturas)
GRANT INSERT ON biored.readings             TO 'biored_app'@'localhost';
GRANT INSERT ON biored.temperature_readings TO 'biored_app'@'localhost';
GRANT INSERT ON biored.humidity_readings    TO 'biored_app'@'localhost';
GRANT INSERT ON biored.light_readings       TO 'biored_app'@'localhost';
GRANT INSERT ON biored.gas_readings         TO 'biored_app'@'localhost';
GRANT INSERT ON biored.gas_estimates        TO 'biored_app'@'localhost';
GRANT INSERT ON biored.audio_readings       TO 'biored_app'@'localhost';
GRANT INSERT ON biored.motor_commands       TO 'biored_app'@'localhost';
GRANT INSERT ON biored.camera_captures      TO 'biored_app'@'localhost';

-- Los catalogos (locations, stations, sensors) los administra una
-- persona con el usuario administrador, no la aplicacion.

FLUSH PRIVILEGES;

-- Resultado esperado  la lista de permisos de biored_app
SHOW GRANTS FOR 'biored_app'@'localhost';
