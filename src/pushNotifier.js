const { exec } = require('child_process');

function sendPushNotification(token) {
  const command = `GOOGLE_APPLICATION_CREDENTIALS=/secrets/firebase-creds.json go run /app/push/cmd/notification_helper/main.go send -type armReminder -token ${token} -project eco-release`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Error sending notification: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`⚠️ Stderr: ${stderr}`);
    }
    console.log(`✅ Push Notification Sent:\n${stdout}`);
  });
}

module.exports = { sendPushNotification };
