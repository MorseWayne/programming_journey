// Discrete model: arrivals are admitted first, then service runs within each tick.
export function simulateQueue(arrivals, service, capacity, ticks = 12) {
  for (const n of [arrivals, service, capacity, ticks]) {
    if (!Number.isInteger(n) || n < 0 || n > 10000) throw new RangeError("invalid model input");
  }
  let queued = 0, totalRejected = 0, totalServed = 0;
  const rows = [];
  for (let tick = 1; tick <= ticks; tick++) {
    const accepted = Math.min(arrivals, capacity - queued);
    const rejected = arrivals - accepted;
    const served = Math.min(service, queued + accepted);
    queued += accepted - served;
    totalRejected += rejected;
    totalServed += served;
    rows.push({ tick, accepted, rejected, served, queued });
  }
  return { rows, queued, totalRejected, totalServed };
}
