// admin-catalog.js
import { auth, db } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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
let currentRecipe = [];
let currentUser = null;
let batchManifest = [];

window.clientSuppliedQty = {};
window.editingPotionStockId = null;

onValue(ref(db, 'ingredients'), (snapshot) => {
    ingredients = snapshot.val() || {};
    window.renderCatalogPage();
});

onValue(ref(db, 'potions'), (snapshot) => {
    potions = snapshot.val() || {};
    window.renderCatalogPage();
});

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const loginModal = document.getElementById('login-modal');
    if (user) {
        if (loginModal) loginModal.classList.add('hidden');
    } else {
        if (loginModal) loginModal.classList.remove('hidden');
    }
    window.renderCatalogPage();
});

window.toggleAuthModal = () => {
    if (currentUser) {
        signOut(auth);
    } else {
        const loginModal = document.getElementById('login-modal');
        if (loginModal) loginModal.classList.toggle('hidden');
    }
};

window.login = () => {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const errDiv = document.getElementById('login-error');

    signInWithEmailAndPassword(auth, email, pass)
        .then(() => { if (errDiv) errDiv.innerText = ""; })
        .catch(err => { if (errDiv) errDiv.innerText = err.message; });
};

window.addIngredientToRecipe = () => {
    const select = document.getElementById('recipe-ing-select');
    const qty = parseInt(document.getElementById('recipe-ing-qty').value);
    if (!select) return;
    const ingId = select.value;

    const ing = ingredients[ingId];
    if (ing && qty > 0) {
        const existingIndex = currentRecipe.findIndex(item => item.ingredientId == ing.id);
        if (existingIndex > -1) {
            currentRecipe[existingIndex].qty += qty;
        } else {
            currentRecipe.push({ ingredientId: ing.id, name: ing.name, qty });
        }
        window.renderRecipePreview();
    }
};

window.renderRecipePreview = () => {
    const list = document.getElementById('recipe-preview-list');
    if (!list) return;
    list.innerHTML = '';
    let totalCost = 0;

    currentRecipe.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

    currentRecipe.forEach((item, index) => {
        const ing = ingredients[item.ingredientId];
        const unitPrice = ing ? ing.price : 0;
        const cost = unitPrice * item.qty;
        totalCost += cost;

        const li = document.createElement('li');
        li.innerHTML = `${item.qty}x ${item.name} (${cost.toFixed(2)}g) <button type="button" style="padding:1px 4px; font-size:0.65rem; background:var(--danger); margin-left:6px;" onclick="window.removeRecipeItem(${index})">X</button>`;
        list.appendChild(li);
    });

    const calcCost = document.getElementById('calculated-cost');
    if (calcCost) calcCost.textContent = totalCost.toFixed(2);
};

window.removeRecipeItem = (index) => {
    currentRecipe.splice(index, 1);
    window.renderRecipePreview();
};

window.savePotion = () => {
    const name = document.getElementById('potion-name').value.trim();
    const category = document.getElementById('potion-category').value.trim() || 'General';
    const desc = document.getElementById('potion-desc').value.trim();
    const price = parseFloat(document.getElementById('potion-sale-price').value);
    const stockQty = parseInt(document.getElementById('potion-stock-qty').value) || 0;
    const bulkOnly = document.getElementById('potion-bulk-only').checked;
    const editingId = document.getElementById('editing-potion-id').value;

    if (name && !isNaN(price)) {
        const id = editingId ? parseInt(editingId) : Date.now();
        const existingPotion = (editingId && potions[editingId]) ? potions[editingId] : {};
        
        currentRecipe.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

        set(ref(db, `potions/${id}`), {
            id,
            name,
            category,
            description: desc,
            salePrice: price,
            stockQty: stockQty,
            inShop: existingPotion.inShop !== undefined ? existingPotion.inShop : true,
            forceOut: existingPotion.forceOut !== undefined ? existingPotion.forceOut : false,
            bulkOnly: bulkOnly,
            recipe: currentRecipe
        });

        window.cancelEditPotion();
        showBanner("Potion saved successfully!");
    } else {
        showBanner("Provide a valid potion name and sale price.", 'error');
    }
};

window.editPotion = (id) => {
    const p = potions[id];
    if (!p) return;

    document.getElementById('editing-potion-id').value = p.id;
    document.getElementById('potion-name').value = p.name;
    document.getElementById('potion-category').value = p.category || '';
    document.getElementById('potion-desc').value = p.description || '';
    document.getElementById('potion-sale-price').value = p.salePrice;
    document.getElementById('potion-stock-qty').value = p.stockQty !== undefined ? p.stockQty : 1;
    document.getElementById('potion-bulk-only').checked = p.bulkOnly === true;
    
    currentRecipe = p.recipe ? [...p.recipe] : [];
    window.renderRecipePreview();

    document.getElementById('potion-form-title').innerText = "Full Edit Potion Recipe";
    document.getElementById('save-potion-btn').innerText = "Update Potion";
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
    document.getElementById('potion-form-title').scrollIntoView({ behavior: 'smooth' });
};

window.cancelEditPotion = () => {
    document.getElementById('editing-potion-id').value = '';
    document.getElementById('potion-name').value = '';
    document.getElementById('potion-category').value = '';
    document.getElementById('potion-desc').value = '';
    document.getElementById('potion-sale-price').value = '';
    document.getElementById('potion-stock-qty').value = '1';
    document.getElementById('potion-bulk-only').checked = false;
    currentRecipe = [];
    window.renderRecipePreview();

    document.getElementById('potion-form-title').innerText = "Create / Full Edit Potion";
    document.getElementById('save-potion-btn').innerText = "Create Potion";
    document.getElementById('cancel-edit-btn').classList.add('hidden');
};

window.deletePotion = (id) => {
    if (window.confirm("Delete this potion from catalog?")) {
        if (document.getElementById('editing-potion-id').value == id) window.cancelEditPotion();
        remove(ref(db, `potions/${id}`));
        showBanner("Potion deleted.");
    }
};

window.startEditPotionStock = (id) => {
    window.editingPotionStockId = id;
    window.renderPotionsList();
};

window.savePotionStockQuick = (id) => {
    const input = document.getElementById(`quick-stock-input-${id}`);
    if (!input) return;
    const newStock = parseInt(input.value);
    if (isNaN(newStock) || newStock < 0) return;

    update(ref(db, `potions/${id}`), { stockQty: newStock }).then(() => {
        window.editingPotionStockId = null;
        showBanner("Stock updated!");
        window.renderPotionsList();
    });
};

window.renderPotionsList = () => {
    const listDiv = document.getElementById('admin-potions-list');
    const searchInput = document.getElementById('potion-search-filter');
    if (!listDiv) return;

    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    let potionArray = Object.values(potions);

    if (query) {
        potionArray = potionArray.filter(p => 
            (p.name || '').toLowerCase().includes(query) || 
            (p.category || '').toLowerCase().includes(query)
        );
    }

    potionArray.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

    if (potionArray.length === 0) {
        listDiv.innerHTML = `<p style="color: var(--text-dim); font-size: 0.85rem; margin: 0; padding: 6px;">No potions found.</p>`;
        return;
    }

    listDiv.innerHTML = potionArray.map(p => {
        const stockQty = p.stockQty !== undefined ? p.stockQty : 0;
        const isEditingStock = window.editingPotionStockId === p.id;

        return `
            <div class="item-row" style="align-items: center; gap: 8px;">
                <div style="flex: 2; min-width: 140px;">
                    <strong>${p.name}</strong> 
                    <span style="font-size: 0.7rem; color: var(--accent);">(${p.category || 'General'})</span>
                    <div style="font-size: 0.75rem; color: var(--text-dim);">
                        Price: ${Math.round(p.salePrice || 0)}g
                    </div>
                </div>
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                    ${isEditingStock ? `
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <input type="number" id="quick-stock-input-${p.id}" value="${stockQty}" min="0" style="width: 55px; padding: 2px;">
                            <button onclick="window.savePotionStockQuick(${p.id})" style="padding: 2px 6px; font-size: 0.7rem; background: var(--success);">Save</button>
                        </div>
                    ` : `
                        <span style="font-size: 0.8rem; color: var(--stock-blue); cursor: pointer;" onclick="window.startEditPotionStock(${p.id})" title="Click to quick-edit stock">
                            Stock: <strong>${stockQty}</strong> ✎
                        </span>
                    `}
                    <button class="edit-btn" onclick="window.editPotion(${p.id})" style="font-size: 0.7rem; padding: 2px 6px;" title="Full edit recipe">Recipe</button>
                    <button class="delete-btn" onclick="window.deletePotion(${p.id})" style="font-size: 0.7rem; padding: 2px 6px;">X</button>
                </div>
            </div>
        `;
    }).join('');
};

window.addBatchRow = () => {
    const select = document.getElementById('batch-potion-select');
    const qtyInput = document.getElementById('batch-qty');
    const potionId = select ? select.value : null;
    const p = potions[potionId];
    let qty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;

    if (!potionId) return;
    if (p && p.bulkOnly && qty < 10) qty = 10;

    const existing = batchManifest.find(item => item.potionId === potionId);
    if (existing) existing.qty += qty;
    else batchManifest.push({ potionId, qty });
    window.renderBatchCalculator();
};

window.updateBatchQty = (index, newQty) => {
    const item = batchManifest[index];
    const p = item ? potions[item.potionId] : null;
    let qty = parseInt(newQty) || 0;
    
    if (p && p.bulkOnly) {
        if (qty < 10) batchManifest.splice(index, 1);
        else {
            qty = Math.floor(qty / 10) * 10;
            batchManifest[index].qty = qty;
        }
    } else {
        if (qty <= 0) batchManifest.splice(index, 1);
        else batchManifest[index].qty = qty;
    }
    window.renderBatchCalculator();
};

window.removeBatchRow = (index) => {
    batchManifest.splice(index, 1);
    window.renderBatchCalculator();
};

window.updateClientSupply = (ingId, val) => {
    if (!window.clientSuppliedQty) window.clientSuppliedQty = {};
    window.clientSuppliedQty[ingId] = Math.max(0, parseFloat(val) || 0);
    window.renderBatchCalculator();
};

window.executeBatchCraft = () => {
    if (batchManifest.length === 0) return;
    if (!window.confirm("Execute batch? This will deduct used ingredients from personal stock.")) return;

    const updates = {};
    const aggregatedIngredients = {};

    batchManifest.forEach(item => {
        const p = potions[item.potionId];
        if (!p || !p.recipe) return;

        p.recipe.forEach(r => {
            const ing = ingredients[r.ingredientId];
            if (!ing) return;
            const totalNeeded = r.qty * item.qty;
            if (!aggregatedIngredients[r.ingredientId]) {
                aggregatedIngredients[r.ingredientId] = { stockQty: ing.stockQty || 0, qtyRequired: 0 };
            }
            aggregatedIngredients[r.ingredientId].qtyRequired += totalNeeded;
        });
    });

    Object.keys(aggregatedIngredients).forEach(ingId => {
        const ing = aggregatedIngredients[ingId];
        const clientQty = Math.min(ing.qtyRequired, parseFloat(window.clientSuppliedQty[ingId]) || 0);
        const stockUsed = Math.min(Math.max(0, ing.qtyRequired - clientQty), ing.stockQty);

        if (stockUsed > 0) {
            updates[`ingredients/${ingId}/stockQty`] = ing.stockQty - stockUsed;
        }
    });

    update(ref(db), updates).then(() => {
        showBanner("Batch executed and stock deducted.");
        batchManifest = [];
        window.clientSuppliedQty = {};
        window.renderBatchCalculator();
    });
};

window.renderBatchCalculator = () => {
    const listDiv = document.getElementById('batch-manifest-list');
    const resultsDiv = document.getElementById('batch-results');
    if (!listDiv || !resultsDiv) return;

    if (batchManifest.length === 0) {
        listDiv.innerHTML = '';
        resultsDiv.innerHTML = `<p style="color: var(--text-dim); font-size: 0.85rem;">Add items above to calculate costs.</p>`;
        return;
    }

    listDiv.innerHTML = batchManifest.map((item, index) => {
        const p = potions[item.potionId];
        if (!p) return '';
        return `
            <div class="item-row">
                <span>${p.name} (${p.salePrice}g)</span>
                <div>
                    <input type="number" value="${item.qty}" min="${p.bulkOnly ? 10 : 1}" style="width: 60px;" onchange="window.updateBatchQty(${index}, this.value)">
                    <button class="delete-btn" onclick="window.removeBatchRow(${index})" style="padding: 1px 5px;">X</button>
                </div>
            </div>
        `;
    }).join('');

    const aggregatedIngredients = {};
    let fullGrossCraftCost = 0, defaultSalePrice = 0, totalUnits = 0;

    batchManifest.forEach(item => {
        const p = potions[item.potionId];
        if (!p) return;
        totalUnits += item.qty;
        defaultSalePrice += (p.salePrice || 0) * item.qty;

        if (p.recipe) {
            p.recipe.forEach(r => {
                const ing = ingredients[r.ingredientId];
                const unitPrice = ing ? ing.price : 0;
                const totalNeeded = r.qty * item.qty;
                fullGrossCraftCost += unitPrice * totalNeeded;

                if (!aggregatedIngredients[r.ingredientId]) {
                    aggregatedIngredients[r.ingredientId] = {
                        id: r.ingredientId, name: r.name, qtyRequired: 0, unitPrice, stockQty: ing ? (ing.stockQty || 0) : 0
                    };
                }
                aggregatedIngredients[r.ingredientId].qtyRequired += totalNeeded;
            });
        }
    });

    let netCraftCost = 0, totalStockValueUsed = 0;
    let html = `<div class="batch-summary"><h4>Sourcing Breakdown</h4><div style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;">`;

    Object.values(aggregatedIngredients).forEach(ing => {
        const clientQty = Math.min(ing.qtyRequired, parseFloat(window.clientSuppliedQty[ing.id]) || 0);
        const stockUsed = Math.min(Math.max(0, ing.qtyRequired - clientQty), ing.stockQty);
        const toOrder = Math.max(0, ing.qtyRequired - clientQty - stockUsed);

        netCraftCost += toOrder * ing.unitPrice;
        totalStockValueUsed += stockUsed * ing.unitPrice;

        html += `
            <div class="item-row" style="background: rgba(0,0,0,0.15); padding: 6px; font-size: 0.8rem;">
                <span><strong>${ing.name}</strong> (Req: ${ing.qtyRequired})</span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    Client: <input type="number" value="${window.clientSuppliedQty[ing.id] || 0}" min="0" style="width: 45px;" oninput="window.updateClientSupply('${ing.id}', this.value)">
                    <span style="color: ${toOrder > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight: bold;">${toOrder > 0 ? `Order ${toOrder}` : 'Covered'}</span>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    const netProfit = defaultSalePrice - netCraftCost - totalStockValueUsed;

    html += `
            <div class="batch-metrics" style="margin-top: 10px;">
                <div class="metric-box"><span>Units</span><strong>${totalUnits}</strong></div>
                <div class="metric-box"><span>Revenue</span><strong style="color: var(--gold);">${defaultSalePrice.toFixed(1)}g</strong></div>
                <div class="metric-box"><span>Net Profit</span><strong class="${netProfit >= 0 ? 'profit-text' : 'loss-text'}">${netProfit.toFixed(1)}g</strong></div>
            </div>
            <button class="execute-batch-btn" onclick="window.executeBatchCraft()" style="margin-top: 10px;">Execute Batch & Deduct Stock</button>
        </div>
    `;

    resultsDiv.innerHTML = html;
};

window.renderAdminSelects = () => {
    const batchSelect = document.getElementById('batch-potion-select');
    const recipeSelect = document.getElementById('recipe-ing-select');
    if (batchSelect) {
        batchSelect.innerHTML = Object.values(potions).map(p => `<option value="${p.id}">${p.name} (${Math.round(p.salePrice || 0)}g)</option>`).join('');
    }
    if (recipeSelect) {
        recipeSelect.innerHTML = Object.values(ingredients).map(i => `<option value="${i.id}">${i.name} (${i.price}g)</option>`).join('');
    }
};

window.renderCatalogPage = () => {
    if (!currentUser) return;
    window.renderPotionsList();
    window.renderBatchCalculator();
    window.renderAdminSelects();
};