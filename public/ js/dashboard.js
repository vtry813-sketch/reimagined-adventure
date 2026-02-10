class DashboardManager {
    constructor() {
        this.currentUser = null;
        this.servers = [];
        this.selectedPlan = null;
        this.init();
    }

    async init() {
        await this.loadUserData();
        this.initEventListeners();
        this.loadServers();
        this.loadPlans();
    }

    async loadUserData() {
        try {
            const data = await Utils.apiRequest('/auth/me');
            this.currentUser = data.user;
            this.updateUserUI();
        } catch (error) {
            console.error('Failed to load user data:', error);
        }
    }

    updateUserUI() {
        if (!this.currentUser) return;

        // Update coin balance
        const coinElements = document.querySelectorAll('.coin-balance, #userCoins');
        coinElements.forEach(el => {
            el.textContent = Utils.formatCoins(this.currentUser.coins);
        });

        // Update username
        const usernameElements = document.querySelectorAll('#userName, .user-name');
        usernameElements.forEach(el => {
            el.textContent = this.currentUser.username;
        });

        // Update referral link
        const referralLink = document.getElementById('referralLink');
        if (referralLink) {
            const link = `${window.location.origin}/signup?ref=${this.currentUser.referral_code}`;
            referralLink.textContent = link;
            referralLink.dataset.link = link;
        }

        // Update referral count
        const referralCount = document.getElementById('referralCount');
        if (referralCount && this.currentUser.referral_count !== undefined) {
            referralCount.textContent = this.currentUser.referral_count;
        }
    }

    async loadServers() {
        try {
            const data = await Utils.apiRequest('/servers/my-servers');
            this.servers = data.servers;
            this.renderServers();
        } catch (error) {
            console.error('Failed to load servers:', error);
            Utils.showAlert('Failed to load servers', 'error');
        }
    }

    renderServers() {
        const container = document.getElementById('serversContainer');
        if (!container) return;

        if (this.servers.length === 0) {
            container.innerHTML = `
                <div class="card text-center">
                    <h3>No Servers Yet</h3>
                    <p class="mb-3">Create your first server to get started!</p>
                    <button onclick="document.getElementById('createServerModal').classList.remove('hidden')" 
                            class="btn btn-primary">
                        Create Server
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.servers.map(server => `
            <div class="card">
                <div class="flex justify-between items-center mb-3">
                    <div>
                        <h3 class="mb-1">${server.server_name}</h3>
                        <p class="text-secondary">
                            Created: ${Utils.formatDate(server.created_at)}
                        </p>
                    </div>
                    <span class="status-badge status-${server.status}">
                        ${server.status.charAt(0).toUpperCase() + server.status.slice(1)}
                    </span>
                </div>
                
                <div class="grid grid-cols-2 gap-4 mb-3">
                    <div>
                        <p class="text-secondary">Coins Used</p>
                        <p class="text-xl font-bold">${Utils.formatCoins(server.coins_used)}</p>
                    </div>
                    <div>
                        <p class="text-secondary">Expires</p>
                        <p class="text-xl font-bold">
                            ${server.expires_at ? Utils.formatDate(server.expires_at) : 'Never'}
                        </p>
                    </div>
                </div>
                
                <div class="flex gap-2">
                    ${server.status === 'active' ? `
                        <button onclick="dashboard.pairServer('${server.id}')" 
                                class="btn btn-primary btn-small">
                            Get Pairing Code
                        </button>
                        <button onclick="dashboard.stopServer('${server.id}')" 
                                class="btn btn-danger btn-small">
                            Stop
                        </button>
                    ` : `
                        <button disabled class="btn btn-secondary btn-small">
                            Expired
                        </button>
                    `}
                </div>
            </div>
        `).join('');
    }

    async loadPlans() {
        try {
            const data = await Utils.apiRequest('/servers/plans/list');
            this.plans = data.plans;
            this.renderPlans();
        } catch (error) {
            console.error('Failed to load plans:', error);
        }
    }

    renderPlans() {
        const container = document.getElementById('plansContainer');
        if (!container) return;

        container.innerHTML = this.plans.map((plan, index) => `
            <div class="plan-card ${this.selectedPlan === index ? 'selected' : ''}" 
                 onclick="dashboard.selectPlan(${index})">
                <div class="plan-coins">${plan.coins} 🪙</div>
                <div class="plan-duration">${plan.label}</div>
                <div class="plan-price">${plan.duration ? plan.duration + 'h' : 'Unlimited'}</div>
            </div>
        `).join('');
    }

    selectPlan(index) {
        this.selectedPlan = index;
        this.renderPlans();
    }

    async createServer() {
        const serverName = document.getElementById('serverName')?.value;
        
        if (!serverName || serverName.length < 3) {
            Utils.showAlert('Server name must be at least 3 characters', 'error');
            return;
        }

        if (this.selectedPlan === null) {
            Utils.showAlert('Please select a plan', 'error');
            return;
        }

        const plan = this.plans[this.selectedPlan];
        
        if (this.currentUser.coins < plan.coins) {
            Utils.showAlert('Insufficient coins', 'error');
            return;
        }

        const button = document.querySelector('#createServerModal button[type="submit"]');
        const stopLoading = Utils.showLoading(button);

        try {
            const data = await Utils.apiRequest('/servers/create', {
                method: 'POST',
                body: JSON.stringify({
                    serverName,
                    planIndex: this.selectedPlan
                })
            });

            Utils.showAlert('Server created successfully!', 'success');
            
            // Update user coins
            this.currentUser.coins = data.remainingCoins;
            this.updateUserUI();
            
            // Reload servers
            await this.loadServers();
            
            // Close modal
            document.getElementById('createServerModal').classList.add('hidden');
            
            // Clear form
            document.getElementById('serverName').value = '';
            this.selectedPlan = null;
            this.renderPlans();

        } catch (error) {
            Utils.showAlert(error.message, 'error');
        } finally {
            if (stopLoading) stopLoading();
        }
    }

    async pairServer(serverId) {
        const phoneNumber = prompt('Enter phone number (digits only):');
        
        if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
            Utils.showAlert('Invalid phone number', 'error');
            return;
        }

        const stopLoading = Utils.showLoading();

        try {
            const data = await Utils.apiRequest(`/servers/${serverId}/pair`, {
                method: 'POST',
                body: JSON.stringify({ phoneNumber })
            });

            // Show pairing code
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <h3>Pairing Code</h3>
                    <p>For phone number: ${phoneNumber}</p>
                    <div class="pairing-code">
                        <h2>${data.pairingCode}</h2>
                    </div>
                    <p class="text-secondary">Use this code in WhatsApp to connect</p>
                    <button onclick="this.closest('.modal').remove()" 
                            class="btn btn-primary w-full mt-3">
                        OK
                    </button>
                </div>
            `;
            
            document.body.appendChild(modal);
            
        } catch (error) {
            Utils.showAlert(error.message, 'error');
        } finally {
            if (stopLoading) stopLoading();
        }
    }

    async stopServer(serverId) {
        if (!confirm('Are you sure you want to stop this server?')) return;

        const stopLoading = Utils.showLoading();

        try {
            await Utils.apiRequest(`/servers/${serverId}/stop`, {
                method: 'POST'
            });

            Utils.showAlert('Server stopped successfully', 'success');
            await this.loadServers();
            
        } catch (error) {
            Utils.showAlert(error.message, 'error');
        } finally {
            if (stopLoading) stopLoading();
        }
    }

    initEventListeners() {
        // Create server modal
        const createServerBtn = document.getElementById('createServerBtn');
        if (createServerBtn) {
            createServerBtn.addEventListener('click', () => {
                document.getElementById('createServerModal').classList.remove('hidden');
            });
        }

        // Close modal buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.add('hidden');
            });
        });

        // Create server form
        const createServerForm = document.getElementById('createServerForm');
        if (createServerForm) {
            createServerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createServer();
            });
        }

        // Copy referral link
        const copyReferralBtn = document.getElementById('copyReferralBtn');
        if (copyReferralBtn) {
            copyReferralBtn.addEventListener('click', () => {
                const link = document.getElementById('referralLink')?.dataset.link;
                if (link) {
                    Utils.copyToClipboard(link);
                }
            });
        }

        // Contact admin button
        const contactAdminBtn = document.getElementById('contactAdminBtn');
        if (contactAdminBtn) {
            contactAdminBtn.addEventListener('click', () => {
                const modal = document.createElement('div');
                modal.className = 'modal';
                modal.innerHTML = `
                    <div class="modal-content">
                        <h3>Contact Admin</h3>
                        <p>To purchase coins, contact the admin:</p>
                        <div class="contact-info">
                            <p><strong>Email:</strong> inconnuboytech@gmail.com</p>
                            <p><strong>Phone:</strong> +509 3566 2592</p>
                        </div>
                        <button onclick="this.closest('.modal').remove()" 
                                class="btn btn-primary w-full mt-3">
                            OK
                        </button>
                    </div>
                `;
                document.body.appendChild(modal);
            });
        }
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('dashboardPage')) {
        window.dashboard = new DashboardManager();
    }
});
