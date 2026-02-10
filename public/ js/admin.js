class AdminManager {
    constructor() {
        this.currentPage = {
            users: 1,
            servers: 1
        };
        this.init();
    }

    async init() {
        await this.checkAdminRole();
        this.initEventListeners();
        this.loadStats();
        this.loadUsers();
        this.loadServers();
    }

    async checkAdminRole() {
        try {
            const user = await Utils.getCurrentUser();
            if (!user || user.role !== 'admin') {
                window.location.href = '/dashboard';
            }
        } catch (error) {
            window.location.href = '/login';
        }
    }

    async loadStats() {
        try {
            const data = await Utils.apiRequest('/admin/stats');
            this.updateStatsUI(data);
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    updateStatsUI(data) {
        const stats = data.stats;
        
        document.querySelectorAll('.stat-total-users').forEach(el => {
            el.textContent = Utils.formatCoins(stats.total_users);
        });
        
        document.querySelectorAll('.stat-total-servers').forEach(el => {
            el.textContent = Utils.formatCoins(stats.total_servers);
        });
        
        document.querySelectorAll('.stat-active-servers').forEach(el => {
            el.textContent = Utils.formatCoins(stats.active_servers);
        });
        
        document.querySelectorAll('.stat-total-coins').forEach(el => {
            el.textContent = Utils.formatCoins(stats.total_coins);
        });
        
        document.querySelectorAll('.stat-total-referrals').forEach(el => {
            el.textContent = Utils.formatCoins(stats.total_referrals);
        });

        // Update recent activity
        const activityContainer = document.getElementById('recentActivity');
        if (activityContainer) {
            activityContainer.innerHTML = data.recentActivity.map(activity => `
                <div class="activity-item">
                    <div class="flex justify-between">
                        <span class="font-medium">${activity.username}</span>
                        <span class="text-secondary">${Utils.formatDate(activity.created_at)}</span>
                    </div>
                    <div class="text-secondary">
                        ${activity.type === 'user' ? 'Registered' : 'Created server'}
                        ${activity.email ? `(${activity.email})` : ''}
                    </div>
                </div>
            `).join('');
        }
    }

    async loadUsers(page = 1) {
        try {
            const data = await Utils.apiRequest(`/admin/users?page=${page}&limit=20`);
            this.renderUsers(data);
        } catch (error) {
            console.error('Failed to load users:', error);
            Utils.showAlert('Failed to load users', 'error');
        }
    }

    renderUsers(data) {
        const container = document.getElementById('usersContainer');
        if (!container) return;

        container.innerHTML = data.users.map(user => `
            <tr>
                <td>
                    <div class="font-medium">${user.username}</div>
                    <div class="text-secondary text-sm">${user.email}</div>
                </td>
                <td>${Utils.formatCoins(user.coins)}</td>
                <td>
                    <span class="role-badge role-${user.role}">
                        ${user.role}
                    </span>
                </td>
                <td>${user.referral_count || 0}</td>
                <td>${Utils.formatDate(user.created_at)}</td>
                <td>
                    <div class="flex gap-1">
                        <button onclick="admin.rechargeUser('${user.id}', '${user.username}')" 
                                class="btn btn-success btn-small">
                            Recharge
                        </button>
                        <button onclick="admin.viewUserServers('${user.id}')" 
                                class="btn btn-primary btn-small">
                            Servers
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        this.updatePagination('users', data.pagination);
    }

    async loadServers(page = 1) {
        try {
            const data = await Utils.apiRequest(`/admin/servers?page=${page}&limit=20`);
            this.renderServers(data);
        } catch (error) {
            console.error('Failed to load servers:', error);
            Utils.showAlert('Failed to load servers', 'error');
        }
    }

    renderServers(data) {
        const container = document.getElementById('serversContainer');
        if (!container) return;

        container.innerHTML = data.servers.map(server => `
            <tr>
                <td>
                    <div class="font-medium">${server.server_name}</div>
                    <div class="text-secondary text-sm">${server.username}</div>
                </td>
                <td>
                    <span class="status-badge status-${server.status}">
                        ${server.status}
                    </span>
                </td>
                <td>${Utils.formatCoins(server.coins_used)}</td>
                <td>${server.expires_at ? Utils.formatDate(server.expires_at) : 'Never'}</td>
                <td>${Utils.formatDate(server.created_at)}</td>
                <td>
                    <div class="flex gap-1">
                        ${server.status === 'active' ? `
                            <button onclick="admin.forceExpireServer('${server.id}')" 
                                    class="btn btn-warning btn-small">
                                Expire
                            </button>
                        ` : ''}
                        <button onclick="admin.deleteServer('${server.id}')" 
                                class="btn btn-danger btn-small">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        this.updatePagination('servers', data.pagination);
    }

    updatePagination(type, pagination) {
        const container = document.getElementById(`${type}Pagination`);
        if (!container) return;

        container.innerHTML = `
            <div class="flex justify-between items-center">
                <button ${pagination.page === 1 ? 'disabled' : ''}
                        onclick="admin.load${type.charAt(0).toUpperCase() + type.slice(1)}(${pagination.page - 1})"
                        class="btn btn-secondary btn-small">
                    Previous
                </button>
                <span>Page ${pagination.page} of ${pagination.totalPages}</span>
                <button ${pagination.page === pagination.totalPages ? 'disabled' : ''}
                        onclick="admin.load${type.charAt(0).toUpperCase() + type.slice(1)}(${pagination.page + 1})"
                        class="btn btn-secondary btn-small">
                    Next
                </button>
            </div>
        `;
    }

    rechargeUser(userId, username) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Recharge ${username}</h3>
                <form id="rechargeForm" class="mt-3">
                    <div class="form-group">
                        <label class="form-label">Action</label>
                        <select id="rechargeAction" class="form-select">
                            <option value="add">Add Coins</option>
                            <option value="subtract">Subtract Coins</option>
                            <option value="set">Set Coins</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Amount</label>
                        <input type="number" id="rechargeAmount" class="form-input" required min="1">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Description (Optional)</label>
                        <input type="text" id="rechargeDescription" class="form-input" 
                               placeholder="Reason for adjustment">
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button type="submit" class="btn btn-primary flex-1">Apply</button>
                        <button type="button" onclick="this.closest('.modal').remove()" 
                                class="btn btn-secondary flex-1">Cancel</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#rechargeForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const action = modal.querySelector('#rechargeAction').value;
            const amount = parseInt(modal.querySelector('#rechargeAmount').value);
            const description = modal.querySelector('#rechargeDescription').value;

            if (isNaN(amount) || amount < 1) {
                Utils.showAlert('Please enter a valid amount', 'error');
                return;
            }

            const button = modal.querySelector('button[type="submit"]');
            const stopLoading = Utils.showLoading(button);

            try {
                const data = await Utils.apiRequest(`/admin/users/${userId}/coins`, {
                    method: 'POST',
                    body: JSON.stringify({
                        action,
                        amount,
                        description
                    })
                });

                Utils.showAlert(`Successfully ${action === 'add' ? 'added' : action === 'subtract' ? 'subtracted' : 'set'} ${amount} coins`, 'success');
                
                // Reload users
                await this.loadUsers(this.currentPage.users);
                
                // Close modal
                modal.remove();
                
            } catch (error) {
                Utils.showAlert(error.message, 'error');
            } finally {
                if (stopLoading) stopLoading();
            }
        });
    }

    async forceExpireServer(serverId) {
        if (!confirm('Are you sure you want to force expire this server?')) return;

        const stopLoading = Utils.showLoading();

        try {
            await Utils.apiRequest(`/admin/servers/${serverId}/expire`, {
                method: 'POST'
            });

            Utils.showAlert('Server force expired', 'success');
            await this.loadServers(this.currentPage.servers);
            
        } catch (error) {
            Utils.showAlert(error.message, 'error');
        } finally {
            if (stopLoading) stopLoading();
        }
    }

    async deleteServer(serverId) {
        if (!confirm('Are you sure you want to delete this server? This action cannot be undone.')) return;

        const stopLoading = Utils.showLoading();

        try {
            await Utils.apiRequest(`/admin/servers/${serverId}`, {
                method: 'DELETE'
            });

            Utils.showAlert('Server deleted successfully', 'success');
            await this.loadServers(this.currentPage.servers);
            
        } catch (error) {
            Utils.showAlert(error.message, 'error');
        } finally {
            if (stopLoading) stopLoading();
        }
    }

    viewUserServers(userId) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <h3>User Servers</h3>
                <div id="userServersContainer" class="mt-3">
                    Loading...
                </div>
                <button onclick="this.closest('.modal').remove()" 
                        class="btn btn-primary w-full mt-3">
                    Close
                </button>
            </div>
        `;

        document.body.appendChild(modal);

        // Load user servers
        this.loadUserServers(userId, modal.querySelector('#userServersContainer'));
    }

    async loadUserServers(userId, container) {
        try {
            const data = await Utils.apiRequest(`/servers/my-servers?userId=${userId}`);
            
            if (data.servers.length === 0) {
                container.innerHTML = '<p class="text-center">No servers found</p>';
                return;
            }

            container.innerHTML = `
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Server Name</th>
                                <th>Status</th>
                                <th>Coins Used</th>
                                <th>Expires</th>
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.servers.map(server => `
                                <tr>
                                    <td>${server.server_name}</td>
                                    <td>
                                        <span class="status-badge status-${server.status}">
                                            ${server.status}
                                        </span>
                                    </td>
                                    <td>${Utils.formatCoins(server.coins_used)}</td>
                                    <td>${server.expires_at ? Utils.formatDate(server.expires_at) : 'Never'}</td>
                                    <td>${Utils.formatDate(server.created_at)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            container.innerHTML = `<p class="text-error">Failed to load servers: ${error.message}</p>`;
        }
    }

    initEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                
                // Update active tab
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                // Show/hide content
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.add('hidden');
                });
                document.getElementById(`${tab}Tab`).classList.remove('hidden');
            });
        });

        // Refresh buttons
        document.querySelectorAll('.refresh-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const tab = btn.dataset.tab;
                const stopLoading = Utils.showLoading(btn);
                
                try {
                    if (tab === 'users') {
                        await this.loadUsers();
                    } else if (tab === 'servers') {
                        await this.loadServers();
                    } else if (tab === 'stats') {
                        await this.loadStats();
                    }
                } finally {
                    if (stopLoading) stopLoading();
                }
            });
        });

        // Export data buttons
        document.querySelectorAll('.export-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const type = btn.dataset.type;
                await this.exportData(type);
            });
        });
    }

    async exportData(type) {
        try {
            let data, filename;
            
            if (type === 'users') {
                const response = await Utils.apiRequest('/admin/users?limit=1000');
                data = response.users;
                filename = 'users_export.json';
            } else if (type === 'servers') {
                const response = await Utils.apiRequest('/admin/servers?limit=1000');
                data = response.servers;
                filename = 'servers_export.json';
            }
            
            // Create and download file
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            Utils.showAlert(`Exported ${data.length} records`, 'success');
            
        } catch (error) {
            Utils.showAlert('Failed to export data', 'error');
        }
    }
}

// Initialize admin
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('adminPage')) {
        window.admin = new AdminManager();
    }
});
