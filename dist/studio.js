export function createDrawingStudio() {
  const studio = document.querySelector('#studio');
  const canvas = studio.querySelector('canvas');
  const ink = canvas.getContext('2d');
  const air = studio.querySelector('#studio-air');
  const undo = studio.querySelector('#studio-undo');
  const redo = studio.querySelector('#studio-redo');
  const clear = studio.querySelector('#studio-clear');
  const save = studio.querySelector('#studio-export');
  const customColor = studio.querySelector('#studio-color');
  const history = [];
  let index = 0;
  let tool = 'pen';
  let color = customColor.value;
  let size = 7;
  let cameraReady = false;
  let airEnabled = false;
  let active = null;

  function updateControls() {
    const hasDrawing = index > 0 && history[index - 1] !== null;
    undo.disabled = index === 0;
    redo.disabled = index === history.length;
    clear.disabled = save.disabled = !hasDrawing;
    for (const button of studio.querySelectorAll('[data-studio-tool], [data-studio-color], [data-studio-size]')) {
      const selected = button.dataset.studioTool === tool ||
        button.dataset.studioColor === color || Number(button.dataset.studioSize) === size;
      button.setAttribute('aria-pressed', String(selected));
    }
    air.setAttribute('aria-pressed', String(airEnabled));
    air.disabled = !cameraReady;
    air.textContent = airEnabled ? 'Pause air ink' : 'Resume air ink';
    canvas.classList.toggle('air-ink', airEnabled);
  }

  function paint(stroke, from, to) {
    ink.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ink.globalAlpha = stroke.tool === 'pencil' ? .48 : 1;
    ink.lineWidth = stroke.width;
    ink.lineCap = 'round';
    ink.fillStyle = ink.strokeStyle = stroke.color;
    ink.beginPath();
    if (from.x === to.x && from.y === to.y) {
      ink.arc(to.x, to.y, stroke.width / 2, 0, Math.PI * 2);
      ink.fill();
    } else {
      ink.moveTo(from.x, from.y);
      ink.lineTo(to.x, to.y);
      ink.stroke();
    }
  }

  function redraw() {
    ink.clearRect(0, 0, canvas.width, canvas.height);
    const start = history.lastIndexOf(null, index - 1) + 1;
    for (let i = start; i < index; i++) {
      const stroke = history[i];
      stroke.points.forEach((point, j) => paint(stroke, stroke.points[j - 1] ?? point, point));
    }
    updateControls();
  }

  function commit(stroke) {
    history.splice(index, history.length - index, stroke);
    index++;
    updateControls();
  }

  function drawAt(source, x, y) {
    if (active && active.source !== source) return;
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: (x - rect.left) * canvas.width / rect.width,
      y: (y - rect.top) * canvas.height / rect.height,
    };
    if (!active) {
      const width = size * (tool === 'eraser' ? 3 : tool === 'pencil' ? .55 : 1);
      active = { source, tool, width, color, points: [point] };
      commit(active);
      paint(active, point, point);
      return;
    }
    const previous = active.points.at(-1);
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < .7) return;
    active.points.push(point);
    paint(active, previous, point);
  }

  function end(source) {
    if (active?.source === source) active = null;
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    end('air');
    if (active) return;
    canvas.setPointerCapture(event.pointerId);
    drawAt(event.pointerId, event.clientX, event.clientY);
  });
  canvas.addEventListener('pointermove', event => {
    if (active?.source === event.pointerId) drawAt(event.pointerId, event.clientX, event.clientY);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => end(event.pointerId));
  }

  studio.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    active = null;
    if (button.dataset.studioTool) tool = button.dataset.studioTool;
    if (button.dataset.studioSize) size = Number(button.dataset.studioSize);
    if (button.dataset.studioColor) color = customColor.value = button.dataset.studioColor;
    if (button === air) airEnabled = !airEnabled;
    if (button === undo && index > 0) { index--; redraw(); }
    if (button === redo && index < history.length) { index++; redraw(); }
    if (button === clear) { commit(null); redraw(); }
    if (button === save) {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const output = exportCanvas.getContext('2d');
      output.fillStyle = '#fff';
      output.fillRect(0, 0, canvas.width, canvas.height);
      output.drawImage(canvas, 0, 0);
      const link = document.createElement('a');
      link.download = 'airnav-drawing.png';
      link.href = exportCanvas.toDataURL('image/png');
      link.click();
    }
    updateControls();
  });
  customColor.addEventListener('input', () => {
    active = null;
    color = customColor.value;
    updateControls();
  });

  updateControls();
  return {
    setCameraReady(ready) {
      if (cameraReady === ready) return;
      cameraReady = ready;
      airEnabled = ready;
      end('air');
      updateControls();
    },
    moveAir(element, x, y) {
      if (airEnabled && element === canvas) drawAt('air', x, y);
      else end('air');
    },
    endAir() { end('air'); },
  };
}
