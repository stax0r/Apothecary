import { db } from "./firebase-config.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let potions = {};
let clientCart = [];
let customOrders = [];

// Initialize data listeners
onValue(ref(db, 'potions'), (snapshot) => {
    potions = snapshot.val() || {};
    renderCatalog();
});

window.addToCart = (id) => {
    const existing = clientCart.find(item => item.id === id);
    if (existing) existing.qty += 1;
    else clientCart.push({ id, qty: 1 });
    renderModals();
};

window.addToCustom = (id) => {
    const existing = customOrders.find(item => item.id === id);
    if (existing) existing.qty += 1;
    else customOrders.push({ id, qty: 1 });
    renderModals();
};

function renderCatalog() {
    const container = document.getElementById('catalog');
    container.innerHTML = Object.values(potions).map(p => `
        <div class="item-card">
            <h3>${p.name}</h3>
            <span style="font-family: var(--font-mono); color: var(--accent);">${p.salePrice || 0}g</span>
            <p class="text-dim" style="font-size: 0.85rem; flex-grow: 1;">${p.description || 'Standard brew.'}</p>
            <div style="display:flex; gap:0.5rem;">
                <button style="flex:1;" onclick="window.addToCart(${p.id})">Satchel</button>
                <button style="flex:1;" class="btn-primary" onclick="window.addToCustom(${p.id})">Order</button>
            </div>
        </div>
    `).join('');
}

function renderModals() {
    document.getElementById('satchel-count').innerText = clientCart.reduce((acc, item) => acc + item.qty, 0);
    document.getElementById('custom-count').innerText = customOrders.reduce((acc, item) => acc + item.qty, 0);

    const cartHtml = clientCart.map(item => {
        const p = potions[item.id];
        return `<div class="flex-between item-card"><span>${item.qty}x ${p.name}</span><span>${(p.salePrice * item.qty).toFixed(1)}g</span></div>`;
    }).join('');
    document.getElementById('cart-items').innerHTML = cartHtml || '<p class="text-dim">Satchel is empty.</p>';

    const customHtml = customOrders.map(item => {
        const p = potions[item.id];
        return `<div class="flex-between item-card"><span>${item.qty}x ${p.name}</span></div>`;
    }).join('');
    document.getElementById('custom-items').innerHTML = customHtml || '<p class="text-dim">No pending requests.</p>';
}

window.sendWebhookOrder = async () => {
    const name = document.getElementById('client-name').value;
    const msg = document.getElementById('client-message').value;
    if (!name || customOrders.length === 0) return alert("Name required and order cannot be empty.");

    const orderLines = customOrders.map(item => `• ${item.qty}x ${potions[item.id].name}`).join('\n');
    const webhookUrl = "YOUR_DISCORD_WEBHOOK_URL_HERE";

    const payload = {
        embeds: [{
            title: "🧪 New Custom Order",
            color: 3835647,
            fields: [
                { name: "Client", value: name, inline: true },
                { name: "Order", value: orderLines },
                { name: "Notes", value: msg || "None" }
            ]
        }]
    };

    try {
        await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        customOrders = [];
        document.getElementById('client-name').value = '';
        document.getElementById('client-message').value = '';
        renderModals();
        document.getElementById('custom-modal').close();
    } catch (e) {
        alert("Failed to trigger webhook.");
    }
};