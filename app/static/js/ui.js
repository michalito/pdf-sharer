/**
 * UI components and utilities.
 * Handles DOM manipulation and user feedback.
 */

/**
 * Status values - must match backend.
 */
export const Status = {
    UNPROCESSED: "unprocessed",
    PROCESSED: "processed",
};

/**
 * Show a toast notification.
 * @param {string} message - Message to display
 * @param {"success"|"error"|"info"} type - Notification type
 * @param {number} duration - Duration in ms (default: 3000)
 */
export function showToast(message, type = "info", duration = 3000) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "polite");

    // Escape HTML to prevent XSS
    toast.textContent = message;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add("toast--visible");
    });

    // Remove after duration
    setTimeout(() => {
        toast.classList.remove("toast--visible");
        toast.addEventListener("transitionend", () => toast.remove());
    }, duration);
}

/**
 * Format a date for display.
 * @param {string} isoDate - ISO date string
 * @returns {string} - Formatted date
 */
export function formatDate(isoDate) {
    const date = new Date(isoDate);
    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

/**
 * Format file size for display.
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Create a PDF item element.
 * @param {Object} pdf - PDF data object
 * @returns {HTMLElement} - PDF item element
 */
export function createPDFItem(pdf) {
    const item = document.createElement("article");
    item.className = "pdf-item";
    item.dataset.id = pdf.id;
    item.draggable = true;
    item.setAttribute("role", "listitem");
    item.setAttribute("aria-label", `PDF: ${pdf.filename}`);

    const isUnprocessed = pdf.status === Status.UNPROCESSED;

    // Use textContent for user data to prevent XSS
    const infoDiv = document.createElement("div");
    infoDiv.className = "pdf-item__info";

    const nameSpan = document.createElement("span");
    nameSpan.className = "pdf-item__name";
    nameSpan.textContent = pdf.filename;
    nameSpan.title = pdf.filename;

    const metaSpan = document.createElement("span");
    metaSpan.className = "pdf-item__meta";
    metaSpan.textContent = `${formatDate(pdf.uploadDate)} • ${formatFileSize(pdf.fileSize)}`;

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(metaSpan);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "pdf-item__actions";

    // Download button
    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "btn btn--icon btn--download";
    downloadBtn.dataset.action = "download";
    downloadBtn.dataset.id = pdf.id;
    downloadBtn.setAttribute("aria-label", `Download ${pdf.filename}`);
    downloadBtn.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-download"></use></svg>`;

    actionsDiv.appendChild(downloadBtn);

    // Status-specific button
    if (isUnprocessed) {
        const processBtn = document.createElement("button");
        processBtn.type = "button";
        processBtn.className = "btn btn--icon btn--process";
        processBtn.dataset.action = "process";
        processBtn.dataset.id = pdf.id;
        processBtn.setAttribute("aria-label", `Mark ${pdf.filename} as processed`);
        processBtn.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-check"></use></svg>`;
        actionsDiv.appendChild(processBtn);
    } else {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn--icon btn--delete";
        deleteBtn.dataset.action = "delete";
        deleteBtn.dataset.id = pdf.id;
        deleteBtn.setAttribute("aria-label", `Delete ${pdf.filename}`);
        deleteBtn.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-trash"></use></svg>`;
        actionsDiv.appendChild(deleteBtn);
    }

    item.appendChild(infoDiv);
    item.appendChild(actionsDiv);

    return item;
}

/**
 * Render the PDF lists.
 * @param {Array} pdfs - Array of PDF objects
 */
export function renderPDFLists(pdfs) {
    const unprocessedList = document.getElementById("unprocessed-list");
    const processedList = document.getElementById("processed-list");

    if (!unprocessedList || !processedList) return;

    // Clear lists
    unprocessedList.innerHTML = "";
    processedList.innerHTML = "";

    const unprocessed = pdfs.filter((p) => p.status === Status.UNPROCESSED);
    const processed = pdfs.filter((p) => p.status === Status.PROCESSED);

    // Render unprocessed
    if (unprocessed.length === 0) {
        unprocessedList.innerHTML = `<p class="empty-state">No unprocessed PDFs</p>`;
    } else {
        unprocessed.forEach((pdf) => {
            unprocessedList.appendChild(createPDFItem(pdf));
        });
    }

    // Render processed
    if (processed.length === 0) {
        processedList.innerHTML = `<p class="empty-state">No processed PDFs</p>`;
    } else {
        processed.forEach((pdf) => {
            processedList.appendChild(createPDFItem(pdf));
        });
    }

    // Update counts
    updateCounts(unprocessed.length, processed.length);
}

/**
 * Update the count badges.
 * @param {number} unprocessed - Unprocessed count
 * @param {number} processed - Processed count
 */
function updateCounts(unprocessed, processed) {
    const unprocessedCount = document.getElementById("unprocessed-count");
    const processedCount = document.getElementById("processed-count");

    if (unprocessedCount) {
        unprocessedCount.textContent = unprocessed;
        unprocessedCount.hidden = unprocessed === 0;
    }

    if (processedCount) {
        processedCount.textContent = processed;
        processedCount.hidden = processed === 0;
    }
}

/**
 * Set loading state on an element.
 * @param {HTMLElement} element - Element to set loading state on
 * @param {boolean} isLoading - Whether to show loading state
 */
export function setLoading(element, isLoading) {
    if (isLoading) {
        element.classList.add("is-loading");
        element.setAttribute("aria-busy", "true");
    } else {
        element.classList.remove("is-loading");
        element.setAttribute("aria-busy", "false");
    }
}
