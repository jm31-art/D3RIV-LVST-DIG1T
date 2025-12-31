// strategies.js
const sentiment = require('./sentiment');
const microstructure = require('./microstructure');

function proposeContract(ws, type, symbol, amount, duration, barrier=null) {
  let payload = { proposal: 1, amount, basis: 'stake', currency: 'USD', duration, duration_unit: 't', symbol };
  if (type === 'rise') payload.contract_type = 'CALL';
  if (type === 'fall') payload.contract_type = 'PUT';
  if (type === 'even') payload.contract_type = 'DIGITEVEN';
  if (type === 'odd') payload.contract_type = 'DIGITODD';
  if (type === 'over') { payload.contract_type = 'DIGITOVER'; payload.barrier = barrier; }
  ws.send(JSON.stringify(payload));
}

function getEnsemblePrediction(ticks, ml, markov) {
  try {
    let sent = sentiment.analyzeSentiment(ticks) === 'bull' ? 1 : 0;
    let micro = microstructure.analyzeMicrostructure(ticks).pattern === 'up' ? 1 : 0;
    return 0.4 * ml + 0.3 * markov + 0.15 * sent + 0.15 * micro;
  } catch (e) {
    console.error('Strat error:', e);
    return 0.5; // default
  }
}

function calculateVol(ticks) {
  const prices = ticks.map(t => t.price);
  const mean = prices.reduce((a, b) => a + b) / prices.length;
  return Math.sqrt(prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length);
}

module.exports = { proposeContract, getEnsemblePrediction, calculateVol };