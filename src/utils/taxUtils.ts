// src/utils/taxUtils.ts

export interface GSTCalculationResult {
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
 * Calculates Indian GST breakdown based on Customer's State.
 * Default seller home state is "Delhi".
 * - Intra-State (Same State, e.g., Delhi): CGST (9%) + SGST (9%)
 * - Inter-State (Different State, e.g., MH, UP, KA, etc.): IGST (18%)
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

  const totalGstRate = totalGstPercent / 100;

  if (isSameState) {
    // Intra-State: Split into CGST (half) & SGST (half)
    const halfRate = totalGstRate / 2; // e.g. 0.09 (9%)
    const cgst = Math.round(subtotal * halfRate * 100) / 100;
    const sgst = Math.round(subtotal * halfRate * 100) / 100;
    const gst = Math.round((cgst + sgst) * 100) / 100;

    return {
      cgst,
      sgst,
      igst: 0,
      gst,
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
    const igst = Math.round(subtotal * totalGstRate * 100) / 100;

    return {
      cgst: 0,
      sgst: 0,
      igst,
      gst: igst,
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
