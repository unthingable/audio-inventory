"""CLI interface for the audio plugin inventory."""

from __future__ import annotations

import logging
from pathlib import Path

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from audio_inventory.db import DEFAULT_DATA_PATH, Database
from audio_inventory.dedup import (
    deduplicate,
    infer_category,
    pick_best_name,
    pick_best_vendor,
)
from audio_inventory.export import export_csv, export_json
from audio_inventory.models import Account, Bundle, LicenseManager, Product, ScanResult, Source
from audio_inventory.scanner import scan_all

console = Console()


@click.group()
@click.option("--db", "db_path", type=click.Path(), default=None, help="Database path")
@click.option("-v", "--verbose", is_flag=True, help="Verbose output")
@click.pass_context
def cli(ctx: click.Context, db_path: str | None, verbose: bool) -> None:
    """Audio plugin inventory and license tracker."""
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.WARNING,
        format="%(levelname)s: %(message)s",
    )
    ctx.ensure_object(dict)
    ctx.obj["db_path"] = Path(db_path) if db_path else DEFAULT_DATA_PATH


def _get_db(ctx: click.Context) -> Database:
    return Database(ctx.obj["db_path"])


def _prompt_selection(items: list, label: str = "") -> object | None:
    """Prompt user to select from multiple matches. Returns None on abort."""
    if len(items) == 1:
        return items[0]

    for i, item in enumerate(items, 1):
        name = getattr(item, "name", str(item))
        vendor = getattr(item, "vendor", None) or "?"
        extra = f" [{item.status}]" if hasattr(item, "status") and label == "product" else ""
        console.print(f"  {i}. {name} ({vendor}){extra}")
    console.print()

    try:
        choice = click.prompt("Select", type=int, default=1)
        if choice < 1 or choice > len(items):
            console.print("Invalid choice", style="red")
            return None
        return items[choice - 1]
    except (click.Abort, EOFError):
        return None


def _select_product(db: Database, name: str) -> Product | None:
    """Search for a product by name and prompt if multiple matches."""
    products = db.search_products(name)
    if not products:
        console.print(f"No product found matching '{name}'", style="red")
        return None
    if len(products) > 1:
        console.print(f"Found {len(products)} matches for '{name}':\n")
    return _prompt_selection(products, "product")


def _select_bundle(db: Database, name: str) -> Bundle | None:
    """Search for a bundle by name and prompt if multiple matches."""
    return _select_by_name(db.list_bundles(), name, "bundle")


def _select_by_name(items: list, name: str, label: str) -> object | None:
    """Search a list of named entities by substring match and prompt if ambiguous."""
    q = name.lower()
    matches = [item for item in items if q in item.name.lower()]
    if not matches:
        console.print(f"No {label} found matching '{name}'", style="red")
        return None
    if len(matches) > 1:
        console.print(f"Found {len(matches)} matches for '{name}':\n")
    return _prompt_selection(matches)


def _select_account(db: Database, name: str) -> Account | None:
    """Search for an account by name and prompt if multiple matches."""
    return _select_by_name(db.list_accounts(), name, "account")


def _select_manager(db: Database, name: str) -> LicenseManager | None:
    """Search for a license manager by name and prompt if multiple matches."""
    return _select_by_name(db.list_license_managers(), name, "license manager")


def _select_source(db: Database, name: str) -> Source | None:
    """Search for a source by name and prompt if multiple matches."""
    return _select_by_name(db.list_sources(), name, "source")


# --- scan ---


@cli.command()
@click.pass_context
def scan(ctx: click.Context) -> None:
    """Scan the system for installed audio plugins."""
    db = _get_db(ctx)

    console.print("Scanning plugin directories...", style="bold")
    plugins = scan_all()

    if not plugins:
        console.print("No plugins found.", style="yellow")
        return

    console.print(f"Found {len(plugins)} plugin bundles", style="dim")

    # Deduplicate across formats
    groups = deduplicate(plugins)

    # Mark everything absent before upserting (to detect removals)
    db.mark_all_absent()

    # Track which product IDs existed before this scan
    existing_ids = db.get_all_product_ids()

    seen_product_ids: set[int] = set()
    total_installations = 0

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
                total_installations += 1
        db.refresh_installed_flags()

    new_products = len(seen_product_ids - existing_ids)
    removed = db.count_absent()
    unique_products = len(seen_product_ids)

    console.print(f"Identified {unique_products} unique products", style="dim")

    result = ScanResult(
        plugins_found=len(plugins),
        products_found=unique_products,
        new_plugins=new_products,
        removed_plugins=removed,
    )
    db.record_scan(result)

    # Summary
    console.print()
    table = Table(title="Scan Summary", show_header=False, border_style="dim")
    table.add_column("Metric", style="bold")
    table.add_column("Value", justify="right")
    table.add_row("Plugin bundles scanned", str(len(plugins)))
    table.add_row("Unique products", str(unique_products))
    table.add_row("New products", str(new_products))
    table.add_row("Removed plugins", str(removed))
    table.add_row("Data file", str(db.data_path))
    console.print(table)

    # Format breakdown
    fmt_counts: dict[str, int] = {}
    for p in plugins:
        fmt_counts[p.format] = fmt_counts.get(p.format, 0) + 1

    fmt_table = Table(title="By Format", show_header=True, border_style="dim")
    fmt_table.add_column("Format")
    fmt_table.add_column("Count", justify="right")
    for fmt in sorted(fmt_counts):
        fmt_table.add_row(fmt.upper(), str(fmt_counts[fmt]))
    console.print(fmt_table)

    db.close()


# --- list ---


@cli.command("list")
@click.option("--vendor", "-V", default=None, help="Filter by vendor name")
@click.option(
    "--format",
    "-f",
    "fmt",
    default=None,
    help="Filter by format (vst2, vst3, au, clap)",
)
@click.option(
    "--category", "-c", default=None, help="Filter by category (instrument, effect)"
)
@click.option(
    "--licensed", is_flag=True, default=False, help="Only show products with licenses"
)
@click.option(
    "--unlicensed",
    is_flag=True,
    default=False,
    help="Only show products without licenses",
)
@click.option(
    "--status",
    "-s",
    default=None,
    help="Filter by status (unknown, licensed, demo, free, subscription, bundled)",
)
@click.option(
    "--missing", is_flag=True, default=False, help="Only show removed/missing plugins"
)
@click.pass_context
def list_cmd(
    ctx: click.Context,
    vendor: str | None,
    fmt: str | None,
    category: str | None,
    licensed: bool,
    unlicensed: bool,
    status: str | None,
    missing: bool,
) -> None:
    """List all tracked audio plugins."""
    db = _get_db(ctx)

    has_license: bool | None = None
    if licensed:
        has_license = True
    elif unlicensed:
        has_license = False

    products = db.list_products(
        vendor=vendor,
        fmt=fmt,
        category=category,
        status=status,
        has_license=has_license,
        missing=missing,
    )

    if not products:
        console.print("No products found matching filters.", style="yellow")
        db.close()
        return

    table = Table(title=f"Audio Plugins ({len(products)})", border_style="dim")
    table.add_column("#", style="dim", justify="right")
    table.add_column("Name", style="bold")
    table.add_column("Vendor")
    table.add_column("Category")
    table.add_column("Formats")
    table.add_column("Version")
    table.add_column("Status", justify="center")
    table.add_column("Inst.", justify="center")

    _STATUS_STYLE = {
        "licensed": "green",
        "demo": "yellow",
        "free": "cyan",
        "subscription": "blue",
        "bundled": "magenta",
        "unknown": "dim",
    }

    for i, p in enumerate(products, 1):
        formats = " ".join(f.upper() for f in p.formats)
        version = p.current_version or ""
        cat = p.category or ""
        style = _STATUS_STYLE.get(p.status, "dim")
        status_display = p.status if p.status != "unknown" else ""

        table.add_row(
            str(i),
            p.name,
            p.vendor or "?",
            cat,
            formats,
            version,
            f"[{style}]{status_display}[/{style}]" if status_display else "",
            "[green]Y[/green]" if p.installed else "[dim]N[/dim]",
        )

    console.print(table)

    # Show vendor summary
    vendor_counts: dict[str, int] = {}
    for p in products:
        v = p.vendor or "Unknown"
        vendor_counts[v] = vendor_counts.get(v, 0) + 1

    if len(vendor_counts) > 1:
        console.print(f"\n[dim]{len(vendor_counts)} vendors[/dim]")

    db.close()


# --- show ---


@cli.command()
@click.argument("name")
@click.pass_context
def show(ctx: click.Context, name: str) -> None:
    """Show details for a specific plugin."""
    db = _get_db(ctx)
    product = _select_product(db, name)
    if not product:
        db.close()
        return

    def _resolve_name(entity_id, getter):
        if not entity_id:
            return None
        entity = getter(entity_id)
        return entity.name if entity else None

    _display_product(
        product,
        bundle_name=_resolve_name(product.bundle_id, db.get_bundle),
        account_name=_resolve_name(product.account_id, db.get_account),
        manager_name=_resolve_name(product.license_manager_id, db.get_license_manager),
        source_name=_resolve_name(product.source_id, db.get_source),
    )
    db.close()


def _display_product(
    product: Product,
    bundle_name: str | None = None,
    account_name: str | None = None,
    manager_name: str | None = None,
    source_name: str | None = None,
) -> None:
    """Render full product details."""
    title = product.name
    if product.vendor:
        title += f"  by {product.vendor}"

    lines: list[str] = []
    lines.append(f"[bold]Category:[/bold] {product.category or 'unknown'}")
    lines.append(f"[bold]Status:[/bold]   {product.status}")
    lines.append(f"[bold]Installed:[/bold] {'Yes' if product.installed else 'No'}")
    if bundle_name:
        lines.append(f"[bold]Bundle:[/bold]   {bundle_name}")
    if account_name:
        lines.append(f"[bold]Account:[/bold]  {account_name}")
    if manager_name:
        lines.append(f"[bold]Manager:[/bold]  {manager_name}")
    if source_name:
        lines.append(f"[bold]Source:[/bold]   {source_name}")
    if product.notes:
        lines.append(f"[bold]Notes:[/bold]    {product.notes}")

    # Installations
    lines.append("")
    lines.append("[bold underline]Installations[/bold underline]")
    for inst in product.installations:
        present = "" if inst.is_present else " [red](REMOVED)[/red]"
        lines.append(f"  [{inst.format.upper()}] v{inst.version or '?'}{present}")
        lines.append(f"    [dim]{inst.path}[/dim]")
        if inst.bundle_id:
            lines.append(f"    [dim]ID: {inst.bundle_id}[/dim]")
        if inst.au_type:
            lines.append(
                f"    [dim]AU: {inst.au_type}/{inst.au_subtype}/{inst.au_manufacturer}[/dim]"
            )

    # Licenses
    lines.append("")
    lines.append("[bold underline]Licenses[/bold underline]")
    if product.licenses:
        for lic in product.licenses:
            if lic.serial_key:
                lines.append(f"  Key: {lic.serial_key}")
            lic_mgr = manager_name or lic.license_manager
            if lic_mgr:
                lines.append(f"  Manager: {lic_mgr}")
            if lic.purchase_date:
                lines.append(f"  Purchased: {lic.purchase_date}")
            if lic.vendor_url:
                lines.append(f"  Account: {lic.vendor_url}")
            if lic.notes:
                lines.append(f"  Notes: {lic.notes}")
    else:
        lines.append("  [dim]No license info recorded[/dim]")

    panel = Panel("\n".join(lines), title=title, border_style="blue")
    console.print(panel)


# --- delete ---


@cli.command("delete")
@click.argument("product_id", type=int)
@click.pass_context
def delete_product(ctx: click.Context, product_id: int) -> None:
    """Delete a product by ID."""
    db = _get_db(ctx)
    product = db.get_product(product_id)
    if not product:
        console.print(f"Product {product_id} not found", style="red")
        db.close()
        return

    console.print(f"Product: [bold]{product.name}[/bold] ({product.vendor or '?'})")
    if not click.confirm("Delete this product and all its installations/licenses?"):
        console.print("Cancelled", style="yellow")
        db.close()
        return

    db.delete_product(product_id)
    console.print(f"Deleted product {product_id}: {product.name}", style="green")
    db.close()


# --- merge ---


@cli.command("merge")
@click.argument("keep_id", type=int)
@click.argument("remove_id", type=int)
@click.pass_context
def merge_products(ctx: click.Context, keep_id: int, remove_id: int) -> None:
    """Merge two products (remove into keep)."""
    db = _get_db(ctx)
    keep = db.get_product(keep_id)
    remove = db.get_product(remove_id)
    if not keep:
        console.print(f"Product {keep_id} not found", style="red")
        db.close()
        return
    if not remove:
        console.print(f"Product {remove_id} not found", style="red")
        db.close()
        return

    keep_has_installations = any(i.is_present for i in keep.installations)
    remove_has_installations = any(i.is_present for i in remove.installations)
    if keep_has_installations and remove_has_installations:
        console.print(
            "Cannot merge: both products have active installations (scanned plugins). "
            "Remove one product's installations first.",
            style="red",
        )
        db.close()
        return

    console.print(f"Keep:   [bold]{keep.name}[/bold] ({keep.vendor or '?'}) [id={keep_id}]")
    console.print(f"Remove: [bold]{remove.name}[/bold] ({remove.vendor or '?'}) [id={remove_id}]")
    if not click.confirm("Merge remove into keep?"):
        console.print("Cancelled", style="yellow")
        db.close()
        return

    db.merge_products(keep_id, remove_id)
    console.print(f"Merged {remove.name} into {keep.name}", style="green")
    db.close()


# --- set-status ---

VALID_STATUSES = ("unknown", "licensed", "demo", "free", "subscription", "bundled")


@cli.command("set-status")
@click.argument("name")
@click.argument("status", type=click.Choice(VALID_STATUSES))
@click.pass_context
def set_status(ctx: click.Context, name: str, status: str) -> None:
    """Set the status of a plugin (licensed, demo, free, etc.)."""
    db = _get_db(ctx)
    product = _select_product(db, name)
    if not product:
        db.close()
        return

    old_status = product.status
    db.update_product(product.id, status=status)  # type: ignore[arg-type]
    console.print(
        f"[bold]{product.name}[/bold]: {old_status} -> [green]{status}[/green]"
    )
    db.close()


# --- license ---


@cli.group()
def license() -> None:
    """Manage plugin licenses."""
    pass


@license.command("add")
@click.argument("product_name")
@click.option("--key", "-k", default=None, help="Serial key / license code")
@click.option(
    "--manager", "-m", default=None, help="License manager (iLok, Native Access, etc.)"
)
@click.option(
    "--date", "-d", "purchase_date", default=None, help="Purchase date (YYYY-MM-DD)"
)
@click.option("--url", "-u", default=None, help="Vendor account URL")
@click.option("--file", "-f", "license_file", default=None, help="Path to license file")
@click.option("--email", "-e", default=None, help="Account email")
@click.option("--source", "-s", default=None, help="Purchase source / store")
@click.option("--notes", "-n", default=None, help="Additional notes")
@click.pass_context
def license_add(
    ctx: click.Context,
    product_name: str,
    key: str | None,
    manager: str | None,
    purchase_date: str | None,
    url: str | None,
    license_file: str | None,
    email: str | None,
    source: str | None,
    notes: str | None,
) -> None:
    """Add license info for a plugin."""
    db = _get_db(ctx)
    product = _select_product(db, product_name)
    if not product:
        console.print("Run 'audio-inventory scan' first to populate the database.")
        db.close()
        return

    # Interactive prompts for missing info
    if key is None:
        key = click.prompt(
            "Serial key (or press Enter to skip)", default="", show_default=False
        )
        key = key.strip() or None

    if manager is None:
        manager = click.prompt(
            "License manager (iLok / Native Access / Splice / none)",
            default="",
            show_default=False,
        )
        manager = manager.strip() or None

    if purchase_date is None:
        purchase_date = click.prompt(
            "Purchase date YYYY-MM-DD (or press Enter to skip)",
            default="",
            show_default=False,
        )
        purchase_date = purchase_date.strip() or None

    if url is None:
        url = click.prompt(
            "Vendor account URL (or press Enter to skip)",
            default="",
            show_default=False,
        )
        url = url.strip() or None

    if notes is None:
        notes = click.prompt(
            "Notes (or press Enter to skip)", default="", show_default=False
        )
        notes = notes.strip() or None

    lm_text = manager
    if manager:
        lm_entity = db.find_license_manager_by_name(manager)
        if lm_entity and not product.license_manager_id:
            db.set_product_license_manager(product.id, lm_entity.id)
            lm_text = None

    license_id = db.add_license(
        product_id=product.id,  # type: ignore[arg-type]
        serial_key=key,
        license_file_path=license_file,
        purchase_date=purchase_date,
        vendor_url=url,
        license_manager=lm_text,
        email=email,
        source=source,
        notes=notes,
    )

    console.print(
        f"\nLicense added for [bold]{product.name}[/bold] (id={license_id})",
        style="green",
    )
    db.close()


@license.command("list")
@click.option("--vendor", "-V", default=None, help="Filter by vendor")
@click.option(
    "--all",
    "show_all",
    is_flag=True,
    help="Show all products (including those without licenses)",
)
@click.pass_context
def license_list(ctx: click.Context, vendor: str | None, show_all: bool) -> None:
    """List products and their license status."""
    db = _get_db(ctx)

    has_license = None if show_all else True
    products = db.list_products(vendor=vendor, has_license=has_license)

    if not products:
        console.print("No products found.", style="yellow")
        db.close()
        return

    lm_names = {lm.id: lm.name for lm in db.list_license_managers()}

    table = Table(title="License Status", border_style="dim")
    table.add_column("#", style="dim", justify="right")
    table.add_column("Product", style="bold")
    table.add_column("Vendor")
    table.add_column("Key", max_width=30)
    table.add_column("Manager")
    table.add_column("Email")
    table.add_column("Purchased")

    for i, p in enumerate(products, 1):
        mgr_display = lm_names.get(p.license_manager_id, "") if p.license_manager_id else ""
        if p.licenses:
            lic = p.licenses[0]
            key_display = (lic.serial_key or "")[:30]
            if not mgr_display:
                mgr_display = lic.license_manager or ""
            table.add_row(
                str(i),
                p.name,
                p.vendor or "?",
                key_display,
                mgr_display,
                lic.email or "",
                lic.purchase_date or "",
            )
        else:
            table.add_row(
                str(i),
                p.name,
                p.vendor or "?",
                "",
                mgr_display,
                "",
                "",
            )

    console.print(table)
    db.close()


# --- bundle ---


@cli.group()
def bundle() -> None:
    """Manage plugin bundles / suites."""
    pass


@bundle.command("create")
@click.argument("name")
@click.option("--vendor", "-V", default=None, help="Bundle vendor")
@click.option("--source", "-s", default=None, help="Purchase source / store")
@click.option("--key", "-k", default=None, help="Serial key")
@click.option("--date", "-d", "purchase_date", default=None, help="Purchase date (YYYY-MM-DD)")
@click.option("--notes", "-n", default=None, help="Additional notes")
@click.pass_context
def bundle_create(
    ctx: click.Context,
    name: str,
    vendor: str | None,
    source: str | None,
    key: str | None,
    purchase_date: str | None,
    notes: str | None,
) -> None:
    """Create a new bundle / suite."""
    db = _get_db(ctx)

    bundle_id = db.create_bundle(
        name=name,
        vendor=vendor,
        source=source,
        serial_key=key,
        purchase_date=purchase_date,
        notes=notes,
    )

    console.print(
        f"Bundle [bold]{name}[/bold] created (id={bundle_id})", style="green"
    )
    db.close()


@bundle.command("list")
@click.pass_context
def bundle_list(ctx: click.Context) -> None:
    """List all bundles."""
    db = _get_db(ctx)
    bundles = db.list_bundles()

    if not bundles:
        console.print("No bundles found.", style="yellow")
        db.close()
        return

    table = Table(title=f"Bundles ({len(bundles)})", border_style="dim")
    table.add_column("#", style="dim", justify="right")
    table.add_column("Name", style="bold")
    table.add_column("Vendor")
    table.add_column("Products", justify="right")
    table.add_column("Source")

    for i, bun in enumerate(bundles, 1):
        product_count = len(db.get_products_for_bundle(bun.id))  # type: ignore[arg-type]
        table.add_row(
            str(i),
            bun.name,
            bun.vendor or "",
            str(product_count),
            bun.source or "",
        )

    console.print(table)
    db.close()


@bundle.command("show")
@click.argument("name")
@click.pass_context
def bundle_show(ctx: click.Context, name: str) -> None:
    """Show details for a specific bundle."""
    db = _get_db(ctx)
    bun = _select_bundle(db, name)
    if not bun:
        db.close()
        return

    title = bun.name
    if bun.vendor:
        title += f"  by {bun.vendor}"

    lines: list[str] = []
    if bun.source:
        lines.append(f"[bold]Source:[/bold]   {bun.source}")
    if bun.serial_key:
        lines.append(f"[bold]Key:[/bold]      {bun.serial_key}")
    if bun.purchase_date:
        lines.append(f"[bold]Purchased:[/bold] {bun.purchase_date}")
    if bun.notes:
        lines.append(f"[bold]Notes:[/bold]    {bun.notes}")

    lines.append("")
    lines.append("[bold underline]Products[/bold underline]")
    products = db.get_products_for_bundle(bun.id)  # type: ignore[arg-type]
    if products:
        for p in products:
            lines.append(f"  {p.name} ({p.vendor or '?'})")
    else:
        lines.append("  [dim]No products assigned[/dim]")

    panel = Panel("\n".join(lines), title=title, border_style="blue")
    console.print(panel)
    db.close()


@bundle.command("delete")
@click.argument("name")
@click.pass_context
def bundle_delete(ctx: click.Context, name: str) -> None:
    """Delete a bundle."""
    db = _get_db(ctx)
    bun = _select_bundle(db, name)
    if not bun:
        db.close()
        return

    if not click.confirm(f"Delete bundle '{bun.name}'?"):
        console.print("Cancelled", style="yellow")
        db.close()
        return

    success = db.delete_bundle(bun.id)  # type: ignore[arg-type]
    if success:
        console.print(f"Bundle [bold]{bun.name}[/bold] deleted", style="green")
    else:
        console.print("Failed to delete bundle", style="red")

    db.close()


@bundle.command("add-products")
@click.argument("bundle_name")
@click.argument("product_names", nargs=-1, required=True)
@click.pass_context
def bundle_add_products(
    ctx: click.Context, bundle_name: str, product_names: tuple[str, ...]
) -> None:
    """Add products to a bundle."""
    db = _get_db(ctx)
    bun = _select_bundle(db, bundle_name)
    if not bun:
        db.close()
        return

    product_ids: list[int] = []
    for product_name in product_names:
        product = _select_product(db, product_name)
        if not product:
            continue
        product_ids.append(product.id)  # type: ignore[arg-type]

    if not product_ids:
        console.print("No products to add", style="yellow")
        db.close()
        return

    db.batch_set_product_bundle(product_ids, bun.id)  # type: ignore[arg-type]
    console.print(
        f"Added {len(product_ids)} product(s) to bundle [bold]{bun.name}[/bold]",
        style="green",
    )
    db.close()


# --- account ---


@cli.group()
def account() -> None:
    """Manage vendor accounts."""
    pass


@account.command("create")
@click.argument("name")
@click.option("--email", "-e", default=None, help="Account email")
@click.option("--url", "-u", default=None, help="Vendor account URL")
@click.option("--notes", "-n", default=None, help="Additional notes")
@click.pass_context
def account_create(
    ctx: click.Context,
    name: str,
    email: str | None,
    url: str | None,
    notes: str | None,
) -> None:
    """Create a new vendor account."""
    db = _get_db(ctx)

    account_id = db.create_account(
        name=name,
        email=email,
        vendor_url=url,
        notes=notes,
    )

    console.print(
        f"Account [bold]{name}[/bold] created (id={account_id})", style="green"
    )
    db.close()


@account.command("list")
@click.pass_context
def account_list(ctx: click.Context) -> None:
    """List all accounts."""
    db = _get_db(ctx)
    accounts = db.list_accounts()

    if not accounts:
        console.print("No accounts found.", style="yellow")
        db.close()
        return

    table = Table(title=f"Accounts ({len(accounts)})", border_style="dim")
    table.add_column("#", style="dim", justify="right")
    table.add_column("Name", style="bold")
    table.add_column("Email")
    table.add_column("URL")
    table.add_column("Products", justify="right")

    for i, acct in enumerate(accounts, 1):
        product_count = len(db.get_products_for_account(acct.id))  # type: ignore[arg-type]
        table.add_row(
            str(i),
            acct.name,
            acct.email or "",
            acct.vendor_url or "",
            str(product_count),
        )

    console.print(table)
    db.close()


@account.command("show")
@click.argument("name")
@click.pass_context
def account_show(ctx: click.Context, name: str) -> None:
    """Show details for a specific account."""
    db = _get_db(ctx)
    acct = _select_account(db, name)
    if not acct:
        db.close()
        return

    title = acct.name

    lines: list[str] = []
    if acct.email:
        lines.append(f"[bold]Email:[/bold] {acct.email}")
    if acct.vendor_url:
        lines.append(f"[bold]URL:[/bold]   {acct.vendor_url}")
    if acct.notes:
        lines.append(f"[bold]Notes:[/bold] {acct.notes}")

    lines.append("")
    lines.append("[bold underline]Products[/bold underline]")
    products = db.get_products_for_account(acct.id)  # type: ignore[arg-type]
    if products:
        for p in products:
            lines.append(f"  {p.name} ({p.vendor or '?'})")
    else:
        lines.append("  [dim]No products linked[/dim]")

    panel = Panel("\n".join(lines), title=title, border_style="blue")
    console.print(panel)
    db.close()


@account.command("delete")
@click.argument("name")
@click.pass_context
def account_delete(ctx: click.Context, name: str) -> None:
    """Delete an account."""
    db = _get_db(ctx)
    acct = _select_account(db, name)
    if not acct:
        db.close()
        return

    if not click.confirm(f"Delete account '{acct.name}'?"):
        console.print("Cancelled", style="yellow")
        db.close()
        return

    success = db.delete_account(acct.id)  # type: ignore[arg-type]
    if success:
        console.print(f"Account [bold]{acct.name}[/bold] deleted", style="green")
    else:
        console.print("Failed to delete account", style="red")

    db.close()


# --- manager ---


@cli.group()
def manager() -> None:
    """Manage license managers."""
    pass


@manager.command("create")
@click.argument("name")
@click.option("--url", "-u", default=None, help="License manager URL")
@click.option("--notes", "-n", default=None, help="Additional notes")
@click.pass_context
def manager_create(
    ctx: click.Context,
    name: str,
    url: str | None,
    notes: str | None,
) -> None:
    """Create a new license manager."""
    db = _get_db(ctx)

    manager_id = db.create_license_manager(
        name=name,
        url=url,
        notes=notes,
    )

    console.print(
        f"License manager [bold]{name}[/bold] created (id={manager_id})", style="green"
    )
    db.close()


@manager.command("list")
@click.pass_context
def manager_list(ctx: click.Context) -> None:
    """List all license managers."""
    db = _get_db(ctx)
    managers = db.list_license_managers()

    if not managers:
        console.print("No license managers found.", style="yellow")
        db.close()
        return

    table = Table(title=f"License Managers ({len(managers)})", border_style="dim")
    table.add_column("#", style="dim", justify="right")
    table.add_column("Name", style="bold")
    table.add_column("URL")
    table.add_column("Products", justify="right")

    for i, mgr in enumerate(managers, 1):
        product_count = len(db.get_products_for_license_manager(mgr.id))  # type: ignore[arg-type]
        table.add_row(
            str(i),
            mgr.name,
            mgr.url or "",
            str(product_count),
        )

    console.print(table)
    db.close()


@manager.command("show")
@click.argument("name")
@click.pass_context
def manager_show(ctx: click.Context, name: str) -> None:
    """Show details for a specific license manager."""
    db = _get_db(ctx)
    mgr = _select_manager(db, name)
    if not mgr:
        db.close()
        return

    title = mgr.name

    lines: list[str] = []
    if mgr.url:
        lines.append(f"[bold]URL:[/bold]   {mgr.url}")
    if mgr.notes:
        lines.append(f"[bold]Notes:[/bold] {mgr.notes}")

    lines.append("")
    lines.append("[bold underline]Products[/bold underline]")
    products = db.get_products_for_license_manager(mgr.id)  # type: ignore[arg-type]
    if products:
        for p in products:
            lines.append(f"  {p.name} ({p.vendor or '?'})")
    else:
        lines.append("  [dim]No products linked[/dim]")

    panel = Panel("\n".join(lines), title=title, border_style="blue")
    console.print(panel)
    db.close()


@manager.command("delete")
@click.argument("name")
@click.pass_context
def manager_delete(ctx: click.Context, name: str) -> None:
    """Delete a license manager."""
    db = _get_db(ctx)
    mgr = _select_manager(db, name)
    if not mgr:
        db.close()
        return

    if not click.confirm(f"Delete license manager '{mgr.name}'?"):
        console.print("Cancelled", style="yellow")
        db.close()
        return

    success = db.delete_license_manager(mgr.id)  # type: ignore[arg-type]
    if success:
        console.print(f"License manager [bold]{mgr.name}[/bold] deleted", style="green")
    else:
        console.print("Failed to delete license manager", style="red")

    db.close()


# --- source ---


@cli.group()
def source() -> None:
    """Manage purchase sources."""
    pass


@source.command("create")
@click.argument("name")
@click.option("--email", "-e", default=None, help="Account email for this source")
@click.option("--url", "-u", default=None, help="Source URL")
@click.option("--notes", "-n", default=None, help="Additional notes")
@click.pass_context
def source_create(
    ctx: click.Context,
    name: str,
    email: str | None,
    url: str | None,
    notes: str | None,
) -> None:
    """Create a new purchase source."""
    db = _get_db(ctx)

    source_id = db.create_source(
        name=name,
        email=email,
        url=url,
        notes=notes,
    )

    console.print(
        f"Source [bold]{name}[/bold] created (id={source_id})", style="green"
    )
    db.close()


@source.command("list")
@click.pass_context
def source_list(ctx: click.Context) -> None:
    """List all sources."""
    db = _get_db(ctx)
    sources = db.list_sources()

    if not sources:
        console.print("No sources found.", style="yellow")
        db.close()
        return

    table = Table(title=f"Sources ({len(sources)})", border_style="dim")
    table.add_column("#", style="dim", justify="right")
    table.add_column("Name", style="bold")
    table.add_column("Email")
    table.add_column("URL")
    table.add_column("Products", justify="right")

    for i, src in enumerate(sources, 1):
        product_count = len(db.get_products_for_source(src.id))  # type: ignore[arg-type]
        table.add_row(
            str(i),
            src.name,
            src.email or "",
            src.url or "",
            str(product_count),
        )

    console.print(table)
    db.close()


@source.command("show")
@click.argument("name")
@click.pass_context
def source_show(ctx: click.Context, name: str) -> None:
    """Show details for a specific source."""
    db = _get_db(ctx)
    src = _select_source(db, name)
    if not src:
        db.close()
        return

    title = src.name

    lines: list[str] = []
    if src.email:
        lines.append(f"[bold]Email:[/bold] {src.email}")
    if src.url:
        lines.append(f"[bold]URL:[/bold]   {src.url}")
    if src.notes:
        lines.append(f"[bold]Notes:[/bold] {src.notes}")

    lines.append("")
    lines.append("[bold underline]Products[/bold underline]")
    products = db.get_products_for_source(src.id)  # type: ignore[arg-type]
    if products:
        for p in products:
            lines.append(f"  {p.name} ({p.vendor or '?'})")
    else:
        lines.append("  [dim]No products linked[/dim]")

    panel = Panel("\n".join(lines), title=title, border_style="blue")
    console.print(panel)
    db.close()


@source.command("delete")
@click.argument("name")
@click.pass_context
def source_delete(ctx: click.Context, name: str) -> None:
    """Delete a source."""
    db = _get_db(ctx)
    src = _select_source(db, name)
    if not src:
        db.close()
        return

    if not click.confirm(f"Delete source '{src.name}'?"):
        console.print("Cancelled", style="yellow")
        db.close()
        return

    success = db.delete_source(src.id)  # type: ignore[arg-type]
    if success:
        console.print(f"Source [bold]{src.name}[/bold] deleted", style="green")
    else:
        console.print("Failed to delete source", style="red")

    db.close()


# --- export ---


@cli.command()
@click.option(
    "--format",
    "-f",
    "fmt",
    type=click.Choice(["json", "csv"]),
    default="json",
    help="Export format",
)
@click.option(
    "--output", "-o", type=click.Path(), default=None, help="Output file path"
)
@click.pass_context
def export(ctx: click.Context, fmt: str, output: str | None) -> None:
    """Export inventory to JSON or CSV."""
    db = _get_db(ctx)
    output_path = Path(output) if output else None

    if fmt == "json":
        data = export_json(db, output_path)
    else:
        data = export_csv(db, output_path)

    if output_path:
        console.print(f"Exported to {output_path}", style="green")
    else:
        console.print(data)

    db.close()


# --- diff ---


@cli.command()
@click.pass_context
def diff(ctx: click.Context) -> None:
    """Show changes since the last scan."""
    db = _get_db(ctx)

    last_scan = db.get_last_scan()
    if not last_scan:
        console.print(
            "No previous scan found. Run 'audio-inventory scan' first.", style="yellow"
        )
        db.close()
        return

    console.print(f"[dim]Last scan: {last_scan.timestamp}[/dim]")
    console.print()

    # Show removed plugins
    absent = db.get_absent_installations()
    if absent:
        table = Table(title="Removed Plugins", border_style="red")
        table.add_column("Name")
        table.add_column("Format")
        table.add_column("Path", style="dim")
        table.add_column("Last Seen")

        for inst in absent:
            product = db.get_product(inst.product_id) if inst.product_id else None
            name = product.name if product else "?"
            table.add_row(name, inst.format.upper(), inst.path, inst.last_seen or "")

        console.print(table)
    else:
        console.print("[green]No plugins removed since last scan[/green]")

    # Summary
    console.print(
        f"\n[dim]Last scan summary: "
        f"{last_scan.plugins_found} bundles, "
        f"{last_scan.products_found} products, "
        f"{last_scan.new_plugins} new, "
        f"{last_scan.removed_plugins} removed[/dim]"
    )

    db.close()


# --- ui ---


@cli.command()
@click.option("--port", "-p", default=8787, help="Port to serve on")
@click.option(
    "--no-open", is_flag=True, default=False, help="Don't auto-open the browser"
)
@click.pass_context
def ui(ctx: click.Context, port: int, no_open: bool) -> None:
    """Launch the web UI in your browser."""
    import threading
    import webbrowser

    from audio_inventory.web import create_app

    db_path = ctx.obj["db_path"]
    app = create_app(db_path)

    url = f"http://localhost:{port}"
    console.print(f"Starting web UI at [bold]{url}[/bold]")
    console.print("[dim]Press Ctrl+C to stop[/dim]")

    if not no_open:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    app.run(host="127.0.0.1", port=port, debug=False)


# --- status ---


@cli.command()
@click.pass_context
def status(ctx: click.Context) -> None:
    """Show inventory summary and license coverage."""
    db = _get_db(ctx)

    products = db.list_products()
    if not products:
        console.print(
            "Database is empty. Run 'audio-inventory scan' first.", style="yellow"
        )
        db.close()
        return

    total = len(products)

    # Build all breakdowns in a single pass
    status_counts: dict[str, int] = {}
    vendor_counts: dict[str, int] = {}
    cat_counts: dict[str, int] = {}
    fmt_counts: dict[str, int] = {}
    for p in products:
        status_counts[p.status] = status_counts.get(p.status, 0) + 1
        v = p.vendor or "Unknown"
        vendor_counts[v] = vendor_counts.get(v, 0) + 1
        c = p.category or "unknown"
        cat_counts[c] = cat_counts.get(c, 0) + 1
        for f in p.formats:
            fmt_counts[f] = fmt_counts.get(f, 0) + 1

    # Main summary
    summary = Table(title="Inventory Summary", show_header=False, border_style="dim")
    summary.add_column("Metric", style="bold")
    summary.add_column("Value", justify="right")
    summary.add_row("Total products", str(total))
    summary.add_row("Vendors", str(len(vendor_counts)))
    console.print(summary)

    # Status breakdown
    status_table = Table(title="By Status", border_style="dim")
    status_table.add_column("Status")
    status_table.add_column("Products", justify="right")
    for s in ("licensed", "demo", "free", "subscription", "bundled", "unknown"):
        if s in status_counts:
            status_table.add_row(s, str(status_counts[s]))
    console.print(status_table)

    # Vendors
    vendor_table = Table(title="By Vendor", border_style="dim")
    vendor_table.add_column("Vendor")
    vendor_table.add_column("Products", justify="right")
    for v, c in sorted(vendor_counts.items(), key=lambda x: -x[1]):
        vendor_table.add_row(v, str(c))
    console.print(vendor_table)

    # Categories
    cat_table = Table(title="By Category", border_style="dim")
    cat_table.add_column("Category")
    cat_table.add_column("Products", justify="right")
    for c, n in sorted(cat_counts.items(), key=lambda x: -x[1]):
        cat_table.add_row(c, str(n))
    console.print(cat_table)

    # Last scan
    last_scan = db.get_last_scan()
    if last_scan:
        console.print(f"\n[dim]Last scan: {last_scan.timestamp}[/dim]")

    db.close()
