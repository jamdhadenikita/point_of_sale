// pos-sheets-integration.js
// ===== GOOGLE SHEETS CONFIGURATION =====
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzDobR3xCuzsH5mOWqE7T8YWjcneMZ4NgeyWw7mCmOWViq8bDBfzuNqz0ENQ6f07GjlUg/exec';
const ORDER_SUBMISSION_URL = 'https://script.google.com/macros/s/AKfycbyul6UkH5uehnc-hjATTk8Hg_T6c6Xo75bUKYczonF8Ie-yNooeH5BBlfWJBD4v9SBSlw/exec';

// Global Variables
let bakeryProducts = [];
let cart = [];
let currentCategory = 'all';
let currentPaymentMethod = 'cash';
let discountType = 'percent';
let tempCart = [];
let tempSubtotal = 0;
let tempDiscountAmount = 0;
let tempTaxableAmount = 0;
let tempGstAmount = 0;
let tempDiscountType = 'percent';
let tempCustomerName = '';
let tempCustomerMobile = '';

// ===== TOAST NOTIFICATION =====
function showToast(message, type = 'info') {
    const colors = { 
        success: '#059669', 
        error: '#dc2626', 
        info: '#3b82f6',
        warning: '#f59e0b'
    };
    
    Toastify({
        text: message,
        duration: 3000,
        gravity: 'top',
        position: 'right',
        backgroundColor: colors[type] || colors.info,
        stopOnFocus: true
    }).showToast();
}

// ===== CACHE MANAGEMENT =====
const CACHE_KEY = 'bakeryProductsCache';
const CACHE_TIME_KEY = 'bakeryProductsCacheTime';
const CACHE_DURATION = 3600000; // 1 hour

function saveToCache(products) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(products));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        console.log('✅ Data saved to cache');
    } catch (e) {
        console.warn('⚠️ Failed to save to cache:', e);
    }
}

function loadFromCache() {
    try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        const cacheTime = localStorage.getItem(CACHE_TIME_KEY);
        
        if (!cachedData || !cacheTime) {
            return null;
        }
        
        const age = Date.now() - parseInt(cacheTime);
        if (age > CACHE_DURATION) {
            localStorage.removeItem(CACHE_KEY);
            localStorage.removeItem(CACHE_TIME_KEY);
            return null;
        }
        
        return JSON.parse(cachedData);
    } catch (e) {
        console.warn('⚠️ Failed to load from cache:', e);
        return null;
    }
}

// ===== PRODUCT LOADING =====
async function loadProductsFromSheets() {
    console.log('🔄 Starting to load products...');
    
    const loadingProducts = document.getElementById('loadingProducts');
    const productsGrid = document.getElementById('productsGrid');
    
    if (loadingProducts) loadingProducts.style.display = 'block';
    if (productsGrid) productsGrid.innerHTML = '';
    
    // First try cache
    const cachedProducts = loadFromCache();
    if (cachedProducts && cachedProducts.length > 0) {
        console.log('📦 Loading from cache...');
        bakeryProducts = cachedProducts;
        displayProducts(bakeryProducts);
        if (loadingProducts) loadingProducts.style.display = 'none';
        showToast(`${bakeryProducts.length} products loaded from cache`, 'info');
        
        // Refresh in background
        setTimeout(refreshProductsInBackground, 1000);
        return;
    }
    
    // Load from Google Sheets
    console.log('🌐 Loading from Google Sheets...');
    
    try {
        const callbackName = 'handleProducts_' + Date.now();
        const url = `${GOOGLE_SHEETS_URL}?callback=${callbackName}&t=${Date.now()}`;
        
        console.log('📡 Fetching:', url);
        
        const data = await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error('❌ Timeout: Apps Script not responding. Check deployment!'));
            }, 15000);
            
            function cleanup() {
                clearTimeout(timeoutId);
                if (window[callbackName]) delete window[callbackName];
                const script = document.getElementById(callbackName);
                if (script) script.remove();
            }
            
            window[callbackName] = function(response) {
                console.log('✅ Received response:', response);
                cleanup();
                resolve(response);
            };
            
            const script = document.createElement('script');
            script.src = url;
            script.id = callbackName;
            script.onerror = function() {
                cleanup();
                reject(new Error('❌ Script load failed. Check Apps Script URL and deployment!'));
            };
            
            document.head.appendChild(script);
        });
        
        if (data && data.success && Array.isArray(data.products) && data.products.length > 0) {
            bakeryProducts = data.products.map((product, index) => ({
                id: product.id || index + 1,
                name: product.name || 'Unnamed Product',
                price: parseFloat(product.price) || 0,
                category: product.category || 'OTHER',
                sku: product.sku || 'N/A',
                image: product.image || '🍰',
                discount: parseFloat(product.discount) || 0
            }));
            
            console.log(`✅ Loaded ${bakeryProducts.length} products`);
            saveToCache(bakeryProducts);
            displayProducts(bakeryProducts);
            showToast(`${bakeryProducts.length} products loaded!`, 'success');
        } else {
            throw new Error('❌ No products in response or invalid format');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        if (loadingProducts) loadingProducts.style.display = 'none';
        if (productsGrid) {
            productsGrid.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <i class="fas fa-exclamation-triangle text-5xl text-red-500 mb-4"></i>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">Failed to Load Products</h3>
                    <p class="text-gray-600 mb-4">${error.message}</p>
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-left max-w-md mx-auto">
                        <p class="font-semibold text-yellow-800 mb-2">⚠️ Troubleshooting Steps:</p>
                        <ol class="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
                            <li>Check Apps Script is deployed as <strong>Web App</strong></li>
                            <li>Set "Who has access" to <strong>Anyone</strong></li>
                            <li>URL should end with <strong>/exec</strong> not /dev</li>
                            <li>Make sure sheet is named <strong>"Products"</strong></li>
                            <li>Check browser console for details</li>
                        </ol>
                    </div>
                    <button onclick="loadProductsFromSheets()" class="mt-4 bg-primary text-white px-6 py-2 rounded-lg hover:bg-secondary">
                        <i class="fas fa-redo mr-2"></i>Retry
                    </button>
                </div>
            `;
        }
        showToast('Failed to load products. Check console!', 'error');
    } finally {
        if (loadingProducts) loadingProducts.style.display = 'none';
    }
}

function refreshProductsInBackground() {
    console.log('🔄 Background refresh...');
    const callbackName = 'refresh_' + Date.now();
    
    window[callbackName] = function(data) {
        if (data && data.success && data.products) {
            const processed = data.products.map((p, i) => ({
                id: p.id || i + 1,
                name: p.name || 'Unnamed',
                price: parseFloat(p.price) || 0,
                category: p.category || 'OTHER',
                sku: p.sku || 'N/A',
                image: p.image || '🍰',
                discount: parseFloat(p.discount) || 0
            }));
            saveToCache(processed);
            console.log('✅ Background refresh complete');
        }
        delete window[callbackName];
        const script = document.getElementById(callbackName);
        if (script) script.remove();
    };
    
    const script = document.createElement('script');
    script.src = `${GOOGLE_SHEETS_URL}?callback=${callbackName}&t=${Date.now()}`;
    script.id = callbackName;
    script.onerror = () => {
        delete window[callbackName];
        script.remove();
    };
    document.head.appendChild(script);
}

// ===== DISPLAY PRODUCTS =====
function displayProducts(productsToShow) {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;
    
    if (!productsToShow || productsToShow.length === 0) {
        productsGrid.innerHTML = `
            <div class="col-span-full text-center py-8">
                <i class="fas fa-box-open text-4xl text-gray-400 mb-2"></i>
                <p class="text-gray-500">No products available</p>
            </div>
        `;
        return;
    }
    
    productsGrid.innerHTML = productsToShow.map(product => {
        const finalPrice = product.discount > 0 
            ? product.price * (1 - product.discount / 100) 
            : product.price;
        
        const originalPrice = product.discount > 0 
            ? `<p class="text-xs text-gray-400 line-through text-center">₹${product.price.toFixed(2)}</p>` 
            : '';
        
        const badge = product.discount > 0 
            ? `<span class="discount-badge">${product.discount}% OFF</span>` 
            : '';
        
        return `
            <div class="product-card bg-gray-50 p-4 rounded-lg hover:shadow-md transition cursor-pointer border relative" 
                 onclick="addToCart(${product.id})">
                ${badge}
                <div class="text-4xl text-center mb-2">
                    <div class="w-16 h-16 mx-auto flex items-center justify-center text-3xl">
                       <img src="${product.image}" alt="${product.name}" class="w-full h-full object-contain">
                    </div>
                </div>
                <h3 class="font-semibold text-sm mb-1 text-center text-gray-800 truncate">${product.name}</h3>
                ${originalPrice}
                <p class="text-lg font-bold text-primary text-center">₹${finalPrice.toFixed(2)}</p>
                <p class="text-xs text-gray-500 text-center mt-1">${product.sku}</p>
                <div class="mt-2 text-center">
                    <span class="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">${product.category}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ===== CART FUNCTIONS =====
function addToCart(productId) {
    const product = bakeryProducts.find(p => p.id == productId);
    if (!product) {
        showToast('Product not found!', 'error');
        return;
    }
    
    const discountedPrice = product.discount > 0 
        ? product.price * (1 - product.discount / 100) 
        : product.price;
    
    const existingItem = cart.find(item => item.id == productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
        showToast(`${product.name} qty: ${existingItem.quantity}`, 'info');
    } else {
        cart.push({
            ...product,
            quantity: 1,
            finalPrice: discountedPrice,
            originalPrice: product.price
        });
        showToast(`${product.name} added`, 'success');
    }
    
    updateCartDisplay();
    updateTotals();
}

function updateCartDisplay() {
    const cartItems = document.getElementById('cartItems');
    const processPaymentBtn = document.getElementById('processPayment');
    
    if (!cartItems) return;
    
    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-shopping-cart text-4xl mb-2 opacity-50"></i>
                <p>Cart is empty</p>
            </div>
        `;
        if (processPaymentBtn) processPaymentBtn.disabled = true;
        return;
    }
    
    cartItems.innerHTML = cart.map(item => {
        const priceDisplay = item.discount > 0 
            ? `<p class="text-xs text-gray-600">₹${item.finalPrice.toFixed(2)} <span class="text-red-500">(${item.discount}% off)</span></p>`
            : `<p class="text-xs text-gray-600">₹${item.finalPrice.toFixed(2)} each</p>`;
        
        return `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-2 border">
                <div class="flex items-center flex-1 min-w-0">
                    <img src="${item.image}" alt="${item.name}" class="w-16 h-16 object-contain mr-3">
                    <div class="min-w-0">
                        <p class="font-semibold text-sm truncate">${item.name}</p>
                        ${priceDisplay}
                    </div>
                </div>
                <div class="flex items-center">
                    <button class="bg-red-700 text-white w-6 h-6 rounded-full text-xs" 
                            onclick="changeQuantity(${item.id}, -1)">-</button>
                    <span class="mx-2 font-semibold min-w-[20px] text-center">${item.quantity}</span>
                    <button class="bg-green-700 text-white w-6 h-6 rounded-full text-xs" 
                            onclick="changeQuantity(${item.id}, 1)">+</button>
                    <button class="ml-2 text-red-700" onclick="removeFromCart(${item.id})">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    if (processPaymentBtn) processPaymentBtn.disabled = false;
}

function changeQuantity(productId, change) {
    const item = cart.find(i => i.id == productId);
    if (!item) return;
    
    item.quantity += change;
    
    if (item.quantity <= 0) {
        removeFromCart(productId);
        return;
    }
    
    updateCartDisplay();
    updateTotals();
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id != productId);
    updateCartDisplay();
    updateTotals();
    showToast('Item removed', 'info');
}

function updateTotals() {
    const discountEl = document.getElementById('discount');
    const subtotal = cart.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0);
    const discountInput = discountEl ? parseFloat(discountEl.value) || 0 : 0;
    let discountAmount = 0;
    
    if (discountType === 'percent') {
        discountAmount = subtotal * (discountInput / 100);
    } else {
        discountAmount = Math.min(discountInput, subtotal);
    }
    
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const gstAmount = taxableAmount * 0.05;
    const total = taxableAmount + gstAmount;
    
    const subtotalEl = document.getElementById('subtotal');
    const discountAmountEl = document.getElementById('discountAmount');
    const gstAmountEl = document.getElementById('gstAmount');
    const totalEl = document.getElementById('total');
    
    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
    if (discountAmountEl) discountAmountEl.textContent = `-₹${discountAmount.toFixed(2)}`;
    if (gstAmountEl) gstAmountEl.textContent = `₹${gstAmount.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `₹${total.toFixed(2)}`;
}

function clearCart() {
    if (cart.length === 0) {
        showToast('Cart is already empty', 'info');
        return;
    }
    
    if (confirm('Clear cart?')) {
        cart = [];
        const discountEl = document.getElementById('discount');
        if (discountEl) discountEl.value = '0';
        updateCartDisplay();
        updateTotals();
        showToast('Cart cleared', 'success');
    }
}

// ===== PAYMENT =====
function processPayment() {
    if (cart.length === 0) {
        showToast('Cart is empty!', 'error');
        return;
    }
    
    const customerName = document.getElementById('customerName').value.trim();
    if (!customerName) {
        showToast('Enter customer name', 'error');
        document.getElementById('customerName').focus();
        return;
    }
    
    const paymentModal = document.getElementById('paymentModal');
    paymentModal.classList.add('show');
    
    // Store temp data
    const discountEl = document.getElementById('discount');
    tempCart = [...cart];
    tempSubtotal = cart.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0);
    const discountInput = discountEl ? parseFloat(discountEl.value) || 0 : 0;
    tempDiscountAmount = discountType === 'percent' ? tempSubtotal * (discountInput / 100) : Math.min(discountInput, tempSubtotal);
    tempTaxableAmount = Math.max(0, tempSubtotal - tempDiscountAmount);
    tempGstAmount = tempTaxableAmount * 0.05;
    tempDiscountType = discountType;
    tempCustomerName = customerName;
    tempCustomerMobile = document.getElementById('customerMobile').value.trim() || 'N/A';
    
    // Simulate processing
    let progress = 0;
    const progressBar = document.getElementById('progressBar');
    const interval = setInterval(() => {
        progress += 20;
        if (progressBar) progressBar.style.width = Math.min(progress, 100) + '%';
        
        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                paymentModal.classList.remove('show');
                showReceipt();
                clearCart();
            }, 500);
        }
    }, 200);
}

// ===== RECEIPT =====
function showReceipt() {
    const receiptContent = document.getElementById('receiptContent');
    const receiptModal = document.getElementById('receiptModal');
    const printArea = document.getElementById('printArea');
    
    const now = new Date();
    const receiptNumber = 'R' + Date.now().toString().slice(-6);
    const orderId = 'ORD' + Date.now().toString().slice(-6);
    const tableNumber = document.getElementById('tableNumber').value.trim() || 'N/A';
    const total = tempTaxableAmount + tempGstAmount;
    
    const receiptHTML = `
        <div class="text-center border-b pb-2 mb-2">
            <h3 class="font-bold text-lg">TheHome Bakery</h3>
            <p class="text-xs">G-004, Aldea Espanola Phase 6 & 7</p>
            <p class="text-xs">opp. Orchid Hotel, Mahalunge, Pune</p>
            <p class="text-xs">Contact: 9537999898</p>
            <p class="text-xs">GSTIN: 27BAIPD6573J1ZE</p>
        </div>
        <div class="mb-2 text-xs">
            <p><strong>Order ID:</strong> ${orderId}</p>
            <p><strong>Receipt:</strong> ${receiptNumber}</p>
            <p><strong>Date:</strong> ${now.toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${now.toLocaleTimeString()}</p>
            <p><strong>Customer:</strong> ${tempCustomerName}</p>
            <p><strong>Mobile:</strong> ${tempCustomerMobile}</p>
            <p><strong>Table:</strong> ${tableNumber}</p>
            <p><strong>Payment:</strong> ${currentPaymentMethod.toUpperCase()}</p>
        </div>
        <div class="border-t pt-1 mb-2 text-xs">
            ${tempCart.map(item => `
                <div class="flex justify-between py-0.5">
                    <span>${item.name.substring(0, 20)} x${item.quantity}</span>
                    <span>₹${(item.finalPrice * item.quantity).toFixed(2)}</span>
                </div>
            `).join('')}
        </div>
        <div class="border-t pt-1 text-xs">
            <div class="flex justify-between"><span>Subtotal:</span><span>₹${tempSubtotal.toFixed(2)}</span></div>
            <div class="flex justify-between"><span>Discount:</span><span>-₹${tempDiscountAmount.toFixed(2)}</span></div>
            <div class="flex justify-between"><span>GST (5%):</span><span>₹${tempGstAmount.toFixed(2)}</span></div>
            <div class="flex justify-between font-bold border-t pt-1"><span>Total:</span><span>₹${total.toFixed(2)}</span></div>
        </div>
        <div class="text-center mt-2 pt-2 border-t text-xs">
            <p>Thank you!</p>
            <p>Visit Again! 😊</p>
        </div>
    `;
    
    if (receiptContent) receiptContent.innerHTML = receiptHTML;
    if (printArea) printArea.innerHTML = receiptHTML;
    receiptModal.classList.add('show');
}

async function handleSubmit() {
    const submitLoader = document.getElementById('submitLoader');
    const submitReceiptBtn = document.getElementById('submitReceiptBtn');
    
    submitLoader.classList.add('show');
    submitReceiptBtn.disabled = true;
    
    const now = new Date();
    const receiptNumber = 'R' + Date.now().toString().slice(-6);
    const orderId = 'ORD' + Date.now().toString().slice(-6);
    const tableNumber = document.getElementById('tableNumber').value.trim() || 'N/A';
    const total = tempTaxableAmount + tempGstAmount;
    
    const payload = {
        orderId,
        customerName: tempCustomerName,
        customerMobile: tempCustomerMobile,
        orderItems: tempCart.map(item => ({
            itemName: item.name,
            quantity: item.quantity,
            price: item.finalPrice
        })),
        paymentMode: currentPaymentMethod.toUpperCase(),
        paymentStatus: 'PAID',
        totalAmount: total,
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString(),
        receiptNumber,
        tableNumber: parseInt(tableNumber) || 0,
        discountAmount: tempDiscountAmount,
        discountType: tempDiscountType
    };
    
    try {
        const formData = new FormData();
        formData.append('data', JSON.stringify(payload));
        
        await fetch(ORDER_SUBMISSION_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: formData
        });
        
        showToast('Order submitted!', 'success');
        setTimeout(() => {
            document.getElementById('receiptModal').classList.remove('show');
        }, 1500);
    } catch (error) {
        console.error('Submission error:', error);
        showToast('Order saved locally', 'warning');
        setTimeout(() => {
            document.getElementById('receiptModal').classList.remove('show');
        }, 1500);
    } finally {
        submitLoader.classList.remove('show');
        submitReceiptBtn.disabled = false;
    }
}

// ===== FILTER =====
function filterProducts() {
    const productSearch = document.getElementById('productSearch');
    const searchTerm = productSearch ? productSearch.value.toLowerCase() : '';
    let filtered = bakeryProducts;
    
    if (currentCategory !== 'all') {
        filtered = filtered.filter(p => p.category === currentCategory);
    }
    
    if (searchTerm) {
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            p.sku.toLowerCase().includes(searchTerm)
        );
    }
    
    displayProducts(filtered);
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    const productSearch = document.getElementById('productSearch');
    if (productSearch) {
        productSearch.addEventListener('input', filterProducts);
    }
    
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.category-btn').forEach(b => {
                b.classList.remove('active', 'bg-primary', 'text-dark');
                b.classList.add('bg-gray-200');
            });
            e.target.classList.add('active', 'bg-primary', 'text-dark');
            currentCategory = e.target.dataset.category;
            filterProducts();
        });
    });
    
    document.querySelectorAll('.payment-method').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.payment-method').forEach(b => {
                b.classList.remove('active', 'bg-primary', 'text-dark');
                b.classList.add('bg-gray-200');
            });
            e.target.classList.add('active', 'bg-primary', 'text-dark');
            currentPaymentMethod = e.target.dataset.method;
        });
    });
    
    const discountEl = document.getElementById('discount');
    if (discountEl) {
        discountEl.addEventListener('input', updateTotals);
    }
    
    const discountTypeEl = document.getElementById('discountType');
    if (discountTypeEl) {
        discountTypeEl.addEventListener('change', () => {
            discountType = discountTypeEl.value;
            updateTotals();
        });
    }
    
    const clearCartBtn = document.getElementById('clearCart');
    if (clearCartBtn) clearCartBtn.addEventListener('click', clearCart);
    
    const processPaymentBtn = document.getElementById('processPayment');
    if (processPaymentBtn) processPaymentBtn.addEventListener('click', processPayment);
    
    const closeReceiptBtn = document.getElementById('closeReceipt');
    if (closeReceiptBtn) closeReceiptBtn.addEventListener('click', () => {
        document.getElementById('receiptModal').classList.remove('show');
    });
    
    const submitReceiptBtn = document.getElementById('submitReceiptBtn');
    if (submitReceiptBtn) submitReceiptBtn.addEventListener('click', handleSubmit);
    
    const printReceiptBtnModal = document.getElementById('printReceiptBtn');
    if (printReceiptBtnModal) printReceiptBtnModal.addEventListener('click', () => window.print());
    
    const refreshProductsBtn = document.getElementById('refreshProducts');
    if (refreshProductsBtn) {
        refreshProductsBtn.addEventListener('click', () => {
            refreshProductsBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin mr-1"></i>Refreshing...';
            refreshProductsBtn.disabled = true;
            localStorage.removeItem(CACHE_KEY);
            localStorage.removeItem(CACHE_TIME_KEY);
            loadProductsFromSheets().then(() => {
                refreshProductsBtn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i>Refresh Data';
                refreshProductsBtn.disabled = false;
            });
        });
    }
}

// ===== INIT =====
function initializeApp() {
    console.log('🚀 Initializing POS System...');
    loadProductsFromSheets();
    setupEventListeners();
    updateCartDisplay();
    updateTotals();
}

document.addEventListener('DOMContentLoaded', initializeApp);

// Debug helper
window.debugPOS = {
    clearCache: () => {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIME_KEY);
        console.log('Cache cleared');
    },
    reload: () => loadProductsFromSheets(),
    showCart: () => console.log(cart),
    showProducts: () => console.log(bakeryProducts)
};