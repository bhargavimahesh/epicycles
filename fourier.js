// Return n points spread evenly along the closed loop through `points`
function resample(points, n) {
  if (points.length < 2) return [];
  const loop = [...points, points[0]];             // close the loop: back to the start

  // 1. Length of each piece between dots, and the total length
  const lengths = [];
  let total = 0;
  for (let i = 1; i < loop.length; i++) {
    const [x0, y0] = loop[i - 1];
    const [x1, y1] = loop[i];
    const len = Math.hypot(x1 - x0, y1 - y0);      // distance between the two dots
    lengths.push(len);
    total += len;
  }

  // 2. Walk along the line and drop a new point every `step`
  const step = total / n;
  const result = [];
  let seg = 0;        // which piece we are on
  let walked = 0;     // distance from the start to the beginning of that piece
  for (let i = 0; i < n; i++) {
    const target = i * step;                       // where the i-th mark should go
    while (seg < lengths.length - 1 && walked + lengths[seg] < target) {
      walked += lengths[seg];                      // the mark is beyond this piece: move on
      seg++;
    }
    const f = lengths[seg] === 0 ? 0 : (target - walked) / lengths[seg];   // 0..1 along this piece
    const [x0, y0] = loop[seg];
    const [x1, y1] = loop[seg + 1];
    result.push([x0 + f * (x1 - x0), y0 + f * (y1 - y0)]);
  }
  return result;


}
// Find the circles that draw `points` (a closed loop of evenly spaced [x, y] points).
// For each speed k: unwind the drawing at speed k, then take the average.
function dft(points, maxSpeed) {
  const N = points.length;
  const circles = [];
  for (let k = -maxSpeed; k <= maxSpeed; k++) {
    let sumX = 0, sumY = 0;
    for (let n = 0; n < N; n++) {
      const [x, y] = points[n];
      const a = 2 * Math.PI * k * n / N;      // how far a speed-k circle has turned by point n
      sumX += x * Math.cos(a) + y * Math.sin(a);   // the point, turned backwards by a
      sumY += y * Math.cos(a) - x * Math.sin(a);
    }
    const avgX = sumX / N;                    // the average of all the unwound points
    const avgY = sumY / N;
    circles.push({
      speed: k,
      radius: Math.hypot(avgX, avgY),         // distance from the centre
      start: Math.atan2(avgY, avgX),          // direction, in radians
    });
  }
  return circles;
}
// Where each circle's centre and the pen are at a moment of the lap (lapPos from 0 to 1).
// Start angles in radians. Returns [centre of circle 1, centre of circle 2, ..., pen].
function chainAt(circles, lapPos) {
  const result = [[0, 0]];
  let x = 0, y = 0;
  for (const c of circles) {
    const angle = c.start + 2 * Math.PI * c.speed * lapPos;
    x += c.radius * Math.cos(angle);
    y += c.radius * Math.sin(angle);
    result.push([x, y]);
  }
  return result;
}
