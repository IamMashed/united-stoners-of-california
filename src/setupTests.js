import '@testing-library/jest-dom/vitest';

// jsdom has no object URLs; the image previews only need a unique string.
let objectUrlCount = 0;
URL.createObjectURL = () => `blob:preview-${++objectUrlCount}`;
URL.revokeObjectURL = () => {};
