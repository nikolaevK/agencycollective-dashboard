"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { InvoiceData } from "@/types/invoice";
import { formatCurrencyValue } from "@/lib/invoice/validation";
import { numberToWords } from "@/lib/invoice/numberToWords";

interface Props {
  data: InvoiceData;
}

const PAGE_W = 595;

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function InvoiceLivePreview({ data }: Props) {
  const { sender, receiver, details } = data;
  const theme = details.themeColor || "#2563eb";

  const discountAmt = details.discountDetails
    ? details.discountDetails.amountType === "percentage"
      ? details.subTotal * (details.discountDetails.amount / 100)
      : details.discountDetails.amount
    : 0;
  const taxAmt = details.taxDetails
    ? details.taxDetails.amountType === "percentage"
      ? details.subTotal * (details.taxDetails.amount / 100)
      : details.taxDetails.amount
    : 0;
  const shipAmt = details.shippingDetails
    ? details.shippingDetails.costType === "percentage"
      ? details.subTotal * (details.shippingDetails.cost / 100)
      : details.shippingDetails.cost
    : 0;

  const senderLines = [sender.address, [sender.city, sender.zipCode].filter(Boolean).join(", "), sender.country].filter(Boolean);
  const receiverCityLine = [receiver.city, receiver.zipCode, receiver.country].filter(Boolean).join(", ");
  const fmt = (n: number) => formatCurrencyValue(n, details.currency);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const measure = useCallback(() => {
    if (wrapperRef.current) {
      setScale(wrapperRef.current.offsetWidth / PAGE_W);
    }
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={wrapperRef} className="w-full overflow-hidden">
      <div
        className="origin-top-left"
        style={{ width: PAGE_W, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <div
          className="bg-white text-gray-900"
          style={{ width: PAGE_W, minHeight: 842, fontFamily: "Helvetica, Arial, sans-serif", fontSize: 9 }}
        >
          {/* ── Header ── */}
          <div className="flex justify-between items-start" style={{ padding: "30px 40px 20px" }}>
            <div className="flex-1">
              <div className="text-[18px] font-bold mb-1" style={{ color: theme }}>
                INVOICE
              </div>
              {sender.name && <div className="text-[9px] font-bold text-gray-800">{sender.name}</div>}
              {senderLines.map((line, i) => (
                <div key={i} className="text-[8px] text-gray-500 leading-tight">{line}</div>
              ))}
              <div className="flex gap-4 mt-0.5">
                {sender.email && <span className="text-[8px] text-gray-500">{sender.email}</span>}
                {sender.phone && <span className="text-[8px] text-gray-500">{sender.phone}</span>}
              </div>
              {sender.customInputs.map((ci) => (
                <div key={ci.id} className="text-[8px] text-gray-500 mt-0.5">
                  <span className="font-bold">{ci.key}:</span> {ci.value}
                </div>
              ))}
            </div>
            {details.invoiceLogo && (
              <img src={details.invoiceLogo} alt="" className="w-[70px] h-[70px] object-contain" />
            )}
          </div>

          {/* ── Bill To band ── */}
          <div style={{ backgroundColor: "#EBF4FF", padding: "12px 40px" }}>
            <div className="flex gap-8">
              <div className="flex-1">
                <div className="text-[8px] text-gray-500 italic mb-0.5">Bill to</div>
                {receiver.name && <div className="text-[10px] font-bold">{receiver.name}</div>}
                {receiver.address && <div className="text-[9px] text-gray-600">{receiver.address}</div>}
                {receiverCityLine && <div className="text-[9px] text-gray-600">{receiverCityLine}</div>}
                {receiver.email && <div className="text-[8px] text-gray-500 mt-0.5">{receiver.email}</div>}
                {receiver.phone && <div className="text-[8px] text-gray-500">{receiver.phone}</div>}
                {receiver.customInputs.map((ci) => (
                  <div key={ci.id} className="text-[8px] text-gray-500 mt-0.5">
                    <span className="font-bold">{ci.key}:</span> {ci.value}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Invoice Details ── */}
          <div style={{ padding: "16px 40px 12px" }}>
            <div className="text-[12px] font-bold mb-1.5" style={{ color: theme }}>
              Invoice details
            </div>
            {details.invoiceNumber && (
              <div className="text-[9px] text-gray-600 leading-relaxed">
                <span className="font-medium" style={{ color: theme }}>Invoice no.: </span>{details.invoiceNumber}
              </div>
            )}
            {details.terms && (
              <div className="text-[9px] text-gray-600 leading-relaxed">
                <span className="font-medium" style={{ color: theme }}>Terms: </span>{details.terms}
              </div>
            )}
            {details.invoiceDate && (
              <div className="text-[9px] text-gray-600 leading-relaxed">
                <span className="font-medium" style={{ color: theme }}>Invoice date: </span>{formatDate(details.invoiceDate)}
              </div>
            )}
            {details.dueDate && (
              <div className="text-[9px] text-gray-600 leading-relaxed">
                <span className="font-medium" style={{ color: theme }}>Due date: </span>{formatDate(details.dueDate)}
              </div>
            )}
          </div>

          {/* ── Items Table ── */}
          <div style={{ padding: "0 40px 10px" }}>
            <div className="flex border-b border-gray-300 pb-1.5 mb-1">
              <div className="w-[5%] text-[8px] font-bold text-gray-500 uppercase">#</div>
              <div className="w-[30%] text-[8px] font-bold text-gray-500 uppercase">Product or service</div>
              <div className="w-[35%] text-[8px] font-bold text-gray-500 uppercase">Description</div>
              <div className="w-[15%] text-[8px] font-bold text-gray-500 uppercase text-right">Rate</div>
              <div className="w-[15%] text-[8px] font-bold text-gray-500 uppercase text-right">Amount</div>
            </div>
            {details.items.map((item, idx) => (
              <div key={item.id} className="flex py-1 border-b border-gray-100">
                <div className="w-[5%] text-[9px] text-gray-500">{idx + 1}.</div>
                <div className="w-[30%] text-[9px] font-semibold">{item.name || "—"}</div>
                <div className="w-[35%] text-[8px] text-gray-500 leading-tight whitespace-pre-line">{item.description}</div>
                <div className="w-[15%] text-[9px] text-right">{fmt(item.unitPrice)}</div>
                <div className="w-[15%] text-[9px] font-semibold text-right">{fmt(item.quantity * item.unitPrice)}</div>
              </div>
            ))}
          </div>

          {/* ── Totals ── */}
          <div className="flex justify-end" style={{ padding: "10px 40px" }}>
            <div style={{ width: 200 }}>
              {(details.discountDetails || details.taxDetails || details.shippingDetails) && (
                <>
                  <div className="flex justify-between py-0.5 text-[9px] text-gray-500">
                    <span>Subtotal</span>
                    <span>{fmt(details.subTotal)}</span>
                  </div>
                  {details.discountDetails && discountAmt > 0 && (
                    <div className="flex justify-between py-0.5 text-[9px] text-gray-500">
                      <span>Discount{details.discountDetails.amountType === "percentage" ? ` (${details.discountDetails.amount}%)` : ""}</span>
                      <span className="text-red-600">-{fmt(discountAmt)}</span>
                    </div>
                  )}
                  {details.taxDetails && taxAmt > 0 && (
                    <div className="flex justify-between py-0.5 text-[9px] text-gray-500">
                      <span>Tax{details.taxDetails.amountType === "percentage" ? ` (${details.taxDetails.amount}%)` : ""}</span>
                      <span>+{fmt(taxAmt)}</span>
                    </div>
                  )}
                  {details.shippingDetails && shipAmt > 0 && (
                    <div className="flex justify-between py-0.5 text-[9px] text-gray-500">
                      <span>Shipping{details.shippingDetails.costType === "percentage" ? ` (${details.shippingDetails.cost}%)` : ""}</span>
                      <span>+{fmt(shipAmt)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between pt-1.5 mt-1 border-t border-gray-300 text-[10px] font-bold">
                <span>Total</span>
                <span>{fmt(details.totalAmount)}</span>
              </div>
              {details.totalInWords && details.totalAmount > 0 && (
                <div className="text-[8px] text-gray-400 italic mt-0.5 text-right">
                  {numberToWords(details.totalAmount, details.currency)}
                </div>
              )}
            </div>
          </div>

          {/* ── Note to customer ── */}
          {details.noteToCustomer && (
            <div style={{ padding: "16px 40px 10px" }}>
              <div className="text-[12px] font-bold mb-1.5" style={{ color: theme }}>
                Note to customer
              </div>
              <div className="text-[8px] text-gray-500 leading-relaxed whitespace-pre-line">
                {details.noteToCustomer}
              </div>
            </div>
          )}

          {/* ── Payment terms ── */}
          {details.paymentTerms && (
            <div style={{ padding: "6px 40px" }}>
              <div className="text-[8px] font-bold uppercase tracking-wide mb-1" style={{ color: theme }}>
                Payment Terms
              </div>
              <div className="text-[8px] text-gray-500 leading-relaxed whitespace-pre-line">{details.paymentTerms}</div>
            </div>
          )}

          {/* ── Notes ── */}
          {details.additionalNotes && (
            <div style={{ padding: "6px 40px" }}>
              <div className="text-[8px] font-bold uppercase tracking-wide mb-1" style={{ color: theme }}>
                Additional Notes
              </div>
              <div className="text-[8px] text-gray-500 leading-relaxed whitespace-pre-line">{details.additionalNotes}</div>
            </div>
          )}

          {/* ── Signature ── */}
          {details.signature && (
            <div style={{ padding: "10px 40px" }} className="mt-2 border-t border-gray-200 pt-3">
              <div className="text-[8px] text-gray-400 mb-1">Signature</div>
              {details.signature.type === "type" ? (
                <div
                  style={{
                    fontFamily: `'${details.signature.fontFamily}', cursive`,
                    color: details.signature.color || "#000",
                    fontSize: 22,
                  }}
                >
                  {details.signature.data}
                </div>
              ) : (
                <img src={details.signature.data} alt="Signature" className="h-12 object-contain" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
