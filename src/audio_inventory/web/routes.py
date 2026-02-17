"""Routes for the audio inventory web UI."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, render_template, request

from audio_inventory.db import Database
from audio_inventory.dedup import (
    deduplicate,
    infer_category,
    pick_best_name,
    pick_best_vendor,
)
from audio_inventory.models import ScanResult
from audio_inventory.scanner import scan_all

bp = Blueprint("web", __name__)

VALID_STATUSES = ("unknown", "licensed", "demo", "free", "subscription", "bundled")
VALID_CATEGORIES = (
    "instrument", "effect", "generator", "sound-pack",
    "utility", "standalone", "upgrade", "bundle",
)


def _get_db() -> Database:
    return Database(current_app.config["DB_PATH"])


# --- Pages ---


@bp.route("/")
def index():
    """Main single-page UI."""
    return render_template("index.html")


# --- API: Products ---


@bp.route("/api/products")
def api_products():
    """Return all products as JSON."""
    db = _get_db()
    products = db.list_products()

    # Build lookups
    bundles = {b.id: b.name for b in db.list_bundles()}
    accounts = {a.id: a.name for a in db.list_accounts()}
    license_managers = {lm.id: lm.name for lm in db.list_license_managers()}
    sources = {s.id: s.name for s in db.list_sources()}

    data = []
    for p in products:
        data.append(
            {
                "id": p.id,
                "name": p.name,
                "vendor": p.vendor or "",
                "category": p.category or "",
                "status": p.status,
                "formats": p.formats,
                "version": p.current_version or "",
                "has_license": p.has_license,
                "has_serial_key": p.has_serial_key,
                "installed": p.installed,
                "notes": p.notes or "",
                "bundle_id": p.bundle_id,
                "bundle_name": bundles.get(p.bundle_id, "") if p.bundle_id else "",
                "account_id": p.account_id,
                "account_name": accounts.get(p.account_id, "") if p.account_id else "",
                "license_manager_id": p.license_manager_id,
                "license_manager_name": license_managers.get(p.license_manager_id, "") if p.license_manager_id else "",
                "source_id": p.source_id,
                "source_name": sources.get(p.source_id, "") if p.source_id else "",
            }
        )
    db.close()
    return jsonify(data)


@bp.route("/api/products/<int:product_id>")
def api_product_detail(product_id: int):
    """Return full product detail including installations and licenses."""
    db = _get_db()
    product = db.get_product(product_id)
    if not product:
        db.close()
        return jsonify({"error": "not found"}), 404

    def _entity_detail(entity_id, getter, fields):
        """Fetch a related entity and return (name, data_dict) or ("", None)."""
        if not entity_id:
            return "", None
        entity = getter(entity_id)
        if not entity:
            return "", None
        data = {"id": entity.id, "name": entity.name}
        for field in fields:
            data[field] = getattr(entity, field, None) or ""
        return entity.name, data

    bundle_name, bundle_data = _entity_detail(
        product.bundle_id, db.get_bundle,
        ["vendor", "source", "serial_key", "purchase_date", "notes"],
    )
    account_name, account_data = _entity_detail(
        product.account_id, db.get_account,
        ["email", "vendor_url", "notes"],
    )
    license_manager_name, license_manager_data = _entity_detail(
        product.license_manager_id, db.get_license_manager,
        ["url", "notes"],
    )
    source_name, source_data = _entity_detail(
        product.source_id, db.get_source,
        ["email", "url", "notes"],
    )

    data = {
        "id": product.id,
        "name": product.name,
        "vendor": product.vendor or "",
        "category": product.category or "",
        "status": product.status,
        "notes": product.notes or "",
        "formats": product.formats,
        "version": product.current_version or "",
        "has_license": product.has_license,
        "has_serial_key": product.has_serial_key,
        "installed": product.installed,
        "bundle_id": product.bundle_id,
        "bundle_name": bundle_name,
        "bundle": bundle_data,
        "account_id": product.account_id,
        "account_name": account_name,
        "account": account_data,
        "license_manager_id": product.license_manager_id,
        "license_manager_name": license_manager_name,
        "license_manager": license_manager_data,
        "source_id": product.source_id,
        "source_name": source_name,
        "source": source_data,
        "installations": [
            {
                "format": inst.format,
                "path": inst.path,
                "bundle_id": inst.bundle_id or "",
                "version": inst.version or "",
                "au_type": inst.au_type or "",
                "au_subtype": inst.au_subtype or "",
                "au_manufacturer": inst.au_manufacturer or "",
                "is_present": inst.is_present,
                "first_seen": inst.first_seen or "",
                "last_seen": inst.last_seen or "",
            }
            for inst in product.installations
        ],
        "licenses": [
            {
                "id": lic.id,
                "serial_key": lic.serial_key or "",
                "license_file_path": lic.license_file_path or "",
                "purchase_date": lic.purchase_date or "",
                "vendor_url": lic.vendor_url or "",
                "license_manager": lic.license_manager or "",
                "email": lic.email or "",
                "source": lic.source or "",
                "notes": lic.notes or "",
            }
            for lic in product.licenses
        ],
    }
    db.close()
    return jsonify(data)


@bp.route("/api/products", methods=["POST"])
def api_create_product():
    """Create a new product manually."""
    db = _get_db()
    body = request.get_json(force=True)
    name = (body.get("name") or "").strip()
    if not name:
        db.close()
        return jsonify({"error": "name is required"}), 400

    vendor = (body.get("vendor") or "").strip() or None
    category = body.get("category") or None
    if category and category not in VALID_CATEGORIES:
        db.close()
        return jsonify(
            {"error": f"invalid category, must be one of: {', '.join(VALID_CATEGORIES)}"}
        ), 400

    pid = db.upsert_product(name, vendor, category, installed=False)

    status = body.get("status")
    if status:
        if status not in VALID_STATUSES:
            db.close()
            return jsonify(
                {"error": f"invalid status, must be one of: {', '.join(VALID_STATUSES)}"}
            ), 400
        db.update_product(pid, status=status)

    db.close()
    return jsonify({"ok": True, "id": pid}), 201


@bp.route("/api/products/<int:product_id>", methods=["PUT"])
def api_update_product(product_id: int):
    """Update product fields (status, notes)."""
    db = _get_db()
    product = db.get_product(product_id)
    if not product:
        db.close()
        return jsonify({"error": "not found"}), 404

    body = request.get_json(force=True)
    kwargs = {}

    if "status" in body:
        if body["status"] not in VALID_STATUSES:
            db.close()
            return jsonify(
                {"error": f"invalid status, must be one of: {', '.join(VALID_STATUSES)}"}
            ), 400
        kwargs["status"] = body["status"]

    if "category" in body:
        if body["category"] and body["category"] not in VALID_CATEGORIES:
            db.close()
            return jsonify(
                {"error": f"invalid category, must be one of: {', '.join(VALID_CATEGORIES)}"}
            ), 400
        kwargs["category"] = body["category"] or None

    if "installed" in body:
        kwargs["installed"] = bool(body["installed"])

    if "notes" in body:
        kwargs["notes"] = body["notes"] or None

    if "name" in body:
        name = (body["name"] or "").strip()
        if name:
            kwargs["name"] = name

    if "vendor" in body:
        kwargs["vendor"] = body["vendor"] or None

    if kwargs:
        db.update_product(product_id, **kwargs)

    # Entity ID assignments (single-product batch)
    pid_list = [product_id]
    if "bundle_id" in body:
        db.batch_set_product_bundle(pid_list, body["bundle_id"])
    if "account_id" in body:
        db.batch_set_product_account(pid_list, body["account_id"])
    if "license_manager_id" in body:
        db.batch_set_product_license_manager(pid_list, body["license_manager_id"])
    if "source_id" in body:
        db.batch_set_product_source(pid_list, body["source_id"])

    db.close()
    return jsonify({"ok": True})


@bp.route("/api/products/<int:product_id>", methods=["DELETE"])
def api_delete_product(product_id: int):
    """Delete a product and its installations/licenses."""
    db = _get_db()
    if not db.delete_product(product_id):
        db.close()
        return jsonify({"error": "not found"}), 404
    db.close()
    return jsonify({"ok": True})


@bp.route("/api/products/merge", methods=["POST"])
def api_merge_products():
    """Merge two products (remove into keep)."""
    db = _get_db()
    body = request.get_json(force=True)
    try:
        keep_id = int(body.get("keep_id"))
        remove_id = int(body.get("remove_id"))
    except (TypeError, ValueError):
        db.close()
        return jsonify({"error": "keep_id and remove_id are required as integers"}), 400
    if not db.merge_products(keep_id, remove_id):
        db.close()
        return jsonify({"error": "one or both products not found"}), 404
    db.close()
    return jsonify({"ok": True})


@bp.route("/api/products/bulk", methods=["PUT"])
def api_bulk_update_products():
    """Bulk update products (status, bundle, account, license manager assignment)."""
    db = _get_db()
    body = request.get_json(force=True)
    raw_ids = body.get("product_ids", [])
    if not isinstance(raw_ids, list) or not raw_ids:
        db.close()
        return jsonify({"error": "product_ids must be a non-empty list of integers"}), 400
    try:
        product_ids = [int(pid) for pid in raw_ids]
    except (TypeError, ValueError):
        db.close()
        return jsonify({"error": "product_ids must be a non-empty list of integers"}), 400

    if "status" in body:
        if body["status"] not in VALID_STATUSES:
            db.close()
            return jsonify(
                {"error": f"invalid status, must be one of: {', '.join(VALID_STATUSES)}"}
            ), 400
        for pid in product_ids:
            db.update_product(pid, status=body["status"])

    if "bundle_id" in body:
        db.batch_set_product_bundle(product_ids, body["bundle_id"])

    if "account_id" in body:
        db.batch_set_product_account(product_ids, body["account_id"])

    if "license_manager_id" in body:
        db.batch_set_product_license_manager(product_ids, body["license_manager_id"])

    if "source_id" in body:
        db.batch_set_product_source(product_ids, body["source_id"])

    db.close()
    return jsonify({"ok": True})


# --- API: Licenses ---


@bp.route("/api/products/<int:product_id>/licenses", methods=["POST"])
def api_create_license(product_id: int):
    """Create a license for a product."""
    db = _get_db()
    product = db.get_product(product_id)
    if not product:
        db.close()
        return jsonify({"error": "not found"}), 404

    body = request.get_json(force=True)
    lid = db.add_license(
        product_id=product_id,
        serial_key=body.get("serial_key") or None,
        license_file_path=body.get("license_file_path") or None,
        purchase_date=body.get("purchase_date") or None,
        vendor_url=body.get("vendor_url") or None,
        license_manager=body.get("license_manager") or None,
        email=body.get("email") or None,
        source=body.get("source") or None,
        notes=body.get("notes") or None,
    )
    db.close()
    return jsonify({"ok": True, "id": lid}), 201


@bp.route("/api/licenses/<int:license_id>", methods=["PUT"])
def api_update_license(license_id: int):
    """Update license fields."""
    db = _get_db()
    lic = db.get_license(license_id)
    if not lic:
        db.close()
        return jsonify({"error": "not found"}), 404

    body = request.get_json(force=True)
    kwargs = {}
    for field in (
        "serial_key", "license_file_path", "purchase_date", "vendor_url",
        "license_manager", "email", "source", "notes",
    ):
        if field in body:
            kwargs[field] = body[field] or None

    db.update_license(license_id, **kwargs)
    db.close()
    return jsonify({"ok": True})


@bp.route("/api/licenses/<int:license_id>", methods=["DELETE"])
def api_delete_license(license_id: int):
    """Delete a license."""
    db = _get_db()
    if not db.delete_license(license_id):
        db.close()
        return jsonify({"error": "not found"}), 404
    db.close()
    return jsonify({"ok": True})


# --- API: Bundles ---


@bp.route("/api/bundles")
def api_bundles():
    """List all bundles with product counts."""
    db = _get_db()
    bundles = db.list_bundles()
    data = []
    for bundle in bundles:
        products = db.get_products_for_bundle(bundle.id)
        data.append({
            "id": bundle.id,
            "name": bundle.name,
            "vendor": bundle.vendor or "",
            "source": bundle.source or "",
            "serial_key": bundle.serial_key or "",
            "purchase_date": bundle.purchase_date or "",
            "notes": bundle.notes or "",
            "product_count": len(products),
        })
    db.close()
    return jsonify(data)


@bp.route("/api/bundles", methods=["POST"])
def api_create_bundle():
    """Create a bundle."""
    db = _get_db()
    body = request.get_json(force=True)
    name = body.get("name", "").strip()
    if not name:
        db.close()
        return jsonify({"error": "name is required"}), 400

    bid = db.create_bundle(
        name=name,
        vendor=body.get("vendor") or None,
        source=body.get("source") or None,
        serial_key=body.get("serial_key") or None,
        purchase_date=body.get("purchase_date") or None,
        notes=body.get("notes") or None,
    )
    db.close()
    return jsonify({"ok": True, "id": bid}), 201


@bp.route("/api/bundles/<int:bundle_id>")
def api_bundle_detail(bundle_id: int):
    """Bundle detail with member products."""
    db = _get_db()
    bundle = db.get_bundle(bundle_id)
    if not bundle:
        db.close()
        return jsonify({"error": "not found"}), 404

    products = db.get_products_for_bundle(bundle_id)
    data = {
        "id": bundle.id,
        "name": bundle.name,
        "vendor": bundle.vendor or "",
        "source": bundle.source or "",
        "serial_key": bundle.serial_key or "",
        "purchase_date": bundle.purchase_date or "",
        "notes": bundle.notes or "",
        "products": [
            {
                "id": p.id,
                "name": p.name,
                "vendor": p.vendor or "",
                "status": p.status,
                "formats": p.formats,
            }
            for p in products
        ],
    }
    db.close()
    return jsonify(data)


@bp.route("/api/bundles/<int:bundle_id>", methods=["PUT"])
def api_update_bundle(bundle_id: int):
    """Update bundle fields."""
    db = _get_db()
    bundle = db.get_bundle(bundle_id)
    if not bundle:
        db.close()
        return jsonify({"error": "not found"}), 404

    body = request.get_json(force=True)
    kwargs = {}
    for field in (
        "name", "vendor", "source", "serial_key", "purchase_date", "notes",
    ):
        if field in body:
            val = body[field]
            # name must not be empty
            if field == "name" and not (val or "").strip():
                continue
            kwargs[field] = val or None

    db.update_bundle(bundle_id, **kwargs)
    db.close()
    return jsonify({"ok": True})


@bp.route("/api/bundles/<int:bundle_id>", methods=["DELETE"])
def api_delete_bundle(bundle_id: int):
    """Delete bundle (unlinks products)."""
    db = _get_db()
    if not db.delete_bundle(bundle_id):
        db.close()
        return jsonify({"error": "not found"}), 404
    db.close()
    return jsonify({"ok": True})


@bp.route("/api/bundles/<int:bundle_id>/products", methods=["POST"])
def api_add_products_to_bundle(bundle_id: int):
    """Batch add products to a bundle."""
    db = _get_db()
    bundle = db.get_bundle(bundle_id)
    if not bundle:
        db.close()
        return jsonify({"error": "not found"}), 404

    body = request.get_json(force=True)
    product_ids = body.get("product_ids", [])
    db.batch_set_product_bundle(product_ids, bundle_id)
    db.close()
    return jsonify({"ok": True})


@bp.route("/api/bundles/<int:bundle_id>/products", methods=["DELETE"])
def api_remove_products_from_bundle(bundle_id: int):
    """Batch remove products from a bundle."""
    db = _get_db()
    bundle = db.get_bundle(bundle_id)
    if not bundle:
        db.close()
        return jsonify({"error": "not found"}), 404

    body = request.get_json(force=True)
    product_ids = body.get("product_ids", [])
    db.batch_set_product_bundle(product_ids, None)
    db.close()
    return jsonify({"ok": True})


# --- API: Accounts ---


@bp.route("/api/accounts")
def api_accounts():
    """List all accounts with product counts."""
    db = _get_db()
    accounts = db.list_accounts()
    data = []
    for account in accounts:
        products = db.get_products_for_account(account.id)
        data.append({
            "id": account.id,
            "name": account.name,
            "email": account.email or "",
            "vendor_url": account.vendor_url or "",
            "notes": account.notes or "",
            "product_count": len(products),
        })
    db.close()
    return jsonify(data)


@bp.route("/api/accounts", methods=["POST"])
def api_create_account():
    """Create an account."""
    db = _get_db()
    body = request.get_json(force=True)
    name = body.get("name", "").strip()
    if not name:
        db.close()
        return jsonify({"error": "name is required"}), 400

    aid = db.create_account(
        name=name,
        email=body.get("email") or None,
        vendor_url=body.get("vendor_url") or None,
        notes=body.get("notes") or None,
    )
    db.close()
    return jsonify({"ok": True, "id": aid}), 201


@bp.route("/api/accounts/<int:account_id>")
def api_account_detail(account_id: int):
    """Account detail with member products."""
    db = _get_db()
    account = db.get_account(account_id)
    if not account:
        db.close()
        return jsonify({"error": "not found"}), 404

    products = db.get_products_for_account(account_id)
    data = {
        "id": account.id,
        "name": account.name,
        "email": account.email or "",
        "vendor_url": account.vendor_url or "",
        "notes": account.notes or "",
        "products": [
            {
                "id": p.id,
                "name": p.name,
                "vendor": p.vendor or "",
                "status": p.status,
                "formats": p.formats,
            }
            for p in products
        ],
    }
    db.close()
    return jsonify(data)


@bp.route("/api/accounts/<int:account_id>", methods=["PUT"])
def api_update_account(account_id: int):
    """Update account fields."""
    db = _get_db()
    account = db.get_account(account_id)
    if not account:
        db.close()
        return jsonify({"error": "not found"}), 404

    body = request.get_json(force=True)
    kwargs = {}
    for field in ("name", "email", "vendor_url", "notes"):
        if field in body:
            val = body[field]
            # name must not be empty
            if field == "name" and not (val or "").strip():
                continue
            kwargs[field] = val or None

    db.update_account(account_id, **kwargs)
    db.close()
    return jsonify({"ok": True})


@bp.route("/api/accounts/<int:account_id>", methods=["DELETE"])
def api_delete_account(account_id: int):
    """Delete account (unlinks products)."""
    db = _get_db()
    if not db.delete_account(account_id):
        db.close()
        return jsonify({"error": "not found"}), 404
    db.close()
    return jsonify({"ok": True})


# --- API: License Managers ---


@bp.route("/api/license-managers")
def api_license_managers():
    """List all license managers with product counts."""
    db = _get_db()
    license_managers = db.list_license_managers()
    data = []
    for lm in license_managers:
        products = db.get_products_for_license_manager(lm.id)
        data.append({
            "id": lm.id,
            "name": lm.name,
            "url": lm.url or "",
            "notes": lm.notes or "",
            "product_count": len(products),
        })
    db.close()
    return jsonify(data)


@bp.route("/api/license-managers", methods=["POST"])
def api_create_license_manager():
    """Create a license manager."""
    db = _get_db()
    body = request.get_json(force=True)
    name = body.get("name", "").strip()
    if not name:
        db.close()
        return jsonify({"error": "name is required"}), 400

    lmid = db.create_license_manager(
        name=name,
        url=body.get("url") or None,
        notes=body.get("notes") or None,
    )
    db.close()
    return jsonify({"ok": True, "id": lmid}), 201


@bp.route("/api/license-managers/<int:license_manager_id>")
def api_license_manager_detail(license_manager_id: int):
    """License manager detail with member products."""
    db = _get_db()
    lm = db.get_license_manager(license_manager_id)
    if not lm:
        db.close()
        return jsonify({"error": "not found"}), 404

    products = db.get_products_for_license_manager(license_manager_id)
    data = {
        "id": lm.id,
        "name": lm.name,
        "url": lm.url or "",
        "notes": lm.notes or "",
        "products": [
            {
                "id": p.id,
                "name": p.name,
                "vendor": p.vendor or "",
                "status": p.status,
                "formats": p.formats,
            }
            for p in products
        ],
    }
    db.close()
    return jsonify(data)


@bp.route("/api/license-managers/<int:license_manager_id>", methods=["PUT"])
def api_update_license_manager(license_manager_id: int):
    """Update license manager fields."""
    db = _get_db()
    lm = db.get_license_manager(license_manager_id)
    if not lm:
        db.close()
        return jsonify({"error": "not found"}), 404

    body = request.get_json(force=True)
    kwargs = {}
    for field in ("name", "url", "notes"):
        if field in body:
            val = body[field]
            # name must not be empty
            if field == "name" and not (val or "").strip():
                continue
            kwargs[field] = val or None

    db.update_license_manager(license_manager_id, **kwargs)
    db.close()
    return jsonify({"ok": True})


@bp.route("/api/license-managers/<int:license_manager_id>", methods=["DELETE"])
def api_delete_license_manager(license_manager_id: int):
    """Delete license manager (unlinks products)."""
    db = _get_db()
    if not db.delete_license_manager(license_manager_id):
        db.close()
        return jsonify({"error": "not found"}), 404
    db.close()
    return jsonify({"ok": True})


# --- API: Sources ---


@bp.route("/api/sources")
def api_sources():
    """List all sources with product counts."""
    db = _get_db()
    sources = db.list_sources()
    data = []
    for source in sources:
        products = db.get_products_for_source(source.id)
        data.append({
            "id": source.id,
            "name": source.name,
            "email": source.email or "",
            "url": source.url or "",
            "notes": source.notes or "",
            "product_count": len(products),
        })
    db.close()
    return jsonify(data)


@bp.route("/api/sources", methods=["POST"])
def api_create_source():
    """Create a source."""
    db = _get_db()
    body = request.get_json(force=True)
    name = body.get("name", "").strip()
    if not name:
        db.close()
        return jsonify({"error": "name is required"}), 400

    sid = db.create_source(
        name=name,
        email=body.get("email") or None,
        url=body.get("url") or None,
        notes=body.get("notes") or None,
    )
    db.close()
    return jsonify({"ok": True, "id": sid}), 201


@bp.route("/api/sources/<int:source_id>")
def api_source_detail(source_id: int):
    """Source detail with member products."""
    db = _get_db()
    source = db.get_source(source_id)
    if not source:
        db.close()
        return jsonify({"error": "not found"}), 404

    products = db.get_products_for_source(source_id)
    data = {
        "id": source.id,
        "name": source.name,
        "email": source.email or "",
        "url": source.url or "",
        "notes": source.notes or "",
        "products": [
            {
                "id": p.id,
                "name": p.name,
                "vendor": p.vendor or "",
                "status": p.status,
                "formats": p.formats,
            }
            for p in products
        ],
    }
    db.close()
    return jsonify(data)


@bp.route("/api/sources/<int:source_id>", methods=["PUT"])
def api_update_source(source_id: int):
    """Update source fields."""
    db = _get_db()
    source = db.get_source(source_id)
    if not source:
        db.close()
        return jsonify({"error": "not found"}), 404

    body = request.get_json(force=True)
    kwargs = {}
    for field in ("name", "email", "url", "notes"):
        if field in body:
            val = body[field]
            # name must not be empty
            if field == "name" and not (val or "").strip():
                continue
            kwargs[field] = val or None

    db.update_source(source_id, **kwargs)
    db.close()
    return jsonify({"ok": True})


@bp.route("/api/sources/<int:source_id>", methods=["DELETE"])
def api_delete_source(source_id: int):
    """Delete source (unlinks products)."""
    db = _get_db()
    if not db.delete_source(source_id):
        db.close()
        return jsonify({"error": "not found"}), 404
    db.close()
    return jsonify({"ok": True})


# --- API: Scan ---


@bp.route("/api/scan", methods=["POST"])
def api_scan():
    """Trigger a plugin scan."""
    db = _get_db()

    plugins = scan_all()
    groups = deduplicate(plugins)

    db.mark_all_absent()

    existing_ids = db.get_all_product_ids()

    seen_product_ids: set[int] = set()
    with db.batch():
        for group in groups:
            name = pick_best_name(group)
            vendor = pick_best_vendor(group)
            category = infer_category(group)

            product_id = db.upsert_product(name, vendor, category)
            seen_product_ids.add(product_id)

            for plugin in group:
                db.upsert_installation(
                    product_id=product_id,
                    fmt=plugin.format,
                    path=str(plugin.path),
                    bundle_id=plugin.bundle_id,
                    version=plugin.version,
                    au_type=plugin.au_type,
                    au_subtype=plugin.au_subtype,
                    au_manufacturer=plugin.au_manufacturer,
                    vendor_from_plist=plugin.vendor,
                    copyright_str=plugin.copyright,
                    min_macos_version=plugin.min_macos_version,
                )

    new_products = len(seen_product_ids - existing_ids)
    removed = db.count_absent()

    result = ScanResult(
        plugins_found=len(plugins),
        products_found=len(seen_product_ids),
        new_plugins=new_products,
        removed_plugins=removed,
    )
    db.record_scan(result)
    db.close()

    return jsonify(
        {
            "plugins_found": result.plugins_found,
            "products_found": result.products_found,
            "new_plugins": result.new_plugins,
            "removed_plugins": result.removed_plugins,
        }
    )


# --- API: Export ---


@bp.route("/api/export/<fmt>")
def api_export(fmt: str):
    """Export inventory as JSON or CSV download."""
    from audio_inventory.export import export_csv, export_json

    db = _get_db()

    if fmt not in ("json", "csv"):
        db.close()
        return jsonify({"error": "format must be json or csv"}), 400

    if fmt == "json":
        data = export_json(db)
        mimetype = "application/json"
        filename = "inventory.json"
    else:
        data = export_csv(db)
        mimetype = "text/csv"
        filename = "inventory.csv"

    db.close()
    return current_app.response_class(
        data,
        mimetype=mimetype,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@bp.route("/api/status")
def api_status():
    """Return inventory summary stats."""
    db = _get_db()
    products = db.list_products()

    status_counts: dict[str, int] = {}
    vendor_counts: dict[str, int] = {}
    cat_counts: dict[str, int] = {}

    for p in products:
        status_counts[p.status] = status_counts.get(p.status, 0) + 1
        v = p.vendor or "Unknown"
        vendor_counts[v] = vendor_counts.get(v, 0) + 1
        c = p.category or "unknown"
        cat_counts[c] = cat_counts.get(c, 0) + 1

    last_scan = db.get_last_scan()
    db.close()

    return jsonify(
        {
            "total_products": len(products),
            "total_vendors": len(vendor_counts),
            "status_counts": status_counts,
            "vendor_counts": vendor_counts,
            "category_counts": cat_counts,
            "last_scan": last_scan.timestamp if last_scan else None,
        }
    )
