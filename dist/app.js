import { studioGesture, isIndexPointing, isTwoFingerScroll, nearestHand, mapPointer, mapPointerToCanvas, smoothDrawingPointer, ScrollMotion, DwellController } from './gestures.js';
import { createDrawingStudio } from './studio.js';
import { drawNeonHands } from './neon.js';
import { createGuideLandmarks, createVideoLandmarker, loadVision } from './guide-landmarks.js';

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
const cameraFrame = video.closest('.camera-frame');
const cameraFrameHome = document.createComment('Camera preview position');
cameraFrame.before(cameraFrameHome);
const tracker = $('#tracker');
const trackerOverlay = $('#tracker-overlay');
const trackerHand = $('#tracker-hand');
const trackerLandmarks = $('#tracker-landmarks');
const guide = $('#guide');
const guideLandmarks = createGuideLandmarks($('#guide-face-count'), $('#guide-pose-count'), $('#guide-model-status'));
trackerOverlay.addEventListener('click', () => {
  const visible = trackerOverlay.getAttribute('aria-pressed') === 'true';
  trackerOverlay.setAttribute('aria-pressed', String(!visible));
});
let handLandmarker, stream, running = false, loading = false, animation;
let smooth = .3, pointer = null, lastVideoTime = -1, lastInference = 0;
let lastPointerAt = 0;
const scrollMotion = new ScrollMotion();
let activeWrist;
let drawingInCanvas = false;
let cameraStarted = 0, totalCameraTime = 0, gestureClicks = 0, frames = 0, fpsTime = 0;
let cameraGeneration = 0, lastTrackingMessage = '', hoverTarget = null, toastTimeout;
let practiceHits = 0;
const hitTargets = new Set();
const links = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const pages = { overview: 'Overview', playground: 'Playground', studio: 'Drawing Studio', tracker: 'Hand Tracker', gallery: 'Gallery', guide: 'How it works' };
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
  if (page !== 'guide') guideLandmarks.clear();
  $('.workspace').classList.toggle('workspace-studio', page === 'studio');
  $('.workspace').classList.toggle('workspace-tracker', page === 'tracker');
  $('.workspace').classList.toggle('workspace-guide', page === 'guide');
  drawingStudio.setCameraReady(page === 'studio' && running && Boolean(handLandmarker));
  if (page === 'studio') $('#studio-camera-status').append(cameraFrame, cameraMessage);
  else if (page === 'tracker') $('#tracker-preview').append(cameraFrame, cameraMessage);
  else if (page === 'guide') $('#guide-preview').append(cameraFrame, cameraMessage);
  else {
    cameraFrameHome.after(cameraFrame);
    cameraMessageHome.after(cameraMessage);
  }
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
  if (event.isTrusted && !event.defaultPrevented && !event.ctrlKey && !event.metaKey &&
      !event.shiftKey && !event.altKey && event.target.closest('a[href="#guide"]')) {
    startCamera();
  }
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

function updateTracker(count, message = running ? (count ? `Hands: ${count}` : 'Show both hands') : 'Camera off') {
  if (trackerHand.textContent !== message) trackerHand.textContent = message;
  const landmarks = `${count * 21} / 42 landmarks`;
  if (trackerLandmarks.textContent !== landmarks) trackerLandmarks.textContent = landmarks;
}

function resetPointer() {
  scrollMotion.reset();
  drawingStudio.endAir();
  cursor.classList.remove('studio-pointer');
  dwell.reset(); pointer = null; cursor.hidden = true;
  if (hoverTarget) hoverTarget.classList.remove('gesture-hover');
  hoverTarget = null; ring.style.strokeDashoffset = 125.664;
}

async function createTracker() {
  const { tasks, vision } = await loadVision();
  return createVideoLandmarker(tasks.HandLandmarker, vision,
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    { numHands: 2, minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5 });
}

async function startCamera() {
  if (loading || running) return;
  loading = true;
  updateTracker(0, 'Starting camera');
  const generation = ++cameraGeneration;
  const buttons = $$('[data-action="start"]');
  buttons.forEach(button => { button.disabled = true; });
  $('#camera-button span').textContent = 'Getting ready…';
  const message = $('#camera-message'); message.classList.remove('error');
  message.textContent = 'Waiting for camera access. Choose Allow in your browser if prompted.';
  let acquiredStream;
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Open this demo on HTTPS or localhost to enable your webcam.');
    // Request access directly from the user's start action. No microphone is needed.
    acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } } });
    if (generation !== cameraGeneration) { acquiredStream.getTracks().forEach(track => track.stop()); return; }
    stream = acquiredStream;
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    running = true; cameraStarted = performance.now(); fpsTime = cameraStarted; frames = 0; lastVideoTime = -1;
    $('#camera-placeholder').hidden = true;
    $('#camera-badge').classList.add('live'); $('#camera-badge').innerHTML = '<span></span> Live';
    $('#camera-button').classList.add('running');
    $('#camera-button span').textContent = 'Stop camera';
    $$('[data-action="start"]:not(#camera-button)').forEach(button => { button.innerHTML = 'Stop camera <svg><use href="#i-camera"/></svg>'; });
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (running) { stopCamera(); message.textContent = 'Camera disconnected. Reconnect it and enable the camera again.'; } });
    if (!handLandmarker) {
      updateTracker(0, 'Loading hand tracker');
      message.textContent = 'Camera is live. Loading the hand tracking model…';
      try {
        handLandmarker = await createTracker();
      } catch {
        if (generation !== cameraGeneration) return;
        updateTracker(0, 'Hand tracking unavailable');
        setTracking('Hand tracking unavailable');
        message.textContent = 'Camera is live. The hand tracking model could not load. Check your connection, then stop and restart the camera to retry.';
        message.classList.add('error');
        animation = requestAnimationFrame(trackFrame);
        return;
      }
    }
    if (generation !== cameraGeneration) return;
    drawingStudio.setCameraReady(!$('#studio').hidden);
    fpsTime = performance.now();
    message.textContent = 'Camera is live. Show your hand to begin tracking.';
    setTracking('Looking for your hand');
    addActivity('Camera connected', 'Hand tracking is ready');
    animation = requestAnimationFrame(trackFrame);
  } catch (error) {
    acquiredStream?.getTracks().forEach(track => track.stop());
    stream = null; video.srcObject = null;
    $('#camera-button span').textContent = 'Try camera again';
    const errors = { NotAllowedError: 'Camera access was denied. Allow camera access in your browser, then try again.', NotFoundError: 'No camera found. Connect a webcam and try again.', NotReadableError: 'Camera is busy or unavailable. Close other camera apps and try again.' };
    message.textContent = errors[error.name] || error.message || 'Tracking could not start. Check your internet connection and try again.';
    message.classList.add('error');
    setTracking('Camera unavailable');
    updateTracker(0, 'Camera unavailable');
    addActivity('Camera could not start', 'Check the message above');
  } finally { loading = false; buttons.forEach(button => { button.disabled = false; }); }
}

function stopCamera() {
  cameraGeneration++;
  if (running) totalCameraTime += performance.now() - cameraStarted;
  running = false; cancelAnimationFrame(animation);
  guideLandmarks.clear(true);
  updateTracker(0);
  drawingStudio.setCameraReady(false);
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  video.srcObject = null; context.clearRect(0, 0, canvas.width, canvas.height);
  resetPointer();
  $('#camera-placeholder').hidden = false;
  $('#camera-badge').classList.remove('live'); $('#camera-badge').innerHTML = '<span></span> Offline';
  $('#camera-button').classList.remove('running'); $('#camera-button span').textContent = 'Enable camera';
  $$('[data-action="start"]:not(#camera-button)').forEach(button => { button.innerHTML = 'Enable camera <svg><use href="#i-camera"/></svg>'; });
  $('#fps-label').textContent = '— FPS';
  const guideCount = $('#guide-hand-count');
  guideCount.dataset.count = '0';
  guideCount.textContent = 'Hands: 0';
  $('#camera-message').textContent = 'Camera stopped. Enable it whenever you are ready.';
  setTracking('Camera is off'); addActivity('Camera stopped', 'Webcam access released');
}

function drawHand(hands) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!tracker.hidden) {
    updateTracker(hands.length, hands.length === 1 ? 'Hands: 1 · Bring your other hand into view' : undefined);
    if (trackerOverlay.getAttribute('aria-pressed') === 'true') {
      drawNeonHands(context, hands, canvas.width, canvas.height);
    }
    return;
  }
  const teaching = !guide.hidden;
  if (teaching) {
    guideLandmarks.draw(context, canvas.width, canvas.height);
    const count = $('#guide-hand-count');
    if (count.dataset.count !== String(hands.length)) {
      count.dataset.count = String(hands.length);
      count.textContent = `Hands: ${hands.length}`;
    }
  }
  const visibleHands = teaching ? [...hands].sort((a, b) => b[0].x - a[0].x) : hands.slice(0, 1);
  for (const [handIndex, points] of visibleHands.entries()) {
    const color = teaching ? ['#50ffcf', '#ff9cfd'][handIndex] : '#dce7b9cc';
    context.save();
    context.lineWidth = teaching ? 3 : 2;
    context.strokeStyle = color;
    context.beginPath();
    for (const [a, b] of links) {
      context.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
      context.lineTo(points[b].x * canvas.width, points[b].y * canvas.height);
    }
    context.stroke();
    for (const [index, point] of points.entries()) {
      context.beginPath();
      context.fillStyle = teaching ? color : index === 8 ? '#f78460' : '#f4f8e4';
      context.arc(point.x * canvas.width, point.y * canvas.height, teaching || index === 8 ? 5 : 3, 0, Math.PI * 2);
      context.fill();
    }
    if (teaching) {
      // The preview mirrors the canvas. Counter-mirror the numbers so they stay readable.
      context.scale(-1, 1);
      context.font = 'bold 16px sans-serif';
      context.lineWidth = 3;
      context.strokeStyle = '#151222';
      context.fillStyle = '#fff';
      for (const [index, point] of points.entries()) {
        const x = -point.x * canvas.width + 6;
        const y = point.y * canvas.height - 5;
        context.strokeText(String(index), x, y);
        context.fillText(String(index), x, y);
      }
    }
    context.restore();
  }
}

function movePointer(point, now, mode = 'select') {
  const penDown = mode === 'draw';
  const inStudio = !$('#studio').hidden;
  const useCanvas = inStudio && penDown && !$('dialog[open]');
  if (useCanvas !== drawingInCanvas) pointer = null;
  drawingInCanvas = useCanvas;
  let mapped = mapPointer(point, innerWidth, innerHeight, inStudio ? .23 : .12);
  if (useCanvas) {
    const sidebar = $('.sidebar');
    const topInset = getComputedStyle(sidebar).position === 'sticky'
      ? sidebar.getBoundingClientRect().bottom
      : $('.developer-credit').getBoundingClientRect().bottom;
    mapped = mapPointerToCanvas(point, $('#studio-canvas').getBoundingClientRect(), innerWidth, innerHeight, topInset);
    if (!mapped) { resetPointer(); return; }
  }
  pointer = smoothDrawingPointer(pointer, mapped, now - lastPointerAt, smooth);
  lastPointerAt = now;
  cursor.hidden = false;
  cursor.style.left = `${pointer.x}px`; cursor.style.top = `${pointer.y}px`;
  const element = document.elementFromPoint(pointer.x, pointer.y);
  const overCanvas = element?.id === 'studio-canvas';
  cursor.classList.toggle('studio-pointer', overCanvas);
  drawingStudio.moveAir(penDown ? element : null, pointer.x, pointer.y);
  const candidate = element?.closest('button:not(:disabled), a[href]');
  const modal = $('dialog[open]');
  const target = mode === 'select' && candidate && (!modal || modal.contains(candidate)) ? candidate : null;
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
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        guideLandmarks.clear();
      }
      if (!guide.hidden) guideLandmarks.update(video, now);
      const hands = handLandmarker?.detectForVideo(video, now).landmarks ?? [];
      let points = nearestHand(hands, activeWrist);
      if (!points) {
        resetPointer();
        points = hands[0];
      }
      activeWrist = points?.[0];
      drawHand(hands);
      const inStudio = !$('#studio').hidden;
      const scrolling = tracker.hidden && !inStudio && !$('dialog[open]') && isTwoFingerScroll(points, scrollMotion.active);
      if (!scrolling) scrollMotion.reset();
      if (scrolling) {
        if (!scrollMotion.active) resetPointer();
        const pixels = scrollMotion.update((points[5].y + points[17].y) / 2, innerHeight);
        if (pixels) window.scrollBy({ top: pixels, behavior: 'instant' });
        setTracking('Two-finger scroll', true);
      } else if (!tracker.hidden || !handLandmarker) {
        resetPointer();
      } else if (inStudio && points?.length === 21) {
        const mode = studioGesture(points);
        setTracking(mode === 'draw' ? 'Drawing' : mode === 'select' ? 'Selecting tool' : 'Pen lifted', true);
        movePointer(points[8], now, mode);
      } else if (isIndexPointing(points)) {
        setTracking('Index finger detected', true);
        movePointer(points[8], now);
      } else {
        resetPointer();
        setTracking(points ? 'Raise only your index finger' : 'Looking for your hand');
      }
      frames++;
      if (now - fpsTime >= 1000) { $('#fps-label').textContent = `${Math.round(frames * 1000 / (now - fpsTime))} FPS`; frames = 0; fpsTime = now; }
    } else if (now - lastInference > 500) {
      resetPointer();
      setTracking('Waiting for camera frames');
      if (!guide.hidden) {
        guideLandmarks.clear();
        drawHand([]);
      }
      if (!tracker.hidden) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        updateTracker(0, 'Waiting for camera frames');
      }
    }
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
window.addEventListener('scroll', () => { drawingStudio.endAir(); if (drawingInCanvas) pointer = null; dwell.reset(); hoverTarget?.classList.remove('gesture-hover'); hoverTarget = null; ring.style.strokeDashoffset = 125.664; }, { passive: true });
