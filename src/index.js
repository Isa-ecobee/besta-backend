require('dotenv').config();
const { exec } = require('child_process');

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Configuration
const THRESHOLD = 5; // Number of consecutive readings before triggering
let consecutiveReadings = [];
let currentState = null;

// Mock functions for broadcasting events
const { sendPushNotification } = require('./pushNotifier'); // add this at top

function sendToMobile(isOn, count) {
  console.log(`📱 Mobile notification: Sensor ${isOn ? 'ON' : 'OFF'} for ${count} consecutive readings`);

  // Only send push if ON and threshold is hit
  if (isOn && count >= THRESHOLD) {
    const token = process.env.FIREBASE_TOKEN || 'your-default-token-here';
    sendPushNotification(token);
  }
}

function sendToThermostat(isOn, count) {
  console.log(`🌡️ Thermostat update: Sensor ${isOn ? 'ON' : 'OFF'} for ${count} consecutive readings`);
  // Mock implementation - in real app, this would adjust thermostat settings
}

// Sensor polling endpoint
app.get('/sensorPolling', (req, res) => {
  const { isOn } = req.query;
  
  // Validate input
  if (isOn === undefined) {
    return res.status(400).json({ 
      error: 'Missing required parameter: isOn' 
    });
  }
  
  // Convert string to boolean
  const sensorState = isOn === 'true';
  
  console.log(`📊 Received sensor reading: ${sensorState ? 'ON' : 'OFF'}`);
  
  // Check if this is the same as the current consecutive state
  if (currentState === sensorState) {
    // Same state, increment consecutive count
    consecutiveReadings.push(sensorState);
  } else {
    // State changed, reset consecutive readings
    consecutiveReadings = [sensorState];
    currentState = sensorState;
  }
  
  console.log(`📈 Consecutive ${sensorState ? 'ON' : 'OFF'} readings: ${consecutiveReadings.length}`);
  
  // Check if we've hit the threshold
  if (consecutiveReadings.length >= THRESHOLD) {
    console.log(`🚨 THRESHOLD REACHED! ${consecutiveReadings.length} consecutive ${sensorState ? 'ON' : 'OFF'} readings`);
    
    // Broadcast to consumers
    sendToMobile(sensorState, consecutiveReadings.length);
    sendToThermostat(sensorState, consecutiveReadings.length);
    
    // Reset after broadcasting (optional - depending on your use case)
    // consecutiveReadings = [];
  }
  
  // Return current status
  res.json({
    success: true,
    currentState: sensorState,
    consecutiveCount: consecutiveReadings.length,
    threshold: THRESHOLD,
    thresholdReached: consecutiveReadings.length >= THRESHOLD
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    currentState,
    consecutiveCount: consecutiveReadings.length
  });
});

// Reset endpoint (useful for testing)
app.post('/reset', (req, res) => {
  consecutiveReadings = [];
  currentState = null;
  console.log('🔄 State reset');
  res.json({ success: true, message: 'State reset successfully' });
});

// Validate the token at startup
exec('GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/home-prod-324a8e2ecbb8.json go run cmd/notification_helper/main.go validate -token <your-token> -project eco-release');

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Sensor polling server running on port ${PORT}`);
  console.log(`📊 Threshold set to ${THRESHOLD} consecutive readings`);
  console.log('\nTest endpoints:');
  console.log(`- GET /sensorPolling?isOn=true`);
  console.log(`- GET /sensorPolling?isOn=false`);
  console.log(`- GET /health`);
  console.log(`- POST /reset`);
});

module.exports = app;
