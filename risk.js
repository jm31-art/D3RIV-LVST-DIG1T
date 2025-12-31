// risk.js
let progression = [1, 3, 2, 6], step = 0;
let balance = 1000; // initial, update from ws
let dailyLoss = 0, drawdownLimit = balance * 0.05;

module.exports.getStake = (base, win, profit) => {
  if (!win) { step = 0; dailyLoss += -profit; }
  if (dailyLoss > drawdownLimit) { console.log('Drawdown hit: Pausing'); return 0; }  // Pause trades
  let mult = progression[step % 4]; step++;
  return Math.min(base * mult, balance * 0.01);  // 1% floor, 2% cap
};

module.exports.updateBalance = (newBalance) => {
  balance = newBalance;
  drawdownLimit = balance * 0.05;
};

// Reset dailyLoss via cron at midnight
require('node-cron').schedule('0 0 * * *', () => dailyLoss = 0);