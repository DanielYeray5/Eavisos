const express = require('express');
const redis = require('redis');
const NodeGeocoder = require('node-geocoder');

const app = express();
const port = process.env.APP_PORT || 3002;

// --- Configuración de Conexiones ---
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

// --- Clientes ---
const redisClient = redis.createClient({
    url: `redis://${redisHost}:${redisPort}`
});

const geocoder = NodeGeocoder({ provider: 'openstreetmap' });

// --- Constantes ---
const IN_QUEUE = 'alertas_queue';
const OUT_QUEUE = 'geolocalizadas_queue';

// --- Lógica del Microservicio ---
async function procesarAlertas() {
    await redisClient.connect();
    console.log(`Conectado a Redis en ${redisHost}:${redisPort}`);
    
    while (true) {
        try {
            console.log('Esperando alertas en la cola...');
            const item = await redisClient.blPop(IN_QUEUE, 0);
            
            if (item) {
                const alerta = JSON.parse(item.element);
                console.log('Alerta recibida para geolocalización:', alerta.ID_dispositivo);

                const { lat, lon } = alerta.coordenadas;

                // Obtener información geográfica
                const res = await geocoder.reverse({ lat, lon });
                
                if (res && res.length > 0) {
                    alerta.geolocalizacion = {
                        direccion: res[0].formattedAddress,
                        pais: res[0].country,
                        ciudad: res[0].city,
                        codigoPostal: res[0].zipcode,
                    };
                    console.log(`Geolocalización exitosa para la alerta ${alerta.ID_dispositivo}`);
                } else {
                    console.warn(`No se pudo geolocalizar la alerta ${alerta.ID_dispositivo}`);
                    alerta.geolocalizacion = null;
                }

                // Encolar la alerta procesada
                await redisClient.rPush(OUT_QUEUE, JSON.stringify(alerta));
                console.log(`Alerta geolocalizada encolada.`);
            }
        } catch (error) {
            console.error('Error al procesar la alerta:', error);
            // Esperar un poco antes de reintentar para no sobrecargar en caso de error persistente
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

app.get('/', (req, res) => {
    res.send('Microservicio de Geolocalización');
});

app.listen(port, () => {
    console.log(`Microservicio de Geolocalización escuchando en http://localhost:${port}`);
    procesarAlertas().catch(err => {
        console.error("Fallo el procesamiento de alertas:", err);
        process.exit(1);
    });
});