const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const esbuild = require("../scripts/node_modules/esbuild");
const result = esbuild.buildSync({
  entryPoints: [path.join(__dirname, "../assets/pos-model.js")],
  bundle: true,
  format: "cjs",
  platform: "node",
  write: false,
});
const moduleFixture = { exports: {} };
new Function("module", "exports", result.outputFiles[0].text)(
  moduleFixture,
  moduleFixture.exports,
);
const { saleTotals, tenderPlan } = moduleFixture.exports;
test("register totals keep tax, discounts and missing inventory explicit", () => {
  const p = [
    { id: "a", name: "Shampoo", price: 999.99, tax_rate: 15 },
    { id: "b", name: "Brush", price: 500, tax_rate: 0 },
  ];
  const t = saleTotals(
    p,
    [
      { id: "a", qty: 2 },
      { id: "b", qty: 1 },
    ],
    100,
  );
  assert.equal(t.subtotal, 2499.98);
  assert.equal(t.tax, 300);
  assert.equal(t.total, 2699.98);
  assert.throws(() => saleTotals(p, [{ id: "a", qty: 1 }], 2000), /Discount/);
  assert.throws(() => saleTotals(p, [{ id: "a", qty: 1.5 }]), /quantity/);
  assert.equal(
    saleTotals(p, [{ id: "missing", qty: 1 }]).lines[0].unavailable,
    true,
  );
});
test("cash and split tender reconcile exactly and require external confirmation", () => {
  assert.equal(
    tenderPlan({ method: "cash", received: 3000 }, 2699.98).change,
    300.02,
  );
  assert.throws(
    () => tenderPlan({ method: "cash", received: 1000 }, 2699.98),
    /less than/,
  );
  assert.throws(
    () =>
      tenderPlan(
        {
          method: "split",
          cash: 1000,
          card: 1500,
          received: 1000,
          confirmed: true,
        },
        2699.98,
      ),
    /add up/,
  );
  assert.throws(() => tenderPlan({ method: "card" }, 2699.98), /Confirm/);
  const plan = tenderPlan(
    {
      method: "split",
      cash: 1000,
      card: 1699.98,
      received: 1500,
      confirmed: true,
    },
    2699.98,
  );
  assert.equal(plan.payments.length, 2);
  assert.equal(plan.change, 500);
  assert.equal(
    tenderPlan({ method: "bank", confirmed: true, received: 99999 }, 10)
      .cash_received,
    0,
  );
  assert.equal(tenderPlan({ method: "cash" }, 0).payments.length, 0);
  assert.throws(
    () => tenderPlan({ method: "cash", received: "bad" }, 100),
    /valid/,
  );
});
