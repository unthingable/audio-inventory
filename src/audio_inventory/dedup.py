"""Cross-format deduplication for audio plugins.

Groups the same logical product across different plugin formats
(e.g., Diva.vst3, Diva.component, Diva.clap -> one "Diva" product).
"""

from __future__ import annotations

import re
from collections import defaultdict

from audio_inventory.models import ScannedPlugin

# Suffixes to strip when normalizing plugin names
_NAME_NOISE = re.compile(
    r"\s*\b(vst3?|au|clap|aax|component|plug-?in|x64|arm64|universal)\b\s*",
    re.IGNORECASE,
)

# Format-specific suffixes sometimes appended to bundle IDs
_BUNDLE_ID_SUFFIXES = (
    ".vst3",
    ".vst",
    ".component",
    ".clap",
    ".au",
    ".VST3",
    ".VST",
    ".AU",
    ".CLAP",
)


def deduplicate(plugins: list[ScannedPlugin]) -> list[list[ScannedPlugin]]:
    """Group scanned plugins into product clusters.

    Returns a list of groups, where each group is a list of ScannedPlugin
    instances that represent the same logical product in different formats.
    """
    # Phase 1: group by bundle_id base
    by_bid: dict[str, list[ScannedPlugin]] = defaultdict(list)
    no_bid: list[ScannedPlugin] = []

    for plugin in plugins:
        key = _bundle_id_key(plugin.bundle_id)
        if key:
            by_bid[key].append(plugin)
        else:
            no_bid.append(plugin)

    # Phase 2: for plugins without a usable bundle ID, group by name+vendor
    by_name: dict[str, list[ScannedPlugin]] = defaultdict(list)
    for plugin in no_bid:
        key = _name_vendor_key(plugin)
        by_name[key].append(plugin)

    # Phase 3: merge name-based groups into bundle-id groups where possible
    groups: list[list[ScannedPlugin]] = list(by_bid.values())

    # Build a lookup from name key -> existing group index for merging
    name_to_group_idx: dict[str, int] = {}
    for idx, group in enumerate(groups):
        for p in group:
            nk = _name_vendor_key(p)
            name_to_group_idx[nk] = idx

    for nk, name_group in by_name.items():
        if nk in name_to_group_idx:
            # Merge into existing bundle-id group
            groups[name_to_group_idx[nk]].extend(name_group)
        else:
            groups.append(name_group)

    return groups


def pick_best_name(group: list[ScannedPlugin]) -> str:
    """Pick the best display name from a group of plugins.

    Prefer: AU name (most human-readable) > VST3 name > any name.
    """
    by_format = {p.format: p for p in group}

    # AU names parsed from AudioComponents tend to be cleanest
    if "au" in by_format:
        return by_format["au"].name

    # VST3 next
    if "vst3" in by_format:
        return by_format["vst3"].name

    return group[0].name


def pick_best_vendor(group: list[ScannedPlugin]) -> str | None:
    """Pick the best vendor from a group, preferring AU > moduleinfo > bundle ID."""
    vendors = [p.vendor for p in group if p.vendor]
    if not vendors:
        return None

    # Prefer longer vendor names (more specific), deduplicated
    vendors.sort(key=lambda v: (-len(v), v))
    return vendors[0]


def infer_category(group: list[ScannedPlugin]) -> str | None:
    """Infer product category from AU type codes or moduleinfo."""
    for p in group:
        if p.au_type:
            return _au_type_to_category(p.au_type)

    # Check moduleinfo sub-categories
    for p in group:
        if p.moduleinfo:
            classes = p.moduleinfo.get("Classes", [])
            for cls in classes:
                subcats = cls.get("Sub Categories", [])
                for sc in subcats:
                    sc_lower = sc.lower()
                    if "instrument" in sc_lower or "synth" in sc_lower:
                        return "instrument"
                    if "fx" in sc_lower or "effect" in sc_lower:
                        return "effect"

    return None


def _bundle_id_key(bundle_id: str | None) -> str | None:
    """Normalize a bundle ID into a dedup key by stripping format suffixes."""
    if not bundle_id:
        return None

    key = bundle_id
    for suffix in _BUNDLE_ID_SUFFIXES:
        key = key.removesuffix(suffix)

    key = key.lower().strip(".")
    if not key or key.count(".") < 1:
        return None

    return key


def _name_vendor_key(plugin: ScannedPlugin) -> str:
    """Create a dedup key from normalized name + vendor."""
    name = _normalize_name(plugin.name)
    vendor = (plugin.vendor or "").lower().strip()
    return f"{vendor}::{name}"


def _normalize_name(name: str) -> str:
    """Normalize a plugin name for comparison."""
    n = name.strip()
    n = _NAME_NOISE.sub(" ", n)
    n = re.sub(r"\s+", " ", n).strip().lower()
    return n


_AU_TYPE_MAP = {
    "aumu": "instrument",
    "aumi": "instrument",  # MIDI-controlled instrument
    "aumf": "instrument",  # music effect (instrument-like)
    "aufx": "effect",
    "aufc": "effect",  # format converter
    "aumx": "effect",  # mixer
    "aupn": "effect",  # panner
    "auol": "effect",  # offline effect
    "augn": "generator",
}


def _au_type_to_category(au_type: str) -> str | None:
    return _AU_TYPE_MAP.get(au_type)
