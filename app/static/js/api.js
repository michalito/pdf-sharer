/**
 * API client for PDF operations.
 * Provides a clean interface for all backend communication.
 */

const API_BASE = "/api";

/**
 * Custom error class for API errors.
 */
class APIError extends Error {
    constructor(message, status) {
        super(message);
        this.name = "APIError";
        this.status = status;
    }
}

/**
 * Get CSRF token from meta tag.
 */
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : "";
}

/**
 * Make an API request with error handling.
 * @param {string} endpoint - API endpoint (without base)
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<any>} - Response data
 */
async function request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;

    // Add CSRF token to mutating requests
    const method = options.method?.toUpperCase() || "GET";
    const needsCsrf = ["POST", "PATCH", "PUT", "DELETE"].includes(method);

    const headers = {
        ...options.headers,
    };

    if (needsCsrf) {
        headers["X-CSRFToken"] = getCsrfToken();
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });

        // Handle authentication errors
        if (response.status === 401) {
            // Redirect to login page
            window.location.href = "/login";
            throw new APIError("Authentication required", 401);
        }

        // Handle no content responses
        if (response.status === 204) {
            return null;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new APIError(
                data.error || "An error occurred",
                response.status
            );
        }

        return data;
    } catch (error) {
        if (error instanceof APIError) {
            throw error;
        }
        throw new APIError("Network error. Please try again.", 0);
    }
}

/**
 * PDF API client.
 */
export const pdfApi = {
    /**
     * Get all PDFs with pagination.
     * @param {Object} options - Query options
     * @param {string} [options.status] - Optional status filter
     * @param {number} [options.page] - Page number (default 1)
     * @param {number} [options.perPage] - Items per page (default 20)
     * @returns {Promise<{items: Array, pagination: Object}>} - Paginated result
     */
    async getAll({ status = null, page = 1, perPage = 20 } = {}) {
        const params = new URLSearchParams();
        if (status) params.append("status", status);
        if (page !== 1) params.append("page", page.toString());
        if (perPage !== 20) params.append("per_page", perPage.toString());

        const queryString = params.toString();
        const endpoint = queryString ? `/pdfs?${queryString}` : "/pdfs";

        return request(endpoint);
    },

    /**
     * Upload a PDF file.
     * @param {File} file - The file to upload
     * @returns {Promise<Object>} - Created PDF object
     */
    async upload(file) {
        const formData = new FormData();
        formData.append("file", file);

        return request("/pdfs", {
            method: "POST",
            body: formData,
        });
    },

    /**
     * Update a PDF's status.
     * @param {number} id - PDF ID
     * @param {string} status - New status
     * @returns {Promise<Object>} - Updated PDF object
     */
    async updateStatus(id, status) {
        return request(`/pdfs/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ status }),
        });
    },

    /**
     * Delete a PDF.
     * @param {number} id - PDF ID
     * @returns {Promise<void>}
     */
    async delete(id) {
        return request(`/pdfs/${id}`, {
            method: "DELETE",
        });
    },

    /**
     * Get the download URL for a PDF.
     * @param {number} id - PDF ID
     * @returns {string} - Download URL
     */
    getDownloadUrl(id) {
        return `${API_BASE}/pdfs/${id}`;
    },
};

export { APIError };
