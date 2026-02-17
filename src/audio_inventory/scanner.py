"""Scan macOS audio plugin directories and extract metadata."""

from __future__ import annotations

import json
import logging
import re
import subprocess
from pathlib import Path

from audio_inventory.models import ScannedPlugin

log = logging.getLogger(__name__)

# Standard macOS plugin directories
SCAN_ROOTS = [
    Path("/Library/Audio/Plug-Ins"),
    Path.home() / "Library" / "Audio" / "Plug-Ins",
]

# Map format subdirectory names to our internal format labels
SUBDIR_MAP = {
    "VST": ("vst2", ".vst"),
    "VST3": ("vst3", ".vst3"),
    "Components": ("au", ".component"),
    "CLAP": ("clap", ".clap"),
}


def scan_all(roots: list[Path] | None = None) -> list[ScannedPlugin]:
    """Scan all plugin directories and return discovered plugins."""
    roots = roots or SCAN_ROOTS
    plugins: list[ScannedPlugin] = []

    for root in roots:
        if not root.is_dir():
            log.debug("Skipping non-existent root: %s", root)
            continue

        for subdir_name, (fmt, ext) in SUBDIR_MAP.items():
            subdir = root / subdir_name
            if not subdir.is_dir():
                continue

            for entry in _iter_bundles(subdir, ext):
                plugin = _scan_bundle(entry, fmt)
                if plugin:
                    plugins.append(plugin)

    log.info("Scanned %d plugin bundles", len(plugins))
    return plugins


def _iter_bundles(directory: Path, ext: str) -> list[Path]:
    """List plugin bundles in a directory, recursing one level for vendor subdirs."""
    bundles: list[Path] = []

    try:
        entries = sorted(directory.iterdir())
    except PermissionError:
        log.warning("Permission denied: %s", directory)
        return bundles

    for entry in entries:
        if entry.suffix == ext and entry.is_dir():
            bundles.append(entry)
        elif entry.is_dir() and entry.suffix == "":
            # Vendor subdirectory — recurse one level
            try:
                for sub_entry in sorted(entry.iterdir()):
                    if sub_entry.suffix == ext and sub_entry.is_dir():
                        bundles.append(sub_entry)
            except PermissionError:
                log.warning("Permission denied: %s", entry)

    return bundles


def _scan_bundle(bundle_path: Path, fmt: str) -> ScannedPlugin | None:
    """Extract metadata from a single plugin bundle."""
    plist_path = bundle_path / "Contents" / "Info.plist"
    if not plist_path.exists():
        log.debug("No Info.plist in %s", bundle_path)
        return None

    plist = _parse_plist(plist_path)
    if plist is None:
        return None

    # Extract basic info
    name = (
        plist.get("CFBundleDisplayName")
        or plist.get("CFBundleName")
        or bundle_path.stem
    )
    bundle_id = plist.get("CFBundleIdentifier")
    version = plist.get("CFBundleVersion") or plist.get("CFBundleShortVersionString")
    copyright_str = plist.get("NSHumanReadableCopyright") or plist.get(
        "CFBundleGetInfoString"
    )
    min_macos = plist.get("LSMinimumSystemVersion")

    # Extract vendor
    vendor = _extract_vendor(plist, fmt)

    # AU-specific metadata
    au_type = au_subtype = au_manufacturer = None
    if fmt == "au":
        au_components = plist.get("AudioComponents", [])
        if au_components:
            ac = au_components[0]
            au_type = ac.get("type")
            au_subtype = ac.get("subtype")
            au_manufacturer = ac.get("manufacturer")
            # AU name often has "Vendor: Plugin" format — better name source
            au_name = ac.get("name", "")
            if ": " in au_name:
                parts = au_name.split(": ", 1)
                if not vendor:
                    vendor = parts[0].strip()
                # Use the AU component name if it's more specific
                if parts[1].strip():
                    name = parts[1].strip()

    # Parse moduleinfo.json for VST3 plugins
    moduleinfo = _parse_moduleinfo(bundle_path)
    if moduleinfo:
        factory = moduleinfo.get("Factory Info", {})
        if not vendor and factory.get("Vendor"):
            vendor = factory["Vendor"]

    # Normalize vendor name
    vendor = _normalize_vendor(vendor)

    return ScannedPlugin(
        name=name,
        path=bundle_path,
        format=fmt,
        bundle_id=bundle_id,
        version=version,
        vendor=vendor,
        copyright=copyright_str,
        au_type=au_type,
        au_subtype=au_subtype,
        au_manufacturer=au_manufacturer,
        min_macos_version=min_macos,
        moduleinfo=moduleinfo,
    )


def _parse_plist(plist_path: Path) -> dict | None:
    """Parse a plist file to a dict using macOS plutil."""
    try:
        result = subprocess.run(
            ["plutil", "-convert", "json", "-o", "-", str(plist_path)],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            log.debug("plutil failed for %s: %s", plist_path, result.stderr)
            return None
        return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as e:
        log.debug("Failed to parse plist %s: %s", plist_path, e)
        return None


def _parse_moduleinfo(bundle_path: Path) -> dict | None:
    """Parse moduleinfo.json from a VST3 bundle if present."""
    for rel_path in ("Contents/moduleinfo.json", "Contents/Resources/moduleinfo.json"):
        path = bundle_path / rel_path
        if path.exists():
            try:
                return json.loads(path.read_text())
            except (json.JSONDecodeError, OSError) as e:
                log.debug("Failed to parse moduleinfo %s: %s", path, e)
    return None


def _extract_vendor(plist: dict, fmt: str) -> str | None:
    """Try to extract vendor name from plist metadata."""
    # 1. For AU: AudioComponents name has "Vendor: Plugin" pattern
    if fmt == "au":
        au_components = plist.get("AudioComponents", [])
        if au_components:
            au_name = au_components[0].get("name", "")
            if ": " in au_name:
                return au_name.split(": ", 1)[0].strip()

    # 2. Parse bundle identifier for domain-based vendor
    bundle_id = plist.get("CFBundleIdentifier", "")
    vendor = _vendor_from_bundle_id(bundle_id)
    if vendor:
        return vendor

    # 3. Parse copyright string
    copyright_str = plist.get("NSHumanReadableCopyright") or plist.get(
        "CFBundleGetInfoString", ""
    )
    if copyright_str:
        vendor = _vendor_from_copyright(copyright_str)
        if vendor:
            return vendor

    return None


# Known bundle ID prefixes -> vendor names
_BUNDLE_ID_VENDORS = {
    "com.native-instruments": "Native Instruments",
    "com.arturia": "Arturia",
    "com.u-he": "u-he",
    "net.uvi": "UVI",
    "com.izotope": "iZotope",
    "org.surge-synth-team": "Surge Synth Team",
    "com.newfangledaudio": "Newfangled Audio",
    "com.soniccharge": "Sonic Charge",
    "com.meldaproduction": "MeldaProduction",
    "com.eventide": "Eventide",
    "com.xlnaudio": "XLN Audio",
    "com.deviousmachines": "Devious Machines",
    "com.synapse-audio": "Synapse Audio",
    "com.valhalla": "Valhalla DSP",
    "com.fabfilter": "FabFilter",
    "com.soundtoys": "Soundtoys",
    "com.plugin-alliance": "Plugin Alliance",
    "com.waves": "Waves",
    "com.steinberg": "Steinberg",
    "com.apple": "Apple",
    "com.output": "Output",
    "com.spectrasonics": "Spectrasonics",
    "com.eiosis": "Eiosis",
    "com.polyversemusic": "Polyverse",
    "com.kilohearts": "Kilohearts",
    "com.goodhertz": "Goodhertz",
    "com.tokyo-dawn": "Tokyo Dawn Labs",
    "com.tokyodawn": "Tokyo Dawn Labs",
    "com.audiothing": "AudioThing",
    "com.cableguys": "Cableguys",
    "com.sonnox": "Sonnox",
    "com.softube": "Softube",
    "com.brainworx": "Brainworx",
    "com.ssl": "Solid State Logic",
    "com.uaudio": "Universal Audio",
    "de.ableton": "Ableton",
    "com.auv3": None,  # Generic, skip
}


def _vendor_from_bundle_id(bundle_id: str) -> str | None:
    """Extract vendor from a reverse-DNS bundle identifier."""
    if not bundle_id:
        return None

    bid = bundle_id.lower()
    for prefix, vendor in _BUNDLE_ID_VENDORS.items():
        if bid.startswith(prefix.lower()):
            return vendor

    # Generic extraction: com.vendorname.pluginname -> vendorname
    parts = bid.split(".")
    if len(parts) >= 3 and parts[0] in ("com", "net", "org", "de", "io", "uk"):
        candidate = parts[1]
        # Skip very short or generic names
        if len(candidate) > 2 and candidate not in ("apple", "audio", "plugin"):
            return candidate.replace("-", " ").title()

    return None


# Vendor name normalization: maps various spellings to canonical names
_VENDOR_ALIASES: dict[str, str] = {
    "native instruments gmbh": "Native Instruments",
    "native instruments": "Native Instruments",
    "heckmann audio gmbh": "u-he",
    "u-he": "u-he",
    "u he": "u-he",
    "surge synth team": "Surge Synth Team",
    "surge": "Surge Synth Team",
    "arturia": "Arturia",
    "izotope": "iZotope",
    "izotope, inc": "iZotope",
    "izotope, inc.": "iZotope",
    "uvi": "UVI",
    "uvisoundsource": "UVI",
    "newfangled audio": "Newfangled Audio",
    "eventide": "Eventide",
    "sonic charge": "Sonic Charge",
    "meldaproduction": "MeldaProduction",
    "xln audio": "XLN Audio",
    "devious machines": "Devious Machines",
    "synapse audio": "Synapse Audio",
    "birdbird": "BirdBird",
    "fabfilter": "FabFilter",
    "soundtoys": "Soundtoys",
    "plugin alliance": "Plugin Alliance",
    "waves": "Waves",
    "steinberg": "Steinberg",
    "apple": "Apple",
    "valhalla dsp": "Valhalla DSP",
    "goodhertz": "Goodhertz",
    "kilohearts": "Kilohearts",
    "softube": "Softube",
    "sonnox": "Sonnox",
    "cableguys": "Cableguys",
    "universal audio": "Universal Audio",
    "solid state logic": "Solid State Logic",
    "brainworx": "Brainworx",
    "tokyo dawn labs": "Tokyo Dawn Labs",
    "cherry audio": "Cherry Audio",
    "baby audio": "BABY Audio",
    "lunacy audio": "Lunacy Audio",
    "plugin boutique": "Plugin Boutique",
    "klevgrand": "Klevgrand",
    "zynaptiq": "Zynaptiq",
    "soundmorph": "SoundMorph",
    "dawesome": "Dawesome",
}


def _normalize_vendor(vendor: str | None) -> str | None:
    """Normalize vendor name to a canonical form."""
    if not vendor:
        return None

    cleaned = re.sub(
        r"\s*(?:,?\s*(?:Inc|LLC|Ltd|GmbH|Co|Corp|S\.?A\.?S?|B\.?V\.?|Pty))\.?\s*$",
        "",
        vendor,
        flags=re.IGNORECASE,
    ).strip()

    key = cleaned.lower()
    if key in _VENDOR_ALIASES:
        return _VENDOR_ALIASES[key]

    # Also try the original (before suffix stripping)
    key_orig = vendor.lower().strip()
    if key_orig in _VENDOR_ALIASES:
        return _VENDOR_ALIASES[key_orig]

    # Return the cleaned version with original casing
    return cleaned if cleaned else vendor


def _vendor_from_copyright(copyright_str: str) -> str | None:
    """Try to extract vendor name from a copyright string.

    Examples:
        "Copyright 2025 UVI" -> "UVI"
        "Diva 1.4.8 (c) 2011-2024 Heckmann Audio GmbH u-he.com" -> "Heckmann Audio GmbH"
    """
    # Pattern: (c) or Copyright YEAR(s) COMPANY_NAME
    m = re.search(
        r"(?:copyright|\(c\)|©)\s*\d{4}(?:\s*[-–]\s*\d{4})?\s+(.+?)(?:\s+all\s+rights|$)",
        copyright_str,
        re.IGNORECASE,
    )
    if m:
        vendor = m.group(1).strip().rstrip(".")
        # Clean up trailing URLs or junk
        vendor = re.sub(r"\s+https?://\S+", "", vendor)
        vendor = re.sub(r"\s+\S+\.\w{2,3}$", "", vendor)
        if len(vendor) > 1:
            return vendor

    return None
