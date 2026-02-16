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
      });

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
  let privacyMode = false;

  // DOM refs
  const searchInput = document.getElementById("search");
  const filterVendor = document.getElementById("filter-vendor");
  const filterCategory = document.getElementById("filter-category");
  const filterStatus = document.getElementById("filter-status");
  const filterFormat = document.getElementById("filter-format");
  const filterBundle = document.getElementById("filter-bundle");
  const filterSource = document.getElementById("filter-source");
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
        '<tr class="no-results"><td colspan="8">Failed to load products</td></tr>';
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

    const current = filterVendor.value;
    filterVendor.innerHTML = '<option value="">All Vendors</option>';
    sorted.forEach((v) => {
      const count = allProducts.filter((p) => p.vendor === v).length;
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = `${v} (${count})`;
      filterVendor.appendChild(opt);
    });
    filterVendor.value = current;
  }

  function populateBundleFilter() {
    const current = filterBundle.value;
    filterBundle.innerHTML =
      '<option value="">All Bundles</option><option value="__none__">No Bundle</option>';
    allBundles.forEach((bundle) => {
      const opt = document.createElement("option");
      opt.value = String(bundle.id);
      opt.textContent = `${bundle.name} (${bundle.product_count})`;
      filterBundle.appendChild(opt);
    });
    filterBundle.value = current;
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
    const current = filterSource.value;
    filterSource.innerHTML =
      '<option value="">All Sources</option><option value="__none__">No Source</option>';
    allSources.forEach((source) => {
      const opt = document.createElement("option");
      opt.value = String(source.id);
      opt.textContent = `${source.name} (${source.product_count})`;
      filterSource.appendChild(opt);
    });
    filterSource.value = current;
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

  function applyFilters() {
    const query = searchInput.value.toLowerCase().trim();
    const vendor = filterVendor.value;
    const category = filterCategory.value;
    const status = filterStatus.value;
    const format = filterFormat.value;
    const bundle = filterBundle.value;
    const source = filterSource.value;

    filteredProducts = allProducts.filter((p) => {
      if (query) {
        const haystack = `${p.name} ${p.vendor}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (vendor && p.vendor !== vendor) return false;
      if (category && p.category !== category) return false;
      if (status && p.status !== status) return false;
      if (format && !p.formats.includes(format)) return false;
      if (bundle === "__none__" && p.bundle_id) return false;
      if (bundle && bundle !== "__none__" && String(p.bundle_id) !== bundle) return false;
      if (source === "__none__" && p.source_id) return false;
      if (source && source !== "__none__" && String(p.source_id) !== source) return false;
      return true;
    });

    // Highlight active filters
    filterVendor.classList.toggle("active", !!vendor);
    filterCategory.classList.toggle("active", !!category);
    filterStatus.classList.toggle("active", !!status);
    filterFormat.classList.toggle("active", !!format);
    filterBundle.classList.toggle("active", !!bundle);
    filterSource.classList.toggle("active", !!source);

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
        '<tr class="no-results"><td colspan="8">No products match your filters</td></tr>';
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
        <td class="cell-check"><input type="checkbox" class="row-check" data-id="${p.id}" data-index="${index}"${checked}></td>
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
        if (e.target.classList.contains("row-check")) return;
        if (e.target.closest(".license-indicator")) return;
        // If a popover is open, just close it instead of opening drawer
        if (licensePopover.classList.contains("open")) {
          closeLicensePopover();
          return;
        }
        if (statusPopover.classList.contains("open")) {
          closeStatusPopover();
          return;
        }
        openDrawer(p.id);
      });

      // Checkbox click
      const cb = tr.querySelector(".row-check");
      cb.addEventListener("click", (e) => {
        e.stopPropagation();
        handleRowCheck(p.id, index, e.shiftKey);
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

  function handleRowCheck(productId, index, shiftKey) {
    if (shiftKey && lastSelectedIndex >= 0 && lastSelectedIndex !== index) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        if (filteredProducts[i]) {
          selectedProductIds.add(filteredProducts[i].id);
        }
      }
      // Update checkboxes visually
      tbody.querySelectorAll(".row-check").forEach((cb) => {
        cb.checked = selectedProductIds.has(parseInt(cb.dataset.id));
      });
    } else {
      if (selectedProductIds.has(productId)) {
        selectedProductIds.delete(productId);
      } else {
        selectedProductIds.add(productId);
      }
    }
    lastSelectedIndex = index;
    updateSelectAllState();
    updateBulkBar();
  }

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
      .map((f) => `<span class="fmt-badge fmt-${f}">${f}</span>`)
      .join("");
  }

  function statusPill(status, productId) {
    const cls = status === "unknown" ? "status-pill status-unknown status-pill--empty" : `status-pill status-${status}`;
    const label = status === "unknown" ? "+" : status;
    return `<span class="${cls}" data-product-id="${productId}" data-status="${status}">${label}</span>`;
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
      try {
        const res = await fetch(`/api/products/${productId}`);
        const detail = await res.json();
        renderLicensePopoverSummary(detail);
      } catch {
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

  async function openDrawer(productId) {
    selectedProductId = productId;

    document.querySelectorAll("tbody tr.selected").forEach((tr) => {
      tr.classList.remove("selected");
    });
    const row = document.querySelector(`tr[data-id="${productId}"]`);
    if (row) row.classList.add("selected");

    drawer.classList.add("open");
    drawerOverlay.classList.add("open");
    drawerTitle.textContent = "Loading...";
    drawerVendor.textContent = "";
    drawerBody.innerHTML = "";

    try {
      const res = await fetch(`/api/products/${productId}`);
      const product = await res.json();
      renderDrawer(product);
    } catch (err) {
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
          newCard.remove();
          if (!container.querySelector(".license-card")) {
            container.innerHTML = '<p class="no-data" id="no-licenses-msg">No license info recorded</p>';
          }
        });

        // Focus first input
        const firstInput = newCard.querySelector(".license-input");
        if (firstInput) firstInput.focus();

        addBtn.style.display = "none";
        newCard.addEventListener("DOMNodeRemovedFromDocument", () => {
          addBtn.style.display = "";
        });
      });
    }
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    drawerOverlay.classList.remove("open");
    selectedProductId = null;
    document.querySelectorAll("tbody tr.selected").forEach((tr) => {
      tr.classList.remove("selected");
    });
  }

  // ---- Bundle/Account/License Manager Management Overlay ----

  let selectedBundleId = null;
  let selectedAccountId = null;
  let selectedLicenseManagerId = null;
  let selectedSourceId = null;
  let currentEntityTab = "bundles";

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

    // Update tab buttons
    document.querySelectorAll(".entity-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    // Update content visibility
    document.querySelectorAll(".entity-tab-content").forEach((content) => {
      content.style.display = content.dataset.tabContent === tab ? "flex" : "none";
    });

    // Load data for the tab, pre-selecting entity if provided
    if (tab === "bundles") {
      selectedBundleId = entityId || null;
      renderBundleList().then(() => {
        if (entityId) loadBundleDetail(entityId);
      });
      if (!entityId) showBundleDetailEmpty();
    } else if (tab === "accounts") {
      selectedAccountId = entityId || null;
      renderAccountList().then(() => {
        if (entityId) loadAccountDetail(entityId);
      });
      if (!entityId) showAccountDetailEmpty();
    } else if (tab === "managers") {
      selectedLicenseManagerId = entityId || null;
      renderLicenseManagerList().then(() => {
        if (entityId) loadLicenseManagerDetail(entityId);
      });
      if (!entityId) showLicenseManagerDetailEmpty();
    } else if (tab === "sources") {
      selectedSourceId = entityId || null;
      renderSourceList().then(() => {
        if (entityId) loadSourceDetail(entityId);
      });
      if (!entityId) showSourceDetailEmpty();
    }
  }

  // Bundle list/detail
  async function renderBundleList() {
    await loadBundles();
    const list = document.getElementById("bundle-list");
    if (allBundles.length === 0) {
      list.innerHTML = '<p class="no-data">No bundles yet</p>';
      return;
    }
    let html = "";
    allBundles.forEach((bundle) => {
      const active = bundle.id === selectedBundleId ? " entity-item--active" : "";
      html += `<div class="entity-item${active}" data-bundle-id="${bundle.id}">`;
      html += `<div class="entity-item__name">${esc(bundle.name)}</div>`;
      html += `<div class="entity-item__meta">${esc(bundle.vendor)} &middot; ${bundle.product_count} products</div>`;
      html += "</div>";
    });
    list.innerHTML = html;

    list.querySelectorAll(".entity-item").forEach((el) => {
      el.addEventListener("click", () => {
        selectedBundleId = parseInt(el.dataset.bundleId);
        list.querySelectorAll(".entity-item").forEach((e) => e.classList.remove("entity-item--active"));
        el.classList.add("entity-item--active");
        loadBundleDetail(selectedBundleId);
      });
    });
  }

  function showBundleDetailEmpty() {
    document.getElementById("bundle-detail-empty").style.display = "";
    document.getElementById("bundle-detail-form").style.display = "none";
  }

  async function loadBundleDetail(bundleId) {
    document.getElementById("bundle-detail-empty").style.display = "none";
    const formEl = document.getElementById("bundle-detail-form");
    formEl.style.display = "";
    formEl.innerHTML = '<p class="no-data">Loading...</p>';

    try {
      const res = await fetch(`/api/bundles/${bundleId}`);
      const bundle = await res.json();
      renderBundleDetailForm(bundle);
    } catch {
      formEl.innerHTML = '<p class="no-data">Failed to load bundle</p>';
    }
  }

  function renderBundleDetailForm(bundle) {
    const formEl = document.getElementById("bundle-detail-form");

    let html = '<div class="entity-form-fields">';
    BUNDLE_FIELDS.forEach((f) => {
      const inputType = (f.key === "serial_key" && privacyMode) ? "password" : "text";
      html += '<div class="entity-form-field">';
      html += `<label class="license-field__label">${f.label}${f.required ? " *" : ""}</label>`;
      html += `<input type="${inputType}" class="license-input entity-field-input" data-field="${f.key}" value="${esc(bundle[f.key] || "")}" placeholder="${f.placeholder || ""}" spellcheck="false">`;
      html += "</div>";
    });
    html += "</div>";

    html += '<div class="entity-form-actions">';
    html += '<button class="btn btn--accent" id="bundle-save-btn">Save</button>';
    html += '<span class="status-saved" id="bundle-saved-msg">Saved</span>';
    html += `<button class="btn btn--ghost btn--sm" id="bundle-delete-btn" style="margin-left: auto; color: #ef4444;">Delete Bundle</button>`;
    html += "</div>";

    // Member products
    html += '<div class="entity-members-section">';
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

    // Add products picker
    html += '<div class="entity-add-products">';
    html += '<input type="text" class="license-input" id="bundle-product-search" placeholder="Search products to add..." spellcheck="false">';
    html += '<div class="entity-search-results" id="bundle-search-results"></div>';
    html += "</div>";
    html += "</div>"; // entity-members-section

    formEl.innerHTML = html;

    // Bind save
    document.getElementById("bundle-save-btn").addEventListener("click", async () => {
      const data = {};
      formEl.querySelectorAll(".entity-field-input").forEach((input) => {
        data[input.dataset.field] = input.value;
      });
      if (!data.name || !data.name.trim()) {
        toast("Name is required", "error");
        return;
      }
      try {
        const res = await fetch(`/api/bundles/${bundle.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          const msg = document.getElementById("bundle-saved-msg");
          msg.classList.add("show");
          setTimeout(() => msg.classList.remove("show"), 2000);
          toast("Bundle saved", "success");
          renderBundleList();
        }
      } catch {
        toast("Network error", "error");
      }
    });

    // Bind delete
    document.getElementById("bundle-delete-btn").addEventListener("click", async () => {
      if (!confirm(`Delete bundle "${bundle.name}"? Products will be unlinked.`)) return;
      try {
        const res = await fetch(`/api/bundles/${bundle.id}`, { method: "DELETE" });
        if (res.ok) {
          toast("Bundle deleted", "success");
          selectedBundleId = null;
          await Promise.all([loadProducts(), renderBundleList()]);
          showBundleDetailEmpty();
        }
      } catch {
        toast("Network error", "error");
      }
    });

    // Bind remove product buttons
    formEl.querySelectorAll(".entity-remove-product").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const productId = parseInt(btn.dataset.productId);
        try {
          const res = await fetch(`/api/products/bulk`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_ids: [productId], bundle_id: null }),
          });
          if (res.ok) {
            toast("Product removed", "success");
            await loadProducts();
            loadBundleDetail(bundle.id);
            renderBundleList();
          }
        } catch {
          toast("Network error", "error");
        }
      });
    });

    // Bind product search
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
            const res = await fetch(`/api/products/bulk`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ product_ids: [productId], bundle_id: bundle.id }),
            });
            if (res.ok) {
              toast("Product added", "success");
              memberIds.add(productId);
              el.remove();
              await loadProducts();
              loadBundleDetail(bundle.id);
              renderBundleList();
            }
          } catch {
            toast("Network error", "error");
          }
        });
      });
    });
  }

  function initCreateBundle() {
    document.getElementById("bundle-create-btn").addEventListener("click", () => {
      document.getElementById("bundle-detail-empty").style.display = "none";
      const formEl = document.getElementById("bundle-detail-form");
      formEl.style.display = "";

      let html = '<div class="entity-form-fields">';
      BUNDLE_FIELDS.forEach((f) => {
        html += '<div class="entity-form-field">';
        html += `<label class="license-field__label">${f.label}${f.required ? " *" : ""}</label>`;
        html += `<input type="text" class="license-input entity-field-input" data-field="${f.key}" value="" placeholder="${f.placeholder || ""}" spellcheck="false">`;
        html += "</div>";
      });
      html += "</div>";
      html += '<div class="entity-form-actions">';
      html += '<button class="btn btn--accent" id="bundle-create-save-btn">Create</button>';
      html += '<button class="btn btn--ghost btn--sm" id="bundle-create-cancel-btn" style="margin-left: 8px;">Cancel</button>';
      html += "</div>";

      formEl.innerHTML = html;

      document.getElementById("bundle-create-save-btn").addEventListener("click", async () => {
        const data = {};
        formEl.querySelectorAll(".entity-field-input").forEach((input) => {
          data[input.dataset.field] = input.value;
        });
        if (!data.name || !data.name.trim()) {
          toast("Name is required", "error");
          return;
        }
        try {
          const res = await fetch("/api/bundles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (res.ok) {
            const result = await res.json();
            toast("Bundle created", "success");
            selectedBundleId = result.id;
            await renderBundleList();
            loadBundleDetail(result.id);
          }
        } catch {
          toast("Network error", "error");
        }
      });

      document.getElementById("bundle-create-cancel-btn").addEventListener("click", () => {
        showBundleDetailEmpty();
      });

      // Focus name field
      const nameInput = formEl.querySelector('[data-field="name"]');
      if (nameInput) nameInput.focus();
    });
  }

  // Account list/detail
  async function renderAccountList() {
    await loadAccounts();
    const list = document.getElementById("account-list");
    if (allAccounts.length === 0) {
      list.innerHTML = '<p class="no-data">No accounts yet</p>';
      return;
    }
    let html = "";
    allAccounts.forEach((account) => {
      const active = account.id === selectedAccountId ? " entity-item--active" : "";
      html += `<div class="entity-item${active}" data-account-id="${account.id}">`;
      html += `<div class="entity-item__name">${esc(account.name)}</div>`;
      html += `<div class="entity-item__meta">${esc(account.email) || "No email"}</div>`;
      html += "</div>";
    });
    list.innerHTML = html;

    list.querySelectorAll(".entity-item").forEach((el) => {
      el.addEventListener("click", () => {
        selectedAccountId = parseInt(el.dataset.accountId);
        list.querySelectorAll(".entity-item").forEach((e) => e.classList.remove("entity-item--active"));
        el.classList.add("entity-item--active");
        loadAccountDetail(selectedAccountId);
      });
    });
  }

  function showAccountDetailEmpty() {
    document.getElementById("account-detail-empty").style.display = "";
    document.getElementById("account-detail-form").style.display = "none";
  }

  async function loadAccountDetail(accountId) {
    document.getElementById("account-detail-empty").style.display = "none";
    const formEl = document.getElementById("account-detail-form");
    formEl.style.display = "";
    formEl.innerHTML = '<p class="no-data">Loading...</p>';

    try {
      const res = await fetch(`/api/accounts/${accountId}`);
      const account = await res.json();
      renderAccountDetailForm(account);
    } catch {
      formEl.innerHTML = '<p class="no-data">Failed to load account</p>';
    }
  }

  function renderAccountDetailForm(account) {
    const formEl = document.getElementById("account-detail-form");

    let html = '<div class="entity-form-fields">';
    ACCOUNT_FIELDS.forEach((f) => {
      const inputType = (f.key === "email" && privacyMode) ? "password" : "text";
      html += '<div class="entity-form-field">';
      html += `<label class="license-field__label">${f.label}${f.required ? " *" : ""}</label>`;
      html += `<input type="${inputType}" class="license-input entity-field-input" data-field="${f.key}" value="${esc(account[f.key] || "")}" spellcheck="false">`;
      html += "</div>";
    });
    html += "</div>";

    html += '<div class="entity-form-actions">';
    html += '<button class="btn btn--accent" id="account-save-btn">Save</button>';
    html += '<span class="status-saved" id="account-saved-msg">Saved</span>';
    html += `<button class="btn btn--ghost btn--sm" id="account-delete-btn" style="margin-left: auto; color: #ef4444;">Delete Account</button>`;
    html += "</div>";

    formEl.innerHTML = html;

    // Bind save
    document.getElementById("account-save-btn").addEventListener("click", async () => {
      const data = {};
      formEl.querySelectorAll(".entity-field-input").forEach((input) => {
        data[input.dataset.field] = input.value;
      });
      if (!data.name || !data.name.trim()) {
        toast("Name is required", "error");
        return;
      }
      try {
        const res = await fetch(`/api/accounts/${account.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          const msg = document.getElementById("account-saved-msg");
          msg.classList.add("show");
          setTimeout(() => msg.classList.remove("show"), 2000);
          toast("Account saved", "success");
          renderAccountList();
        }
      } catch {
        toast("Network error", "error");
      }
    });

    // Bind delete
    document.getElementById("account-delete-btn").addEventListener("click", async () => {
      if (!confirm(`Delete account "${account.name}"? Products will be unlinked.`)) return;
      try {
        const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
        if (res.ok) {
          toast("Account deleted", "success");
          selectedAccountId = null;
          await Promise.all([loadProducts(), renderAccountList()]);
          showAccountDetailEmpty();
        }
      } catch {
        toast("Network error", "error");
      }
    });
  }

  function initCreateAccount() {
    document.getElementById("account-create-btn").addEventListener("click", () => {
      document.getElementById("account-detail-empty").style.display = "none";
      const formEl = document.getElementById("account-detail-form");
      formEl.style.display = "";

      let html = '<div class="entity-form-fields">';
      ACCOUNT_FIELDS.forEach((f) => {
        html += '<div class="entity-form-field">';
        html += `<label class="license-field__label">${f.label}${f.required ? " *" : ""}</label>`;
        html += `<input type="text" class="license-input entity-field-input" data-field="${f.key}" value="" spellcheck="false">`;
        html += "</div>";
      });
      html += "</div>";
      html += '<div class="entity-form-actions">';
      html += '<button class="btn btn--accent" id="account-create-save-btn">Create</button>';
      html += '<button class="btn btn--ghost btn--sm" id="account-create-cancel-btn" style="margin-left: 8px;">Cancel</button>';
      html += "</div>";

      formEl.innerHTML = html;

      document.getElementById("account-create-save-btn").addEventListener("click", async () => {
        const data = {};
        formEl.querySelectorAll(".entity-field-input").forEach((input) => {
          data[input.dataset.field] = input.value;
        });
        if (!data.name || !data.name.trim()) {
          toast("Name is required", "error");
          return;
        }
        try {
          const res = await fetch("/api/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (res.ok) {
            const result = await res.json();
            toast("Account created", "success");
            selectedAccountId = result.id;
            await renderAccountList();
            loadAccountDetail(result.id);
          }
        } catch {
          toast("Network error", "error");
        }
      });

      document.getElementById("account-create-cancel-btn").addEventListener("click", () => {
        showAccountDetailEmpty();
      });

      // Focus name field
      const nameInput = formEl.querySelector('[data-field="name"]');
      if (nameInput) nameInput.focus();
    });
  }

  // License Manager list/detail
  async function renderLicenseManagerList() {
    await loadLicenseManagers();
    const list = document.getElementById("lm-list");
    if (allLicenseManagers.length === 0) {
      list.innerHTML = '<p class="no-data">No license managers yet</p>';
      return;
    }
    let html = "";
    allLicenseManagers.forEach((lm) => {
      const active = lm.id === selectedLicenseManagerId ? " entity-item--active" : "";
      html += `<div class="entity-item${active}" data-lm-id="${lm.id}">`;
      html += `<div class="entity-item__name">${esc(lm.name)}</div>`;
      html += `<div class="entity-item__meta">${esc(lm.url) || "No URL"}</div>`;
      html += "</div>";
    });
    list.innerHTML = html;

    list.querySelectorAll(".entity-item").forEach((el) => {
      el.addEventListener("click", () => {
        selectedLicenseManagerId = parseInt(el.dataset.lmId);
        list.querySelectorAll(".entity-item").forEach((e) => e.classList.remove("entity-item--active"));
        el.classList.add("entity-item--active");
        loadLicenseManagerDetail(selectedLicenseManagerId);
      });
    });
  }

  function showLicenseManagerDetailEmpty() {
    document.getElementById("lm-detail-empty").style.display = "";
    document.getElementById("lm-detail-form").style.display = "none";
  }

  async function loadLicenseManagerDetail(lmId) {
    document.getElementById("lm-detail-empty").style.display = "none";
    const formEl = document.getElementById("lm-detail-form");
    formEl.style.display = "";
    formEl.innerHTML = '<p class="no-data">Loading...</p>';

    try {
      const res = await fetch(`/api/license-managers/${lmId}`);
      const lm = await res.json();
      renderLicenseManagerDetailForm(lm);
    } catch {
      formEl.innerHTML = '<p class="no-data">Failed to load license manager</p>';
    }
  }

  function renderLicenseManagerDetailForm(lm) {
    const formEl = document.getElementById("lm-detail-form");

    let html = '<div class="entity-form-fields">';
    LICENSE_MANAGER_FIELDS.forEach((f) => {
      html += '<div class="entity-form-field">';
      html += `<label class="license-field__label">${f.label}${f.required ? " *" : ""}</label>`;
      html += `<input type="text" class="license-input entity-field-input" data-field="${f.key}" value="${esc(lm[f.key] || "")}" spellcheck="false">`;
      html += "</div>";
    });
    html += "</div>";

    html += '<div class="entity-form-actions">';
    html += '<button class="btn btn--accent" id="lm-save-btn">Save</button>';
    html += '<span class="status-saved" id="lm-saved-msg">Saved</span>';
    html += `<button class="btn btn--ghost btn--sm" id="lm-delete-btn" style="margin-left: auto; color: #ef4444;">Delete License Manager</button>`;
    html += "</div>";

    formEl.innerHTML = html;

    // Bind save
    document.getElementById("lm-save-btn").addEventListener("click", async () => {
      const data = {};
      formEl.querySelectorAll(".entity-field-input").forEach((input) => {
        data[input.dataset.field] = input.value;
      });
      if (!data.name || !data.name.trim()) {
        toast("Name is required", "error");
        return;
      }
      try {
        const res = await fetch(`/api/license-managers/${lm.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          const msg = document.getElementById("lm-saved-msg");
          msg.classList.add("show");
          setTimeout(() => msg.classList.remove("show"), 2000);
          toast("License Manager saved", "success");
          renderLicenseManagerList();
        }
      } catch {
        toast("Network error", "error");
      }
    });

    // Bind delete
    document.getElementById("lm-delete-btn").addEventListener("click", async () => {
      if (!confirm(`Delete license manager "${lm.name}"? Products will be unlinked.`)) return;
      try {
        const res = await fetch(`/api/license-managers/${lm.id}`, { method: "DELETE" });
        if (res.ok) {
          toast("License Manager deleted", "success");
          selectedLicenseManagerId = null;
          await Promise.all([loadProducts(), renderLicenseManagerList()]);
          showLicenseManagerDetailEmpty();
        }
      } catch {
        toast("Network error", "error");
      }
    });
  }

  function initCreateLicenseManager() {
    document.getElementById("lm-create-btn").addEventListener("click", () => {
      document.getElementById("lm-detail-empty").style.display = "none";
      const formEl = document.getElementById("lm-detail-form");
      formEl.style.display = "";

      let html = '<div class="entity-form-fields">';
      LICENSE_MANAGER_FIELDS.forEach((f) => {
        html += '<div class="entity-form-field">';
        html += `<label class="license-field__label">${f.label}${f.required ? " *" : ""}</label>`;
        html += `<input type="text" class="license-input entity-field-input" data-field="${f.key}" value="" spellcheck="false">`;
        html += "</div>";
      });
      html += "</div>";
      html += '<div class="entity-form-actions">';
      html += '<button class="btn btn--accent" id="lm-create-save-btn">Create</button>';
      html += '<button class="btn btn--ghost btn--sm" id="lm-create-cancel-btn" style="margin-left: 8px;">Cancel</button>';
      html += "</div>";

      formEl.innerHTML = html;

      document.getElementById("lm-create-save-btn").addEventListener("click", async () => {
        const data = {};
        formEl.querySelectorAll(".entity-field-input").forEach((input) => {
          data[input.dataset.field] = input.value;
        });
        if (!data.name || !data.name.trim()) {
          toast("Name is required", "error");
          return;
        }
        try {
          const res = await fetch("/api/license-managers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (res.ok) {
            const result = await res.json();
            toast("License Manager created", "success");
            selectedLicenseManagerId = result.id;
            await renderLicenseManagerList();
            loadLicenseManagerDetail(result.id);
          }
        } catch {
          toast("Network error", "error");
        }
      });

      document.getElementById("lm-create-cancel-btn").addEventListener("click", () => {
        showLicenseManagerDetailEmpty();
      });

      // Focus name field
      const nameInput = formEl.querySelector('[data-field="name"]');
      if (nameInput) nameInput.focus();
    });
  }

  // Source list/detail
  async function renderSourceList() {
    await loadSources();
    const list = document.getElementById("source-list");
    if (allSources.length === 0) {
      list.innerHTML = '<p class="no-data">No sources yet</p>';
      return;
    }
    let html = "";
    allSources.forEach((source) => {
      const active = source.id === selectedSourceId ? " entity-item--active" : "";
      html += `<div class="entity-item${active}" data-source-id="${source.id}">`;
      html += `<div class="entity-item__name">${esc(source.name)}</div>`;
      html += `<div class="entity-item__meta">${esc(source.email || source.url) || "No email"}</div>`;
      html += "</div>";
    });
    list.innerHTML = html;

    list.querySelectorAll(".entity-item").forEach((el) => {
      el.addEventListener("click", () => {
        selectedSourceId = parseInt(el.dataset.sourceId);
        list.querySelectorAll(".entity-item").forEach((e) => e.classList.remove("entity-item--active"));
        el.classList.add("entity-item--active");
        loadSourceDetail(selectedSourceId);
      });
    });
  }

  function showSourceDetailEmpty() {
    document.getElementById("source-detail-empty").style.display = "";
    document.getElementById("source-detail-form").style.display = "none";
  }

  async function loadSourceDetail(sourceId) {
    document.getElementById("source-detail-empty").style.display = "none";
    const formEl = document.getElementById("source-detail-form");
    formEl.style.display = "";
    formEl.innerHTML = '<p class="no-data">Loading...</p>';

    try {
      const res = await fetch(`/api/sources/${sourceId}`);
      const source = await res.json();
      renderSourceDetailForm(source);
    } catch {
      formEl.innerHTML = '<p class="no-data">Failed to load source</p>';
    }
  }

  function renderSourceDetailForm(source) {
    const formEl = document.getElementById("source-detail-form");

    let html = '<div class="entity-form-fields">';
    SOURCE_FIELDS.forEach((f) => {
      const inputType = (f.key === "email" && privacyMode) ? "password" : "text";
      html += '<div class="entity-form-field">';
      html += `<label class="license-field__label">${f.label}${f.required ? " *" : ""}</label>`;
      html += `<input type="${inputType}" class="license-input entity-field-input" data-field="${f.key}" value="${esc(source[f.key] || "")}" spellcheck="false">`;
      html += "</div>";
    });
    html += "</div>";

    html += '<div class="entity-form-actions">';
    html += '<button class="btn btn--accent" id="source-save-btn">Save</button>';
    html += '<span class="status-saved" id="source-saved-msg">Saved</span>';
    html += `<button class="btn btn--ghost btn--sm" id="source-delete-btn" style="margin-left: auto; color: #ef4444;">Delete Source</button>`;
    html += "</div>";

    formEl.innerHTML = html;

    // Bind save
    document.getElementById("source-save-btn").addEventListener("click", async () => {
      const data = {};
      formEl.querySelectorAll(".entity-field-input").forEach((input) => {
        data[input.dataset.field] = input.value;
      });
      if (!data.name || !data.name.trim()) {
        toast("Name is required", "error");
        return;
      }
      try {
        const res = await fetch(`/api/sources/${source.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          const msg = document.getElementById("source-saved-msg");
          msg.classList.add("show");
          setTimeout(() => msg.classList.remove("show"), 2000);
          toast("Source saved", "success");
          renderSourceList();
        }
      } catch {
        toast("Network error", "error");
      }
    });

    // Bind delete
    document.getElementById("source-delete-btn").addEventListener("click", async () => {
      if (!confirm(`Delete source "${source.name}"? Products will be unlinked.`)) return;
      try {
        const res = await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
        if (res.ok) {
          toast("Source deleted", "success");
          selectedSourceId = null;
          await Promise.all([loadProducts(), renderSourceList()]);
          showSourceDetailEmpty();
        }
      } catch {
        toast("Network error", "error");
      }
    });
  }

  function initCreateSource() {
    document.getElementById("source-create-btn").addEventListener("click", () => {
      document.getElementById("source-detail-empty").style.display = "none";
      const formEl = document.getElementById("source-detail-form");
      formEl.style.display = "";

      let html = '<div class="entity-form-fields">';
      SOURCE_FIELDS.forEach((f) => {
        html += '<div class="entity-form-field">';
        html += `<label class="license-field__label">${f.label}${f.required ? " *" : ""}</label>`;
        html += `<input type="text" class="license-input entity-field-input" data-field="${f.key}" value="" spellcheck="false">`;
        html += "</div>";
      });
      html += "</div>";
      html += '<div class="entity-form-actions">';
      html += '<button class="btn btn--accent" id="source-create-save-btn">Create</button>';
      html += '<button class="btn btn--ghost btn--sm" id="source-create-cancel-btn" style="margin-left: 8px;">Cancel</button>';
      html += "</div>";

      formEl.innerHTML = html;

      document.getElementById("source-create-save-btn").addEventListener("click", async () => {
        const data = {};
        formEl.querySelectorAll(".entity-field-input").forEach((input) => {
          data[input.dataset.field] = input.value;
        });
        if (!data.name || !data.name.trim()) {
          toast("Name is required", "error");
          return;
        }
        try {
          const res = await fetch("/api/sources", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (res.ok) {
            const result = await res.json();
            toast("Source created", "success");
            selectedSourceId = result.id;
            await renderSourceList();
            loadSourceDetail(result.id);
          }
        } catch {
          toast("Network error", "error");
        }
      });

      document.getElementById("source-create-cancel-btn").addEventListener("click", () => {
        showSourceDetailEmpty();
      });

      // Focus name field
      const nameInput = formEl.querySelector('[data-field="name"]');
      if (nameInput) nameInput.focus();
    });
  }

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
    // Filters
    searchInput.addEventListener("input", applyFilters);
    filterVendor.addEventListener("change", applyFilters);
    filterCategory.addEventListener("change", applyFilters);
    filterStatus.addEventListener("change", applyFilters);
    filterFormat.addEventListener("change", applyFilters);
    filterBundle.addEventListener("change", applyFilters);
    filterSource.addEventListener("change", applyFilters);

    // Sort
    document.querySelectorAll("thead th.sortable").forEach((th) => {
      th.addEventListener("click", () => setSort(th.dataset.sort));
    });

    // Initial sort indicator
    const initTh = document.querySelector(`th[data-sort="${sortColumn}"]`);
    if (initTh) initTh.classList.add("sorted-asc");

    // Select-all checkbox
    selectAllCheckbox.addEventListener("change", () => {
      const visibleIds = filteredProducts.map((p) => p.id);
      if (selectAllCheckbox.checked) {
        visibleIds.forEach((id) => selectedProductIds.add(id));
      } else {
        visibleIds.forEach((id) => selectedProductIds.delete(id));
      }
      tbody.querySelectorAll(".row-check").forEach((cb) => {
        cb.checked = selectedProductIds.has(parseInt(cb.dataset.id));
      });
      updateBulkBar();
    });

    // Bulk actions
    document.getElementById("bulk-deselect").addEventListener("click", clearSelection);

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

    const bulkBundleSelect = document.getElementById("bulk-bundle");
    if (bulkBundleSelect) {
      bulkBundleSelect.addEventListener("change", async (e) => {
        const val = e.target.value;
        if (!val) return;
        e.target.value = "";
        const isNone = val === "__none__";
        const bundleId = isNone ? null : parseInt(val);
        const ids = [...selectedProductIds];
        try {
          const res = await fetch("/api/products/bulk", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_ids: ids, bundle_id: bundleId }),
          });
          if (res.ok) {
            const bundle = isNone ? null : allBundles.find((b) => b.id === bundleId);
            ids.forEach((id) => {
              const p = allProducts.find((p) => p.id === id);
              if (p) {
                p.bundle_id = bundleId;
                p.bundle_name = bundle ? bundle.name : "";
              }
            });
            applyFilters();
            await loadBundles();
            toast(isNone ? `Cleared bundle from ${ids.length} products` : `Assigned ${ids.length} products to bundle`, "success");
          } else {
            toast("Bulk update failed", "error");
          }
        } catch {
          toast("Network error", "error");
        }
      });
    }

    const bulkAccountSelect = document.getElementById("bulk-account");
    if (bulkAccountSelect) {
      bulkAccountSelect.addEventListener("change", async (e) => {
        const val = e.target.value;
        if (!val) return;
        e.target.value = "";
        const isNone = val === "__none__";
        const accountId = isNone ? null : parseInt(val);
        const ids = [...selectedProductIds];
        try {
          const res = await fetch("/api/products/bulk", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_ids: ids, account_id: accountId }),
          });
          if (res.ok) {
            const account = isNone ? null : allAccounts.find((a) => a.id === accountId);
            ids.forEach((id) => {
              const p = allProducts.find((p) => p.id === id);
              if (p) {
                p.account_id = accountId;
                p.account_name = account ? account.name : "";
              }
            });
            applyFilters();
            await loadAccounts();
            toast(isNone ? `Cleared account from ${ids.length} products` : `Assigned ${ids.length} products to account`, "success");
          } else {
            toast("Bulk update failed", "error");
          }
        } catch {
          toast("Network error", "error");
        }
      });
    }

    const bulkLicenseManagerSelect = document.getElementById("bulk-lm");
    if (bulkLicenseManagerSelect) {
      bulkLicenseManagerSelect.addEventListener("change", async (e) => {
        const val = e.target.value;
        if (!val) return;
        e.target.value = "";
        const isNone = val === "__none__";
        const lmId = isNone ? null : parseInt(val);
        const ids = [...selectedProductIds];
        try {
          const res = await fetch("/api/products/bulk", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_ids: ids, license_manager_id: lmId }),
          });
          if (res.ok) {
            const lm = isNone ? null : allLicenseManagers.find((lm) => lm.id === lmId);
            ids.forEach((id) => {
              const p = allProducts.find((p) => p.id === id);
              if (p) {
                p.license_manager_id = lmId;
                p.license_manager_name = lm ? lm.name : "";
              }
            });
            applyFilters();
            await loadLicenseManagers();
            toast(isNone ? `Cleared license manager from ${ids.length} products` : `Assigned ${ids.length} products to license manager`, "success");
          } else {
            toast("Bulk update failed", "error");
          }
        } catch {
          toast("Network error", "error");
        }
      });
    }

    const bulkSourceSelect = document.getElementById("bulk-source");
    if (bulkSourceSelect) {
      bulkSourceSelect.addEventListener("change", async (e) => {
        const val = e.target.value;
        if (!val) return;
        e.target.value = "";
        const isNone = val === "__none__";
        const sourceId = isNone ? null : parseInt(val);
        const ids = [...selectedProductIds];
        try {
          const res = await fetch("/api/products/bulk", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_ids: ids, source_id: sourceId }),
          });
          if (res.ok) {
            const source = isNone ? null : allSources.find((s) => s.id === sourceId);
            ids.forEach((id) => {
              const p = allProducts.find((p) => p.id === id);
              if (p) {
                p.source_id = sourceId;
                p.source_name = source ? source.name : "";
              }
            });
            applyFilters();
            await loadSources();
            toast(isNone ? `Cleared source from ${ids.length} products` : `Assigned ${ids.length} products to source`, "success");
          } else {
            toast("Bulk update failed", "error");
          }
        } catch {
          toast("Network error", "error");
        }
      });
    }

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

    initCreateBundle();
    initCreateAccount();
    initCreateLicenseManager();
    initCreateSource();
    initCreateProduct();

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== searchInput && !manageOverlay.classList.contains("active")) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }

      if (e.key === "Escape") {
        if (createProductOverlay.classList.contains("active")) {
          createProductOverlay.classList.remove("active");
        } else if (licensePopover.classList.contains("open")) {
          closeLicensePopover();
        } else if (statusPopover.classList.contains("open")) {
          closeStatusPopover();
        } else if (manageOverlay.classList.contains("active")) {
          closeBundleOverlay();
        } else if (drawer.classList.contains("open")) {
          closeDrawer();
        } else if (document.activeElement === searchInput) {
          searchInput.blur();
        }
      }
    });
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
