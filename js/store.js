import { db } from "./firebase-config.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let potions = {};
let satchel = [];
let settings = { location: '', categoryOrder: '' };
let selectedCategory = 'All';
let searchQuery = '';

const DISCORD_WEBHOOK_URL = "__DISCORD_WEBHOOK_URL__"; // Remember to replace this with your actual URL

window.showToast = (message, type = 'info') => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        container.setAttribute('popover', 'manual');
        document.body.appendChild(container);
    } else if (!container.hasAttribute('popover')) {
        container.setAttribute('popover', 'manual');
    }

    try {
        container.showPopover();
    } catch (e) {
        // Popover already active or unsupported
    }

    const toast = document.createElement('div');
    toast.className = `general-toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => {
            toast.remove();
            if (container.children.length === 0) {
                try { container.hidePopover(); } catch (e) {}
            }
        }, 300);
    }, 3000);
};

// Fetch dynamic settings
onValue(ref(db, 'settings'), (snapshot) => {
    settings = snapshot.val() || { location: 'the specified location', categoryOrder: '' };
    
    const locLabel = document.getElementById('location-label-text');
    if (locLabel) locLabel.innerText = settings.location || 'the specified location';

    renderCategoryChips();
    renderCatalog();
});

onValue(ref(db, 'potions'), (snapshot) => {
    potions = snapshot.val() || {};
    renderCategoryChips();
    renderCatalog();
});

window.handleStoreSearch = (query) => {
    searchQuery = query.trim().toLowerCase();
    renderCatalog();
};

window.setCategoryFilter = (cat) => {
    selectedCategory = cat;
    renderCategoryChips();
    renderCatalog();
};

function renderCategoryChips() {
    const container = document.getElementById('category-chips-container');
    if (!container) return;

    let categories = [...new Set(Object.values(potions).map(p => p.category || 'General'))];
    
    if (settings.categoryOrder) {
        const customOrder = settings.categoryOrder.split(',').map(s => s.trim().toLowerCase());
        categories.sort((a, b) => {
            const idxA = customOrder.indexOf(a.toLowerCase());
            const idxB = customOrder.indexOf(b.toLowerCase());
            if (idxA === -1 && idxB === -1) return a.localeCompare(b);
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        });
    } else {
        categories.sort();
    }

    const finalCategories = ['All', ...categories];
    
    container.innerHTML = finalCategories.map(cat => `
        <button class="filter-chip ${selectedCategory === cat ? 'btn-accent' : ''}" onclick="window.setCategoryFilter(${JSON.stringify(cat)})">
            ${cat}
        </button>
    `).join('');
}

function renderCatalog() {
    const catalogDiv = document.getElementById('catalog');
    if (!catalogDiv) return;

    let filtered = Object.values(potions).filter(p => !p.hidden);

    if (selectedCategory !== 'All') {
        filtered = filtered.filter(p => (p.category || 'General') === selectedCategory);
    }

    if (searchQuery) {
        filtered = filtered.filter(p => 
            (p.name || '').toLowerCase().includes(searchQuery) || 
            (p.description || '').toLowerCase().includes(searchQuery)
        );
    }

    // Sort by price: cheapest to most expensive
    filtered.sort((a, b) => (a.salePrice || 0) - (b.salePrice || 0));

    if (filtered.length === 0) {
        catalogDiv.innerHTML = `<p style="color: var(--text-dim); grid-column: 1/-1;">No potions match your search.</p>`;
        return;
    }

    catalogDiv.innerHTML = filtered.map(p => `
        <div class="card">
            <div>
                <div class="flex-between" style="margin-bottom: 0.35rem;">
                    <span style="font-size: 0.7rem; color: var(--accent); font-weight: bold; text-transform: uppercase;">${p.category || 'General'}</span>
                    <span style="font-family: var(--font-mono); font-weight: bold; color: var(--accent);">${Math.round(p.salePrice || 0)} Gold</span>
                </div>
                <h3 style="margin: 0.5rem 0; font-size: 1.25rem; color: #ffffff;">${p.name}</h3>
                <p style="color: #e6e2f2; font-size: 0.95rem; margin-bottom: 1rem; line-height: 1.4;">${p.description || 'Custom potion formula.'}</p>
            </div>
            <button class="btn-accent" style="width: 100%; margin-top: auto;" onclick="window.addToSatchel('${p.id}')">+ Add to Satchel</button>
        </div>
    `).join('');
}

window.addToSatchel = (potionId) => {
    const existing = satchel.find(item => item.potionId === potionId);
    if (existing) existing.qty += 1;
    else satchel.push({ potionId, qty: 1 });

    renderSatchel();

    const floatBtn = document.getElementById('floating-satchel');
    if (floatBtn) {
        floatBtn.classList.remove('satchel-bump');
        void floatBtn.offsetWidth; 
        floatBtn.classList.add('satchel-bump');
    }
};

window.updateSatchelQty = (index, qty) => {
    const parsedQty = parseInt(qty) || 0;
    if (parsedQty <= 0) satchel.splice(index, 1);
    else satchel[index].qty = parsedQty;
    renderSatchel();
};

window.removeSatchelItem = (index) => {
    satchel.splice(index, 1);
    renderSatchel();
};

function renderSatchel() {
    const countSpan = document.getElementById('satchel-count');
    const itemsDiv = document.getElementById('satchel-items');
    const totalDiv = document.getElementById('satchel-total');
    const floatBtn = document.getElementById('floating-satchel');

    const totalItems = satchel.reduce((sum, i) => sum + i.qty, 0);
    if (countSpan) countSpan.innerText = totalItems;

    if (floatBtn) {
        if (totalItems > 0) {
            floatBtn.classList.remove('hidden');
        } else {
            floatBtn.classList.add('hidden');
        }
    }

    if (satchel.length === 0) {
        if (itemsDiv) itemsDiv.innerHTML = `<p style="color: var(--text-dim); font-size: 0.825rem;">Satchel is empty.</p>`;
        if (totalDiv) totalDiv.innerText = '';
        return;
    }

    let totalPrice = 0;
    if (itemsDiv) {
        itemsDiv.innerHTML = satchel.map((item, index) => {
            const p = potions[item.potionId];
            if (!p) return '';
            const lineTotal = (p.salePrice || 0) * item.qty;
            totalPrice += lineTotal;

            return `
                <div class="card flex-between" style="flex-direction: row; padding: 0.4rem 0.65rem;">
                    <div style="flex: 1; padding-right: 0.5rem;">
                        <strong>${p.name}</strong>
                        <div style="font-size: 0.75rem; color: var(--text-dim);">${p.salePrice}g each</div>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <input type="number" value="${item.qty}" min="1" max="999" style="width: 70px; padding: 0.25rem 0.35rem; text-align: center;" onchange="window.updateSatchelQty(${index}, this.value)">
                        <span style="font-family: var(--font-mono); font-weight: bold; min-width: 60px; text-align: right;">${lineTotal.toFixed(1)}g</span>
                        <button class="btn-danger" style="padding: 0.15rem 0.35rem; font-size: 0.75rem;" onclick="window.removeSatchelItem(${index})">✕</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (totalDiv) totalDiv.innerText = `Total: ${totalPrice.toFixed(1)} Gold`;
}

window.submitSatchelOrder = async () => {
    const clientName = document.getElementById('order-client-name').value.trim();
    const clientDiscord = document.getElementById('order-client-discord').value.trim();
    const notes = document.getElementById('order-notes').value.trim();
    const confirmed = document.getElementById('order-location-confirm').checked;

    if (!clientName) return window.showToast("Character name required.", "error");
    if (!confirmed) return window.showToast("Confirm you are currently at the location.", "error");
    if (satchel.length === 0) return window.showToast("Satchel is empty.", "error");

    let totalCost = 0;
    let orderLines = [];

    satchel.forEach(item => {
        const p = potions[item.potionId];
        if (!p) return;
        const cost = (p.salePrice || 0) * item.qty;
        totalCost += cost;
        orderLines.push(`• **${item.qty}x ${p.name}** (${cost.toFixed(1)}g)`);
    });

    if (orderLines.length === 0) {
        return window.showToast("Could not construct order details from satchel items.", "error");
    }

    const payload = {
        embeds: [{
            title: "🧪 New Order",
            color: 11030007,
            fields: [
                { name: "Client", value: clientName, inline: true },
                { name: "Discord", value: clientDiscord || "N/A", inline: true },
                { name: "Order Details", value: orderLines.join('\n') },
                { name: "Total Cost", value: `${totalCost.toFixed(1)} Gold`, inline: true },
                { name: "Location", value: settings.location || "Not specified", inline: true },
                { name: "Notes", value: notes || "None" }
            ],
            timestamp: new Date().toISOString()
        }]
    };

    try {
        const res = await fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (res.ok || res.status === 204) {
            window.showToast("Order dispatched successfully!", "success");
            satchel = [];
            document.getElementById('order-client-name').value = '';
            document.getElementById('order-client-discord').value = '';
            document.getElementById('order-notes').value = '';
            document.getElementById('order-location-confirm').checked = false;
            renderSatchel();
            document.getElementById('satchel-modal').close();
        } else {
            const errorDetails = await res.text();
            window.showToast(`Discord API Error (${res.status}): ${errorDetails || 'Invalid Webhook URL'}`, "error");
        }
    } catch (e) {
        window.showToast("Network Error: " + e.message, "error");
    }
};