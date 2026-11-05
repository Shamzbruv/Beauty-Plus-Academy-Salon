export const round = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export function saleTotals(products, cart, discount = 0) {
  const lines = cart.map((item) => {
    const product = products.find((p) => p.id === item.id);
    const quantity = Number(item.qty);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)
      throw new Error("Use a quantity between 1 and 999.");
    const net = round(Number(product?.price || 0) * quantity);
    return {
      ...product,
      id: item.id,
      name: product?.name || "Unavailable product",
      unavailable: !product,
      qty: quantity,
      net,
      tax: round((net * Number(product?.tax_rate || 0)) / 100),
    };
  });
  const subtotal = round(lines.reduce((n, l) => n + l.net, 0));
  const tax = round(lines.reduce((n, l) => n + l.tax, 0));
  const deduction = Number(discount || 0);
  if (
    !Number.isFinite(deduction) ||
    deduction < 0 ||
    deduction > subtotal + tax
  )
    throw new Error("Discount must be within the sale total.");
  return {
    lines,
    subtotal,
    tax,
    discount: round(deduction),
    total: round(subtotal + tax - deduction),
    quantity: lines.reduce((n, l) => n + l.qty, 0),
  };
}
export function tenderPlan(payment, due) {
  const amount = (value) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n < 0)
      throw new Error("Enter a valid payment amount.");
    return round(n);
  };
  const cashReceived = amount(payment.received);
  let payments = [];
  if (due > 0) {
    if (payment.method === "split")
      payments = [
        ["cash", payment.cash],
        ["card", payment.card],
        ["bank", payment.bank],
      ]
        .map(([method, v]) => ({
          method,
          amount: amount(v),
          reference: payment.reference || "",
        }))
        .filter((p) => p.amount > 0);
    else if (["cash", "card", "bank"].includes(payment.method))
      payments = [
        {
          method: payment.method,
          amount: due,
          reference: payment.reference || "",
        },
      ];
    else throw new Error("Choose a payment method.");
  }
  const applied = round(payments.reduce((n, p) => n + p.amount, 0));
  if (applied !== due)
    throw new Error("Payments must add up to the sale total.");
  const cash = payments.find((p) => p.method === "cash")?.amount || 0;
  if (cashReceived < cash)
    throw new Error("Cash received is less than the cash payment.");
  if (payments.some((p) => p.method !== "cash") && !payment.confirmed)
    throw new Error(
      "Confirm the payment on your terminal or bank before completing the sale.",
    );
  return {
    payments,
    cash_received: cash > 0 ? cashReceived : 0,
    change: cash > 0 ? round(cashReceived - cash) : 0,
  };
}
