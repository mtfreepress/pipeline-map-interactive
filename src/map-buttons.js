// Native buttons keep map profiles usable with touch, keyboard and screen readers.
// Nearby points share a chooser; their published geographic coordinates never move.
export function createMapButtons({ map, stage, locations, areas, names, onSelect, onHover }) {
  const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leaders.classList.add('map-button-leaders');
  leaders.setAttribute('aria-hidden', 'true');
  stage.append(leaders);
  const leaderLines = new Map();
  const offsets = [];
  for (let x = -96; x <= 96; x += 12) {
    for (let y = -96; y <= 96; y += 12) offsets.push([x, y]);
  }
  offsets.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const layer = document.createElement('div');
  layer.className = 'map-buttons';
  stage.append(layer);
  const buttons = new Map();
  let collisionSignature = '';
  // Reserve the same screen space in Mapbox's label placement engine, so city
  // names can choose an alternate anchor instead of sitting behind a button.
  map.addSource('profile-button-space', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'profile-button-space', type: 'symbol', source: 'profile-button-space',
    layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': false, 'icon-padding': 4 },
  });
  let selectedId;
  let openKey;
  let opener;
  let groups = [];
  const chooser = document.createElement('div');
  chooser.className = 'profile-chooser';
  chooser.setAttribute('role', 'dialog');
  chooser.setAttribute('aria-label', 'Choose a profile');
  chooser.hidden = true;
  stage.append(chooser);

  function closeChooser(restoreFocus = false) {
    chooser.hidden = true;
    buttons.get(openKey)?.setAttribute('aria-expanded', 'false');
    openKey = null;
    if (restoreFocus) (opener?.isConnected ? opener : map.getCanvas()).focus({ preventScroll: true });
  }

  function openChooser(group, origin) {
    closeChooser();
    openKey = group.key;
    opener = origin;
    origin?.setAttribute('aria-expanded', 'true');
    const header = document.createElement('div');
    header.className = 'chooser-header';
    const title = document.createElement('strong');
    title.textContent = 'People nearby';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'icon-button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close profile choices');
    close.addEventListener('click', () => closeChooser(true));
    header.append(title, close);
    chooser.replaceChildren(header, ...group.features.map((feature) => {
      const id = feature.properties.id;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'profile-choice';
      button.dataset.profileId = id;
      button.textContent = names.get(id) || 'Explore this location';
      button.addEventListener('click', () => {
        closeChooser();
        onSelect(id, opener);
      });
      return button;
    }));
    chooser.hidden = false;
    chooser.style.left = `${Math.max(8, Math.min(group.x - chooser.offsetWidth / 2, stage.clientWidth - chooser.offsetWidth - 8))}px`;
    chooser.style.top = `${Math.max(8, Math.min(group.y + 28, stage.clientHeight - chooser.offsetHeight - 8))}px`;
    chooser.querySelector('.profile-choice').focus({ preventScroll: true });
  }

  chooser.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeChooser(true); }
  });
  stage.addEventListener('pointerdown', (event) => {
    if (!chooser.hidden && !chooser.contains(event.target) && !opener?.contains(event.target)) closeChooser();
  });

  function buttonFor(key, create) {
    if (!buttons.has(key)) {
      const button = create();
      button.type = 'button';
      buttons.set(key, button);
      layer.append(button);
    }
    return buttons.get(key);
  }

  function position(button, x, y, selected) {
    button.style.left = `${x}px`;
    button.style.top = `${y}px`;
    button.setAttribute('aria-pressed', String(selected));
    // Keep off-screen buttons out of the tab order as well as out of view.
    button.hidden = x < 0 || y < 0 || x > stage.clientWidth || y > stage.clientHeight;
  }

  function render() {
    leaders.setAttribute('viewBox', `0 0 ${stage.clientWidth} ${stage.clientHeight}`);
    const projected = locations.features.map((feature) => ({ feature, ...map.project(feature.geometry.coordinates) }));
    const remaining = new Set(projected);
    groups = [];
    while (remaining.size) {
      const members = [remaining.values().next().value];
      remaining.delete(members[0]);
      // Transitive screen-space groups leave at least 8px between 44px buttons.
      for (let i = 0; i < members.length; i++) {
        for (const point of remaining) {
          if (Math.abs(point.x - members[i].x) < 52 && Math.abs(point.y - members[i].y) < 52) {
            members.push(point);
            remaining.delete(point);
          }
        }
      }
      groups.push({
        key: members.map(({ feature }) => feature.properties.id).sort().join('|'),
        features: members.map(({ feature }) => feature),
        x: members.reduce((sum, point) => sum + point.x, 0) / members.length,
        y: members.reduce((sum, point) => sum + point.y, 0) / members.length,
      });
    }
    // Separate the northern camera group from the Daniels County label on desktop.
    // Keep a leader to its geographic anchor rather than moving the source points.
    for (const group of groups) {
      const key = `group-${group.key}`;
      if (!leaderLines.has(key)) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        leaders.append(line);
        leaderLines.set(key, line);
      }
      const line = leaderLines.get(key);
      line.style.display = 'none';
      if (stage.clientWidth >= 900 && group.x >= 0 && group.x <= stage.clientWidth &&
          group.y >= 0 && group.y <= stage.clientHeight && group.features.length > 1 &&
          group.features.some(feature => feature.properties.id === 'fladager')) {
        line.setAttribute('x1', group.x);
        line.setAttribute('y1', group.y);
        group.x = Math.max(28, group.x - 36);
        line.setAttribute('x2', group.x);
        line.setAttribute('y2', group.y);
        line.style.display = '';
      }
    }
    const activeGroupKeys = new Set(groups.map(group => `group-${group.key}`));
    for (const [key, line] of leaderLines) {
      if (key.startsWith('group-') && !activeGroupKeys.has(key)) {
        line.remove();
        leaderLines.delete(key);
      }
    }
    const active = new Set();
    for (const group of groups) {
      active.add(group.key);
      const multiple = group.features.length > 1;
      const id = group.features[0].properties.id;
      const button = buttonFor(group.key, () => {
        const button = document.createElement('button');
        button.className = `map-photo-button${multiple ? ' is-group' : ''}`;
        const icon = document.createElement('span');
        icon.className = 'photo-icon';
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon);
        if (multiple) {
          const count = document.createElement('span');
          count.className = 'marker-count';
          count.textContent = String(group.features.length);
          button.append(count);
          button.setAttribute('aria-haspopup', 'dialog');
          button.setAttribute('aria-expanded', 'false');
        } else button.dataset.profileId = id;
        button.dataset.profileIds = group.key;
        const label = multiple ? `Choose from ${group.features.length} nearby profiles` : `Explore ${names.get(id) || 'this location'}`;
        button.setAttribute('aria-label', label);
        button.title = multiple ? group.features.map((feature) => names.get(feature.properties.id)).join(' · ') : names.get(id) || label;
        button.addEventListener('click', () => {
          const current = groups.find((item) => item.key === group.key);
          if (!current) return;
          if (multiple) openChooser(current, button);
          else { closeChooser(); onSelect(id, button); }
        });
        button.addEventListener('mouseenter', () => { if (!multiple) onHover(id); });
        button.addEventListener('mouseleave', () => onHover(null));
        return button;
      });
      position(button, group.x, group.y, group.features.some((feature) => feature.properties.id === selectedId));
    }
    const stageRect = stage.getBoundingClientRect();
    const occupied = [...[...layer.querySelectorAll('.map-photo-button:not([hidden])')].filter(button => active.has(button.dataset.profileIds)),
      ...stage.querySelectorAll('.map-legend, .mapboxgl-ctrl-group'), document.querySelector('.profile-panel')]
      .filter(Boolean).map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left - stageRect.left, right: rect.right - stageRect.left,
          top: rect.top - stageRect.top, bottom: rect.bottom - stageRect.top };
      });
    for (const area of areas) {
      active.add(area.id);
      const button = buttonFor(area.id, () => {
        const button = document.createElement('button');
        button.className = `map-area-button ${area.id === 'fort-peck-tribes' ? 'reservation-button' : 'county-button'}`;
        button.dataset.profileId = area.id;
        button.setAttribute('aria-label', `Explore ${names.get(area.id) || area.name.replaceAll('\n', ' ')}`);
        const label = document.createElement('span');
        label.textContent = area.name;
        const camera = document.createElement('span');
        camera.className = 'photo-icon area-photo-icon';
        camera.setAttribute('aria-hidden', 'true');
        button.append(label, camera);
        button.addEventListener('click', () => { closeChooser(); onSelect(area.id, button); });
        button.addEventListener('mouseenter', () => onHover(area.id));
        button.addEventListener('mouseleave', () => onHover(null));
        return button;
      });
      const point = map.project(area.coordinates);
      position(button, point.x, point.y, area.id === selectedId);
      if (!leaderLines.has(area.id)) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        leaders.append(line);
        leaderLines.set(area.id, line);
      }
      const line = leaderLines.get(area.id);
      line.style.display = 'none';
      if (button.hidden) continue;
      const width = button.offsetWidth;
      const height = button.offsetHeight;
      const x = Math.max(width / 2 + 6, Math.min(stage.clientWidth - width / 2 - 6, point.x));
      const y = Math.max(height / 2 + 6, Math.min(stage.clientHeight - height / 2 - 6, point.y));
      let placed;
      for (const [dx, dy] of offsets) {
        const rect = { left: x + dx - width / 2, right: x + dx + width / 2,
          top: y + dy - height / 2, bottom: y + dy + height / 2 };
        if (rect.left < 6 || rect.right > stage.clientWidth - 6 || rect.top < 6 || rect.bottom > stage.clientHeight - 6) continue;
        if (occupied.some(other => rect.left < other.right + 4 && rect.right > other.left - 4 &&
          rect.top < other.bottom + 4 && rect.bottom > other.top - 4)) continue;
        placed = { x: x + dx, y: y + dy, rect };
        break;
      }
      if (placed) {
        position(button, placed.x, placed.y, area.id === selectedId);
        occupied.push(placed.rect);
        if (Math.hypot(placed.x - point.x, placed.y - point.y) > 4) {
          line.setAttribute('x1', point.x);
          line.setAttribute('y1', point.y);
          line.setAttribute('x2', placed.x);
          line.setAttribute('y2', placed.y);
          line.style.display = '';
        }
      }
    }
    for (const [key, button] of buttons) {
      if (!active.has(key)) { button.remove(); buttons.delete(key); }
    }
    // Update placement after camera motion settles, avoiding worker reloads on
    // every animation frame for the legend and panel fixed to the viewport.
    if (map.isMoving()) return;
    const obstacles = [...buttons.values()].filter(button => !button.hidden).map(button => ({
      width: button.offsetWidth, height: button.offsetHeight,
      x: parseFloat(button.style.left), y: parseFloat(button.style.top),
    }));
    for (const element of [stage.querySelector('.map-legend'), stage.querySelector('.mapboxgl-ctrl-group'), document.querySelector('.profile-panel')]) {
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (rect.top >= stageRect.bottom || rect.bottom <= stageRect.top) continue;
      obstacles.push({ width: Math.ceil(rect.width), height: Math.ceil(rect.height),
        x: rect.left - stageRect.left + rect.width / 2, y: rect.top - stageRect.top + rect.height / 2 });
    }
    const features = obstacles.map(({ width, height, x, y }) => {
      const icon = `button-space-${width}-${height}`;
      if (!map.hasImage(icon)) map.addImage(icon, { width, height, data: new Uint8Array(width * height * 4) });
      const coordinate = map.unproject([x, y]);
      return {
        type: 'Feature', properties: { icon },
        geometry: { type: 'Point', coordinates: [coordinate.lng, coordinate.lat].map(value => Number(value.toFixed(7))) },
      };
    });
    const signature = JSON.stringify(features);
    if (signature !== collisionSignature) {
      collisionSignature = signature;
      map.getSource('profile-button-space').setData({ type: 'FeatureCollection', features });
    }
  }

  map.on('move', render);
  map.on('moveend', render);
  map.on('resize', render);
  map.on('movestart', () => closeChooser());
  render();
  return {
    select(id) { selectedId = id; closeChooser(); render(); },
  };
}
