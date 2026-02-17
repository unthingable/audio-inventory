"""Export inventory data to JSON and CSV."""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from audio_inventory.db import Database
from audio_inventory.models import Account, Bundle, LicenseManager, Product, Source


def export_json(db: Database, output: Path | None = None) -> str:
    """Export full inventory to JSON. Returns the JSON string."""
    bundles = db.list_bundles()
    accounts = db.list_accounts()
    license_managers = db.list_license_managers()
    sources = db.list_sources()

    bundle_names = {b.id: b.name for b in bundles}
    account_names = {a.id: a.name for a in accounts}
    lm_names = {lm.id: lm.name for lm in license_managers}
    source_names = {s.id: s.name for s in sources}

    products = db.list_products()
    data = {
        "products": [
            _product_to_dict(p, bundle_names, account_names, lm_names, source_names)
            for p in products
        ],
        "bundles": [_bundle_to_dict(b) for b in bundles],
        "accounts": [_account_to_dict(a) for a in accounts],
        "license_managers": [_license_manager_to_dict(lm) for lm in license_managers],
        "sources": [_source_to_dict(s) for s in sources],
    }
    json_str = json.dumps(data, indent=2, ensure_ascii=False)

    if output:
        output.write_text(json_str)

    return json_str


def export_csv(db: Database, output: Path | None = None) -> str:
    """Export inventory to CSV. Returns the CSV string."""
    products = db.list_products()
    lm_names = {lm.id: lm.name for lm in db.list_license_managers()}
    buf = io.StringIO()
    writer = csv.writer(buf)

    writer.writerow(
        [
            "product_id",
            "name",
            "vendor",
            "category",
            "status",
            "formats",
            "version",
            "has_license",
            "license_manager",
            "serial_key",
            "purchase_date",
            "vendor_url",
            "email",
            "source",
            "source_id",
        ]
    )

    for p in products:
        formats = ", ".join(p.formats)
        version = p.current_version or ""
        has_license = "yes" if p.has_license else "no"
        licenses = p.licenses or [None]
        mgr_name = lm_names.get(p.license_manager_id, "") if p.license_manager_id else ""

        for lic in licenses:
            lic_mgr = mgr_name or ((lic.license_manager or "") if lic else "")
            writer.writerow(
                [
                    p.id,
                    p.name,
                    p.vendor or "",
                    p.category or "",
                    p.status,
                    formats,
                    version,
                    has_license,
                    lic_mgr,
                    (lic.serial_key or "") if lic else "",
                    (lic.purchase_date or "") if lic else "",
                    (lic.vendor_url or "") if lic else "",
                    (lic.email or "") if lic else "",
                    (lic.source or "") if lic else "",
                    p.source_id or "",
                ]
            )

    csv_str = buf.getvalue()
    if output:
        output.write_text(csv_str)

    return csv_str


def _product_to_dict(
    product: Product,
    bundle_names: dict,
    account_names: dict,
    lm_names: dict,
    source_names: dict,
) -> dict:
    return {
        "id": product.id,
        "name": product.name,
        "vendor": product.vendor,
        "category": product.category,
        "status": product.status,
        "notes": product.notes,
        "bundle_id": product.bundle_id,
        "bundle_name": bundle_names.get(product.bundle_id),
        "account_id": product.account_id,
        "account_name": account_names.get(product.account_id),
        "license_manager_id": product.license_manager_id,
        "license_manager_name": lm_names.get(product.license_manager_id),
        "source_id": product.source_id,
        "source_name": source_names.get(product.source_id),
        "installations": [
            {
                "format": inst.format,
                "path": inst.path,
                "bundle_id": inst.bundle_id,
                "version": inst.version,
                "is_present": inst.is_present,
                "au_type": inst.au_type,
                "au_subtype": inst.au_subtype,
                "au_manufacturer": inst.au_manufacturer,
                "first_seen": inst.first_seen,
                "last_seen": inst.last_seen,
            }
            for inst in product.installations
        ],
        "licenses": [
            {
                "serial_key": lic.serial_key,
                "license_file_path": lic.license_file_path,
                "purchase_date": lic.purchase_date,
                "vendor_url": lic.vendor_url,
                "license_manager": lic.license_manager,
                "email": lic.email,
                "source": lic.source,
                "notes": lic.notes,
            }
            for lic in product.licenses
        ],
    }


def _bundle_to_dict(bundle: Bundle) -> dict:
    return {
        "id": bundle.id,
        "name": bundle.name,
        "vendor": bundle.vendor,
        "serial_key": bundle.serial_key,
        "purchase_date": bundle.purchase_date,
        "source": bundle.source,
        "notes": bundle.notes,
        "created_at": bundle.created_at,
        "updated_at": bundle.updated_at,
    }


def _account_to_dict(account: Account) -> dict:
    return {
        "id": account.id,
        "name": account.name,
        "email": account.email,
        "vendor_url": account.vendor_url,
        "notes": account.notes,
        "created_at": account.created_at,
        "updated_at": account.updated_at,
    }


def _license_manager_to_dict(lm: LicenseManager) -> dict:
    return {
        "id": lm.id,
        "name": lm.name,
        "url": lm.url,
        "notes": lm.notes,
        "created_at": lm.created_at,
        "updated_at": lm.updated_at,
    }


def _source_to_dict(source: Source) -> dict:
    return {
        "id": source.id,
        "name": source.name,
        "email": source.email,
        "url": source.url,
        "notes": source.notes,
        "created_at": source.created_at,
        "updated_at": source.updated_at,
    }
