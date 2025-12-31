// config.js
const cron = require('node-cron');

module.exports = {
  confThreshold: 0.7,
  maxTradesDay: 200,
  riskPerTrade: 0.02,
  retrainModels: () => console.log('Retraining models...') // placeholder
};

// Schedule daily retrain
cron.schedule('0 0 * * *', module.exports.retrainModels);