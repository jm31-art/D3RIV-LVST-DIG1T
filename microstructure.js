// microstructure.js
module.exports.analyzeMicrostructure = (ticks) => {
  let up = 0, down = 0;
  for (let i=1; i<ticks.length; i++) ticks[i].price > ticks[i-1].price ? up++ : down++;
  return { pattern: (up - down)/ticks.length > 0.1 ? 'up' : 'down' };
};