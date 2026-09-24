import { auth, db } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let ingredients = {};
let potions = {};
let currentRecipe = [];

onAuthStateChanged(auth, (user) => {
    const modal = document.getElementById('login-modal');
    const dashboard = document.getElementById('admin-dashboard');
    if (user) {
        if (modal) modal.close();
        if (dashboard) dashboard.style.display = 'block';
    } else {
        if (dashboard) dashboard.style.display = 'none';
        if (modal) modal.showModal();
    }
});

onValue(ref(db, 'ingredients'), (snapshot) => {
    ingredients = snapshot.val() || {};
    renderIngredients();
    renderRecipeSelectOptions();
});

onValue(ref(db, 'potions'), (snapshot) => {
    potions = snapshot.val() || {};
    renderPotions();
    renderBatchPotionSelectOptions();
});

window.login = () => {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(err => alert(err.message));
};

window.logout = () => signOut(auth);

// --- INGREDIENT MANAGEMENT WITH WARNING ALERTS ---
window.addIngredient = () => {
    const name = document.getElementById('ing-name').value.trim();
    const price = parseFloat(document.getElementById('ing-price').value) || 0;
    const stock = parseInt(document.getElementById('ing-stock').value) || 0;
    const threshold = parseInt(document.getElementById('ing-alert').value) || 0;

    if (!name) return alert("Ingredient name required.");

    const id = Date.now();
    set(ref(db, `ingredients/${id}`), { id, name, price, stockQty: stock, threshold });

    document.getElementById('ing-name').value = '';
    document.getElementById('ing-price').value = '';
    document.getElementById('ing-stock').value = '';
    document.getElementById('ing-alert').value = '';
};

function renderIngredients() {
    const listDiv = document.getElementById('ingredient-list');
    if (!listDiv) return;

    listDiv.innerHTML = Object.values(ingredients).sort((a,b) => a.name.localeCompare(b.name)).map(i => {
        // Warning Conditions
        const noPrice = (!i.price || i.price <= 0);
        const lowStock = (i.stockQty <= (i.threshold || 0));

        let warningBadges = '';
        if (noPrice) warningBadges += `<span class="badge badge-warning">⚠️ No Price</span> `;
        if (lowStock) warningBadges += `<span class="badge badge-danger">📉 Low Stock</span>`;

        return `
            <div class="card flex-between" style="flex-direction: row; align-items: center;">
                <div>
                    <strong>${i.name}</strong> 
                    <span style="color: var(--text-dim); font-size: 0.8rem;">(${i.price || 0}g / unit)</span>
                    <div style="margin-top: 0.2rem;">${warningBadges}</div>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <span style="font-size: 0.8rem; color: var(--text-dim);">Stock:</span>
                    <input type="number" value="${i.stockQty || 0}" style="width: 60px;" onchange="update(ref(db, 'ingredients/${i.id}'), { stockQty: parseInt(this.value) || 0 })">
                    <button class="btn-danger" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;" onclick="remove(ref(db, 'ingredients/${i.id}'))">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

// --- BULK BATCH CALCULATOR ---
function renderBatchPotionSelectOptions() {
    const select = document.getElementById('batch-potion-select');
    if (select) {
        select.innerHTML = Object.values(potions).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }
}

window.calculateBatch = () => {
    const potionId = document.getElementById('batch-potion-select').value;
    const qty = parseInt(document.getElementById('batch-qty').value) || 1;
    const resultsDiv = document.getElementById('batch-results');
    const p = potions[potionId];

    if (!p || !p.recipe || p.recipe.length === 0) {
        resultsDiv.innerText = "No recipe defined for this potion.";
        return;
    }

    let totalCraftCost = 0;
    let report = `Batching ${qty}x ${p.name}\n==============================\n`;

    p.recipe.forEach(r => {
        const ing = ingredients[r.ingredientId];
        const needed = r.qty * qty;
        const unitPrice = ing ? (ing.price || 0) : 0;
        const lineCost = needed * unitPrice;
        totalCraftCost += lineCost;

        report += `• ${r.name}: ${needed} required (${unitPrice}g/unit) = ${lineCost.toFixed(2)}g\n`;
        if (!ing || !ing.price) {
            report += `   [!] WARNING: Price not registered for ${r.name}!\n`;
        }
        if (ing && ing.stockQty < needed) {
            report += `   [!] WARNING: Insufficient Stock! Need ${needed}, Have ${ing.stockQty}\n`;
        }
    });

    report += `==============================\nTotal Required Material Value: ${totalCraftCost.toFixed(2)} Gold`;
    resultsDiv.innerText = report;
};

// --- POTION RECIPE MANAGEMENT ---
function renderRecipeSelectOptions() {
    const select = document.getElementById('recipe-ing-select');
    if (select) {
        select.innerHTML = Object.values(ingredients).map(i => `<option value="${i.id}">${i.name} (${i.price || 0}g)</option>`).join('');
    }
}

window.addIngredientToRecipe = () => {
    const ingId = document.getElementById('recipe-ing-select').value;
    const qty = parseInt(document.getElementById('recipe-ing-qty').value) || 1;
    const ing = ingredients[ingId];

    if (ing) {
        currentRecipe.push({ ingredientId: ing.id, name: ing.name, qty });
        renderRecipePreview();
    }
};

function renderRecipePreview() {
    const previewUl = document.getElementById('recipe-preview');
    if (previewUl) {
        previewUl.innerHTML = currentRecipe.map((item, index) => `
            <li>${item.qty}x ${item.name} <button class="btn-danger" style="padding: 0 0.3rem; font-size:0.7rem;" onclick="window.removeRecipeItem(${index})">✕</button></li>
        `).join('');
    }
}

window.removeRecipeItem = (index) => {
    currentRecipe.splice(index, 1);
    renderRecipePreview();
};

window.savePotion = () => {
    const name = document.getElementById('potion-name').value.trim();
    const category = document.getElementById('potion-category').value.trim() || 'General';
    const price = parseFloat(document.getElementById('potion-price').value) || 0;
    const desc = document.getElementById('potion-desc').value.trim();

    if (!name) return alert("Potion name required.");

    const id = Date.now();
    set(ref(db, `potions/${id}`), {
        id,
        name,
        category,
        salePrice: price,
        description: desc,
        recipe: currentRecipe
    });

    document.getElementById('potion-name').value = '';
    document.getElementById('potion-category').value = '';
    document.getElementById('potion-price').value = '';
    document.getElementById('potion-desc').value = '';
    currentRecipe = [];
    renderRecipePreview();
};

function renderPotions() {
    const listDiv = document.getElementById('admin-potion-list');
    if (!listDiv) return;

    listDiv.innerHTML = Object.values(potions).map(p => `
        <div class="card flex-between" style="flex-direction: row; padding: 0.5rem 0.75rem;">
            <div>
                <strong>${p.name}</strong> (${p.salePrice || 0}g)
                <div style="font-size: 0.75rem; color: var(--text-dim);">${p.category}</div>
            </div>
            <button class="btn-danger" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;" onclick="remove(ref(db, 'potions/${p.id}'))">✕</button>
        </div>
    `).join('');
}