// Mirrors the `media` storage bucket limits in the migration.
export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
export const ACCEPTED_IMAGE_TYPES = Object.keys(EXTENSIONS).join(',');

export function imageExtension(mimeType) {
  return EXTENSIONS[mimeType];
}

// Returns an error message for the first invalid file (or too many files), else null.
// `alreadyAttached` counts images kept from before (when editing).
export function validateImages(files, alreadyAttached = 0) {
  if (files.length + alreadyAttached > MAX_IMAGES) {
    return `You can attach up to ${MAX_IMAGES} images.`;
  }
  for (const file of files) {
    if (!EXTENSIONS[file.type]) {
      return `${file.name}: only JPEG, PNG, WebP and GIF images are supported.`;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return `${file.name}: images must be 5 MB or smaller.`;
    }
  }
  return null;
}
