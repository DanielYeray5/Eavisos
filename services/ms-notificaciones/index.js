const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const redis = require('redis');

const app = express();
const port = process.env.APP_PORT || 3004;

// --- Configuración de Conexiones ---
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

// --- Servidores ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- Clientes ---
const redisSubscriber = redis.createClient({ url: `redis://${redisHost}:${redisPort}` });
const redisClient = redis.createClient({ url: `redis://${redisHost}:${redisPort}` });


// --- Constantes ---
const IN_QUEUE = 'priorizadas_queue';
const OUT_QUEUE_HISTORIAL = 'historial_queue';
const FAILED_NOTIFICATIONS_QUEUE = 'failed_notifications_queue';

// --- Lógica del Microservicio ---

wss.on('connection', (ws) => {
    console.log('Nuevo operador conectado.');
    ws.on('close', () => console.log('Operador desconectado.'));
});

function broadcast(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

async function procesarAlertas() {
    await redisClient.connect();
    console.log(`Conectado a Redis en ${redisHost}:${redisPort}`);

    while (true) {
        try {
            const item = await redisClient.blPop(IN_QUEUE, 0);
            if (!item) continue;

            const alertaString = item.element;
            const alerta = JSON.parse(alertaString);
            console.log('Alerta recibida para notificar:', alerta.ID_dispositivo);

            if (wss.clients.size > 0) {
                console.log(`Enviando alerta ${alerta.ID_dispositivo} a ${wss.clients.size} operadores.`);
                broadcast(alerta);
            } else {
                console.warn('No hay operadores conectados. Encolando para reintento.');
                await redisClient.rPush(FAILED_NOTIFICATIONS_QUEUE, alertaString);
            }

            // Encolar para el historial
            await redisClient.rPush(OUT_QUEUE_HISTORIAL, alertaString);
            console.log(`Alerta encolada para historial.`);

        } catch (error) {
            console.error('Error al procesar la alerta:', error);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

async function reintentarNotificaciones() {
    const checkInterval = 5000; // 5 segundos
    const subscriber = redisSubscriber.duplicate();
    await subscriber.connect();

    setInterval(async () => {
        if (wss.clients.size > 0) {
            const len = await redisClient.lLen(FAILED_NOTIFICATIONS_QUEUE);
            if (len > 0) {
                console.log(`Reintentando ${len} notificaciones fallidas...`);
                const alertaString = await redisClient.lPop(FAILED_NOTIFICATIONS_QUEUE);
                if (alertaString) {
                    const alerta = JSON.parse(alertaString);
                    broadcast(alerta);
                }
            }
        }
    }, checkInterval);
}

app.get('/', (req, res) => {
    res.send('Microservicio de Notificaciones');
});

server.listen(port, () => {
    console.log(`Microservicio de Notificaciones escuchando en http://localhost:${port}`);
    console.log(`Servidor WebSocket escuchando en ws://localhost:${port}`);
    
    procesarAlertas().catch(err => console.error("Fallo el procesamiento de alertas:", err));
    reintentarNotificaciones().catch(err => console.error("Fallo el reintento de notificaciones:", err));
});