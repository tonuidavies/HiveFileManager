import { CATEGORY_COLORS } from '../theme';

const EXT = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif'],
  video: ['mp4', 'mkv', 'avi', 'mov', '3gp', 'webm', 'm4v', 'flv', 'wmv', 'ts', 'mpeg', 'mpg'],
  audio: ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'opus', 'flac', 'amr', 'wma', 'mid', 'midi'],
  pdf: ['pdf'],
  word: ['doc', 'docx', 'odt', 'rtf'],
  sheet: ['xls', 'xlsx', 'ods', 'csv'],
  slide: ['ppt', 'pptx', 'odp'],
  text: ['txt', 'md', 'log', 'ini', 'cfg', 'conf', 'properties'],
  code: ['json', 'xml', 'html', 'htm', 'js', 'ts', 'css', 'java', 'kt', 'py', 'c', 'cpp', 'h', 'sh', 'yml', 'yaml'],
  apk: ['apk', 'apks', 'xapk'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'],
  ebook: ['epub', 'mobi'],
};

const KIND_BY_EXT = {};
Object.keys(EXT).forEach((k) => EXT[k].forEach((e) => { KIND_BY_EXT[e] = k; }));

const KIND_STYLE = {
  folder: { icon: 'folder', color: '#F5B83D' },
  image: { icon: 'image', color: CATEGORY_COLORS.images },
  video: { icon: 'play-circle', color: CATEGORY_COLORS.videos },
  audio: { icon: 'music-note', color: CATEGORY_COLORS.audio },
  pdf: { icon: 'file-pdf-box', color: '#E5484D' },
  word: { icon: 'file-word', color: '#2B6CEF' },
  sheet: { icon: 'file-excel', color: '#16A34A' },
  slide: { icon: 'file-powerpoint', color: '#EA580C' },
  text: { icon: 'file-document-outline', color: '#64748B' },
  code: { icon: 'code-tags', color: '#0EA5E9' },
  apk: { icon: 'android', color: CATEGORY_COLORS.apks },
  archive: { icon: 'zip-box', color: CATEGORY_COLORS.archives },
  ebook: { icon: 'book-open-variant', color: '#A855F7' },
  other: { icon: 'file-outline', color: '#94A3B8' },
};

export const extOf = (name = '') => {
  const i = name.lastIndexOf('.');
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : '';
};

export const kindOf = (item) => {
  if (!item) return 'other';
  if (item.isDir) return 'folder';
  return KIND_BY_EXT[extOf(item.name)] || 'other';
};

export const kindStyle = (kind) => KIND_STYLE[kind] || KIND_STYLE.other;

export const isTextEditable = (item) => {
  const k = kindOf(item);
  return (k === 'text' || k === 'code' || extOf(item.name) === 'csv') && item.size < 1024 * 1024;
};

export const toUri = (path) => (path.startsWith('file://') ? path : 'file://' + encodeURI(path).replace(/#/g, '%23').replace(/\?/g, '%3F'));

export function formatBytes(bytes = 0, digits = 1) {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(digits)} ${units[i]}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => (n < 10 ? '0' + n : '' + n);

export function formatDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

export function formatFullDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const parentOf = (path) => {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '/';
};

export const nameOf = (path) => path.slice(path.lastIndexOf('/') + 1);

export const joinPath = (dir, name) => (dir.endsWith('/') ? dir + name : `${dir}/${name}`);

export function displayPath(path, root) {
  if (!path) return '';
  if (path === root) return 'Internal storage';
  if (path.startsWith(root + '/')) return 'Internal storage/' + path.slice(root.length + 1);
  return path;
}

export function sortItems(items, sortBy = 'name', dir = 'asc') {
  const mul = dir === 'asc' ? 1 : -1;
  const out = items.slice();
  out.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; // folders always first
    let r = 0;
    switch (sortBy) {
      case 'date': r = a.mtime - b.mtime; break;
      case 'size': r = (a.isDir ? a.count : a.size) - (b.isDir ? b.count : b.size); break;
      case 'type': r = extOf(a.name).localeCompare(extOf(b.name)); break;
      default: r = 0;
    }
    if (r === 0) r = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    return r * mul;
  });
  return out;
}

export const CATEGORIES = [
  { key: 'images', label: 'Images', icon: 'image-multiple', color: CATEGORY_COLORS.images },
  { key: 'videos', label: 'Videos', icon: 'play-box-multiple', color: CATEGORY_COLORS.videos },
  { key: 'audio', label: 'Audio', icon: 'music-box-multiple', color: CATEGORY_COLORS.audio },
  { key: 'documents', label: 'Documents', icon: 'file-document-multiple', color: CATEGORY_COLORS.documents },
  { key: 'apks', label: 'APKs', icon: 'android', color: CATEGORY_COLORS.apks },
  { key: 'archives', label: 'Archives', icon: 'zip-box', color: CATEGORY_COLORS.archives },
  { key: 'downloads', label: 'Downloads', icon: 'download-circle', color: CATEGORY_COLORS.downloads },
  { key: 'large', label: 'Large files', icon: 'database', color: CATEGORY_COLORS.large },
];

export const categoryMeta = (key) => CATEGORIES.find((c) => c.key === key) || { key, label: key, icon: 'folder', color: '#888' };
