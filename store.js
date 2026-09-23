// store.js
import { auth, db } from "./firebase-config.js";
import { ref, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const storeThemes = ['noble', 'parchment', 'dark', 'herbal'];
const savedTheme = localStorage.getItem('silas-brews-theme');
document.body.dataset.theme = storeThemes.includes(savedTheme) ? savedTheme : 'noble';

window.setStoreTheme = (theme) => {
    if (!storeThemes.includes(theme)) return;
    document.body.dataset.theme = theme;
    localStorage.setItem('silas-brews-theme', theme);
};

function showBanner(message, type = 'success') {
    const banner = document.getElementById('status-banner');
    if (!banner) return;
    banner.className = '';
    banner.textContent = message;
    banner.classList.add('show', type);
    setTimeout(() => {
        banner.classList.remove('show');
    }, 3000);
}

let ingredients = {};
let potions = {};
let categoryOrders = {};
let locations = {};
let activeLocationId = "";
let selectedCategory = 'All';
let catalogSearchQuery = '';
let clientCart = [];
let customOrders = [];

let customInputState = {
    name: "",
    discord: "",
    message: "",
    atLocationChecked: false
};

// Listeners
onValue(ref(db, 'ingredients'), (snapshot) => {
    ingredients = snapshot.val() || {};
    window.render();
});

onValue(ref(db, 'potions'), (snapshot) => {
    potions = snapshot.val() || {};
    window.render();
});

onValue(ref(db, 'categoryOrders'), (snapshot) => {
    categoryOrders = snapshot.val() || {};
    window.render();
});

onValue(ref(db, 'locations'), (snapshot) => {
    locations = snapshot.val() || {};
    window.renderCustomOrders();
});

onValue(ref(db, 'activeLocationId'), (snapshot) => {
    activeLocationId = snapshot.val() || "";
    window.renderCustomOrders();
});

window.toggleSection = (wrapperId, btnId) => {
    const wrapper = document.getElementById(wrapperId);
    const btn = document.getElementById(btnId);
    if (wrapper && btn) {
        const isHidden = wrapper.classList.toggle('hidden');
        btn.innerText = isHidden ? 'Show ▼' : 'Hide ▲';
    }
};

window.setCategoryFilter = (cat) => {
    selectedCategory = cat;
    window.render();
};

window.handleCatalogSearch = (val) => {
    catalogSearchQuery = val.trim().toLowerCase();
    window.renderCatalogOnly();
};

window.addToCart = (potionId) => {
    const p = potions[potionId];
    if (!p) return;
    const maxQty = p.stockQty !== undefined ? p.stockQty : 0;
    if (maxQty <= 0 || p.forceOut) return;

    const addAmount = p.bulkOnly ? 10 : 1;
    if (maxQty < addAmount) return;

    const existing = clientCart.find(item => item.potionId === potionId);
    if (existing) {
        const nextQty = existing.qty + addAmount;
        if (nextQty <= maxQty) existing.qty = nextQty;
    } else {
        clientCart.push({ potionId, qty: addAmount });
    }
    window.renderCart();
};

window.updateCartQty = (index, newQty) => {
    const item = clientCart[index];
    if (!item) return;
    const p = potions[item.potionId];
    const maxQty = p && p.stockQty !== undefined ? p.stockQty : 0;
    let qty = parseInt(newQty) || 0;

    if (p && p.bulkOnly) {
        if (qty < 10) {
            clientCart.splice(index, 1);
        } else {
            qty = Math.floor(qty / 10) * 10;
            clientCart[index].qty = Math.min(qty, maxQty);
        }
    } else {
        if (qty <= 0 || (p && p.forceOut)) clientCart.splice(index, 1);
        else clientCart[index].qty = Math.min(qty, maxQty);
    }
    window.renderCart();
};

window.removeFromCart = (index) => {
    clientCart.splice(index, 1);
    window.renderCart();
};

window.clearCart = () => { 
    clientCart = []; 
    window.renderCart(); 
};

window.renderCart = () => {
    const listDiv = document.getElementById('cart-items-list');
    const summaryDiv = document.getElementById('cart-summary-area');
    if (!listDiv || !summaryDiv) return;

    if (clientCart.length === 0) {
        listDiv.innerHTML = `<p style="color: var(--text-dim); font-size: 0.85rem; margin: 0;">Your satchel is empty. Select available potions from the catalog below.</p>`;
        summaryDiv.innerHTML = '';
        return;
    }

    let totalCost = 0, totalItems = 0;
    listDiv.innerHTML = clientCart.map((item, index) => {
        const p = potions[item.potionId];
        if (!p) return '';
        const maxQty = p.stockQty !== undefined ? p.stockQty : 0;
        const lineTotal = (p.salePrice || 0) * item.qty;
        totalCost += lineTotal;
        totalItems += item.qty;

        return `
            <div class="item-row">
                <span><strong>${p.name}</strong> (${p.salePrice}g each) ${p.bulkOnly ? '<span style="color:var(--custom-order); font-size:0.75rem;">(10x Bulk)</span>' : ''}</span>
                <div>
                    <input type="number" value="${item.qty}" min="${p.bulkOnly ? 10 : 1}" step="${p.bulkOnly ? 10 : 1}" max="${maxQty}" style="width: 70px;" onchange="window.updateCartQty(${index}, this.value)">
                    <span style="color: var(--gold); font-weight: bold; margin: 0 8px;">${lineTotal.toFixed(2)}g</span>
                    <button class="delete-btn" onclick="window.removeFromCart(${index})">X</button>
                </div>
            </div>
        `;
    }).join('');

    summaryDiv.innerHTML = `
        <div class="cart-summary">
            <span>Total Items: <strong>${totalItems}</strong></span>
            <span style="font-size: 1.1rem;">Total Price: <strong style="color: var(--gold);">${totalCost.toFixed(2)} Gold</strong></span>
        </div>
    `;
};

window.addCustomOrder = (potionId) => {
    const p = potions[potionId];
    const addQty = p && p.bulkOnly ? 10 : 1;
    const existing = customOrders.find(item => item.potionId === potionId);
    if (existing) existing.qty += addQty;
    else customOrders.push({ potionId, qty: addQty });
    window.renderCustomOrders();
};

window.updateCustomQty = (index, newQty) => {
    const item = customOrders[index];
    const p = item ? potions[item.potionId] : null;
    let qty = parseInt(newQty) || 0;
    
    if (p && p.bulkOnly) {
        if (qty < 10) customOrders.splice(index, 1);
        else {
            qty = Math.floor(qty / 10) * 10;
            customOrders[index].qty = qty;
        }
    } else {
        if (qty <= 0) customOrders.splice(index, 1);
        else customOrders[index].qty = qty;
    }
    window.renderCustomOrders();
};

window.removeCustomOrder = (index) => {
    customOrders.splice(index, 1);
    window.renderCustomOrders();
};

window.clearCustomOrders = () => {
    customOrders = [];
    window.renderCustomOrders();
};

window.updateCustomInputState = () => {
    const nameInput = document.getElementById("custom-order-name");
    const discordInput = document.getElementById("custom-order-discord");
    const messageInput = document.getElementById("custom-order-message");
    const checkInput = document.getElementById("custom-order-at-location-check");

    if (nameInput) customInputState.name = nameInput.value;
    if (discordInput) customInputState.discord = discordInput.value;
    if (messageInput) customInputState.message = messageInput.value;
    if (checkInput) customInputState.atLocationChecked = checkInput.checked;
};

const DISCORD_WEBHOOK_URL = "YOUR_DISCORD_WEBHOOK_URL_HERE";

window.sendDiscordWebhookOrder = async () => {
    window.updateCustomInputState();
    
    const clientName = customInputState.name.trim();
    const clientDiscord = customInputState.discord.trim();
    const clientMessage = customInputState.message.trim();
    const isAtLocation = customInputState.atLocationChecked;

    if (!clientName) {
        showBanner("Please enter your name.", 'error');
        return;
    }

    if (!isAtLocation) {
        showBanner("You must confirm that you're currently at location before sending the order.", 'error');
        return;
    }

    if (customOrders.length === 0) {
        showBanner("Your custom order is empty. Please add items before sending.", 'error');
        return;
    }

    if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.includes("YOUR_DISCORD_WEBHOOK_URL_HERE")) {
        showBanner("Webhook URL is missing! Please configure DISCORD_WEBHOOK_URL in store.js.", 'error');
        return;
    }

    let totalCost = 0;
    let orderLines = [];

    customOrders.forEach(item => {
        const p = potions[item.potionId];
        if (!p) return;
        const lineTotal = (p.salePrice || 0) * item.qty;
        totalCost += lineTotal;
        orderLines.push(`• **${item.qty}x ${p.name}** (${lineTotal.toFixed(2)}g)`);
    });

    const activeLocObj = locations[activeLocationId];
    const activeLocationName = activeLocObj ? activeLocObj.name : "Not specified";

    const payload = {
        embeds: [
            {
                title: "🧪 New Order",
                color: 3835647,
                fields: [
                    { name: "Client Name", value: clientName, inline: true },
                    { name: "Discord Contact", value: clientDiscord || "N/A", inline: true },
                    { name: "Delivery Location", value: activeLocationName, inline: true },
                    { name: "Order Details", value: orderLines.join('\n') || "None" },
                    { name: "Estimated Total", value: `${totalCost.toFixed(2)} Gold`, inline: true },
                    { name: "Instructions / Notes", value: clientMessage || "None" }
                ],
                timestamp: new Date().toISOString()
            }
        ]
    };

    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (response.ok || response.status === 204) {
            showBanner("Order successfully sent!");
            customOrders = [];
            customInputState = { name: "", discord: "", message: "", atLocationChecked: false };
            window.renderCustomOrders();
        } else {
            const errorText = await response.text();
            showBanner("Failed to send order! " + errorText, 'error');
        }
    } catch (err) {
        showBanner("Error sending order: " + err.message, 'error');
    }
};

window.renderCustomOrders = () => {
    window.updateCustomInputState();

    const listDiv = document.getElementById('custom-items-list');
    const summaryDiv = document.getElementById('custom-summary-area');
    if (!listDiv || !summaryDiv) return;

    if (customOrders.length === 0) {
        listDiv.innerHTML = `<p style="color: var(--text-dim); font-size: 0.85rem; margin: 0;">No custom requests requested. Add items below to request a fresh batch.</p>`;
        summaryDiv.innerHTML = '';
        return;
    }

    let totalCost = 0, totalItems = 0;
    listDiv.innerHTML = customOrders.map((item, index) => {
        const p = potions[item.potionId];
        if (!p) return '';
        const lineTotal = (p.salePrice || 0) * item.qty;
        totalCost += lineTotal;
        totalItems += item.qty;

        return `
            <div class="item-row">
                <span><strong>${p.name}</strong> ${p.bulkOnly ? '<span style="color:var(--custom-order); font-size:0.75rem;">(10x Bulk)</span>' : ''}</span>
                <div>
                    <input type="number" value="${item.qty}" min="${p.bulkOnly ? 10 : 1}" step="${p.bulkOnly ? 10 : 1}" style="width: 70px;" onchange="window.updateCustomQty(${index}, this.value)">
                    <span style="color: var(--gold); font-weight: bold; margin: 0 8px;">${lineTotal.toFixed(2)}g</span>
                    <button class="delete-btn" onclick="window.removeCustomOrder(${index})">X</button>
                </div>
            </div>
        `;
    }).join('');

    const activeLocObj = locations[activeLocationId];
    const activeLocationName = activeLocObj ? activeLocObj.name : "Not specified";

    summaryDiv.innerHTML = `
        <div class="cart-summary">
            <span>Total Custom Requests: <strong>${totalItems}</strong></span>
            <span style="font-size: 1.1rem;">Estimated Cost: <strong style="color: var(--gold);">${totalCost.toFixed(2)} Gold</strong></span>
        </div>
        <div class="dispatch-box">
            <p style="color: var(--warning); margin-bottom: 10px;">⚠️ OOC: You should keep proof of being at <strong>${activeLocationName}</strong> before creating an order to avoid being banned for metagaming.⚠️</p>
            <div class="form-group" style="margin-bottom: 10px;">
                <input type="text" id="custom-order-name" placeholder="Name (Required)" value="${customInputState.name}" style="flex: 1;" oninput="window.updateCustomInputState()">
                <input type="text" id="custom-order-discord" placeholder="Discord ID (Optional)" value="${customInputState.discord}" style="flex: 1;" oninput="window.updateCustomInputState()">
            </div>
            <div class="form-group" style="margin-bottom: 10px;">
                <textarea id="custom-order-message" placeholder="Delivery instructions and any other inquiries..." style="width: 100%; min-height: 80px;" oninput="window.updateCustomInputState()">${customInputState.message}</textarea>
            </div>
            <div class="form-group" style="margin-bottom: 15px; align-items: center;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text);">
                    <input type="checkbox" id="custom-order-at-location-check" ${customInputState.atLocationChecked ? 'checked' : ''} style="width: 18px; height: 18px;" onchange="window.updateCustomInputState()">
                    <span style="font-size: 0.9rem;">I confirm that I'm currently at <strong>${activeLocationName}</strong></span>
                </label>
            </div>
            <button onclick="window.sendDiscordWebhookOrder()" style="width: 100%; font-size: 0.9rem; background: var(--custom-order);">Create new order</button>
        </div>
    `;
};

function calculatePotionCost(recipe) {
    if (!recipe) return 0;
    return recipe.reduce((total, item) => {
        const ing = ingredients[item.ingredientId];
        return total + (ing ? ing.price * item.qty : 0);
    }, 0);
}

window.renderCatalogOnly = () => {
    const catalog = document.getElementById('catalog');
    const filterBar = document.getElementById('filter-bar');
    if (!catalog || !filterBar) return;

    const potionArray = Object.values(potions);
    let categories = [...new Set(potionArray.map(p => p.category || 'General'))];

    categories.sort((a, b) => {
        const orderA = categoryOrders[a] !== undefined ? categoryOrders[a] : 999;
        const orderB = categoryOrders[b] !== undefined ? categoryOrders[b] : 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
    });

    let filterHtml = `<button class="filter-btn ${selectedCategory === 'All' ? 'active' : ''}" onclick="window.setCategoryFilter('All')">All</button>`;
    categories.forEach(cat => {
        filterHtml += `<button class="filter-btn ${selectedCategory === cat ? 'active' : ''}" onclick="window.setCategoryFilter('${cat.replace(/'/g, "\\'")}')">${cat}</button>`;
    });
    filterHtml += `<input type="text" id="catalog-search-input" placeholder="Search catalog..." value="${catalogSearchQuery}" style="margin-left: auto; width: 180px; padding: 5px 8px; font-size: 0.85rem;" oninput="window.handleCatalogSearch(this.value)">`;
    filterBar.innerHTML = filterHtml;

    let filtered = potionArray.filter(p => p.inShop !== false);

    if (selectedCategory !== 'All') {
        filtered = filtered.filter(p => (p.category || 'General') === selectedCategory);
    }

    if (catalogSearchQuery) {
        filtered = filtered.filter(p => 
            (p.name || '').toLowerCase().includes(catalogSearchQuery) || 
            (p.description || '').toLowerCase().includes(catalogSearchQuery)
        );
    }

    filtered.sort((a, b) => (a.salePrice || 0) - (b.salePrice || 0));

    if (filtered.length === 0) {
        catalog.innerHTML = `<p style="color: var(--text-dim); grid-column: 1 / -1;">No potions found matching current filters.</p>`;
    } else {
        catalog.innerHTML = filtered.map(p => {
            const stockQty = p.stockQty !== undefined ? p.stockQty : 0;
            const forceOut = p.forceOut === true;
            const isOutOfStock = stockQty <= 0 || forceOut;
            const displayPrice = Math.round(p.salePrice || 0);

            let recipeItemsHtml = '';
            if (p.recipe && Array.isArray(p.recipe) && p.recipe.length > 0) {
                recipeItemsHtml = `<ul class="ingredient-list">` + 
                    p.recipe.map(r => `<li>• ${r.qty}x ${r.name}</li>`).join('') + 
                `</ul>`;
            } else {
                recipeItemsHtml = `<div class="potion-desc">Found Potion (No Recipe Required)</div>`;
            }

            return `
                <div class="potion-card ${isOutOfStock ? 'out-of-stock' : ''}">
                    <div>
                        <div class="card-top-actions">
                            <span class="category-tag">${p.category || 'General'}</span>
                            ${isOutOfStock ? `<span class="badge-out">Out of Stock</span>` : `<span class="stock-tag">In Stock: ${stockQty}</span>`}
                        </div>
                        <h3>${p.name}</h3>
                        ${p.bulkOnly ? '<span style="color:var(--custom-order); font-size:0.75rem; font-weight:bold;">(Sold in 10x Bulk Packs)</span>' : ''}
                        <div class="potion-price">${displayPrice} Gold</div>
                        <div class="potion-desc">${p.description || ''}</div>
                        ${recipeItemsHtml}
                    </div>
                    <div>
                        <div class="action-btn-group">
                            <button class="add-cart-btn ${isOutOfStock ? 'btn-disabled' : ''}" ${isOutOfStock ? 'disabled' : ''} onclick="window.addToCart(${p.id})">Add to Satchel</button>
                            <button class="custom-order-btn" onclick="window.addCustomOrder(${p.id})">Custom Order</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
};

window.render = () => {
    window.renderCatalogOnly();
    window.renderCart();
    window.renderCustomOrders();
};