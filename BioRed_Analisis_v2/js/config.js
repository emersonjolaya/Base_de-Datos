/*
  BioRed v2 - Configuración del módulo de análisis

  Para usar la API real de Brayan, cambia apiUrl por la dirección base
  de la API, por ejemplo 'https://tu-dominio/api'. Mientras sea null,
  el módulo usa los datos sintéticos.

  Los colores de cada variable ya no van aquí. Dependen de la paleta
  activa y están en js/tema.js.
*/
window.BIORED_CONFIG = {
  apiUrl: null,
  deviceUid: '80:B5:4E:C7:50:94',

  // Segundos entre consultas. 15 solo para la fase de pruebas.
  // Con la API real se ajusta al intervalo de envío del ESP32 (unos 180 s).
  intervaloActualizacionS: 15,

  // Variables que analiza el módulo. campoValidez indica la bandera que
  // marca una lectura como inválida. Esas lecturas no entran en los cálculos.
  // rango es el intervalo normal. Fuera de él la tarjeta muestra una alerta
  // y el gráfico dibuja el límite. Son valores de prueba que el semillero
  // debe ajustar al sitio donde quede instalada la estación.
  variables: [
    { campo: 'temperature_c', nombre: 'Temperatura',      corto: 'Temperatura', articulo: 'la temperatura',      unidad: '°C',  decimales: 1, campoValidez: 'dht_valid',   rango: { min: 12, max: 24 } },
    { campo: 'humidity_pct',  nombre: 'Humedad relativa', corto: 'Humedad',     articulo: 'la humedad relativa', unidad: '%',   decimales: 1, campoValidez: 'dht_valid',   rango: { min: 40, max: 90 } },
    { campo: 'light_pct',     nombre: 'Luz',              corto: 'Luz',         articulo: 'la luz',              unidad: '%',   decimales: 0 },
    { campo: 'co2_ppm',       nombre: 'CO2 estimado',     corto: 'CO2 est.',    articulo: 'el CO2 estimado',     unidad: 'ppm', decimales: 2, rango: { max: 6 }, nota: 'Valor orientativo del MQ-135' },
    { campo: 'sound_db',      nombre: 'Nivel de sonido',  corto: 'Sonido',      articulo: 'el nivel de sonido',  unidad: 'dB',  decimales: 1, campoValidez: 'audio_valid', rango: { max: 42 }, nota: 'Decibeles relativos a 1 mV, no dB SPL' }
  ],

  // Lecturas del MQ-135 que el usuario puede agregar con el botón "Agregar gas".
  // El CO2 es la variable de la lista de arriba y siempre está visible.
  // Los demás gases solo se muestran en la tarjeta de gases y en el gráfico
  // principal. No entran al análisis del periodo porque salen de la misma
  // resistencia del sensor que el CO2 y repetirían la misma información.
  gases: [
    { campo: 'co_ppm',      nombre: 'Monóxido de carbono (CO)', corto: 'CO',      articulo: 'el CO estimado',      unidad: 'ppm', decimales: 2, nota: 'Valor orientativo del MQ-135' },
    { campo: 'nh3_ppm',     nombre: 'Amoníaco (NH3)',           corto: 'NH3',     articulo: 'el NH3 estimado',     unidad: 'ppm', decimales: 2, nota: 'Valor orientativo del MQ-135' },
    { campo: 'alcohol_ppm', nombre: 'Alcohol',                  corto: 'Alcohol', articulo: 'el alcohol estimado', unidad: 'ppm', decimales: 2, nota: 'Valor orientativo del MQ-135' },
    { campo: 'toluene_ppm', nombre: 'Tolueno',                  corto: 'Tolueno', articulo: 'el tolueno estimado', unidad: 'ppm', decimales: 2, nota: 'Valor orientativo del MQ-135' },
    { campo: 'acetone_ppm', nombre: 'Acetona',                  corto: 'Acetona', articulo: 'la acetona estimada', unidad: 'ppm', decimales: 2, nota: 'Valor orientativo del MQ-135' }
  ]
};
