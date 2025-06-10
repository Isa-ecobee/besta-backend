const express = require('express');
const WebSocket = require('ws');
const Redis = require('redis');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Redis client setup
const redisClient = Redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// WebSocket server setup
const wss = new WebSocket.Server({ port: 8080 });

// Store connected clients
const clients = {
    mobile: null,
    tstat: null,
    embedded: null
};

// Initialize Redis connection
(async () => {
    await redisClient.connect();
    await redisClient.set('consecutive_not_ok', '0');
    await redisClient.set('snooze_until', '0');
    await redisClient.set('siren_active', 'false');
    await redisClient.set('alert_active', 'false');
    await redisClient.set('tstat_response', 'false');
    await redisClient.set('mobile_response', 'false');
})();

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    const clientType = req.url.split('=')[1]; // Get client type from URL
    clients[clientType] = ws;

    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        
        if (clientType === 'embedded') {
            await handleEmbeddedMessage(data);
        } else if (clientType === 'mobile' || clientType === 'tstat') {
            await handleDeviceResponse(clientType, data);
        }
    });

    ws.on('close', () => {
        clients[clientType] = null;
    });
});

// Poll thermostat for response
async function pollThermostat() {
    const alertActive = await redisClient.get('alert_active');
    if (alertActive === 'true') {
        const tstatResponse = await redisClient.get('tstat_response');
        if (tstatResponse === 'false' && clients.tstat) {
            clients.tstat.send(JSON.stringify({ type: 'check_response' }));
        }
    }
}

// Start polling every 5 seconds
setInterval(pollThermostat, 5000);

// Handle messages from embedded device
async function handleEmbeddedMessage(data) {
    const status = data.status;
    const snoozeUntil = parseInt(await redisClient.get('snooze_until'));
    
    if (Date.now() < snoozeUntil) {
        return; // Ignore messages during snooze period
    }

    if (status === 0) { // Not OK
        const currentCount = parseInt(await redisClient.get('consecutive_not_ok')) || 0;
        const newCount = currentCount + 1;
        await redisClient.set('consecutive_not_ok', newCount.toString());

        if (newCount >= 6) {
            await triggerAlert();
        }
    } else { // OK
        await redisClient.set('consecutive_not_ok', '0');
        await redisClient.set('siren_active', 'false');
        await redisClient.set('alert_active', 'false');
        broadcastToAll({ type: 'stop_siren' });
    }
}

// Handle responses from mobile and tstat
async function handleDeviceResponse(deviceType, data) {
    const action = data.action;
    
    switch (action) {
        case 'snooze':
            await redisClient.set('snooze_until', (Date.now() + 30000).toString());
            await redisClient.set('consecutive_not_ok', '0');
            await redisClient.set('alert_active', 'false');
            broadcastToAll({ type: 'alert_handled', action: 'snooze' });
            break;
        case 'dismiss':
            await redisClient.set('consecutive_not_ok', '0');
            await redisClient.set('alert_active', 'false');
            broadcastToAll({ type: 'alert_handled', action: 'dismiss' });
            break;
        case 'escalate':
            await redisClient.set('siren_active', 'true');
            await redisClient.set('alert_active', 'false');
            broadcastToAll({ type: 'alert_handled', action: 'escalate' });
            break;
        case 'response_received':
            await redisClient.set(`${deviceType}_response`, 'true');
            const mobileResponse = await redisClient.get('mobile_response');
            const tstatResponse = await redisClient.get('tstat_response');
            
            if (mobileResponse === 'true' || tstatResponse === 'true') {
                broadcastToAll({ 
                    type: 'response_received',
                    device: deviceType,
                    canTrigger: true
                });
            }
            break;
    }
}

// Trigger alert to all devices
async function triggerAlert() {
    await redisClient.set('alert_active', 'true');
    await redisClient.set('tstat_response', 'false');
    await redisClient.set('mobile_response', 'false');
    
    broadcastToAll({ type: 'alert' });
    
    // Set timeout for no response
    setTimeout(async () => {
        const alertActive = await redisClient.get('alert_active');
        if (alertActive === 'true') {
            await redisClient.set('siren_active', 'true');
            broadcastToAll({ type: 'start_siren' });
        }
    }, 60000);
}

// Broadcast message to all connected clients
function broadcastToAll(message) {
    Object.values(clients).forEach(client => {
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Start HTTP server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 