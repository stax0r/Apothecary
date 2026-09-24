import { auth, db } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let ingredients = {};
let potions = {};
let currentRecipe = [];
let editRecipeArray = [];
let toastDismissed = false;

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
    window.renderIngredients();
    renderRecipeSelectOptions();
    checkIngredientsAttention();
});

onValue(ref(db, 'potions'), (snapshot) => {
    potions = snapshot.val() || {};
    window.renderPotions();
    renderBatchPotionSelectOptions();
    checkIngredientsAttention();
});

window.login = () => {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(err => alert(err.message));
};

window.logout = () => signOut(auth);

// --- REGISTER NEW INGREDIENT (VIA POP-UP MODAL) ---
window.addIngredient = () => {
    const nameInput = document.getElementById('ing-name');
    const priceInput = document.getElementById('ing-price');
    const stockInput = document.getElementById('ing-stock');
    const alertInput = document.getElementById('ing-alert');

    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value) || 0;
    const stock = parseInt(stockInput.value) || 0;
    const threshold = parseInt(alertInput.value) || 0;

    if (!name) return alert("Ingredient name is required.");

    const id = Date.now();
    set(ref(db, `ingredients/${id}`), { id, name, price, stockQty: stock, threshold })
        .then(() => {
            nameInput.value = '';
            priceInput.value = '';
            stockInput.value = '';
            alertInput.value = '';
            document.getElementById('create-ing-modal').close();
        })
        .catch(err => alert("Error registering ingredient: " + err.message));
};

// --- EDIT INGREDIENT MODAL ---
window.openEditIngredientModal = (id) => {
    const ing = ingredients[id];
    if (!ing) return;

    document.getElementById('edit-ing-id').value = ing.id;
    document.getElementById('edit-ing-name').value = ing.name || '';
    document.getElementById('edit-ing-price').value = ing.price || 0;
    document.getElementById('edit-ing-stock').value = ing.stockQty || 0;
    document.getElementById('edit-ing-alert').value = ing.threshold || 0;

    document.getElementById('edit-ing-modal').showModal();
};

window.saveIngredientEdit = () => {
    const id = document.getElementById('edit-ing-id').value;
    const name = document.getElementById('edit-ing-name').value.trim();
    const price = parseFloat(document.getElementById('edit-ing-price').value) || 0;
    const stockQty = parseInt(document.getElementById('edit-ing-stock').value) || 0;
    const threshold = parseInt(document.getElementById('edit-ing-alert').value) || 0;

    if (!name) return alert("Name cannot be empty.");

    update(ref(db, `ingredients/${id}`), { name, price, stockQty, threshold })
        .then(() => {
            document.getElementById('edit-ing-modal').close();
        })
        .catch(err => alert("Error updating ingredient: " + err.message));
};

// --- DELETE INGREDIENT ---
window.deleteIngredient = (id) => {
    const ing = ingredients[id];
    if (!ing) return;
    if (confirm(`Are you sure you want to delete "${ing.name}"?`)) {
        remove(ref(db, `ingredients/${id}`));
    }
};

// --- FLOATING WARNING TOAST ---
window.dismissWarningToast = () => {
    toastDismissed = true;
    const container = document.getElementById('toast-container');
    if (container) container.innerHTML = '';
};

function checkIngredientsAttention() {
    if (toastDismissed) return;
    const container = document.getElementById('toast-container');
    if (!container) return;

    const usedIngredientIds = new Set();
    Object.values(potions).forEach(p => {
        if (p.recipe && Array.isArray(p.recipe)) {
            p.recipe.forEach(r => usedIngredientIds.add(String(r.ingredientId)));
        }
    });

    const issues = [];
    Object.values(ingredients).forEach(i => {
        const isUsed = usedIngredientIds.has(String(i.id));
        if (isUsed) {
            const noPrice = (!i.price || i.price <= 0);
            const lowStock = ((i.stockQty || 0) <= (i.threshold || 0));

            if (noPrice || lowStock) {
                const reasons = [];
                if (noPrice) reasons.push("no price");
                if (lowStock) reasons.push(`low stock [${i.stockQty || 0} remaining]`);
                issues.push(`<strong>${i.name}</strong> (${reasons.join(', ')})`);
            }
        }
    });

    if (issues.length > 0) {
        container.innerHTML = `
            <div class="warning-toast">
                <div class="warning-toast-header">
                    <span>⚠️ Attention Required (${issues.length})</span>
                    <button class="toast-close-btn" onclick="window.dismissWarningToast()">✕</button>
                </div>
                ${issues.map(item => `<div class="attention-item">• ${item}</div>`).join('')}
            </div>
        `;
    } else {
        container.innerHTML = '';
    }
}

// --- RENDER INGREDIENTS LIST ---
window.renderIngredients = () => {
    const listDiv = document.getElementById('ingredient-list');
    const searchInput = document.getElementById('ing-search');
    if (!listDiv) return;

    const filterQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let sorted = Object.values(ingredients).sort((a, b) => 
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );

    if (filterQuery) {
        sorted = sorted.filter(i => (i.name || '').toLowerCase().includes(filterQuery));
    }

    if (sorted.length === 0) {
        listDiv.innerHTML = `<p style="color: var(--text-dim); font-size: 0.825rem;">No ingredients found.</p>`;
        return;
    }

    listDiv.innerHTML = sorted.map(i => {
        const noPrice = (!i.price || i.price <= 0);
        const lowStock = ((i.stockQty || 0) <= (i.threshold || 0));

        let warningBadges = '';
        if (noPrice) warningBadges += `<span class="badge badge-warning">No Price</span> `;
        if (lowStock) warningBadges += `<span class="badge badge-danger">Low Stock</span>`;

        return `
            <div class="card flex-between" style="flex-direction: row; align-items: center; padding: 0.5rem 0.75rem;">
                <div style="flex: 1; min-width: 140px;">
                    <strong>${i.name}</strong>
                    <div style="display: flex; gap: 0.4rem; align-items: center; margin-top: 0.15rem;">
                        <span style="font-size: 0.8rem; color: var(--text-dim);">${i.price || 0}g / unit</span>
                        ${warningBadges}
                    </div>
                </div>
                <div style="display: flex; gap: 0.4rem; align-items: center;">
                    <span style="font-size: 0.75rem; color: var(--text-dim);">Stock: ${i.stockQty || 0}</span>
                    <button class="btn-edit" style="padding: 0.2rem 0.45rem; font-size: 0.75rem;" onclick="window.openEditIngredientModal('${i.id}')">✏️ Edit</button>
                    <button class="btn-danger" style="padding: 0.2rem 0.45rem; font-size: 0.75rem;" onclick="window.deleteIngredient('${i.id}')">✕</button>
                </div>
            </div>
        `;
    }).join('');
};

// --- BATCH CALCULATOR ---
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
    let report = `Batch Run: ${qty}x ${p.name}\n==============================\n`;

    p.recipe.forEach(r => {
        const ing = ingredients[r.ingredientId];
        const needed = r.qty * qty;
        const unitPrice = ing ? (ing.price || 0) : 0;
        const lineCost = needed * unitPrice;
        totalCraftCost += lineCost;

        report += `• ${r.name}: ${needed} required (${unitPrice}g/unit) = ${lineCost.toFixed(2)}g\n`;
        if (!ing || !ing.price) report += `   [!] WARNING: Unregistered price for ${r.name}!\n`;
        if (ing && (ing.stockQty || 0) < needed) report += `   [!] WARNING: Low Stock! Needed: ${needed}, In Stock: ${ing.stockQty || 0}\n`;
    });

    report += `==============================\nTotal Material Cost: ${totalCraftCost.toFixed(2)} Gold`;
    resultsDiv.innerText = report;
};

// --- RECIPE SELECT OPTIONS ---
function renderRecipeSelectOptions() {
    const select = document.getElementById('recipe-ing-select');
    const editSelect = document.getElementById('edit-recipe-ing-select');
    const optionsHtml = Object.values(ingredients)
        .sort((a,b) => (a.name || '').localeCompare(b.name || ''))
        .map(i => `<option value="${i.id}">${i.name} (${i.price || 0}g)</option>`).join('');

    if (select) select.innerHTML = optionsHtml;
    if (editSelect) editSelect.innerHTML = optionsHtml;
}

// --- CREATE POTION RECIPE (VIA POP-UP MODAL) ---
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
        hidden: false,
        recipe: currentRecipe
    }).then(() => {
        document.getElementById('potion-name').value = '';
        document.getElementById('potion-category').value = '';
        document.getElementById('potion-price').value = '';
        document.getElementById('potion-desc').value = '';
        currentRecipe = [];
        renderRecipePreview();
        document.getElementById('create-potion-modal').close();
    }).catch(err => alert("Error saving potion: " + err.message));
};

// --- EDIT POTION MODAL ---
window.openEditPotionModal = (id) => {
    const p = potions[id];
    if (!p) return;

    document.getElementById('edit-potion-id').value = p.id;
    document.getElementById('edit-potion-name').value = p.name || '';
    document.getElementById('edit-potion-category').value = p.category || '';
    document.getElementById('edit-potion-price').value = p.salePrice || 0;
    document.getElementById('edit-potion-desc').value = p.description || '';

    editRecipeArray = p.recipe ? [...p.recipe] : [];
    renderEditRecipePreview();

    document.getElementById('edit-potion-modal').showModal();
};

window.addIngredientToEditRecipe = () => {
    const ingId = document.getElementById('edit-recipe-ing-select').value;
    const qty = parseInt(document.getElementById('edit-recipe-ing-qty').value) || 1;
    const ing = ingredients[ingId];

    if (ing) {
        editRecipeArray.push({ ingredientId: ing.id, name: ing.name, qty });
        renderEditRecipePreview();
    }
};

function renderEditRecipePreview() {
    const previewUl = document.getElementById('edit-recipe-preview');
    if (previewUl) {
        previewUl.innerHTML = editRecipeArray.map((item, index) => `
            <li>${item.qty}x ${item.name} <button class="btn-danger" style="padding: 0 0.3rem; font-size:0.7rem;" onclick="window.removeEditRecipeItem(${index})">✕</button></li>
        `).join('');
    }
}

window.removeEditRecipeItem = (index) => {
    editRecipeArray.splice(index, 1);
    renderEditRecipePreview();
};

window.savePotionEdit = () => {
    const id = document.getElementById('edit-potion-id').value;
    const name = document.getElementById('edit-potion-name').value.trim();
    const category = document.getElementById('edit-potion-category').value.trim() || 'General';
    const price = parseFloat(document.getElementById('edit-potion-price').value) || 0;
    const desc = document.getElementById('edit-potion-desc').value.trim();

    if (!name) return alert("Potion name required.");

    update(ref(db, `potions/${id}`), {
        name,
        category,
        salePrice: price,
        description: desc,
        recipe: editRecipeArray
    }).then(() => {
        document.getElementById('edit-potion-modal').close();
    }).catch(err => alert("Error updating potion: " + err.message));
};

// --- DELETE POTION ---
window.deletePotion = (id) => {
    const p = potions[id];
    if (!p) return;
    if (confirm(`Are you sure you want to delete "${p.name}"?`)) {
        remove(ref(db, `potions/${id}`));
    }
};

window.togglePotionVisibility = (id) => {
    if (!potions[id]) return;
    const currentStatus = !!potions[id].hidden;
    update(ref(db, `potions/${id}`), { hidden: !currentStatus });
};

window.renderPotions = () => {
    const listDiv = document.getElementById('admin-potion-list');
    const searchInput = document.getElementById('potion-search');
    if (!listDiv) return;

    const filterQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let sorted = Object.values(potions).sort((a,b) => (a.name || '').localeCompare(b.name || ''));

    if (filterQuery) {
        sorted = sorted.filter(p => (p.name || '').toLowerCase().includes(filterQuery));
    }

    if (sorted.length === 0) {
        listDiv.innerHTML = `<p style="color: var(--text-dim); font-size: 0.825rem;">No potions found.</p>`;
        return;
    }

    listDiv.innerHTML = sorted.map(p => {
        const isHidden = !!p.hidden;
        return `
            <div class="card flex-between" style="flex-direction: row; align-items: center; padding: 0.4rem 0.65rem;">
                <div>
                    <strong>${p.name}</strong> (${p.salePrice || 0}g)
                    <div style="font-size: 0.725rem; color: var(--text-dim);">${p.category || 'General'}</div>
                </div>
                <div style="display: flex; gap: 0.4rem; align-items: center;">
                    <button class="${isHidden ? 'btn-toggle-off' : 'btn-toggle-on'}" style="font-size: 0.75rem; padding: 0.2rem 0.45rem;" onclick="window.togglePotionVisibility('${p.id}')">
                        ${isHidden ? '🙈 Hidden' : '👁️ Visible'}
                    </button>
                    <button class="btn-edit" style="padding: 0.2rem 0.45rem; font-size: 0.75rem;" onclick="window.openEditPotionModal('${p.id}')">✏️ Edit</button>
                    <button class="btn-danger" style="padding: 0.2rem 0.45rem; font-size: 0.75rem;" onclick="window.deletePotion('${p.id}')">✕</button>
                </div>
            </div>
        `;
    }).join('');
};