/*
  BioRed v2 - Exporta lecturas del simulador como respuesta de la API

  Sirve para que Brayan pruebe la API contra lo que espera el módulo.
  Genera la misma respuesta que daría GET /lecturas para el rango pedido.

  Uso, desde la carpeta BioRed_Analisis_v2
    node herramientas/exportar_json.js                  últimos 35 días
    node herramientas/exportar_json.js 7                últimos 7 días
*/
const fs = require('fs');
const path = require('path');
const S = require('../js/simulador.js');

const dias = Number(process.argv[2]) || 35;
const hasta = Date.now();
const desde = S.inicioDia(hasta - dias * S.DIA);
const lecturas = S.generar(desde, hasta);

const respuesta = { device_uid: '80:B5:4E:C7:50:94', lecturas };
const salida = path.join(__dirname, '..', 'datos', `respuesta_api_${dias}_dias.json`);
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, JSON.stringify(respuesta, null, 1));

console.log(`${lecturas.length} lecturas entre ${S.texto(desde)} y ${S.texto(hasta)}`);
console.log(`Archivo ${salida}`);
