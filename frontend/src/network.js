export const fallbackNetworkData = {
  meta: {
    title: 'Homelable demo network',
    source: 'local fallback',
  },
  nodes: [
    { id: 'gateway', label: 'Gateway', type: 'router', status: 'online' },
    { id: 'network-switch', label: 'Switch', type: 'switch', status: 'online', group: 'infra' },
    { id: 'dhcp-server', label: 'DHCP Server', type: 'server', status: 'online', group: 'infra' },
    { id: 'dhcp-client-1', label: 'DHCP Client 1', type: 'device', status: 'online', group: 'clients' },
    { id: 'dhcp-client-2', label: 'DHCP Client 2', type: 'device', status: 'online', group: 'clients' },
    { id: 'ad-dc-server', label: 'AD / DC Server', type: 'server', status: 'online', group: 'infra' },
    { id: 'file-server', label: 'File Server', type: 'server', status: 'online', group: 'infra' },
  ],
  links: [
    { source: 'gateway', target: 'network-switch' },
    { source: 'network-switch', target: 'dhcp-server' },
    { source: 'network-switch', target: 'dhcp-client-1' },
    { source: 'network-switch', target: 'dhcp-client-2' },
    { source: 'network-switch', target: 'ad-dc-server' },
    { source: 'network-switch', target: 'file-server' },
  ],
  groups: [
    { id: 'infra', label: 'Infrastructure', nodes: ['network-switch', 'dhcp-server', 'ad-dc-server', 'file-server'] },
    { id: 'clients', label: 'Clients', nodes: ['dhcp-client-1', 'dhcp-client-2'] },
  ],
};

export async function loadNetworkData(sourceUrl) {
  const urls = [sourceUrl, './public/data/network-demo.json'].filter(Boolean);

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        continue;
      }
      const data = await response.json();
      if (data?.nodes?.length) {
        return normalizeNetworkData(data);
      }
    } catch (error) {
      continue;
    }
  }

  return fallbackNetworkData;
}

export function normalizeNetworkData(data) {
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const links = Array.isArray(data.links) ? data.links : [];
  const groups = Array.isArray(data.groups) ? data.groups : [];

  return {
    meta: data.meta || {},
    nodes: nodes.map((node, index) => ({
      id: String(node.id ?? `node-${index}`),
      label: String(node.label ?? node.id ?? `Node ${index + 1}`),
      type: String(node.type ?? 'device'),
      status: node.status === 'online' ? 'online' : 'offline',
      group: node.group ? String(node.group) : '',
      icon: node.icon ? String(node.icon) : '',
      parent: node.parent ? String(node.parent) : '',
      role: node.role ? String(node.role) : '',
    })),
    links: links
      .map((link) => ({
        source: String(link.source),
        target: String(link.target),
        label: link.label ? String(link.label) : '',
        style: link.style ? String(link.style) : '',
      }))
      .filter((link) => link.source && link.target),
    groups: groups
      .map((group) => ({
        id: String(group.id ?? group.label ?? 'group'),
        label: String(group.label ?? group.id ?? 'Group'),
        color: group.color ? String(group.color) : '',
        nodes: Array.isArray(group.nodes) ? group.nodes.map(String) : [],
      }))
      .filter((group) => group.nodes.length > 0),
  };
}

export function summarizeNetwork(data) {
  const totalNodes = data.nodes.length;
  const onlineNodes = data.nodes.filter((node) => node.status === 'online').length;
  const offlineNodes = totalNodes - onlineNodes;
  const linkCount = data.links.length;
  const groupCount = data.groups.length;
  const maxDepth = Math.max(...Object.values(computeDepths(data)).map((depth) => depth.level), 0);

  return {
    totalNodes,
    onlineNodes,
    offlineNodes,
    linkCount,
    groupCount,
    maxDepth: Number.isFinite(maxDepth) ? maxDepth : 0,
  };
}

export function layoutNetwork(data, width, height, fitTick = 0) {
  const depths = computeDepths(data);
  const levels = new Map();
  data.nodes.forEach((node) => {
    const level = depths[node.id]?.level ?? 0;
    if (!levels.has(level)) {
      levels.set(level, []);
    }
    levels.get(level).push(node.id);
  });

  const levelKeys = [...levels.keys()].sort((a, b) => a - b);
  const horizontalPadding = 110;
  const verticalPadding = 100;
  const usableWidth = width - horizontalPadding * 2;
  const usableHeight = height - verticalPadding * 2;
  const levelStep = levelKeys.length > 1 ? usableHeight / (levelKeys.length - 1) : 0;

  const positions = new Map();
  levelKeys.forEach((level, levelIndex) => {
    const nodesAtLevel = levels.get(level);
    const y = verticalPadding + levelIndex * levelStep + (fitTick % 2 === 0 ? 0 : 4);
    const itemStep = usableWidth / Math.max(nodesAtLevel.length + 1, 2);
    nodesAtLevel.forEach((nodeId, index) => {
      const x = horizontalPadding + itemStep * (index + 1);
      positions.set(nodeId, { x, y });
    });
  });

  const positionedNodes = data.nodes.map((node) => {
    const position = positions.get(node.id) || { x: width / 2, y: height / 2 };
    return {
      ...node,
      x: position.x,
      y: position.y,
      depth: depths[node.id]?.level ?? 0,
    };
  });

  const groupBounds = data.groups.map((group) => {
    const groupNodes = positionedNodes.filter((node) => group.nodes.includes(node.id));
    if (groupNodes.length === 0) {
      return {
        ...group,
        x: width / 2 - 160,
        y: height / 2 - 120,
        width: 320,
        height: 240,
      };
    }

    const minX = Math.min(...groupNodes.map((node) => node.x));
    const maxX = Math.max(...groupNodes.map((node) => node.x));
    const minY = Math.min(...groupNodes.map((node) => node.y));
    const maxY = Math.max(...groupNodes.map((node) => node.y));
    return {
      ...group,
      x: minX - 92,
      y: minY - 58,
      width: Math.max(240, maxX - minX + 184),
      height: Math.max(170, maxY - minY + 116),
    };
  });

  const links = data.links
    .map((link) => {
      const source = positions.get(link.source);
      const target = positions.get(link.target);
      if (!source || !target) {
        return null;
      }
      return {
        ...link,
        x1: source.x,
        y1: source.y + 24,
        x2: target.x,
        y2: target.y - 24,
      };
    })
    .filter(Boolean);

  return {
    width,
    height,
    nodes: positionedNodes,
    links,
    groups: groupBounds,
  };
}

export function renderNetworkSvg(layout, camera = {}) {
  const scale = Math.max(Number(camera.scale) || 1, 0.1);
  const viewBoxX = Number.isFinite(Number(camera.x)) ? Number(camera.x) : 0;
  const viewBoxY = Number.isFinite(Number(camera.y)) ? Number(camera.y) : 0;
  const viewBoxWidth = layout.width / scale;
  const viewBoxHeight = layout.height / scale;

  const defs = `
    <defs>
      <linearGradient id="linkGlow" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.5" />
        <stop offset="100%" stop-color="#fb7185" stop-opacity="0.65" />
      </linearGradient>
      <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#0f172a" flood-opacity="0.18" />
      </filter>
      <pattern id="canvasGrid" width="28" height="28" patternUnits="userSpaceOnUse">
        <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#dbeafe" stroke-opacity="0.38" stroke-width="1" />
      </pattern>
    </defs>
  `;

  const background = `
    <rect x="0" y="0" width="${layout.width}" height="${layout.height}" rx="28" fill="url(#canvasGrid)" />
    <rect x="0" y="0" width="${layout.width}" height="${layout.height}" rx="28" fill="rgba(255,255,255,0.45)" />
  `;

  const groupRects = layout.groups
    .map(
      (group) => `
        <g opacity="0.98">
          <rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="24" class="group-box" />
          <text x="${group.x + 24}" y="${group.y + 30}" class="group-label">${escapeXml(group.label)}</text>
        </g>
      `,
    )
    .join('');

  const linkLines = layout.links
    .map(
      (link) => `
        <path
          d="M ${link.x1} ${link.y1} C ${link.x1} ${(link.y1 + link.y2) / 2}, ${link.x2} ${(link.y1 + link.y2) / 2}, ${link.x2} ${link.y2}"
          class="link-path"
          data-style="${escapeXml(link.style || 'solid')}"
        />
      `,
    )
    .join('');

  const nodeGroups = layout.nodes
    .map((node) => {
      const accent = typeAccent(node.type, node.status);
      const isServer = node.type === 'server';
      const cardWidth = isServer ? 168 : 144;
      const cardHeight = isServer ? 58 : 48;
      const cardX = -cardWidth / 2;
      const cardY = -cardHeight / 2;
      const iconRadius = isServer ? 14 : 11;
      const iconFontSize = isServer ? 14 : 12;
      const labelX = isServer ? -36 : -28;
      const labelY = isServer ? -3 : -1;
      const metaY = isServer ? 17 : 15;
      return `
        <g transform="translate(${node.x}, ${node.y})" class="node-group">
          <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="16" class="node-card" />
          <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="16" class="node-card-glow" style="fill:${accent.glow};" />
          <circle cx="${cardX + 18}" cy="0" r="${iconRadius}" fill="${accent.bg}" />
          <text x="${cardX + 18}" y="${isServer ? 5 : 4}" text-anchor="middle" class="node-icon" style="font-size:${iconFontSize}px;">${escapeXml(node.icon || accent.icon)}</text>
          <text x="${labelX}" y="${labelY}" class="node-label">${escapeXml(node.label)}</text>
          <text x="${labelX}" y="${metaY}" class="node-meta">${escapeXml(node.type)}</text>
          <circle cx="57" cy="-14" r="4" class="status-dot ${node.status === 'online' ? 'online' : 'offline'}" />
        </g>
      `;
    })
    .join('');

  return `
    <svg viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Netwerkdiagram">
      ${defs}
      <g filter="url(#softShadow)">
        ${background}
        ${groupRects}
        ${linkLines}
        ${nodeGroups}
      </g>
    </svg>
  `;
}

function computeDepths(data) {
  const incoming = new Map(data.nodes.map((node) => [node.id, 0]));
  const children = new Map(data.nodes.map((node) => [node.id, []]));

  data.links.forEach((link) => {
    if (incoming.has(link.target)) {
      incoming.set(link.target, incoming.get(link.target) + 1);
    }
    if (children.has(link.source)) {
      children.get(link.source).push(link.target);
    }
  });

  const roots = data.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  const depths = Object.fromEntries(data.nodes.map((node) => [node.id, { level: 0 }]));
  const assigned = new Set();
  const queue = [...roots];

  while (queue.length > 0) {
    const current = queue.shift();
    if (assigned.has(current)) {
      continue;
    }

    const currentDepth = depths[current]?.level ?? 0;
    const nextDepth = currentDepth + 1;
    assigned.add(current);
    (children.get(current) || []).forEach((child) => {
      if (!assigned.has(child) && nextDepth > (depths[child]?.level ?? 0)) {
        depths[child] = { level: nextDepth };
        queue.push(child);
      }
    });
  }

  data.nodes.forEach((node) => {
    if (assigned.has(node.id)) {
      return;
    }

    const parentLevels = data.links
      .filter((link) => link.target === node.id)
      .map((link) => depths[link.source]?.level ?? 0);
    depths[node.id] = {
      level: (parentLevels.length > 0 ? Math.max(...parentLevels) : 0) + 1,
    };
  });

  const maxLevel = Math.max(...Object.values(depths).map((depth) => depth.level), 0);
  if (maxLevel === 0 && data.nodes.length > 1) {
    data.nodes.forEach((node, index) => {
      depths[node.id] = { level: index };
    });
  }

  if (depths['gateway']) {
    depths['gateway'] = { level: 0 };
  }

  if (depths['network-switch']) {
    depths['network-switch'] = { level: 1 };
  }

  return depths;
}

function typeAccent(type, status) {
  const styles = {
    router: { bg: '#06b6d4', glow: 'rgba(6,182,212,0.16)', icon: 'R' },
    switch: { bg: '#10b981', glow: 'rgba(16,185,129,0.15)', icon: 'S' },
    server: { bg: '#f97316', glow: 'rgba(249,115,22,0.14)', icon: 'V' },
    app: { bg: '#38bdf8', glow: 'rgba(56,189,248,0.14)', icon: 'A' },
    camera: { bg: '#c084fc', glow: 'rgba(192,132,252,0.14)', icon: 'C' },
    device: { bg: '#64748b', glow: 'rgba(100,116,139,0.14)', icon: 'D' },
  };

  const fallback = styles.device;
  const accent = styles[type] || fallback;
  return {
    ...accent,
    bg: status === 'offline' ? '#94a3b8' : accent.bg,
    glow: status === 'offline' ? 'rgba(148,163,184,0.12)' : accent.glow,
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
