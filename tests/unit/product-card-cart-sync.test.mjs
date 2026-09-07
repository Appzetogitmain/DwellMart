import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getVariantSignature } from '../../../frontend/src/shared/utils/variant.js';

describe('ProductCard Cart Synchronization & Quantity Interaction', () => {
  const getCartLineKey = (id, variant = {}) =>
    `${String(id)}::${getVariantSignature(variant)}`;

  // Cart helper functions mirroring useStore.js logic
  const createMockCart = () => {
    let items = [];

    return {
      getItems: () => items,
      addItem: (item) => {
        const lineKey = getCartLineKey(item.id, item.variant);
        const existingIndex = items.findIndex(
          (i) => String(i.id) === String(item.id) &&
                 String(i.cartLineKey || getCartLineKey(i.id, i.variant)) === lineKey
        );
        const qtyToAdd = item.quantity || 1;
        const availableStock = Number(item.stockQuantity);

        if (Number.isFinite(availableStock) && qtyToAdd > availableStock) {
          return false;
        }

        if (existingIndex >= 0) {
          const newQty = items[existingIndex].quantity + qtyToAdd;
          items[existingIndex] = {
            ...items[existingIndex],
            quantity: Number.isFinite(availableStock) ? Math.min(newQty, availableStock) : newQty,
          };
        } else {
          items.push({
            ...item,
            cartLineKey: lineKey,
            quantity: qtyToAdd,
          });
        }
        return true;
      },
      updateQuantity: (id, quantity, variant = null) => {
        if (quantity <= 0) {
          const targetKey = variant ? getCartLineKey(id, variant) : null;
          items = items.filter((i) => {
            if (String(i.id || i.productId) !== String(id)) return true;
            if (!targetKey) return false;
            return String(i.cartLineKey || getCartLineKey(i.id, i.variant)) !== targetKey;
          });
          return;
        }

        const targetKey = variant ? getCartLineKey(id, variant) : null;
        items = items.map((i) => {
          if (String(i.id || i.productId) === String(id) &&
              (!targetKey || String(i.cartLineKey || getCartLineKey(i.id, i.variant)) === targetKey)) {
            const availableStock = Number(i.stockQuantity);
            const clampedQty = Number.isFinite(availableStock) && availableStock > 0
              ? Math.min(quantity, availableStock)
              : quantity;
            return { ...i, quantity: clampedQty };
          }
          return i;
        });
      },
      removeItem: (id, variant = null) => {
        const hasVariantFilter = Boolean(variant && typeof variant === 'object' && Object.keys(variant).length > 0);
        const targetKey = hasVariantFilter ? getCartLineKey(id, variant) : null;
        items = items.filter((i) => {
          if (String(i.id || i.productId) !== String(id)) return true;
          if (!hasVariantFilter) return false;
          return String(i.cartLineKey || getCartLineKey(i.id, i.variant)) !== targetKey;
        });
      },
      findCartItem: (productId, variant = {}) => {
        const idStr = String(productId).trim();
        return items.find((i) => {
          const matchId = String(i.id || i.productId || i._id || '').trim() === idStr;
          if (!matchId) return false;
          if (variant && Object.keys(variant).length > 0) {
            return getVariantSignature(i.variant || {}) === getVariantSignature(variant);
          }
          return true;
        });
      },
    };
  };

  it('1. State 1: Product not in cart shows Add to Cart with quantity 0', () => {
    const cart = createMockCart();
    const product = { id: 'prod-101', name: 'Simonart Handicraft', price: 1999, stockQuantity: 10 };

    const cartItem = cart.findCartItem(product.id);
    const isInCart = Boolean(cartItem && (cartItem.quantity || 0) > 0);
    const cartQuantity = cartItem?.quantity || 0;

    assert.equal(isInCart, false);
    assert.equal(cartQuantity, 0);
  });

  it('2. Clicking Add to Cart adds 1 item and transitions to [ - ] 1 [ + ]', () => {
    const cart = createMockCart();
    const product = { id: 'prod-101', name: 'Simonart Handicraft', price: 1999, stockQuantity: 10 };

    const success = cart.addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      stockQuantity: product.stockQuantity,
    });
    assert.equal(success, true);

    const cartItem = cart.findCartItem(product.id);
    const isInCart = Boolean(cartItem && (cartItem.quantity || 0) > 0);
    const cartQuantity = cartItem?.quantity || 0;

    assert.equal(isInCart, true);
    assert.equal(cartQuantity, 1);
  });

  it('3. Clicking + increases quantity to 2 and then 3', () => {
    const cart = createMockCart();
    const product = { id: 'prod-101', name: 'Simonart Handicraft', price: 1999, stockQuantity: 10 };

    cart.addItem({ id: product.id, name: product.name, price: product.price, quantity: 1, stockQuantity: 10 });

    // Click + once -> 2
    cart.updateQuantity(product.id, 2);
    let cartItem = cart.findCartItem(product.id);
    assert.equal(cartItem?.quantity, 2);

    // Click + again -> 3
    cart.updateQuantity(product.id, 3);
    cartItem = cart.findCartItem(product.id);
    assert.equal(cartItem?.quantity, 3);
  });

  it('4. Clicking - decreases quantity to 2', () => {
    const cart = createMockCart();
    const product = { id: 'prod-101', name: 'Simonart Handicraft', price: 1999, stockQuantity: 10 };

    cart.addItem({ id: product.id, name: product.name, price: product.price, quantity: 3, stockQuantity: 10 });
    assert.equal(cart.findCartItem(product.id)?.quantity, 3);

    // Click - once -> 2
    cart.updateQuantity(product.id, 2);
    assert.equal(cart.findCartItem(product.id)?.quantity, 2);
  });

  it('5. Clicking - at quantity 1 removes product and returns to Add to Cart', () => {
    const cart = createMockCart();
    const product = { id: 'prod-101', name: 'Simonart Handicraft', price: 1999, stockQuantity: 10 };

    cart.addItem({ id: product.id, name: product.name, price: product.price, quantity: 1, stockQuantity: 10 });
    assert.equal(cart.findCartItem(product.id)?.quantity, 1);

    // User clicks minus at quantity 1 -> triggers removeItem or updateQuantity(id, 0)
    cart.updateQuantity(product.id, 0);

    const cartItem = cart.findCartItem(product.id);
    const isInCart = Boolean(cartItem && (cartItem.quantity || 0) > 0);
    const cartQuantity = cartItem?.quantity || 0;

    assert.equal(isInCart, false);
    assert.equal(cartQuantity, 0);
    assert.equal(cart.getItems().length, 0);
  });

  it('6. Stock limit enforcement: quantity cannot exceed available stock', () => {
    const cart = createMockCart();
    const product = { id: 'prod-102', name: 'Limited Stock Product', price: 499, stockQuantity: 2 };

    cart.addItem({ id: product.id, name: product.name, price: product.price, quantity: 1, stockQuantity: 2 });
    cart.updateQuantity(product.id, 2);
    assert.equal(cart.findCartItem(product.id)?.quantity, 2);

    // Attempting to exceed stock (e.g. 5) clamps to stock limit (2)
    cart.updateQuantity(product.id, 5);
    assert.equal(cart.findCartItem(product.id)?.quantity, 2);
  });

  it('7. Cart synchronization: multiple cards/views reading centralized cart reflect identical state', () => {
    const cart = createMockCart();
    const product = { id: 'prod-103', name: 'Shared Card Product', price: 899, stockQuantity: 20 };

    // View A (e.g., Home Page) adds product to cart
    cart.addItem({ id: product.id, name: product.name, price: product.price, quantity: 1, stockQuantity: 20 });

    // View B (e.g., Shop Page) checks cart
    const viewBItem = cart.findCartItem(product.id);
    const viewBInCart = Boolean(viewBItem && (viewBItem.quantity || 0) > 0);
    assert.equal(viewBInCart, true);
    assert.equal(viewBItem?.quantity, 1);

    // View B increments quantity to 2
    cart.updateQuantity(product.id, 2);

    // View A immediately reflects updated quantity = 2
    const viewAItem = cart.findCartItem(product.id);
    assert.equal(viewAItem?.quantity, 2);
  });
});
