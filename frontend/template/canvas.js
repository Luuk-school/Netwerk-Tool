const NETWORK_ENDPOINT = '/api/network-graph';
const REFRESH_INTERVAL_MS = 60000;

let refreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
	const stage = document.getElementById('canvas-stage');
	if (!stage) {
		return;
	}

	loadNetworkData(stage);
	if (!refreshTimer) {
		refreshTimer = window.setInterval(() => loadNetworkData(stage), REFRESH_INTERVAL_MS);
	}
});

async function loadNetworkData(stage) {
	try {
		const response = await fetch(NETWORK_ENDPOINT, {
			cache: 'no-store',
			headers: { Accept: 'application/json' },
		});

		if (!response.ok) {
			throw new Error(`Canvas data ophalen mislukt (${response.status})`);
		}

		const payload = await response.json();
		renderCanvas(stage, normalizeGraphData(payload));
	} catch (error) {
		console.error(error);
		renderEmptyState(stage, 'Live data laden mislukt. Controleer de API-verbinding.');
	}
}

function normalizeGraphData(data) {
	const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
	const rawEdges = Array.isArray(data?.edges) ? data.edges : Array.isArray(data?.links) ? data.links.map(([source, target]) => ({ source, target, type: 'same subnet' })) : [];
	const width = Number(data?.width) || 1000;
	const height = Number(data?.height) || 620;
	const nodes = rawNodes.map((node) => ({
		id: node.id,
		name: node.name || node.label || node.id,
		ip: node.ip || '',
		subnet: node.subnet || '',
		network_id: node.network_id || node.networkId || '',
		gateway: node.gateway || '',
		description: node.description || '',
	})).filter((node) => Boolean(node.id));
	const edges = rawEdges.map((edge) => ({
		source: edge.source,
		target: edge.target,
		type: edge.type || edge.relation || 'same subnet',
	})).filter((edge) => Boolean(edge.source && edge.target));

	return {
		width,
		height,
		nodes,
		edges,
	};
}

function renderCanvas(stage, data) {
	stage.innerHTML = '';
	stage.classList.add('canvas-stage--interactive');

	if (!data.nodes.length) {
		renderEmptyState(stage, 'Geen netwerkdata beschikbaar.');
		return;
	}

	const nodes = applyLayout(data.nodes || [], data.width, data.height);
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.classList.add('network-lines');
	svg.setAttribute('viewBox', `0 0 ${data.width} ${data.height}`);
	svg.setAttribute('aria-hidden', 'true');

	const nodeById = new Map(nodes.map((node) => [node.id, node]));
	data.edges.forEach((edge) => {
		const sourceId = edge.source;
		const targetId = edge.target;
		const source = nodeById.get(sourceId);
		const target = nodeById.get(targetId);
		if (!source || !target) {
			return;
		}

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', buildPath(source, target, data));
		path.dataset.edgeType = edge.type || 'same subnet';
		svg.appendChild(path);
	});

	stage.appendChild(svg);

	nodes.forEach((node) => {
		stage.appendChild(createNodeElement(node));
	});
}

function renderEmptyState(stage, message) {
	stage.innerHTML = '';
	stage.classList.add('canvas-stage--interactive');

	const emptyState = document.createElement('div');
	emptyState.className = 'canvas-empty-state';
	emptyState.textContent = message;

	stage.appendChild(emptyState);
}

function applyLayout(nodes, width, height) {
	if (!Array.isArray(nodes) || nodes.length === 0) {
		return [];
	}

	const grouped = new Map();
	nodes.forEach((node) => {
		const key = node.subnet || node.network_id || 'ungrouped';
		if (!grouped.has(key)) {
			grouped.set(key, []);
		}
		grouped.get(key).push(node);
	});

	const groups = [...grouped.entries()];
	const columns = Math.max(1, Math.ceil(Math.sqrt(groups.length)));
	const rows = Math.max(1, Math.ceil(groups.length / columns));
	const cellWidth = 100 / columns;
	const cellHeight = 100 / rows;

	return groups.flatMap(([groupKey, groupNodes], groupIndex) => {
		const column = groupIndex % columns;
		const row = Math.floor(groupIndex / columns);
		const centerX = column * cellWidth + cellWidth / 2;
		const centerY = row * cellHeight + cellHeight / 2;
		const spread = Math.min(20, cellWidth * 0.35);
		const verticalSpread = Math.min(12, cellHeight * 0.24);

		return groupNodes.map((node, index) => {
			const offsetIndex = index - (groupNodes.length - 1) / 2;
			const x = clamp(centerX + offsetIndex * spread, 7, 93);
			const y = clamp(centerY + (groupNodes.length > 3 ? (index % 2 === 0 ? -verticalSpread : verticalSpread) : 0), 8, 92);

			return {
				...node,
				group: groupKey,
				x,
				y,
				width,
				height,
			};
		});
	});
}

function buildPath(source, target, data) {
	const startX = percentageToPoint(source.x, data.width);
	const startY = percentageToPoint(source.y, data.height);
	const endX = percentageToPoint(target.x, data.width);
	const endY = percentageToPoint(target.y, data.height);
	const midX = (startX + endX) / 2;
	const controlOffset = Math.max(Math.abs(endX - startX) * 0.2, 60);

	return `M${startX} ${startY} C${midX - controlOffset} ${startY}, ${midX + controlOffset} ${endY}, ${endX} ${endY}`;
}

function createNodeElement(node) {
	const nodeElement = document.createElement('div');
	nodeElement.className = 'node node-accent';
	nodeElement.style.left = `${node.x}%`;
	nodeElement.style.top = `${node.y}%`;
	nodeElement.dataset.subnet = node.subnet || '';

	const dot = document.createElement('span');
	dot.className = 'node-dot';

	const title = document.createElement('strong');
	title.textContent = node.name || node.label || node.id;

	const subtitle = document.createElement('small');
	subtitle.textContent = [node.ip, node.subnet].filter(Boolean).join(' • ') || 'Geen netwerkdata';

	nodeElement.append(dot, title, subtitle);
	return nodeElement;
}

function percentageToPoint(value, total) {
	return (value / 100) * total;
}

function clamp(value, minimum, maximum) {
	return Math.max(minimum, Math.min(maximum, value));
}