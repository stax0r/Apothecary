import { db } from "./firebase-config.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let potions = {};
let satchel = []; // Local cart holding selected potions

const DISCORD_WEBHOOK_URL = "YOUR_DISCORD_WEBHOOK_URL_HERE";

onValue(ref(db, 'potions'), (snapshot) => {
    potions = snapshot.val() || {};
    renderCatalog();
});

window.addToSatchel = (potionId) => {
    const existing = satchel.find(item => item.potionId === potionId);
    if (existing) {
        existing.qty += 1;
    } else {
        satchel.push({ potionId, qty: 1 });
    }
    renderSatchel();
};

window.updateSatchelQty = (index, qty) => {
    const parsedQty = parseInt(qty) || 0;
    if (parsedQty <= 0) {
        satchel.splice(index, 1);
    } else {
        satchel[index].qty = parsedQty;
    }
    renderSatchel();
};

window.removeSatchelItem = (index) => {
    satchel.splice(index, 1);
    renderSatchel();
};

function renderCatalog() {
    const catalogDiv = document.getElementById('catalog');
    if (!catalogDiv) return;

    catalogDiv.innerHTML = Object.values(potions).map(p => `
        <div class="card">
            <div class="flex-between">
                <span style="font-size: 0.75rem; color: var(--accent); font-weight: bold; text-transform: uppercase;">${p.category || 'General'}</span>
                <span style="font-family: var(--font-mono); font-weight: bold; color: var(--accent);">${Math.round(p.salePrice || 0)} Gold</span>
            </div>
            <h3 style="margin: 0.25rem 0;">${p.name}</h3>
            <p style="color: var(--text-dim); font-size: 0.85rem; flex-grow: 1; margin: 0 0 1rem 0;">${p.description || 'Custom brew.'}</p>
            <button class="btn-accent" onclick="window.addToSatchel(${p.id})">Add to Satchel</button>
        </div>
    `).join('');
}

function renderSatchel() {
    const countSpan = document.getElementById('satchel-count');
    const itemsDiv = document.getElementById('satchel-items');
    const totalDiv = document.getElementById('satchel-total');

    const totalItems = satchel.reduce((sum, i) => sum + i.qty, 0);
    if (countSpan) countSpan.innerText = totalItems;

    if (satchel.length === 0) {
        itemsDiv.innerHTML = `<p style="color: var(--text-dim); font-size: 0.85rem;">Satchel is empty.</p>`;
        totalDiv.innerText = '';
        return;
    }

    let totalPrice = 0;
    itemsDiv.innerHTML = satchel.map((item, index) => {
        const p = potions[item.potionId];
        if (!p) return '';
        const lineTotal = (p.salePrice || 0) * item.qty;
        totalPrice += lineTotal;

        return `
            <div class="card flex-between" style="flex-direction: row; padding: 0.5rem 0.75rem;">
                <div>
                    <strong>${p.name}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-dim);">${p.salePrice}g each</div>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <input type="number" value="${item.qty}" min="1" style="width: 50px;" onchange="window.updateSatchelQty(${index}, this.value)">
                    <span style="font-family: var(--font-mono); font-weight: bold;">${lineTotal.toFixed(1)}g</span>
                    <button class="btn-danger" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;" onclick="window.removeSatchelItem(${index})">✕</button>
                </div>
            </div>
        `;
    }).join('');

    totalDiv.innerText = `Total: ${totalPrice.toFixed(1)} Gold`;
}

window.submitSatchelOrder = async () => {
    const clientName = document.getElementById('order-client-name').value.trim();
    const clientDiscord = document.getElementById('order-client-discord').value.trim();
    const notes = document.getElementById('order-notes').value.trim();
    const confirmed = document.getElementById('order-location-confirm').checked;

    if (!clientName) return alert("Please specify your character name.");
    if (!confirmed) return alert("Please confirm that you are currently at the delivery location.");
    if (satchel.length === 0) return alert("Your satchel is empty.");

    let totalCost = 0;
    let orderLines = [];

    satchel.forEach(item => {
        const p = potions[item.potionId];
        if (!p) return;
        const cost = (p.salePrice || 0) * item.qty;
        totalCost += cost;
        orderLines.push(`• **${item.qty}x ${p.name}** (${cost.toFixed(1)}g)`);
    });

    const payload = {
        embeds: [{
            title: "🧪 New Satchel Custom Order",
            color: 13938487,
            fields: [
                { name: "Client Character", value: clientName, inline: true },
                { name: "Discord Tag", value: clientDiscord || "N/A", inline: true },
                { name: "Order Items", value: orderLines.join('\n') },
                { name: "Total Estimated Cost", value: `${totalCost.toFixed(1)} Gold`, inline: true },
                { name: "Location / Notes", value: notes || "None" }
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
            alert("Order dispatched successfully!");
            satchel = [];
            document.getElementById('order-client-name').value = '';
            document.getElementById('order-client-discord').value = '';
            document.getElementById('order-notes').value = '';
            document.getElementById('order-location-confirm').checked = false;
            renderSatchel();
            document.getElementById('satchel-modal').close();
        } else {
            alert("Failed to send order to webhook.");
        }
    } catch (e) {
        alert("Error sending order: " + e.message);
    }
};