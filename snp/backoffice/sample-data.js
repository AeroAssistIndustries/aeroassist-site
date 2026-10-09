/* Staging sample data. Fictional companies and people; dates are relative to today so the screens always look current.
   Company records and templates come from staging-data.js, which the build generates from the plugin's starting data with business details removed. */
window.SNP_STAGING_SEED = function () {
  "use strict";
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const month = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
  const iso = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 19) + "Z";
  const OWNER = 1, COOWNER = 2, ACCT = 3, LAW = 4;
  let id = 1000;
  const items = [];
  const add = (type, data, by = OWNER, ago = 0) => { const it = { id: ++id, type, data, createdAt: iso(-ago - 1), createdBy: by, updatedAt: iso(-ago), updatedBy: by }; items.push(it); return it.id; };

  /* customers */
  const desert = add("customer", { name: "Desert Auto Parts", status: "Active", divisions: ["Oil"], contactName: "Maria Lopez", email: "maria@example.com", phone: "(602) 555-0101", address: "1200 W Example Rd\nPhoenix, AZ 85001", state: "AZ", country: "USA", terms: "Net 30", creditLimit: 50000, resaleCert: true, resaleExpiry: day(220), ownerId: OWNER, source: "Referral", notes: "Prefers deliveries before 10 a.m.", contacts: [{ name: "Maria Lopez", title: "Purchasing", email: "maria@example.com", phone: "(602) 555-0101" }, { name: "Dan Ortiz", title: "Accounts payable", email: "ap@example.com", phone: "" }] }, OWNER, 40);
  const mesa = add("customer", { name: "Mesa Fleet Services", status: "Active", divisions: ["Oil"], contactName: "James Carter", email: "james@example.com", phone: "(480) 555-0144", address: "Mesa, AZ", state: "AZ", country: "USA", terms: "Net 15", creditLimit: 80000, resaleCert: true, resaleExpiry: day(18), ownerId: COOWNER, source: "Website", notes: "", contacts: [] }, COOWNER, 35);
  const coastal = add("customer", { name: "Coastal Pool Supply", status: "Lead", divisions: ["Commercial supply"], contactName: "Erin Walsh", email: "erin@example.com", phone: "(305) 555-0190", address: "Miami, FL", state: "FL", country: "USA", terms: "Prepaid", creditLimit: 0, resaleCert: false, resaleExpiry: "", ownerId: OWNER, source: "Trade show", notes: "", contacts: [] }, OWNER, 12);
  const andes = add("customer", { name: "Andes Mobile Import", status: "Active", divisions: ["Phones & electronics"], contactName: "Lucía Rojas", email: "lucia@example.com", phone: "+51 1 555 0100", address: "Lima, Peru", state: "", country: "Peru", terms: "Prepaid", creditLimit: 0, resaleCert: false, resaleExpiry: "", ownerId: COOWNER, source: "WhatsApp", notes: "Quotes in USD; ships via Miami forwarder.", contacts: [] }, COOWNER, 20);
  const valley = add("customer", { name: "Valley Lube Center", status: "Inactive", divisions: ["Oil"], contactName: "Rick Moore", email: "rick@example.com", phone: "(702) 555-0122", address: "Henderson, NV", state: "NV", country: "USA", terms: "Net 15", creditLimit: 10000, resaleCert: true, resaleExpiry: day(-30), ownerId: OWNER, source: "", notes: "", contacts: [] }, OWNER, 90);

  /* calls & notes */
  add("interaction", { customerId: desert, date: day(-2), kind: "Call", summary: "Maria wants weekly deliveries of 5W-30 through the holidays. Sending revised pricing." }, OWNER, 2);
  add("interaction", { customerId: desert, date: day(-15), kind: "Email", summary: "Sent updated resale certificate request; received same day." }, OWNER, 15);
  add("interaction", { customerId: mesa, date: day(-6), kind: "Meeting", summary: "Walked through Q4 fleet program. Decision expected next week." }, COOWNER, 6);
  add("interaction", { customerId: andes, date: day(-1), kind: "WhatsApp", summary: "Lucía asked for Grade A pricing on 200 units; needs pro forma for her bank." }, COOWNER, 1);

  /* deals */
  add("deal", { title: "Weekly Mobil 1 supply", customerId: desert, division: "Oil", value: 18000, stage: "Negotiating", expectedClose: day(10), ownerId: OWNER, nextStep: "Send revised pricing", nextStepDate: day(-1), lostReason: "", notes: "" }, OWNER, 2);
  add("deal", { title: "Q4 fleet oil program", customerId: mesa, division: "Oil", value: 42000, stage: "Quoted", expectedClose: day(14), ownerId: COOWNER, nextStep: "Follow up on quote", nextStepDate: day(3), lostReason: "", notes: "" }, COOWNER, 5);
  add("deal", { title: "Pool season pre-buy", customerId: coastal, division: "Commercial supply", value: 9500, stage: "Contacted", expectedClose: day(45), ownerId: OWNER, nextStep: "Send chlorine line sheet", nextStepDate: day(7), lostReason: "", notes: "" }, OWNER, 9);
  add("deal", { title: "200 × iPhone 14, Grade A", customerId: andes, division: "Phones & electronics", value: 61000, stage: "Lead", expectedClose: day(30), ownerId: COOWNER, nextStep: "Confirm stock with supplier", nextStepDate: day(2), lostReason: "", notes: "" }, COOWNER, 1);
  add("deal", { title: "Shop restock", customerId: desert, division: "Oil", value: 7200, stage: "Won", expectedClose: day(-20), ownerId: OWNER, nextStep: "", nextStepDate: "", lostReason: "", notes: "" }, OWNER, 20);
  add("deal", { title: "Bulk ATF order", customerId: valley, division: "Oil", value: 5400, stage: "Lost", expectedClose: day(-40), ownerId: OWNER, nextStep: "", nextStepDate: "", lostReason: "Went with a local distributor", notes: "" }, OWNER, 40);

  /* quotes & invoices (numbers and totals are filled in by the staging server) */
  const oil = [{ desc: "Mobil 1 5W-30, case of 6 qt", grade: "", qty: 120, price: 38.5 }, { desc: "Freight and handling", grade: "", qty: 1, price: 250 }];
  add("quote", { customerId: mesa, date: day(-2), validUntil: day(1), status: "Sent", division: "Oil", lines: [{ desc: "Mobil 1 5W-30, case of 6 qt", grade: "", qty: 600, price: 37.9 }, { desc: "Freight, 2 truckloads", grade: "", qty: 1, price: 900 }], shipping: 0, taxRate: 0, notes: "Pricing assumes two truckload deliveries in Q4.", internalNotes: "" }, COOWNER, 2);
  add("quote", { customerId: coastal, date: day(-1), validUntil: day(2), status: "Draft", division: "Commercial supply", lines: [{ desc: "Calcium hypochlorite 65%, 50 lb pail", grade: "", qty: 40, price: 112 }], shipping: 380, taxRate: 0, notes: "", internalNotes: "Confirm hazmat freight with carrier." }, OWNER, 1);
  add("invoice", { customerId: desert, date: day(-20), dueDate: day(10), status: "Sent", division: "Oil", lines: oil, shipping: 0, taxRate: 0, notes: "", internalNotes: "", payments: [{ date: day(-5), amount: 4870, method: "Wire", ref: "Sample wire" }] }, OWNER, 5);
  add("invoice", { customerId: mesa, date: day(-40), dueDate: day(-25), status: "Sent", division: "Oil", lines: [{ desc: "Mobil 1 15W-40, case of 4 gal", grade: "", qty: 220, price: 74 }], shipping: 0, taxRate: 0, notes: "", internalNotes: "Promised payment by Friday.", payments: [{ date: day(-20), amount: 6000, method: "ACH", ref: "" }] }, COOWNER, 20);
  add("invoice", { customerId: andes, date: day(-3), dueDate: day(-3), status: "Sent", division: "Phones & electronics", lines: [{ desc: "iPhone 13 128GB", grade: "Grade A", qty: 50, price: 365 }, { desc: "iPhone 13 128GB", grade: "Grade B", qty: 30, price: 310 }], shipping: 420, taxRate: 0, notes: "Prepaid. Ships from Miami on receipt of payment.", internalNotes: "", payments: [] }, COOWNER, 3);
  add("invoice", { customerId: desert, date: day(-48), dueDate: day(-18), status: "Sent", division: "Oil", lines: [{ desc: "Mobil 1 0W-20, case of 6 qt", grade: "", qty: 90, price: 41 }], shipping: 0, taxRate: 0, notes: "", internalNotes: "", payments: [{ date: day(-30), amount: 3690, method: "Check", ref: "Check 2231" }] }, OWNER, 30);
  add("invoice", { customerId: desert, date: day(0), dueDate: day(30), status: "Draft", division: "Oil", lines: [{ desc: "Mobil 1 5W-30, case of 6 qt", grade: "", qty: 60, price: 38.5 }], shipping: 0, taxRate: 0, notes: "", internalNotes: "", payments: [] }, OWNER, 0);

  /* oil orders */
  const M = ["Membership A", "Membership B"];
  add("oil_order", { date: day(-50), customerId: desert, membership: M[0], description: "1 truckload, mixed viscosities", amount: 26500, rewardAmount: 500, rewardStatus: "Deposited", depositDate: day(-35), notes: "" }, OWNER, 35);
  add("oil_order", { date: day(-44), customerId: mesa, membership: M[1], description: "1 truckload 15W-40", amount: 31200, rewardAmount: 500, rewardStatus: "Deposited", depositDate: day(-32), notes: "" }, OWNER, 32);
  add("oil_order", { date: day(-21), customerId: desert, membership: M[0], description: "1 truckload 5W-30", amount: 25800, rewardAmount: 500, rewardStatus: "Deposited", depositDate: month(0) + "-02", notes: "" }, OWNER, 6);
  add("oil_order", { date: day(-14), customerId: mesa, membership: M[1], description: "1 truckload 15W-40", amount: 29900, rewardAmount: 500, rewardStatus: "Deposited", depositDate: month(0) + "-05", notes: "" }, OWNER, 4);
  add("oil_order", { date: day(-6), customerId: desert, membership: M[0], description: "Half truckload 0W-20", amount: 13100, rewardAmount: 250, rewardStatus: "Earned", depositDate: "", notes: "" }, OWNER, 6);
  add("oil_order", { date: day(-2), customerId: valley, membership: M[1], description: "Pallet order, under minimum", amount: 4800, rewardAmount: 0, rewardStatus: "Cancelled", depositDate: "", notes: "Below the reward threshold." }, OWNER, 2);
  add("oil_order", { date: day(-1), customerId: mesa, membership: M[1], description: "1 truckload 15W-40", amount: 30400, rewardAmount: 500, rewardStatus: "Pending", depositDate: "", notes: "" }, COOWNER, 1);
  add("oil_cost", { month: month(-1), description: "Membership renewal (sample)", amount: 120 }, OWNER, 30);
  add("oil_cost", { month: month(0), description: "Wire fees (sample)", amount: 30 }, OWNER, 3);
  add("payout", { month: month(-1), amount: 440, paidDate: month(0) + "-03", method: "Wire", reference: "Sample", notes: "" }, OWNER, 5);

  /* suppliers & POs */
  const gulf = add("supplier", { name: "Gulf Coast Lubricants", divisions: ["Oil"], contactName: "Tom Reyes", email: "tom@example.com", phone: "(713) 555-0150", address: "Houston, TX", terms: "Prepaid wire", w9: true, coi: true, notes: "" }, OWNER, 60);
  const sunbelt = add("supplier", { name: "Sunbelt Pool Chemicals", divisions: ["Commercial supply"], contactName: "Ana Kim", email: "ana@example.com", phone: "(813) 555-0177", address: "Tampa, FL", terms: "Net 30", w9: true, coi: false, notes: "Hazmat freight only on Tuesdays." }, OWNER, 25);
  const devices = add("supplier", { name: "Miami Device Traders", divisions: ["Phones & electronics"], contactName: "Leo Park", email: "leo@example.com", phone: "(305) 555-0133", address: "Doral, FL", terms: "Prepaid", w9: false, coi: false, notes: "" }, COOWNER, 15);
  add("po", { supplierId: sunbelt, date: day(-9), expectedDate: day(-2), status: "Confirmed", division: "Commercial supply", lines: [{ desc: "Calcium hypochlorite 65%, 50 lb pail", grade: "", qty: 40, price: 89 }], shipping: 300, taxRate: 0, shipTo: "SNP Wholesale LLC\nArizona, USA", notes: "", internalNotes: "" }, OWNER, 9);
  add("po", { supplierId: devices, date: day(-5), expectedDate: day(-1), status: "Received", division: "Phones & electronics", lines: [{ desc: "iPhone 13 128GB", grade: "Grade A", qty: 50, price: 318 }, { desc: "iPhone 13 128GB", grade: "Grade B", qty: 30, price: 265 }], shipping: 0, taxRate: 0, shipTo: "Miami forwarder (sample)", notes: "", internalNotes: "" }, COOWNER, 1);
  add("po", { supplierId: gulf, date: day(0), expectedDate: day(7), status: "Draft", division: "Oil", lines: [{ desc: "Mobil 1 5W-30, case of 6 qt", grade: "", qty: 300, price: 33 }], shipping: 0, taxRate: 0, shipTo: "Customer direct: Desert Auto Parts, Phoenix AZ", notes: "", internalNotes: "" }, OWNER, 0);

  /* tasks */
  add("task", { title: "Renew Arizona TPT license", assigneeId: OWNER, due: day(-2), status: "Open", priority: "High", relatedType: "", relatedId: 0, relatedLabel: "", notes: "", doneAt: "" }, OWNER, 10);
  add("task", { title: "Call Mesa Fleet about the overdue invoice", assigneeId: OWNER, due: day(0), status: "Open", priority: "Normal", relatedType: "customer", relatedId: mesa, relatedLabel: "Mesa Fleet Services", notes: "", doneAt: "" }, OWNER, 1);
  add("task", { title: "Get resale certificate from Coastal Pool", assigneeId: COOWNER, due: day(5), status: "Open", priority: "Normal", relatedType: "customer", relatedId: coastal, relatedLabel: "Coastal Pool Supply", notes: "", doneAt: "" }, OWNER, 2);
  add("task", { title: "Reconcile last month's rewards", assigneeId: ACCT, due: day(2), status: "Open", priority: "Normal", relatedType: "", relatedId: 0, relatedLabel: "", notes: "", doneAt: "" }, OWNER, 3);
  add("task", { title: "File monthly sales tax returns", assigneeId: ACCT, due: day(11), status: "Open", priority: "High", relatedType: "", relatedId: 0, relatedLabel: "", notes: "", doneAt: "" }, OWNER, 3);
  add("task", { title: "Review the Terms of Sale draft", assigneeId: LAW, due: day(4), status: "Open", priority: "Normal", relatedType: "", relatedId: 0, relatedLabel: "", notes: "", doneAt: "" }, OWNER, 3);
  add("task", { title: "Send W-9 to Gulf Coast Lubricants", assigneeId: OWNER, due: day(-6), status: "Done", priority: "Normal", relatedType: "", relatedId: 0, relatedLabel: "", notes: "", doneAt: iso(-6) }, OWNER, 6);

  /* company records: vary the starting statuses so the checklist looks lived-in */
  const status = { "CO-01": "On file", "CO-02": "Needs review", "CO-03": "On file", "CO-05": "On file", "TX-01": "On file", "TX-02": "In progress", "TX-05": "On file", "SA-01": "Needs review", "SA-02": "In progress", "SA-03": "In progress", "SU-05": "Missing", "PA-02": "On file", "PR-01": "Missing", "IN-01": "On file", "IN-02": "Missing" };
  const due = { "TX-07": day(20), "SA-01": day(5), "IN-02": day(-3), "CO-02": day(12) };
  let docId = 1;
  const docs = window.SNP_STAGING_DOCS.map(d => Object.assign({}, d, { id: docId++, status: status[d.code] || d.status, due: due[d.code] || "", updatedAt: status[d.code] ? iso(-3) : "", updatedBy: status[d.code] ? OWNER : 0 }));

  return {
    v: 1, seq: 5000,
    cats: window.SNP_STAGING_CATS,
    assignees: ["Owner 1", "Owner 2", "Accountant", "Attorney"],
    docs, files: [],
    templates: window.SNP_STAGING_TEMPLATES.map(t => Object.assign({ updatedAt: "", updatedBy: 0 }, t)),
    people: [
      { id: OWNER, name: "Demo Owner", email: "owner@example.com", role: "owner", snpRole: "", label: "Site administrator", isAdmin: true },
      { id: COOWNER, name: "Co-owner (sample)", email: "coowner@example.com", role: "owner", snpRole: "snp_owner", label: "Owner", isAdmin: false },
      { id: ACCT, name: "Accountant (sample)", email: "accountant@example.com", role: "accountant", snpRole: "snp_accountant", label: "Accountant", isAdmin: false },
      { id: LAW, name: "Attorney (sample)", email: "attorney@example.com", role: "attorney", snpRole: "snp_attorney", label: "Attorney", isAdmin: false },
    ],
    activity: [],
    settings: { companyName: "SNP Wholesale LLC", companyAddress: "Arizona, USA", companyPhone: "+1 (775) 250-6263", companyEmail: "sales@snpwholesale.com", companyWebsite: "snpwholesale.com",
      quoteValidDays: 3, invoiceDueDays: 15, taxRate: 0, paymentInfo: "SAMPLE: payment instructions appear here. Real bank details are entered in Settings on the live system only.",
      documentFooter: "All sales are subject to SNP Wholesale LLC's Terms & Conditions of Sale.", partnerName: "Partner (sample)", partnerShare: 50, costsBeforeSplit: true, memberships: M, reminders: true },
    items,
  };
};
