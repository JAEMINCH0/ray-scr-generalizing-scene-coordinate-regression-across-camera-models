const project = window.RAY_SCR_PROJECT || {};

const themeToggle = document.getElementById('theme-toggle');
function applyTheme(theme) {
  const light = theme === 'light';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = light ? '#ffffff' : '#090909';
  const label = light ? 'Switch to dark theme' : 'Switch to light theme';
  themeToggle.setAttribute('aria-label', label);
  themeToggle.setAttribute('aria-pressed', String(light));
  themeToggle.title = label;
  themeToggle.querySelector('use').setAttribute('href', light ? '#i-moon' : '#i-sun');
}
applyTheme(document.documentElement.dataset.theme);
themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  try {
    localStorage.setItem('ray-scr-theme', theme);
  } catch {
    // Keep the current visit usable when storage is blocked.
  }
});

function publicUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

if (project.authors?.length) {
  const list = document.getElementById('authors');
  list.replaceChildren();
  project.authors.forEach(author => {
    const item = document.createElement('span');
    item.className = 'author';
    const url = author.url && publicUrl(author.url);
    const name = document.createElement(url ? 'a' : 'span');
    name.textContent = author.name;
    if (url) {
      name.href = url;
      name.target = '_blank';
      name.rel = 'noopener';
    }
    item.append(name);
    if (author.affiliations?.length) {
      const sup = document.createElement('sup');
      sup.textContent = author.affiliations.join(',');
      item.append(sup);
    }
    list.append(item);
  });
}
if (project.affiliations?.length) {
  const list = document.getElementById('affiliations');
  list.replaceChildren();
  project.affiliations.forEach((name, index) => {
    const item = document.createElement('span');
    const sup = document.createElement('sup');
    sup.textContent = `${index + 1} `;
    item.append(sup, document.createTextNode(name));
    list.append(item);
  });
}
for (const [id, value] of [['paper-link', project.paperUrl], ['arxiv-link', project.arxivUrl], ['code-link', project.codeUrl]]) {
  const url = value && publicUrl(value);
  if (!url) continue;
  const link = document.getElementById(id);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.removeAttribute('aria-disabled');
  link.classList.remove('resource-pending');
  link.querySelector('.soon')?.remove();
}

// Camera input/output pairs come from the supplied video and original paper figure.
const cameraAssets = {
  fisheye1: { input: 'assets/fisheye1-input.png', output: 'assets/fisheye1-result.webp' },
  fisheye2: { input: 'assets/fisheye2-input.png', output: 'assets/fisheye2-result.webp' },
  fisheye3: { input: 'assets/fisheye3-input.png', output: 'assets/fisheye3-result.webp' },
  pinhole: { input: 'assets/pinhole-input.png', output: 'assets/pinhole-result.webp' },
};
const backboneNames = { 'ace-g': 'ACE-G', ace: 'ACE', glace: 'GLACE', dsac: 'DSAC*' };
const sampleResults = {
  '360': { type: 'video', src: 'assets/piatrium.mp4', poster: 'assets/piatrium-poster.png' },
  ...Object.fromEntries(Object.entries(cameraAssets).map(([camera, assets]) =>
    [camera, { type: 'image', src: assets.output }])),
};
const video = document.getElementById('demo-video');
const videoShell = document.getElementById('video-shell');
const playButton = document.getElementById('play-toggle');
const progress = document.getElementById('video-progress');
const time = document.getElementById('video-time');
const inputCanvas = document.getElementById('input-frame');
const inputContext = inputCanvas.getContext('2d');
const inputStill = document.getElementById('input-still');
const outputStill = document.getElementById('output-still');
const outputImage = document.getElementById('output-image');
const outputPending = document.getElementById('output-pending');
const pendingBackbone = document.getElementById('pending-backbone');
const sampleBadge = document.getElementById('sample-badge');
const returnSample = document.getElementById('return-sample');
const cameraButtons = [...document.querySelectorAll('.camera-tabs [data-camera]')];
const backboneButtons = [...document.querySelectorAll('[data-backbone]')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const dialog = document.getElementById('figure-dialog');
const dialogImage = document.getElementById('dialog-image');
const dialogCaption = document.getElementById('dialog-caption');
let currentCamera = '360';
let currentBackbone = project.demo?.defaultBackbone || '';
let currentResult = null;
let resultVersion = 0;
let videoStarted = false;
let explicitlyPaused = true;
let videoVisible = false;
let resumeAfterDialog = false;
const poster = new Image();
// Keep input frames independent of the selected model's output.
const inputVideo = document.createElement('video');
inputVideo.id = 'input-source-video';
inputVideo.src = 'assets/piatrium.mp4';
inputVideo.muted = true;
inputVideo.playsInline = true;
inputVideo.loop = true;
inputVideo.preload = 'auto';
inputVideo.hidden = true;
inputVideo.setAttribute('aria-hidden', 'true');
document.getElementById('input-view').append(inputVideo);
const raySphere = new window.RaySCRSphere(document.getElementById('ray-sphere'),
  () => currentCamera === '360' ? inputCanvas : inputStill);
const inputCrop = { x: 27, y: 61, width: 192, height: 96 };
const formatTime = value => {
  const seconds = Number.isFinite(value) ? Math.floor(value) : 0;
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
function drawInputFrame() {
  if (currentCamera !== '360') return;
  const useVideo = videoStarted && inputVideo.readyState >= 2;
  const source = useVideo ? inputVideo : poster;
  const width = useVideo ? inputVideo.videoWidth : poster.naturalWidth;
  const height = useVideo ? inputVideo.videoHeight : poster.naturalHeight;
  if (!width || !height) return;
  inputContext.drawImage(source,
    inputCrop.x * width / 960, inputCrop.y * height / 540,
    inputCrop.width * width / 960, inputCrop.height * height / 540,
    0, 0, inputCanvas.width, inputCanvas.height);
  if (reducedMotion.matches) raySphere.refreshTexture();
}
poster.addEventListener('load', () => { drawInputFrame(); raySphere.refreshTexture(); });
poster.src = 'assets/piatrium-poster.png';
inputStill.addEventListener('load', () => raySphere.refreshTexture());
if ('requestVideoFrameCallback' in inputVideo) {
  const onFrame = () => {
    drawInputFrame();
    inputVideo.requestVideoFrameCallback(onFrame);
  };
  inputVideo.requestVideoFrameCallback(onFrame);
} else {
  inputVideo.addEventListener('timeupdate', drawInputFrame);
}
inputVideo.addEventListener('seeked', drawInputFrame);
inputVideo.addEventListener('loadeddata', drawInputFrame);
function syncInputPlayback() {
  if (currentCamera !== '360' || currentResult?.type !== 'video') {
    inputVideo.pause();
    return;
  }
  if (inputVideo.readyState >= 1 && Math.abs(inputVideo.currentTime - video.currentTime) > .12) {
    inputVideo.currentTime = Math.min(video.currentTime, Math.max(0, inputVideo.duration - .01));
  }
  if (!video.paused) inputVideo.play().catch(() => {});
  else inputVideo.pause();
}
function updatePlayback() {
  playButton.setAttribute('aria-label', video.paused ? 'Play demo' : 'Pause demo');
  playButton.querySelector('use').setAttribute('href', video.paused ? '#i-play' : '#i-pause');
}
function updateProgress() {
  const percentage = video.duration ? 100 * video.currentTime / video.duration : 0;
  progress.value = percentage;
  progress.style.setProperty('--progress', `${percentage}%`);
  time.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  progress.setAttribute('aria-valuetext', `${formatTime(video.currentTime)} of ${formatTime(video.duration)}`);
}
function renderResult() {
  const version = ++resultVersion;
  const media = currentBackbone
    ? project.demo?.results?.[currentBackbone]?.[currentCamera]
    : sampleResults[currentCamera];
  currentResult = media || null;
  const isVideo = media?.type === 'video';
  const isImage = media?.type === 'image';
  videoShell.hidden = !isVideo;
  outputStill.hidden = !isImage;
  outputPending.hidden = Boolean(media);
  sampleBadge.hidden = Boolean(currentBackbone) || !media;
  returnSample.hidden = Boolean(media) || Boolean(project.demo?.defaultBackbone) || currentCamera !== '360';
  pendingBackbone.textContent = backboneNames[currentBackbone] || '';
  if (!isVideo) { video.pause(); inputVideo.pause(); }
  if (isImage) {
    outputImage.src = media.src;
    outputImage.alt = `${backboneNames[currentBackbone] || 'Ray-SCR sample'} · ${currentCamera}`;
    outputStill.dataset.image = media.src;
    outputStill.dataset.caption = '';
  } else if (isVideo) {
    const retainedTime = currentCamera === '360' ? inputVideo.currentTime : video.currentTime;
    const existing = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src');
    const resume = () => {
      if (version !== resultVersion) return;
      if (retainedTime && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(retainedTime, Math.max(0, video.duration - .01));
      }
      syncInputPlayback();
      if (videoStarted && !explicitlyPaused && !reducedMotion.matches && !dialog.open && !document.hidden) {
        video.play().catch(updatePlayback);
      }
    };
    video.setAttribute('aria-label', `${backboneNames[currentBackbone] || 'Ray-SCR sample'} localization · ${currentCamera}`);
    if (media.poster) video.poster = media.poster;
    else video.removeAttribute('poster');
    if (existing !== media.src) {
      video.pause();
      video.src = media.src;
      video.addEventListener('loadedmetadata', resume, { once: true });
      video.load();
    } else if (video.readyState >= 1) resume();
    else video.addEventListener('loadedmetadata', resume, { once: true });
  }
}
function selectCamera(camera) {
  currentCamera = camera;
  cameraButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.camera === camera)));
  const panoramic = camera === '360';
  inputCanvas.hidden = !panoramic;
  inputStill.hidden = panoramic;
  if (panoramic) {
    videoStarted = true;
    explicitlyPaused = false;
    drawInputFrame();
  } else {
    explicitlyPaused = true;
    video.pause();
    inputVideo.pause();
    inputStill.src = cameraAssets[camera].input;
    inputStill.alt = `${camera} input from the original paper`;
  }
  raySphere.setCamera(camera);
  renderResult();
}
function selectBackbone(backbone) {
  currentBackbone = backbone;
  backboneButtons.forEach(button => button.setAttribute('aria-pressed',
    String(button.dataset.backbone === backbone)));
  renderResult();
}
cameraButtons.forEach(button => button.addEventListener('click', () => selectCamera(button.dataset.camera)));
backboneButtons.forEach(button => button.addEventListener('click', () => selectBackbone(button.dataset.backbone)));
returnSample.addEventListener('click', () => selectBackbone(''));
backboneButtons.forEach(button => button.setAttribute('aria-pressed',
  String(button.dataset.backbone === currentBackbone)));
raySphere.setCamera('360');
renderResult();
document.getElementById('expand-adapter').addEventListener('click', () =>
  openImage('assets/ray-adapter.webp', 'Ray Adapter architecture from the paper', ''));
video.controls = false;
document.getElementById('video-toolbar').hidden = false;
playButton.addEventListener('click', () => {
  if (video.paused) {
    videoStarted = true;
    explicitlyPaused = false;
    video.play().catch(updatePlayback);
  } else {
    explicitlyPaused = true;
    video.pause();
  }
});
video.addEventListener('play', () => { videoStarted = true; syncInputPlayback(); updatePlayback(); });
video.addEventListener('pause', () => { inputVideo.pause(); updatePlayback(); });
video.addEventListener('timeupdate', syncInputPlayback);
video.addEventListener('seeked', syncInputPlayback);
video.addEventListener('timeupdate', updateProgress);
video.addEventListener('loadedmetadata', updateProgress);
progress.addEventListener('input', () => {
  videoStarted = true;
  if (Number.isFinite(video.duration)) video.currentTime = Number(progress.value) / 100 * video.duration;
  updateProgress();
});
const fullscreenButton = document.getElementById('fullscreen-toggle');
fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (videoShell.requestFullscreen) await videoShell.requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  } catch { video.controls = true; }
});
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
});
function canResume() {
  return currentResult?.type === 'video' && videoStarted && videoVisible && !explicitlyPaused
    && !reducedMotion.matches && !document.hidden && !dialog.open;
}
new IntersectionObserver(entries => {
  videoVisible = entries[0].isIntersecting;
  if (canResume()) video.play().catch(updatePlayback);
  else if (!videoVisible) video.pause();
}, { threshold: 0.15 }).observe(video);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) video.pause();
  else if (canResume()) video.play().catch(updatePlayback);
});
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) video.pause();
});
function openImage(src, alt, caption, isInput = false, isTable = false) {
  resumeAfterDialog = currentResult?.type === 'video' && !video.paused;
  video.pause();
  dialogImage.src = src;
  dialogImage.alt = alt;
  dialogCaption.textContent = caption || '';
  dialogCaption.hidden = !caption;
  if (caption) {
    dialog.setAttribute('aria-labelledby', 'dialog-caption');
    dialog.removeAttribute('aria-label');
  } else {
    dialog.removeAttribute('aria-labelledby');
    dialog.setAttribute('aria-label', alt);
  }
  dialog.classList.toggle('input-dialog', isInput);
  dialog.classList.toggle('table-dialog', isTable);
  dialog.classList.toggle('aachen-dialog', isTable && src.includes('aachen'));
  dialog.showModal();
  document.body.style.overflow = 'hidden';
}
document.getElementById('expand-input').addEventListener('click', () => {
  drawInputFrame();
  const src = currentCamera === '360' ? inputCanvas.toDataURL('image/png') : inputStill.src;
  openImage(src, `${currentCamera} input image`, currentCamera, true);
});
document.querySelectorAll('[data-image]').forEach(button => {
  button.addEventListener('click', () => {
    openImage(button.dataset.image, button.querySelector('img').alt, button.dataset.caption,
      false, button.dataset.table === 'true');
  });
});
document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
dialog.addEventListener('close', () => {
  document.body.style.overflow = '';
  if (resumeAfterDialog && currentResult?.type === 'video' && videoVisible && !document.hidden) video.play().catch(updatePlayback);
  resumeAfterDialog = false;
  dialog.classList.remove('input-dialog');
  dialog.classList.remove('table-dialog', 'aachen-dialog');
});

// These tabs only switch benchmark panels; camera selection does not alter results.
const benchmarkTabs = [...document.querySelectorAll('[role="tab"]')];
function selectBenchmark(tab) {
  benchmarkTabs.forEach(item => {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
  });
}
benchmarkTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectBenchmark(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % benchmarkTabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + benchmarkTabs.length) % benchmarkTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = benchmarkTabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    selectBenchmark(benchmarkTabs[next]);
    benchmarkTabs[next].focus();
  });
});
