// features.js
let tickSpeed = 1; // default

function updateTickSpeed(msg) {
  if (msg.msg_type === 'website_status') {
    tickSpeed = msg.website_status.tick_rate || 1;  // Proxy for vol
  }
}

function getTickSpeed() {
  return tickSpeed;
}

module.exports = { updateTickSpeed, getTickSpeed };