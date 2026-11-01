import { getLatest, searchVideos, getVideoInfo, normalizeVideos, findDownloadLinks, setApiBaseUrl } from './api.js';

const DEFAULTS = {
  apiBaseUrl: 'https://xnxx-api-7m4u.onrender.com/api/v1/xnxx',
  botApiEndpoint: 'https://shrouded-curvature-scrubber.ngrok-free.dev/api/bot/send-video',
  whatsappGroupJid: '120363412473526442@g.us'
};
const $ = selector => document.querySelector(selector);
const grid = $('#videoGrid');
const statusBox = $('#status');
const pagination = $('#pagination');
const searchInput = $('#searchInput');
let config = { ...DEFAULTS };
let currentPage = 1;
let currentQuery = '';
let currentVideos = [];
let selectedVideo = null;
let downloadLinks = { high: '', low: '' };
let searchTimer;
let requestToken = 0;
let catalogStarted = false;
let configIsReady = false;
function startCatalog() { if (!catalogStarted) { catalogStarted = true; loadPage(); } }

function showToast(message, kind = '') {
  const node = document.createElement('div');
  node.className = 'toast ' + kind;
  node.textContent = message;
  $('#toastRegion').append(node);
  setTimeout(() => node.remove(), 4200);
}

function setLoading(message = 'Finding the latest videos…') {
  grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton-card" aria-hidden="true"><div class="skeleton-thumb"><i></i></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>').join('');
  $('#emptyState').classList.add('hidden');
  pagination.classList.add('hidden');
  statusBox.classList.remove('hidden');
  statusBox.innerHTML = '<div class="loading-note"><span class="loading-signal"></span>' + message + '</div>';
}

function setStatusError(message) {
  statusBox.classList.remove('hidden');
  statusBox.innerHTML = '<span>' + escapeHtml(message) + '</span>';
  pagination.classList.remove('hidden');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function safeImage(value) {
  try { const url = new URL(value, location.href); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}

function titleBackdrop(title, index = 0) {
  const text = String(title || 'Midnight selection');
  const hue = Array.from(text).reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 360, 0);
  const label = text.length > 58 ? text.slice(0, 55) + '…' : text;
  return '<div class="thumb-placeholder" style="--cover-hue:' + hue + '"><span class="fallback-mark">MV / 0' + ((index % 9) + 1) + '</span><span class="fallback-orb"></span><span class="fallback-caption">' + escapeHtml(label) + '</span></div>';
}

function renderVideos(videos) {
  statusBox.classList.add('hidden');
  currentVideos = videos;
  grid.innerHTML = '';
  if (!videos.length) {
    $('#emptyState').classList.remove('hidden');
    pagination.classList.remove('hidden');
    $('#prevPage').disabled = currentPage <= 1;
    $('#nextPage').disabled = true;
    return;
  }
  $('#emptyState').classList.add('hidden');
  pagination.classList.remove('hidden');
  $('#prevPage').disabled = currentPage <= 1;
  $('#nextPage').disabled = videos.length < 1;
  videos.forEach((video, index) => {
    const card = document.createElement('article');
    card.className = 'video-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'View details for ' + video.title);
    card.style.animationDelay = Math.min(index * 35, 280) + 'ms';
    const imageCandidates = (video.thumbnailCandidates?.length ? video.thumbnailCandidates : [video.thumbnail]).map(safeImage).filter(Boolean);
    card.innerHTML = '<div class="thumb-wrap">' + titleBackdrop(video.title, index) + (imageCandidates.length ? '<img class="thumb-image" loading="lazy" decoding="async" alt="' + escapeHtml(video.title) + '">' : '') + '<div class="thumb-shade"></div><span class="quality-badge">' + escapeHtml(video.quality || 'HD') + '</span><span class="duration-badge">' + escapeHtml(video.duration || 'VIDEO') + '</span><span class="play-overlay"></span></div><div class="video-info"><h3 class="video-title">' + escapeHtml(video.title) + '</h3><div class="video-meta">TAP TO VIEW DETAILS</div></div>';
    card.addEventListener('click', () => openVideo(video));
    card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openVideo(video); } });
    const img = card.querySelector('.thumb-image');
    if (img) {
      let imageIndex = 0;
      img.addEventListener('error', () => {
        imageIndex++;
        if (imageIndex < imageCandidates.length) img.src = imageCandidates[imageIndex];
        else img.remove();
      });
      img.src = imageCandidates[0];
    }
    grid.append(card);
  });
}

async function loadPage() {
  const token = ++requestToken;
  const label = currentQuery ? 'Searching the collection…' : 'Finding the latest videos…';
  setLoading(label);
  $('#sectionTitle').innerHTML = currentQuery ? 'Search results <span class="heading-dot">.</span>' : 'Latest videos <span class="heading-dot">.</span>';
  $('#pageIndicator').innerHTML = 'PAGE <span>' + String(currentPage).padStart(2, '0') + '</span>';
  $('#pageCount').textContent = String(currentPage).padStart(2, '0');
  try {
    const payload = currentQuery ? await searchVideos(currentQuery, currentPage) : await getLatest(currentPage);
    if (token !== requestToken) return;
    renderVideos(normalizeVideos(payload));
  } catch (error) {
    if (token !== requestToken) return;
    setStatusError('Could not load videos. The catalog service may be unavailable or blocking this connection. Please try again.');
    showToast(error.message || 'Catalog request failed.');
  }
}

function openOverlay(id) {
  $('#' + id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeOverlay(id) {
  $('#' + id).classList.add('hidden');
  if (document.querySelector('.overlay:not(.hidden)')) return;
  document.body.style.overflow = '';
}

async function openVideo(video) {
  if (!video.url) { showToast('Video details are unavailable for this item.'); return; }
  selectedVideo = video;
  downloadLinks = { high: '', low: '' };
  $('#modalTitle').textContent = video.title;
  $('#modalDuration').textContent = video.duration || '';
  $('#modalFallback').innerHTML = titleBackdrop(video.title, 0).replace('thumb-placeholder', 'modal-fallback-art');
  const modalImages = (video.thumbnailCandidates?.length ? video.thumbnailCandidates : [video.thumbnail]).map(safeImage).filter(Boolean);
  const modalImage = $('#modalImage');
  modalImage.alt = video.title;
  modalImage.classList.add('hidden');
  modalImage.removeAttribute('src');
  let modalImageIndex = 0;
  modalImage.onerror = () => {
    modalImageIndex++;
    if (modalImageIndex < modalImages.length) modalImage.src = modalImages[modalImageIndex];
    else { modalImage.classList.add('hidden'); modalImage.removeAttribute('src'); }
  };
  if (modalImages.length) {
    modalImage.onload = () => modalImage.classList.remove('hidden');
    modalImage.src = modalImages[0];
  }
  $('#phoneInput').value = '';
  $('#qualitySelect').value = 'high';
  $('#sendButton').disabled = true;
  $('#sendButton').querySelector('span').textContent = 'Loading download links…';
  $('#downloadFallback').textContent = 'Fetching available file links…';
  openOverlay('videoModal');
  try {
    const payload = await getVideoInfo(video.url);
    if (selectedVideo !== video) return;
    downloadLinks = findDownloadLinks(payload);
    const hasLink = Boolean(downloadLinks.high || downloadLinks.low);
    $('#sendButton').disabled = !hasLink;
    $('#sendButton').querySelector('span').textContent = hasLink ? 'Send to WhatsApp' : 'Links unavailable';
    if (!hasLink) {
      $('#downloadFallback').textContent = 'No direct MP4 download links were returned. Please try another video.';
    } else {
      const selected = downloadLinks.high || downloadLinks.low;
      $('#downloadFallback').innerHTML = 'Selected file: <a href="' + escapeHtml(safeImage(selected)) + '" target="_blank" rel="noopener noreferrer">Open download link ↗</a>';
    }
  } catch (error) {
    if (selectedVideo !== video) return;
    $('#sendButton').disabled = true;
    $('#sendButton').querySelector('span').textContent = 'Links unavailable';
    $('#downloadFallback').textContent = 'Could not fetch download links. Please close and try again.';
    showToast('Video details could not be loaded.');
  }
}

function selectedDownload() {
  return $('#qualitySelect').value === 'low'
    ? { label: 'Low Quality MP4', url: downloadLinks.low || downloadLinks.high }
    : { label: 'High Quality MP4', url: downloadLinks.high || downloadLinks.low };
}

function formatWhatsAppPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Anonymous';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 'Anonymous';
  if (raw.startsWith('+')) return '+' + digits;
  if (raw.startsWith('00')) return '+' + digits.slice(2);
  if (digits.startsWith('94')) return '+' + digits;
  return '+94' + digits.replace(/^0/, '');
}

async function sendToBot() {
  if (!selectedVideo) return;
  const selected = selectedDownload();
  if (!selected.url) { showToast('No direct download link is available.'); return; }
  const button = $('#sendButton');
  const original = button.querySelector('span').textContent;
  button.disabled = true;
  button.querySelector('span').textContent = 'Sending…';
  const payload = {
    whatsappJid: config.whatsappGroupJid,
    userPhone: formatWhatsAppPhone($('#phoneInput').value),
    movieTitle: selectedVideo.title,
    videoDuration: selectedVideo.duration || '',
    selectedQuality: selected.label,
    downloadLink: selected.url
  };
  try {
    const response = await fetch(config.botApiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Bot service returned ' + response.status + '.');
    showToast('Sent to WhatsApp successfully.', 'success');
    closeOverlay('videoModal');
  } catch (error) {
    showToast(error.message || 'Could not reach the WhatsApp bot. Check the endpoint and try again.');
    button.disabled = false;
    button.querySelector('span').textContent = original;
  }
}

async function loadConfig() {
  try {
    const response = await fetch('./config.json', { cache: 'no-store' });
    if (response.ok) config = { ...DEFAULTS, ...(await response.json()) };
  } catch { /* bundled defaults remain available */ }
  setApiBaseUrl(config.apiBaseUrl);
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentQuery = searchInput.value.trim();
    currentPage = 1;
    loadPage();
  }, 300);
});
searchInput.addEventListener('keydown', event => { if (event.key === 'Enter') { clearTimeout(searchTimer); currentQuery = searchInput.value.trim(); currentPage = 1; loadPage(); } });
$('#prevPage').addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadPage(); window.scrollTo({ top: 300, behavior: 'smooth' }); } });
$('#nextPage').addEventListener('click', () => { currentPage++; loadPage(); window.scrollTo({ top: 300, behavior: 'smooth' }); });
$('#sendButton').addEventListener('click', sendToBot);
$('#qualitySelect').addEventListener('change', () => {
  const selected = selectedDownload();
  if (selected.url) $('#downloadFallback').innerHTML = 'Selected file: <a href="' + escapeHtml(safeImage(selected.url)) + '" target="_blank" rel="noopener noreferrer">Open download link ↗</a>';
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeOverlay(button.dataset.close)));
document.querySelectorAll('.overlay').forEach(overlay => overlay.addEventListener('click', event => { if (event.target === overlay) closeOverlay(overlay.id); }));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.querySelectorAll('.overlay:not(.hidden)').forEach(overlay => closeOverlay(overlay.id));
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); searchInput.focus(); }
});
$('#ageConfirm').addEventListener('click', () => {
  try { sessionStorage.setItem('midnight-vault-age-confirmed', 'yes'); } catch { }
  $('#ageGate').classList.add('dismissed');
  if (configIsReady) startCatalog();
});
try { if (sessionStorage.getItem('midnight-vault-age-confirmed') === 'yes') $('#ageGate').classList.add('dismissed'); } catch { }

await loadConfig();
configIsReady = true;
if ($('#ageGate').classList.contains('dismissed')) startCatalog();
