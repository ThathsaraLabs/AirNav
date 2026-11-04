const tips = [4, 8, 12, 16, 20];
const palm = [0, 5, 9, 13, 17];
const colors = ['#ff4fe1', '#50faff', '#72ff4d', '#ffe94d', '#ff9f30'];

export function drawNeonHands(ctx, hands, width, height) {
  ctx.save();
  ctx.lineCap = 'round';
  const line = (a, b, color, weight) => {
    ctx.strokeStyle = ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.lineWidth = weight;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  };
  if (hands.length === 2) {
    for (const [i, from] of tips.entries()) {
      for (const [j, to] of tips.entries()) {
        line(hands[0][from], hands[1][to], colors[(i + j) % colors.length], 2);
      }
    }
  }
  for (const hand of hands) {
    for (const [i, from] of tips.entries()) {
      for (let j = i + 1; j < tips.length; j++) {
        line(hand[from], hand[tips[j]], colors[(i + j) % colors.length], 1.4);
      }
    }
    for (const [i, from] of palm.entries()) {
      line(hand[from], hand[palm[(i + 1) % palm.length]], '#ffe05a', 1.5);
    }
    for (const [i, index] of tips.entries()) {
      ctx.fillStyle = ctx.shadowColor = colors[i];
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(hand[index].x * width, hand[index].y * height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
