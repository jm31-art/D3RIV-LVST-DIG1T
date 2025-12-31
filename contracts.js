// contracts.js
function proposeTouch(ws, symbol, amount, duration, barrier) {
  let payload = { proposal: 1, amount, basis: 'stake', contract_type: 'TOUCH', currency: 'USD', duration, duration_unit: 't', symbol, barrier };
  ws.send(JSON.stringify(payload));
}

module.exports = { proposeTouch };