import { invoicePDF } from "./invoice-pdf.js";
import { db, checked, toast, download } from "./core.js";
import { invoiceHTML, invoiceNumber } from "./documents.js";
(async () => {
  const token = new URLSearchParams(location.search).get("token");
  if (!token) {
    document.getElementById("invoice-root").textContent =
      "Open the private invoice link from your confirmation or email.";
    return;
  }
  try {
    const doc = await checked(
      db.rpc("bp_command", { p_action: "document", p: { token } }),
    );
    if (!doc)
      throw new Error(
        "This invoice link is not available. Contact Beauty Plus with your reference.",
      );
    document.title = invoiceNumber(doc.invoice) + " · Beauty Plus";
    document.getElementById("invoice-root").innerHTML = invoiceHTML(doc);
    if (doc.request?.kind === "enrollment" && doc.invoice.status !== "void") {
      const link = document.createElement("a");
      link.className = "bp-button";
      link.textContent = "Make a tuition payment";
      link.href =
        "/enroll.html?invoice=" + encodeURIComponent(token) + "#pay-tuition";
      document.querySelector(".invoice-toolbar").append(link);
    }
    document.getElementById("invoice-download").onclick = async (e) => {
      e.target.disabled = true;
      try {
        const bytes = await invoicePDF(doc);
        download(invoiceNumber(doc.invoice) + ".pdf", bytes, "application/pdf");
      } catch (err) {
        toast(err.message, true);
      } finally {
        e.target.disabled = false;
      }
    };
  } catch (err) {
    document.getElementById("invoice-root").textContent = err.message;
  }
})();
document.getElementById("invoice-print").onclick = () => window.print();
