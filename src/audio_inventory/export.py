"""Export inventory data to JSON and CSV."""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from audio_inventory.db import Database
from audio_inventory.models import Product


def export_json(db: Database, output: Path | None = None) -> str:
    """Export full inventory to JSON. Returns the JSON string."""
    products = db.list_products()
    data = [_product_to_dict(p) for p in products]
    json_str = json.dumps(data, indent=2, ensure_ascii=False)

    if output:
        output.write_text(json_str)

    return json_str


def export_csv(db: Database, output: Path | None = None) -> str:
    """Export inventory to CSV. Returns the CSV string."""
    products = db.list_products()
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
        lic = p.licenses[0] if p.licenses else None

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
                (lic.license_manager or "") if lic else "",
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


def _product_to_dict(product: Product) -> dict:
    return {
        "id": product.id,
        "name": product.name,
        "vendor": product.vendor,
        "category": product.category,
        "status": product.status,
        "notes": product.notes,
        "bundle_id": product.bundle_id,
        "account_id": product.account_id,
        "license_manager_id": product.license_manager_id,
        "source_id": product.source_id,
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
