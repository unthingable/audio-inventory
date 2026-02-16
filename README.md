# audio-inventory

Scan, inventory, and track audio plugins and their licenses on macOS.

Walks the standard macOS plugin directories, parses metadata from each bundle (Info.plist, moduleinfo.json, AudioComponents), deduplicates across formats (VST2/VST3/AU/CLAP), and stores everything in a local JSON file. Includes license tracking, bundle/account/source management, and a web UI.

## Install

```
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Quick start

```bash
# Scan your system
audio-inventory scan

# Browse what's installed
audio-inventory list
audio-inventory list --vendor "Arturia"
audio-inventory list --format clap
audio-inventory list --category instrument

# View details for a plugin
audio-inventory show "Diva"

# Mark plugin status (demo, free, licensed, etc.)
audio-inventory set-status "Pigments" demo
audio-inventory set-status "Surge XT" free

# Add a license key
audio-inventory license add "Diva" --key "XXXX-XXXX-XXXX" --manager "u-he"

# Organize plugins into bundles, accounts, etc.
audio-inventory bundle create "Komplete 15" --vendor "Native Instruments"
audio-inventory account create "Native Instruments" --email "me@example.com"
audio-inventory manager create "iLok"
audio-inventory source create "Plugin Boutique" --url "https://pluginboutique.com"

# Check license coverage
audio-inventory status

# Export inventory
audio-inventory export --format json --output inventory.json
audio-inventory export --format csv --output inventory.csv

# See what changed since last scan
audio-inventory diff

# Launch the web UI
audio-inventory ui
```

## Commands

### `scan`

Walks `/Library/Audio/Plug-Ins/` and `~/Library/Audio/Plug-Ins/` for `.vst`, `.vst3`, `.component`, and `.clap` bundles. Parses metadata, deduplicates across formats, and upserts into the database.

```
audio-inventory scan
```

### `list`

List all tracked products with optional filters.

```
audio-inventory list [--vendor NAME] [--format FORMAT] [--category CAT]
                     [--status STATUS] [--licensed] [--unlicensed] [--missing]
```

- `--format`: `vst2`, `vst3`, `au`, `clap`
- `--category`: `instrument`, `effect`, `generator`
- `--status`: `unknown`, `licensed`, `demo`, `free`, `subscription`, `bundled`
- `--licensed` / `--unlicensed`: filter by license status
- `--missing`: show plugins that were removed since last scan

### `show`

Show full details for a plugin: all installations, paths, versions, AU codes, and license info.

```
audio-inventory show "Kontakt 8"
```

Supports fuzzy matching — if multiple results match, you'll be prompted to choose.

### `set-status`

Mark a plugin's status: `licensed`, `demo`, `free`, `subscription`, `bundled`, or `unknown`.

```
audio-inventory set-status "Pigments" demo
audio-inventory set-status "Surge XT" free
audio-inventory set-status "Kontakt 8" licensed
```

Use `list --status demo` to see all plugins running in demo mode.

### `license add`

Attach license info to a product.

```
audio-inventory license add "Diva" \
  --key "SERIAL-KEY" \
  --manager "u-he" \
  --date "2023-06-15" \
  --url "https://u-he.com/account" \
  --file "/path/to/license.file" \
  --email "me@example.com" \
  --source "Plugin Boutique" \
  --notes "Bought during summer sale"
```

All flags are optional.

### `license list`

Show all products that have license info recorded.

```
audio-inventory license list [--vendor NAME] [--all]
```

### `bundle`

Manage plugin bundles and commercial suites (e.g., NI Komplete, Arturia V Collection).

```
audio-inventory bundle create <name> [--vendor V] [--source S] [--key K] [--date D] [--notes N]
audio-inventory bundle list
audio-inventory bundle show <name>
audio-inventory bundle delete <name>
audio-inventory bundle add-products <bundle> <products>...
```

### `account`

Manage vendor accounts (login credentials for vendor websites).

```
audio-inventory account create <name> [--email E] [--url U] [--notes N]
audio-inventory account list
audio-inventory account show <name>
audio-inventory account delete <name>
```

### `manager`

Manage license managers (activation software like iLok, Native Access).

```
audio-inventory manager create <name> [--url U] [--notes N]
audio-inventory manager list
audio-inventory manager show <name>
audio-inventory manager delete <name>
```

### `source`

Manage purchase sources (stores like Plugin Boutique, Splice).

```
audio-inventory source create <name> [--email E] [--url U] [--notes N]
audio-inventory source list
audio-inventory source show <name>
audio-inventory source delete <name>
```

### `status`

Inventory summary: total products, license coverage, breakdown by vendor/category.

```
audio-inventory status
```

### `export`

Export the full inventory to JSON or CSV.

```
audio-inventory export --format json --output plugins.json
audio-inventory export --format csv --output plugins.csv
```

Without `--output`, prints to stdout.

### `diff`

Show changes since the last scan (removed plugins, new additions).

```
audio-inventory diff
```

### `ui`

Launch a web UI in your browser for browsing, filtering, and managing your plugin inventory.

```
audio-inventory ui
audio-inventory ui --port 9000
audio-inventory ui --no-open
```

Opens `http://localhost:8787` by default. Features:

- Sortable, filterable table of all products
- Live search (press `/` to focus)
- Filter by vendor, category, status, format, bundle, and source
- Click any row to open a detail drawer with installations, bundle IDs, AU codes, and license info
- Edit status, notes, bundle/account/manager/source assignments from the detail view
- Manage licenses (add, edit, delete) per product
- Tabbed management overlay for bundles, accounts, license managers, and sources
- Bulk operations: select multiple products and assign to a bundle, account, manager, or source
- Trigger a re-scan from the browser
- Export to JSON or CSV

## Database

Stored as a JSON file at `./data/inventory.json` (gitignored). All access goes through an in-memory store with atomic writes (tempfile + `os.replace()`). Every save rotates a timestamped backup to `./data/backups/`, keeping the 10 most recent.

Override the path with `--db`:

```
audio-inventory --db /path/to/inventory.json scan
```

### Data model

- **products** — deduplicated logical products (name, vendor, category, status, installed flag). Link to bundles, accounts, license managers, and sources via ID references.
- **installations** — individual plugin bundles on disk (path, format, version, bundle ID, AU codes)
- **licenses** — serial keys, license files, purchase dates, vendor URLs, notes
- **bundles** — commercial suites (name, vendor, serial key, purchase date, notes)
- **accounts** — vendor logins (name, email, URL, notes)
- **license_managers** — activation software (name, URL, notes)
- **sources** — purchase stores (name, email, URL, notes)
- **scans** — scan history with counts

Schema version: 6.

## How deduplication works

The same plugin often exists in multiple formats (e.g., Diva.vst3, Diva.component, Diva.clap). The tool groups these into a single product by:

1. Stripping format suffixes from bundle identifiers (`com.u-he.Diva.vst3` → `com.u-he.Diva`)
2. Matching on normalized name + vendor as a fallback
3. Merging at the database level by (name, vendor) uniqueness

## Vendor detection

Vendor names are extracted from multiple sources (in priority order):

1. AU `AudioComponents` name field (`"u-he: Diva"` → `u-he`)
2. VST3 `moduleinfo.json` Factory Info
3. Bundle identifier reverse-DNS (`com.native-instruments.*` → Native Instruments)
4. Copyright string parsing

Extracted names are normalized against a known alias table to prevent duplicates like "Native Instruments GmbH" vs "Native Instruments".

## Suggested workflow

1. `audio-inventory scan` — populate the database
2. Set up your infrastructure:
   - `account create` for each vendor you have a login with
   - `manager create` for license managers (iLok, Native Access, etc.)
   - `source create` for stores you buy from
   - `bundle create` for commercial suites you own
3. `audio-inventory list --vendor "Arturia"` — work through one vendor at a time
4. `audio-inventory license add "Plugin Name"` — record serial keys
5. Assign products to their bundle, account, manager, and source (via CLI or web UI)
6. `audio-inventory status` — track your progress
