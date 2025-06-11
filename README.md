# Besta Backend Service

This is the backend service for the Besta device, which monitors kitchen stove safety using IR and motion detection.

## Features

- Real-time monitoring of stove status
- WebSocket-based communication with devices
- Alert system with snooze, dismiss, and escalate options
- Automatic siren activation for unhandled alerts

## Prerequisites

- Node.js (v14 or higher)
- Redis server
- npm or yarn

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
PORT=3000
REDIS_URL=redis://localhost:6379
```

3. Start Redis server:
```bash
redis-server
```

4. Start the backend service:
```bash
npm start
```


## Deployment

### Setup gcloud to correct region
`gcloud auth configure-docker northamerica-northeast2-docker.pkg.dev`

### Build Image
`docker build --platform linux/amd64 -t besta-backend .`

### Tag
`docker tag besta-backend northamerica-northeast2-docker.pkg.dev/hack-the-hive-season-13/heat-the-hive/besta-backend:latest`

### Push
`docker push northamerica-northeast2-docker.pkg.dev/hack-the-hive-season-13/heat-the-hive/besta-backend:latest`

### Deploy Cloud run
Go to https://console.cloud.google.com/run/detail/northamerica-northeast2/besta-backend/metrics?inv=1&invt=AbzyWg&project=hack-the-hive-season-13
and deploy a new cloud run revision.

## WebSocket Connections

The service accepts WebSocket connections on port 8080. Connect using the following URLs:

- Embedded device: `ws://localhost:8080?type=embedded`
- Mobile app: `ws://localhost:8080?type=mobile`
- Thermostat: `ws://localhost:8080?type=tstat`

## Message Formats

### From Embedded Device
```json
{
    "status": 0  // 0 for "not ok", 1 for "ok"
}
```

### From Mobile/Thermostat
```json
{
    "action": "dismiss"  // "dismiss", or "escalate"
}
```

### To All Devices
```json
{
    "type": "alert"  // "alert", "start_siren", or "stop_siren"
}
``` 