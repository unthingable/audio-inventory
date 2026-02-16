"""Data models for the audio plugin inventory."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ScannedPlugin:
    """Raw data from scanning a single plugin bundle on disk."""

    name: str
    path: Path
    format: str  # vst2, vst3, au, clap
    bundle_id: str | None = None
    version: str | None = None
    vendor: str | None = None
    copyright: str | None = None
    au_type: str | None = None  # aumu, aufx, aumi
    au_subtype: str | None = None  # 4-char code
    au_manufacturer: str | None = None  # 4-char code
    min_macos_version: str | None = None
    moduleinfo: dict | None = None  # parsed moduleinfo.json


@dataclass
class Installation:
    """A specific installed plugin file (one format of a product)."""

    id: int | None = None
    product_id: int | None = None
    format: str = ""
    path: str = ""
    bundle_id: str | None = None
    version: str | None = None
    au_type: str | None = None
    au_subtype: str | None = None
    au_manufacturer: str | None = None
    vendor_from_plist: str | None = None
    copyright: str | None = None
    min_macos_version: str | None = None
    first_seen: str | None = None
    last_seen: str | None = None
    is_present: bool = True


@dataclass
class License:
    """License/registration info for a product."""

    id: int | None = None
    product_id: int | None = None
    serial_key: str | None = None
    license_file_path: str | None = None
    purchase_date: str | None = None
    vendor_url: str | None = None
    license_manager: str | None = None
    email: str | None = None
    source: str | None = None
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class Bundle:
    """A suite/bundle of plugins purchased together."""

    id: int | None = None
    name: str = ""
    vendor: str | None = None
    serial_key: str | None = None
    purchase_date: str | None = None
    source: str | None = None
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class Account:
    """A vendor account where you authenticate and manage purchases."""

    id: int | None = None
    name: str = ""
    email: str | None = None
    vendor_url: str | None = None
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class LicenseManager:
    """The activation software (iLok, Native Access, etc.)."""

    id: int | None = None
    name: str = ""
    url: str | None = None
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class Source:
    """A purchase source / store (Plugin Boutique, Splice, etc.)."""

    id: int | None = None
    name: str = ""
    email: str | None = None
    url: str | None = None
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class Product:
    """A logical audio product (deduplicated across formats)."""

    id: int | None = None
    name: str = ""
    vendor: str | None = None
    category: str | None = None
    notes: str | None = None
    status: str = "unknown"  # unknown, licensed, demo, free, subscription, bundled
    bundle_id: int | None = None
    account_id: int | None = None
    license_manager_id: int | None = None
    source_id: int | None = None
    installed: bool = False
    created_at: str | None = None
    updated_at: str | None = None
    installations: list[Installation] = field(default_factory=list)
    licenses: list[License] = field(default_factory=list)

    @property
    def formats(self) -> list[str]:
        return sorted({i.format for i in self.installations if i.is_present})

    @property
    def has_license(self) -> bool:
        return bool(self.licenses)

    @property
    def has_serial_key(self) -> bool:
        return any(lic.serial_key for lic in self.licenses)

    @property
    def current_version(self) -> str | None:
        """Best available version string across installations."""
        versions = [i.version for i in self.installations if i.version and i.is_present]
        return versions[0] if versions else None


@dataclass
class ScanResult:
    """Summary of a scan operation."""

    scan_id: int | None = None
    timestamp: str | None = None
    plugins_found: int = 0
    products_found: int = 0
    new_plugins: int = 0
    removed_plugins: int = 0
