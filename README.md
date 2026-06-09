# Sistema de Alerta Ciudadana - Arquitectura de Microservicios

Este proyecto implementa un sistema de alerta ciudadana distribuido, simulando la infraestructura de un centro de comando y control (C5). El sistema recibe alertas desde dispositivos físicos (ESP32), las procesa a través de una cadena de microservicios y notifica a los operadores en tiempo real.

## Arquitectura

El sistema está compuesto por 5 microservicios principales, orquestados junto con servicios de infraestructura utilizando Docker.

- **Recepción de Alertas**: Se suscribe a un topic MQTT, valida y encola las alertas entrantes.
- **Geolocalización**: Procesa las coordenadas GPS de la alerta para obtener una dirección física.
- **Asignación de Prioridad**: Clasifica las alertas (crítica, alta, media) según reglas de negocio.
- **Notificaciones**: Envía los datos completos de la alerta en tiempo real a los operadores vía WebSockets.
- **Historial de Incidentes**: Persiste todas las alertas en una base de datos PostgreSQL y provee una API para su consulta.

### Stack Tecnológico
- **Dispositivo (Simulado)**: ESP32 con botón de pánico.
- **Protocolo IoT**: MQTT (Eclipse Mosquitto).
- **Comunicación entre servicios**: Colas de mensajes con Redis.
- **Notificaciones en tiempo real**: WebSockets.
- **Caché / Colas**: Redis.
- **Persistencia**: PostgreSQL con replicación maestro-réplica.
- **Contenedores**: Docker y Docker Compose.
- **Balanceo de Carga**: Nginx.

---

## Instrucciones de Despliegue y Uso

Sigue estos pasos para levantar y probar todo el ecosistema en tu máquina local.

### Prerrequisitos
- **Docker** y **Docker Compose**: Asegúrate de tener ambos instalados y en ejecución. [Instalar Docker](https://docs.docker.com/get-docker/).
- **Node.js**: Opcional, solo si deseas ejecutar los servicios fuera de Docker.
- **Cliente MQTT**: Una herramienta para enviar mensajes MQTT, como [MQTTX](https://mqttx.app/) o `mosquitto_pub` desde la línea de comandos.
- **Cliente WebSocket**: Una herramienta para conectarte al servidor de WebSockets, como la extensión [Simple WebSocket Client](https://chrome.google.com/webstore/detail/simple-websocket-client/pfdhoblngboilpfeibdedpjgfnlcodoo) para Chrome o similar.

### 1. Configuración del Entorno

1.  **Clona el repositorio**:
    ```bash
    git clone <URL-del-repositorio>
    cd <nombre-del-repositorio>
    ```

2.  **Crea el archivo de entorno**:
    Copia el archivo de ejemplo `.env.example` a un nuevo archivo llamado `.env`.
    ```bash
    # En Windows (Command Prompt)
    copy .env.example .env

    # En Windows (PowerShell)
    Copy-Item .env.example .env

    # En Linux/macOS
    cp .env.example .env
    ```
    El archivo `.env` ya viene con valores por defecto que funcionarán para el entorno de Docker. No necesitas modificarlo para empezar.

### 2. Levantar el Sistema

Una vez configurado el entorno, levanta todos los servicios con un solo comando:

```bash
docker-compose up --build
```

- `--build`: Este flag fuerza a Docker a reconstruir las imágenes de los microservicios si ha habido algún cambio en el código o en los `Dockerfile`.
- La primera vez que ejecutes este comando, Docker descargará todas las imágenes base (Postgres, Redis, Nginx, etc.) y construirá las imágenes de cada microservicio. Esto puede tardar varios minutos.
- Verás en la terminal los logs de todos los contenedores a medida que se inician.

### 3. Probar el Flujo de Alertas

#### Paso A: Conectarse como Operador
1.  Abre tu cliente de WebSocket.
2.  Conéctate a la siguiente URL: `ws://localhost:3004`
3.  Deja la conexión abierta. Aquí recibirás las notificaciones de alertas en tiempo real.

#### Paso B: Enviar una Alerta de Emergencia (Simulación del ESP32)
1.  Abre tu cliente MQTT.
2.  Conéctate al broker en `localhost` en el puerto `1883`.
3.  Publica un mensaje en el topic `alertas`. El cuerpo del mensaje debe ser un JSON con la siguiente estructura:

    ```json
    {
      "ID_dispositivo": "ESP32-001",
      "coordenadas": {
        "lat": 40.416775,
        "lon": -3.703790
      },
      "timestamp": "2024-06-09T10:00:00Z",
      "tipo_emergencia": "incendio"
    }
    ```
    **Tipos de emergencia de ejemplo**: `incendio`, `accidente grave`, `emergencia médica`, `robo`, `asalto`, `actividad sospechosa`.

#### Paso C: Verificar el Resultado
1.  **Consola de Docker**: Observa los logs de `docker-compose`. Verás cómo la alerta pasa por cada microservicio:
    - `ms-recepcion-alertas`: Recibe el mensaje MQTT y lo encola.
    - `ms-geolocalizacion`: Lo desencola, añade la dirección y lo vuelve a encolar.
    - `ms-prioridad`: Lo desencola, le asigna una prioridad y lo encola.
    - `ms-notificaciones`: Lo desencola y lo envía por WebSocket.
    - `ms-historial`: Lo desencola y lo guarda en la base de datos.

2.  **Cliente WebSocket**: Inmediatamente después de enviar el mensaje MQTT, deberías recibir en tu cliente WebSocket un JSON con la alerta completa, incluyendo la geolocalización y la prioridad asignada.

    ```json
    {
      "ID_dispositivo": "ESP32-001",
      "coordenadas": { "lat": 40.416775, "lon": -3.703790 },
      "timestamp": "2024-06-09T10:00:00Z",
      "tipo_emergencia": "incendio",
      "geolocalizacion": {
        "direccion": "Puerta del Sol, Plaza de la Puerta del Sol, Sol, Centro, Madrid, Comunidad de Madrid, 28013, España",
        "pais": "España",
        "ciudad": "Madrid",
        "codigoPostal": "28013"
      },
      "prioridad": "crítica"
    }
    ```

### 4. Consultar el Historial de Alertas

Puedes consultar las alertas almacenadas a través de la API del microservicio de historial. Abre tu navegador o una herramienta como Postman y haz una petición GET.

- **Obtener todas las alertas**:
  `http://localhost:3005/historial`

- **Filtrar por prioridad**:
  `http://localhost:3005/historial?prioridad=crítica`

- **Filtrar por zona (ciudad)**:
  `http://localhost:3005/historial?zona=Madrid`

- **Filtrar por rango de fechas**:
  `http://localhost:3005/historial?fecha_inicio=2024-06-01&fecha_fin=2024-06-10`

### 5. Detener el Sistema

Para detener todos los contenedores, presiona `Ctrl + C` en la terminal donde ejecutaste `docker-compose up`. Luego, para asegurarte de que los contenedores y las redes se eliminen por completo, puedes ejecutar:

```bash
docker-compose down
```
Si además quieres eliminar los volúmenes (perderás los datos de la base de datos y Redis), usa:
```bash
docker-compose down -v
```
