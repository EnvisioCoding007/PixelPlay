/**
 * @file taxHelper.js
 * @description Tax computation utility for reverse tax extraction from gross (tax-inclusive) prices
 * and refund tax ledger extraction. All computations operate in lowest integer currency unit (Paise).
 */

/**
 * Extracts tax-exclusive base price and GST amount from a gross tax-inclusive price.
 * Formula:
 *   P_base = P_gross / (1 + Tax_Rate)
 *   GST_Amount = P_gross - P_base
 *
 * Example:
 *   For ₹260.00 (26,000 Paise) at 18% GST:
 *   P_base = round(26000 * 100 / 118) = 22,034 Paise (₹220.34)
 *   GST_Amount = 26,000 - 22,034 = 3,966 Paise (₹39.66)
 *
 * @param {number} grossPriceInPaise - Gross tax-inclusive price in Paise (integer)
 * @param {number} [gstRate=18] - GST tax rate percentage (e.g., 18 for 18%)
 * @returns {{ basePrice: number, taxAmount: number, gstRate: number, grossPrice: number }}
 */
export const extractTaxFromGross = (grossPriceInPaise, gstRate = 18) => {
    const grossPrice = Math.max(0, Math.round(Number(grossPriceInPaise) || 0));
    const rate = Math.max(0, Number(gstRate) || 0);

    if (grossPrice === 0 || rate === 0) {
        return {
            basePrice: grossPrice,
            taxAmount: 0,
            gstRate: rate,
            grossPrice
        };
    }

    // Integer currency math in Paise: round(P_gross * 100 / (100 + Tax_Rate))
    const basePrice = Math.round((grossPrice * 100) / (100 + rate));
    const taxAmount = grossPrice - basePrice;

    return {
        basePrice,
        taxAmount,
        gstRate: rate,
        grossPrice
    };
};

/**
 * Extracts the tax-exclusive base portion and tax portion from a net refund amount.
 * Formula:
 *   Refunded_Base = R_i / (1 + Tax_Rate)
 *   Refunded_Tax = R_i - Refunded_Base
 *
 * @param {number} refundAmountInPaise - Net refund amount in Paise (integer)
 * @param {number} [gstRate=18] - GST tax rate percentage (e.g., 18 for 18%)
 * @returns {{ refundedBase: number, refundedTax: number, gstRate: number, refundAmount: number }}
 */
export const extractTaxFromRefund = (refundAmountInPaise, gstRate = 18) => {
    const refundAmount = Math.max(0, Math.round(Number(refundAmountInPaise) || 0));
    const rate = Math.max(0, Number(gstRate) || 0);

    if (refundAmount === 0 || rate === 0) {
        return {
            refundedBase: refundAmount,
            refundedTax: 0,
            gstRate: rate,
            refundAmount
        };
    }

    const refundedBase = Math.round((refundAmount * 100) / (100 + rate));
    const refundedTax = refundAmount - refundedBase;

    return {
        refundedBase,
        refundedTax,
        gstRate: rate,
        refundAmount
    };
};

/**
 * Calculates gross price by adding tax to a tax-exclusive base price.
 * Formula:
 *   GST_Amount = round(P_base * Tax_Rate / 100)
 *   P_gross = P_base + GST_Amount
 *
 * @param {number} basePriceInPaise - Tax-exclusive base price in Paise (integer)
 * @param {number} [gstRate=18] - GST tax rate percentage (e.g., 18 for 18%)
 * @returns {{ grossPrice: number, taxAmount: number, basePrice: number, gstRate: number }}
 */
export const calculateGrossFromBase = (basePriceInPaise, gstRate = 18) => {
    const basePrice = Math.max(0, Math.round(Number(basePriceInPaise) || 0));
    const rate = Math.max(0, Number(gstRate) || 0);

    if (basePrice === 0 || rate === 0) {
        return {
            grossPrice: basePrice,
            taxAmount: 0,
            basePrice,
            gstRate: rate
        };
    }

    const taxAmount = Math.round((basePrice * rate) / 100);
    const grossPrice = basePrice + taxAmount;

    return {
        grossPrice,
        taxAmount,
        basePrice,
        gstRate: rate
    };
};

export default {
    extractTaxFromGross,
    extractTaxFromRefund,
    calculateGrossFromBase
};
