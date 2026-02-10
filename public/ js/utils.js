// Utility functions

class Utils {
    static showAlert(message, type = 'info', duration = 5000) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.textContent = message;
        
        const container = document.querySelector('.container') || document.body;
        container.insertBefore(alertDiv, container.firstChild);
        
        if (duration > 0) {
            setTimeout(() => {
                alertDiv.remove();
            }, duration);
        }
        
        return alertDiv;
    }

    static showLoading(button) {
        if (!button) return null;
        
        const originalHTML = button.innerHTML;
        button.innerHTML = '<span class="loading"></span> Loading...';
        button.disabled = true;
        
        return () => {
            button.innerHTML = originalHTML;
            button.disabled = false;
        };
    }

    static formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    static formatCoins(coins) {
        return coins.toLocaleString('en-US');
    }

    static copyToClipboard(text) {
        navigator.clipboard.writeText(text)
            .then(() => Utils.showAlert('Copied to clipboard!', 'success'))
            .catch(err => Utils.showAlert('Failed to copy', 'error'));
    }

    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static checkAuth() {
        const token = document.cookie.includes('token');
        if (!token && !window.location.pathname.includes('/login') && 
            !window.location.pathname.includes('/signup')) {
            window.location.href = '/login';
            return false;
        }
        return true;
    }

    static async apiRequest(endpoint, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include'
        };

        const response = await fetch(`/api${endpoint}`, { ...defaultOptions, ...options });
        
        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    }

    static async getCurrentUser() {
        try {
            const data = await this.apiRequest('/auth/me');
            return data.user;
        } catch (error) {
            return null;
        }
    }

    static logout() {
        this.apiRequest('/auth/logout', { method: 'POST' })
            .then(() => {
                window.location.href = '/login';
            });
    }
}

// Export for browser
window.Utils = Utils;

// Auto-check auth on page load
document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.pathname.includes('/login') && 
        !window.location.pathname.includes('/signup') &&
        window.location.pathname !== '/') {
        Utils.checkAuth();
    }
});
