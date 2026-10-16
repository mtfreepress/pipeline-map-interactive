// Native images use the browser cache. No gallery library or full-set prefetching.
export function createGallery(viewer) {
  const frame = viewer.querySelector('#photo-frame');
  const message = viewer.querySelector('#photo-message');
  const controls = viewer.querySelector('#carousel-controls');
  const count = viewer.querySelector('#photo-count');
  const caption = viewer.querySelector('#photo-caption');
  const credit = viewer.querySelector('#photo-credit');
  const captionBlock = viewer.querySelector('#photo-caption-block');
  const expand = viewer.querySelector('#expand-photo');
  const lightbox = document.querySelector('#photo-lightbox');
  const lightboxArea = lightbox.querySelector('.lightbox-image-area');
  const lightboxMessage = lightbox.querySelector('#lightbox-message');
  const lightboxCaption = lightbox.querySelector('#lightbox-caption');
  const lightboxControls = lightbox.querySelector('#lightbox-controls');
  const lightboxCount = lightbox.querySelector('#lightbox-count');
  const closePhoto = lightbox.querySelector('#close-photo');
  const app = document.querySelector('#app');
  let enlargedRevision = 0;

  function positionLightbox() {
    if (!lightbox.open) return;
    const bounds = app.getBoundingClientRect();
    Object.assign(lightbox.style, {
      left: `${bounds.left}px`, top: `${bounds.top}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`,
    });
  }
  new ResizeObserver(positionLightbox).observe(app);
  window.addEventListener('scroll', positionLightbox, { passive: true });
  window.addEventListener('resize', positionLightbox);

  function closeEnlarged() {
    enlargedRevision++;
    lightbox.close();
    lightboxArea.querySelector('img')?.remove();
  }
  closePhoto.addEventListener('click', closeEnlarged);
  lightbox.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeEnlarged();
  });
  function renderEnlarged() {
    const photo = photos[index];
    if (!photo) return;
    lightboxControls.hidden = photos.length < 2;
    lightboxCount.textContent = `${index + 1} / ${photos.length}`;
    const currentRevision = ++enlargedRevision;
    lightboxArea.querySelector('img')?.remove();
    lightboxMessage.hidden = false;
    lightboxMessage.textContent = 'Loading photograph…';
    optionalText(lightboxCaption, [photo.caption, photo.credit].filter(Boolean).join(' — '));
    positionLightbox();
    const img = new Image();
    img.alt = photo.alt || `Photograph accompanying the profile of ${personName}`;
    img.decoding = 'async';
    img.hidden = true;
    img.addEventListener('load', () => {
      if (currentRevision !== enlargedRevision) return;
      lightboxMessage.hidden = true;
      img.hidden = false;
    }, { once: true });
    img.addEventListener('error', () => {
      if (currentRevision !== enlargedRevision) return;
      img.remove();
      lightboxMessage.textContent = 'This photograph could not be loaded. Close to return to the profile.';
    }, { once: true });
    lightboxArea.append(img);
    img.src = photo.fullSrc || photo.src;
  }
  expand.addEventListener('click', () => {
    if (expand.hidden || !photos[index]) return;
    lightbox.showModal();
    renderEnlarged();
  });
  let photos = [];
  let personName = '';
  let index = 0;
  let revision = 0;
  let adjacentImages = [];

  function optionalText(element, value) {
    element.textContent = value || '';
    element.hidden = !value;
  }

  function render() {
    expand.hidden = true;
    const currentRevision = ++revision;
    frame.querySelector('img')?.remove();
    adjacentImages = [];
    const photo = photos[index];
    controls.hidden = photos.length < 2;
    count.textContent = photos.length > 1 ? `${index + 1} / ${photos.length}` : '';
    optionalText(caption, photo?.caption);
    optionalText(credit, photo?.credit);
    captionBlock.hidden = !photo?.caption && !photo?.credit;
    message.hidden = false;
    message.textContent = photo ? 'Loading photograph…' : 'No photographs available for this profile.';
    frame.setAttribute('aria-busy', String(Boolean(photo)));
    if (!photo) return;

    const img = new Image();
    img.decoding = 'async';
    img.alt = photo.alt || `Photograph accompanying the profile of ${personName}`;
    img.hidden = true;
    img.addEventListener('load', () => {
      if (revision !== currentRevision) return;
      frame.setAttribute('aria-busy', 'false');
      message.hidden = true;
      img.hidden = false;
      img.classList.toggle('is-landscape', img.naturalWidth >= img.naturalHeight);
      expand.hidden = false;

      // Only preload neighbors after the visible image succeeds. Respect data saving.
      if (navigator.connection?.saveData || photos.length < 2) return;
      const neighbors = new Set([
        (index + 1) % photos.length,
        (index - 1 + photos.length) % photos.length,
      ]);
      adjacentImages = [...neighbors].filter((i) => photos[i]?.src).map((i) => {
        const preload = new Image();
        preload.decoding = 'async';
        preload.fetchPriority = 'low';
        preload.src = photos[i].src;
        return preload;
      });
    }, { once: true });
    img.addEventListener('error', () => {
      if (revision !== currentRevision) return;
      frame.setAttribute('aria-busy', 'false');
      img.remove();
      message.textContent = 'This photograph could not be loaded. You can continue exploring the profile.';
    }, { once: true });
    frame.append(img);
    if (photo.src) img.src = photo.src;
    else img.dispatchEvent(new Event('error'));
  }

  function advance(direction) {
    if (photos.length < 2) return;
    index = (index + direction + photos.length) % photos.length;
    render();
    if (lightbox.open) renderEnlarged();
  }

  lightbox.querySelector('#lightbox-previous').addEventListener('click', () => advance(-1));
  lightbox.querySelector('#lightbox-next').addEventListener('click', () => advance(1));
  viewer.querySelector('#previous-photo').addEventListener('click', () => advance(-1));
  viewer.querySelector('#next-photo').addEventListener('click', () => advance(1));
  function onArrowKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (photos.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      advance(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }
  viewer.addEventListener('keydown', onArrowKey);
  lightbox.addEventListener('keydown', onArrowKey);

  return {
    show(person) {
      closeEnlarged();
      personName = person.name || 'this person';
      photos = Array.isArray(person.photos) ? person.photos.filter(Boolean) : [];
      index = 0;
      render();
    },
    clear() {
      closeEnlarged();
      expand.hidden = true;
      revision++;
      photos = [];
      adjacentImages = [];
      frame.querySelector('img')?.remove();
      frame.setAttribute('aria-busy', 'false');
    },
  };
}
