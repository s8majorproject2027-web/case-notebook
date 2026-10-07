// sanitize.js — XSS prevention wrapper around DOMPurify
// DOMPurify is loaded via CDN in index.html

export function sanitizeHtml(dirty) {
  if (typeof DOMPurify === 'undefined') return dirty || '';
  return DOMPurify.sanitize(dirty || '', {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div', 'mark', 'sub', 'sup'
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'target', 'rel',
      'class', 'style', 'data-checked', 'rowspan', 'colspan'
    ],
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: true,
  });
}

export function sanitizeText(str) {
  if (!str) return '';
  return String(str).replace(/[<>&"']/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
