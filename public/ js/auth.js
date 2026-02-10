class AuthManager {
    constructor() {
        this.initEventListeners();
    }

    initEventListeners() {
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Signup form
        const signupForm = document.getElementById('signupForm');
        if (signupForm) {
            signupForm.addEventListener('submit', (e) => this.handleSignup(e));
        }

        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => Utils.logout());
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const form = e.target;
        const email = form.querySelector('#email').value;
        const password = form.querySelector('#password').value;
        
        const stopLoading = Utils.showLoading(form.querySelector('button[type="submit"]'));

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            Utils.showAlert('Login successful!', 'success');
            
            // Redirect based on role
            setTimeout(() => {
                if (data.user.role === 'admin') {
                    window.location.href = '/admin';
                } else {
                    window.location.href = '/dashboard';
                }
            }, 1000);

        } catch (error) {
            Utils.showAlert(error.message, 'error');
        } finally {
            if (stopLoading) stopLoading();
        }
    }

    async handleSignup(e) {
        e.preventDefault();
        
        const form = e.target;
        const username = form.querySelector('#username').value;
        const email = form.querySelector('#email').value;
        const password = form.querySelector('#password').value;
        const confirmPassword = form.querySelector('#confirmPassword').value;
        const referralCode = form.querySelector('#referralCode')?.value || '';
        
        if (password !== confirmPassword) {
            Utils.showAlert('Passwords do not match', 'error');
            return;
        }

        const stopLoading = Utils.showLoading(form.querySelector('button[type="submit"]'));

        try {
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ 
                    username, 
                    email, 
                    password, 
                    referralCode 
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.errors) {
                    throw new Error(data.errors.map(err => err.msg).join(', '));
                }
                throw new Error(data.error || 'Signup failed');
            }

            Utils.showAlert('Account created successfully! Welcome!', 'success');
            
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);

        } catch (error) {
            Utils.showAlert(error.message, 'error');
        } finally {
            if (stopLoading) stopLoading();
        }
    }

    async checkSession() {
        try {
            const response = await fetch('/api/auth/me', {
                credentials: 'include'
            });
            
            if (!response.ok) {
                return null;
            }
            
            const data = await response.json();
            return data.user;
        } catch (error) {
            return null;
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});
