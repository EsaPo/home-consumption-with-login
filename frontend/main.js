// main.js
const API_BASE_URL = '';
let currentEditId = null;
let itemToDelete = null;
let deleteType = null;
let currentPage = 'properties';

// ── Auth helpers ──────────────────────────────────────────────────────────────
function getToken() {
    return localStorage.getItem('authToken');
}

function getUser() {
    try { return JSON.parse(localStorage.getItem('authUser')); } catch { return null; }
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    window.location.href = '/login.html';
}

// ── Auth guard: runs before anything else ─────────────────────────────────────
async function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login.html';
        return false;
    }
    try {
        const res = await fetch('/auth/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            logout();
            return false;
        }
        // Refresh user info (includes is_admin)
        const data = await res.json();
        if (data.user) {
            const stored = getUser() || {};
            localStorage.setItem('authUser', JSON.stringify({ ...stored, ...data.user }));
        }
        return true;
    } catch {
        // If server is unreachable, still allow app to load (offline-tolerant)
        return true;
    }
}

// ── Initialize the application ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
    const ok = await checkAuth();
    if (!ok) return;

    // Show logged-in user name in navbar
    const user = getUser();
    const userEl = document.getElementById('loggedInUser');
    if (userEl && user) userEl.textContent = user.name;

    property.loadProperties();
    setupFormSubmissions();

    // Set current year as default
    document.getElementById('heat_vuosi').value = new Date().getFullYear();
    document.getElementById('electricity_vuosi').value = new Date().getFullYear();
    document.getElementById('water_vuosi').value = new Date().getFullYear();
});

// Navigation
function showPage(pageName, event) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    const selectedPage = document.getElementById(pageName + 'Page');
    if (selectedPage) {
        selectedPage.classList.add('active');
    } else {
        console.error(`Error: Page element with ID '${pageName}Page' not found.`);
    }

    if (event && event.target) {
        event.target.classList.add('active');
    }

    currentPage = pageName;

    if (pageName === 'properties') {
        property.loadProperties();
    } else if (pageName === 'heat') {
        heat.loadHeatData();
        heat.loadPropertiesForSelect();
    } else if (pageName === 'electricity') {
        electricity.loadElectricityData();
        electricity.loadPropertiesForSelect();
    } else if (pageName === 'water') {
        water.loadWaterData();
        water.loadPropertiesForSelect();
    } else if (pageName === 'settings') {
        loadSettingsProfile();
        loadEmailSettings();
    } else if (pageName === 'instructions') {
        loadInstructions();
    } else if (pageName === 'about') {
        loadAbout();
    }
}

// FORM SUBMISSIONS
function setupFormSubmissions() {
    document.getElementById('propertyForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        await property.handlePropertyFormSubmit();
    });
    document.getElementById('heatForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        await heat.handleHeatFormSubmit();
    });
    document.getElementById('electricityForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        await electricity.handleElectricityFormSubmit();
    });
    document.getElementById('waterForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        await water.handleWaterFormSubmit();
    });
}

// DELETE MODAL
function showDeleteModal(type, id, description) {
    deleteType = type;
    itemToDelete = id;

    const modal   = document.getElementById('deleteModal');
    const message = document.getElementById('deleteMessage');
    const info    = document.getElementById('deleteItemInfo');

    if (!modal || !message || !info) { console.error('Error: Delete modal elements not found.'); return; }

    if (type === 'property') {
        message.textContent = 'Are you sure you want to delete this property?';
        info.innerHTML = `<strong>Property:</strong> ${description}<br><strong>ID:</strong> ${id}`;
    } else if (type === 'heat') {
        message.textContent = 'Are you sure you want to delete this heat reading?';
        info.innerHTML = `<strong>Reading:</strong> ${description}`;
    } else if (type === 'electricity') {
        message.textContent = 'Are you sure you want to delete this electricity reading?';
        info.innerHTML = `<strong>Reading:</strong> ${description}`;
    } else if (type === 'water') {
        message.textContent = 'Are you sure you want to delete this water reading?';
        info.innerHTML = `<strong>Reading:</strong> ${description}`;
    }
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('show'), 10);
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            itemToDelete = null;
            deleteType = null;
        }, 300);
    }
}

async function confirmDelete() {
    if (!itemToDelete || !deleteType) return;

    try {
        const endpoint = deleteType === 'property' ? 'property' :
                         deleteType === 'heat'     ? 'heat' :
                         deleteType === 'electricity' ? 'electricity' : 'water';

        const response = await fetch(`${API_BASE_URL}/${endpoint}/${itemToDelete}`, {
            method: 'DELETE',
            headers: authHeaders()
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) { logout(); return; }
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to delete ${deleteType}`);
        }

        const successMessage = deleteType === 'property'    ? 'Property' :
                               deleteType === 'heat'        ? 'Heat reading' :
                               deleteType === 'electricity' ? 'Electricity reading' :
                               'Water reading';

        showSuccess(`${successMessage} deleted successfully!`);
        closeDeleteModal();

        if (deleteType === 'property')    property.loadProperties();
        else if (deleteType === 'heat')         heat.loadHeatData();
        else if (deleteType === 'electricity')  electricity.loadElectricityData();
        else if (deleteType === 'water')        water.loadWaterData();

    } catch (error) {
        console.error(`Error deleting ${deleteType}:`, error);
        showError(error.message);
    }
}

// UTILITY FUNCTIONS
function showPropertiesLoading() {
    document.getElementById('propertiesLoadingMessage')?.classList.remove('hidden');
    document.getElementById('propertiesTable')?.classList.add('hidden');
}
function hidePropertiesLoading() {
    document.getElementById('propertiesLoadingMessage')?.classList.add('hidden');
}
function showHeatLoading() {
    document.getElementById('heatLoadingMessage')?.classList.remove('hidden');
    document.getElementById('heatTable')?.classList.add('hidden');
}
function hideHeatLoading() {
    document.getElementById('heatLoadingMessage')?.classList.add('hidden');
}
function showElectricityLoading() {
    document.getElementById('electricityLoadingMessage')?.classList.remove('hidden');
    document.getElementById('electricityTable')?.classList.add('hidden');
}
function hideElectricityLoading() {
    document.getElementById('electricityLoadingMessage')?.classList.add('hidden');
}
function showWaterLoading() {
    document.getElementById('waterLoadingMessage')?.classList.remove('hidden');
    document.getElementById('waterTable')?.classList.add('hidden');
}
function hideWaterLoading() {
    document.getElementById('waterLoadingMessage')?.classList.add('hidden');
}

function showError(message) {
    const container = document.getElementById('messageContainer');
    if (container) {
        container.innerHTML = `<div class="error">❌ ${message}</div>`;
        setTimeout(() => container.innerHTML = '', 5000);
    }
}
function showSuccess(message) {
    const container = document.getElementById('messageContainer');
    if (container) {
        container.innerHTML = `<div class="success">✅ ${message}</div>`;
        setTimeout(() => container.innerHTML = '', 3000);
    }
}

window.onclick = function(event) {
    const modal = document.getElementById('deleteModal');
    if (modal && event.target === modal) closeDeleteModal();
};

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Load instructions from markdown file ─────────────────────────────────────
async function loadInstructions() {
    const container = document.getElementById('instructionsContent');
    if (!container) return;
    try {
        const res  = await fetch('/api/instructions', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
        });
        const data = await res.json();
        // Simple markdown to HTML converter
        let html = data.content
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            // Headers
            .replace(/^### (.+)$/gm, '<h3 style="margin:1.2rem 0 0.5rem;color:var(--text)">$1</h3>')
            .replace(/^## (.+)$/gm,  '<h2 style="margin:1.5rem 0 0.6rem;color:var(--text);font-size:1.15rem">$1</h2>')
            .replace(/^# (.+)$/gm,   '<h1 style="margin:0 0 1rem;color:var(--text);font-size:1.4rem">$1</h1>')
            // Bold
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            // Code blocks
            .replace(/```[\s\S]*?```/g, m => '<pre style="background:var(--surface-2);padding:0.75rem 1rem;border-radius:6px;font-family:monospace;font-size:0.85rem;overflow-x:auto;margin:0.5rem 0">' + m.replace(/```\w*\n?/g, '').replace(/```/g, '') + '</pre>')
            // Inline code
            .replace(/`(.+?)`/g, '<code style="background:var(--surface-2);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:0.88rem">$1</code>')
            // Horizontal rule
            .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:1.5rem 0">')
            // List items
            .replace(/^- (.+)$/gm, '<li style="margin:0.3rem 0">$1</li>')
            .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => '<ul style="padding-left:1.5rem;margin:0.5rem 0">' + m + '</ul>')
            // Paragraphs
            .replace(/^(?!<[huplc]).+$/gm, m => m.trim() ? '<p style="margin:0.5rem 0">' + m + '</p>' : '')
            // Italic
            .replace(/\*(.+?)\*/g, '<em>$1</em>');

        container.innerHTML = html;
    } catch {
        container.innerHTML = '<p style="color:var(--error)">Ohjeiden lataus epäonnistui.</p>';
    }
}

// ── Load about page info ──────────────────────────────────────────────────────
function loadAbout() {
    const el = document.getElementById('aboutServerInfo');
    if (el) {
        const user = getUser();
        el.textContent = user ? user.name : '-';
    }
}
