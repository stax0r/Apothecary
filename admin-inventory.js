// admin-inventory.js
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
let currentUser = null;

window.editingIngredientId = null;
window.selectedQuickDepositIngredientId = null;

onValue(ref(db, 'ingredients'), (snapshot) => {
    ingredients = snapshot.val() || {};
    window.renderInventoryPage();
});

onValue(ref(db, 'potions'), (snapshot) => {
    potions = snapshot.val() || {};
    window.renderInventoryPage();
});

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const loginModal = document.getElementById('login-modal');
    if (user) {
        if (loginModal) loginModal.classList.add('hidden');
    } else {
        if (loginModal) loginModal.classList.remove('hidden');
    }
    window.renderInventoryPage();
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
    showBanner("Ingredient registered successfully!");
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

    const oldName = ingredients[id] ? ingredients[id].name : '';

    update(ref(db, `ingredients/${id}`), {
        name: newName,
        price: Math.max(0, price),
        stockQty: Math.max(0, stockQty),
        threshold: Math.max(0, threshold)
    }).then(() => {
        window.editingIngredientId = null;

        // Automatically update ingredient names inside existing potion recipes
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

        showBanner("Ingredient updated successfully!");
        window.renderIngredientsList();
    });
};

window.deleteIngredient = (id) => {
    if (window.confirm("Are you sure you want to delete this ingredient?")) {
        if (window.editingIngredientId === id) window.editingIngredientId = null;
        remove(ref(db, `ingredients/${id}`));
        showBanner("Ingredient deleted.");
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
        dropdown.innerHTML = `<div class="autocomplete-item" style="color: var(--text-dim); cursor: default;">No matches</div>`;
        dropdown.classList.remove('hidden');
        window.selectedQuickDepositIngredientId = null;
        return;
    }

    dropdown.innerHTML = matches.map(i => `
        <div class="autocomplete-item" onclick="window.selectQuickDepositIngredient('${i.id}', '${i.name.replace(/'/g, "\\'")} ')">
            ${i.name} <span style="color: var(--stock-blue); font-size: 0.75rem;">(${i.stockQty || 0})</span>
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
        showBanner("Select a valid ingredient and positive quantity.", 'error');
        return;
    }

    const newStock = (ingredients[id].stockQty || 0) + addQty;
    set(ref(db, `ingredients/${id}/stockQty`), newStock).then(() => {
        showBanner(`Added ${addQty} to ${ingredients[id].name}.`);
        const input = document.getElementById('quick-deposit-input');
        if (input) input.value = '';
        if (qtyInput) qtyInput.value = '1';
        window.selectedQuickDepositIngredientId = null;
    });
};

window.renderIngredientsList = () => {
    const ingList = document.getElementById('ingredients-list');
    const unusedList = document.getElementById('unused-ingredients-list');
    const unusedContainer = document.getElementById('unused-ingredients-container');
    const unusedCountSpan = document.getElementById('unused-count');
    const searchInput = document.getElementById('ingredient-search-filter');
    if (!ingList || !unusedList) return;

    const usedIds = new Set();
    Object.values(potions).forEach(p => {
        if (p.recipe) p.recipe.forEach(r => usedIds.add(String(r.ingredientId)));
    });

    let activeArray = [], unusedArray = [];
    Object.values(ingredients).forEach(i => {
        if (usedIds.has(String(i.id))) activeArray.push(i);
        else unusedArray.push(i);
    });

    activeArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    unusedArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (unusedArray.length > 0) {
        unusedContainer.classList.remove('hidden');
        unusedCountSpan.innerText = unusedArray.length;
    } else {
        unusedContainer.classList.add('hidden');
    }

    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    let filtered = query ? activeArray.filter(i => (i.name || '').toLowerCase().includes(query)) : activeArray;

    ingList.innerHTML = filtered.length ? filtered.map(i => generateIngredientRowHTML(i)).join('') : '<p style="color:var(--text-dim);font-size:0.8rem;">No ingredients found.</p>';
    unusedList.innerHTML = unusedArray.length ? unusedArray.map(i => generateIngredientRowHTML(i)).join('') : '';
};

function generateIngredientRowHTML(i) {
    const isEditing = window.editingIngredientId === i.id;
    if (isEditing) {
        return `
            <div class="item-row" style="flex-direction: column; gap: 4px; border-color: var(--accent);">
                <input type="text" id="edit-ing-name-${i.id}" value="${i.name}" style="width: 100%;">
                <div style="display: flex; gap: 4px; width: 100%;">
                    <input type="number" id="edit-ing-price-${i.id}" value="${i.price}" step="0.01" placeholder="Price" style="flex: 1;">
                    <input type="number" id="edit-ing-stock-${i.id}" value="${i.stockQty || 0}" placeholder="Stock" style="flex: 1;">
                    <input type="number" id="edit-ing-threshold-${i.id}" value="${i.threshold || 0}" placeholder="Min" style="flex: 1;">
                </div>
                <div style="display: flex; gap: 4px; justify-content: flex-end; width: 100%;">
                    <button onclick="window.saveIngredientEdit(${i.id})" style="padding: 2px 8px; background: var(--success); font-size: 0.75rem;">Save</button>
                    <button onclick="window.cancelEditIngredient()" style="padding: 2px 8px; background: var(--border); font-size: 0.75rem;">Cancel</button>
                </div>
            </div>
        `;
    }
    return `
        <div class="item-row">
            <span style="font-size: 0.85rem;"><strong>${i.name}</strong> (${i.price}g)</span>
            <div style="display: flex; gap: 8px; align-items: center;">
                <span style="font-size: 0.8rem; color: var(--stock-blue);">Stock: ${i.stockQty || 0}</span>
                <button class="edit-btn" onclick="window.startEditIngredient(${i.id})" style="padding: 1px 5px; font-size: 0.7rem;">Edit</button>
                <button class="delete-btn" onclick="window.deleteIngredient(${i.id})" style="padding: 1px 5px; font-size: 0.7rem;">X</button>
            </div>
        </div>
    `;
}

window.renderInventoryPage = () => {
    if (!currentUser) return;
    window.renderIngredientsList();
};