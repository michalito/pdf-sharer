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
 * Make an API request with error handling.
 * @param {string} endpoint - API endpoint (without base)
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<any>} - Response data
 */
async function request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
            },
        });

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
     * Get all PDFs.
     * @param {string} [status] - Optional status filter
     * @returns {Promise<Array>} - Array of PDF objects
     */
    async getAll(status = null) {
        const params = status ? `?status=${encodeURIComponent(status)}` : "";
        return request(`/pdfs${params}`);
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
