"""JSON file-backed data layer for audio plugin inventory."""

from __future__ import annotations

import contextlib
import copy
import json
import os
import shutil
import tempfile
from collections.abc import Generator
from datetime import datetime, timezone
from pathlib import Path

from audio_inventory.models import (
    Account,
    Bundle,
    Installation,
    License,
    LicenseManager,
    Product,
    ScanResult,
    Source,
)

DEFAULT_DATA_DIR = Path("data")
DEFAULT_DATA_PATH = DEFAULT_DATA_DIR / "inventory.json"
MAX_BACKUPS = 10

_EMPTY_DATA = {
    "version": 6,
    "counters": {
        "product_id": 0,
        "installation_id": 0,
        "license_id": 0,
        "scan_id": 0,
        "bundle_id": 0,
        "account_id": 0,
        "license_manager_id": 0,
        "source_id": 0,
    },
    "products": {},
    "installations": {},
    "licenses": {},
    "bundles": {},
    "accounts": {},
    "license_managers": {},
    "sources": {},
    "scans": [],
}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


class Database:
    """JSON file-backed store for plugin inventory."""

    def __init__(self, data_path: Path = DEFAULT_DATA_PATH):
        self.data_path = data_path
        self.data_path.parent.mkdir(parents=True, exist_ok=True)
        self._batch = 0
        self._load()

    def _load(self) -> None:
        if self.data_path.exists():
            self._data = json.loads(self.data_path.read_text())
            self._migrate()
        else:
            self._data = copy.deepcopy(_EMPTY_DATA)

    def _migrate(self) -> None:
        """Migrate data from older schema versions."""
        version = self._data.get("version", 1)
        if version < 2:
            # v1 → v2: Add packages collection and counter
            self._data.setdefault("packages", {})
            self._data["counters"].setdefault("package_id", 0)
            for p in self._data["products"].values():
                p.setdefault("package_id", None)
            for lic in self._data["licenses"].values():
                lic.setdefault("email", None)
                lic.setdefault("source", None)
            self._data["version"] = 2
            version = 2

        if version < 3:
            # v2 → v3: Split packages into bundles + accounts + license_managers
            now = _now()
            old_packages = self._data.get("packages", {})

            # Initialize new collections
            self._data["bundles"] = {}
            self._data["accounts"] = {}
            self._data["license_managers"] = {}
            self._data["counters"].setdefault("bundle_id", 0)
            self._data["counters"].setdefault("account_id", 0)
            self._data["counters"].setdefault("license_manager_id", 0)

            # Dedup maps for accounts (by email) and license managers (by name)
            account_by_email: dict[str, int] = {}
            account_by_name: dict[str, int] = {}
            lm_by_name: dict[str, int] = {}

            # Map old package_id → new bundle_id, account_id, license_manager_id
            pkg_to_bundle: dict[int, int] = {}
            pkg_to_account: dict[int, int] = {}
            pkg_to_lm: dict[int, int] = {}

            for old_pid_str, pkg in old_packages.items():
                old_pid = int(old_pid_str)

                # Create bundle (always — one per old package)
                self._data["counters"]["bundle_id"] += 1
                bid = self._data["counters"]["bundle_id"]
                self._data["bundles"][str(bid)] = {
                    "name": pkg["name"],
                    "vendor": pkg.get("vendor"),
                    "serial_key": pkg.get("serial_key"),
                    "purchase_date": pkg.get("purchase_date"),
                    "source": pkg.get("source"),
                    "notes": pkg.get("notes"),
                    "created_at": pkg.get("created_at", now),
                    "updated_at": now,
                }
                pkg_to_bundle[old_pid] = bid

                # Create/find account if email or vendor_url present
                email = pkg.get("email")
                vendor_url = pkg.get("vendor_url")
                if email or vendor_url:
                    # Dedup by email first, then by vendor name
                    acct_id = None
                    if email and email in account_by_email:
                        acct_id = account_by_email[email]
                    elif not email:
                        vendor_name = pkg.get("vendor") or pkg["name"]
                        if vendor_name in account_by_name:
                            acct_id = account_by_name[vendor_name]

                    if acct_id is None:
                        self._data["counters"]["account_id"] += 1
                        acct_id = self._data["counters"]["account_id"]
                        acct_name = pkg.get("vendor") or pkg["name"]
                        self._data["accounts"][str(acct_id)] = {
                            "name": acct_name,
                            "email": email,
                            "vendor_url": vendor_url,
                            "notes": None,
                            "created_at": now,
                            "updated_at": now,
                        }
                        if email:
                            account_by_email[email] = acct_id
                        account_by_name[acct_name] = acct_id

                    pkg_to_account[old_pid] = acct_id

                # Create/find license manager if present
                lm_name = pkg.get("license_manager")
                if lm_name:
                    if lm_name in lm_by_name:
                        lm_id = lm_by_name[lm_name]
                    else:
                        self._data["counters"]["license_manager_id"] += 1
                        lm_id = self._data["counters"]["license_manager_id"]
                        self._data["license_managers"][str(lm_id)] = {
                            "name": lm_name,
                            "url": None,
                            "notes": None,
                            "created_at": now,
                            "updated_at": now,
                        }
                        lm_by_name[lm_name] = lm_id
                    pkg_to_lm[old_pid] = lm_id

            # Update products: rename package_id → bundle_id, add account_id + license_manager_id
            for p in self._data["products"].values():
                old_pkg_id = p.get("package_id")
                p["bundle_id"] = pkg_to_bundle.get(old_pkg_id) if old_pkg_id else None
                p["account_id"] = pkg_to_account.get(old_pkg_id) if old_pkg_id else None
                p["license_manager_id"] = pkg_to_lm.get(old_pkg_id) if old_pkg_id else None
                p.pop("package_id", None)

            # Remove old collections/counters
            self._data.pop("packages", None)
            self._data["counters"].pop("package_id", None)

            self._data["version"] = 3
            version = 3
            self._save()

        if version < 4:
            # v3 → v4: Add sources collection and source_id to products
            self._data.setdefault("sources", {})
            self._data["counters"].setdefault("source_id", 0)
            for p in self._data["products"].values():
                p.setdefault("source_id", None)
            self._data["version"] = 4
            self._save()

        if version < 5:
            # v4 → v5: Add email field to sources
            for s in self._data.get("sources", {}).values():
                s.setdefault("email", None)
            self._data["version"] = 5
            self._save()

        if version < 6:
            # v5 → v6: Add installed field to products (all existing are installed from disk)
            for p in self._data["products"].values():
                p.setdefault("installed", True)
            self._data["version"] = 6
            self._save()

    def _save(self) -> None:
        if self._batch > 0:
            return
        fd, tmp = tempfile.mkstemp(
            dir=str(self.data_path.parent), suffix=".tmp"
        )
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(self._data, f, indent=2, ensure_ascii=False)
                f.write("\n")
            self._rotate_backups()
            os.replace(tmp, str(self.data_path))
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def _rotate_backups(self) -> None:
        """Copy current data file to a timestamped backup, keeping up to MAX_BACKUPS."""
        if not self.data_path.exists():
            return
        backup_dir = self.data_path.parent / "backups"
        backup_dir.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        stem = self.data_path.stem
        suffix = self.data_path.suffix
        backup_path = backup_dir / f"{stem}.{stamp}{suffix}"
        shutil.copy2(str(self.data_path), str(backup_path))
        # Prune old backups
        backups = sorted(backup_dir.glob(f"{stem}.*{suffix}"))
        for old in backups[:-MAX_BACKUPS]:
            old.unlink()

    def _next_id(self, counter: str) -> int:
        self._data["counters"][counter] += 1
        return self._data["counters"][counter]

    def close(self) -> None:
        pass

    @contextlib.contextmanager
    def batch(self) -> Generator[None]:
        """Context manager that defers saves until the batch completes."""
        self._batch += 1
        try:
            yield
        finally:
            self._batch -= 1
            if self._batch == 0:
                self._save()

    # --- Products ---

    def upsert_product(
        self,
        name: str,
        vendor: str | None,
        category: str | None,
        installed: bool = True,
    ) -> int:
        """Find or create a product. Returns the product id."""
        for pid, p in self._data["products"].items():
            if p["name"] == name and p["vendor"] == vendor:
                p["updated_at"] = _now()
                p["installed"] = installed
                if category and not p.get("category"):
                    p["category"] = category
                self._save()
                return int(pid)

        pid = self._next_id("product_id")
        now = _now()
        self._data["products"][str(pid)] = {
            "name": name,
            "vendor": vendor,
            "category": category,
            "status": "unknown",
            "bundle_id": None,
            "account_id": None,
            "license_manager_id": None,
            "source_id": None,
            "installed": installed,
            "notes": None,
            "created_at": now,
            "updated_at": now,
        }
        self._save()
        return pid

    def get_product(self, product_id: int) -> Product | None:
        p = self._data["products"].get(str(product_id))
        if not p:
            return None
        return self._dict_to_product(product_id, p)

    def search_products(self, query: str) -> list[Product]:
        """Search products by name (case-insensitive substring match)."""
        q = query.lower()
        results = []
        for pid, p in self._data["products"].items():
            if q in p["name"].lower():
                results.append(self._dict_to_product(int(pid), p))
        results.sort(key=lambda x: x.name)
        return results

    def list_products(
        self,
        vendor: str | None = None,
        fmt: str | None = None,
        category: str | None = None,
        status: str | None = None,
        has_license: bool | None = None,
        missing: bool = False,
    ) -> list[Product]:
        """List products with optional filters."""
        results = []
        for pid_str, p in self._data["products"].items():
            pid = int(pid_str)

            if vendor and (not p["vendor"] or vendor.lower() not in p["vendor"].lower()):
                continue
            if category and p["category"] != category:
                continue
            if status and p.get("status", "unknown") != status:
                continue

            product = self._dict_to_product(pid, p)

            if fmt and fmt not in product.formats:
                continue
            if missing and not any(
                not inst.is_present for inst in product.installations
            ):
                continue
            if has_license is True and not product.has_license:
                continue
            if has_license is False and product.has_license:
                continue

            results.append(product)

        results.sort(key=lambda x: (x.vendor or "", x.name))
        return results

    def update_product(
        self,
        product_id: int,
        *,
        name: str | None = None,
        vendor: str | None = None,
        category: str | None = None,
        status: str | None = None,
        installed: bool | None = None,
        notes: str | None = None,
    ) -> None:
        p = self._data["products"].get(str(product_id))
        if not p:
            return

        if name is not None:
            p["name"] = name
        if vendor is not None:
            p["vendor"] = vendor
        if category is not None:
            p["category"] = category
        if status is not None:
            p["status"] = status
        if installed is not None:
            p["installed"] = installed
        if notes is not None:
            p["notes"] = notes

        p["updated_at"] = _now()
        self._save()

    def delete_product(self, product_id: int) -> bool:
        """Delete a product and all its installations and licenses."""
        key = str(product_id)
        if key not in self._data["products"]:
            return False
        del self._data["products"][key]
        self._remove_refs("installations", "product_id", product_id)
        self._remove_refs("licenses", "product_id", product_id)
        self._save()
        return True

    def merge_products(self, keep_id: int, remove_id: int) -> bool:
        """Merge remove product into keep product, then delete remove."""
        if keep_id == remove_id:
            return False
        keep = self._data["products"].get(str(keep_id))
        remove = self._data["products"].get(str(remove_id))
        if not keep or not remove:
            return False

        # Transfer linked entities (only if keep's field is None)
        for field in ("source_id", "account_id", "license_manager_id", "bundle_id"):
            if keep.get(field) is None and remove.get(field) is not None:
                keep[field] = remove[field]

        # Transfer category if keep has none
        if not keep.get("category") and remove.get("category"):
            keep["category"] = remove["category"]

        # Transfer installed flag
        if not keep.get("installed") and remove.get("installed"):
            keep["installed"] = True

        # Reassign installations from remove to keep
        for inst in self._data["installations"].values():
            if inst["product_id"] == remove_id:
                inst["product_id"] = keep_id

        # Reassign licenses from remove to keep
        for lic in self._data["licenses"].values():
            if lic["product_id"] == remove_id:
                lic["product_id"] = keep_id

        # Append notes
        if remove.get("notes"):
            if keep.get("notes"):
                keep["notes"] = keep["notes"] + "\n" + remove["notes"]
            else:
                keep["notes"] = remove["notes"]

        keep["updated_at"] = _now()

        # Delete the remove product
        del self._data["products"][str(remove_id)]
        self._save()
        return True

    def get_all_product_ids(self) -> set[int]:
        """Return the set of all product IDs."""
        return {int(pid) for pid in self._data["products"]}

    def _set_product_field(
        self, product_ids: list[int], field: str, value: int | None
    ) -> None:
        """Set a field on one or more products and save."""
        now = _now()
        for pid in product_ids:
            p = self._data["products"].get(str(pid))
            if p:
                p[field] = value
                p["updated_at"] = now
        self._save()

    def _get_products_by_field(self, field: str, value: int) -> list[Product]:
        """List products where a given field matches value, sorted by name."""
        results = [
            self._dict_to_product(int(pid_str), p)
            for pid_str, p in self._data["products"].items()
            if p.get(field) == value
        ]
        results.sort(key=lambda x: x.name)
        return results

    def set_product_bundle(self, product_id: int, bundle_id: int | None) -> None:
        self._set_product_field([product_id], "bundle_id", bundle_id)

    def batch_set_product_bundle(
        self, product_ids: list[int], bundle_id: int | None
    ) -> None:
        self._set_product_field(product_ids, "bundle_id", bundle_id)

    def set_product_account(self, product_id: int, account_id: int | None) -> None:
        self._set_product_field([product_id], "account_id", account_id)

    def batch_set_product_account(
        self, product_ids: list[int], account_id: int | None
    ) -> None:
        self._set_product_field(product_ids, "account_id", account_id)

    def set_product_license_manager(
        self, product_id: int, license_manager_id: int | None
    ) -> None:
        self._set_product_field([product_id], "license_manager_id", license_manager_id)

    def batch_set_product_license_manager(
        self, product_ids: list[int], license_manager_id: int | None
    ) -> None:
        self._set_product_field(product_ids, "license_manager_id", license_manager_id)

    def get_products_for_bundle(self, bundle_id: int) -> list[Product]:
        return self._get_products_by_field("bundle_id", bundle_id)

    def get_products_for_account(self, account_id: int) -> list[Product]:
        return self._get_products_by_field("account_id", account_id)

    def get_products_for_license_manager(self, lm_id: int) -> list[Product]:
        return self._get_products_by_field("license_manager_id", lm_id)

    # --- Installations ---

    def upsert_installation(
        self,
        product_id: int,
        fmt: str,
        path: str,
        bundle_id: str | None,
        version: str | None,
        au_type: str | None = None,
        au_subtype: str | None = None,
        au_manufacturer: str | None = None,
        vendor_from_plist: str | None = None,
        copyright_str: str | None = None,
        min_macos_version: str | None = None,
    ) -> int:
        """Insert or update an installation by path. Returns installation id."""
        now = _now()

        # Find existing by path
        for iid, inst in self._data["installations"].items():
            if inst["path"] == path:
                inst.update({
                    "product_id": product_id,
                    "format": fmt,
                    "bundle_id": bundle_id,
                    "version": version,
                    "au_type": au_type,
                    "au_subtype": au_subtype,
                    "au_manufacturer": au_manufacturer,
                    "vendor_from_plist": vendor_from_plist,
                    "copyright": copyright_str,
                    "min_macos_version": min_macos_version,
                    "last_seen": now,
                    "is_present": True,
                })
                self._save()
                return int(iid)

        iid = self._next_id("installation_id")
        self._data["installations"][str(iid)] = {
            "product_id": product_id,
            "format": fmt,
            "path": path,
            "bundle_id": bundle_id,
            "version": version,
            "au_type": au_type,
            "au_subtype": au_subtype,
            "au_manufacturer": au_manufacturer,
            "vendor_from_plist": vendor_from_plist,
            "copyright": copyright_str,
            "min_macos_version": min_macos_version,
            "first_seen": now,
            "last_seen": now,
            "is_present": True,
        }
        self._save()
        return iid

    def get_installations_for_product(self, product_id: int) -> list[Installation]:
        results = []
        for iid, inst in self._data["installations"].items():
            if inst["product_id"] == product_id:
                results.append(self._dict_to_installation(int(iid), inst))
        results.sort(key=lambda x: x.format)
        return results

    def mark_all_absent(self) -> None:
        """Mark all installations as absent (before a fresh scan)."""
        for inst in self._data["installations"].values():
            inst["is_present"] = False
        self._save()

    def count_absent(self) -> int:
        return sum(
            1 for inst in self._data["installations"].values() if not inst["is_present"]
        )

    def get_absent_installations(self) -> list[Installation]:
        results = []
        for iid, inst in self._data["installations"].items():
            if not inst["is_present"]:
                results.append(self._dict_to_installation(int(iid), inst))
        results.sort(key=lambda x: x.path)
        return results

    # --- Licenses ---

    def add_license(
        self,
        product_id: int,
        serial_key: str | None = None,
        license_file_path: str | None = None,
        purchase_date: str | None = None,
        vendor_url: str | None = None,
        license_manager: str | None = None,
        email: str | None = None,
        source: str | None = None,
        notes: str | None = None,
    ) -> int:
        now = _now()
        lid = self._next_id("license_id")
        self._data["licenses"][str(lid)] = {
            "product_id": product_id,
            "serial_key": serial_key,
            "license_file_path": license_file_path,
            "purchase_date": purchase_date,
            "vendor_url": vendor_url,
            "license_manager": license_manager,
            "email": email,
            "source": source,
            "notes": notes,
            "created_at": now,
            "updated_at": now,
        }
        self._save()
        return lid

    def update_license(
        self,
        license_id: int,
        *,
        serial_key: str | None = ...,  # type: ignore[assignment]
        license_file_path: str | None = ...,  # type: ignore[assignment]
        purchase_date: str | None = ...,  # type: ignore[assignment]
        vendor_url: str | None = ...,  # type: ignore[assignment]
        license_manager: str | None = ...,  # type: ignore[assignment]
        email: str | None = ...,  # type: ignore[assignment]
        source: str | None = ...,  # type: ignore[assignment]
        notes: str | None = ...,  # type: ignore[assignment]
    ) -> bool:
        """Update license fields. Uses sentinel (...) to distinguish None from unset."""
        lic = self._data["licenses"].get(str(license_id))
        if not lic:
            return False

        if serial_key is not ...:
            lic["serial_key"] = serial_key
        if license_file_path is not ...:
            lic["license_file_path"] = license_file_path
        if purchase_date is not ...:
            lic["purchase_date"] = purchase_date
        if vendor_url is not ...:
            lic["vendor_url"] = vendor_url
        if license_manager is not ...:
            lic["license_manager"] = license_manager
        if email is not ...:
            lic["email"] = email
        if source is not ...:
            lic["source"] = source
        if notes is not ...:
            lic["notes"] = notes

        lic["updated_at"] = _now()
        self._save()
        return True

    def delete_license(self, license_id: int) -> bool:
        """Delete a license. Returns True if it existed."""
        key = str(license_id)
        if key not in self._data["licenses"]:
            return False
        del self._data["licenses"][key]
        self._save()
        return True

    def get_license(self, license_id: int) -> License | None:
        lic = self._data["licenses"].get(str(license_id))
        if not lic:
            return None
        return self._dict_to_license(license_id, lic)

    def get_licenses_for_product(self, product_id: int) -> list[License]:
        results = []
        for lid, lic in self._data["licenses"].items():
            if lic["product_id"] == product_id:
                results.append(self._dict_to_license(int(lid), lic))
        results.sort(key=lambda x: x.created_at or "")
        return results

    # --- Bundles ---

    def create_bundle(
        self,
        name: str,
        vendor: str | None = None,
        source: str | None = None,
        serial_key: str | None = None,
        purchase_date: str | None = None,
        notes: str | None = None,
    ) -> int:
        bid = self._next_id("bundle_id")
        now = _now()
        self._data["bundles"][str(bid)] = {
            "name": name,
            "vendor": vendor,
            "source": source,
            "serial_key": serial_key,
            "purchase_date": purchase_date,
            "notes": notes,
            "created_at": now,
            "updated_at": now,
        }
        self._save()
        return bid

    def get_bundle(self, bundle_id: int) -> Bundle | None:
        b = self._data["bundles"].get(str(bundle_id))
        if not b:
            return None
        return self._dict_to_bundle(bundle_id, b)

    def list_bundles(self) -> list[Bundle]:
        results = []
        for bid_str, b in self._data["bundles"].items():
            results.append(self._dict_to_bundle(int(bid_str), b))
        results.sort(key=lambda x: (x.vendor or "", x.name))
        return results

    def update_bundle(
        self,
        bundle_id: int,
        *,
        name: str | None = ...,  # type: ignore[assignment]
        vendor: str | None = ...,  # type: ignore[assignment]
        source: str | None = ...,  # type: ignore[assignment]
        serial_key: str | None = ...,  # type: ignore[assignment]
        purchase_date: str | None = ...,  # type: ignore[assignment]
        notes: str | None = ...,  # type: ignore[assignment]
    ) -> bool:
        b = self._data["bundles"].get(str(bundle_id))
        if not b:
            return False

        if name is not ...:
            b["name"] = name
        if vendor is not ...:
            b["vendor"] = vendor
        if source is not ...:
            b["source"] = source
        if serial_key is not ...:
            b["serial_key"] = serial_key
        if purchase_date is not ...:
            b["purchase_date"] = purchase_date
        if notes is not ...:
            b["notes"] = notes

        b["updated_at"] = _now()
        self._save()
        return True

    def delete_bundle(self, bundle_id: int) -> bool:
        """Delete a bundle and unlink all its products."""
        key = str(bundle_id)
        if key not in self._data["bundles"]:
            return False
        for p in self._data["products"].values():
            if p.get("bundle_id") == bundle_id:
                p["bundle_id"] = None
        del self._data["bundles"][key]
        self._save()
        return True

    # --- Accounts ---

    def create_account(
        self,
        name: str,
        email: str | None = None,
        vendor_url: str | None = None,
        notes: str | None = None,
    ) -> int:
        aid = self._next_id("account_id")
        now = _now()
        self._data["accounts"][str(aid)] = {
            "name": name,
            "email": email,
            "vendor_url": vendor_url,
            "notes": notes,
            "created_at": now,
            "updated_at": now,
        }
        self._save()
        return aid

    def get_account(self, account_id: int) -> Account | None:
        a = self._data["accounts"].get(str(account_id))
        if not a:
            return None
        return self._dict_to_account(account_id, a)

    def list_accounts(self) -> list[Account]:
        results = []
        for aid_str, a in self._data["accounts"].items():
            results.append(self._dict_to_account(int(aid_str), a))
        results.sort(key=lambda x: x.name)
        return results

    def update_account(
        self,
        account_id: int,
        *,
        name: str | None = ...,  # type: ignore[assignment]
        email: str | None = ...,  # type: ignore[assignment]
        vendor_url: str | None = ...,  # type: ignore[assignment]
        notes: str | None = ...,  # type: ignore[assignment]
    ) -> bool:
        a = self._data["accounts"].get(str(account_id))
        if not a:
            return False

        if name is not ...:
            a["name"] = name
        if email is not ...:
            a["email"] = email
        if vendor_url is not ...:
            a["vendor_url"] = vendor_url
        if notes is not ...:
            a["notes"] = notes

        a["updated_at"] = _now()
        self._save()
        return True

    def delete_account(self, account_id: int) -> bool:
        """Delete an account and unlink all its products."""
        key = str(account_id)
        if key not in self._data["accounts"]:
            return False
        for p in self._data["products"].values():
            if p.get("account_id") == account_id:
                p["account_id"] = None
        del self._data["accounts"][key]
        self._save()
        return True

    # --- License Managers ---

    def create_license_manager(
        self,
        name: str,
        url: str | None = None,
        notes: str | None = None,
    ) -> int:
        lm_id = self._next_id("license_manager_id")
        now = _now()
        self._data["license_managers"][str(lm_id)] = {
            "name": name,
            "url": url,
            "notes": notes,
            "created_at": now,
            "updated_at": now,
        }
        self._save()
        return lm_id

    def get_license_manager(self, lm_id: int) -> LicenseManager | None:
        lm = self._data["license_managers"].get(str(lm_id))
        if not lm:
            return None
        return self._dict_to_license_manager(lm_id, lm)

    def list_license_managers(self) -> list[LicenseManager]:
        results = []
        for lm_id_str, lm in self._data["license_managers"].items():
            results.append(self._dict_to_license_manager(int(lm_id_str), lm))
        results.sort(key=lambda x: x.name)
        return results

    def update_license_manager(
        self,
        lm_id: int,
        *,
        name: str | None = ...,  # type: ignore[assignment]
        url: str | None = ...,  # type: ignore[assignment]
        notes: str | None = ...,  # type: ignore[assignment]
    ) -> bool:
        lm = self._data["license_managers"].get(str(lm_id))
        if not lm:
            return False

        if name is not ...:
            lm["name"] = name
        if url is not ...:
            lm["url"] = url
        if notes is not ...:
            lm["notes"] = notes

        lm["updated_at"] = _now()
        self._save()
        return True

    def delete_license_manager(self, lm_id: int) -> bool:
        """Delete a license manager and unlink all its products."""
        key = str(lm_id)
        if key not in self._data["license_managers"]:
            return False
        for p in self._data["products"].values():
            if p.get("license_manager_id") == lm_id:
                p["license_manager_id"] = None
        del self._data["license_managers"][key]
        self._save()
        return True

    # --- Sources ---

    def create_source(
        self,
        name: str,
        email: str | None = None,
        url: str | None = None,
        notes: str | None = None,
    ) -> int:
        sid = self._next_id("source_id")
        now = _now()
        self._data["sources"][str(sid)] = {
            "name": name,
            "email": email,
            "url": url,
            "notes": notes,
            "created_at": now,
            "updated_at": now,
        }
        self._save()
        return sid

    def get_source(self, source_id: int) -> Source | None:
        s = self._data["sources"].get(str(source_id))
        if not s:
            return None
        return self._dict_to_source(source_id, s)

    def list_sources(self) -> list[Source]:
        results = []
        for sid_str, s in self._data["sources"].items():
            results.append(self._dict_to_source(int(sid_str), s))
        results.sort(key=lambda x: x.name)
        return results

    def update_source(
        self,
        source_id: int,
        *,
        name: str | None = ...,  # type: ignore[assignment]
        email: str | None = ...,  # type: ignore[assignment]
        url: str | None = ...,  # type: ignore[assignment]
        notes: str | None = ...,  # type: ignore[assignment]
    ) -> bool:
        s = self._data["sources"].get(str(source_id))
        if not s:
            return False

        if name is not ...:
            s["name"] = name
        if email is not ...:
            s["email"] = email
        if url is not ...:
            s["url"] = url
        if notes is not ...:
            s["notes"] = notes

        s["updated_at"] = _now()
        self._save()
        return True

    def delete_source(self, source_id: int) -> bool:
        """Delete a source and unlink all its products."""
        key = str(source_id)
        if key not in self._data["sources"]:
            return False
        for p in self._data["products"].values():
            if p.get("source_id") == source_id:
                p["source_id"] = None
        del self._data["sources"][key]
        self._save()
        return True

    def set_product_source(self, product_id: int, source_id: int | None) -> None:
        self._set_product_field([product_id], "source_id", source_id)

    def batch_set_product_source(
        self, product_ids: list[int], source_id: int | None
    ) -> None:
        self._set_product_field(product_ids, "source_id", source_id)

    def get_products_for_source(self, source_id: int) -> list[Product]:
        return self._get_products_by_field("source_id", source_id)

    # --- Scans ---

    def record_scan(self, result: ScanResult) -> int:
        sid = self._next_id("scan_id")
        self._data["scans"].append({
            "id": sid,
            "timestamp": _now(),
            "plugins_found": result.plugins_found,
            "products_found": result.products_found,
            "new_plugins": result.new_plugins,
            "removed_plugins": result.removed_plugins,
        })
        self._save()
        return sid

    def get_last_scan(self) -> ScanResult | None:
        if not self._data["scans"]:
            return None
        s = self._data["scans"][-1]
        return ScanResult(
            scan_id=s["id"],
            timestamp=s["timestamp"],
            plugins_found=s["plugins_found"],
            products_found=s["products_found"],
            new_plugins=s["new_plugins"],
            removed_plugins=s["removed_plugins"],
        )

    # --- Helpers ---

    def _remove_refs(self, collection: str, field: str, value: int) -> None:
        """Remove all records from a collection where field matches value."""
        to_remove = [
            key for key, record in self._data[collection].items()
            if record[field] == value
        ]
        for key in to_remove:
            del self._data[collection][key]

    def _dict_to_product(self, pid: int, p: dict) -> Product:
        product = Product(
            id=pid,
            name=p["name"],
            vendor=p["vendor"],
            category=p["category"],
            status=p.get("status") or "unknown",
            bundle_id=p.get("bundle_id"),
            account_id=p.get("account_id"),
            license_manager_id=p.get("license_manager_id"),
            source_id=p.get("source_id"),
            installed=p.get("installed", True),
            notes=p.get("notes"),
            created_at=p.get("created_at"),
            updated_at=p.get("updated_at"),
        )
        product.installations = self.get_installations_for_product(pid)
        product.licenses = self.get_licenses_for_product(pid)
        return product

    def _dict_to_installation(self, iid: int, inst: dict) -> Installation:
        return Installation(
            id=iid,
            product_id=inst["product_id"],
            format=inst["format"],
            path=inst["path"],
            bundle_id=inst.get("bundle_id"),
            version=inst.get("version"),
            au_type=inst.get("au_type"),
            au_subtype=inst.get("au_subtype"),
            au_manufacturer=inst.get("au_manufacturer"),
            vendor_from_plist=inst.get("vendor_from_plist"),
            copyright=inst.get("copyright"),
            min_macos_version=inst.get("min_macos_version"),
            first_seen=inst.get("first_seen"),
            last_seen=inst.get("last_seen"),
            is_present=inst.get("is_present", True),
        )

    def _dict_to_license(self, lid: int, lic: dict) -> License:
        return License(
            id=lid,
            product_id=lic["product_id"],
            serial_key=lic.get("serial_key"),
            license_file_path=lic.get("license_file_path"),
            purchase_date=lic.get("purchase_date"),
            vendor_url=lic.get("vendor_url"),
            license_manager=lic.get("license_manager"),
            email=lic.get("email"),
            source=lic.get("source"),
            notes=lic.get("notes"),
            created_at=lic.get("created_at"),
            updated_at=lic.get("updated_at"),
        )

    def _dict_to_bundle(self, bid: int, b: dict) -> Bundle:
        return Bundle(
            id=bid,
            name=b["name"],
            vendor=b.get("vendor"),
            serial_key=b.get("serial_key"),
            purchase_date=b.get("purchase_date"),
            source=b.get("source"),
            notes=b.get("notes"),
            created_at=b.get("created_at"),
            updated_at=b.get("updated_at"),
        )

    def _dict_to_account(self, aid: int, a: dict) -> Account:
        return Account(
            id=aid,
            name=a["name"],
            email=a.get("email"),
            vendor_url=a.get("vendor_url"),
            notes=a.get("notes"),
            created_at=a.get("created_at"),
            updated_at=a.get("updated_at"),
        )

    def _dict_to_license_manager(self, lm_id: int, lm: dict) -> LicenseManager:
        return LicenseManager(
            id=lm_id,
            name=lm["name"],
            url=lm.get("url"),
            notes=lm.get("notes"),
            created_at=lm.get("created_at"),
            updated_at=lm.get("updated_at"),
        )

    def _dict_to_source(self, sid: int, s: dict) -> Source:
        return Source(
            id=sid,
            name=s["name"],
            email=s.get("email"),
            url=s.get("url"),
            notes=s.get("notes"),
            created_at=s.get("created_at"),
            updated_at=s.get("updated_at"),
        )
