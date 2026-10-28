/** Save a Blob as a file through a temporary link. Resolves true when the download started. */
export function downloadBlob(blob, filename) {
  if (typeof document === 'undefined' || !blob) return false;
  let url;
  try {
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  } catch (err) {
    console.error('download failed', err);
    if (url) URL.revokeObjectURL(url);
    return false;
  }
}
