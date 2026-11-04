const sdk = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32';
const models = 'https://storage.googleapis.com/mediapipe-models';

export async function loadVision() {
  const tasks = await import(`${sdk}/vision_bundle.mjs`);
  const vision = await tasks.FilesetResolver.forVisionTasks(`${sdk}/wasm`);
  return { tasks, vision };
}

export async function createVideoLandmarker(Task, vision, modelAssetPath, settings) {
  const options = { ...settings, runningMode: 'VIDEO', baseOptions: { modelAssetPath, delegate: 'GPU' } };
  try {
    return await Task.createFromOptions(vision, options);
  } catch {
    options.baseOptions.delegate = 'CPU';
    return Task.createFromOptions(vision, options);
  }
}

export function createGuideLandmarks(faceCount, poseCount, status) {
  const face = {
    count: faceCount, name: 'Face', color: '#6ceaff', radius: 1.25,
    task: 'FaceLandmarker', result: 'faceLandmarks',
    model: 'face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    options: { numFaces: 1 },
    connections: Task => [
      Task.FACE_LANDMARKS_TESSELATION,
      [...Task.FACE_LANDMARKS_CONTOURS, ...Task.FACE_LANDMARKS_LEFT_IRIS, ...Task.FACE_LANDMARKS_RIGHT_IRIS],
    ],
  };
  const pose = {
    count: poseCount, name: 'Pose', color: '#ffce67', radius: 4,
    task: 'PoseLandmarker', result: 'landmarks',
    model: 'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    options: { numPoses: 1, outputSegmentationMasks: false },
    connections: Task => [Task.POSE_CONNECTIONS],
  };
  const layers = [pose, face];
  let nextLayer = 0;
  let nextInference = 0;
  let visionLoad;

  function updateStatus() {
    const message = layers.some(layer => layer.loading)
      ? 'Loading face and pose models…'
      : layers.some(layer => layer.failed)
        ? 'A face or pose model is unavailable. Restart the camera to retry.'
        : '';
    if (status.dataset.message !== message) {
      status.dataset.message = message;
      status.textContent = message;
      status.hidden = !message;
    }
  }

  async function load(layer) {
    layer.loading = true;
    updateStatus();
    try {
      const { tasks, vision } = await visionLoad;
      const Task = tasks[layer.task];
      layer.edges = layer.connections(Task);
      layer.detector = await createVideoLandmarker(Task, vision, `${models}/${layer.model}`, layer.options);
    } catch (error) {
      layer.failed = true;
      console.warn(`MediaPipe ${layer.name} model failed to load`, error);
    } finally {
      layer.loading = false;
      updateStatus();
    }
  }

  function setPoints(layer, points) {
    layer.points = points;
    const count = points.filter(Boolean).length;
    if (layer.count.dataset.count !== String(count)) {
      layer.count.dataset.count = String(count);
      layer.count.textContent = `${layer.name} points: ${count}`;
    }
  }

  function update(video, now) {
    const missing = layers.filter(layer => !layer.detector && !layer.loading && !layer.failed);
    if (missing.length) {
      visionLoad ??= loadVision().catch(error => { visionLoad = undefined; throw error; });
      missing.forEach(load);
    }
    if (now < nextInference) return;
    const layer = layers[nextLayer];
    nextLayer = (nextLayer + 1) % layers.length;
    if (!layer.detector) return;
    // Alternate extra models so a single frame runs at most one of them.
    nextInference = now + 40;
    try {
      const points = layer.detector.detectForVideo(video, now)[layer.result][0] ?? [];
      setPoints(layer, points.map(point => (
        point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 &&
        (layer !== pose || (point.visibility ?? 1) >= .5)
      ) ? point : null));
    } catch (error) {
      console.warn(`MediaPipe ${layer.name} tracking failed`, error);
      const detector = layer.detector;
      layer.detector = undefined;
      layer.failed = true;
      setPoints(layer, []);
      updateStatus();
      try { detector.close(); } catch (closeError) { console.warn(closeError); }
    }
  }

  function draw(context, width, height) {
    context.save();
    for (const layer of layers) {
      if (!layer.points?.length) continue;
      context.strokeStyle = context.fillStyle = layer.color;
      for (const [index, connections] of layer.edges.entries()) {
        context.lineWidth = layer === pose ? 3 : index ? 1.5 : .65;
        context.globalAlpha = layer === pose || index ? .9 : .55;
        context.beginPath();
        for (const { start, end } of connections) {
          const a = layer.points[start], b = layer.points[end];
          if (!a || !b) continue;
          context.moveTo(a.x * width, a.y * height);
          context.lineTo(b.x * width, b.y * height);
        }
        context.stroke();
      }
      context.globalAlpha = .95;
      context.beginPath();
      for (const point of layer.points) {
        if (!point) continue;
        const x = point.x * width, y = point.y * height;
        context.moveTo(x + layer.radius, y);
        context.arc(x, y, layer.radius, 0, Math.PI * 2);
      }
      context.fill();
    }
    context.restore();
  }

  function clear(retry = false) {
    for (const layer of layers) {
      setPoints(layer, []);
      if (retry) layer.failed = false;
    }
    updateStatus();
  }

  return { update, draw, clear };
}
