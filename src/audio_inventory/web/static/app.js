/* ============================================================
   Audio Inventory — Client-side Application
   ============================================================ */

(function () {
  "use strict";

  // Constants
  const LICENSE_FIELDS = [
    { key: "serial_key", label: "Key", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "source", label: "Source", type: "text" },
    { key: "license_manager", label: "Manager", type: "text" },
    { key: "purchase_date", label: "Purchased", type: "text", placeholder: "YYYY-MM-DD" },
    { key: "vendor_url", label: "Account", type: "url" },
    { key: "license_file_path", label: "File", type: "text" },
    { key: "notes", label: "Notes", type: "text" },
  ];

  const BUNDLE_FIELDS = [
    { key: "name", label: "Name", required: true },
    { key: "vendor", label: "Vendor" },
    { key: "source", label: "Source" },
    { key: "serial_key", label: "Serial Key" },
    { key: "purchase_date", label: "Purchase Date", placeholder: "YYYY-MM-DD" },
    { key: "notes", label: "Notes" },
  ];

  const ACCOUNT_FIELDS = [
    { key: "name", label: "Name", required: true },
    { key: "email", label: "Email" },
    { key: "vendor_url", label: "Vendor URL" },
    { key: "notes", label: "Notes" },
  ];

  const LICENSE_MANAGER_FIELDS = [
    { key: "name", label: "Name", required: true },
    { key: "url", label: "URL" },
    { key: "notes", label: "Notes" },
  ];

  const SOURCE_FIELDS = [
    { key: "name", label: "Name", required: true },
    { key: "email", label: "Email" },
    { key: "url", label: "URL" },
    { key: "notes", label: "Notes" },
  ];

  // Entity picker configuration for each association type in the product drawer
  const ENTITY_SECTIONS = [
    {
      key: "bundle",
      apiField: "bundle_id",
      label: "Bundle",
      entityProp: "bundle",
      idProp: "bundle_id",
      allItems: () => allBundles,
      reloadFn: loadBundles,
      apiEndpoint: "/api/bundles",
      fields: BUNDLE_FIELDS,
      displayDetail: (entity) => entity.vendor ? `by ${entity.vendor}` : null,
      manageTab: "bundles",
      quickFields: [
        { key: "name", label: "Name" },
        { key: "vendor", label: "Vendor" },
      ],
      renderChipExtra: (entity) => {
        const fields = [
          ["Source", entity.source, false],
          ["Serial Key", entity.serial_key, true],
          ["Purchased", entity.purchase_date, false],
        ];
        let html = "";
        fields.forEach(([label, val, sensitive]) => {
          if (val) {
            const display = sensitive ? maskValue(val) : val;
            html += '<div class="license-field">';
            html += `<span class="license-field__label">${label}</span>`;
            html += `<span class="license-field__value">${esc(display)}</span>`;
            html += "</div>";
          }
        });
        return html;
      },
    },
    {
      key: "account",
      apiField: "account_id",
      label: "Account",
      entityProp: "account",
      idProp: "account_id",
      allItems: () => allAccounts,
      reloadFn: loadAccounts,
      apiEndpoint: "/api/accounts",
      fields: ACCOUNT_FIELDS,
      displayDetail: (entity) => entity.vendor_url || null,
      manageTab: "accounts",
      quickFields: [
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
      ],
    },
    {
      key: "license_manager",
      apiField: "license_manager_id",
      label: "License Manager",
      entityProp: "license_manager",
      idProp: "license_manager_id",
      allItems: () => allLicenseManagers,
      reloadFn: loadLicenseManagers,
      apiEndpoint: "/api/license-managers",
      fields: LICENSE_MANAGER_FIELDS,
      displayDetail: (entity) => entity.url || null,
      manageTab: "managers",
      quickFields: [
        { key: "name", label: "Name" },
        { key: "url", label: "URL" },
      ],
    },
    {
      key: "source",
      apiField: "source_id",
      label: "Source",
      entityProp: "source",
      idProp: "source_id",
      allItems: () => allSources,
      reloadFn: loadSources,
      apiEndpoint: "/api/sources",
      fields: SOURCE_FIELDS,
      displayDetail: (entity) => entity.url || entity.email || null,
      manageTab: "sources",
      quickFields: [
        { key: "name", label: "Name" },
        { key: "url", label: "URL" },
      ],
    },
  ];

  /** Render a single entity picker section (chip when populated, combobox when empty) */
  function renderEntitySection(product, config) {
    const entity = product[config.entityProp];
    const entityId = product[config.idProp];
    let html = '<div class="drawer-section">';
    html += `<div class="drawer-section__title">${config.label}</div>`;
    html += `<div class="entity-picker" data-entity-key="${config.key}">`;

    if (entity && entityId) {
      // Populated: chip
      const detail = config.displayDetail(entity);
      html += '<div class="entity-picker__chip">';
      html += '<div class="entity-picker__chip-body">';
      html += `<span class="entity-picker__chip-name">${esc(entity.name)}</span>`;
      if (detail) {
        html += `<span class="entity-picker__chip-detail">${esc(detail)}</span>`;
      }
      html += '</div>';
      html += `<button class="entity-picker__chip-edit" title="Edit in manager" data-tab="${config.manageTab}" data-entity-id="${entityId}"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3z"/></svg></button>`;
      html += `<button class="entity-picker__chip-remove" title="Remove ${config.label.toLowerCase()}">&times;</button>`;
      html += '</div>';
      if (config.renderChipExtra) {
        const extra = config.renderChipExtra(entity);
        if (extra) html += `<div class="entity-picker__chip-extra">${extra}</div>`;
      }
    } else {
      // Empty: combobox
      html += '<div class="entity-picker__combobox">';
      html += `<input type="text" class="entity-picker__input" placeholder="Search or select ${config.label.toLowerCase()}..." spellcheck="false">`;
      html += '<button class="entity-picker__toggle"><svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
      html += '</div>';
      html += '<div class="entity-picker__dropdown">';
      html += '<div class="entity-picker__options"></div>';
      html += `<button class="entity-picker__create-btn">+ Create new ${config.label.toLowerCase()}...</button>`;
      html += '<div class="entity-picker__create-form" style="display:none">';
      config.quickFields.forEach((f) => {
        html += `<div class="entity-picker__form-row"><label>${f.label}</label><input type="text" data-field="${f.key}" spellcheck="false"></div>`;
      });
      html += '<div class="entity-picker__form-actions">';
      html += '<button class="entity-picker__form-submit">Create &amp; Assign</button>';
      html += '<button class="entity-picker__form-cancel">Cancel</button>';
      html += '</div></div>';
      html += '</div>';
    }

    html += '</div>'; // entity-picker
    html += '</div>'; // drawer-section
    return html;
  }

  /** Bind all entity picker interactions for the current drawer */
  function bindEntityPickers(product) {
    if (_entityPickerAC) _entityPickerAC.abort();
    _entityPickerAC = new AbortController();
    ENTITY_SECTIONS.forEach((config) => {
      const picker = document.querySelector(`.entity-picker[data-entity-key="${config.key}"]`);
      if (!picker) return;

      // --- Chip handlers (populated state) ---
      const chip = picker.querySelector(".entity-picker__chip");
      if (chip) {
        // Remove association
        chip.querySelector(".entity-picker__chip-remove").addEventListener("click", async () => {
          try {
            const res = await fetch("/api/products/bulk", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ product_ids: [product.id], [config.apiField]: null }),
            });
            if (res.ok) {
              toast(`Removed from ${config.label.toLowerCase()}`, "success");
              await Promise.all([loadProducts(), config.reloadFn()]);
              openDrawer(product.id);
            }
          } catch {
            toast("Network error", "error");
          }
        });

        // Edit in management overlay
        const editBtn = chip.querySelector(".entity-picker__chip-edit");
        editBtn.addEventListener("click", () => {
          const tab = editBtn.dataset.tab;
          const entityId = editBtn.dataset.entityId ? parseInt(editBtn.dataset.entityId) : null;
          manageOverlay.classList.add("active");
          currentEntityTab = tab;
          switchEntityTab(tab, entityId);
        });
        return;
      }

      // --- Combobox handlers (empty state) ---
      const combobox = picker.querySelector(".entity-picker__combobox");
      const input = picker.querySelector(".entity-picker__input");
      const toggleBtn = picker.querySelector(".entity-picker__toggle");
      const dropdown = picker.querySelector(".entity-picker__dropdown");
      const optionsContainer = dropdown.querySelector(".entity-picker__options");
      const createBtn = dropdown.querySelector(".entity-picker__create-btn");
      const createForm = dropdown.querySelector(".entity-picker__create-form");
      let highlightIndex = -1;
      let visibleOptions = [];

      function renderOptions(filter) {
        const items = config.allItems();
        const q = (filter || "").toLowerCase();
        visibleOptions = q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items;
        if (visibleOptions.length === 0) {
          optionsContainer.innerHTML = '<div class="entity-picker__empty">No matches</div>';
        } else {
          optionsContainer.innerHTML = visibleOptions.map((item, i) => {
            const detail = config.displayDetail(item);
            return `<div class="entity-picker__option${i === highlightIndex ? ' entity-picker__option--active' : ''}" data-id="${item.id}" data-index="${i}">` +
              `<span class="entity-picker__option-name">${esc(item.name)}</span>` +
              (detail ? `<span class="entity-picker__option-detail">${esc(detail)}</span>` : '') +
              '</div>';
          }).join("");
        }
        createBtn.style.display = "";
        createForm.style.display = "none";
      }

      function openDropdown() {
        highlightIndex = -1;
        renderOptions(input.value);
        dropdown.classList.add("open");
      }

      function closeDropdown() {
        dropdown.classList.remove("open");
        highlightIndex = -1;
      }

      async function assignEntity(entityId) {
        closeDropdown();
        input.value = "";
        try {
          const res = await fetch("/api/products/bulk", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_ids: [product.id], [config.apiField]: entityId }),
          });
          if (res.ok) {
            toast(`Assigned to ${config.label.toLowerCase()}`, "success");
            await Promise.all([loadProducts(), config.reloadFn()]);
            openDrawer(product.id);
          }
        } catch {
          toast("Network error", "error");
        }
      }

      // Toggle dropdown on click
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dropdown.classList.contains("open")) {
          closeDropdown();
        } else {
          openDropdown();
          input.focus();
        }
      });

      // Open on input focus
      input.addEventListener("focus", () => {
        openDropdown();
      });

      // Filter on typing
      input.addEventListener("input", () => {
        highlightIndex = -1;
        renderOptions(input.value);
        if (!dropdown.classList.contains("open")) openDropdown();
      });

      // Keyboard navigation
      input.addEventListener("keydown", (e) => {
        if (!dropdown.classList.contains("open")) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (highlightIndex < visibleOptions.length - 1) {
            highlightIndex++;
            renderOptions(input.value);
            const active = optionsContainer.querySelector(".entity-picker__option--active");
            if (active) active.scrollIntoView({ block: "nearest" });
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (highlightIndex > 0) {
            highlightIndex--;
            renderOptions(input.value);
            const active = optionsContainer.querySelector(".entity-picker__option--active");
            if (active) active.scrollIntoView({ block: "nearest" });
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (highlightIndex >= 0 && highlightIndex < visibleOptions.length) {
            assignEntity(visibleOptions[highlightIndex].id);
          }
        } else if (e.key === "Escape") {
          closeDropdown();
          input.blur();
        }
      });

      // Option click
      optionsContainer.addEventListener("click", (e) => {
        const opt = e.target.closest(".entity-picker__option");
        if (opt) assignEntity(parseInt(opt.dataset.id));
      });

      // Close on outside click (use mousedown so it fires before blur)
      document.addEventListener("mousedown", (e) => {
        if (!picker.contains(e.target)) closeDropdown();
      }, { signal: _entityPickerAC.signal });

      // "Create new..." button
      createBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        createBtn.style.display = "none";
        optionsContainer.style.display = "none";
        createForm.style.display = "";
        // Pre-fill name from search input
        const nameInput = createForm.querySelector('[data-field="name"]');
        if (nameInput && input.value.trim()) nameInput.value = input.value.trim();
        const firstInput = createForm.querySelector('input');
        if (firstInput) firstInput.focus();
      });

      // Cancel create
      createForm.querySelector(".entity-picker__form-cancel").addEventListener("click", (e) => {
        e.stopPropagation();
        createForm.style.display = "none";
        optionsContainer.style.display = "";
        createBtn.style.display = "";
        renderOptions(input.value);
      });

      // Create & Assign
      createForm.querySelector(".entity-picker__form-submit").addEventListener("click", async (e) => {
        e.stopPropagation();
        const data = {};
        createForm.querySelectorAll("input[data-field]").forEach((inp) => {
          if (inp.value.trim()) data[inp.dataset.field] = inp.value.trim();
        });
        if (!data.name) {
          toast("Name is required", "error");
          return;
        }
        try {
          const res = await fetch(config.apiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (res.ok) {
            const result = await res.json();
            toast(`${config.label} created`, "success");
            await config.reloadFn();
            assignEntity(result.id);
          } else {
            toast(`Failed to create ${config.label.toLowerCase()}`, "error");
          }
        } catch {
          toast("Network error", "error");
        }
      });
    });
  }

  // State
  let allProducts = [];
  let filteredProducts = [];
  let allBundles = [];
  let allAccounts = [];
  let allLicenseManagers = [];
  let allSources = [];
  let sortColumn = "vendor";
  let sortDir = "asc";
  let selectedProductId = null;
  let selectedProductIds = new Set();
  let lastSelectedIndex = -1;
  let _entityPickerAC = null;
  let _licPopoverFetchId = 0;
  let privacyMode = false;

  class FilterDropdown {
    constructor(container, label, options, onChange) {
      this._container = container;
      this._label = label;
      this._options = options;
      this._selected = new Set();
      this._onChange = onChange;
      this._render();
      this._bind();
    }

    get values() {
      return this._selected;
    }

    _render() {
      this._container.innerHTML = "";

      this._button = document.createElement("button");
      this._button.type = "button";
      this._button.className = "filter-dropdown__btn";
      this._button.textContent = "All " + this._label;
      this._container.appendChild(this._button);

      this._menu = document.createElement("div");
      this._menu.className = "filter-dropdown__menu";
      this._container.appendChild(this._menu);

      this._renderMenu();
    }

    _renderMenu() {
      this._menu.innerHTML = "";

      const allItem = document.createElement("div");
      allItem.className = "filter-dropdown__item";
      if (this._selected.size === 0) allItem.classList.add("filter-dropdown__item--checked");
      const allCheck = document.createElement("span");
      allCheck.className = "filter-dropdown__check";
      allCheck.textContent = this._selected.size === 0 ? "\u2713" : "";
      allItem.appendChild(allCheck);
      const allText = document.createElement("span");
      allText.className = "filter-dropdown__item-text";
      allText.textContent = "All " + this._label;
      allItem.appendChild(allText);
      allItem.addEventListener("click", (e) => {
        e.stopPropagation();
        this._selected.clear();
        this._updateUI();
        this._onChange();
      });
      this._menu.appendChild(allItem);

      const sep = document.createElement("div");
      sep.className = "filter-dropdown__sep";
      this._menu.appendChild(sep);

      this._options.forEach((opt) => {
        const item = document.createElement("div");
        item.className = "filter-dropdown__item";
        const isChecked = this._selected.has(opt.value);
        if (isChecked) item.classList.add("filter-dropdown__item--checked");

        const check = document.createElement("span");
        check.className = "filter-dropdown__check";
        check.textContent = isChecked ? "\u2713" : "";
        item.appendChild(check);

        const text = document.createElement("span");
        text.className = "filter-dropdown__item-text";
        text.textContent = opt.text;
        item.appendChild(text);

        item.addEventListener("click", (e) => {
          e.stopPropagation();
          if (this._selected.has(opt.value)) {
            this._selected.delete(opt.value);
          } else {
            this._selected.add(opt.value);
          }
          this._updateUI();
          this._onChange();
        });
        this._menu.appendChild(item);
      });
    }

    _updateUI() {
      if (this._selected.size === 0) {
        this._button.textContent = "All " + this._label;
      } else if (this._selected.size === 1) {
        const val = [...this._selected][0];
        const opt = this._options.find((o) => o.value === val);
        this._button.textContent = opt ? opt.text : val;
      } else {
        this._button.textContent = this._selected.size + " selected";
      }

      this._button.classList.toggle("active", this._selected.size > 0);

      const items = this._menu.querySelectorAll(".filter-dropdown__item");
      items[0].classList.toggle("filter-dropdown__item--checked", this._selected.size === 0);
      items[0].querySelector(".filter-dropdown__check").textContent =
        this._selected.size === 0 ? "\u2713" : "";

      for (let i = 1; i < items.length; i++) {
        const optValue = this._options[i - 1].value;
        const checked = this._selected.has(optValue);
        items[i].classList.toggle("filter-dropdown__item--checked", checked);
        items[i].querySelector(".filter-dropdown__check").textContent = checked ? "\u2713" : "";
      }
    }

    _bind() {
      this._button.addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelectorAll(".filter-dropdown__menu.open").forEach((m) => {
          if (m !== this._menu) m.classList.remove("open");
        });
        this._menu.classList.toggle("open");
      });
    }

    setOptions(options) {
      const validValues = new Set(options.map((o) => o.value));
      for (const val of this._selected) {
        if (!validValues.has(val)) this._selected.delete(val);
      }
      this._options = options;
      this._renderMenu();
      this._updateUI();
    }
  }

  document.addEventListener("click", () => {
    document.querySelectorAll(".filter-dropdown__menu.open").forEach((m) => {
      m.classList.remove("open");
    });
  });

  // DOM refs
  const searchInput = document.getElementById("search");
  const tbody = document.getElementById("product-tbody");
  const showingCount = document.getElementById("showing-count");
  const totalCount = document.getElementById("total-count");
  const statTotal = document.getElementById("stat-total");
  const statVendors = document.getElementById("stat-vendors");
  const statLicensed = document.getElementById("stat-licensed");
  const drawer = document.getElementById("drawer");
  const drawerOverlay = document.getElementById("drawer-overlay");
  const drawerClose = document.getElementById("drawer-close");
  const drawerTitle = document.getElementById("drawer-title");
  const drawerVendor = document.getElementById("drawer-vendor");
  const drawerBody = document.getElementById("drawer-body");
  const btnScan = document.getElementById("btn-scan");
  const scanOverlay = document.getElementById("scan-overlay");
  const btnExport = document.getElementById("btn-export");
  const exportDropdown = document.getElementById("export-dropdown");
  const btnManage = document.getElementById("btn-manage");
  const manageOverlay = document.getElementById("manage-overlay");
  const btnCreateProduct = document.getElementById("btn-create-product");
  const createProductOverlay = document.getElementById("create-product-overlay");

  // Filter dropdowns (multi-select)
  const filterVendor = new FilterDropdown(
    document.getElementById("filter-vendor"), "Vendors", [], applyFilters
  );
  const filterCategory = new FilterDropdown(
    document.getElementById("filter-category"), "Categories",
    [
      { value: "instrument", text: "Instrument" },
      { value: "effect", text: "Effect" },
      { value: "generator", text: "Generator" },
      { value: "sound-pack", text: "Sound Pack" },
      { value: "utility", text: "Utility" },
      { value: "standalone", text: "Standalone" },
      { value: "upgrade", text: "Upgrade" },
      { value: "bundle", text: "Bundle" },
    ],
    applyFilters
  );
  const filterStatus = new FilterDropdown(
    document.getElementById("filter-status"), "Statuses",
    [
      { value: "licensed", text: "Licensed" },
      { value: "demo", text: "Demo" },
      { value: "free", text: "Free" },
      { value: "subscription", text: "Subscription" },
      { value: "bundled", text: "Bundled" },
      { value: "unknown", text: "Unknown" },
    ],
    applyFilters
  );
  const filterFormat = new FilterDropdown(
    document.getElementById("filter-format"), "Formats",
    [
      { value: "au", text: "AU" },
      { value: "vst3", text: "VST3" },
      { value: "vst2", text: "VST2" },
      { value: "clap", text: "CLAP" },
    ],
    applyFilters
  );
  const filterBundle = new FilterDropdown(
    document.getElementById("filter-bundle"), "Bundles",
    [{ value: "__none__", text: "No Bundle" }],
    applyFilters
  );
  const filterSource = new FilterDropdown(
    document.getElementById("filter-source"), "Sources",
    [{ value: "__none__", text: "No Source" }],
    applyFilters
  );

  // ---- Init ----

  async function init() {
    await Promise.all([loadProducts(), loadBundles(), loadAccounts(), loadLicenseManagers(), loadSources()]);
    bindEvents();
  }

  async function loadProducts() {
    try {
      const res = await fetch("/api/products");
      allProducts = await res.json();
      populateVendorFilter();
      updateStats();
      applyFilters();
    } catch (err) {
      tbody.innerHTML =
        '<tr class="no-results"><td colspan="9">Failed to load products</td></tr>';
    }
  }

  async function loadBundles() {
    try {
      const res = await fetch("/api/bundles");
      allBundles = await res.json();
      populateBundleFilter();
      populateBulkSelect("bulk-bundle", "Bundle", allBundles);
    } catch {
      allBundles = [];
    }
  }

  async function loadAccounts() {
    try {
      const res = await fetch("/api/accounts");
      allAccounts = await res.json();
      populateBulkSelect("bulk-account", "Account", allAccounts);
    } catch {
      allAccounts = [];
    }
  }

  async function loadLicenseManagers() {
    try {
      const res = await fetch("/api/license-managers");
      allLicenseManagers = await res.json();
      populateBulkSelect("bulk-lm", "License Manager", allLicenseManagers);
    } catch {
      allLicenseManagers = [];
    }
  }

  async function loadSources() {
    try {
      const res = await fetch("/api/sources");
      allSources = await res.json();
      populateSourceFilter();
      populateBulkSelect("bulk-source", "Source", allSources);
    } catch {
      allSources = [];
    }
  }

  function populateVendorFilter() {
    const vendors = new Set();
    allProducts.forEach((p) => {
      if (p.vendor) vendors.add(p.vendor);
    });
    const sorted = [...vendors].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    const options = sorted.map((v) => {
      const count = allProducts.filter((p) => p.vendor === v).length;
      return { value: v, text: `${v} (${count})` };
    });
    filterVendor.setOptions(options);
  }

  function populateBundleFilter() {
    const options = [{ value: "__none__", text: "No Bundle" }];
    allBundles.forEach((bundle) => {
      options.push({
        value: String(bundle.id),
        text: `${bundle.name} (${bundle.product_count})`,
      });
    });
    filterBundle.setOptions(options);
  }

  function populateBulkSelect(elementId, label, items) {
    const sel = document.getElementById(elementId);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = `<option value="">Assign ${label}...</option><option value="__none__">None</option>`;
    items.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = String(item.id);
      opt.textContent = item.name;
      sel.appendChild(opt);
    });
    sel.value = current;
  }

  function populateSourceFilter() {
    const options = [{ value: "__none__", text: "No Source" }];
    allSources.forEach((source) => {
      options.push({
        value: String(source.id),
        text: `${source.name} (${source.product_count})`,
      });
    });
    filterSource.setOptions(options);
  }

  function updateStats() {
    const vendors = new Set(allProducts.map((p) => p.vendor).filter(Boolean));
    const licensed = allProducts.filter(
      (p) => p.status === "licensed" || p.status === "subscription"
    ).length;
    statTotal.textContent = allProducts.length;
    statVendors.textContent = vendors.size;
    statLicensed.textContent = licensed;
    totalCount.textContent = allProducts.length;
  }

  // ---- Filtering ----

  function matchesNoneOrId(selected, id) {
    if (selected.has("__none__") && !id) return true;
    return selected.has(String(id));
  }

  function applyFilters() {
    lastSelectedIndex = -1;
    const query = searchInput.value.toLowerCase().trim();
    const vendors = filterVendor.values;
    const categories = filterCategory.values;
    const statuses = filterStatus.values;
    const formats = filterFormat.values;
    const bundles = filterBundle.values;
    const sources = filterSource.values;

    filteredProducts = allProducts.filter((p) => {
      if (query) {
        const haystack = `${p.name} ${p.vendor}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (vendors.size > 0 && !vendors.has(p.vendor)) return false;
      if (categories.size > 0 && !categories.has(p.category)) return false;
      if (statuses.size > 0 && !statuses.has(p.status)) return false;
      if (formats.size > 0 && !p.formats.some((f) => formats.has(f))) return false;
      if (bundles.size > 0 && !matchesNoneOrId(bundles, p.bundle_id)) return false;
      if (sources.size > 0 && !matchesNoneOrId(sources, p.source_id)) return false;
      return true;
    });

    sortProducts();
    renderTable();
  }

  // ---- Sorting ----

  function sortProducts() {
    const dir = sortDir === "asc" ? 1 : -1;
    filteredProducts.sort((a, b) => {
      let va = a[sortColumn] || "";
      let vb = b[sortColumn] || "";
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }

  function setSort(column) {
    if (sortColumn === column) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortColumn = column;
      sortDir = "asc";
    }

    document.querySelectorAll("thead th").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
    });
    const th = document.querySelector(`th[data-sort="${column}"]`);
    if (th) th.classList.add(sortDir === "asc" ? "sorted-asc" : "sorted-desc");

    sortProducts();
    renderTable();
  }

  // ---- Rendering ----

  function renderTable() {
    showingCount.textContent = filteredProducts.length;

    if (filteredProducts.length === 0) {
      tbody.innerHTML =
        '<tr class="no-results"><td colspan="9">No products match your filters</td></tr>';
      return;
    }

    const fragment = document.createDocumentFragment();

    filteredProducts.forEach((p, index) => {
      const tr = document.createElement("tr");
      tr.dataset.id = p.id;
      if (p.id === selectedProductId) tr.classList.add("selected");

      const checked = selectedProductIds.has(p.id) ? " checked" : "";
      const bundleTag = p.bundle_name
        ? `<span class="cell-name__bundle" title="${esc(p.bundle_name)}">${esc(p.bundle_name)}</span>`
        : "";

      // License indicator icon — three states: no license, info only, has serial key
      let licIcon, licClass;
      if (p.has_serial_key) {
        licIcon = licenseIconFilled;
        licClass = "license-indicator license-indicator--active";
      } else if (p.has_license) {
        licIcon = licenseIconFilled;
        licClass = "license-indicator license-indicator--info";
      } else {
        licIcon = licenseIconOutline;
        licClass = "license-indicator";
      }

      tr.innerHTML = `
        <td class="cell-check"><label><input type="checkbox" class="row-check" data-id="${p.id}" data-index="${index}"${checked}></label></td>
        <td class="cell-name"><div class="cell-name__inner"><span class="cell-name__label">${esc(p.name)}</span>${bundleTag}</div></td>
        <td class="cell-vendor">${esc(p.vendor)}</td>
        <td class="cell-category">${esc(p.category)}</td>
        <td>${formatBadges(p.formats)}</td>
        <td>${statusPill(p.status, p.id)}</td>
        <td class="cell-installed">${p.installed ? '<span class="badge badge--installed" title="Installed"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg></span>' : '<span class="badge badge--not-installed" title="Not installed"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></span>'}</td>
        <td class="cell-license"><span class="${licClass}" data-product-id="${p.id}" title="${p.has_license ? 'View license' : 'Add license'}">${licIcon}</span></td>
        <td class="cell-version">${esc(p.version)}</td>
      `;

      tr.addEventListener("click", (e) => {
        if (e.target.closest(".cell-check")) return;
        if (e.target.closest(".license-indicator")) return;
        if (mergeMode) return;
        // If a popover is open, just close it instead of opening drawer
        if (licensePopover.classList.contains("open")) {
          closeLicensePopover();
          return;
        }
        if (statusPopover.classList.contains("open")) {
          closeStatusPopover();
          return;
        }
        // Toggle drawer closed if clicking the same row; otherwise retarget
        if (drawer.classList.contains("open") && selectedProductId === p.id) {
          closeDrawer();
        } else {
          openDrawer(p.id);
        }
      });

      // Checkbox — use change event so it fires once whether clicking input or label
      const cb = tr.querySelector(".row-check");
      let lastCheckShift = false;
      tr.querySelector(".cell-check").addEventListener("click", (e) => {
        e.stopPropagation();
        lastCheckShift = e.shiftKey;
      });
      cb.addEventListener("change", () => {
        // Sync checkbox state with our selection set
        if (cb.checked) {
          selectedProductIds.add(p.id);
        } else {
          selectedProductIds.delete(p.id);
        }
        if (lastCheckShift && lastSelectedIndex >= 0 && lastSelectedIndex !== index) {
          const start = Math.min(lastSelectedIndex, index);
          const end = Math.max(lastSelectedIndex, index);
          for (let i = start; i <= end; i++) {
            if (filteredProducts[i]) {
              if (cb.checked) {
                selectedProductIds.add(filteredProducts[i].id);
              } else {
                selectedProductIds.delete(filteredProducts[i].id);
              }
            }
          }
          tbody.querySelectorAll(".row-check").forEach((c) => {
            c.checked = selectedProductIds.has(parseInt(c.dataset.id));
          });
        }
        lastSelectedIndex = index;
        updateSelectAllState();
        updateBulkBar();
        lastCheckShift = false;
      });

      // Status pill click opens popover
      const pill = tr.querySelector(".status-pill");
      if (pill) {
        pill.addEventListener("click", (e) => {
          e.stopPropagation();
          openStatusPopover(pill, p.id);
        });
      }

      // License indicator click
      const licIndicator = tr.querySelector(".license-indicator");
      if (licIndicator) {
        licIndicator.addEventListener("click", (e) => {
          e.stopPropagation();
          openLicensePopover(licIndicator, p.id);
        });
      }

      fragment.appendChild(tr);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
    updateSelectAllState();
    updateBulkBar();
  }

  // ---- Bulk Selection ----

  const bulkBar = document.getElementById("bulk-bar");
  const bulkCount = document.getElementById("bulk-count");
  const selectAllCheckbox = document.getElementById("select-all");

  function updateSelectAllState() {
    if (filteredProducts.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }
    const visibleIds = filteredProducts.map((p) => p.id);
    const selectedVisible = visibleIds.filter((id) => selectedProductIds.has(id)).length;
    selectAllCheckbox.checked = selectedVisible === visibleIds.length;
    selectAllCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
  }

  function updateBulkBar() {
    const count = selectedProductIds.size;
    bulkCount.textContent = count;
    bulkBar.classList.toggle("visible", count > 0);
    const mergeBtn = document.getElementById("bulk-merge");
    if (mergeBtn) {
      mergeBtn.style.display = count >= 2 ? "" : "none";
      // Strike-through when multiple selected products have installations (conflict)
      const installedCount = allProducts.filter(
        (p) => selectedProductIds.has(p.id) && p.installed
      ).length;
      mergeBtn.classList.toggle("merge-blocked", installedCount > 1);
    }
  }

  function clearSelection() {
    selectedProductIds.clear();
    lastSelectedIndex = -1;
    tbody.querySelectorAll(".row-check").forEach((cb) => { cb.checked = false; });
    updateSelectAllState();
    updateBulkBar();
  }

  function formatBadges(formats) {
    return formats
      .map((f) => `<span class="fmt-badge fmt-${esc(f)}">${esc(f)}</span>`)
      .join("");
  }

  function statusPill(status, productId) {
    const safe = esc(status);
    const cls = status === "unknown" ? "status-pill status-unknown status-pill--empty" : `status-pill status-${safe}`;
    const label = status === "unknown" ? "+" : safe;
    return `<span class="${cls}" data-product-id="${productId}" data-status="${safe}">${label}</span>`;
  }

  function esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /** Mask a sensitive value if privacy mode is on. Fixed-width so length isn't guessable. */
  function maskValue(str) {
    if (!str || !privacyMode) return str;
    if (str.length <= 3) return "\u2022\u2022\u2022\u2022\u2022\u2022";
    return str.slice(0, 3) + "\u2022\u2022\u2022\u2022\u2022\u2022";
  }

  /** Mask an email if privacy mode is on. Shows first char + fixed bullets + domain TLD. */
  function maskEmail(str) {
    if (!str || !privacyMode) return str;
    const at = str.indexOf("@");
    if (at < 0) return maskValue(str);
    const local = str.slice(0, at);
    const domain = str.slice(at + 1);
    const dot = domain.lastIndexOf(".");
    const tld = dot >= 0 ? domain.slice(dot) : "";
    return local[0] + "\u2022\u2022\u2022\u2022@\u2022\u2022\u2022\u2022" + tld;
  }

  /** Returns true if a field key is sensitive and should be masked. */
  const SENSITIVE_FIELDS = new Set(["serial_key", "email"]);

  // License indicator SVG icons
  // Key icon (outline = no license, filled = has license)
  const licenseIconOutline = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6.5" cy="6.5" r="2.5"/><path d="M8.5 8.5l4 4M11 11l1.5-1.5M11 11l1.5 1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const licenseIconFilled = `<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="6.5" cy="6.5" r="3"/><path d="M8.5 8.5l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M11 11l1.5-1.5M11 11l1.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`;

  // ---- Status Popover ----

  const statusPopover = document.getElementById("status-popover");
  let popoverProductId = null;

  function openStatusPopover(pillEl, productId) {
    popoverProductId = productId;
    const rect = pillEl.getBoundingClientRect();

    // Highlight current status
    const currentStatus = pillEl.dataset.status;
    statusPopover.querySelectorAll(".status-popover__opt").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.status === currentStatus);
    });

    statusPopover.classList.add("open");
    statusPopover.style.top = rect.bottom + 4 + "px";
    statusPopover.style.left = rect.left + "px";

    // Adjust if off-screen right
    requestAnimationFrame(() => {
      const popRect = statusPopover.getBoundingClientRect();
      if (popRect.right > window.innerWidth - 8) {
        statusPopover.style.left = (window.innerWidth - popRect.width - 8) + "px";
      }
    });
  }

  function closeStatusPopover() {
    statusPopover.classList.remove("open");
    popoverProductId = null;
  }

  async function changeStatusFromPopover(newStatus) {
    const productId = popoverProductId;
    closeStatusPopover();
    if (!productId) return;

    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const idx = allProducts.findIndex((p) => p.id === productId);
        if (idx !== -1) allProducts[idx].status = newStatus;
        updateStats();
        applyFilters();

        // Prompt to add license if setting to licensed/subscription with no license
        const product = allProducts.find((p) => p.id === productId);
        if ((newStatus === "licensed" || newStatus === "subscription") && product && !product.has_license) {
          toast("Status updated — add license info?", "success", {
            label: "Add License",
            onClick: () => {
              const indicator = document.querySelector(`.license-indicator[data-product-id="${productId}"]`);
              if (indicator) {
                openLicensePopover(indicator, productId);
              } else {
                openDrawer(productId);
              }
            },
          });
        } else {
          toast("Status updated", "success");
        }
      } else {
        toast("Failed to update status", "error");
      }
    } catch {
      toast("Network error", "error");
    }
  }

  // Bind popover option clicks
  statusPopover.querySelectorAll(".status-popover__opt").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      changeStatusFromPopover(btn.dataset.status);
    });
  });

  // Close popover on outside click
  document.addEventListener("click", (e) => {
    if (!statusPopover.contains(e.target) && !e.target.classList.contains("status-pill")) {
      closeStatusPopover();
    }
    if (!licensePopover.contains(e.target) && !e.target.closest(".license-indicator")) {
      closeLicensePopover();
    }
  });

  // ---- License Popover ----

  const licensePopover = document.getElementById("license-popover");
  let licPopoverProductId = null;

  const CORE_LICENSE_FIELDS = [
    { key: "serial_key", label: "Key", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "license_manager", label: "Manager", type: "text" },
  ];

  const EXTRA_LICENSE_FIELDS = [
    { key: "source", label: "Source", type: "text" },
    { key: "purchase_date", label: "Purchased", type: "text", placeholder: "YYYY-MM-DD" },
    { key: "vendor_url", label: "Account", type: "url" },
    { key: "license_file_path", label: "File", type: "text" },
    { key: "notes", label: "Notes", type: "text" },
  ];

  async function openLicensePopover(triggerEl, productId) {
    // Toggle closed if clicking the same product's indicator
    if (licensePopover.classList.contains("open") && licPopoverProductId === productId) {
      closeLicensePopover();
      return;
    }
    closeLicensePopover();
    closeStatusPopover();
    licPopoverProductId = productId;

    const product = allProducts.find((p) => p.id === productId);
    if (!product) return;

    const rect = triggerEl.getBoundingClientRect();

    if (product.has_license) {
      // Fetch full product to get license details
      const fetchId = ++_licPopoverFetchId;
      try {
        const res = await fetch(`/api/products/${productId}`);
        if (fetchId !== _licPopoverFetchId) return;
        const detail = await res.json();
        renderLicensePopoverSummary(detail);
      } catch {
        if (fetchId !== _licPopoverFetchId) return;
        licensePopover.innerHTML = '<p class="no-data">Failed to load</p>';
      }
    } else {
      renderLicensePopoverForm();
    }

    licensePopover.classList.add("open");

    // Position below the trigger
    licensePopover.style.top = rect.bottom + 4 + "px";
    licensePopover.style.left = (rect.left - 140) + "px";

    // Adjust if off-screen
    requestAnimationFrame(() => {
      const popRect = licensePopover.getBoundingClientRect();
      if (popRect.right > window.innerWidth - 8) {
        licensePopover.style.left = (window.innerWidth - popRect.width - 8) + "px";
      }
      if (popRect.left < 8) {
        licensePopover.style.left = "8px";
      }
      if (popRect.bottom > window.innerHeight - 8) {
        licensePopover.style.top = (rect.top - popRect.height - 4) + "px";
      }
    });
  }

  function renderLicensePopoverForm() {
    let html = '<div class="license-popover__title">Add License</div>';

    CORE_LICENSE_FIELDS.forEach((f) => {
      html += '<div class="license-popover__field">';
      html += `<label class="license-popover__label">${f.label}</label>`;
      html += `<input type="${f.type}" class="license-popover__input" data-field="${f.key}" placeholder="${f.placeholder || ""}" spellcheck="false">`;
      html += '</div>';
    });

    html += '<button class="license-popover__more" id="lic-pop-more-btn">More fields... <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';

    html += '<div class="license-popover__extra" id="lic-pop-extra">';
    EXTRA_LICENSE_FIELDS.forEach((f) => {
      html += '<div class="license-popover__field">';
      html += `<label class="license-popover__label">${f.label}</label>`;
      html += `<input type="${f.type}" class="license-popover__input" data-field="${f.key}" placeholder="${f.placeholder || ""}" spellcheck="false">`;
      html += '</div>';
    });
    html += '</div>';

    html += '<div class="license-popover__actions">';
    html += '<button class="license-popover__save" id="lic-pop-save">Save</button>';
    html += '<button class="license-popover__cancel" id="lic-pop-cancel">Cancel</button>';
    html += '</div>';

    licensePopover.innerHTML = html;

    // Bind events
    document.getElementById("lic-pop-more-btn").addEventListener("click", () => {
      const extra = document.getElementById("lic-pop-extra");
      extra.classList.toggle("show");
    });

    document.getElementById("lic-pop-save").addEventListener("click", saveLicenseFromPopover);
    document.getElementById("lic-pop-cancel").addEventListener("click", closeLicensePopover);

    // Focus first input
    requestAnimationFrame(() => {
      const firstInput = licensePopover.querySelector(".license-popover__input");
      if (firstInput) firstInput.focus();
    });
  }

  function renderLicensePopoverSummary(product) {
    const lic = product.licenses[0]; // Show first license
    if (!lic) {
      licensePopover.innerHTML =
        '<div class="license-popover__title">License Info</div>' +
        '<p class="no-data">No license details</p>';
      return;
    }
    let html = '<div class="license-popover__title">License Info</div>';
    html += '<dl class="license-popover__summary">';

    const fields = [
      { key: "serial_key", label: "Key" },
      { key: "email", label: "Email" },
      { key: "license_manager", label: "Manager" },
      { key: "source", label: "Source" },
      { key: "purchase_date", label: "Purchased" },
    ];

    let hasAny = false;
    fields.forEach((f) => {
      if (lic[f.key]) {
        let val = lic[f.key];
        if (f.key === "serial_key") val = maskValue(val);
        else if (f.key === "email") val = maskEmail(val);
        html += `<dt>${f.label}</dt><dd>${esc(val)}</dd>`;
        hasAny = true;
      }
    });

    if (!hasAny) {
      html += '<dd class="no-data">No details recorded</dd>';
    }

    html += '</dl>';
    html += `<button class="license-popover__edit-link" id="lic-pop-edit">Edit in drawer</button>`;

    licensePopover.innerHTML = html;

    document.getElementById("lic-pop-edit").addEventListener("click", () => {
      closeLicensePopover();
      openDrawer(product.id);
    });
  }

  async function saveLicenseFromPopover() {
    const productId = licPopoverProductId;
    if (!productId) return;

    const data = {};
    licensePopover.querySelectorAll(".license-popover__input").forEach((input) => {
      if (input.value.trim()) data[input.dataset.field] = input.value.trim();
    });

    try {
      const res = await fetch(`/api/products/${productId}/licenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        closeLicensePopover();
        // Update local state
        const idx = allProducts.findIndex((p) => p.id === productId);
        if (idx !== -1) {
          allProducts[idx].has_license = true;
          if (data.serial_key) allProducts[idx].has_serial_key = true;
        }
        applyFilters();
        toast("License added", "success");
      } else {
        toast("Failed to save license", "error");
      }
    } catch {
      toast("Network error", "error");
    }
  }

  function closeLicensePopover() {
    licensePopover.classList.remove("open");
    licPopoverProductId = null;
  }

  // ---- Detail Drawer ----

  let _drawerFetchId = 0; // guard against stale fetches

  async function openDrawer(productId) {
    selectedProductId = productId;

    document.querySelectorAll("tbody tr.selected").forEach((tr) => {
      tr.classList.remove("selected");
    });
    const row = document.querySelector(`tr[data-id="${productId}"]`);
    if (row) row.classList.add("selected");

    const wasOpen = drawer.classList.contains("open");
    drawer.classList.add("open");

    // Only show loading state on first open; keep previous content while switching
    if (!wasOpen) {
      drawerTitle.textContent = "Loading...";
      drawerVendor.textContent = "";
      drawerBody.innerHTML = "";
    }

    // In merge mode with preview on, render the synthetic product
    if (mergeMode && mergePreviewOn && mergeSyntheticProduct) {
      renderDrawer(mergeSyntheticProduct);
      return;
    }

    // In merge mode without preview, render the primary from cached details
    if (mergeMode) {
      const cached = mergeProductDetails.find((p) => p.id === productId);
      if (cached) {
        renderDrawer(cached);
        return;
      }
    }

    const fetchId = ++_drawerFetchId;
    try {
      const res = await fetch(`/api/products/${productId}`);
      if (fetchId !== _drawerFetchId) return; // superseded by newer navigation
      const product = await res.json();
      if (fetchId !== _drawerFetchId) return;
      renderDrawer(product);
    } catch (err) {
      if (fetchId !== _drawerFetchId) return;
      drawerBody.innerHTML =
        '<p class="no-data">Failed to load product details</p>';
    }
  }

  function renderDrawer(product) {
    drawerTitle.textContent = product.name;
    drawerVendor.textContent = product.vendor ? `by ${product.vendor}` : "";

    let html = "";

    // Meta section
    html += '<div class="drawer-section">';
    html += '<div class="drawer-meta">';

    // Category (editable)
    html += '<div class="drawer-meta__item">';
    html += '<span class="drawer-meta__label">Category</span>';
    html += '<div class="status-select-wrap">';
    html += '<select id="drawer-category">';
    html += '<option value="">unknown</option>';
    ["instrument", "effect", "generator", "sound-pack", "utility", "standalone", "upgrade", "bundle"].forEach((c) => {
      const sel = c === product.category ? " selected" : "";
      html += `<option value="${c}"${sel}>${c}</option>`;
    });
    html += '</select>';
    html += '<span class="status-saved" id="drawer-category-saved">Saved</span>';
    html += '</div>';
    html += "</div>";

    // Installed (editable checkbox)
    html += '<div class="drawer-meta__item">';
    html += '<span class="drawer-meta__label">Installed</span>';
    html += `<label class="drawer-meta__value" style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="drawer-installed" ${product.installed ? "checked" : ""}> <span id="drawer-installed-label">${product.installed ? "Yes" : "No"}</span></label>`;
    html += "</div>";

    // Status (editable)
    html += '<div class="drawer-meta__item">';
    html += '<span class="drawer-meta__label">Status</span>';
    html += `<div class="status-select-wrap">`;
    html += `<select id="drawer-status">`;
    ["unknown", "licensed", "demo", "free", "subscription", "bundled"].forEach(
      (s) => {
        const sel = s === product.status ? " selected" : "";
        html += `<option value="${s}"${sel}>${s}</option>`;
      }
    );
    html += `</select>`;
    html += `<span class="status-saved" id="drawer-status-saved">Saved</span>`;
    html += `</div>`;
    html += "</div>";

    html += "</div>"; // drawer-meta

    // Notes (editable)
    html += `<div class="drawer-notes-wrap" style="margin-top: var(--space-sm)">`;
    html += `<span class="drawer-meta__label">Notes</span>`;
    html += `<textarea id="drawer-notes" class="drawer-notes-input" placeholder="Add notes..." spellcheck="false">${esc(product.notes)}</textarea>`;
    html += `<div class="drawer-notes-actions">`;
    html += `<button class="btn-save" id="drawer-save-notes">Save</button>`;
    html += `<span class="status-saved" id="drawer-notes-saved">Saved</span>`;
    html += `</div>`;
    html += `</div>`;

    html += "</div>"; // drawer-section

    // Entity association sections (Bundle, Account, License Manager, Source)
    ENTITY_SECTIONS.forEach((config) => {
      html += renderEntitySection(product, config);
    });

    // Installations
    html += '<div class="drawer-section">';
    html += '<div class="drawer-section__title">Installations</div>';

    if (product.installations.length === 0) {
      html += '<p class="no-data">No installations found</p>';
    } else {
      product.installations.forEach((inst) => {
        const removed = inst.is_present
          ? ""
          : ' <span class="install-card__removed">REMOVED</span>';
        const fmtColor = `var(--fmt-${inst.format})`;

        html += '<div class="install-card">';
        html += '<div class="install-card__header">';
        html += `<span class="install-card__format" style="color: ${fmtColor}">${inst.format.toUpperCase()}</span>`;
        html += `<span class="install-card__version">v${esc(inst.version) || "?"}</span>`;
        html += removed;
        html += "</div>";
        html += '<div class="install-card__detail">';
        html += esc(inst.path);
        if (inst.bundle_id) html += `<br>ID: ${esc(inst.bundle_id)}`;
        if (inst.au_type)
          html += `<br>AU: ${esc(inst.au_type)}/${esc(inst.au_subtype)}/${esc(inst.au_manufacturer)}`;
        html += "</div>";
        html += "</div>";
      });
    }

    html += "</div>"; // drawer-section

    // Licenses (editable)
    html += '<div class="drawer-section">';
    html += '<div class="drawer-section__title">Licenses</div>';
    html += `<div id="drawer-licenses" data-product-id="${product.id}">`;

    if (product.licenses.length === 0) {
      html += '<p class="no-data" id="no-licenses-msg">No license info recorded</p>';
    } else {
      product.licenses.forEach((lic) => {
        html += renderLicenseCard(lic);
      });
    }

    html += "</div>"; // drawer-licenses
    html += `<button class="btn btn--ghost btn--sm" id="drawer-add-license" data-product-id="${product.id}" style="margin-top: var(--space-sm)">Add License</button>`;
    html += "</div>"; // drawer-section

    drawerBody.innerHTML = html;

    if (product._synthetic) {
      // Preview mode: editable but no live API handlers
      drawer.classList.remove("drawer--readonly");
      return;
    }

    if (mergeMode) {
      // Source product in merge mode: read-only
      makeDrawerReadOnly();
      return;
    }

    drawer.classList.remove("drawer--readonly");
    // Bind status change handler
    bindStatusHandler(product);
    // Bind category change handler
    bindCategoryHandler(product);
    // Bind installed toggle handler
    bindInstalledHandler(product);
    // Bind notes handler
    bindNotesHandler(product);
    // Bind entity picker handlers (bundle, account, license manager, source)
    bindEntityPickers(product);
    // Bind license handlers
    bindLicenseHandlers(product);
  }

  function renderLicenseCard(lic) {
    let html = `<div class="license-card" data-license-id="${lic.id}">`;
    LICENSE_FIELDS.forEach((f) => {
      const inputType = (SENSITIVE_FIELDS.has(f.key) && privacyMode) ? "password" : f.type;
      html += '<div class="license-edit-field">';
      html += `<label class="license-field__label">${f.label}</label>`;
      html += `<input type="${inputType}" class="license-input" data-field="${f.key}" value="${esc(lic[f.key] || "")}" placeholder="${f.placeholder || ""}" spellcheck="false">`;
      html += "</div>";
    });
    html += '<div class="license-card__actions">';
    html += `<button class="btn-save license-save-btn">Save</button>`;
    html += `<span class="status-saved license-saved-msg">Saved</span>`;
    html += `<button class="btn btn--ghost btn--sm license-delete-btn" style="margin-left: auto; color: #ef4444;">Delete</button>`;
    html += "</div>";
    html += "</div>";
    return html;
  }

  function renderNewLicenseCard(productId) {
    let html = `<div class="license-card license-card--new" data-product-id="${productId}">`;
    LICENSE_FIELDS.forEach((f) => {
      html += '<div class="license-edit-field">';
      html += `<label class="license-field__label">${f.label}</label>`;
      html += `<input type="${f.type}" class="license-input" data-field="${f.key}" value="" placeholder="${f.placeholder || ""}" spellcheck="false">`;
      html += "</div>";
    });
    html += '<div class="license-card__actions">';
    html += `<button class="btn-save license-create-btn visible">Create</button>`;
    html += `<button class="btn btn--ghost btn--sm license-cancel-btn" style="margin-left: 8px;">Cancel</button>`;
    html += "</div>";
    html += "</div>";
    return html;
  }

  function bindStatusHandler(product) {
    const statusSelect = document.getElementById("drawer-status");
    const savedLabel = document.getElementById("drawer-status-saved");
    const originalStatus = product.status;

    statusSelect.addEventListener("change", async () => {
      const newStatus = statusSelect.value;
      try {
        const res = await fetch(`/api/products/${product.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) {
          const idx = allProducts.findIndex((p) => p.id === product.id);
          if (idx !== -1) allProducts[idx].status = newStatus;
          applyFilters();

          savedLabel.classList.add("show");
          setTimeout(() => savedLabel.classList.remove("show"), 2000);

          if ((newStatus === "licensed" || newStatus === "subscription") && !product.has_license) {
            toast("Status updated — add license info?", "success", {
              label: "Add License",
              onClick: () => {
                // Scroll to license section in drawer
                const licSection = document.getElementById("drawer-licenses");
                if (licSection) licSection.scrollIntoView({ behavior: "smooth" });
                const addBtn = document.getElementById("drawer-add-license");
                if (addBtn) addBtn.click();
              },
            });
          } else {
            toast("Status updated", "success");
          }
        } else {
          toast("Failed to update status", "error");
          statusSelect.value = originalStatus;
        }
      } catch {
        toast("Network error", "error");
        statusSelect.value = originalStatus;
      }
    });
  }

  function bindCategoryHandler(product) {
    const categorySelect = document.getElementById("drawer-category");
    const savedLabel = document.getElementById("drawer-category-saved");

    categorySelect.addEventListener("change", async () => {
      const newCategory = categorySelect.value;
      try {
        const res = await fetch(`/api/products/${product.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: newCategory }),
        });
        if (res.ok) {
          const idx = allProducts.findIndex((p) => p.id === product.id);
          if (idx !== -1) allProducts[idx].category = newCategory;
          applyFilters();
          savedLabel.classList.add("show");
          setTimeout(() => savedLabel.classList.remove("show"), 2000);
        } else {
          toast("Failed to update category", "error");
        }
      } catch {
        toast("Network error", "error");
      }
    });
  }

  function bindInstalledHandler(product) {
    const checkbox = document.getElementById("drawer-installed");
    const label = document.getElementById("drawer-installed-label");

    checkbox.addEventListener("change", async () => {
      const newVal = checkbox.checked;
      try {
        const res = await fetch(`/api/products/${product.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ installed: newVal }),
        });
        if (res.ok) {
          const idx = allProducts.findIndex((p) => p.id === product.id);
          if (idx !== -1) allProducts[idx].installed = newVal;
          label.textContent = newVal ? "Yes" : "No";
          applyFilters();
        } else {
          toast("Failed to update installed", "error");
          checkbox.checked = !newVal;
        }
      } catch {
        toast("Network error", "error");
        checkbox.checked = !newVal;
      }
    });
  }

  function bindNotesHandler(product) {
    const textarea = document.getElementById("drawer-notes");
    const saveBtn = document.getElementById("drawer-save-notes");
    const savedLabel = document.getElementById("drawer-notes-saved");
    const originalNotes = product.notes || "";

    // Auto-resize
    function autoResize() {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    }
    autoResize();

    textarea.addEventListener("input", () => {
      autoResize();
      saveBtn.classList.toggle("visible", textarea.value !== originalNotes);
      savedLabel.classList.remove("show");
    });

    saveBtn.addEventListener("click", async () => {
      try {
        const res = await fetch(`/api/products/${product.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: textarea.value }),
        });
        if (res.ok) {
          const idx = allProducts.findIndex((p) => p.id === product.id);
          if (idx !== -1) allProducts[idx].notes = textarea.value;

          saveBtn.classList.remove("visible");
          savedLabel.classList.add("show");
          setTimeout(() => savedLabel.classList.remove("show"), 2000);
          toast("Notes saved", "success");
        } else {
          toast("Failed to save notes", "error");
        }
      } catch {
        toast("Network error", "error");
      }
    });
  }

  function bindLicenseHandlers(product) {
    const container = document.getElementById("drawer-licenses");

    // Save existing license
    container.querySelectorAll(".license-card:not(.license-card--new)").forEach((card) => {
      const licId = card.dataset.licenseId;
      const saveBtn = card.querySelector(".license-save-btn");
      const savedMsg = card.querySelector(".license-saved-msg");
      const deleteBtn = card.querySelector(".license-delete-btn");

      saveBtn.addEventListener("click", async () => {
        const data = {};
        card.querySelectorAll(".license-input").forEach((input) => {
          data[input.dataset.field] = input.value;
        });
        try {
          const res = await fetch(`/api/licenses/${licId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (res.ok) {
            savedMsg.classList.add("show");
            setTimeout(() => savedMsg.classList.remove("show"), 2000);
            toast("License updated", "success");
          } else {
            toast("Failed to update license", "error");
          }
        } catch {
          toast("Network error", "error");
        }
      });

      // Show save button on input change
      card.querySelectorAll(".license-input").forEach((input) => {
        input.addEventListener("input", () => {
          saveBtn.classList.add("visible");
          savedMsg.classList.remove("show");
        });
      });

      deleteBtn.addEventListener("click", async () => {
        if (!confirm("Delete this license?")) return;
        try {
          const res = await fetch(`/api/licenses/${licId}`, { method: "DELETE" });
          if (res.ok) {
            card.remove();
            toast("License deleted", "success");
            // Show "no licenses" if empty
            if (!container.querySelector(".license-card")) {
              container.innerHTML = '<p class="no-data" id="no-licenses-msg">No license info recorded</p>';
            }
          }
        } catch {
          toast("Network error", "error");
        }
      });
    });

    // Add license button
    const addBtn = document.getElementById("drawer-add-license");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        // Remove "no licenses" message
        const noMsg = document.getElementById("no-licenses-msg");
        if (noMsg) noMsg.remove();

        // Add new card
        container.insertAdjacentHTML("beforeend", renderNewLicenseCard(product.id));
        const newCard = container.querySelector(".license-card--new:last-child");

        newCard.querySelector(".license-create-btn").addEventListener("click", async () => {
          const data = {};
          newCard.querySelectorAll(".license-input").forEach((input) => {
            data[input.dataset.field] = input.value;
          });
          try {
            const res = await fetch(`/api/products/${product.id}/licenses`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            if (res.ok) {
              const pidx = allProducts.findIndex((p) => p.id === product.id);
              if (pidx !== -1) allProducts[pidx].has_license = true;
              applyFilters();
              toast("License created", "success");
              openDrawer(product.id); // Refresh
            }
          } catch {
            toast("Network error", "error");
          }
        });

        newCard.querySelector(".license-cancel-btn").addEventListener("click", () => {
          addBtn.style.display = "";
          newCard.remove();
          if (!container.querySelector(".license-card")) {
            container.innerHTML = '<p class="no-data" id="no-licenses-msg">No license info recorded</p>';
          }
        });

        // Focus first input
        const firstInput = newCard.querySelector(".license-input");
        if (firstInput) firstInput.focus();

        addBtn.style.display = "none";
      });
    }
  }

  function closeDrawer() {
    if (mergeMode) {
      closeMergeMode();
      return;
    }
    _closeDrawerUI();
  }

  // ---- Entity Management Overlay (Bundle, Account, License Manager, Source) ----

  let currentEntityTab = "bundles";

  const MANAGE_CONFIGS = {
    bundles: {
      label: "Bundle",
      fields: BUNDLE_FIELDS,
      apiEndpoint: "/api/bundles",
      reloadFn: loadBundles,
      listId: "bundle-list",
      emptyId: "bundle-detail-empty",
      formId: "bundle-detail-form",
      createBtnId: "bundle-create-btn",
      idPrefix: "bundle",
      dataIdAttr: "bundleId",
      selectedId: null,
      allItems: () => allBundles,
      sensitiveFields: new Set(["serial_key"]),
      renderListMeta: (item) => `${esc(item.vendor)} &middot; ${item.product_count} products`,
      renderDetailExtra: renderBundleMemberProducts,
    },
    accounts: {
      label: "Account",
      fields: ACCOUNT_FIELDS,
      apiEndpoint: "/api/accounts",
      reloadFn: loadAccounts,
      listId: "account-list",
      emptyId: "account-detail-empty",
      formId: "account-detail-form",
      createBtnId: "account-create-btn",
      idPrefix: "account",
      dataIdAttr: "accountId",
      selectedId: null,
      allItems: () => allAccounts,
      sensitiveFields: new Set(["email"]),
      renderListMeta: (item) => esc(item.email) || "No email",
    },
    managers: {
      label: "License Manager",
      fields: LICENSE_MANAGER_FIELDS,
      apiEndpoint: "/api/license-managers",
      reloadFn: loadLicenseManagers,
      listId: "lm-list",
      emptyId: "lm-detail-empty",
      formId: "lm-detail-form",
      createBtnId: "lm-create-btn",
      idPrefix: "lm",
      dataIdAttr: "lmId",
      selectedId: null,
      allItems: () => allLicenseManagers,
      sensitiveFields: new Set(),
      renderListMeta: (item) => esc(item.url) || "No URL",
    },
    sources: {
      label: "Source",
      fields: SOURCE_FIELDS,
      apiEndpoint: "/api/sources",
      reloadFn: loadSources,
      listId: "source-list",
      emptyId: "source-detail-empty",
      formId: "source-detail-form",
      createBtnId: "source-create-btn",
      idPrefix: "source",
      dataIdAttr: "sourceId",
      selectedId: null,
      allItems: () => allSources,
      sensitiveFields: new Set(["email"]),
      renderListMeta: (item) => esc(item.email || item.url) || "No email",
    },
  };

  function openBundleOverlay() {
    manageOverlay.classList.add("active");
    currentEntityTab = "bundles";
    switchEntityTab("bundles");
  }

  function closeBundleOverlay() {
    manageOverlay.classList.remove("active");
  }

  function switchEntityTab(tab, entityId) {
    currentEntityTab = tab;

    document.querySelectorAll(".entity-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".entity-tab-content").forEach((content) => {
      content.style.display = content.dataset.tabContent === tab ? "flex" : "none";
    });

    const cfg = MANAGE_CONFIGS[tab];
    if (!cfg) return;
    cfg.selectedId = entityId || null;
    renderEntityMgmtList(cfg).then(() => {
      if (entityId) loadEntityMgmtDetail(cfg, entityId);
    });
    if (!entityId) showEntityMgmtDetailEmpty(cfg);
  }

  function renderEntityFormFieldsHtml(fields, entity, sensitiveFields) {
    let html = '<div class="entity-form-fields">';
    fields.forEach((f) => {
      const inputType = (sensitiveFields.has(f.key) && privacyMode) ? "password" : "text";
      const value = entity ? esc(entity[f.key] || "") : "";
      html += '<div class="entity-form-field">';
      html += `<label class="license-field__label">${f.label}${f.required ? " *" : ""}</label>`;
      html += `<input type="${inputType}" class="license-input entity-field-input" data-field="${f.key}" value="${value}" placeholder="${f.placeholder || ""}" spellcheck="false">`;
      html += "</div>";
    });
    html += "</div>";
    return html;
  }

  function collectFormData(formEl) {
    const data = {};
    formEl.querySelectorAll(".entity-field-input").forEach((input) => {
      data[input.dataset.field] = input.value;
    });
    return data;
  }

  async function renderEntityMgmtList(cfg) {
    await cfg.reloadFn();
    const list = document.getElementById(cfg.listId);
    const items = cfg.allItems();
    if (items.length === 0) {
      list.innerHTML = `<p class="no-data">No ${cfg.label.toLowerCase()}s yet</p>`;
      return;
    }
    let html = "";
    items.forEach((item) => {
      const active = item.id === cfg.selectedId ? " entity-item--active" : "";
      html += `<div class="entity-item${active}" data-entity-id="${item.id}">`;
      html += `<div class="entity-item__name">${esc(item.name)}</div>`;
      html += `<div class="entity-item__meta">${cfg.renderListMeta(item)}</div>`;
      html += "</div>";
    });
    list.innerHTML = html;

    list.querySelectorAll(".entity-item").forEach((el) => {
      el.addEventListener("click", () => {
        cfg.selectedId = parseInt(el.dataset.entityId);
        list.querySelectorAll(".entity-item").forEach((e) => e.classList.remove("entity-item--active"));
        el.classList.add("entity-item--active");
        loadEntityMgmtDetail(cfg, cfg.selectedId);
      });
    });
  }

  function showEntityMgmtDetailEmpty(cfg) {
    document.getElementById(cfg.emptyId).style.display = "";
    document.getElementById(cfg.formId).style.display = "none";
  }

  async function loadEntityMgmtDetail(cfg, entityId) {
    document.getElementById(cfg.emptyId).style.display = "none";
    const formEl = document.getElementById(cfg.formId);
    formEl.style.display = "";
    formEl.innerHTML = '<p class="no-data">Loading...</p>';

    try {
      const res = await fetch(`${cfg.apiEndpoint}/${entityId}`);
      const entity = await res.json();
      renderEntityMgmtDetailForm(cfg, entity);
    } catch {
      formEl.innerHTML = `<p class="no-data">Failed to load ${cfg.label.toLowerCase()}</p>`;
    }
  }

  function renderEntityMgmtDetailForm(cfg, entity) {
    const formEl = document.getElementById(cfg.formId);
    const prefix = cfg.idPrefix;

    let html = renderEntityFormFieldsHtml(cfg.fields, entity, cfg.sensitiveFields);

    html += '<div class="entity-form-actions">';
    html += `<button class="btn btn--accent" id="${prefix}-save-btn">Save</button>`;
    html += `<span class="status-saved" id="${prefix}-saved-msg">Saved</span>`;
    html += `<button class="btn btn--ghost btn--sm" id="${prefix}-delete-btn" style="margin-left: auto; color: #ef4444;">Delete ${cfg.label}</button>`;
    html += "</div>";

    if (cfg.renderDetailExtra) {
      html += cfg.renderDetailExtra(entity);
    }

    formEl.innerHTML = html;

    document.getElementById(`${prefix}-save-btn`).addEventListener("click", async () => {
      const data = collectFormData(formEl);
      if (!data.name || !data.name.trim()) {
        toast("Name is required", "error");
        return;
      }
      try {
        const res = await fetch(`${cfg.apiEndpoint}/${entity.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          const msg = document.getElementById(`${prefix}-saved-msg`);
          msg.classList.add("show");
          setTimeout(() => msg.classList.remove("show"), 2000);
          toast(`${cfg.label} saved`, "success");
          renderEntityMgmtList(cfg);
        }
      } catch {
        toast("Network error", "error");
      }
    });

    document.getElementById(`${prefix}-delete-btn`).addEventListener("click", async () => {
      if (!confirm(`Delete ${cfg.label.toLowerCase()} "${entity.name}"? Products will be unlinked.`)) return;
      try {
        const res = await fetch(`${cfg.apiEndpoint}/${entity.id}`, { method: "DELETE" });
        if (res.ok) {
          toast(`${cfg.label} deleted`, "success");
          cfg.selectedId = null;
          await Promise.all([loadProducts(), renderEntityMgmtList(cfg)]);
          showEntityMgmtDetailEmpty(cfg);
        }
      } catch {
        toast("Network error", "error");
      }
    });

    if (cfg.bindDetailExtra) {
      cfg.bindDetailExtra(cfg, entity, formEl);
    }
  }

  function initEntityMgmtCreate(cfg) {
    document.getElementById(cfg.createBtnId).addEventListener("click", () => {
      document.getElementById(cfg.emptyId).style.display = "none";
      const formEl = document.getElementById(cfg.formId);
      formEl.style.display = "";

      let html = renderEntityFormFieldsHtml(cfg.fields, null, cfg.sensitiveFields);
      html += '<div class="entity-form-actions">';
      html += `<button class="btn btn--accent" id="${cfg.idPrefix}-create-save-btn">Create</button>`;
      html += `<button class="btn btn--ghost btn--sm" id="${cfg.idPrefix}-create-cancel-btn" style="margin-left: 8px;">Cancel</button>`;
      html += "</div>";

      formEl.innerHTML = html;

      document.getElementById(`${cfg.idPrefix}-create-save-btn`).addEventListener("click", async () => {
        const data = collectFormData(formEl);
        if (!data.name || !data.name.trim()) {
          toast("Name is required", "error");
          return;
        }
        try {
          const res = await fetch(cfg.apiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (res.ok) {
            const result = await res.json();
            toast(`${cfg.label} created`, "success");
            cfg.selectedId = result.id;
            await renderEntityMgmtList(cfg);
            loadEntityMgmtDetail(cfg, result.id);
          }
        } catch {
          toast("Network error", "error");
        }
      });

      document.getElementById(`${cfg.idPrefix}-create-cancel-btn`).addEventListener("click", () => {
        showEntityMgmtDetailEmpty(cfg);
      });

      const nameInput = formEl.querySelector('[data-field="name"]');
      if (nameInput) nameInput.focus();
    });
  }

  function renderBundleMemberProducts(bundle) {
    let html = '<div class="entity-members-section">';
    html += '<div class="drawer-section__title">Member Products</div>';
    if (bundle.products && bundle.products.length > 0) {
      html += '<div class="entity-member-list">';
      bundle.products.forEach((p) => {
        html += `<div class="entity-member-item">`;
        html += `<span class="entity-member-name">${esc(p.name)}</span>`;
        html += `<span class="entity-member-vendor">${esc(p.vendor)}</span>`;
        html += `<button class="btn btn--ghost btn--xs entity-remove-product" data-product-id="${p.id}">Remove</button>`;
        html += `</div>`;
      });
      html += "</div>";
    } else {
      html += '<p class="no-data">No products in this bundle</p>';
    }

    html += '<div class="entity-add-products">';
    html += '<input type="text" class="license-input" id="bundle-product-search" placeholder="Search products to add..." spellcheck="false">';
    html += '<div class="entity-search-results" id="bundle-search-results"></div>';
    html += "</div>";
    html += "</div>";
    return html;
  }

  // Assigned as bindDetailExtra on the bundles config after definition
  MANAGE_CONFIGS.bundles.bindDetailExtra = function (cfg, bundle, formEl) {
    formEl.querySelectorAll(".entity-remove-product").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const productId = parseInt(btn.dataset.productId);
        try {
          const res = await fetch("/api/products/bulk", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_ids: [productId], bundle_id: null }),
          });
          if (res.ok) {
            toast("Product removed", "success");
            await loadProducts();
            loadEntityMgmtDetail(cfg, bundle.id);
            renderEntityMgmtList(cfg);
          }
        } catch {
          toast("Network error", "error");
        }
      });
    });

    const searchEl = document.getElementById("bundle-product-search");
    const resultsEl = document.getElementById("bundle-search-results");
    const memberIds = new Set((bundle.products || []).map((p) => p.id));

    searchEl.addEventListener("input", () => {
      const q = searchEl.value.toLowerCase().trim();
      if (!q) {
        resultsEl.innerHTML = "";
        return;
      }
      const matches = allProducts
        .filter((p) => !memberIds.has(p.id) && `${p.name} ${p.vendor}`.toLowerCase().includes(q))
        .slice(0, 10);

      if (matches.length === 0) {
        resultsEl.innerHTML = '<div class="entity-search-empty">No matches</div>';
        return;
      }

      resultsEl.innerHTML = matches
        .map(
          (p) =>
            `<div class="entity-search-item" data-product-id="${p.id}">` +
            `<span>${esc(p.name)}</span> <span class="entity-search-vendor">${esc(p.vendor)}</span>` +
            `<button class="btn btn--ghost btn--xs">Add</button>` +
            `</div>`
        )
        .join("");

      resultsEl.querySelectorAll(".entity-search-item").forEach((el) => {
        el.querySelector("button").addEventListener("click", async () => {
          const productId = parseInt(el.dataset.productId);
          try {
            const res = await fetch("/api/products/bulk", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ product_ids: [productId], bundle_id: bundle.id }),
            });
            if (res.ok) {
              toast("Product added", "success");
              memberIds.add(productId);
              el.remove();
              await loadProducts();
              loadEntityMgmtDetail(cfg, bundle.id);
              renderEntityMgmtList(cfg);
            }
          } catch {
            toast("Network error", "error");
          }
        });
      });
    });
  };

  // ---- Create Product ----

  function initCreateProduct() {
    function openCreateProduct() {
      createProductOverlay.classList.add("active");
      document.getElementById("cp-name").value = "";
      document.getElementById("cp-vendor").value = "";
      document.getElementById("cp-category").value = "";
      document.getElementById("cp-status").value = "unknown";
      setTimeout(() => document.getElementById("cp-name").focus(), 50);
    }

    function closeCreateProduct() {
      createProductOverlay.classList.remove("active");
    }

    btnCreateProduct.addEventListener("click", openCreateProduct);
    document.getElementById("create-product-close").addEventListener("click", closeCreateProduct);
    document.getElementById("cp-cancel").addEventListener("click", closeCreateProduct);
    createProductOverlay.addEventListener("click", (e) => {
      if (e.target === createProductOverlay) closeCreateProduct();
    });

    document.getElementById("cp-submit").addEventListener("click", async () => {
      const name = document.getElementById("cp-name").value.trim();
      if (!name) {
        toast("Name is required", "error");
        return;
      }
      const data = {
        name,
        vendor: document.getElementById("cp-vendor").value.trim() || null,
        category: document.getElementById("cp-category").value || null,
        status: document.getElementById("cp-status").value || "unknown",
      };
      try {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          toast("Product created", "success");
          closeCreateProduct();
          await loadProducts();
          applyFilters();
        } else {
          const err = await res.json();
          toast(err.error || "Failed to create product", "error");
        }
      } catch {
        toast("Network error", "error");
      }
    });
  }

  // ---- Scan ----

  async function triggerScan() {
    scanOverlay.classList.add("active");
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const result = await res.json();
      toast(
        `Scan complete: ${result.products_found} products, ${result.new_plugins} new`,
        "success"
      );
      await Promise.all([loadProducts(), loadBundles(), loadSources()]);
      if (selectedProductId) openDrawer(selectedProductId);
    } catch {
      toast("Scan failed", "error");
    } finally {
      scanOverlay.classList.remove("active");
    }
  }

  // ---- Toast ----

  function toast(message, type, action) {
    document.querySelectorAll(".toast").forEach((el) => el.remove());

    const el = document.createElement("div");
    el.className = `toast ${type || ""}`;

    if (action) {
      el.classList.add("toast--action");
      const span = document.createElement("span");
      span.textContent = message;
      el.appendChild(span);
      const btn = document.createElement("button");
      btn.className = "toast__btn";
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        el.classList.remove("show");
        setTimeout(() => el.remove(), 300);
        action.onClick();
      });
      el.appendChild(btn);
    } else {
      el.textContent = message;
    }

    document.body.appendChild(el);

    requestAnimationFrame(() => {
      el.classList.add("show");
    });

    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, action ? 6000 : 3000);
  }

  // ---- Event Binding ----

  function bindEvents() {
    // Filters (dropdown change callbacks are wired in FilterDropdown constructor)
    searchInput.addEventListener("input", applyFilters);

    // Sort
    document.querySelectorAll("thead th.sortable").forEach((th) => {
      th.addEventListener("click", () => setSort(th.dataset.sort));
    });

    // Initial sort indicator
    const initTh = document.querySelector(`th[data-sort="${sortColumn}"]`);
    if (initTh) initTh.classList.add("sorted-asc");

    // Select-all checkbox — indeterminate click clears selection
    let selectAllWasIndeterminate = false;
    // Capture indeterminate on mousedown, before the browser clears it
    selectAllCheckbox.closest("label").addEventListener("mousedown", () => {
      selectAllWasIndeterminate = selectAllCheckbox.indeterminate;
    });
    selectAllCheckbox.addEventListener("change", () => {
      const visibleIds = filteredProducts.map((p) => p.id);
      if (selectAllWasIndeterminate || !selectAllCheckbox.checked) {
        // Indeterminate → deselect all; unchecked → deselect all
        visibleIds.forEach((id) => selectedProductIds.delete(id));
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      } else {
        visibleIds.forEach((id) => selectedProductIds.add(id));
      }
      selectAllWasIndeterminate = false;
      tbody.querySelectorAll(".row-check").forEach((cb) => {
        cb.checked = selectedProductIds.has(parseInt(cb.dataset.id));
      });
      updateBulkBar();
    });

    document.getElementById("bulk-status").addEventListener("change", async (e) => {
      const status = e.target.value;
      if (!status) return;
      e.target.value = "";
      const ids = [...selectedProductIds];
      try {
        const res = await fetch("/api/products/bulk", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_ids: ids, status }),
        });
        if (res.ok) {
          ids.forEach((id) => {
            const p = allProducts.find((p) => p.id === id);
            if (p) p.status = status;
          });
          updateStats();
          applyFilters();
          toast(`Updated ${ids.length} products`, "success");
        } else {
          toast("Bulk update failed", "error");
        }
      } catch {
        toast("Network error", "error");
      }
    });

    const BULK_ASSIGN_CONFIGS = [
      { elementId: "bulk-bundle", apiField: "bundle_id", idProp: "bundle_id", nameProp: "bundle_name", label: "bundle", allItems: () => allBundles, reloadFn: loadBundles },
      { elementId: "bulk-account", apiField: "account_id", idProp: "account_id", nameProp: "account_name", label: "account", allItems: () => allAccounts, reloadFn: loadAccounts },
      { elementId: "bulk-lm", apiField: "license_manager_id", idProp: "license_manager_id", nameProp: "license_manager_name", label: "license manager", allItems: () => allLicenseManagers, reloadFn: loadLicenseManagers },
      { elementId: "bulk-source", apiField: "source_id", idProp: "source_id", nameProp: "source_name", label: "source", allItems: () => allSources, reloadFn: loadSources },
    ];

    BULK_ASSIGN_CONFIGS.forEach((cfg) => {
      const sel = document.getElementById(cfg.elementId);
      if (!sel) return;
      sel.addEventListener("change", async (e) => {
        const val = e.target.value;
        if (!val) return;
        e.target.value = "";
        const isNone = val === "__none__";
        const entityId = isNone ? null : parseInt(val);
        const ids = [...selectedProductIds];
        try {
          const res = await fetch("/api/products/bulk", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_ids: ids, [cfg.apiField]: entityId }),
          });
          if (res.ok) {
            const entity = isNone ? null : cfg.allItems().find((item) => item.id === entityId);
            ids.forEach((id) => {
              const p = allProducts.find((p) => p.id === id);
              if (p) {
                p[cfg.idProp] = entityId;
                p[cfg.nameProp] = entity ? entity.name : "";
              }
            });
            applyFilters();
            await cfg.reloadFn();
            toast(isNone ? `Cleared ${cfg.label} from ${ids.length} products` : `Assigned ${ids.length} products to ${cfg.label}`, "success");
          } else {
            toast("Bulk update failed", "error");
          }
        } catch {
          toast("Network error", "error");
        }
      });
    });

    // Merge (drawer + side panel)
    document.getElementById("bulk-merge").addEventListener("click", openMergeMode);
    mergePanelCancel.addEventListener("click", closeMergeMode);
    mergePanelConfirm.addEventListener("click", executeMerge);
    mergePreviewToggle.addEventListener("change", () => {
      mergePreviewOn = mergePreviewToggle.checked;
      if (mergePreviewOn) {
        mergeSyntheticProduct = buildSyntheticProduct();
        if (mergeSyntheticProduct) {
          renderDrawer(mergeSyntheticProduct);
          updateMergePanelSummary();
        } else {
          mergePreviewToggle.checked = false;
          mergePreviewOn = false;
          mergePanelConfirm.disabled = true;
          toast("Cannot preview merge yet", "error");
        }
      } else {
        mergePanelConfirm.disabled = true;
        drawer.classList.remove("drawer--readonly");
        const primary = mergeProductDetails.find((p) => p.id === mergeKeepId);
        if (primary) renderDrawer(primary);
      }
    });

    // Drawer
    drawerClose.addEventListener("click", closeDrawer);
    drawerOverlay.addEventListener("click", closeDrawer);

    // Scan
    btnScan.addEventListener("click", triggerScan);

    // Export dropdown
    btnExport.addEventListener("click", (e) => {
      e.stopPropagation();
      exportDropdown.classList.toggle("open");
    });
    document.addEventListener("click", () => {
      exportDropdown.classList.remove("open");
    });

    // Bundle overlay
    btnManage.addEventListener("click", openBundleOverlay);
    document.getElementById("manage-close").addEventListener("click", closeBundleOverlay);
    manageOverlay.addEventListener("click", (e) => {
      if (e.target === manageOverlay) closeBundleOverlay();
    });

    // Entity tab switching
    document.querySelectorAll(".entity-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchEntityTab(btn.dataset.tab);
      });
    });

    Object.values(MANAGE_CONFIGS).forEach((cfg) => initEntityMgmtCreate(cfg));
    initCreateProduct();

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== searchInput && !manageOverlay.classList.contains("active")) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }

      if (e.key === "Escape") {
        if (mergeMode) {
          closeMergeMode();
        } else if (createProductOverlay.classList.contains("active")) {
          createProductOverlay.classList.remove("active");
        } else if (licensePopover.classList.contains("open")) {
          closeLicensePopover();
        } else if (statusPopover.classList.contains("open")) {
          closeStatusPopover();
        } else if (manageOverlay.classList.contains("active")) {
          closeBundleOverlay();
        } else if (drawer.classList.contains("open")) {
          closeDrawer();
        } else if (document.querySelector(".filter-dropdown__menu.open")) {
          document.querySelectorAll(".filter-dropdown__menu.open").forEach((m) => m.classList.remove("open"));
        } else if (document.activeElement === searchInput) {
          searchInput.blur();
        }
      }

      // Arrow keys navigate rows when drawer is open
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && drawer.classList.contains("open") && selectedProductId != null && !mergeMode) {
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        const idx = filteredProducts.findIndex((p) => p.id === selectedProductId);
        if (idx === -1) return;
        const next = e.key === "ArrowDown" ? idx + 1 : idx - 1;
        if (next < 0 || next >= filteredProducts.length) return;
        openDrawer(filteredProducts[next].id);
        const row = document.querySelector(`tr[data-id="${filteredProducts[next].id}"]`);
        if (row) row.scrollIntoView({ block: "nearest" });
      }
    });
  }

  // ---- Merge Products (Drawer + Side Panel) ----

  const mergePanel = document.getElementById("merge-panel");
  const mergePanelProductList = document.getElementById("merge-panel-product-list");
  const mergePanelSummary = document.getElementById("merge-panel-summary");
  const mergePreviewToggle = document.getElementById("merge-preview-toggle");
  const mergePanelConfirm = document.getElementById("merge-panel-confirm");
  const mergePanelCancel = document.getElementById("merge-panel-cancel");
  let mergeMode = false;
  let mergeProductDetails = [];
  let mergeKeepId = null;
  let mergePreviewOn = false;
  let mergeSyntheticProduct = null;

  function openMergeMode() {
    const ids = [...selectedProductIds];
    if (ids.length < 2) return;

    mergeProductDetails = [];
    mergeKeepId = null;
    mergePreviewOn = true;
    mergeSyntheticProduct = null;
    mergePreviewToggle.checked = true;
    mergePanelConfirm.disabled = false;

    Promise.all(ids.map((id) => fetch(`/api/products/${id}`).then((r) => r.json())))
      .then((details) => {
        mergeProductDetails = details;
        mergeKeepId = details[0].id;
        mergeSyntheticProduct = buildSyntheticProduct();
        mergeMode = true;
        renderMergePanelProductList();
        updateMergePanelSummary();
        // Open drawer showing the primary product, then show merge panel
        openDrawer(mergeKeepId);
        drawerOverlay.classList.add("open");
        mergePanel.classList.add("open");
      })
      .catch(() => {
        toast("Failed to load product details", "error");
      });
  }

  function closeMergeMode() {
    mergeMode = false;
    mergeProductDetails = [];
    mergeKeepId = null;
    mergePreviewOn = false;
    mergeSyntheticProduct = null;
    mergePanel.classList.remove("open");
    drawer.classList.remove("drawer--readonly");
    _closeDrawerUI();
  }

  function _closeDrawerUI() {
    drawer.classList.remove("open");
    drawerOverlay.classList.remove("open");
    selectedProductId = null;
    document.querySelectorAll("tbody tr.selected").forEach((tr) => {
      tr.classList.remove("selected");
    });
  }

  function buildSyntheticProduct() {
    const primary = mergeProductDetails.find((p) => p.id === mergeKeepId);
    if (!primary) return null;

    const ordered = [primary, ...mergeProductDetails.filter((p) => p.id !== mergeKeepId)];

    function firstVal(field) {
      for (const p of ordered) {
        if (p[field]) return p[field];
      }
      return null;
    }

    // Best status: prefer non-unknown
    const bestStatus = ordered.map((p) => p.status).find((s) => s && s !== "unknown") || primary.status;

    const allInstallations = ordered.flatMap((p) => p.installations || []);
    const allLicenses = ordered.flatMap((p) => p.licenses || []);

    // Deduplicated notes
    const allNotes = ordered.map((p) => (p.notes || "").trim()).filter(Boolean);
    const combinedNotes = [...new Set(allNotes)].join("\n");

    // Build entity objects for each association
    function firstEntity(idProp, objProp) {
      for (const p of ordered) {
        if (p[idProp] && p[objProp]) return { id: p[idProp], obj: p[objProp] };
      }
      return { id: null, obj: null };
    }

    const bundle = firstEntity("bundle_id", "bundle");
    const account = firstEntity("account_id", "account");
    const lm = firstEntity("license_manager_id", "license_manager");
    const source = firstEntity("source_id", "source");

    // Scanned name takes precedence: if exactly one product has installations,
    // use its name (and vendor if non-empty) so the next scan matches.
    let finalName = primary.name;
    let finalVendor = firstVal("vendor") || "";
    const scannedProducts = mergeProductDetails.filter((p) => (p.installations || []).length > 0);
    if (scannedProducts.length === 1) {
      const scanned = scannedProducts[0];
      finalName = scanned.name;
      if (scanned.vendor) finalVendor = scanned.vendor;
    }

    return {
      _synthetic: true,
      id: primary.id,
      name: finalName,
      vendor: finalVendor,
      category: firstVal("category") || "",
      status: bestStatus,
      installed: ordered.some((p) => p.installed),
      notes: combinedNotes,
      bundle_id: bundle.id,
      bundle: bundle.obj,
      account_id: account.id,
      account: account.obj,
      license_manager_id: lm.id,
      license_manager: lm.obj,
      source_id: source.id,
      source: source.obj,
      installations: allInstallations,
      licenses: allLicenses,
      formats: [...new Set(ordered.flatMap((p) => p.formats || []))],
      version: firstVal("version") || "",
    };
  }

  function renderMergePanelProductList() {
    let html = "";
    mergeProductDetails.forEach((p) => {
      const checked = p.id === mergeKeepId ? "checked" : "";
      const instCount = (p.installations || []).length;
      const licCount = (p.licenses || []).length;
      html += `<label class="merge-product-radio">
        <input type="radio" name="merge-primary" value="${p.id}" ${checked}>
        <div class="merge-product-radio__info">
          <div class="merge-product-radio__name">${esc(p.name)}</div>
          <div class="merge-product-radio__vendor">${esc(p.vendor) || "\u2014"}</div>
          <div class="merge-product-radio__counts">${instCount} inst · ${licCount} lic</div>
        </div>
      </label>`;
    });
    mergePanelProductList.innerHTML = html;

    mergePanelProductList.querySelectorAll('input[name="merge-primary"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        mergeKeepId = parseInt(radio.value);
        mergeSyntheticProduct = buildSyntheticProduct();
        updateMergePanelSummary();
        // Re-render drawer with new primary (or synthetic if preview on)
        if (mergePreviewOn) {
          renderDrawer(mergeSyntheticProduct);
        } else {
          const primary = mergeProductDetails.find((p) => p.id === mergeKeepId);
          if (primary) renderDrawer(primary);
        }
      });
    });
  }

  function updateMergePanelSummary() {
    let totalInstalls = 0;
    let totalLicenses = 0;
    mergeProductDetails.forEach((p) => {
      totalInstalls += (p.installations || []).length;
      totalLicenses += (p.licenses || []).length;
    });

    // Block merge if multiple products have installations (distinct scanned plugins)
    const scannedProducts = mergeProductDetails.filter((p) => (p.installations || []).length > 0);
    if (scannedProducts.length > 1) {
      mergePanelSummary.innerHTML = `
        <div class="merge-panel__conflict">Cannot merge: multiple scanned products selected. Each product with installations likely represents a distinct plugin.</div>
      `;
      mergePanelConfirm.disabled = true;
      return;
    }

    const primary = mergeProductDetails.find((p) => p.id === mergeKeepId);
    const others = mergeProductDetails.filter((p) => p.id !== mergeKeepId);
    const otherNames = others.map((p) => `<strong>${esc(p.name)}</strong>`).join(", ");
    const primaryName = primary ? `<strong>${esc(primary.name)}</strong>` : "primary";

    // Show name override info when scanned name differs from primary
    let nameNote = "";
    if (scannedProducts.length === 1 && primary && scannedProducts[0].id !== primary.id) {
      nameNote = `<br>Name: <strong>${esc(scannedProducts[0].name)}</strong> <span class="merge-panel__scan-tag">(scan name)</span>`;
    }

    mergePanelSummary.innerHTML = `
      Keep ${primaryName} — absorb ${otherNames}.${nameNote}<br>
      Result: <strong>${totalInstalls}</strong> installation${totalInstalls !== 1 ? "s" : ""},
      <strong>${totalLicenses}</strong> license${totalLicenses !== 1 ? "s" : ""}.
    `;

    if (mergePreviewOn) mergePanelConfirm.disabled = false;
  }

  function makeDrawerReadOnly() {
    drawer.classList.add("drawer--readonly");
  }

  async function executeMerge() {
    if (!mergeSyntheticProduct) {
      toast("Cannot merge: preview data not ready", "error");
      return;
    }
    const scannedCount = mergeProductDetails.filter((p) => (p.installations || []).length > 0).length;
    if (scannedCount > 1) {
      toast("Cannot merge: multiple scanned products", "error");
      return;
    }
    const primary = mergeProductDetails.find((p) => p.id === mergeKeepId);
    if (!primary) {
      toast("Cannot merge: primary product not found", "error");
      return;
    }

    const others = mergeProductDetails.filter((p) => p.id !== mergeKeepId);
    mergePanelConfirm.disabled = true;
    mergePanelConfirm.textContent = "Merging...";

    try {
      // 1. Merge each non-keep product into the keep product
      for (const other of others) {
        const res = await fetch("/api/products/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keep_id: mergeKeepId, remove_id: other.id }),
        });
        if (!res.ok) {
          toast(`Failed to merge "${other.name}"`, "error");
          mergePanelConfirm.disabled = false;
          mergePanelConfirm.textContent = "Merge";
          return;
        }
      }

      // 2. Apply field edits — read DOM for editable fields, fall back to synthetic for the rest
      const syn = mergeSyntheticProduct;
      const updates = {
        name: syn.name,
        vendor: syn.vendor,
        category: document.getElementById("drawer-category")?.value || null,
        status: document.getElementById("drawer-status")?.value || "unknown",
        notes: document.getElementById("drawer-notes")?.value?.trim() || "",
        installed: document.getElementById("drawer-installed")?.checked ?? syn.installed,
        bundle_id: syn.bundle_id || null,
        account_id: syn.account_id || null,
        license_manager_id: syn.license_manager_id || null,
        source_id: syn.source_id || null,
      };

      const updateRes = await fetch(`/api/products/${mergeKeepId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!updateRes.ok) {
        toast("Merge succeeded but failed to update product fields", "error");
      }

      // 3. Refresh and clean up
      closeMergeMode();
      clearSelection();
      await Promise.all([loadProducts(), loadBundles(), loadAccounts(), loadLicenseManagers(), loadSources()]);
      toast(`Merged ${others.length + 1} products`, "success");
    } catch {
      toast("Merge failed", "error");
    } finally {
      mergePanelConfirm.disabled = false;
      mergePanelConfirm.textContent = "Merge";
    }
  }

  // ---- Theme Toggle ----

  function initTheme() {
    const saved = localStorage.getItem("audio-inventory-theme");
    if (saved) {
      document.documentElement.setAttribute("data-theme", saved);
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      document.documentElement.setAttribute("data-theme", "light");
    }

    const toggle = document.getElementById("theme-toggle");
    toggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("audio-inventory-theme", next);
    });
  }

  // ---- Privacy Toggle ----

  function initPrivacy() {
    privacyMode = localStorage.getItem("audio-inventory-privacy") === "true";
    const toggle = document.getElementById("privacy-toggle");
    if (privacyMode) toggle.classList.add("active");

    toggle.addEventListener("click", () => {
      privacyMode = !privacyMode;
      localStorage.setItem("audio-inventory-privacy", privacyMode);
      toggle.classList.toggle("active", privacyMode);
      // Re-render visible content to apply/remove masking
      applyFilters();
      if (drawer.classList.contains("open") && selectedProductId) {
        openDrawer(selectedProductId);
      }
    });
  }

  // ---- Boot ----

  function boot() {
    initTheme();
    initPrivacy();
    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
