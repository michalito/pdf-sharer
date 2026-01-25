/**
 * Main application entry point.
 * Coordinates all modules and handles user interactions.
 */

import { pdfApi, APIError } from "./api.js";
import { showToast, renderPDFLists, setLoading, Status } from "./ui.js";

/**
 * Application state.
 */
const state = {
    pdfs: [],
    isLoading: false,
    isDarkMode: localStorage.getItem("darkMode") === "true",
};

/**
 * DOM element references.
 */
const elements = {
    uploadBtn: null,
    uploadArea: null,
    fileInput: null,
    themeToggle: null,
    unprocessedColumn: null,
    processedColumn: null,
    mainContent: null,
};

/**
 * Initialize the application.
 */
async function init() {
    cacheElements();
    setupEventListeners();
    applyTheme();
    await loadPDFs();
}

/**
 * Cache DOM element references.
 */
function cacheElements() {
    elements.uploadBtn = document.getElementById("upload-btn");
    elements.uploadArea = document.getElementById("upload-area");
    elements.fileInput = document.getElementById("file-input");
    elements.themeToggle = document.getElementById("theme-toggle");
    elements.unprocessedColumn = document.getElementById("unprocessed-column");
    elements.processedColumn = document.getElementById("processed-column");
    elements.mainContent = document.getElementById("main-content");
}

/**
 * Set up all event listeners.
 */
function setupEventListeners() {
    // Upload button
    elements.uploadBtn?.addEventListener("click", handleUploadClick);

    // File input change
    elements.fileInput?.addEventListener("change", handleFileSelect);

    // Upload area drag and drop
    if (elements.uploadArea) {
        elements.uploadArea.addEventListener("dragover", handleDragOver);
        elements.uploadArea.addEventListener("dragleave", handleDragLeave);
        elements.uploadArea.addEventListener("drop", handleUploadDrop);
        elements.uploadArea.addEventListener("click", () => elements.fileInput?.click());
    }

    // Theme toggle
    elements.themeToggle?.addEventListener("click", toggleTheme);

    // PDF columns drag and drop
    [elements.unprocessedColumn, elements.processedColumn].forEach((column) => {
        if (column) {
            column.addEventListener("dragover", handleColumnDragOver);
            column.addEventListener("dragleave", handleColumnDragLeave);
            column.addEventListener("drop", handleColumnDrop);
        }
    });

    // Action button delegation (on main content area)
    elements.mainContent?.addEventListener("click", handleActionClick);

    // PDF item drag start/end delegation
    elements.mainContent?.addEventListener("dragstart", handleDragStart);
    elements.mainContent?.addEventListener("dragend", handleDragEnd);
}

/**
 * Load all PDFs from the API.
 */
async function loadPDFs() {
    if (state.isLoading) return;

    state.isLoading = true;
    setLoading(document.body, true);

    try {
        state.pdfs = await pdfApi.getAll();
        renderPDFLists(state.pdfs);
    } catch (error) {
        handleError(error, "Failed to load PDFs");
    } finally {
        state.isLoading = false;
        setLoading(document.body, false);
    }
}

/**
 * Handle upload button click.
 */
function handleUploadClick() {
    // Show upload area if hidden
    if (elements.uploadArea?.hidden) {
        elements.uploadArea.hidden = false;
    }
    elements.fileInput?.click();
}

/**
 * Handle file selection from input.
 * @param {Event} event - Change event
 */
function handleFileSelect(event) {
    const files = event.target.files;
    if (files?.length) {
        uploadFiles(Array.from(files));
    }
    // Reset input to allow re-selecting the same file
    event.target.value = "";
}

/**
 * Handle drag over upload area.
 * @param {DragEvent} event - Drag event
 */
function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add("upload-area--dragover");
}

/**
 * Handle drag leave upload area.
 * @param {DragEvent} event - Drag event
 */
function handleDragLeave(event) {
    event.currentTarget.classList.remove("upload-area--dragover");
}

/**
 * Handle drop on upload area.
 * @param {DragEvent} event - Drop event
 */
function handleUploadDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("upload-area--dragover");

    const files = Array.from(event.dataTransfer?.files || []);
    uploadFiles(files);
}

/**
 * Upload multiple files.
 * @param {File[]} files - Files to upload
 */
async function uploadFiles(files) {
    const pdfFiles = files.filter((file) => file.type === "application/pdf");
    const nonPdfCount = files.length - pdfFiles.length;

    if (nonPdfCount > 0) {
        showToast(`${nonPdfCount} file(s) skipped. Only PDF files are allowed.`, "error");
    }

    for (const file of pdfFiles) {
        try {
            const pdf = await pdfApi.upload(file);
            showToast(`Uploaded: ${pdf.filename}`, "success");
        } catch (error) {
            handleError(error, `Failed to upload ${file.name}`);
        }
    }

    if (pdfFiles.length > 0) {
        await loadPDFs();
    }
}

/**
 * Handle action button clicks (download, process, delete).
 * @param {Event} event - Click event
 */
async function handleActionClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = parseInt(button.dataset.id, 10);

    if (!id) return;

    switch (action) {
        case "download":
            downloadPDF(id);
            break;
        case "process":
            await processFile(id);
            break;
        case "delete":
            await deleteFile(id);
            break;
    }
}

/**
 * Download a PDF.
 * @param {number} id - PDF ID
 */
function downloadPDF(id) {
    window.location.href = pdfApi.getDownloadUrl(id);
}

/**
 * Mark a PDF as processed.
 * @param {number} id - PDF ID
 */
async function processFile(id) {
    try {
        const pdf = await pdfApi.updateStatus(id, Status.PROCESSED);
        showToast(`Processed: ${pdf.filename}`, "success");
        await loadPDFs();
    } catch (error) {
        handleError(error, "Failed to process PDF");
    }
}

/**
 * Delete a PDF.
 * @param {number} id - PDF ID
 */
async function deleteFile(id) {
    const pdf = state.pdfs.find((p) => p.id === id);
    const filename = pdf?.filename || "this PDF";

    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) {
        return;
    }

    try {
        await pdfApi.delete(id);
        showToast("PDF deleted", "success");
        await loadPDFs();
    } catch (error) {
        handleError(error, "Failed to delete PDF");
    }
}

/**
 * Handle drag start on PDF item.
 * @param {DragEvent} event - Drag event
 */
function handleDragStart(event) {
    const item = event.target.closest(".pdf-item");
    if (!item) return;

    item.classList.add("pdf-item--dragging");
    event.dataTransfer.setData("text/plain", item.dataset.id);
    event.dataTransfer.effectAllowed = "move";
}

/**
 * Handle drag end on PDF item.
 * @param {DragEvent} event - Drag event
 */
function handleDragEnd(event) {
    const item = event.target.closest(".pdf-item");
    if (item) {
        item.classList.remove("pdf-item--dragging");
    }
}

/**
 * Handle drag over PDF column.
 * @param {DragEvent} event - Drag event
 */
function handleColumnDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add("pdf-column--dragover");
}

/**
 * Handle drag leave PDF column.
 * @param {DragEvent} event - Drag event
 */
function handleColumnDragLeave(event) {
    // Only remove if leaving the column entirely
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove("pdf-column--dragover");
    }
}

/**
 * Handle drop on PDF column.
 * @param {DragEvent} event - Drop event
 */
async function handleColumnDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("pdf-column--dragover");

    const id = parseInt(event.dataTransfer?.getData("text/plain"), 10);
    if (!id) return;

    const column = event.currentTarget;
    const newStatus =
        column.id === "unprocessed-column" ? Status.UNPROCESSED : Status.PROCESSED;

    // Check if status is actually changing
    const pdf = state.pdfs.find((p) => p.id === id);
    if (pdf?.status === newStatus) return;

    try {
        const updated = await pdfApi.updateStatus(id, newStatus);
        showToast(`Updated: ${updated.filename}`, "success");
        await loadPDFs();
    } catch (error) {
        handleError(error, "Failed to update status");
    }
}

/**
 * Toggle dark mode.
 */
function toggleTheme() {
    state.isDarkMode = !state.isDarkMode;
    localStorage.setItem("darkMode", state.isDarkMode);
    applyTheme();
}

/**
 * Apply the current theme.
 */
function applyTheme() {
    document.documentElement.classList.toggle("dark", state.isDarkMode);

    const icon = elements.themeToggle?.querySelector(".icon use");
    if (icon) {
        icon.setAttribute("href", state.isDarkMode ? "#icon-sun" : "#icon-moon");
    }

    elements.themeToggle?.setAttribute(
        "aria-label",
        state.isDarkMode ? "Switch to light mode" : "Switch to dark mode"
    );
}

/**
 * Handle API errors.
 * @param {Error} error - The error
 * @param {string} fallbackMessage - Fallback message if error has no message
 */
function handleError(error, fallbackMessage) {
    const message = error instanceof APIError ? error.message : fallbackMessage;
    showToast(message, "error");
    console.error(error);
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
