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
    console.log('\n\nConnecting to Redis...');
    await redisClient.connect();
    console.log('Redis connected.');

    await redisClient.set('consecutive_not_ok', '0');
    console.log('Initialized consecutive_not_ok to 0.');

    await redisClient.set('snooze_until', '0');
    console.log('Initialized snooze_until to 0.');

    await redisClient.set('siren_active', 'false');
    console.log('Initialized siren_active to false.');
})();


/**
 * Validate the structure of the data object for embedded clients.
 * @param {Object} data - The data object to validate.
 * @returns {boolean} - Returns true if valid, false otherwise.
 */
function validateEmbeddedData(data) {
    console.log('\n\nValidating embedded data:', data);

    // Check if data is an object
    if (typeof data !== 'object' || data === null) {
        console.log('Invalid data: Not an object.');
        return false;
    }

    // Check if 'status' property exists and is a number (0 or 1)
    if (!('status' in data) || (data.status !== 0 && data.status !== 1)) {
        console.log('Invalid data: Missing or invalid "status" property.');
        return false;
    }

    console.log('Embedded data validation passed.');
    return true;
}

/**
 * Validate the structure of the data object for mobile clients.
 * @param {Object} data - The data object to validate.
 * @returns {boolean} - Returns true if valid, false otherwise.
 */
function validateMobileData(data) {
    console.log('\n\nValidating mobile data:', data);

    // Check if data is an object
    if (typeof data !== 'object' || data === null) {
        console.log('Invalid data: Not an object.');
        return false;
    }

    // Check if 'action' property exists and is a valid string
    const validActions = ['snooze', 'dismiss', 'escalate'];
    if (!('action' in data) || !validActions.includes(data.action)) {
        console.log('Invalid data: Missing or invalid "action" property.');
        return false;
    }

    console.log('Mobile data validation passed.');
    return true;
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    const clientType = req.url.split('=')[1]; // Get client type from URL
    console.log(`Client connected: ${clientType}`);
    clients[clientType] = ws;

    if (clientType === 'embedded') {
        console.log('\n\nEmbedded client connected. Setting up heartbeat mechanism.');
        let heartbeatTimeout;

        const resetHeartbeat = () => {
            clearTimeout(heartbeatTimeout);
            heartbeatTimeout = setTimeout(() => {
                console.log(`Embedded client connection closed due to inactivity.`);
                ws.terminate(); // Close the connection
                clients[clientType] = null; // Remove client from the list
            }, 5000); // Expect a message every 5 seconds
        };

        resetHeartbeat(); // Initialize heartbeat timeout

        ws.on('message', async (message) => {
            console.log(`Message received from ${clientType}: ${message}`);
            const data = JSON.parse(message);

            if (clientType === 'embedded') {
                resetHeartbeat(); // Reset heartbeat on message
                await handleEmbeddedMessage(data);
            } else if (clientType === 'mobile' || clientType === 'tstat') {
                await handleDeviceResponse(clientType, data);
            }
        });

        ws.on('close', () => {
            console.log(`Client disconnected: ${clientType}`);
            clearTimeout(heartbeatTimeout); // Clear heartbeat timeout
            clients[clientType] = null;
        });
    } else {
        console.log(`\n\n${clientType.charAt(0).toUpperCase() + clientType.slice(1)} client connected.`);

        ws.on('message', async (message) => {
            console.log(`Message received from ${clientType}: ${message}`);
            const data = JSON.parse(message);

            if (clientType === 'mobile' || clientType === 'tstat') {
                await handleDeviceResponse(clientType, data);
            }
        });

        ws.on('close', () => {
            console.log(`Client disconnected: ${clientType}`);
            clients[clientType] = null;
        });
    }
});
// Handle messages from embedded device
async function handleEmbeddedMessage(data) {
    console.log('\n\n-------------------------------------------------------------------');
    console.log('Handling embedded message:', data);

    if (!validateEmbeddedData(data)) {
        console.log('Invalid embedded data received. Ignoring message.');
        return; // Exit if data is invalid
    }

    console.log('Handling embedded message:', data);
    
    const status = data.status;
    const snoozeUntil = parseInt(await redisClient.get('snooze_until'));
    
    if (Date.now() < snoozeUntil) {
        console.log('Message ignored during snooze period.');
        return; // Ignore messages during snooze period
    }

    if (status === 0) { // Not OK
        console.log('Status is NOT OK.');
        const currentCount = parseInt(await redisClient.get('consecutive_not_ok')) || 0;
        const newCount = currentCount + 1;
        await redisClient.set('consecutive_not_ok', newCount.toString());
        console.log(`Updated consecutive_not_ok to ${newCount}.`);

        if (newCount >= 6) {
            console.log('Triggering alert due to consecutive NOT OK statuses.');
            await triggerAlert();
        }
    } else { // OK
        console.log('Status is OK.');
        await redisClient.set('consecutive_not_ok', '0');
        await redisClient.set('siren_active', 'false');
        console.log('Reset consecutive_not_ok and siren_active.');
        broadcastToAll({ type: 'stop_siren' });
    }
}

// Handle responses from mobile and tstat
async function handleDeviceResponse(deviceType, data) {
    console.log('\n\n-------------------------------------------------------------------');
    console.log(`Handling device response from ${deviceType}:`, data);

    if (!validateMobileData(data)) {
        console.log('Invalid mobile data received. Ignoring message.');
        return; // Exit if data is invalid
    }

    console.log(`Handling device response from ${deviceType}:`, data);
    const action = data.action;
    
    switch (action) {
        case 'snooze':
            console.log('Action: Snooze');
            await redisClient.set('snooze_until', (Date.now() + 30000).toString());
            await redisClient.set('consecutive_not_ok', '0');
            console.log('Snooze activated for 30 seconds and consecutive_not_ok reset.');
            break;
        case 'dismiss':
            console.log('Action: Dismiss');
            await redisClient.set('consecutive_not_ok', '0');
            console.log('Dismissed alert and reset consecutive_not_ok.');
            break;
        case 'escalate':
            console.log('Action: Escalate');
            await redisClient.set('siren_active', 'true');
            console.log('Siren activated.');
            broadcastToAll({ type: 'start_siren' });
            break;
    }
}

// Trigger alert to all devices
async function triggerAlert() {
    console.log('Triggering alert to all devices.');
    broadcastToAll({ type: 'alert' });
    
    // Set timeout for no response
    setTimeout(async () => {
        console.log('Checking for device responses after timeout...');
        const responses = await redisClient.get('device_responses');
        if (!responses) {
            console.log('No responses received. Activating siren.');
            await redisClient.set('siren_active', 'true');
            broadcastToAll({ type: 'start_siren' });
        }
    }, 60000);
}

// Broadcast message to all connected clients
function broadcastToAll(message) {
    console.log('Broadcasting message to all clients:', message);
    Object.values(clients).forEach(client => {
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
            console.log('Message sent to client.');
        }
    });
}

// Start HTTP server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});