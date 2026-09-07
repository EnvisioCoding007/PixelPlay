/**
 * @file refundService.js
 * @description Order refund calculation engine implementing weighted proportional distribution
 * of coupon discounts and shipping fees with integer arithmetic (Paise), 1-Paise remainder reconciliation,
 * non-negative safety guardrails, and ledger tax extraction on refunded amounts.
 */

import { extractTaxFromRefund } from './taxHelper.js';

/**
 * Calculates the weightage ratio of an item relative to the order gross subtotal.
 * Formula: W_i = Item_Gross_Subtotal_i / Order_Gross_Subtotal
 *
 * @param {number} itemPrice - Gross subtotal of the line item in Paise
 * @param {number} orderSubtotal - Total order gross subtotal in Paise
 * @returns {number} Floating-point weightage ratio between 0 and 1
 */
export const calculateItemWeightageRatio = (itemPrice, orderSubtotal) => {
    if (!orderSubtotal || orderSubtotal <= 0 || !itemPrice || itemPrice <= 0) {
        return 0;
    }
    return itemPrice / orderSubtotal;
};

/**
 * Calculates the full refund distribution across all line items in an order.
 *
 * Mathematical Formulas & Business Rules:
 * 1. Line Item Weightage: W_i = Item_Gross_Subtotal_i / Order_Gross_Subtotal
 * 2. Proportional Coupon Allocation: D_i = Math.round(Total_Coupon_Discount * W_i)
 *    - Integer Arithmetic: Performed in Paise (lowest currency unit).
 *    - 1-Paise Remainder Reconciliation: Sum all D_i. If sum(D_i) != Total_Coupon_Discount,
 *      the remainder is allocated to the line item with the highest price.
 * 3. Shipping Charge Allocation: S_i = Total_Shipping_Fee * W_i
 *    - Partial Return: S_i = 0 (shipping fee is non-refundable on partial returns).
 *    - Full Return / Cancellation: S_i = Math.round(Total_Shipping_Fee * W_i), with
 *      1-Paise remainder reconciliation to the highest priced item.
 * 4. Net Item Refund: R_i = Item_Gross_Subtotal_i - D_i + S_i
 *    - Safety Guardrails: Strictly bounded to 0 <= R_i <= (Item_Gross_Subtotal_i + S_i).
 *      For partial returns (S_i = 0), this guarantees 0 <= R_i <= Item_Gross_Subtotal_i.
 * 5. Tax Extraction on Refund:
 *    - Refunded_Base_i = Math.round(R_i * 100 / (100 + Tax_Rate))
 *    - Refunded_Tax_i = R_i - Refunded_Base_i
 *
 * @param {Object} order - Order document or plain object
 * @param {number} [order.subtotal] - Order gross subtotal in Paise
 * @param {number} [order.discount] - Total coupon discount in Paise
 * @param {number} [order.shipping] - Total shipping fee in Paise
 * @param {Array<Object>} order.items - Line items in the order
 * @param {Object} [options={}] - Calculation options
 * @param {boolean} [options.isFullReturn=false] - Whether the return/cancellation is for the full order
 * @returns {Object} Comprehensive refund distribution breakdown
 */
export const calculateOrderRefundDistribution = (order, options = {}) => {
    if (!order || !order.items || !Array.isArray(order.items) || order.items.length === 0) {
        return {
            items: [],
            totalRefund: 0,
            totalRefundedBase: 0,
            totalRefundedTax: 0,
            totalDiscountAllocated: 0,
            totalShippingAllocated: 0,
            orderSubtotal: 0
        };
    }

    const allInactive = order.items.length > 0 && order.items.every(i => i.status === 'Cancelled' || i.status === 'Returned');
    const isFullReturn = Boolean(options.isFullReturn) || allInactive;

    // Compute line item total prices in lowest currency unit (Paise)
    const lineItems = order.items.map((item, index) => {
        const qty = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
        const unitPrice = typeof item.price === 'number' ? Math.round(item.price) : 0;
        const itemPrice = typeof item.itemPrice === 'number' ? Math.round(item.itemPrice) : unitPrice * qty;
        const gstRate = typeof item.gst_rate === 'number'
            ? item.gst_rate
            : (item.product && typeof item.product.gst_rate === 'number' ? item.product.gst_rate : 18);

        return {
            rawItem: item,
            index,
            id: item._id ? item._id.toString() : (item.id ? item.id.toString() : String(index)),
            productId: item.product ? (item.product._id ? item.product._id.toString() : item.product.toString()) : null,
            platform: item.platform || null,
            quantity: qty,
            unitPrice,
            itemPrice,
            gstRate
        };
    });

    // Determine total order subtotal (aggregate of gross line item prices)
    const calculatedSubtotal = lineItems.reduce((acc, item) => acc + item.itemPrice, 0);
    const orderSubtotal = (typeof order.subtotal === 'number' && order.subtotal > 0)
        ? Math.round(order.subtotal)
        : calculatedSubtotal;

    const totalCouponDiscount = Math.max(0, Math.round(Number(order.discount) || 0));
    const totalShippingFee = Math.max(0, Math.round(Number(order.shipping) || 0));

    if (orderSubtotal <= 0) {
        return {
            items: lineItems.map(item => ({
                ...item,
                weightageRatio: 0,
                allocatedDiscount: 0,
                allocatedShipping: 0,
                netRefundAmount: 0,
                refundedBase: 0,
                refundedTax: 0
            })),
            totalRefund: 0,
            totalRefundedBase: 0,
            totalRefundedTax: 0,
            totalDiscountAllocated: 0,
            totalShippingAllocated: 0,
            orderSubtotal: 0
        };
    }

    // Step 1: Proportional distribution using integer Paise
    let sumDiscount = 0;
    let sumShipping = 0;

    const distributedItems = lineItems.map(item => {
        const weightageRatio = calculateItemWeightageRatio(item.itemPrice, orderSubtotal);

        // Allocated coupon discount in Paise (D_i = round(Total_Coupon_Discount * W_i))
        const allocatedDiscount = totalCouponDiscount > 0
            ? Math.round((totalCouponDiscount * item.itemPrice) / orderSubtotal)
            : 0;
        sumDiscount += allocatedDiscount;

        // Allocated shipping fee in Paise (S_i = 0 for partial return; round(Total_Shipping_Fee * W_i) for full return)
        let allocatedShipping = 0;
        if (isFullReturn && totalShippingFee > 0) {
            allocatedShipping = Math.round((totalShippingFee * item.itemPrice) / orderSubtotal);
            sumShipping += allocatedShipping;
        }

        return {
            ...item,
            weightageRatio,
            allocatedDiscount,
            allocatedShipping
        };
    });

    // Identify the line item with the highest price for 1-Paise remainder reconciliation
    let highestPriceIndex = 0;
    let maxPrice = -1;
    distributedItems.forEach((item, idx) => {
        if (item.itemPrice > maxPrice) {
            maxPrice = item.itemPrice;
            highestPriceIndex = idx;
        }
    });

    // Step 2: Remainder Reconciliation for Coupon Discount (1-Paise Rule)
    const discountRemainder = totalCouponDiscount - sumDiscount;
    if (discountRemainder !== 0 && distributedItems.length > 0) {
        distributedItems[highestPriceIndex].allocatedDiscount += discountRemainder;
    }

    // Step 3: Remainder Reconciliation for Shipping Fee (when full return)
    if (isFullReturn && totalShippingFee > 0) {
        const shippingRemainder = totalShippingFee - sumShipping;
        if (shippingRemainder !== 0 && distributedItems.length > 0) {
            distributedItems[highestPriceIndex].allocatedShipping += shippingRemainder;
        }
    }

    // Step 4: Net item refund amount with safety guardrails (0 <= R_i <= Item_Gross_Subtotal_i + S_i)
    // and tax extraction on refund
    let totalRefund = 0;
    let totalRefundedBase = 0;
    let totalRefundedTax = 0;
    let finalDiscountAllocated = 0;
    let finalShippingAllocated = 0;

    const finalItems = distributedItems.map(item => {
        const D_i = item.allocatedDiscount;
        const S_i = item.allocatedShipping;

        // Net refund: R_i = Item_Gross_Subtotal_i - D_i + S_i
        const rawNetRefund = item.itemPrice - D_i + S_i;

        // Safety Guardrail:
        // For partial returns (S_i = 0), maximum refund is strictly Item_Gross_Subtotal_i.
        // For full returns (S_i > 0), maximum refund includes the allocated shipping share.
        const maxRefundBound = isFullReturn ? (item.itemPrice + S_i) : item.itemPrice;
        const netRefundAmount = Math.max(0, Math.min(maxRefundBound, rawNetRefund));

        // Tax Extraction on Refund:
        // Refunded_Base_i = round(R_i * 100 / (100 + Tax_Rate))
        // Refunded_Tax_i = R_i - Refunded_Base_i
        const { refundedBase, refundedTax } = extractTaxFromRefund(netRefundAmount, item.gstRate);

        totalRefund += netRefundAmount;
        totalRefundedBase += refundedBase;
        totalRefundedTax += refundedTax;
        finalDiscountAllocated += D_i;
        finalShippingAllocated += S_i;

        return {
            ...item,
            allocatedDiscount: D_i,
            allocatedShipping: S_i,
            netRefundAmount,
            refundedBase,
            refundedTax
        };
    });

    return {
        items: finalItems,
        totalRefund,
        totalRefundedBase,
        totalRefundedTax,
        totalDiscountAllocated: finalDiscountAllocated,
        totalShippingAllocated: finalShippingAllocated,
        orderSubtotal
    };
};

/**
 * Normalizes options passed to refund helpers, supporting boolean flags,
 * gstRate numeric arguments, or options objects.
 *
 * @private
 * @param {Object|boolean|number} options
 * @returns {Object}
 */
const normalizeRefundOptions = (options) => {
    if (typeof options === 'boolean') {
        return { isFullReturn: options };
    }
    if (typeof options === 'number') {
        return { gstRate: options, isFullReturn: false };
    }
    return options || {};
};

/**
 * Finds matching line item from the calculated refund distribution.
 *
 * @private
 * @param {Array<Object>} distributionItems
 * @param {Object} targetItem
 * @returns {Object|null}
 */
const matchDistributionItem = (distributionItems, targetItem) => {
    if (!targetItem || !Array.isArray(distributionItems) || distributionItems.length === 0) {
        return null;
    }

    const targetItemId = targetItem._id ? targetItem._id.toString() : (targetItem.id ? targetItem.id.toString() : null);
    const targetProdId = targetItem.product ? (targetItem.product._id ? targetItem.product._id.toString() : targetItem.product.toString()) : null;
    const targetPlatform = targetItem.platform || null;

    let matched = null;
    if (targetItemId) {
        matched = distributionItems.find(i => i.id === targetItemId);
    }
    if (!matched && targetProdId) {
        matched = distributionItems.find(i => {
            const matchesProd = i.productId === targetProdId;
            const matchesPlat = !targetPlatform || !i.platform || i.platform.toLowerCase() === targetPlatform.toLowerCase();
            return matchesProd && matchesPlat;
        });
    }
    if (!matched) {
        matched = distributionItems.find(i => i.unitPrice === targetItem.price);
    }
    return matched || distributionItems[0] || null;
};

/**
 * Counts how many remaining active items exist in the order,
 * excluding items with status 'Cancelled' or 'Returned'.
 * If a targetItem and qty are specified, accounts for whether the targetItem
 * is already marked Cancelled/Returned or is currently being cancelled/returned.
 *
 * @param {Object} order - Order document or plain object
 * @param {Object} [targetItem=null] - The item currently being cancelled/returned
 * @param {number} [qtyToRefund=null] - Quantity being refunded
 * @returns {number} Count of remaining active items in the order
 */
export const countActiveOrderItems = (order, targetItem = null, qtyToRefund = null) => {
    if (!order || !order.items || !Array.isArray(order.items)) {
        return 0;
    }

    // Filter items that are currently active (not Cancelled and not Returned)
    const activeItems = order.items.filter(i => i.status !== 'Cancelled' && i.status !== 'Returned');

    if (!targetItem) {
        return activeItems.length;
    }

    const isTargetAlreadyInactive = targetItem.status === 'Cancelled' || targetItem.status === 'Returned';
    if (isTargetAlreadyInactive) {
        return activeItems.length;
    }

    const targetId = targetItem._id ? targetItem._id.toString() : (targetItem.id ? targetItem.id.toString() : null);
    const itemInActive = activeItems.find(i => {
        if (targetId && (i._id || i.id)) {
            const iId = i._id ? i._id.toString() : i.id.toString();
            return iId === targetId;
        }
        return i === targetItem;
    });

    if (!itemInActive) {
        return activeItems.length;
    }

    const totalQty = itemInActive.quantity || 1;
    const requestedQty = typeof qtyToRefund === 'number' && qtyToRefund > 0 ? qtyToRefund : totalQty;

    if (requestedQty < totalQty) {
        // Partial quantity cancellation/return -> item still has active units remaining
        return activeItems.length;
    }

    // Full cancellation/return of this item -> remaining active items excludes this item
    return activeItems.length - 1;
};

/**
 * Calculates the detailed refund breakdown (including refunded base and tax)
 * for a specific item in an order.
 *
 * @param {Object} order - Order document or plain object
 * @param {Object} item - The specific order item to refund
 * @param {number} [qtyToRefund=null] - Quantity of the item being cancelled/returned
 * @param {Object|boolean|number} [options={}] - Options, boolean isFullReturn, or numeric gstRate
 * @returns {{ refundAmount: number, refundedBase: number, refundedTax: number, gstRate: number, allocatedDiscount: number, allocatedShipping: number, itemPrice: number, isTerminalItem: boolean, activeItemsCount: number }}
 */
export const calculateItemRefundBreakdown = (order, item, qtyToRefund = null, options = {}) => {
    if (!order || !item) {
        return {
            refundAmount: 0,
            refundedBase: 0,
            refundedTax: 0,
            gstRate: 18,
            allocatedDiscount: 0,
            allocatedShipping: 0,
            itemPrice: 0,
            isTerminalItem: false,
            activeItemsCount: 0
        };
    }

    const opts = normalizeRefundOptions(options);
    const distribution = calculateOrderRefundDistribution(order, opts);

    if (!distribution || !distribution.items || distribution.items.length === 0) {
        return {
            refundAmount: 0,
            refundedBase: 0,
            refundedTax: 0,
            gstRate: 18,
            allocatedDiscount: 0,
            allocatedShipping: 0,
            itemPrice: 0,
            isTerminalItem: false,
            activeItemsCount: 0
        };
    }

    const matchedItem = matchDistributionItem(distribution.items, item);
    if (!matchedItem) {
        return {
            refundAmount: 0,
            refundedBase: 0,
            refundedTax: 0,
            gstRate: 18,
            allocatedDiscount: 0,
            allocatedShipping: 0,
            itemPrice: 0,
            isTerminalItem: false,
            activeItemsCount: 0
        };
    }

    const totalQty = matchedItem.quantity || 1;
    const requestedQty = typeof qtyToRefund === 'number' && qtyToRefund > 0
        ? Math.min(totalQty, qtyToRefund)
        : totalQty;

    const gstRate = typeof opts.gstRate === 'number' ? opts.gstRate : matchedItem.gstRate;

    let baseItemPrice;
    let allocatedDiscount;
    let allocatedShipping;
    let rawRefund;

    if (requestedQty === totalQty) {
        baseItemPrice = matchedItem.itemPrice;
        allocatedDiscount = matchedItem.allocatedDiscount;
        allocatedShipping = matchedItem.allocatedShipping;
        rawRefund = matchedItem.netRefundAmount;
    } else {
        // Proportional calculation for partial line-item quantity
        baseItemPrice = matchedItem.unitPrice * requestedQty;
        allocatedDiscount = Math.round((matchedItem.allocatedDiscount * requestedQty) / totalQty);
        allocatedShipping = Math.round((matchedItem.allocatedShipping * requestedQty) / totalQty);
        const rawNet = baseItemPrice - allocatedDiscount + allocatedShipping;
        const maxBound = opts.isFullReturn ? (baseItemPrice + allocatedShipping) : baseItemPrice;
        rawRefund = Math.max(0, Math.min(maxBound, rawNet));
    }

    // Requirement 1: Active Item Check
    const activeItemsCount = countActiveOrderItems(order, item, requestedQty);
    const isTerminal = activeItemsCount === 0;

    const shippingFee = (typeof order.shippingCharges === 'number')
        ? Math.max(0, Math.round(order.shippingCharges))
        : Math.max(0, Math.round(Number(order.shipping) || 0));

    const grandTotal = (typeof order.grandTotal === 'number')
        ? Math.round(order.grandTotal)
        : Math.max(0, Math.round(Number(order.finalAmount) || 0));

    if (typeof order.shippingRefunded !== 'boolean') {
        order.shippingRefunded = false;
    }

    // Requirement 2: Terminal Item Trigger
    // If activeItemsCount === 0 AND order.shippingRefunded is false:
    // - Add order.shippingCharges to the refund amount calculated for this final item.
    // - Set order.shippingRefunded = true on the order document.
    let finalRefundAmount = rawRefund;
    let finalAllocatedShipping = allocatedShipping;

    const unallocatedShipping = Math.max(0, shippingFee - allocatedShipping);
    if (isTerminal && !order.shippingRefunded && unallocatedShipping > 0) {
        finalRefundAmount += unallocatedShipping;
        finalAllocatedShipping += unallocatedShipping;
        order.shippingRefunded = true;
    } else if (isTerminal && !order.shippingRefunded) {
        order.shippingRefunded = true;
    }

    // Requirement 3: Balance Assertion & Reconciliation
    // Ensure that when all items in an order are cancelled/returned,
    // the sum of all refunds equals order.grandTotal and order.netFinalAmount equals 0.00.
    if (isTerminal) {
        // Calculate prior refunds recorded on other items in the order
        const priorRefunds = order.items.reduce((acc, itm) => {
            const isOther = (itm !== item) && (!item._id || !itm._id || itm._id.toString() !== item._id.toString());
            const isInactive = itm.status === 'Cancelled' || itm.status === 'Returned';
            if (isOther && isInactive) {
                if (typeof itm.refundAmount === 'number' && itm.refundAmount > 0) {
                    return acc + Math.round(itm.refundAmount);
                }
                const itmQty = itm.quantity || 1;
                const itmGross = (itm.price || 0) * itmQty;
                const orderSub = order.subtotal || itmGross;
                const couponDisc = (typeof order.discount === 'number') ? order.discount : 0;
                const allocDisc = orderSub > 0 ? Math.round((couponDisc * itmGross) / orderSub) : 0;
                return acc + Math.max(0, itmGross - allocDisc);
            }
            return acc;
        }, 0);

        if (grandTotal > 0) {
            // Reconcile terminal refund so sum(all refunds) strictly equals grandTotal
            finalRefundAmount = Math.max(0, grandTotal - priorRefunds);
            finalAllocatedShipping = Math.max(0, shippingFee);
        }

        order.netFinalAmount = 0;
    } else {
        if (typeof order.netFinalAmount === 'number') {
            order.netFinalAmount = Math.max(0, order.netFinalAmount - finalRefundAmount);
        } else if (grandTotal > 0) {
            order.netFinalAmount = Math.max(0, grandTotal - finalRefundAmount);
        }
    }

    const { refundedBase, refundedTax } = extractTaxFromRefund(finalRefundAmount, gstRate);

    return {
        refundAmount: finalRefundAmount,
        refundedBase,
        refundedTax,
        gstRate,
        allocatedDiscount,
        allocatedShipping: finalAllocatedShipping,
        itemPrice: baseItemPrice,
        isTerminalItem: isTerminal,
        activeItemsCount
    };
};

/**
 * Calculates the net refund amount for a specific item (or quantity thereof) in an order.
 * Returns an integer in Paise, maintaining complete backwards-compatibility with existing callers.
 *
 * @param {Object} order - Order document or plain object
 * @param {Object} item - The specific order item to calculate refund for
 * @param {number} [qtyToRefund=null] - Quantity of the item being cancelled or returned (defaults to item.quantity)
 * @param {Object|boolean|number} [options={}] - Options object, boolean isFullReturn, or numeric gstRate
 * @returns {number} Net item refund amount in Paise (whole integer)
 */
export const calculateItemRefundAmount = (order, item, qtyToRefund = null, options = {}) => {
    const breakdown = calculateItemRefundBreakdown(order, item, qtyToRefund, options);
    return breakdown.refundAmount;
};

/**
 * Asserts and verifies the order refund balance.
 * Ensures that when all items are cancelled/returned:
 * 1. The sum of all item refunds equals order.grandTotal (or order.finalAmount).
 * 2. order.netFinalAmount equals 0.00.
 *
 * @param {Object} order - The order document or plain object
 * @param {Array<number>} [itemRefunds=null] - Optional array of item refund amounts in Paise
 * @returns {{ isBalanced: boolean, totalRefunded: number, grandTotal: number, netFinalAmount: number, discrepancy: number }}
 */
export const assertOrderRefundBalance = (order, itemRefunds = null) => {
    if (!order) {
        throw new Error('Order is required for balance assertion');
    }

    const grandTotal = (typeof order.grandTotal === 'number')
        ? Math.round(order.grandTotal)
        : (typeof order.finalAmount === 'number' ? Math.round(order.finalAmount) : 0);

    let totalRefunded = 0;
    if (Array.isArray(itemRefunds) && itemRefunds.length > 0) {
        totalRefunded = itemRefunds.reduce((sum, r) => sum + Math.round(r || 0), 0);
    } else if (Array.isArray(order.items)) {
        totalRefunded = order.items.reduce((sum, itm) => {
            return sum + Math.round(itm.refundAmount || 0);
        }, 0);
    }

    const netFinalAmount = typeof order.netFinalAmount === 'number'
        ? Math.round(order.netFinalAmount)
        : Math.max(0, grandTotal - totalRefunded);

    const discrepancy = Math.abs(grandTotal - totalRefunded);
    const isBalanced = discrepancy === 0 && netFinalAmount === 0;

    return {
        isBalanced,
        totalRefunded,
        grandTotal,
        netFinalAmount,
        discrepancy
    };
};

export default {
    calculateItemWeightageRatio,
    calculateOrderRefundDistribution,
    countActiveOrderItems,
    calculateItemRefundBreakdown,
    calculateItemRefundAmount,
    assertOrderRefundBalance
};
