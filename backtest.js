// backtest.js
function trainModels(data) {
  // Placeholder: Train ML, Markov, etc. on data
  console.log('Training models on', data.length, 'ticks');
}

function testModels(data) {
  // Placeholder: Test models on data, return metrics
  console.log('Testing models on', data.length, 'ticks');
  return { winRate: 0.55, profit: 100 }; // example
}

function walkForward(data) {
  const split = Math.floor(data.length * 0.7);
  trainModels(data.slice(0, split));
  return testModels(data.slice(split));
}

module.exports = { walkForward };