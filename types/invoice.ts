export interface CustomInput {
  id: string;
  key: string;
  value: string;
}

export interface InvoiceSender {
  name: string;
  address: string;
  city: string;
  zipCode: string;
  country: string;
  email: string;
  phone: string;
  customInputs: CustomInput[];
}

export interface InvoiceReceiver {
  name: string;
  address: string;
  city: string;
  zipCode: string;
  country: string;
  email: string;
  phone: string;
  customInputs: CustomInput[];
}

export interface InvoiceItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export type AmountType = "amount" | "percentage";

export interface DiscountDetails {
  amount: number;
  amountType: AmountType;
}

export interface TaxDetails {
  amount: number;
  taxId: string;
  amountType: AmountType;
}

export interface ShippingDetails {
  cost: number;
  costType: AmountType;
}

export type PaymentType = "local" | "international";

export interface PaymentInfo {
  paymentType?: PaymentType;
  bankName: string;
  accountName: string;
  accountNumber: string;
  routingNumber?: string;
  bankAddress?: string;
  beneficiaryName?: string;
  beneficiaryAddress?: string;
  zelleContact?: string;
  swiftBic?: string;
  alternateRoutingNumber?: string;
  memo?: string;
}

export interface SignatureData {
  type: "draw" | "type" | "upload";
  data: string; // base64 data URL for draw/upload, text for type
  fontFamily?: string;
  color?: string;
}

export interface SavedInvoice {
  id: string;
  label: string;
  senderName: string;
  receiverName: string;
  totalAmount: number;
  currency: string;
  savedAt: string;
  data: InvoiceData;
}

export interface InvoiceDetails {
  invoiceLogo: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  terms: string;
  currency: string;
  themeColor: string;
  templateNumber: number;
  items: InvoiceItem[];
  discountDetails: DiscountDetails | null;
  taxDetails: TaxDetails | null;
  shippingDetails: ShippingDetails | null;
  paymentInfo: PaymentInfo | null;
  additionalNotes: string;
  noteToCustomer: string;
  paymentTerms: string;
  signature: SignatureData | null;
  totalInWords: boolean;
  subTotal: number;
  totalAmount: number;
}

export interface PresetService {
  name: string;
  description: string;
  rate: number;
}

export interface InvoiceData {
  sender: InvoiceSender;
  receiver: InvoiceReceiver;
  details: InvoiceDetails;
}
