// Native images use the browser cache. No gallery library or full-set prefetching.
export function createGallery(viewer) {
  const frame = viewer.querySelector('#photo-frame');
  const message = viewer.querySelector('#photo-message');
  const controls = viewer.querySelector('#carousel-controls');
  const count = viewer.querySelector('#photo-count');
  const caption = viewer.querySelector('#photo-caption');
  const credit = viewer.querySelector('#photo-credit');
  const captionBlock = viewer.querySelector('#photo-caption-block');
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
  }

  viewer.querySelector('#previous-photo').addEventListener('click', () => advance(-1));
  viewer.querySelector('#next-photo').addEventListener('click', () => advance(1));
  viewer.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (photos.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      advance(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });

  return {
    show(person) {
      personName = person.name || 'this person';
      photos = Array.isArray(person.photos) ? person.photos.filter(Boolean) : [];
      index = 0;
      render();
    },
    clear() {
      revision++;
      photos = [];
      adjacentImages = [];
      frame.querySelector('img')?.remove();
      frame.setAttribute('aria-busy', 'false');
    },
  };
}
