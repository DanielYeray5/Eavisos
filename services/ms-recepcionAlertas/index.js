const express = require('express');
const mqtt = require('mqtt');
const redis = require('redis');

const app = express();
// El puerto se definirá por Nginx, internamente puede ser 3001
const port = process.env.APP_PORT || 3001;

// --- Configuración de Conexiones ---
const mqttUrl = process.env.MQTT_URL || 'mqtt://localhost:1883';
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;
const topic = 'alertas';

// --- Clientes ---
const mqttClient = mqtt.connect(mqttUrl);
const redisClient = redis.createClient({
    url: `redis://${redisHost}:${redisPort}`
});

redisClient.on('error', (err) => console.error('Error de Redis:', err));
redisClient.connect();

// --- Lógica del Microservicio ---
mqttClient.on('connect', () => {
    console.log(`Conectado al broker MQTT en ${mqttUrl}`);
    mqttClient.subscribe(topic, (err) => {
        if (err) {
            console.error('Error al suscribirse al topic:', err);
        } else {
            console.log(`Suscrito al topic '${topic}'`);
        }
    });
});

mqttClient.on('message', async (topic, message) => {
    console.log(`Mensaje recibido en el topic '${topic}': ${message.toString()}`);

    try {
        const alerta = JSON.parse(message.toString());

        // Validación del mensaje
        if (alerta.ID_dispositivo && alerta.coordenadas && alerta.timestamp && alerta.tipo_emergencia) {
            // Encolar el mensaje en Redis
            await redisClient.rPush('alertas_queue', JSON.stringify(alerta));
            console.log(`Alerta encolada en Redis.`);
        } else {
            console.warn('Mensaje de alerta inválido:', alerta);
        }
    } catch (error) {
        console.error('Error al procesar el mensaje MQTT:', error);
    }
});

app.get('/', (req, res) => {
    res.send('Microservicio de Recepción de Alertas');
});

app.listen(port, () => {
    console.log(`Microservicio de Recepción de Alertas escuchando en http://localhost:${port}`);
});