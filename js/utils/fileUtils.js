// fileUtils.js — file validation, base64 encode/decode for IndexedDB storage

import { sanitizeFilename, formatBytes, CONFIG } from './helpers.js';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'
]);

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif', 'webp'
]);

const MIME_ICONS = {
  'application/pdf': '📄',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'image/jpeg': '🖼️', 'image/jpg': '🖼️', 'image/png': '🖼️',
  'image/gif': '🖼️', 'image/webp': '🖼️',
};

export function getFileIcon(mimeType) {
  return MIME_ICONS[mimeType] || '📎';
}

export function isImage(mimeType) {
  return mimeType && mimeType.startsWith('image/');
}

/**
 * Validate a File object. Returns { valid: true } or { valid: false, error: string }
 */
export function validateFile(file) {
  if (!file) return { valid: false, error: 'No file selected.' };

  const ext = file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `File type ".${ext}" is not allowed. Allowed: PDF, DOC, DOCX, JPG, PNG, GIF, WEBP.` };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { valid: false, error: `MIME type "${file.type}" is not allowed.` };
  }
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    return { valid: false, error: `File too large (${formatBytes(file.size)}). Maximum allowed: ${formatBytes(CONFIG.MAX_FILE_SIZE)}.` };
  }
  return { valid: true };
}

/**
 * Read a File as a base64 data-URL (to store in IndexedDB)
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Trigger a browser download of a stored base64 data-URL
 */
export function downloadBase64(dataUrl, fileName) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = sanitizeFilename(fileName);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Create an object URL from a base64 data URL (for preview)
 */
export function base64ToObjectUrl(dataUrl) {
  try {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
