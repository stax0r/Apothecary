// admin.js
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
let categoryOrders = {};
let currentRecipe = [];
let currentUser = null;
let batchManifest = [];

window.clientSuppliedQty = {};
window.editingIngredientId = null;
window.selectedQuickDepositIngredientId = null;

onValue(ref(db, 'ingredients'), (snapshot) => {
    ingredients = snapshot.val() || {};
    window.renderAdmin();
});

onValue(ref(db, 'potions'), (snapshot) => {
    potions = snapshot.val() || {};
    window.renderAdmin();
});

onValue(ref(db, 'categoryOrders'), (snapshot) => {
    categoryOrders = snapshot.val() || {};
    window.renderAdmin();
});

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const loginModal = document.getElementById('login-modal');
    if (user) {
        if (loginModal) loginModal.classList.add('hidden');
    } else {
        if (loginModal) loginModal.classList.remove('hidden');
    }
    window.renderAdmin();
});

window.toggleAuthModal = () => {
    if (currentUser) {
        signOut(auth);
    } else {
        const loginModal = document.getElementById('login-modal');
        if (loginModal) loginModal.classList.toggle('hidden');
    }
};

window.toggleSection = (wrapperId, btnId) => {
    const wrapper = document.getElementById(wrapperId);
    const btn = document.getElementById(btnId);
    if (wrapper && btn) {
        const isHidden = wrapper.classList.toggle('hidden');
        btn.innerText = isHidden ? 'Show ▼' : 'Hide ▲';
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

window.addIngredient = () => {
    const nameInput = document.getElementById('ing-name');
    const name = nameInput.value.trim();
    const price = parseFloat(document.getElementById('ing-price').value);
    const stock = parseInt(document.getElementById('ing-stock').value) || 0;
    const threshold = parseInt(document.getElementById('ing-threshold').value) || 0;

    if (!name || isNaN(price)) {
        showBanner("Please provide a valid name and price for the ingredient.", 'error');
        return;
    }

    const nameLower = name.toLowerCase();
    const existingEntry = Object.values(ingredients).find(i => (i.name || '').toLowerCase() === nameLower);

    if (existingEntry) {
        showBanner(`An ingredient named "${existingEntry.name}" already exists!`, 'error');
        window.startEditIngredient(existingEntry.id);
        return;
    }

    const id = Date.now();
    set(ref(db, `ingredients/${id}`), { id, name, price, stockQty: Math.max(0, stock), threshold: Math.max(0, threshold) });
    nameInput.value = '';
    document.getElementById('ing-price').value = '';
    document.getElementById('ing-stock').value = '0';
    document.getElementById('ing-threshold').value = '0';
};

window.startEditIngredient = (id) => {
    window.editingIngredientId = id;
    window.renderIngredientsList();
};

window.cancelEditIngredient = () => {
    window.editingIngredientId = null;
    window.renderIngredientsList();
};

window.saveIngredientEdit = (id) => {
    const nameInput = document.getElementById(`edit-ing-name-${id}`);
    const priceInput = document.getElementById(`edit-ing-price-${id}`);
    const stockInput = document.getElementById(`edit-ing-stock-${id}`);
    const thresholdInput = document.getElementById(`edit-ing-threshold-${id}`);

    if (!nameInput || !priceInput || !stockInput || !thresholdInput) return;

    const newName = nameInput.value.trim();
    const price = parseFloat(priceInput.value);
    const stockQty = parseInt(stockInput.value) || 0;
    const threshold = parseInt(thresholdInput.value) || 0;

    if (!newName || isNaN(price)) {
        showBanner("Name and price cannot be empty.", 'error');
        return;
    }

    const newNameLower = newName.toLowerCase();
    const duplicate = Object.values(ingredients).find(i => i.id !== id && (i.name || '').toLowerCase() === newNameLower);
    if (duplicate) {
        showBanner(`Another ingredient named "${duplicate.name}" already exists!`, 'error');
        return;
    }

    const oldName = ingredients[id] ? ingredients[id].name : '';

    update(ref(db, `ingredients/${id}`), {
        name: newName,
        price: Math.max(0, price),
        stockQty: Math.max(0, stockQty),
        threshold: Math.max(0, threshold)
    }).then(() => {
        window.editingIngredientId = null;

        if (oldName !== newName && potions) {
            const potionUpdates = {};
            let updated = false;

            Object.values(potions).forEach(p => {
                if (p.recipe && Array.isArray(p.recipe)) {
                    let potionRecipeChanged = false;
                    const newRecipe = p.recipe.map(r => {
                        if (r.ingredientId == id) {
                            potionRecipeChanged = true;
                            return { ...r, name: newName };
                        }
                        return r;
                    });

                    if (potionRecipeChanged) {
                        updated = true;
                        potionUpdates[`potions/${p.id}/recipe`] = newRecipe;
                    }
                }
            });

            if (updated) {
                update(ref(db), potionUpdates);
            }
        }

        window.renderIngredientsList();
    });
};

window.deleteIngredient = (id) => {
    if (window.confirm("Are you sure you want to delete this ingredient? It will also be automatically removed from any potion recipes.")) {
        if (window.editingIngredientId === id) window.editingIngredientId = null;

        remove(ref(db, `ingredients/${id}`)).then(() => {
            if (potions) {
                const potionUpdates = {};
                let updated = false;

                Object.values(potions).forEach(p => {
                    if (p.recipe && Array.isArray(p.recipe)) {
                        const filteredRecipe = p.recipe.filter(r => r.ingredientId != id);
                        if (filteredRecipe.length !== p.recipe.length) {
                            updated = true;
                            potionUpdates[`potions/${p.id}/recipe`] = filteredRecipe;
                        }
                    }
                });

                if (updated) {
                    update(ref(db), potionUpdates);
                }
            }
        });
    }
};

window.handleQuickDepositInput = (query) => {
    const dropdown = document.getElementById('quick-deposit-dropdown');
    if (!dropdown) return;

    const q = query.trim().toLowerCase();
    if (!q) {
        dropdown.classList.add('hidden');
        window.selectedQuickDepositIngredientId = null;
        return;
    }

    const ingArray = Object.values(ingredients);
    const matches = ingArray.filter(i => (i.name || '').toLowerCase().includes(q));

    if (matches.length === 0) {
        dropdown.innerHTML = `<div class="autocomplete-item" style="color: var(--text-dim); cursor: default;">No matching ingredients</div>`;
        dropdown.classList.remove('hidden');
        window.selectedQuickDepositIngredientId = null;
        return;
    }

    dropdown.innerHTML = matches.map(i => `
        <div class="autocomplete-item" onclick="window.selectQuickDepositIngredient('${i.id}', '${i.name.replace(/'/g, "\\'")} ')">
            ${i.name} <span style="color: var(--stock-blue); font-size: 0.75rem;">(Stock: ${i.stockQty || 0})</span>
        </div>
    `).join('');
    dropdown.classList.remove('hidden');
};

window.selectQuickDepositIngredient = (id, name) => {
    window.selectedQuickDepositIngredientId = id;
    const input = document.getElementById('quick-deposit-input');
    if (input) input.value = name.trim();
    const dropdown = document.getElementById('quick-deposit-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
};

window.executeQuickDeposit = () => {
    const id = window.selectedQuickDepositIngredientId;
    const qtyInput = document.getElementById('quick-deposit-qty');
    const addQty = parseInt(qtyInput ? qtyInput.value : 1) || 0;

    if (!id || !ingredients[id] || addQty <= 0) {
        showBanner("Please select a valid ingredient and enter a positive quantity.", 'error');
        return;
    }

    const currentStock = ingredients[id].stockQty || 0;
    const newStock = currentStock + addQty;

    set(ref(db, `ingredients/${id}/stockQty`), newStock)
        .then(() => {
            showBanner(`Successfully added ${addQty} to ${ingredients[id].name}. New stock: ${newStock}`);
            const input = document.getElementById('quick-deposit-input');
            if (input) input.value = '';
            if (qtyInput) qtyInput.value = '1';
            window.selectedQuickDepositIngredientId = null;
        })
        .catch(err => {
            showBanner("Error depositing stock: " + err.message, 'error');
        });
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
        li.innerHTML = `${item.qty}x ${item.name} (${cost.toFixed(2)} gold) <button type="button" style="padding:2px 6px; font-size:0.7rem; background:var(--danger); margin-left:8px;" onclick="window.removeRecipeItem(${index})">X</button>`;
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
        const existingInShop = existingPotion.inShop !== undefined ? existingPotion.inShop : true;
        const existingForceOut = existingPotion.forceOut !== undefined ? existingPotion.forceOut : false;

        currentRecipe.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

        set(ref(db, `potions/${id}`), {
            id,
            name,
            category,
            description: desc,
            salePrice: price,
            stockQty: stockQty,
            inShop: existingInShop,
            forceOut: existingForceOut,
            bulkOnly: bulkOnly,
            recipe: currentRecipe
        });

        const allCats = [...new Set([...Object.values(potions).map(p => p.category || 'General'), category])];
        const updates = {};
        let maxOrder = 0;
        Object.values(categoryOrders).forEach(o => { if (o > maxOrder) maxOrder = o; });

        allCats.forEach(cat => {
            if (categoryOrders[cat] === undefined) {
                maxOrder++;
                updates[`categoryOrders/${cat}`] = maxOrder;
            }
        });

        if (Object.keys(updates).length > 0) {
            update(ref(db), updates);
        }

        window.cancelEditPotion();
    } else {
        showBanner("Please provide a valid potion name and sale price.", 'error');
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

    const titleElem = document.getElementById('potion-form-title');
    if (titleElem) titleElem.innerText = "Edit Potion";
    document.getElementById('save-potion-btn').innerText = "Update Potion";
    document.getElementById('cancel-edit-btn').classList.remove('hidden');

    document.getElementById('potion-creator-container').scrollIntoView({ behavior: 'smooth' });
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

    const titleElem = document.getElementById('potion-form-title');
    if (titleElem) titleElem.innerText = "Add New Potion to the Catalog";
    document.getElementById('save-potion-btn').innerText = "Create Potion";
    document.getElementById('cancel-edit-btn').classList.add('hidden');
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

    const confirmMsg = "Are you sure you want to execute this batch? This will automatically deduct the required ingredients from your personal stock based on what the client is NOT providing.";
    if (!window.confirm(confirmMsg)) return;

    const updates = {};
    const aggregatedIngredients = {};

    batchManifest.forEach(item => {
        const p = potions[item.potionId];
        if (!p) return;

        if (p.recipe) {
            p.recipe.forEach(r => {
                const ing = ingredients[r.ingredientId];
                if (!ing) return;
                
                const totalNeeded = r.qty * item.qty;
                if (!aggregatedIngredients[r.ingredientId]) {
                    aggregatedIngredients[r.ingredientId] = {
                        stockQty: ing.stockQty || 0,
                        qtyRequired: 0
                    };
                }
                aggregatedIngredients[r.ingredientId].qtyRequired += totalNeeded;
            });
        }
    });

    Object.keys(aggregatedIngredients).forEach(ingId => {
        const ing = aggregatedIngredients[ingId];
        const clientQty = Math.min(ing.qtyRequired, parseFloat(window.clientSuppliedQty[ingId]) || 0);
        const remainingAfterClient = Math.max(0, ing.qtyRequired - clientQty);
        const stockUsed = Math.min(remainingAfterClient, ing.stockQty);

        if (stockUsed > 0) {
            updates[`ingredients/${ingId}/stockQty`] = ing.stockQty - stockUsed;
        }
    });

    if (Object.keys(updates).length > 0) {
        update(ref(db), updates)
            .then(() => {
                showBanner("Batch successfully crafted! Personal inventory stock has been deducted.");
                batchManifest = [];
                window.clientSuppliedQty = {};
                window.renderBatchCalculator();
            })
            .catch(err => {
                showBanner("Error updating inventory: " + err.message, 'error');
            });
    } else {
        showBanner("Batch executed! (No personal stock was deducted).");
        batchManifest = [];
        window.clientSuppliedQty = {};
        window.renderBatchCalculator();
    }
};

window.renderBatchCalculator = () => {
    const listDiv = document.getElementById('batch-manifest-list');
    const resultsDiv = document.getElementById('batch-results');

    if (!listDiv || !resultsDiv) return;

    if (batchManifest.length === 0) {
        listDiv.innerHTML = '';
        resultsDiv.innerHTML = `<p style="color: var(--text-dim); font-size: 0.85rem;">Add potions above to calculate total requirements, costs, and profit.</p>`;
        return;
    }

    listDiv.innerHTML = batchManifest.map((item, index) => {
        const p = potions[item.potionId];
        if (!p) return '';
        return `
            <div class="item-row">
                <span>${p.name} (${p.salePrice}g) ${p.bulkOnly ? '<span style="color:var(--custom-order); font-size:0.75rem;">(10x Bulk)</span>' : ''}</span>
                <div>
                    <input type="number" value="${item.qty}" min="${p.bulkOnly ? 10 : 1}" step="${p.bulkOnly ? 10 : 1}" style="width: 70px;" onchange="window.updateBatchQty(${index}, this.value)"> units
                    <button class="delete-btn" onclick="window.removeBatchRow(${index})">X</button>
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
                const stockQty = ing ? (ing.stockQty || 0) : 0;
                const totalNeeded = r.qty * item.qty;
                const cost = unitPrice * totalNeeded;

                fullGrossCraftCost += cost;

                if (!aggregatedIngredients[r.ingredientId]) {
                    aggregatedIngredients[r.ingredientId] = {
                        id: r.ingredientId,
                        name: r.name,
                        qtyRequired: 0,
                        unitPrice: unitPrice,
                        stockQty: stockQty,
                        grossCost: 0
                    };
                }
                aggregatedIngredients[r.ingredientId].qtyRequired += totalNeeded;
                aggregatedIngredients[r.ingredientId].grossCost += cost;
            });
        }
    });

    let totalClientCredit = 0, netCraftCost = 0, totalStockValueUsed = 0;
    const sortedAggregated = Object.values(aggregatedIngredients).sort((a, b) => 
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );

    let html = `
        <div class="batch-summary">
            <h4>Ingredient Breakdown & Sourcing</h4>
            <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
    `;

    sortedAggregated.forEach(ing => {
        const clientQty = Math.min(ing.qtyRequired, parseFloat(window.clientSuppliedQty[ing.id]) || 0);
        const remainingAfterClient = Math.max(0, ing.qtyRequired - clientQty);
        const stockUsed = Math.min(remainingAfterClient, ing.stockQty);
        const toOrder = Math.max(0, remainingAfterClient - ing.stockQty);

        const ingredientNetCost = toOrder * ing.unitPrice; 
        const ingredientStockValue = stockUsed * ing.unitPrice; 
        const ingredientClientCredit = clientQty * ing.unitPrice;

        totalClientCredit += ingredientClientCredit;
        netCraftCost += ingredientNetCost;
        totalStockValueUsed += ingredientStockValue;

        html += `
            <div class="item-row" style="background: rgba(0,0,0,0.15); padding: 8px; border-radius: 4px; border-left: 3px solid ${toOrder > 0 ? 'var(--danger)' : 'var(--success)'};">
                <div style="flex: 1; min-width: 180px;">
                    <strong>${ing.name}</strong> 
                    <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 2px;">
                        Req: ${ing.qtyRequired}x | Cost: ${ing.unitPrice}g/ea | 
                        <span style="color: var(--stock-blue);">Stock: ${ing.stockQty}x</span>
                    </div>
                </div>
                <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size: 0.75rem; color: var(--text-dim);">Client Provides:</label>
                        <input type="number" value="${window.clientSuppliedQty[ing.id] || 0}" min="0" max="${ing.qtyRequired}" style="width: 55px;" 
                            oninput="window.updateClientSupply('${ing.id}', this.value)">
                    </div>
                    <span style="font-size: 0.8rem; color: ${toOrder > 0 ? 'var(--danger)' : 'var(--success)'}; min-width: 130px; text-align: right; font-weight: bold;">
                        ${toOrder > 0 ? `Order ${toOrder}x (${ingredientNetCost.toFixed(2)}g)` : 'Covered'}
                    </span>
                </div>
            </div>
        `;
    });

    html += `</div>`;

    const netProfit = defaultSalePrice - netCraftCost - totalStockValueUsed;
    const profitMargin = defaultSalePrice > 0 ? ((netProfit / defaultSalePrice) * 100).toFixed(0) : 0;

    html += `
            <div class="batch-metrics">
                <div class="metric-box">
                    <span>Total Potions</span>
                    <strong>${totalUnits} Units</strong>
                </div>
                <div class="metric-box">
                    <span>Gross Craft Value</span>
                    <span>${fullGrossCraftCost.toFixed(2)}g</span>
                </div>
                <div class="metric-box">
                    <span>Client Savings</span>
                    <strong style="color: var(--custom-order);">${totalClientCredit.toFixed(2)}g</strong>
                </div>
                <div class="metric-box">
                    <span>Stock Value Used</span>
                    <strong style="color: var(--stock-blue);">${totalStockValueUsed.toFixed(2)}g</strong>
                </div>
                <div class="metric-box">
                    <span>Immediate Cost (To Order)</span>
                    <strong style="color: var(--danger);">${netCraftCost.toFixed(2)}g</strong>
                </div>
                <div class="metric-box">
                    <span>Default Sale Revenue</span>
                    <strong style="color: var(--gold);">${defaultSalePrice.toFixed(2)}g</strong>
                </div>
                <div class="metric-box">
                    <span>True Net Profit</span>
                    <strong class="${netProfit >= 0 ? 'profit-text' : 'loss-text'}">${netProfit.toFixed(2)}g (${profitMargin}%)</strong>
                </div>
            </div>
            
            <button class="execute-batch-btn" onclick="window.executeBatchCraft()">Execute Batch & Deduct Stock</button>
        </div>
    `;

    resultsDiv.innerHTML = html;
};

function getUsedIngredientIds() {
    const usedIds = new Set();
    if (potions) {
        Object.values(potions).forEach(p => {
            if (p.recipe && Array.isArray(p.recipe)) {
                p.recipe.forEach(r => {
                    if (r.ingredientId) usedIds.add(String(r.ingredientId));
                });
            }
        });
    }
    return usedIds;
}

window.renderIngredientsList = () => {
    const ingList = document.getElementById('ingredients-list');
    const unusedList = document.getElementById('unused-ingredients-list');
    const unusedContainer = document.getElementById('unused-ingredients-container');
    const unusedCountSpan = document.getElementById('unused-count');
    const searchInput = document.getElementById('ingredient-search-filter');
    
    if (!ingList || !unusedList) return;

    const usedIds = getUsedIngredientIds();
    let ingArray = Object.values(ingredients);

    let activeArray = [];
    let unusedArray = [];

    ingArray.forEach(i => {
        if (usedIds.has(String(i.id))) {
            activeArray.push(i);
        } else {
            unusedArray.push(i);
        }
    });

    activeArray.sort((a, b) => {
        const aStock = a.stockQty || 0;
        const aThreshold = a.threshold || 0;
        const aIsLow = aStock <= aThreshold;
        const aIsUnpriced = (a.price === 0 || a.price === '' || isNaN(a.price));

        const bStock = b.stockQty || 0;
        const bThreshold = b.threshold || 0;
        const bIsLow = bStock <= bThreshold;
        const bIsUnpriced = (b.price === 0 || b.price === '' || isNaN(b.price));

        if (aIsLow && !bIsLow) return -1;
        if (!aIsLow && bIsLow) return 1;

        if (!aIsUnpriced && bIsUnpriced) return -1;
        if (aIsUnpriced && !bIsUnpriced) return 1;

        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });

    unusedArray.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

    if (unusedArray.length > 0) {
        unusedContainer.classList.remove('hidden');
        unusedCountSpan.innerText = unusedArray.length;
    } else {
        unusedContainer.classList.add('hidden');
    }

    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    let filteredActive = activeArray;
    if (query) {
        filteredActive = activeArray.filter(i => (i.name || '').toLowerCase().includes(query));
    }

    if (filteredActive.length === 0) {
        ingList.innerHTML = `<p style="color: var(--text-dim); font-size: 0.85rem; margin: 0; padding: 6px;">No active ingredients found.</p>`;
    } else {
        ingList.innerHTML = filteredActive.map(i => generateIngredientRowHTML(i, false)).join('');
    }

    if (unusedArray.length === 0) {
        unusedList.innerHTML = `<p style="color: var(--text-dim); font-size: 0.85rem; margin: 0; padding: 6px;">No unused ingredients.</p>`;
    } else {
        unusedList.innerHTML = unusedArray.map(i => generateIngredientRowHTML(i, true)).join('');
    }
};

function generateIngredientRowHTML(i, isUnused) {
    const isEditing = window.editingIngredientId === i.id;
    const stockQty = i.stockQty || 0;
    const threshold = i.threshold || 0;
    const isLowStock = stockQty <= threshold;
    const isUnpriced = (i.price === 0 || i.price === '' || isNaN(i.price));

    let rowClass = 'item-row';
    if (isUnused) {
        rowClass += ' unused';
    } else if (isLowStock) {
        rowClass += ' low-stock';
    } else if (isUnpriced) {
        rowClass += ' unpriced';
    }

    if (isEditing) {
        return `
            <div class="${rowClass}" style="border-color: var(--accent);">
                <div style="flex: 2; display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 0.7rem; color: var(--text-dim);">Name:</label>
                    <input type="text" id="edit-ing-name-${i.id}" value="${i.name}" style="width: 100%; box-sizing: border-box;">
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 0.7rem; color: var(--text-dim);">Price (g):</label>
                    <input type="number" id="edit-ing-price-${i.id}" value="${i.price}" step="0.01" style="width: 100%; box-sizing: border-box;">
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 0.7rem; color: var(--text-dim);">Stock:</label>
                    <input type="number" id="edit-ing-stock-${i.id}" value="${stockQty}" min="0" style="width: 100%; box-sizing: border-box;">
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 0.7rem; color: var(--text-dim);">Threshold:</label>
                    <input type="number" id="edit-ing-threshold-${i.id}" value="${threshold}" min="0" style="width: 100%; box-sizing: border-box;">
                </div>
                <div style="display: flex; gap: 6px; align-items: flex-end; margin-top: 14px;">
                    <button class="save-btn" onclick="window.saveIngredientEdit(${i.id})">Save</button>
                    <button onclick="window.cancelEditIngredient()" style="background: var(--border); padding: 3px 8px; font-size: 0.75rem; border-radius: 4px;">Cancel</button>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="${rowClass}">
                <div style="flex: 2; display: flex; align-items: center; gap: 8px;">
                    <strong>${i.name}</strong>
                    ${isLowStock ? `<span style="font-size: 0.65rem; background: var(--danger); color: #fff; padding: 1px 5px; border-radius: 3px; font-weight: bold;">Needs Order</span>` : ''}
                    ${isUnpriced ? `<span style="font-size: 0.65rem; background: var(--warning); color: #000; padding: 1px 5px; border-radius: 3px; font-weight: bold;">Check Price</span>` : ''}
                </div>
                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; flex: 2; justify-content: flex-end;">
                    <span style="font-size: 0.85rem; color: var(--gold);">Price: <strong>${i.price}g</strong></span>
                    <span style="font-size: 0.85rem; color: var(--stock-blue);">Stock: <strong>${stockQty}</strong> <span style="font-size: 0.7rem; color: var(--text-dim);">(Min: ${threshold})</span></span>
                    <div style="display: flex; gap: 5px;">
                        <button class="edit-btn" onclick="window.startEditIngredient(${i.id})">Edit</button>
                        <button class="delete-btn" onclick="window.deleteIngredient(${i.id})">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }
}

window.renderAdminSelects = () => {
    const batchSelect = document.getElementById('batch-potion-select');
    const recipeSelect = document.getElementById('recipe-ing-select');

    if (batchSelect) {
        const allPotionsList = Object.values(potions);
        allPotionsList.sort((a, b) => (a.salePrice || 0) - (b.salePrice || 0));
        batchSelect.innerHTML = allPotionsList.map(p => `<option value="${p.id}">${p.name} (${Math.round(p.salePrice || 0)}g)</option>`).join('');
    }

    if (recipeSelect) {
        const allIngList = Object.values(ingredients);
        allIngList.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
        recipeSelect.innerHTML = allIngList.map(i => `<option value="${i.id}">${i.name} (${i.price}g/ea)</option>`).join('');
    }
};

window.renderAdmin = () => {
    if (!currentUser) return;
    window.renderIngredientsList();
    window.renderBatchCalculator();
    window.renderAdminSelects();
};