// logs.js
function simulateLiveCosts(trade) {
  if (trade.profit) trade.profit -= trade.stake * 0.005;  // 0.5% spread
  return trade;
}

module.exports = { simulateLiveCosts };