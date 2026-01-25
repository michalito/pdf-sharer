/**
 * Authentication page logic.
 * Handles login form.
 */

const API_BASE = "/auth";

/**
 * Get CSRF token from meta tag.
 */
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : "";
}

/**
 * Show error message.
 */
function showError(message) {
    const errorEl = document.getElementById("auth-error");
    errorEl.textContent = message;
    errorEl.classList.add("visible");
}

/**
 * Hide error message.
 */
function hideError() {
    const errorEl = document.getElementById("auth-error");
    errorEl.classList.remove("visible");
}

/**
 * Make an API request.
 */
async function authRequest(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || "An error occurred");
    }

    return result;
}

/**
 * Handle login form submission.
 */
async function handleLogin(event) {
    event.preventDefault();
    hideError();

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;

    if (!username || !password) {
        showError("Please enter both username and password");
        return;
    }

    try {
        await authRequest("/login", { username, password });
        // Redirect to main app on success
        window.location.href = "/";
    } catch (error) {
        showError(error.message);
    }
}

/**
 * Initialize event listeners.
 */
function init() {
    const loginForm = document.getElementById("login-form");
    loginForm?.addEventListener("submit", handleLogin);
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
