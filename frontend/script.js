/**
 * CloudPix - Modern Cloud Image Hosting Platform
 * Vanilla JavaScript Frontend Controller
 * Handles AWS S3 / Local Demo integration, presigned URLs,
 * drag-and-drop uploads, real-time filtering, preview modals, and toasts.
 */

(function () {
  "use strict";

  // =========================================================================
  // API Configuration & Global State
  // =========================================================================
  
  // If served via Flask, use relative path ''; if opened via file:// or another port, default to http://localhost:5000
  const isDirectFile = window.location.protocol === "file:";
  const API_BASE = isDirectFile ? "http://localhost:5000" : "";

  const STATE = {
    images: [],
    filteredImages: [],
    currentFilter: "all",
    searchQuery: "",
    currentSort: "newest",
    viewMode: "grid", // 'grid' | 'list'
    activeImage: null, // Image currently open in preview modal
    deleteTargetImage: null, // Image pending deletion confirmation
    pendingUploadFile: null, // File ready in preview stage
    health: {
      status: "unknown",
      storage_mode: "local",
      is_s3_connected: false,
      storage_label: "Local Demo Mode",
      bucket_name: null,
      max_file_size_bytes: 5242880,
    },
  };

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
  const ALLOWED_EXTS = ["jpg", "jpeg", "png", "webp"];

  // =========================================================================
  // DOM Element References
  // =========================================================================
  
  const DOM = {
    // Nav & System status
    storageStatusPill: document.getElementById("storageStatusPill"),
    storageStatusText: document.getElementById("storageStatusText"),
    
    // Mode Banner
    modeCalloutCard: document.getElementById("modeCalloutCard"),
    modeTitle: document.getElementById("modeTitle"),
    modeBadge: document.getElementById("modeBadge"),
    modeDescription: document.getElementById("modeDescription"),
    btnRefreshHealth: document.getElementById("btnRefreshHealth"),
    
    // Stats Bar
    statTotalImages: document.getElementById("statTotalImages"),
    statTotalStorage: document.getElementById("statTotalStorage"),
    statStorageEngine: document.getElementById("statStorageEngine"),
    statUrlExpiry: document.getElementById("statUrlExpiry"),

    // Upload & Dropzone
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("fileInput"),
    btnBrowse: document.getElementById("btnBrowse"),
    dropzoneDefault: document.getElementById("dropzoneDefault"),
    previewStage: document.getElementById("previewStage"),
    previewImage: document.getElementById("previewImage"),
    previewFilename: document.getElementById("previewFilename"),
    previewFormat: document.getElementById("previewFormat"),
    previewSize: document.getElementById("previewSize"),
    previewValidation: document.getElementById("previewValidation"),
    btnConfirmUpload: document.getElementById("btnConfirmUpload"),
    btnCancelPreview: document.getElementById("btnCancelPreview"),
    uploadProgressContainer: document.getElementById("uploadProgressContainer"),
    uploadProgressBar: document.getElementById("uploadProgressBar"),
    uploadProgressPercent: document.getElementById("uploadProgressPercent"),
    uploadProgressStatus: document.getElementById("uploadProgressStatus"),

    // Gallery Toolbar
    searchInput: document.getElementById("searchInput"),
    btnClearSearch: document.getElementById("btnClearSearch"),
    formatFilters: document.getElementById("formatFilters"),
    sortSelect: document.getElementById("sortSelect"),
    btnGridView: document.getElementById("btnGridView"),
    btnListView: document.getElementById("btnListView"),
    btnRefreshGallery: document.getElementById("btnRefreshGallery"),
    resultsCount: document.getElementById("resultsCount"),
    galleryContainer: document.getElementById("galleryContainer"),
    emptyState: document.getElementById("emptyState"),
    emptyTitle: document.getElementById("emptyTitle"),
    emptyDesc: document.getElementById("emptyDesc"),
    btnEmptyUpload: document.getElementById("btnEmptyUpload"),

    // Preview Modal
    previewModal: document.getElementById("previewModal"),
    btnModalClose: document.getElementById("btnModalClose"),
    modalImageElement: document.getElementById("modalImageElement"),
    modalImageTitle: document.getElementById("modalImageTitle"),
    modalStorageBadge: document.getElementById("modalStorageBadge"),
    modalFilename: document.getElementById("modalFilename"),
    modalFormat: document.getElementById("modalFormat"),
    modalSize: document.getElementById("modalSize"),
    modalDate: document.getElementById("modalDate"),
    modalStorageBackend: document.getElementById("modalStorageBackend"),
    modalAccessMethod: document.getElementById("modalAccessMethod"),
    btnModalDownload: document.getElementById("btnModalDownload"),
    btnModalCopyLink: document.getElementById("btnModalCopyLink"),
    copyLinkBtnText: document.getElementById("copyLinkBtnText"),
    btnModalDelete: document.getElementById("btnModalDelete"),

    // Delete Modal
    deleteConfirmModal: document.getElementById("deleteConfirmModal"),
    deleteTargetFilename: document.getElementById("deleteTargetFilename"),
    btnDeleteModalCancelX: document.getElementById("btnDeleteModalCancelX"),
    btnDeleteCancel: document.getElementById("btnDeleteCancel"),
    btnDeleteConfirm: document.getElementById("btnDeleteConfirm"),
    deleteBtnText: document.getElementById("deleteBtnText"),

    // Toast Container
    toastContainer: document.getElementById("toastContainer"),
  };

  // =========================================================================
  // Helper Functions: Formatting & Validation
  // =========================================================================

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function formatDate(isoString) {
    if (!isoString) return "-";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  }

  function getFileExtension(filename) {
    if (!filename || !filename.includes(".")) return "";
    return filename.split(".").pop().toLowerCase();
  }

  // =========================================================================
  // Toast Notification System
  // =========================================================================

  function showToast(title, message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let iconSvg = "";
    if (type === "success") {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    } else if (type === "error") {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else if (type === "warning") {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    } else {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
      ${iconSvg}
      <div class="toast-content">
        <h5 class="toast-title">${title}</h5>
        <p class="toast-msg">${message}</p>
      </div>
      <button class="toast-close" aria-label="Close">&times;</button>
    `;

    DOM.toastContainer.appendChild(toast);

    const closeBtn = toast.querySelector(".toast-close");
    closeBtn.addEventListener("click", () => removeToast(toast));

    setTimeout(() => {
      removeToast(toast);
    }, 4500);
  }

  function removeToast(toast) {
    toast.classList.add("toast-hiding");
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }

  // =========================================================================
  // API Calls: Health, Images, Upload, Delete
  // =========================================================================

  async function checkHealth() {
    try {
      const response = await fetch(`${API_BASE}/api/health`);
      if (!response.ok) throw new Error(`Health check failed (${response.status})`);
      const data = await response.json();
      STATE.health = data;
      updateHealthUI(data);
    } catch (err) {
      console.warn("Backend health check failed:", err);
      STATE.health = {
        status: "offline",
        storage_mode: "local",
        is_s3_connected: false,
        storage_label: "Server Offline / Local Fallback",
        bucket_name: null,
      };
      updateHealthUI(STATE.health);
    }
  }

  function updateHealthUI(health) {
    const isS3 = health.is_s3_connected && health.storage_mode === "s3";
    const statusDot = DOM.storageStatusPill.querySelector(".status-dot");

    if (isS3) {
      // AWS S3 Connected
      statusDot.className = "status-dot active-s3 pulsing";
      DOM.storageStatusText.textContent = "AWS S3 Connected";
      DOM.storageStatusPill.title = `Connected to S3 bucket: ${health.bucket_name} (${health.region || 'us-east-1'})`;

      DOM.modeCalloutCard.className = "mode-callout-card mode-s3-active";
      DOM.modeTitle.textContent = `Storage Engine: AWS S3 Bucket '${health.bucket_name}'`;
      DOM.modeBadge.className = "badge badge-mode mode-s3";
      DOM.modeBadge.textContent = "AWS S3 Live";
      DOM.modeDescription.textContent =
        "Your images are stored in a private S3 bucket. Access is secured using 60-minute cryptographically signed Presigned URLs.";
      DOM.statStorageEngine.textContent = "AWS S3";
    } else {
      // Local Demo Mode
      statusDot.className = "status-dot active-local pulsing";
      DOM.storageStatusText.textContent = "Local Demo Mode";
      DOM.storageStatusPill.title = "Running locally. Files stored in backend/uploads/.";

      DOM.modeCalloutCard.className = "mode-callout-card mode-local-active";
      DOM.modeTitle.textContent = "Storage Engine: Local Demo Mode";
      DOM.modeBadge.className = "badge badge-mode mode-local";
      DOM.modeBadge.textContent = "Local Demo";
      DOM.modeDescription.textContent =
        "CloudPix is running in Local Demo Mode. Uploaded images are stored locally in 'backend/uploads/' on this machine. They are NOT sent to AWS S3. Configure your AWS credentials in .env to connect your private S3 bucket.";
      DOM.statStorageEngine.textContent = "Local Demo";
    }

    if (health.presigned_url_expiry_seconds) {
      const mins = Math.round(health.presigned_url_expiry_seconds / 60);
      DOM.statUrlExpiry.textContent = `${mins} mins`;
    }
  }

  async function fetchImages() {
    renderSkeletons();
    try {
      const response = await fetch(`${API_BASE}/api/images`);
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      const data = await response.json();

      STATE.images = data.images || [];
      updateStats();
      applyFiltersAndSort();
    } catch (err) {
      console.error("Error fetching images:", err);
      showToast("Connection Error", "Could not load images from the backend. Make sure app.py is running.", "error");
      renderGallery([]);
    }
  }

  function updateStats() {
    DOM.statTotalImages.textContent = STATE.images.length;
    const totalBytes = STATE.images.reduce((acc, img) => acc + (img.size_bytes || 0), 0);
    DOM.statTotalStorage.textContent = formatBytes(totalBytes);
  }

  // =========================================================================
  // Upload & Drag-and-Drop Workflow
  // =========================================================================

  function initUploadZone() {
    const dropzone = DOM.dropzone;
    const fileInput = DOM.fileInput;
    const btnBrowse = DOM.btnBrowse;

    // Trigger file picker
    btnBrowse.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    dropzone.addEventListener("click", (e) => {
      // Only open file dialog if clicking in the default area, not during preview stage
      if (e.target.closest("#previewStage")) return;
      fileInput.click();
    });

    fileInput.addEventListener("change", (e) => {
      if (fileInput.files && fileInput.files[0]) {
        handleFileSelection(fileInput.files[0]);
      }
    });

    // Drag-and-drop events
    ["dragenter", "dragover"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (dt.files && dt.files[0]) {
        handleFileSelection(dt.files[0]);
      }
    });

    // Upload Preview buttons
    DOM.btnCancelPreview.addEventListener("click", (e) => {
      e.stopPropagation();
      resetUploadZone();
    });

    DOM.btnConfirmUpload.addEventListener("click", (e) => {
      e.stopPropagation();
      executeUpload();
    });
  }

  function handleFileSelection(file) {
    const ext = getFileExtension(file.name);
    const isValidExt = ALLOWED_EXTS.includes(ext);
    const isValidSize = file.size <= MAX_FILE_SIZE;

    STATE.pendingUploadFile = file;

    // Populate Preview UI
    DOM.previewFilename.textContent = file.name;
    DOM.previewFormat.textContent = ext.toUpperCase() || "UNKNOWN";
    DOM.previewSize.textContent = formatBytes(file.size);

    if (isValidExt && isValidSize) {
      DOM.previewValidation.className = "validation-status status-valid";
      DOM.previewValidation.textContent = "✓ Valid image file";
      DOM.btnConfirmUpload.disabled = false;
    } else {
      DOM.previewValidation.className = "validation-status status-invalid";
      if (!isValidExt) {
        DOM.previewValidation.textContent = `✕ Invalid format (only JPG, PNG, WEBP)`;
      } else {
        DOM.previewValidation.textContent = `✕ File exceeds 5 MB limit (${formatBytes(file.size)})`;
      }
      DOM.btnConfirmUpload.disabled = true;
    }

    // Read thumbnail
    const reader = new FileReader();
    reader.onload = (e) => {
      DOM.previewImage.src = e.target.result;
      DOM.dropzoneDefault.classList.add("hidden");
      DOM.previewStage.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  }

  function resetUploadZone() {
    STATE.pendingUploadFile = null;
    DOM.fileInput.value = "";
    DOM.previewImage.src = "";
    DOM.dropzoneDefault.classList.remove("hidden");
    DOM.previewStage.classList.add("hidden");
    DOM.uploadProgressContainer.classList.add("hidden");
    DOM.uploadProgressBar.style.width = "0%";
    DOM.btnConfirmUpload.disabled = false;
  }

  async function executeUpload() {
    if (!STATE.pendingUploadFile) return;

    const file = STATE.pendingUploadFile;
    const formData = new FormData();
    formData.append("image", file);

    // Show Progress State
    DOM.uploadProgressContainer.classList.remove("hidden");
    DOM.btnConfirmUpload.disabled = true;
    DOM.btnCancelPreview.disabled = true;
    DOM.uploadProgressStatus.textContent = "Uploading to CloudPix...";
    DOM.uploadProgressBar.style.width = "40%";
    DOM.uploadProgressPercent.textContent = "40%";

    try {
      // Simulate progress feedback
      const progressTimer = setInterval(() => {
        const cur = parseInt(DOM.uploadProgressPercent.textContent, 10);
        if (cur < 85) {
          DOM.uploadProgressBar.style.width = `${cur + 15}%`;
          DOM.uploadProgressPercent.textContent = `${cur + 15}%`;
        }
      }, 150);

      const response = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });

      clearInterval(progressTimer);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      DOM.uploadProgressBar.style.width = "100%";
      DOM.uploadProgressPercent.textContent = "100%";
      DOM.uploadProgressStatus.textContent = "Upload complete!";

      const storageTypeLabel = data.image.is_demo ? "Local Demo Storage" : "AWS S3";
      showToast(
        "Upload Successful",
        `Saved '${data.image.filename}' to ${storageTypeLabel}.`,
        "success"
      );

      // Short delay for visual completion, then refresh
      setTimeout(() => {
        resetUploadZone();
        fetchImages();
      }, 500);

    } catch (err) {
      console.error("Upload error:", err);
      showToast("Upload Failed", err.message || "Failed to upload image.", "error");
      DOM.uploadProgressContainer.classList.add("hidden");
      DOM.btnConfirmUpload.disabled = false;
      DOM.btnCancelPreview.disabled = false;
    }
  }

  // =========================================================================
  // Gallery Rendering, Filtering, Sorting & Search
  // =========================================================================

  function renderSkeletons() {
    DOM.emptyState.classList.add("hidden");
    DOM.galleryContainer.innerHTML = Array(6)
      .fill(0)
      .map(
        () => `
        <div class="skeleton-card">
          <div class="skeleton-media"></div>
          <div class="skeleton-info">
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
          </div>
        </div>
      `
      )
      .join("");
  }

  function applyFiltersAndSort() {
    let result = [...STATE.images];

    // 1. Search Query (Filename matching)
    if (STATE.searchQuery.trim()) {
      const q = STATE.searchQuery.toLowerCase().trim();
      result = result.filter((img) =>
        (img.filename || "").toLowerCase().includes(q)
      );
    }

    // 2. Format Filter (All, PNG, JPG/JPEG, WEBP)
    if (STATE.currentFilter !== "all") {
      const target = STATE.currentFilter.toUpperCase();
      result = result.filter((img) => {
        const fmt = (img.format || "").toUpperCase();
        if (target === "JPG") return fmt === "JPG" || fmt === "JPEG";
        return fmt === target;
      });
    }

    // 3. Sorting
    switch (STATE.currentSort) {
      case "newest":
        result.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        break;
      case "oldest":
        result.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        break;
      case "size-desc":
        result.sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0));
        break;
      case "size-asc":
        result.sort((a, b) => (a.size_bytes || 0) - (b.size_bytes || 0));
        break;
      case "name-asc":
        result.sort((a, b) => (a.filename || "").localeCompare(b.filename || ""));
        break;
    }

    STATE.filteredImages = result;
    renderGallery(result);
  }

  function renderGallery(images) {
    DOM.resultsCount.textContent = `Showing ${images.length} of ${STATE.images.length} image${
      STATE.images.length === 1 ? "" : "s"
    }`;

    if (images.length === 0) {
      DOM.galleryContainer.innerHTML = "";
      DOM.emptyState.classList.remove("hidden");
      if (STATE.searchQuery.trim() || STATE.currentFilter !== "all") {
        DOM.emptyTitle.textContent = "No matching images found";
        DOM.emptyDesc.textContent = "Try clearing your search query or choosing a different format filter.";
      } else {
        DOM.emptyTitle.textContent = "Your cloud gallery is empty";
        DOM.emptyDesc.textContent = "Upload your first image above to store it securely in your cloud.";
      }
      return;
    }

    DOM.emptyState.classList.add("hidden");

    DOM.galleryContainer.innerHTML = images
      .map((img) => {
        const fullUrl = img.url.startsWith("http") ? img.url : `${API_BASE}${img.url}`;
        const storageBadgeText = img.is_demo ? "Demo Mode" : "AWS S3";
        const dateFormatted = formatDate(img.upload_date);

        return `
          <div class="image-card" data-id="${img.id}">
            <div class="card-media" onclick="CloudPixApp.openPreview('${img.id}')">
              <img src="${fullUrl}" alt="${escapeHtml(img.filename)}" class="card-img" loading="lazy" />
              <div class="card-badges">
                <span class="card-badge-format">${img.format}</span>
                <span class="card-badge-storage">${storageBadgeText}</span>
              </div>
              <div class="card-overlay">
                <button class="overlay-btn" title="View Fullscreen" onclick="event.stopPropagation(); CloudPixApp.openPreview('${img.id}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button class="overlay-btn" title="Download Image" onclick="event.stopPropagation(); CloudPixApp.downloadImage('${img.id}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                </button>
                <button class="overlay-btn btn-del" title="Delete Image" onclick="event.stopPropagation(); CloudPixApp.confirmDelete('${img.id}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </button>
              </div>
            </div>
            <div class="card-details">
              <h4 class="card-filename" title="${escapeHtml(img.filename)}">${escapeHtml(img.filename)}</h4>
              <div class="card-meta">
                <span>${img.size_formatted || formatBytes(img.size_bytes)}</span>
                <span>${dateFormatted}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // =========================================================================
  // Preview Modal Workflow
  // =========================================================================

  function openPreview(imageId) {
    const img = STATE.images.find((i) => i.id === imageId);
    if (!img) return;

    STATE.activeImage = img;
    const fullUrl = img.url.startsWith("http") ? img.url : `${API_BASE}${img.url}`;

    DOM.modalImageElement.src = fullUrl;
    DOM.modalImageTitle.textContent = img.filename;
    DOM.modalFilename.textContent = img.filename;
    DOM.modalFormat.textContent = img.format;
    DOM.modalSize.textContent = `${img.size_formatted} (${(img.size_bytes || 0).toLocaleString()} bytes)`;
    DOM.modalDate.textContent = formatDate(img.upload_date);

    if (img.is_demo) {
      DOM.modalStorageBadge.className = "badge badge-mode mode-local";
      DOM.modalStorageBadge.textContent = "Local Demo";
      DOM.modalStorageBackend.textContent = "Local Server Disk (backend/uploads/)";
      DOM.modalAccessMethod.textContent = "Direct Stream URL";
    } else {
      DOM.modalStorageBadge.className = "badge badge-mode mode-s3";
      DOM.modalStorageBadge.textContent = "AWS S3";
      DOM.modalStorageBackend.textContent = `AWS S3 (Bucket: ${STATE.health.bucket_name || 'private'})`;
      DOM.modalAccessMethod.textContent = "Presigned URL (60-min TTL)";
    }

    DOM.copyLinkBtnText.textContent = "Copy Access Link";
    DOM.previewModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closePreview() {
    DOM.previewModal.classList.add("hidden");
    document.body.style.overflow = "";
    STATE.activeImage = null;
  }

  async function copyAccessLink() {
    if (!STATE.activeImage) return;
    const img = STATE.activeImage;
    const fullUrl = img.url.startsWith("http") ? img.url : `${window.location.origin}${img.url}`;

    try {
      await navigator.clipboard.writeText(fullUrl);
      DOM.copyLinkBtnText.textContent = "✓ Link Copied!";
      showToast("Link Copied", "Image access URL copied to clipboard.", "success");
      setTimeout(() => {
        DOM.copyLinkBtnText.textContent = "Copy Access Link";
      }, 2500);
    } catch {
      // Fallback
      prompt("Copy image URL:", fullUrl);
    }
  }

  function downloadImage(imageId) {
    const img = STATE.images.find((i) => i.id === imageId) || STATE.activeImage;
    if (!img) return;

    const fullUrl = img.url.startsWith("http") ? img.url : `${API_BASE}${img.url}`;
    
    // Fetch blob and trigger download so filename is preserved
    fetch(fullUrl)
      .then((res) => res.blob())
      .then((blob) => {
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = img.filename || "downloaded_image";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        a.remove();
        showToast("Download Started", `Downloading '${img.filename}'`, "info");
      })
      .catch((err) => {
        console.error("Download failed:", err);
        window.open(fullUrl, "_blank");
      });
  }

  // =========================================================================
  // Delete Modal Workflow
  // =========================================================================

  function confirmDelete(imageId) {
    const img = STATE.images.find((i) => i.id === imageId);
    if (!img) return;

    STATE.deleteTargetImage = img;
    DOM.deleteTargetFilename.textContent = `'${img.filename}'`;
    DOM.deleteConfirmModal.classList.remove("hidden");
  }

  function closeDeleteModal() {
    DOM.deleteConfirmModal.classList.add("hidden");
    STATE.deleteTargetImage = null;
    DOM.btnDeleteConfirm.disabled = false;
    DOM.deleteBtnText.textContent = "Yes, Delete";
  }

  async function executeDelete() {
    if (!STATE.deleteTargetImage) return;

    const img = STATE.deleteTargetImage;
    DOM.btnDeleteConfirm.disabled = true;
    DOM.deleteBtnText.textContent = "Deleting...";

    try {
      const response = await fetch(`${API_BASE}/api/images/${img.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete image.");
      }

      showToast("Image Deleted", `Deleted '${img.filename}' successfully.`, "success");
      closeDeleteModal();
      if (STATE.activeImage && STATE.activeImage.id === img.id) {
        closePreview();
      }
      fetchImages();
    } catch (err) {
      console.error("Delete error:", err);
      showToast("Delete Error", err.message || "Failed to delete image.", "error");
      DOM.btnDeleteConfirm.disabled = false;
      DOM.deleteBtnText.textContent = "Yes, Delete";
    }
  }

  // =========================================================================
  // Toolbar, Filters & Listeners Setup
  // =========================================================================

  function initToolbarEvents() {
    // Live Search
    DOM.searchInput.addEventListener("input", (e) => {
      STATE.searchQuery = e.target.value;
      if (STATE.searchQuery.length > 0) {
        DOM.btnClearSearch.classList.remove("hidden");
      } else {
        DOM.btnClearSearch.classList.add("hidden");
      }
      applyFiltersAndSort();
    });

    DOM.btnClearSearch.addEventListener("click", () => {
      DOM.searchInput.value = "";
      STATE.searchQuery = "";
      DOM.btnClearSearch.classList.add("hidden");
      applyFiltersAndSort();
    });

    // Format Filters
    DOM.formatFilters.addEventListener("click", (e) => {
      const pill = e.target.closest(".pill");
      if (!pill) return;

      DOM.formatFilters.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");

      STATE.currentFilter = pill.getAttribute("data-format");
      applyFiltersAndSort();
    });

    // Sort Dropdown
    DOM.sortSelect.addEventListener("change", (e) => {
      STATE.currentSort = e.target.value;
      applyFiltersAndSort();
    });

    // View Toggles
    DOM.btnGridView.addEventListener("click", () => {
      DOM.btnGridView.classList.add("active");
      DOM.btnListView.classList.remove("active");
      DOM.galleryContainer.classList.remove("list-view");
      STATE.viewMode = "grid";
    });

    DOM.btnListView.addEventListener("click", () => {
      DOM.btnListView.classList.add("active");
      DOM.btnGridView.classList.remove("active");
      DOM.galleryContainer.classList.add("list-view");
      STATE.viewMode = "list";
    });

    // Refresh Gallery
    DOM.btnRefreshGallery.addEventListener("click", () => {
      DOM.btnRefreshGallery.classList.add("refreshing");
      fetchImages().finally(() => {
        setTimeout(() => {
          DOM.btnRefreshGallery.classList.remove("refreshing");
        }, 600);
      });
    });

    // Refresh Health Button in Banner
    DOM.btnRefreshHealth.addEventListener("click", () => {
      checkHealth().then(() => {
        showToast("Health Checked", STATE.health.status_message || "Status updated.", "info");
      });
    });

    // Empty state upload shortcut
    DOM.btnEmptyUpload.addEventListener("click", () => {
      DOM.fileInput.click();
    });

    // Preview Modal events
    DOM.btnModalClose.addEventListener("click", closePreview);
    DOM.previewModal.addEventListener("click", (e) => {
      if (e.target === DOM.previewModal) closePreview();
    });

    DOM.btnModalCopyLink.addEventListener("click", copyAccessLink);
    DOM.btnModalDownload.addEventListener("click", () => {
      if (STATE.activeImage) downloadImage(STATE.activeImage.id);
    });
    DOM.btnModalDelete.addEventListener("click", () => {
      if (STATE.activeImage) confirmDelete(STATE.activeImage.id);
    });

    // Delete Modal events
    DOM.btnDeleteCancel.addEventListener("click", closeDeleteModal);
    DOM.btnDeleteModalCancelX.addEventListener("click", closeDeleteModal);
    DOM.btnDeleteConfirm.addEventListener("click", executeDelete);
    DOM.deleteConfirmModal.addEventListener("click", (e) => {
      if (e.target === DOM.deleteConfirmModal) closeDeleteModal();
    });

    // Keyboard navigation (Esc key to close modals)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!DOM.deleteConfirmModal.classList.contains("hidden")) {
          closeDeleteModal();
        } else if (!DOM.previewModal.classList.contains("hidden")) {
          closePreview();
        }
      }
    });
  }

  // =========================================================================
  // Expose global object for inline card clicks & initialization
  // =========================================================================

  window.CloudPixApp = {
    openPreview,
    downloadImage,
    confirmDelete,
  };

  // =========================================================================
  // Initialize Application
  // =========================================================================
  
  document.addEventListener("DOMContentLoaded", () => {
    checkHealth();
    initUploadZone();
    initToolbarEvents();
    fetchImages();
  });

})();

