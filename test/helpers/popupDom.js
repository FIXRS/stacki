// Goal: give component tests the browser APIs used by the shared popup.
// Methodology: emulate native dialog visibility/focus in jsdom and request reduced
// motion; popup.test.js separately exercises real animation timing and nested dismissal.
exports.installPopupDOM = (window) => {
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
    this.querySelector('[autofocus], input, button')?.focus();
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const previous = window.matchMedia?.bind(window);
  window.matchMedia = (query) =>
    query === '(prefers-reduced-motion: reduce)'
      ? {
          matches: true,
          media: query,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent() {
            return true;
          },
        }
      : (previous?.(query) ?? {
          matches: false,
          media: query,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent() {
            return true;
          },
        });
};
