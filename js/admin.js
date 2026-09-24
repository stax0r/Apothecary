import { auth, db } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let ingredients = {};
let potions = {};

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-modal').close();
        document.getElementById('admin-dashboard').style.display = 'block';
    } else {
        document.getElementById('admin-dashboard').style.display = 'none';
        document.getElementById('login-modal').showModal();
    }
});

onValue(ref(db, 'ingredients'), (snapshot) => {
    ingredients = snapshot.val() || {};
    renderInventory();
});

onValue(ref(db, 'potions'), (snapshot) => {
    potions = snapshot.val() || {};
    renderCatalog();
    populateBatchSelect();
});

window.login = () => {
    const e = document.getElementById('login-email').value;
    const p = document.getElementById('login-password').value;
    signInWithEmailAndPassword(auth, e, p).catch(err => alert(err.message));
};

window.logout = () => signOut(auth);

window.addIngredient = () => {
    const name = document.getElementById('new-ing-name').value;
    const price = parseFloat(document.getElementById('new-ing-price').value) || 0;
    const stock = parseInt(document.getElementById('new-ing-stock').value) || 0;
    const threshold = parseInt(document.getElementById('new-ing-alert').value) || 0;
    
    if (!name) return;
    const id = Date.now();
    set(ref(db, `ingredients/${id}`), { id, name, price, stockQty: stock, threshold });
};

// INGREDIENT WARNING SYSTEM IMPLEMENTATION
function renderInventory() {
    const container = document.getElementById('admin-inventory-list');
    container.innerHTML = Object.values(ingredients).sort((a,b) => a.name.localeCompare(b.name)).map(i => {
        
        // Logical checks for warnings
        const missingPrice = (!i.price || i.price <= 0);
        const lowStock = (i.stockQty <= (i.threshold || 0));
        
        // Generate Warning Badges
        let warnings = '';
        if (missingPrice) warnings += `<span class="badge badge-warning">⚠️ No Price</span> `;
        if (lowStock) warnings += `<span class="badge badge-danger">📉 Low Stock</span>`;

        return `
            <div class="item-card flex-between" style="flex-direction:row;">
                <div>
                    <strong>${i.name}</strong> <span style="font-family: var(--font-mono); font-size:0.8rem;">(${i.price}g)</span>
                    <div style="margin-top: 4px;">${warnings}</div>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span class="text-dim">Stock:</span>
                    <input type="number" value="${i.stockQty}" style="width: 60px;" 
                           onchange="update(ref(db, 'ingredients/${i.id}'), {stockQty: parseInt(this.value)})">
                </div>
            </div>
        `;
    }).join('');
}

function renderCatalog() {
    document.getElementById('admin-potion-list').innerHTML = Object.values(potions).map(p => `
        <div class="item-card flex-between" style="flex-direction:row;">
            <span><strong>${p.name}</strong> (${p.salePrice}g)</span>
            <span>Stock: ${p.stockQty || 0}</span>
        </div>
    `).join('');
}

function populateBatchSelect() {
    document.getElementById('batch-select').innerHTML = Object.values(potions)
        .map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

// BATCH CALCULATOR
window.calculateBatch = () => {
    const potionId = document.getElementById('batch-select').value;
    const qty = parseInt(document.getElementById('batch-qty').value) || 1;
    const p = potions[potionId];
    if (!p || !p.recipe) return document.getElementById('batch-results').innerText = "No recipe data found.";

    let totalCost = 0;
    let breakdown = `Batching ${qty}x ${p.name}:\n\n`;

    p.recipe.forEach(r => {
        const ing = ingredients[r.ingredientId];
        const reqTotal = r.qty * qty;
        const unitPrice = ing && ing.price ? ing.price : 0;
        const lineCost = reqTotal * unitPrice;
        
        totalCost += lineCost;
        breakdown += `- ${reqTotal}x ${r.name} @ ${unitPrice}g ea = ${lineCost}g\n`;
        if (!ing || !ing.price) breakdown += `  [!] WARNING: Price missing for ${r.name}\n`;
    });

    breakdown += `\n-----------------------\nTotal Material Cost: ${totalCost}g`;
    document.getElementById('batch-results').innerText = breakdown;
};