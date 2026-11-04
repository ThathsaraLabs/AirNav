import { isIndexPointing, mapPointer, DwellController } from './gestures.js';
import { createDrawingStudio } from './studio.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const video = $('#webcam');
const canvas = $('#landmarks');
const context = canvas.getContext('2d');
const cursor = $('#gesture-cursor');
const ring = $('#dwell-ring');
const dwell = new DwellController();
const drawingStudio = createDrawingStudio();
const cameraMessage = $('#camera-message');
const cameraMessageHome = document.createComment('Camera status position');
cameraMessage.before(cameraMessageHome);
let handLandmarker, stream, running = false, loading = false, animation;
let smooth = .3, pointer = null, lastVideoTime = -1, lastInference = 0;
let cameraStarted = 0, totalCameraTime = 0, gestureClicks = 0, frames = 0, fpsTime = 0;
let cameraGeneration = 0, lastTrackingMessage = '', hoverTarget = null, toastTimeout;
let practiceHits = 0;
const hitTargets = new Set();
const links = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const pages = { overview: 'Overview', playground: 'Playground', studio: 'Drawing Studio', gallery: 'Gallery', guide: 'How it works' };
const artworks = [
  { title: 'A softer kind of bold', type: 'shapes', className: 'art-one', description: 'Warm terracotta and soft sand. A study in simple forms sharing the same space.' },
  { title: 'Somewhere slower', type: 'landscapes', className: 'art-two', description: 'Rolling green hills beneath a pale sun. A reminder to take your time.' },
  { title: 'Perfectly imperfect', type: 'shapes', className: 'art-three', description: 'A lavender circle, interrupted. Finding a little harmony in the unexpected.' },
  { title: 'The long way home', type: 'landscapes', className: 'art-four', description: 'The last light across a quiet desert. Layers of earth, warmth, and open space.' },
  { title: 'An open invitation', type: 'shapes', className: 'art-five', description: 'An arch within an arch. There is always another way through.' },
  { title: 'Where the water goes', type: 'landscapes', className: 'art-six', description: 'A cool blue coast and a quiet shoreline. Let your eyes wander.' }
];
let currentArt = 0;

try {
  const saved = JSON.parse(localStorage.getItem('airnav-preferences') || '{}');
  if (Number.isFinite(saved.dwell)) dwell.duration = Math.min(2000, Math.max(600, saved.dwell));
  if (Number.isFinite(saved.smooth)) smooth = Math.min(.5, Math.max(.1, saved.smooth));
} catch { /* Local storage is optional in restricted browsers. */ }

function route() {
  const requested = location.hash.slice(1);
  const page = Object.hasOwn(pages, requested) ? requested : 'overview';
  $('.workspace').classList.toggle('workspace-studio', page === 'studio');
  drawingStudio.setCameraReady(page === 'studio' && running);
  if (page === 'studio') $('#studio-camera-status').append(cameraMessage);
  else cameraMessageHome.after(cameraMessage);
  $$('.page').forEach(section => { section.hidden = section.id !== page; });
  $$('.nav-link').forEach(link => {
    const active = link.dataset.page === page;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  $('#page-label').textContent = pages[page];
  document.title = `${pages[page]} · AirNav`;
  resetPointer();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
window.addEventListener('hashchange', () => { route(); addActivity(`${pages[location.hash.slice(1)] || 'Overview'} opened`, 'Page navigation'); });
route();

function toast(message) {
  clearTimeout(toastTimeout);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 3000);
}

function addActivity(message, detail) {
  const item = document.createElement('li');
  const icon = document.createElement('span'); icon.className = 'activity-icon'; icon.textContent = '↗';
  const text = document.createElement('div'); text.append(message);
  const small = document.createElement('small'); small.textContent = detail;
  text.append(small); item.append(icon, text);
  $('#activity-list').prepend(item);
  while ($('#activity-list').children.length > 3) $('#activity-list').lastElementChild.remove();
}

function renderGallery(filter = 'all') {
  $('#gallery-grid').replaceChildren();
  artworks.forEach((art, index) => {
    if (filter !== 'all' && art.type !== filter) return;
    const card = document.createElement('button');
    card.className = 'gallery-card'; card.dataset.art = index;
    card.innerHTML = `<div class="art ${art.className}" aria-hidden="true"><span></span></div><h3>${art.title} <span>↗</span></h3><p>${art.type.toUpperCase()} / 0${index + 1}</p>`;
    $('#gallery-grid').append(card);
  });
}
renderGallery();

function openArt(index) {
  currentArt = (index + artworks.length) % artworks.length;
  const art = artworks[currentArt];
  $('#art-preview').innerHTML = `<div class="art ${art.className}" aria-hidden="true"><span></span></div>`;
  $('#art-title').textContent = art.title;
  $('#art-description').textContent = art.description;
  if (!$('#art-dialog').open) $('#art-dialog').showModal();
  $('#art-dialog').append(cursor);
  resetPointer();
}

function updateSettings() {
  $('#dwell').value = dwell.duration;
  $('#smoothing').value = Math.round(smooth * 100);
  $('#dwell-value').textContent = `${(dwell.duration / 1000).toFixed(1)} seconds`;
  $('#smoothing-value').textContent = smooth <= .2 ? 'Extra smooth' : smooth >= .4 ? 'Responsive' : 'Balanced';
  try { localStorage.setItem('airnav-preferences', JSON.stringify({ dwell: dwell.duration, smooth })); } catch { /* optional */ }
  resetPointer();
}
updateSettings();
$('#dwell').addEventListener('input', event => { dwell.duration = Number(event.target.value); updateSettings(); });
$('#smoothing').addEventListener('input', event => { smooth = Number(event.target.value) / 100; updateSettings(); });
$$('dialog').forEach(dialog => dialog.addEventListener('close', () => { document.body.append(cursor); resetPointer(); }));

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'start') { if (running) stopCamera(); else startCamera(); }
  if (action === 'settings') { $('#preferences').showModal(); $('#preferences').append(cursor); resetPointer(); }
  if (action === 'close-settings') $('#preferences').close();
  if (action === 'close-art') $('#art-dialog').close();
  if (action === 'next-art') openArt(currentArt + 1);
  if (action === 'previous-art') openArt(currentArt - 1);
  if (action === 'dwell-less' || action === 'dwell-more') { dwell.duration = Math.min(2000, Math.max(600, dwell.duration + (action === 'dwell-more' ? 100 : -100))); updateSettings(); }
  if (action === 'smooth-less' || action === 'smooth-more') { smooth = Math.min(.5, Math.max(.1, Math.round((smooth + (action === 'smooth-more' ? .05 : -.05)) * 100) / 100)); updateSettings(); }
  if (action === 'scroll-up' || action === 'scroll-down') window.scrollBy({ top: (action === 'scroll-up' ? -1 : 1) * innerHeight * .65, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  if (button.dataset.filter) {
    $$('.filter').forEach(filter => { const active = filter === button; filter.classList.toggle('active', active); filter.setAttribute('aria-pressed', active); });
    renderGallery(button.dataset.filter);
  }
  if (button.dataset.art !== undefined) openArt(Number(button.dataset.art));
  if (button.dataset.target) {
    practiceHits++; hitTargets.add(button.dataset.target); button.classList.add('completed');
    $('#hit-count').textContent = practiceHits;
    $('#unique-count').textContent = `${hitTargets.size} / 4`;
    $('#practice-title').textContent = hitTargets.size === 4 ? 'All four! You have the hang of it.' : 'Nice move. Keep exploring.';
    toast(hitTargets.size === 4 ? 'All four targets activated. Take your hand for a spin!' : 'A little movement. A successful click.');
  }
  if (action === 'reset-practice') {
    practiceHits = 0; hitTargets.clear(); $('#hit-count').textContent = '0'; $('#unique-count').textContent = '0 / 4';
    $$('.practice-target').forEach(target => target.classList.remove('completed'));
    $('#practice-title').textContent = 'Your first touch-free click is waiting.';
  }
});

function setTracking(message, active = false) {
  if (message === lastTrackingMessage) return;
  lastTrackingMessage = message;
  const status = $('#tracking-status');
  status.replaceChildren(); const dot = document.createElement('span');
  dot.style.background = active ? '#779b56' : '#b1b7a3';
  status.append(dot, message);
}

function resetPointer() {
  drawingStudio.endAir();
  dwell.reset(); pointer = null; cursor.hidden = true;
  if (hoverTarget) hoverTarget.classList.remove('gesture-hover');
  hoverTarget = null; ring.style.strokeDashoffset = 125.664;
}

async function createTracker() {
  const { FilesetResolver, HandLandmarker } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/vision_bundle.mjs');
  const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm');
  const options = { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .6 };
  try { return await HandLandmarker.createFromOptions(vision, options); }
  catch { options.baseOptions.delegate = 'CPU'; return await HandLandmarker.createFromOptions(vision, options); }
}

async function startCamera() {
  if (loading || running) return;
  loading = true;
  const generation = ++cameraGeneration;
  const buttons = $$('[data-action="start"]');
  buttons.forEach(button => { button.disabled = true; });
  $('#camera-button span').textContent = 'Getting ready…';
  const message = $('#camera-message'); message.classList.remove('error');
  message.textContent = 'Allow camera access. The tracking model may take a moment to load.';
  let acquiredStream;
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Open this demo on HTTPS or localhost to enable your webcam.');
    // Request access directly from the user's start action. No microphone is needed.
    acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } } });
    if (generation !== cameraGeneration) { acquiredStream.getTracks().forEach(track => track.stop()); return; }
    stream = acquiredStream;
    video.srcObject = stream;
    await video.play();
    if (!handLandmarker) handLandmarker = await createTracker();
    if (generation !== cameraGeneration) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    running = true; cameraStarted = performance.now(); fpsTime = cameraStarted; frames = 0; lastVideoTime = -1;
    drawingStudio.setCameraReady(!$('#studio').hidden);
    $('#camera-placeholder').hidden = true;
    $('#camera-badge').classList.add('live'); $('#camera-badge').innerHTML = '<span></span> Live';
    $('#camera-button').classList.add('running');
    $('#camera-button span').textContent = 'Stop camera';
    $$('[data-action="start"]:not(#camera-button)').forEach(button => { button.innerHTML = 'Stop camera <svg><use href="#i-camera"/></svg>'; });
    message.textContent = 'Camera is live. Raise only your index finger to begin.';
    setTracking('Looking for your hand');
    addActivity('Camera connected', 'Hand tracking is ready');
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (running) { stopCamera(); message.textContent = 'Camera disconnected. Reconnect it and enable the camera again.'; } });
    animation = requestAnimationFrame(trackFrame);
  } catch (error) {
    acquiredStream?.getTracks().forEach(track => track.stop());
    stream = null; video.srcObject = null;
    $('#camera-button span').textContent = 'Try camera again';
    const errors = { NotAllowedError: 'Camera access was denied. Allow camera access in your browser, then try again.', NotFoundError: 'No camera found. Connect a webcam and try again.', NotReadableError: 'Camera is busy or unavailable. Close other camera apps and try again.' };
    message.textContent = errors[error.name] || error.message || 'Tracking could not start. Check your internet connection and try again.';
    message.classList.add('error');
    setTracking('Camera unavailable');
    addActivity('Camera could not start', 'Check the message above');
  } finally { loading = false; buttons.forEach(button => { button.disabled = false; }); }
}

function stopCamera() {
  cameraGeneration++;
  if (running) totalCameraTime += performance.now() - cameraStarted;
  running = false; cancelAnimationFrame(animation);
  drawingStudio.setCameraReady(false);
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  video.srcObject = null; context.clearRect(0, 0, canvas.width, canvas.height);
  resetPointer();
  $('#camera-placeholder').hidden = false;
  $('#camera-badge').classList.remove('live'); $('#camera-badge').innerHTML = '<span></span> Offline';
  $('#camera-button').classList.remove('running'); $('#camera-button span').textContent = 'Enable camera';
  $$('[data-action="start"]:not(#camera-button)').forEach(button => { button.innerHTML = 'Enable camera <svg><use href="#i-camera"/></svg>'; });
  $('#fps-label').textContent = '— FPS';
  $('#camera-message').textContent = 'Camera stopped. Enable it whenever you are ready.';
  setTracking('Camera is off'); addActivity('Camera stopped', 'Webcam access released');
}

function drawHand(points) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!points) return;
  context.lineWidth = 2; context.strokeStyle = '#dce7b9cc';
  for (const [a, b] of links) { context.beginPath(); context.moveTo(points[a].x * canvas.width, points[a].y * canvas.height); context.lineTo(points[b].x * canvas.width, points[b].y * canvas.height); context.stroke(); }
  points.forEach((point, index) => { context.beginPath(); context.fillStyle = index === 8 ? '#f78460' : '#f4f8e4'; context.arc(point.x * canvas.width, point.y * canvas.height, index === 8 ? 7 : 3, 0, Math.PI * 2); context.fill(); });
}

function movePointer(point, now) {
  const mapped = mapPointer(point, innerWidth, innerHeight);
  if (!pointer) pointer = mapped;
  else { pointer.x += (mapped.x - pointer.x) * smooth; pointer.y += (mapped.y - pointer.y) * smooth; }
  cursor.hidden = false;
  cursor.style.left = `${pointer.x}px`; cursor.style.top = `${pointer.y}px`;
  const element = document.elementFromPoint(pointer.x, pointer.y);
  drawingStudio.moveAir(element, pointer.x, pointer.y);
  const candidate = element?.closest('button:not(:disabled), a[href]');
  const modal = $('dialog[open]');
  const target = candidate && (!modal || modal.contains(candidate)) ? candidate : null;
  if (hoverTarget !== target) { hoverTarget?.classList.remove('gesture-hover'); target?.classList.add('gesture-hover'); hoverTarget = target; }
  const state = dwell.update(target, now);
  ring.style.strokeDashoffset = 125.664 * (1 - state.progress);
  if (state.activate && target?.isConnected) {
    gestureClicks++; $('#gesture-count').textContent = gestureClicks;
    const label = target.getAttribute('aria-label') || target.textContent.trim().replace(/\s+/g, ' ').slice(0, 45);
    addActivity(label, 'Activated with your finger');
    target.click();
  }
}

function trackFrame(now) {
  if (!running) return;
  try {
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastInference >= 33) {
      lastVideoTime = video.currentTime; lastInference = now;
      const result = handLandmarker.detectForVideo(video, now);
      const points = result.landmarks[0]; drawHand(points);
      const inStudio = !$('#studio').hidden;
      if (isIndexPointing(points, { requireOtherFingersCurled: !inStudio })) {
        setTracking('Index finger detected', true);
        movePointer(points[8], now);
      } else {
        resetPointer();
        setTracking(points ? (inStudio ? 'Extend your index finger' : 'Raise only your index finger') : 'Looking for your hand');
      }
      frames++;
      if (now - fpsTime >= 1000) { $('#fps-label').textContent = `${Math.round(frames * 1000 / (now - fpsTime))} FPS`; frames = 0; fpsTime = now; }
    } else if (now - lastInference > 500) { resetPointer(); setTracking('Waiting for camera frames'); }
  } catch (error) {
    stopCamera(); $('#camera-message').textContent = `Tracking interrupted. Try enabling the camera again. ${error.message}`; $('#camera-message').classList.add('error');
  }
  if (running) animation = requestAnimationFrame(trackFrame);
}

setInterval(() => {
  const elapsed = Math.floor((totalCameraTime + (running ? performance.now() - cameraStarted : 0)) / 1000);
  $('#session-time').textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
}, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetPointer();
  lastVideoTime = -1;
});
window.addEventListener('pagehide', () => { stream?.getTracks().forEach(track => track.stop()); });
window.addEventListener('resize', resetPointer);
window.addEventListener('scroll', () => { drawingStudio.endAir(); dwell.reset(); hoverTarget?.classList.remove('gesture-hover'); hoverTarget = null; ring.style.strokeDashoffset = 125.664; }, { passive: true });
