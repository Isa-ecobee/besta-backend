const axios = require('axios');

async function notifyThermostat() {
    // Replace with your tstat's IP or service URL
    await axios.post('http://<tstat-address>/TriggerStoveNotification', { enabled: 1 });
}

async function pollTstatForDismissal(timeoutMs = 60000, intervalMs = 5000) {
    const tstatUrl = 'http://<tstat-address>/CurrStoveState';
    const maxTries = Math.ceil(timeoutMs / intervalMs);

    for (let i = 0; i < maxTries; i++) {
        const res = await axios.get(tstatUrl);
        const state = res.data;
        if (state.dismissed) {
            // Notify both tstat and mobile that alert was dismissed
            broadcastToDevices({ type: 'response_received', action: 'dismiss' });
            // Optionally: POST to /TriggerStoveNotification to disable
            await axios.post('http://<tstat-address>/TriggerStoveNotification', { enabled: 0 });
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
    await axios.post('http://<tstat-address>/TriggerStoveAlarm', { trigger: 1 });
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