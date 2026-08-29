// src/utils/taxUtils.ts

export interface GSTCalculationResult {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  gst: number;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  taxType: "INTRA" | "INTER";
  isIntraState: boolean;
  state: string;
}

/**
 * Calculates Indian GST breakdown based on Customer's State (GST-Inclusive Formula).
 * Taxable Amount = Subtotal * 100 / (100 + GST Rate)
 * GST Amount = Subtotal - Taxable Amount
 * Default seller home state is "Delhi".
 * - Intra-State (Same State): CGST (9%) + SGST (9%)
 * - Inter-State (Different State): IGST (18%)
 */
export const calculateGSTByState = (
  subtotal: number,
  customerState?: string,
  sellerState: string = "Delhi",
  totalGstPercent: number = 18
): GSTCalculationResult => {
  const normCustomerState = (customerState || "Delhi").trim().toLowerCase();
  const normSellerState = sellerState.trim().toLowerCase();

  // Helper to check if state is Delhi / UT
  const isDelhi = (st: string) =>
    st.includes("delhi") || st.includes("dl") || st.includes("ncr");

  // Check if Intra-State sale (customer state matches seller state)
  const isSameState =
    normCustomerState === normSellerState ||
    (isDelhi(normCustomerState) && isDelhi(normSellerState));

  // GST Inclusive Formula
  const taxableAmount = Math.round((subtotal * 100 / (100 + totalGstPercent)) * 100) / 100;
  const totalGstAmount = Math.round((subtotal - taxableAmount) * 100) / 100;

  if (isSameState) {
    // Intra-State: Split into CGST (half) & SGST (half)
    const cgst = Math.round((totalGstAmount / 2) * 100) / 100;
    const sgst = Math.round((totalGstAmount - cgst) * 100) / 100;

    return {
      taxableAmount,
      cgst,
      sgst,
      igst: 0,
      gst: totalGstAmount,
      gstRate: totalGstPercent,
      cgstRate: totalGstPercent / 2,
      sgstRate: totalGstPercent / 2,
      igstRate: 0,
      taxType: "INTRA",
      isIntraState: true,
      state: customerState || sellerState,
    };
  } else {
    // Inter-State: Full IGST
    return {
      taxableAmount,
      cgst: 0,
      sgst: 0,
      igst: totalGstAmount,
      gst: totalGstAmount,
      gstRate: totalGstPercent,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: totalGstPercent,
      taxType: "INTER",
      isIntraState: false,
      state: customerState || "Other",
    };
  }
};

export interface ItemForGST {
  sellingPrice: number;
  quantity: number;
  gstRate?: number;
}

/**
 * Calculates itemized GST for cart items with per-product GST rates (0%, 5%, 12%, 18%, 28%).
 */
export const calculateCartGSTByState = (
  items: ItemForGST[],
  customerState?: string,
  sellerState: string = "Delhi"
): GSTCalculationResult => {
  const normCustomerState = (customerState || "Delhi").trim().toLowerCase();
  const normSellerState = sellerState.trim().toLowerCase();

  const isDelhi = (st: string) =>
    st.includes("delhi") || st.includes("dl") || st.includes("ncr");

  const isSameState =
    normCustomerState === normSellerState ||
    (isDelhi(normCustomerState) && isDelhi(normSellerState));

  let totalTaxable = 0;
  let totalGstAmount = 0;
  let weightedGstRateSum = 0;
  let totalSubtotal = 0;

  for (const item of items) {
    const rate = item.gstRate !== undefined ? Number(item.gstRate) : 18;
    const lineTotal = (item.sellingPrice || 0) * (item.quantity || 1);
    const taxable = (lineTotal * 100) / (100 + rate);
    const gstAmt = lineTotal - taxable;

    totalTaxable += taxable;
    totalGstAmount += gstAmt;
    totalSubtotal += lineTotal;
    weightedGstRateSum += rate * lineTotal;
  }

  totalTaxable = Math.round(totalTaxable * 100) / 100;
  totalGstAmount = Math.round(totalGstAmount * 100) / 100;
  const effectiveGstRate =
    totalSubtotal > 0 ? Math.round((weightedGstRateSum / totalSubtotal) * 10) / 10 : 18;

  if (isSameState) {
    const cgst = Math.round((totalGstAmount / 2) * 100) / 100;
    const sgst = Math.round((totalGstAmount - cgst) * 100) / 100;

    return {
      taxableAmount: totalTaxable,
      cgst,
      sgst,
      igst: 0,
      gst: totalGstAmount,
      gstRate: effectiveGstRate,
      cgstRate: effectiveGstRate / 2,
      sgstRate: effectiveGstRate / 2,
      igstRate: 0,
      taxType: "INTRA",
      isIntraState: true,
      state: customerState || sellerState,
    };
  } else {
    return {
      taxableAmount: totalTaxable,
      cgst: 0,
      sgst: 0,
      igst: totalGstAmount,
      gst: totalGstAmount,
      gstRate: effectiveGstRate,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: effectiveGstRate,
      taxType: "INTER",
      isIntraState: false,
      state: customerState || "Other",
    };
  }
};
