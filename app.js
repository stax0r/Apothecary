import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8QXlIWT76AZqttFWzLn4IKRRs3wYAaX8",
  authDomain: "alchemy-shop-dcceb.firebaseapp.com",
  databaseURL: "https://alchemy-shop-dcceb-default-rtdb.firebaseio.com",
  projectId: "alchemy-shop-dcceb",
  storageBucket: "alchemy-shop-dcceb.firebasestorage.app",
  messagingSenderId: "268082568197",
  appId: "1:268082568197:web:31de53d83bece61f0d506c",
  measurementId: "G-H2DY8TMDMN"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

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

window.toggleConfigModal = () => {
    const modal = document.getElementById('config-modal');
    if (modal) modal.classList.toggle('hidden');
};

let ingredients = {};
let potions = {};
let categoryOrders = {};
let locations = {};
let activeLocationId = "";
let currentRecipe = [];
let currentUser = null;
let selectedCategory = 'All';
let catalogSearchQuery = '';
let batchManifest = [];
let clientCart = [];
let customOrders = [];

let customInputState = {
    name: "",
    discord: "",
    message: "",
    atLocationChecked: false
};

window.clientSuppliedQty = {};
window.satchelPriceOverride = "";
window.editingIngredientId = null;
window.selectedQuickDepositIngredientId = null;

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
    window.renderLocationsConfig();
    window.renderCustomOrders();
});

onValue(ref(db, 'activeLocationId'), (snapshot) => {
    activeLocationId = snapshot.val() || "";
    window.renderLocationsConfig();
    window.renderCustomOrders();
});

window.renderLocationsConfig = () => {
    const select = document.getElementById('config-location-select');
    if (!select) return;

    const locArray = Object.values(locations);
    locArray.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

    if (locArray.length === 0) {
        select.innerHTML = `<option value="">No locations added</option>`;
        return;
    }

    select.innerHTML = locArray.map(l => `
        <option value="${l.id}" ${l.id === activeLocationId ? 'selected' : ''}>${l.name}</option>
    `).join('');
};

window.addNewLocation = () => {
    const input = document.getElementById('config-new-location-name');
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
        showBanner("Please enter a location name.", 'error');
        return;
    }

    const id = 'loc_' + Date.now();
    const locArray = Object.values(locations);
    
    const updates = {};
    updates[`locations/${id}`] = { id, name };
    
    if (locArray.length === 0 || !activeLocationId) {
        updates[`activeLocationId`] = id;
    }

    update(ref(db), updates).then(() => {
        input.value = '';
        showBanner("Location successfully added!");
    }).catch(err => {
        showBanner("Error adding location: " + err.message, 'error');
    });
};

window.setActiveLocation = (id) => {
    if (!id) return;
    set(ref(db, 'activeLocationId'), id).then(() => {
        showBanner("Active location updated!");
    }).catch(err => {
        showBanner("Error updating active location: " + err.message, 'error');
    });
};

window.deleteActiveLocation = () => {
    const select = document.getElementById('config-location-select');
    if (!select || !select.value) {
        showBanner("No location selected to delete.", 'error');
        return;
    }
    const idToDelete = select.value;
    const locName = locations[idToDelete] ? locations[idToDelete].name : "this location";

    if (window.confirm(`Are you sure you want to delete "${locName}"?`)) {
        const updates = {};
        updates[`locations/${idToDelete}`] = null;

        if (activeLocationId === idToDelete) {
            const remaining = Object.keys(locations).filter(id => id !== idToDelete);
            updates[`activeLocationId`] = remaining.length > 0 ? remaining[0] : "";
        }

        update(ref(db), updates).then(() => {
            showBanner("Location successfully deleted!");
        }).catch(err => {
            showBanner("Error deleting location: " + err.message, 'error');
        });
    }
};

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const authBtn = document.getElementById('auth-btn');
    const adminPanel = document.getElementById('admin-panel');
    const loginModal = document.getElementById('login-modal');
    const configBtn = document.getElementById('config-btn');
    const configModal = document.getElementById('config-modal');
    const bulkBatchSection = document.getElementById('bulk-batch-section');

    if (user) {
        if (authBtn) authBtn.innerText = "Logout";
        if (adminPanel) adminPanel.classList.remove('hidden');
        if (loginModal) loginModal.classList.add('hidden');
        if (configBtn) configBtn.classList.remove('hidden');
        if (bulkBatchSection) bulkBatchSection.classList.remove('hidden');
    } else {
        if (authBtn) authBtn.innerText = "Alchemist Login";
        if (adminPanel) adminPanel.classList.add('hidden');
        if (configBtn) configBtn.classList.add('hidden');
        if (configModal) configModal.classList.add('hidden');
        if (bulkBatchSection) bulkBatchSection.classList.add('hidden');
    }
    window.render();
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

window.updatePotionStockQty = (id, newQty) => {
    const qty = parseInt(newQty) || 0;
    set(ref(db, `potions/${id}/stockQty`), qty);
};

window.toggleShopVisibility = (id, currentInShop) => {
    const newVal = currentInShop !== false ? false : true;
    set(ref(db, `potions/${id}/inShop`), newVal);
};

window.toggleForceOutStock = (id, currentForceOut) => {
    const newVal = currentForceOut ? false : true;
    set(ref(db, `potions/${id}/forceOut`), newVal);
};

window.deletePotion = (id) => {
    if (window.confirm("Are you sure you want to delete this potion from the catalog? This action cannot be undone.")) {
        remove(ref(db, `potions/${id}`));
    }
};

window.moveCategoryOrder = (catName, direction) => {
    const potionArray = Object.values(potions);
    let categories = [...new Set(potionArray.map(p => p.category || 'General'))];

    categories.sort((a, b) => {
        const orderA = categoryOrders[a] !== undefined ? categoryOrders[a] : 999;
        const orderB = categoryOrders[b] !== undefined ? categoryOrders[b] : 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
    });

    const index = categories.indexOf(catName);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const temp = categories[index];
    categories[index] = categories[targetIndex];
    categories[targetIndex] = temp;

    const updates = {};
    categories.forEach((cat, idx) => {
        updates[`categoryOrders/${cat}`] = idx + 1;
    });

    update(ref(db), updates);
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
    window.satchelPriceOverride = "";
    window.renderCart(); 
};

window.renderCart = () => {
    const listDiv = document.getElementById('cart-items-list');
    const summaryDiv = document.getElementById('cart-summary-area');
    if (!listDiv || !summaryDiv) return;

    if (clientCart.length === 0) {
        listDiv.innerHTML = `<p style="color: var(--text-dim); font-size: 0.85rem; margin: 0;">Your satchel is empty. Select available potions from the catalog below.</p>`;
        summaryDiv.innerHTML = '';
        window.renderAdminSalesHelper();
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
    window.renderAdminSalesHelper();
};

window.updateSatchelPriceOverride = (val) => {
    window.satchelPriceOverride = val;
    window.renderAdminSalesHelper();
};

window.renderSatchelOverrideInput = () => {
    const controlArea = document.getElementById('satchel-override-control-area');
    if (!controlArea) return;
    
    let totalSatchelDefaultPrice = 0;
    clientCart.forEach(item => {
        const p = potions[item.potionId];
        if (p) totalSatchelDefaultPrice += (p.salePrice || 0) * item.qty;
    });

    controlArea.innerHTML = `
        <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; border: 1px solid var(--border); display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 225px;">
                <label style="font-size: 0.75rem; color: var(--text-dim); display: block; margin-bottom: 4px;">Deal Discount Override (Final Sale Price)</label>
                <input type="number" id="satchel-price-override-input" value="${window.satchelPriceOverride}" placeholder="Default: ${totalSatchelDefaultPrice.toFixed(2)}g" step="0.01" style="width: 100%; box-sizing: border-box;" oninput="window.updateSatchelPriceOverride(this.value)">
            </div>
            ${window.satchelPriceOverride !== "" ? `<button onclick="window.updateSatchelPriceOverride('')" style="background: var(--border); font-size: 0.8rem; padding: 6px 10px; margin-top: 18px;">Reset Default</button>` : ''}
        </div>
    `;
};

window.renderAdminSalesHelper = () => {
    const container = document.getElementById('admin-sales-helper-content');
    const wrapperContainer = document.getElementById('admin-sales-helper-container');
    if (!container || !wrapperContainer) return;

    if (!currentUser) {
        wrapperContainer.classList.add('hidden');
        return;
    }

    wrapperContainer.classList.remove('hidden');
    window.renderSatchelOverrideInput();

    if (clientCart.length === 0) {
        container.innerHTML = `<p style="color: var(--text-dim); font-size: 0.85rem; margin: 0;">Satchel is currently empty. Add potions to review business analytics.</p>`;
        return;
    }

    let totalSatchelDefaultPrice = 0;
    let totalSatchelCost = 0;
    const ingredientBreakdown = {};

    clientCart.forEach(item => {
        const p = potions[item.potionId];
        if (!p) return;
        const itemQty = item.qty;
        totalSatchelDefaultPrice += (p.salePrice || 0) * itemQty;

        const potionCost = calculatePotionCost(p.recipe);
        totalSatchelCost += potionCost * itemQty;

        if (p.recipe && Array.isArray(p.recipe)) {
            p.recipe.forEach(r => {
                const ing = ingredients[r.ingredientId];
                const unitPrice = ing ? ing.price : 0;
                const requiredTotal = r.qty * itemQty;
                const finalCostPerIngredient = unitPrice * requiredTotal;

                if (!ingredientBreakdown[r.ingredientId]) {
                    ingredientBreakdown[r.ingredientId] = {
                        name: r.name,
                        totalQty: 0,
                        unitPrice: unitPrice,
                        finalPrice: 0
                    };
                }
                ingredientBreakdown[r.ingredientId].totalQty += requiredTotal;
                ingredientBreakdown[r.ingredientId].finalPrice += finalCostPerIngredient;
            });
        }
    });

    const finalRevenue = window.satchelPriceOverride !== "" && !isNaN(parseFloat(window.satchelPriceOverride))
        ? parseFloat(window.satchelPriceOverride) : totalSatchelDefaultPrice;

    const netProfit = finalRevenue - totalSatchelCost;
    const profitMargin = finalRevenue > 0 ? ((netProfit / finalRevenue) * 100).toFixed(0) : 0;

    const sortedIngredients = Object.values(ingredientBreakdown).sort((a, b) => 
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );

    let html = `
        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 12px;">
            <div class="batch-metrics" style="margin-top: 0; padding-top: 0; border-top: none;">
                <div class="metric-box">
                    <span>Default Satchel Price</span>
                    <span>${totalSatchelDefaultPrice.toFixed(2)}g</span>
                </div>
                <div class="metric-box">
                    <span>Final Sale Revenue</span>
                    <strong style="color: var(--gold);">${finalRevenue.toFixed(2)}g</strong>
                </div>
                <div class="metric-box">
                    <span>Satchel Craft Cost</span>
                    <strong style="color: var(--danger);">${totalSatchelCost.toFixed(2)}g</strong>
                </div>
                <div class="metric-box">
                    <span>Net Profit / Loss</span>
                    <strong class="${netProfit >= 0 ? 'profit-text' : 'loss-text'}">${netProfit.toFixed(2)}g (${profitMargin}%)</strong>
                </div>
            </div>

            <h4 style="font-size: 0.9rem; margin-top: 5px; color: var(--stock-blue);">Ingredient Price Breakdown & Requirements</h4>
            <div style="display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto;">
    `;

    if (sortedIngredients.length === 0) {
        html += `<p style="color: var(--text-dim); font-size: 0.85rem; margin: 0;">No ingredients required for potions in the satchel.</p>`;
    } else {
        sortedIngredients.forEach(ing => {
            html += `
                <div class="item-row" style="background: rgba(0,0,0,0.2); padding: 6px 10px; margin-bottom: 0;">
                    <span><strong>${ing.name}</strong> <span style="font-size: 0.75rem; color: var(--text-dim);">(${ing.unitPrice}g per unit)</span></span>
                    <span>Qty: <strong>${ing.totalQty}x</strong> | Total Cost: <strong style="color: var(--gold);">${ing.finalPrice.toFixed(2)}g</strong></span>
                </div>
            `;
        });
    }

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
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

    let totalCost = 0;
    let orderLines = [];

    customOrders.forEach(item => {
        const p = potions[item.potionId];
        if (!p) return;
        const lineTotal = (p.salePrice || 0) * item.qty;
        totalCost += lineTotal;
        orderLines.push(`• ${item.qty}x ${p.name} (${lineTotal.toFixed(2)}g)`);
    });

    const activeLocObj = locations[activeLocationId];
    const activeLocationName = activeLocObj ? activeLocObj.name : "Not specified";

    const formData = {
        name: clientName,
        discordId: clientDiscord || "N/A",
        activeLocation: activeLocationName,
        deliveryInstructions: clientMessage || "None",
        orderItems: orderLines.join('\n'),
        estimatedTotal: `${totalCost.toFixed(2)} Gold`
    };

    try {
        const response = await fetch("/.netlify/functions/send-order", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showBanner("Order successfully sent!");
            customOrders = [];
            customInputState = { name: "", discord: "", message: "", atLocationChecked: false };
            window.renderCustomOrders();
        } else {
            showBanner("Failed to send order! " + (result.error || ""), 'error');
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

function calculatePotionCost(recipe) {
    if (!recipe) return 0;
    return recipe.reduce((total, item) => {
        const ing = ingredients[item.ingredientId];
        return total + (ing ? ing.price * item.qty : 0);
    }, 0);
}

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

window.renderCategoryOrderList = () => {
    const container = document.getElementById('category-order-list');
    if (!container) return;

    const potionArray = Object.values(potions);
    let categories = [...new Set(potionArray.map(p => p.category || 'General'))];

    categories.sort((a, b) => {
        const orderA = categoryOrders[a] !== undefined ? categoryOrders[a] : 999;
        const orderB = categoryOrders[b] !== undefined ? categoryOrders[b] : 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
    });

    if (categories.length === 0) {
        container.innerHTML = `<p style="color: var(--text-dim); font-size: 0.8rem; margin: 0;">No categories available.</p>`;
        return;
    }

    container.innerHTML = categories.map((cat, idx) => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-color); border: 1px solid var(--border); padding: 6px 10px; border-radius: 4px; margin-bottom: 6px;">
            <span style="font-size: 0.85rem; font-weight: bold;">${cat}</span>
            <div style="display: flex; gap: 4px;">
                <button onclick="window.moveCategoryOrder('${cat}', 'up')" ${idx === 0 ? 'disabled class="btn-disabled"' : ''} style="padding: 2px 6px; font-size: 0.7rem;">▲</button>
                <button onclick="window.moveCategoryOrder('${cat}', 'down')" ${idx === categories.length - 1 ? 'disabled class="btn-disabled"' : ''} style="padding: 2px 6px; font-size: 0.7rem;">▼</button>
            </div>
        </div>
    `).join('');
};

window.renderCatalogOnly = () => {
    const catalog = document.getElementById('catalog');
    const filterBar = document.getElementById('filter-bar');
    const batchSelect = document.getElementById('batch-potion-select');
    const recipeSelect = document.getElementById('recipe-ing-select');

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

    let filtered = potionArray;

    if (!currentUser) {
        filtered = filtered.filter(p => p.inShop !== false);
    }

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
            const inShop = p.inShop !== false;
            const forceOut = p.forceOut === true;
            const isOutOfStock = stockQty <= 0 || forceOut;
            const baseCost = calculatePotionCost(p.recipe);
            const displayPrice = Math.round(p.salePrice || 0);

            let recipeItemsHtml = '';
            if (p.recipe && Array.isArray(p.recipe) && p.recipe.length > 0) {
                recipeItemsHtml = `<ul class="ingredient-list">` + 
                    p.recipe.map(r => `<li>• ${r.qty}x ${r.name}</li>`).join('') + 
                `</ul>`;
            } else {
                recipeItemsHtml = `<div class="potion-desc">Found Potion (No Recipe Required)</div>`;
            }

            let adminControls = '';
            if (currentUser) {
                adminControls = `
                    <div style="margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <label style="font-size: 0.7rem; color: var(--text-dim);">Stock:</label>
                                <input type="number" value="${stockQty}" min="0" style="width: 55px; padding: 2px 4px; font-size: 0.8rem;" onchange="window.updatePotionStockQty(${p.id}, this.value)">
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button class="visible-btn ${inShop ? '' : 'off'}" onclick="window.toggleShopVisibility(${p.id}, ${inShop})" title="Toggle Catalog Visibility">${inShop ? 'Visible' : 'Hidden'}</button>
                                <button class="stock-btn ${forceOut ? 'off' : ''}" onclick="window.toggleForceOutStock(${p.id}, ${forceOut})" title="Toggle Force Out of Stock">${forceOut ? 'Forced Out' : 'In Stock'}</button>
                            </div>
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <button class="edit-btn" style="flex: 1;" onclick="window.editPotion(${p.id})">Edit</button>
                            <button class="delete-btn" style="flex: 1;" onclick="window.deletePotion(${p.id})">Delete</button>
                        </div>
                    </div>
                `;
            }

            let clientCardAction = '';
            if (inShop || currentUser) {
                clientCardAction = `
                    <div class="action-btn-group">
                        <button class="add-cart-btn ${isOutOfStock ? 'btn-disabled' : ''}" ${isOutOfStock ? 'disabled' : ''} onclick="window.addToCart(${p.id})">Add to Satchel</button>
                        <button class="custom-order-btn" onclick="window.addCustomOrder(${p.id})">Custom Order</button>
                    </div>
                `;
            } else {
                clientCardAction = `<div style="text-align: center; font-size: 0.8rem; color: var(--text-dim); font-style: italic; margin-top: 8px;">Currently Not in Shop</div>`;
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
                        ${currentUser ? `
                            <div class="cost-badge">
                                <span>Base Cost: ${baseCost.toFixed(2)}g</span>
                                <span class="${(p.salePrice - baseCost) >= 0 ? 'profit-text' : 'loss-text'}">Profit: ${(p.salePrice - baseCost).toFixed(2)}g</span>
                            </div>
                        ` : ''}
                        ${clientCardAction}
                        ${adminControls}
                    </div>
                </div>
            `;
        }).join('');
    }

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

window.render = () => {
    window.renderCatalogOnly();
    window.renderIngredientsList();
    window.renderCategoryOrderList();
    window.renderCart();
    window.renderCustomOrders();
    window.renderBatchCalculator();
};