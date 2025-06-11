const axios = require('axios');

// Add at the top of the file
let sirenActive = false;
let sirenWaitingForSensor = false;



async function broadcastToDevices(message) {
    console.log('📢 Broadcasting message:', message);
    
    switch (message.type) {
        case 'start_siren':
            sirenActive = true;
            sirenWaitingForSensor = true;
            console.log('🚨 Siren activated, waiting for sensor ON signal');
            break;
            
        case 'response_received':
            if (message.action === 'dismiss') {
                sirenActive = false;
                sirenWaitingForSensor = false;
                console.log('✅ Alert dismissed, resetting siren state');
            }
            break;
            
        case 'alert':
            console.log('⚠️ Alert broadcast to all devices');
            break;
    }
}

async function stopTstatAlarm() {
    try {
        console.log('🔕 Stopping thermostat alarm...');
        await axios.post('http://10.90.37.115:8005/TriggerStoveAlarm', { trigger: 0 });
        console.log('✅ Thermostat alarm stopped');
    } catch (error) {
        console.error('❌ Error stopping thermostat alarm:', error.message);
        throw error;
    }
}


// Update the checkSensorForSiren function
// STOP MOBILE ALARM HERE 
async function checkSensorForSiren(isOn) {
    if (sirenWaitingForSensor && isOn) {
        console.log('🔔 Sensor ON detected while siren active - stopping siren');
        sirenActive = false;
        sirenWaitingForSensor = false;
        await stopTstatAlarm(); // Call the new function
        return true;
    }

    return false;
}


async function notifyThermostat() {
    // Replace with your tstat's IP or service URL
    console.log('📬 Notifying thermostat to trigger alert...');
    await axios.post('http://10.90.37.115:8005/triggerstovenotification', { enabled: 1 });
}

async function pollTstatForDismissal(timeoutMs = 6000, intervalMs = 5000) {
    const tstatUrl = 'http://10.90.37.115:8005/CurrStoveState';
    const maxTries = Math.ceil(timeoutMs / intervalMs);

    for (let i = 0; i < maxTries; i++) {
        const res = await axios.get(tstatUrl);
        const state = res.data;
        if (state.dismissed) {
            // Notify both tstat and mobile that alert was dismissed
            broadcastToDevices({ type: 'response_received', action: 'dismiss' });
            
            // POST to /TriggerStoveNotification to disable
            await axios.post('http://10.90.37.115:8005/triggerstovenotification', { enabled: 0 });
            return 'dismissed';
        }
        if (state.alarm) {
            broadcastToDevices({ type: 'response_received', action: 'trigger' });
            return 'alarm';
        }
        await new Promise(r => setTimeout(r, intervalMs));
    }
    // Timed out – escalate!
    return 'timeout';
}

async function triggerTstatAlarm() {
    await axios.post('http://10.90.37.115:8005/TriggerStoveAlarm', { trigger: 1 });
    broadcastToDevices({ type: 'start_siren' });
}

async function alertFlow() {
    await notifyThermostat();
    // Also notify mobile here!
    broadcastToDevices({ type: 'alert' });

    const result = await pollTstatForDismissal();

    if (result === 'timeout') {
        await triggerTstatAlarm();
    }
}

// Add exports
module.exports = {
    notifyThermostat,
    pollTstatForDismissal,
    triggerTstatAlarm,
    alertFlow,
    broadcastToDevices,
    stopTstatAlarm,
    checkSensorForSiren
};