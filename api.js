let API_BASE = 'https://xnxx-api-7m4u.onrender.com/api/v1/xnxx';

export function setApiBaseUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') API_BASE = url.endsWith('/') ? url.slice(0, -1) : url;
  } catch { /* keep the known safe default */ }
}

async function requestJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('API request failed (' + response.status + ')');
  return response.json();
}

export function getLatest(page = 1) {
  return requestJson(API_BASE + '/latest?page=' + encodeURIComponent(page));
}

export function searchVideos(query, page = 1) {
  return requestJson(API_BASE + '/search?q=' + encodeURIComponent(query) + '&page=' + encodeURIComponent(page));
}

export function getVideoInfo(url) {
  return requestJson(API_BASE + '/infodl?url=' + encodeURIComponent(url));
}

function collectImageUrls(value, results = [], depth = 0) {
  if (depth > 4 || value == null) return results;
  if (typeof value === 'string') {
    const candidate = value.trim();
    const looksLikeImageUrl = candidate.startsWith('http://') || candidate.startsWith('https://') || candidate.startsWith('//') || candidate.startsWith('/') || /\.(?:png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(candidate);
    if (looksLikeImageUrl && !results.includes(candidate)) results.push(candidate);
  } else if (Array.isArray(value)) {
    value.forEach(entry => collectImageUrls(entry, results, depth + 1));
  } else if (typeof value === 'object') {
    const priority = ['url', 'src', 'href', 'original', 'large', 'default', 'image', 'thumbnail', 'thumb'];
    Object.entries(value).sort(([a], [b]) => {
      const ai = priority.indexOf(a.toLowerCase());
      const bi = priority.indexOf(b.toLowerCase());
      return (ai < 0 ? priority.length : ai) - (bi < 0 ? priority.length : bi);
    }).forEach(([, entry]) => collectImageUrls(entry, results, depth + 1));
  }
  return results;
}

export function normalizeVideos(payload) {
  const candidateKeys = ['videos', 'results', 'items', 'data', 'contents'];
  const findList = (node, depth = 0) => {
    if (!node || depth > 5) return null;
    if (Array.isArray(node)) return node;
    if (typeof node !== 'object') return null;
    for (const key of candidateKeys) {
      if (Array.isArray(node[key])) return node[key];
      const nested = findList(node[key], depth + 1);
      if (nested) return nested;
    }
    return null;
  };
  const items = findList(payload) || [];
  return items.map((item, index) => {
    const pick = (...keys) => {
      for (const key of keys) if (item?.[key] != null && item[key] !== '') return item[key];
      return '';
    };
    const title = String(pick('title', 'name', 'videoTitle', 'video_title') || 'Untitled video');
    const url = String(pick('url', 'link', 'videoUrl', 'video_url', 'pageUrl', 'page_url') || '');
    const imageKeys = ['image', 'img', 'images', 'thumbnail', 'thumbnails', 'thumb', 'thumbs', 'poster', 'cover', 'coverimage', 'cover_image', 'preview', 'previewimage', 'preview_image', 'imageurl', 'image_url', 'thumburl', 'thumb_url', 'thumbnailurl', 'thumbnail_url', 'posterurl', 'poster_url', 'previewurl', 'preview_url', 'default_thumb', 'defaultthumbnail', 'default_image', 'defaultimage', 'thumb_src'];
    const imageMap = Object.fromEntries(Object.entries(item || {}).map(([key, value]) => [key.toLowerCase(), value]));
    const thumbnailCandidates = [...new Set(imageKeys.flatMap(key => collectImageUrls(imageMap[key])))];
    const thumbnail = thumbnailCandidates[0] || '';
    const duration = String(pick('duration', 'length', 'time', 'videoDuration', 'video_duration') || '');
    const quality = String(pick('quality', 'resolution', 'badge') || 'HD');
    return { id: url || title + '-' + index, title, url, thumbnail, thumbnailCandidates, duration, quality, raw: item };
  }).filter(video => video.url || video.title !== 'Untitled video');
}

function walk(node, path = '', results = [], depth = 0) {
  if (depth > 7 || node == null) return results;
  if (typeof node === 'string') {
    if (node.startsWith('https://') || node.startsWith('http://')) results.push({ key: path.toLowerCase(), url: node });
    return results;
  }
  if (Array.isArray(node)) {
    node.forEach((value, index) => walk(value, path + '[' + index + ']', results, depth + 1));
  } else if (typeof node === 'object') {
    Object.entries(node).forEach(([key, value]) => walk(value, path ? path + '.' + key : key, results, depth + 1));
  }
  return results;
}

export function findDownloadLinks(payload) {
  const links = walk(payload);
  const mp4Links = links.filter(item => /\.mp4(?:[?#]|$)/i.test(item.url) || /mp4|download|high|low|quality|1080|720|480/i.test(item.key));
  const choose = pattern => mp4Links.find(item => pattern.test(item.key + ' ' + item.url) && !/m3u8/i.test(item.url))?.url || '';
  let high = choose(/high|1080|720|hd|hq|original|best/i);
  let low = choose(/low|480|360|240|sd|lq|small/i);
  const generic = mp4Links.filter(item => !/m3u8/i.test(item.url));
  if (!high) high = generic[0]?.url || '';
  if (!low) low = generic.find(item => item.url !== high)?.url || high;
  return { high, low };
}
