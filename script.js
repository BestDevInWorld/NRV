"use strict";

/**
 * Paste your Google Sheets JSON URL here.
 *
 * The URL should return an array of rows like:
 * [
 *   {
 *     "id": "1",
 *     "productName": "Protein Bar",
 *     "image": "https://example.com/image.png",
 *     "description": "Tasty bar",
 *     "flavor": "Chocolate",
 *     "available": "TRUE",
 *     "price": "50"
 *   },
 *   ...
 * ]
 *
 * Many Google Sheets → JSON services produce exactly this structure.
 * If your JSON is wrapped in an object (for example: { data: [...] }),
 * you can adjust the `extractRows` function below.
 */
const GOOGLE_SHEETS_JSON_URL = "https://script.google.com/macros/s/AKfycbzHOZRRKQ5jjwVgASdnFdpBJDA5xdaov3mRpiU3XvPOIw84RV8S0iPvMQKXJQsZyq5ZgA/exec";

/**
 * Telegram group link for the "Order" button.
 * Replace ONLY the part after https://t.me/
 */
const TELEGRAM_GROUP_URL = "https://t.me/managergavrik?text=";

// Cached DOM elements
const productGridEl = document.getElementById("product-grid");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");

const modalOverlayEl = document.getElementById("modal-overlay");
const modalImageEl = document.getElementById("modal-image");
const modalTitleEl = document.getElementById("modal-title");
const modalDescriptionEl = document.getElementById("modal-description");
const modalPriceEl = document.getElementById("modal-price");
const flavorListEl = document.getElementById("flavor-list");
const orderButtonEl = document.getElementById("order-button");
const modalCloseButtonEl = document.querySelector(".modal-close");

// Cart DOM elements
const cartButtonEl = document.getElementById("cart-button");
const cartCountEl = document.getElementById("cart-count");
const cartOverlayEl = document.getElementById("cart-overlay");
const cartCloseButtonEl = document.getElementById("cart-close");
const cartItemsEl = document.getElementById("cart-items");
const cartTotalValueEl = document.getElementById("cart-total-value");
const cartCheckoutButtonEl = document.getElementById("cart-checkout");

let currentProduct = null;
let currentFlavor = null;
let cart = [];

document.addEventListener("DOMContentLoaded", () => {
  void loadProducts();
  setupModalEvents();
  setupCartEvents();
});

function trackClick(name){
  gtag('event', 'button_click', {
    button_name: name
  });
}
/**
 * Fetches product rows from Google Sheets and renders the catalog.
 */
async function loadProducts() {
  showLoading(true);
  showError("");
  productGridEl.hidden = true;

  try {
    if (!GOOGLE_SHEETS_JSON_URL || GOOGLE_SHEETS_JSON_URL.startsWith("PASTE_")) {
      throw new Error(
        "Please set your Google Sheets JSON URL in script.js (GOOGLE_SHEETS_JSON_URL)."
      );
    }

    const response = await fetch(GOOGLE_SHEETS_JSON_URL, {
      headers: {
        // Helpful for some APIs that prefer JSON
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to load data (${response.status} ${response.statusText})`
      );
    }

    const json = await response.json();
    const rows = extractRows(json);

    const products = groupProductsById(rows);

    if (!products.length) {
      showError("No available products were found in the sheet.");
      return;
    }

    renderProductGrid(products);
  } catch (error) {
    console.error(error);
    showError(
      error instanceof Error
        ? error.message
        : "An unexpected error occurred while loading products."
    );
  } finally {
    showLoading(false);
  }
}

/**
 * Returns an array of raw row objects from the API response.
 * Adjust this if your JSON is wrapped differently.
 */
function extractRows(json) {
  if (Array.isArray(json)) {
    return json;
  }

  // Common pattern: { data: [...] }
  if (json && Array.isArray(json.data)) {
    return json.data;
  }

  // Fallback: try "values" if using some Google APIs
  if (json && Array.isArray(json.values)) {
    return json.values;
  }

  console.warn(
    "Could not automatically detect rows array. Returning empty list."
  );
  return [];
}

/**
 * Groups flat rows from the sheet into product objects by `id`,
 * keeping only entries where available == TRUE.
 */
function groupProductsById(rows) {
  const map = new Map();

  for (const raw of rows) {
    if (!raw) continue;

    const id = String(raw.id ?? "").trim();
    if (!id) continue;

    const availableRaw = String(raw.available ?? "").toLowerCase().trim();
    const isAvailable = availableRaw === "true" || availableRaw === "yes";
    if (!isAvailable) continue;

    const name = String(raw.productName ?? "").trim();
    const image = String(raw.image ?? "").trim();
    const description = String(raw.description ?? "").trim();
    const flavor = String(raw.flavor ?? "").trim();
    const price = String(raw.price ?? "").trim();

    if (!map.has(id)) {
      map.set(id, {
        id,
        name: name || "Unnamed product",
        image,
        description,
        price,
        flavors: [],
      });
    }

    const product = map.get(id);

    if (flavor && !product.flavors.includes(flavor)) {
      product.flavors.push(flavor);
    }
  }

  // Sort flavors alphabetically for nicer UX
  const products = Array.from(map.values());
  for (const product of products) {
    product.flavors.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  // Optional: sort products by id or name
  products.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return products;
}

/**
 * Renders the product cards grid.
 */
function renderProductGrid(products) {
  productGridEl.innerHTML = "";

  for (const product of products) {
    const card = document.createElement("article");
    card.className = "product-card";

    const imageWrapper = document.createElement("div");
    imageWrapper.className = "product-image-wrapper";

    const img = document.createElement("img");
    img.className = "product-image";
    img.alt = product.name;
    img.src = product.image || getPlaceholderImage();

    imageWrapper.appendChild(img);

    const body = document.createElement("div");
    body.className = "product-body";

    const nameEl = document.createElement("h2");
    nameEl.className = "product-name";
    nameEl.textContent = product.name;

    const descEl = document.createElement("p");
    descEl.className = "product-description";
    descEl.textContent =
      product.description || "No description available for this product.";

    const metaEl = document.createElement("div");
    metaEl.className = "product-meta";

    const priceEl = document.createElement("div");
    priceEl.className = "product-price";
    priceEl.textContent = product.price ? `${product.price}` : "Price on request";

    metaEl.appendChild(priceEl);

    const actionsEl = document.createElement("div");
    actionsEl.className = "product-actions";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.innerHTML = '<span>Більше</span><span class="icon">➜</span>';

    // Clicking "View flavors" opens the modal for this product
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openProductModal(product);
      trackClick('view_more');
    });

    actionsEl.appendChild(button);

    body.appendChild(nameEl);
    body.appendChild(descEl);
    body.appendChild(metaEl);
    body.appendChild(actionsEl);

    card.appendChild(imageWrapper);
    card.appendChild(body);

    // Optional: also open on card click (desktop)
    card.addEventListener("click", () => {
      openProductModal(product);
    });

    productGridEl.appendChild(card);
  }

  productGridEl.hidden = false;
}

/**
 * Sets up shared modal event listeners.
 */
function setupModalEvents() {
  if (!modalOverlayEl) return;

  modalOverlayEl.addEventListener("click", (event) => {
    if (event.target === modalOverlayEl) {
      closeModal();
    }
  });

  if (modalCloseButtonEl) {
    modalCloseButtonEl.addEventListener("click", () => {
      closeModal();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modalOverlayEl.hidden) {
      closeModal();
    }
  });

  if (orderButtonEl) {
    orderButtonEl.addEventListener("click", () => {
      handleOrderClick();
    });
  }
}

/**
 * Sets up shared cart event listeners.
 */
function setupCartEvents() {
  if (cartButtonEl) {
    cartButtonEl.addEventListener("click", () => {
      openCart();
    });
  }

  if (cartCloseButtonEl) {
    cartCloseButtonEl.addEventListener("click", () => {
      closeCart();
    });
  }

  if (cartOverlayEl) {
    cartOverlayEl.addEventListener("click", (event) => {
      if (event.target === cartOverlayEl) {
        closeCart();
      }
    });
  }

  if (cartCheckoutButtonEl) {
    cartCheckoutButtonEl.addEventListener("click", () => {
      handleCartCheckout();
    });
  }

  updateCartCount();
  renderCartItems();
}

/**
 * Opens the modal and fills in product + flavors.
 */
function openProductModal(product) {
  currentProduct = product;
  currentFlavor = null;

  modalTitleEl.textContent = product.name;
  modalDescriptionEl.textContent =
    product.description || "No description available.";
  modalPriceEl.textContent = product.price || "Price on request";

  modalImageEl.src = product.image || getPlaceholderImage();
  modalImageEl.alt = product.name;

  renderFlavors(product.flavors);

  modalOverlayEl.hidden = false;
  modalOverlayEl.classList.add("is-open");
}

/**
 * Closes the product modal.
 */
function closeModal() {
  modalOverlayEl.classList.remove("is-open");
  modalOverlayEl.hidden = true;
  currentProduct = null;
  currentFlavor = null;
}

/**
 * Renders the flavor pills and manages selection.
 */
function renderFlavors(flavors) {
  flavorListEl.innerHTML = "";

  if (!flavors || !flavors.length) {
    const noneEl = document.createElement("p");
    noneEl.textContent = "No flavors are currently available.";
    noneEl.style.fontSize = "0.9rem";
    noneEl.style.color = "#6b7280";
    flavorListEl.appendChild(noneEl);
    return;
  }

  flavors.forEach((flavor, index) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "flavor-pill";
    pill.textContent = flavor;

    if (index === 0) {
      pill.classList.add("selected");
      currentFlavor = flavor;
    }

    pill.addEventListener("click", () => {
      currentFlavor = flavor;
      updateSelectedFlavorPill(pill);
    });

    flavorListEl.appendChild(pill);
  });
}

/**
 * Updates styles when a flavor is selected.
 */
function updateSelectedFlavorPill(selectedPill) {
  const pills = flavorListEl.querySelectorAll(".flavor-pill");
  pills.forEach((pill) => {
    if (pill === selectedPill) {
      pill.classList.add("selected");
    } else {
      pill.classList.remove("selected");
    }
  });
}

/**
 * Handles clicking the "Order" button.
 * In current version adds product to cart and opens the cart sidebar.
 */
function handleOrderClick() {
  addCurrentProductToCart();
  closeModal();
  openCart();
}

/**
 * Adds the currently selected product + flavor to the cart.
 */
function addCurrentProductToCart() {
  if (!currentProduct) return;

  const selectedFlavor =
    currentFlavor ||
    (currentProduct.flavors && currentProduct.flavors.length
      ? currentProduct.flavors[0]
      : "");

  const priceNumber = parsePriceToNumber(currentProduct.price);

  const existing = cart.find(
    (item) => item.id === currentProduct.id && item.flavor === selectedFlavor
  );

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id: currentProduct.id,
      name: currentProduct.name,
      flavor: selectedFlavor,
      price: priceNumber,
      priceLabel: currentProduct.price || "",
      quantity: 1,
    });
  }

  updateCartCount();
  renderCartItems();
}

/**
 * Parses a price string (e.g. "150", "150 EUR") into a number.
 */
function parsePriceToNumber(rawPrice) {
  if (rawPrice == null) return 0;
  const cleaned = String(rawPrice).replace(/[^\d.,]/g, "").replace(",", ".");
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Updates the counter on the cart button.
 */
function updateCartCount() {
  if (!cartCountEl) return;
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCountEl.textContent = String(count);
}

/**
 * Renders all items inside the cart sidebar.
 */
function renderCartItems() {
  if (!cartItemsEl || !cartTotalValueEl) return;

  cartItemsEl.innerHTML = "";

  if (!cart.length) {
    const emptyEl = document.createElement("p");
    emptyEl.textContent = "Корзина порожня.";
    emptyEl.style.fontSize = "0.9rem";
    emptyEl.style.color = "#6b7280";
    cartItemsEl.appendChild(emptyEl);
    cartTotalValueEl.textContent = "0";
    return;
  }

  let total = 0;

  cart.forEach((item, index) => {
    const itemEl = document.createElement("div");
    itemEl.className = "cart-item";

    const mainRow = document.createElement("div");
    mainRow.className = "cart-item-main";

    const textWrapper = document.createElement("div");

    const titleEl = document.createElement("p");
    titleEl.className = "cart-item-title";
    titleEl.textContent = item.name;

    textWrapper.appendChild(titleEl);

    if (item.flavor) {
      const flavorEl = document.createElement("p");
      flavorEl.className = "cart-item-flavor";
      flavorEl.textContent = `Смак: ${item.flavor}`;
      textWrapper.appendChild(flavorEl);
    }

    const priceEl = document.createElement("div");
    priceEl.className = "cart-item-price";

    if (item.price > 0) {
      priceEl.textContent = `${item.price.toFixed(0)} EUR/шт`;
    } else if (item.priceLabel) {
      priceEl.textContent = item.priceLabel;
    } else {
      priceEl.textContent = "Ціна за запитом";
    }

    mainRow.appendChild(textWrapper);
    mainRow.appendChild(priceEl);

    const controlsRow = document.createElement("div");
    controlsRow.className = "cart-item-controls";

    const quantityControls = document.createElement("div");
    quantityControls.className = "quantity-controls";

    const minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className = "quantity-button";
    minusBtn.textContent = "-";

    const quantityValue = document.createElement("span");
    quantityValue.className = "quantity-value";
    quantityValue.textContent = String(item.quantity);

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "quantity-button";
    plusBtn.textContent = "+";

    minusBtn.addEventListener("click", () => {
      decreaseCartItemQuantity(index);
    });

    plusBtn.addEventListener("click", () => {
      increaseCartItemQuantity(index);
    });

    quantityControls.appendChild(minusBtn);
    quantityControls.appendChild(quantityValue);
    quantityControls.appendChild(plusBtn);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-item-button";
    removeBtn.textContent = "Видалити";

    removeBtn.addEventListener("click", () => {
      removeCartItem(index);
    });

    controlsRow.appendChild(quantityControls);
    controlsRow.appendChild(removeBtn);

    itemEl.appendChild(mainRow);
    itemEl.appendChild(controlsRow);

    cartItemsEl.appendChild(itemEl);

    total += item.price * item.quantity;
  });

  cartTotalValueEl.textContent = total > 0 ? `${total.toFixed(0)} EUR` : "—";
}

function increaseCartItemQuantity(index) {
  const item = cart[index];
  if (!item) return;
  item.quantity += 1;
  updateCartCount();
  renderCartItems();
}

function decreaseCartItemQuantity(index) {
  const item = cart[index];
  if (!item) return;
  item.quantity -= 1;
  if (item.quantity <= 0) {
    cart.splice(index, 1);
  }
  updateCartCount();
  renderCartItems();
}

function removeCartItem(index) {
  if (!cart[index]) return;
  cart.splice(index, 1);
  updateCartCount();
  renderCartItems();
}

function openCart() {
  if (!cartOverlayEl) return;
  cartOverlayEl.hidden = false;
  cartOverlayEl.classList.add("is-open");
}

function closeCart() {
  if (!cartOverlayEl) return;
  cartOverlayEl.classList.remove("is-open");
  cartOverlayEl.hidden = true;
}

/**
 * Sends the current cart content to Telegram as a single order.
 */
function handleCartCheckout() {
  if (!TELEGRAM_GROUP_URL || TELEGRAM_GROUP_URL.includes("YOUR_GROUP_LINK")) {
    alert(
      "Please set your Telegram group URL in script.js (TELEGRAM_GROUP_URL)."
    );
    return;
  }

  if (!cart.length) {
    alert("Корзина порожня. Додайте товари перед оформленням замовлення.");
    return;
  }

  let message = "Привіт! Я хочу замовити такі товари:\n";

  cart.forEach((item, index) => {
    const lineIndex = index + 1;
    const flavorPart = item.flavor ? ` (смак: ${item.flavor})` : "";
    const quantityPart = `${item.quantity} шт.`;

    message += `${lineIndex}) ${item.name}${flavorPart} — ${quantityPart}\n`;
  });

  const encodedMessage = encodeURIComponent(message);
  const separator = TELEGRAM_GROUP_URL.includes("?") ? "&" : "?";
  const redirectUrl = `${TELEGRAM_GROUP_URL}${separator}text=${encodedMessage}`;

  window.open(redirectUrl, "_blank");
}

/**
 * Toggles the loading indicator.
 */
function showLoading(isLoading) {
  if (!loadingEl) return;
  loadingEl.style.display = isLoading ? "flex" : "none";
}

/**
 * Displays an error message area.
 */
function showError(message) {
  if (!errorEl) return;

  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = "";
    return;
  }

  errorEl.hidden = false;
  errorEl.textContent = message;
}

/**
 * Simple placeholder image when no image URL is provided.
 */
function getPlaceholderImage() {
  return "https://via.placeholder.com/600x400.png?text=No+Image";
}

