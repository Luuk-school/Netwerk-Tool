from __future__ import annotations

import importlib.util
import ipaddress
import json
import threading
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from itertools import combinations
from pathlib import Path
from typing import Any, Callable


PROJECT_ROOT = Path(__file__).resolve().parent.parent
API_LAYER_PATH = PROJECT_ROOT / "API communcation" / "apiRequestCloudstack.py"
DEFAULT_INTERVAL_SECONDS = 60


def _load_api_layer():
	spec = importlib.util.spec_from_file_location("apiRequestCloudstack", API_LAYER_PATH)
	if spec is None or spec.loader is None:
		raise ImportError(f"API layer kon niet worden geladen vanaf {API_LAYER_PATH}")

	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)
	return module


def _as_dict(value):
	return value if isinstance(value, dict) else {}


def _first_non_empty(*values, default=""):
	for value in values:
		if value is None:
			continue
		text = str(value).strip()
		if text:
			return text
	return default


def _safe_ipv4_network(ip_value, netmask_value):
	ip_text = _first_non_empty(ip_value)
	netmask_text = _first_non_empty(netmask_value)
	if not ip_text or not netmask_text:
		return ""

	try:
		network = ipaddress.IPv4Network(f"{ip_text}/{netmask_text}", strict=False)
		return str(network)
	except (ipaddress.AddressValueError, ipaddress.NetmaskValueError, ValueError):
		return ""


def _extract_primary_nic(nics):
	if not isinstance(nics, list):
		return {}

	for nic in nics:
		if isinstance(nic, dict) and _first_non_empty(nic.get("ipaddress")):
			return nic

	for nic in nics:
		if isinstance(nic, dict):
			return nic

	return {}


def _normalize_collection(payload, keys):
	if not isinstance(payload, dict):
		return []

	current = payload
	if len(current) == 1:
		sole_value = next(iter(current.values()))
		if isinstance(sole_value, dict):
			current = sole_value

	for key in keys:
		value = current.get(key)
		if isinstance(value, list):
			return [item for item in value if isinstance(item, dict)]

	return []


@dataclass(frozen=True)
class NetworkNode:
	id: str
	name: str
	ip: str = ""
	gateway: str = ""
	subnet: str = ""
	network_id: str = ""
	network_name: str = ""


@dataclass(frozen=True)
class NetworkEdge:
	source: str
	target: str
	type: str
	relations: tuple[str, ...] = field(default_factory=tuple)
	network_id: str = ""
	subnet: str = ""


@dataclass(frozen=True)
class NetworkSnapshot:
	generated_at: str
	interval_seconds: int
	nodes: list[dict[str, Any]]
	edges: list[dict[str, Any]]
	status: str = "ok"
	errors: list[str] = field(default_factory=list)

	def to_dict(self):
		return asdict(self)


class NetworkGraphBuilder:
	def __init__(self, api_layer=None, config_path=None, key_path=None, timeout=30):
		self.api_layer = api_layer or _load_api_layer()
		self.config_path = config_path or getattr(self.api_layer, "CONFIG_PATH", None)
		self.key_path = key_path or getattr(self.api_layer, "KEY_PATH", None)
		self.timeout = timeout

	def fetch_vms(self):
		if not hasattr(self.api_layer, "list_virtual_machines"):
			return []

		return self.api_layer.list_virtual_machines(
			config_path=self.config_path,
			key_path=self.key_path,
			timeout=self.timeout,
		)

	def fetch_nics(self, vm_id):
		if not hasattr(self.api_layer, "list_nics"):
			return []

		return self.api_layer.list_nics(
			vm_id,
			config_path=self.config_path,
			key_path=self.key_path,
			timeout=self.timeout,
		)

	def fetch_networks(self):
		if not hasattr(self.api_layer, "list_networks"):
			return []

		return self.api_layer.list_networks(
			config_path=self.config_path,
			key_path=self.key_path,
			timeout=self.timeout,
		)

	def build_snapshot(self):
		errors = []
		nodes = []
		edges = []

		try:
			vm_rows = _normalize_collection({"virtualmachine": self.fetch_vms()}, ("virtualmachine", "virtualmachines"))
		except Exception as exc:
			return NetworkSnapshot(
				generated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
				interval_seconds=DEFAULT_INTERVAL_SECONDS,
				nodes=[],
				edges=[],
				status="error",
				errors=[f"VM data ophalen mislukt: {exc}"],
			)

		try:
			network_rows = _normalize_collection({"network": self.fetch_networks()}, ("network", "networks"))
		except Exception as exc:
			errors.append(f"Network data ophalen mislukt: {exc}")
			network_rows = []

		network_by_id = {}
		for network in network_rows:
			network_id = _first_non_empty(network.get("id"))
			if not network_id:
				continue
			network_by_id[network_id] = network

		group_by_network = defaultdict(set)
		group_by_subnet = defaultdict(set)

		for vm in vm_rows:
			vm_id = _first_non_empty(vm.get("id"))
			if not vm_id:
				continue

			vm_name = _first_non_empty(vm.get("name"), default=vm_id)

			try:
				nic_rows = _normalize_collection({"nic": self.fetch_nics(vm_id)}, ("nic", "nics"))
			except Exception as exc:
				errors.append(f"NIC data ophalen mislukt voor {vm_id}: {exc}")
				nic_rows = []

			primary_nic = _extract_primary_nic(nic_rows)
			network_id = _first_non_empty(primary_nic.get("networkid"))
			network_data = _as_dict(network_by_id.get(network_id))

			ip_value = _first_non_empty(primary_nic.get("ipaddress"))
			gateway_value = _first_non_empty(primary_nic.get("gateway"), network_data.get("gateway"))
			subnet_value = _first_non_empty(network_data.get("cidr"))
			if not subnet_value:
				subnet_value = _safe_ipv4_network(ip_value, primary_nic.get("netmask"))

			node = NetworkNode(
				id=vm_id,
				name=vm_name,
				ip=ip_value,
				gateway=gateway_value,
				subnet=subnet_value,
				network_id=network_id,
				network_name=_first_non_empty(network_data.get("name"), network_id),
			)

			if network_id:
				group_by_network[network_id].add(vm_id)
			if subnet_value:
				group_by_subnet[subnet_value].add(vm_id)

			nodes.append(asdict(node))

		edge_map = {}
		self._register_group_edges(edge_map, group_by_network, "same network")
		self._register_group_edges(edge_map, group_by_subnet, "same subnet")

		for pair_key, relation_set in edge_map.items():
			source, target = pair_key.split("::", 1)
			relations = tuple(sorted(relation_set))
			edge_type = relations[0] if len(relations) == 1 else " + ".join(relations)
			edges.append(
				asdict(
					NetworkEdge(
						source=source,
						target=target,
						type=edge_type,
						relations=relations,
					)
				)
			)

		status = "ok" if not errors else "degraded"
		return NetworkSnapshot(
			generated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
			interval_seconds=DEFAULT_INTERVAL_SECONDS,
			nodes=nodes,
			edges=edges,
			status=status,
			errors=errors,
		)

	@staticmethod
	def _register_group_edges(edge_map, grouped_items, relation_label):
		for vm_ids in grouped_items.values():
			vm_list = sorted(set(vm_ids))
			if len(vm_list) < 2:
				continue

			for source, target in combinations(vm_list, 2):
				pair_key = f"{source}::{target}"
				edge_map.setdefault(pair_key, set()).add(relation_label)


class NetworkVisualizerCore:
	def __init__(self, builder=None, interval_seconds=DEFAULT_INTERVAL_SECONDS):
		self.builder = builder or NetworkGraphBuilder()
		self.interval_seconds = int(interval_seconds or DEFAULT_INTERVAL_SECONDS)
		self._lock = threading.RLock()
		self._stop_event = threading.Event()
		self._thread = None
		self._snapshot = NetworkSnapshot(
			generated_at="",
			interval_seconds=self.interval_seconds,
			nodes=[],
			edges=[],
			status="idle",
			errors=[],
		)

	def start(self):
		if self._thread and self._thread.is_alive():
			return self

		self._stop_event.clear()
		self.refresh()
		self._thread = threading.Thread(target=self._run_loop, name="network-visualizer-core", daemon=True)
		self._thread.start()
		return self

	def stop(self):
		self._stop_event.set()

	def _run_loop(self):
		while not self._stop_event.is_set():
			self.refresh()
			if self._stop_event.wait(self.interval_seconds):
				break

	def refresh(self):
		snapshot = self.builder.build_snapshot()
		with self._lock:
			self._snapshot = snapshot
		return snapshot.to_dict()

	def get_snapshot(self):
		with self._lock:
			return self._snapshot.to_dict()


_CORE_RUNTIME = None


def create_network_visualizer_core(interval_seconds=DEFAULT_INTERVAL_SECONDS):
	return NetworkVisualizerCore(interval_seconds=interval_seconds)


def get_network_visualizer_core(interval_seconds=DEFAULT_INTERVAL_SECONDS):
	global _CORE_RUNTIME
	if _CORE_RUNTIME is None:
		_CORE_RUNTIME = create_network_visualizer_core(interval_seconds=interval_seconds)
	return _CORE_RUNTIME


def build_network_graph_snapshot():
	return get_network_visualizer_core().refresh()
