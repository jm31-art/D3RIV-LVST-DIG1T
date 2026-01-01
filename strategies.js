// strategies.js
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

function getEnsemblePrediction(ticks, mlPred, markovPred) {
  try {
    // Updated ensemble prediction – sentiment component fully removed
    // Weights rebalanced: higher emphasis on ML and microstructure for better signal
    const mlWeight = 0.45;
    const markovWeight = 0.35;
    const microstructureWeight = 0.20;

    let microstructureScore = microstructure.analyzeMicrostructure(ticks).pattern === 'up' ? 1 : 0;

    let ensemblePred =
      (mlPred * mlWeight) +
      (markovPred * markovWeight) +
      (microstructureScore * microstructureWeight);

    // Optional: Add small TA boost if using RSI/MA filters
    const shortMA = calculateMA(ticks, 6);
    const longMA = calculateMA(ticks, 21);
    const rsi = calculateRSI(ticks);
    if (shortMA > longMA && rsi < 70) {
      ensemblePred += 0.05;  // Slight confidence boost on trend alignment
    }

    return ensemblePred;
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