const express = require('express');
const redis = require('redis');

const app = express();
const port = process.env.APP_PORT || 3003;

// --- Configuración de Conexiones ---
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

// --- Clientes ---
const redisClient = redis.createClient({
    url: `redis://${redisHost}:${redisPort}`
});

// --- Constantes ---
const IN_QUEUE = 'geolocalizadas_queue';
const OUT_QUEUE = 'priorizadas_queue';

// --- Lógica del Microservicio ---

function asignarPrioridad(tipoEmergencia) {
    // Reglas de negocio para la asignación de prioridad
    switch (tipoEmergencia.toLowerCase()) {
        case 'incendio':
        case 'accidente grave':
        case 'emergencia médica':
            return 'crítica';
        case 'robo':
        case 'asalto':
        case 'violencia':
            return 'alta';
        case 'actividad sospechosa':
        case 'vandalismo':
        case 'otro':
            return 'media';
        default:
            return 'media';
    }
}

async function procesarAlertas() {
    await redisClient.connect();
    console.log(`Conectado a Redis en ${redisHost}:${redisPort}`);

    while (true) {
        try {
            console.log('Esperando alertas geolocalizadas en la cola...');
            const item = await redisClient.blPop(IN_QUEUE, 0);

            if (item) {
                const alerta = JSON.parse(item.element);
                console.log('Alerta recibida para priorización:', alerta.ID_dispositivo);

                // Asignar prioridad
                alerta.prioridad = asignarPrioridad(alerta.tipo_emergencia);
                console.log(`Prioridad '${alerta.prioridad}' asignada a la alerta ${alerta.ID_dispositivo}`);

                // Encolar la alerta procesada
                await redisClient.rPush(OUT_QUEUE, JSON.stringify(alerta));
                console.log(`Alerta priorizada encolada.`);
            }
        } catch (error) {
            console.error('Error al procesar la alerta:', error);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

app.get('/', (req, res) => {
    res.send('Microservicio de Asignación de Prioridad');
});

app.listen(port, () => {
    console.log(`Microservicio de Asignación de Prioridad escuchando en http://localhost:${port}`);
    procesarAlertas().catch(err => {
        console.error("Fallo el procesamiento de alertas:", err);
        process.exit(1);
    });
});