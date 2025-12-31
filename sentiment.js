// sentiment.js
const Sentiment = require('sentiment');
module.exports.analyzeSentiment = (ticks) => new Sentiment().analyze(ticks.map(t => t.last_digit > 5 ? 'pos' : 'neg').join(' ')).score > 0 ? 'bull' : 'bear';