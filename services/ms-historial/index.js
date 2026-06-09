const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
app.use(express.json());
const port = process.env.APP_PORT || 3005;

// --- Configuración de Conexiones ---
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

const dbConfigMaster = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST_MASTER,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT_MASTER,
};

const dbConfigReplica = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST_REPLICA,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT_REPLICA,
};

// --- Clientes ---
const redisClient = redis.createClient({ url: `redis://${redisHost}:${redisPort}` });
const masterPool = new Pool(dbConfigMaster);
const replicaPool = new Pool(dbConfigReplica);

// --- Constantes ---
const IN_QUEUE = 'historial_queue';

// --- Lógica del Microservicio ---

async function initDb() {
    try {
        await masterPool.query(`
            CREATE TABLE IF NOT EXISTS alertas (
                id SERIAL PRIMARY KEY,
                id_dispositivo VARCHAR(255) NOT NULL,
                lat DOUBLE PRECISION NOT NULL,
                lon DOUBLE PRECISION NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                tipo_emergencia VARCHAR(100),
                direccion TEXT,
                pais VARCHAR(100),
                ciudad VARCHAR(100),
                prioridad VARCHAR(50),
                fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Tabla 'alertas' verificada/creada correctamente.");
    } catch (error) {
        console.error("Error al inicializar la base de datos:", error);
        process.exit(1);
    }
}

async function procesarAlertas() {
    await redisClient.connect();
    console.log(`Conectado a Redis en ${redisHost}:${redisPort}`);

    while (true) {
        try {
            const item = await redisClient.blPop(IN_QUEUE, 0);
            if (!item) continue;

            const alerta = JSON.parse(item.element);
            console.log('Alerta recibida para guardar en historial:', alerta.ID_dispositivo);

            const {
                ID_dispositivo, coordenadas, timestamp, tipo_emergencia,
                geolocalizacion, prioridad
            } = alerta;

            const query = `
                INSERT INTO alertas (id_dispositivo, lat, lon, timestamp, tipo_emergencia, direccion, pais, ciudad, prioridad)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `;
            const values = [
                ID_dispositivo, coordenadas.lat, coordenadas.lon, timestamp,
                tipo_emergencia, geolocalizacion?.direccion, geolocalizacion?.pais,
                geolocalizacion?.ciudad, prioridad
            ];

            await masterPool.query(query, values);
            console.log(`Alerta ${alerta.ID_dispositivo} guardada en la base de datos.`);

        } catch (error) {
            console.error('Error al procesar o guardar la alerta:', error);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// --- API para Consultas ---
app.get('/historial', async (req, res) => {
    try {
        const { fecha_inicio, fecha_fin, zona, prioridad } = req.query;
        
        let query = 'SELECT * FROM alertas';
        const conditions = [];
        const values = [];
        let valueIndex = 1;

        if (fecha_inicio) {
            conditions.push(`timestamp >= $${valueIndex++}`);
            values.push(fecha_inicio);
        }
        if (fecha_fin) {
            conditions.push(`timestamp <= $${valueIndex++}`);
            values.push(fecha_fin);
        }
        if (prioridad) {
            conditions.push(`prioridad = $${valueIndex++}`);
            values.push(prioridad);
        }
        if (zona) {
            conditions.push(`ciudad ILIKE $${valueIndex++}`);
            values.push(`%${zona}%`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY timestamp DESC';

        const { rows } = await replicaPool.query(query, values);
        res.json(rows);

    } catch (error) {
        console.error('Error al consultar el historial:', error);
        res.status(500).send('Error interno del servidor');
    }
});

app.get('/', (req, res) => {
    res.send('Microservicio de Historial');
});

app.listen(port, async () => {
    console.log(`Microservicio de Historial escuchando en http://localhost:${port}`);
    await initDb();
    procesarAlertas().catch(err => console.error("Fallo el procesamiento de alertas:", err));
});