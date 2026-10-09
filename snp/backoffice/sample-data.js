/* Staging sample data. Fictional companies and people; dates are relative to today so the screens always look current.
   Company records and templates come from staging-data.js, which the build generates from the plugin's starting data with business details removed. */
window.SNP_STAGING_SEED = function () {
  "use strict";
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const month = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
  const iso = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 19) + "Z";
  const OWNER = 1, COOWNER = 2, ACCT = 3, LAW = 4, SALES = 5;
  const mday = n => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), Math.min(n, d.getDate()))); };
  const mago = (m, n) => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth() - m, n)); };
  let id = 1000;
  const items = [];
  const add = (type, data, by = OWNER, ago = 0) => { const it = { id: ++id, type, data, createdAt: iso(-ago - 1), createdBy: by, updatedAt: iso(-ago), updatedBy: by }; items.push(it); return it.id; };

  /* customers */
  const desert = add("customer", { name: "Desert Auto Parts", status: "Active", divisions: ["Oil"], contactName: "Maria Lopez", email: "maria@example.com", phone: "(602) 555-0101", address: "1200 W Example Rd\nPhoenix, AZ 85001", state: "AZ", country: "USA", terms: "Net 30", creditLimit: 50000, resaleCert: true, resaleExpiry: day(220), ownerId: OWNER, source: "Referral", notes: "Prefers deliveries before 10 a.m.", contacts: [{ name: "Maria Lopez", title: "Purchasing", email: "maria@example.com", phone: "(602) 555-0101" }, { name: "Dan Ortiz", title: "Accounts payable", email: "ap@example.com", phone: "" }] }, OWNER, 40);
  const mesa = add("customer", { name: "Mesa Fleet Services", status: "Active", divisions: ["Oil"], contactName: "James Carter", email: "james@example.com", phone: "(480) 555-0144", address: "Mesa, AZ", state: "AZ", country: "USA", terms: "Net 15", creditLimit: 80000, resaleCert: true, resaleExpiry: day(18), ownerId: COOWNER, source: "Website", notes: "", contacts: [] }, COOWNER, 35);
  const coastal = add("customer", { name: "Coastal Pool Supply", status: "Lead", divisions: ["Commercial supply"], contactName: "Erin Walsh", email: "erin@example.com", phone: "(305) 555-0190", address: "Miami, FL", state: "FL", country: "USA", terms: "Prepaid", creditLimit: 0, resaleCert: false, resaleExpiry: "", ownerId: SALES, source: "Trade show", notes: "", contacts: [] }, SALES, 12);
  const andes = add("customer", { name: "Andes Mobile Import", status: "Active", divisions: ["Phones & electronics"], contactName: "Lucía Rojas", email: "lucia@example.com", phone: "+51 1 555 0100", address: "Lima, Peru", state: "", country: "Peru", terms: "Prepaid", creditLimit: 0, resaleCert: false, resaleExpiry: "", ownerId: SALES, source: "WhatsApp", notes: "Quotes in USD; ships via Miami forwarder.", contacts: [] }, COOWNER, 20);
  const quetzal = add("customer", { name: "Quetzal Distribuidora", status: "Active", divisions: ["Oil", "Commercial supply"], contactName: "Andrés Castillo", email: "andres@example.com", phone: "+502 5555 0110", address: "Guatemala City, Guatemala", state: "", country: "Guatemala", terms: "Prepaid", creditLimit: 0, resaleCert: false, resaleExpiry: "", ownerId: SALES, source: "Website", notes: "Pays by wire before loading. Wants quotes shown in quetzales for reference.", contacts: [] }, SALES, 70);
  const valley = add("customer", { name: "Valley Lube Center", status: "Inactive", divisions: ["Oil"], contactName: "Rick Moore", email: "rick@example.com", phone: "(702) 555-0122", address: "Henderson, NV", state: "NV", country: "USA", terms: "Net 15", creditLimit: 10000, resaleCert: true, resaleExpiry: day(-30), ownerId: OWNER, source: "", notes: "", contacts: [] }, OWNER, 90);

  /* products (cost is what SNP pays; sales people never see it) */
  const P = {};
  const prod = (k, d) => { P[k] = add("product", Object.assign({ sku: "", category: "", unit: "", grade: "", stock: 0, active: true, notes: "" }, d), OWNER, 50); };
  prod("m530", { name: "Mobil 1 5W-30, case of 6 qt", sku: "M1-530-6", division: "Oil", category: "Motor oil", unit: "case", cost: 31.4, price: 38.5, stock: 140 });
  prod("m020", { name: "Mobil 1 0W-20, case of 6 qt", sku: "M1-020-6", division: "Oil", category: "Motor oil", unit: "case", cost: 33.2, price: 41, stock: 60 });
  prod("m1540", { name: "Mobil 1 15W-40, case of 4 gal", sku: "M1-1540-4G", division: "Oil", category: "Diesel oil", unit: "case", cost: 61.5, price: 74, stock: 35 });
  prod("atf", { name: "Synthetic ATF, case of 6 qt", sku: "ATF-6", division: "Oil", category: "Transmission fluid", unit: "case", cost: 27.8, price: 34, stock: 0 });
  prod("i13a", { name: "iPhone 13 128GB", sku: "IP13-128", division: "Phones & electronics", category: "Phones", unit: "unit", grade: "Grade A", cost: 318, price: 365, stock: 12 });
  prod("i13b", { name: "iPhone 13 128GB", sku: "IP13-128-B", division: "Phones & electronics", category: "Phones", unit: "unit", grade: "Grade B", cost: 265, price: 310, stock: 4 });
  prod("i14a", { name: "iPhone 14 128GB", sku: "IP14-128", division: "Phones & electronics", category: "Phones", unit: "unit", grade: "Grade A", cost: 268, price: 305, stock: 0 });
  prod("cal", { name: "Calcium hypochlorite 65%, 50 lb pail", sku: "CAL-65-50", division: "Commercial supply", category: "Pool chemicals", unit: "pail", cost: 89, price: 112, stock: 18 });
  prod("tabs", { name: "Trichlor 3\" tablets, 50 lb pail", sku: "TRI-3-50", division: "Commercial supply", category: "Pool chemicals", unit: "pail", cost: 142, price: 168, stock: 10 });
  prod("old", { name: "Conventional 10W-30, case of 12 qt", sku: "CONV-1030", division: "Oil", category: "Motor oil", unit: "case", cost: 29, price: 33, stock: 0, active: false, notes: "Discontinued by the supplier." });
  const L = (k, qty, extra = {}) => { const p = items.find(i => i.id === P[k]).data; return Object.assign({ desc: p.name, grade: p.grade, qty, price: p.price, cost: p.cost, productId: P[k] }, extra); };
  const freight = (amount, desc = "Freight and handling") => ({ desc, grade: "", qty: 1, price: amount, cost: amount, productId: 0 });

  /* CRM details on the companies above */
  const D = id => items.find(i => i.id === id).data;
  Object.assign(D(desert), { industry: "Auto parts store", tags: ["Arizona", "Weekly buyer"], lat: 33.4484, lng: -112.074, website: "desertautoparts.example", contacts: [], custom: { fleet_size: "", delivery_day: "Tue" } });
  Object.assign(D(mesa), { industry: "Fleet", tags: ["Arizona", "Fleet"], lat: 33.4152, lng: -111.8315, custom: { fleet_size: "140", delivery_day: "Mon" } });
  Object.assign(D(coastal), { industry: "Pool & spa", tags: ["Florida", "Seasonal"], lat: 25.7617, lng: -80.1918 });
  Object.assign(D(andes), { industry: "Phone retailer", tags: ["LatAm", "Export"], lat: -12.0464, lng: -77.0428 });
  Object.assign(D(quetzal), { industry: "Distributor", tags: ["LatAm", "Export", "Prepaid"], lat: 14.6349, lng: -90.5069 });
  Object.assign(D(valley), { industry: "Repair shop", tags: ["Nevada"], lat: 36.0395, lng: -114.9817 });
  const co = (d, by = OWNER, ago = 90) => add("customer", Object.assign({ status: "Active", divisions: ["Oil"], terms: "Net 15", creditLimit: 0, resaleCert: true, resaleExpiry: day(300), source: "", notes: "", contacts: [], tags: [] }, d), by, ago);
  const sonoran = co({ name: "Sonoran Truck & Diesel", industry: "Fleet", phone: "(520) 555-0170", email: "parts@sonoran.example", address: "Tucson, AZ", state: "AZ", country: "USA", ownerId: COOWNER, tags: ["Arizona", "Fleet"], lat: 32.2226, lng: -110.9747, creditLimit: 30000, custom: { fleet_size: "60" } });
  const neon = co({ name: "Neon City Lube", industry: "Repair shop", phone: "(702) 555-0188", email: "orders@neonlube.example", address: "Las Vegas, NV", state: "NV", country: "USA", ownerId: OWNER, tags: ["Nevada", "Weekly buyer"], lat: 36.1699, lng: -115.1398 });
  const bay = co({ name: "Bay Phones Wholesale", industry: "Phone retailer", divisions: ["Phones & electronics"], phone: "(713) 555-0161", email: "buy@bayphones.example", address: "Houston, TX", state: "TX", country: "USA", ownerId: SALES, terms: "Prepaid", tags: ["Texas"], lat: 29.7604, lng: -95.3698 }, SALES, 200);
  const azteca = co({ name: "Lubricentro Azteca", industry: "Distributor", phone: "+52 55 5555 0123", email: "compras@azteca.example", address: "Mexico City, Mexico", state: "", country: "Mexico", ownerId: SALES, terms: "Prepaid", resaleCert: false, tags: ["LatAm", "Export"], lat: 19.4326, lng: -99.1332 }, SALES, 20);
  const caribe = co({ name: "Caribe Cell Mayorista", status: "Lead", industry: "Phone retailer", divisions: ["Phones & electronics"], phone: "+1 809 555 0145", email: "ventas@caribecell.example", address: "Santo Domingo, Dominican Republic", state: "", country: "Dominican Republic", ownerId: SALES, terms: "Prepaid", resaleCert: false, tags: ["LatAm"], lat: 18.4861, lng: -69.9312 }, SALES, 8);
  const gulfside = co({ name: "Gulfside Pools", industry: "Pool & spa", divisions: ["Commercial supply"], phone: "(813) 555-0129", email: "office@gulfside.example", address: "Tampa, FL", state: "FL", country: "USA", ownerId: OWNER, tags: ["Florida", "Seasonal"], lat: 27.9506, lng: -82.4572 }, OWNER, 220);

  /* contacts */
  const ct = (customerId, d, by = OWNER) => add("contact", Object.assign({ customerId, title: "", phone: "", mobile: "", tags: [], ownerId: customerId ? D(customerId).ownerId || OWNER : OWNER, primary: false, optOut: false, language: "English", notes: "" }, d), by, 60);
  const maria = ct(desert, { name: "Maria Lopez", title: "Purchasing", email: "maria@example.com", phone: "(602) 555-0101", primary: true, custom: { birthday: "" } });
  ct(desert, { name: "Dan Ortiz", title: "Accounts payable", email: "ap@example.com" });
  const james = ct(mesa, { name: "James Carter", title: "Fleet manager", email: "james@example.com", mobile: "(480) 555-0144", primary: true });
  ct(mesa, { name: "Priya Nair", title: "Controller", email: "priya.nair@example.com", tags: ["Billing"] });
  ct(coastal, { name: "Erin Walsh", title: "Owner", email: "erin@example.com", phone: "(305) 555-0190", primary: true });
  const lucia = ct(andes, { name: "Lucía Rojas", title: "Gerente de compras", email: "lucia@example.com", mobile: "+51 1 555 0100", primary: true, language: "Spanish", tags: ["WhatsApp first"] });
  const andres = ct(quetzal, { name: "Andrés Castillo", title: "Director", email: "andres@example.com", mobile: "+502 5555 0110", primary: true, language: "Spanish" });
  ct(quetzal, { name: "Sofía Méndez", title: "Logística", email: "logistica@quetzal.example", language: "Spanish", optOut: true });
  ct(valley, { name: "Rick Moore", title: "Owner", email: "rick@example.com", primary: true, optOut: true });
  ct(sonoran, { name: "Tom Alvarez", title: "Shop foreman", email: "tom@sonoran.example", mobile: "(520) 555-0171", primary: true });
  ct(neon, { name: "Kim Tran", title: "Owner", email: "kim@neonlube.example", primary: true });
  ct(bay, { name: "Omar Haddad", title: "Buyer", email: "omar@bayphones.example", mobile: "(713) 555-0162", primary: true });
  ct(azteca, { name: "Diego Ramírez", title: "Compras", email: "diego@azteca.example", mobile: "+52 55 5555 0124", primary: true, language: "Spanish" });
  ct(caribe, { name: "Paola Núñez", title: "Gerente", email: "paola@caribecell.example", mobile: "+1 809 555 0146", primary: true, language: "Spanish" });
  ct(gulfside, { name: "Beth Moreau", title: "Office manager", email: "beth@gulfside.example", primary: true });
  ct(0, { name: "Alex Rivera", title: "Independent broker", email: "alex.rivera@example.com", ownerId: OWNER, tags: ["Referral partner"] });

  /* calls & notes */
  add("interaction", { customerId: desert, date: day(-2), kind: "Call", summary: "Maria wants weekly deliveries of 5W-30 through the holidays. Sending revised pricing." }, OWNER, 2);
  add("interaction", { customerId: desert, date: day(-15), kind: "Email", summary: "Sent updated resale certificate request; received same day." }, OWNER, 15);
  add("interaction", { customerId: mesa, date: day(-6), kind: "Meeting", summary: "Walked through Q4 fleet program. Decision expected next week." }, COOWNER, 6);
  add("interaction", { customerId: andes, date: day(-1), kind: "WhatsApp", summary: "Lucía asked for Grade A pricing on 200 units; needs pro forma for her bank." }, COOWNER, 1);
  const act = (d, by = OWNER, ago = 0) => add("interaction", Object.assign({ status: "Done", ownerId: by, time: "", durationMin: 30, contactId: 0, location: "" }, d), by, ago);
  act({ customerId: desert, contactId: maria, date: day(0), time: "10:30", kind: "Call", status: "Planned", subject: "Confirm holiday delivery schedule" }, OWNER, 1);
  act({ customerId: mesa, contactId: james, date: day(1), time: "14:00", kind: "Meeting", status: "Planned", subject: "Q4 fleet program decision", location: "Their office, Mesa", durationMin: 60 }, COOWNER, 2);
  act({ customerId: sonoran, date: day(-1), time: "09:00", kind: "Call", status: "Planned", subject: "Reorder check-in" }, COOWNER, 3);
  act({ customerId: quetzal, contactId: andres, date: day(0), time: "11:00", kind: "WhatsApp", status: "Planned", subject: "Send renewed quote" }, SALES, 1);
  act({ customerId: bay, date: day(2), time: "15:30", kind: "Call", status: "Planned", subject: "Win back: new Grade A stock" }, SALES, 1);
  act({ customerId: azteca, date: day(4), kind: "Visit", status: "Planned", subject: "First visit, Mexico City trip", durationMin: 90 }, SALES, 1);
  act({ customerId: neon, date: day(-3), time: "13:15", kind: "Visit", subject: "Visit: Neon City Lube", summary: "Walked the shop with Kim. They want 0W-20 added to the weekly order.", location: "0.1 mi from the account", lat: 36.17, lng: -115.1396 }, OWNER, 3);
  act({ customerId: desert, contactId: maria, date: day(-9), time: "08:40", kind: "Visit", subject: "Visit: Desert Auto Parts", summary: "Dropped off the new price sheet.", location: "0.0 mi from the account", lat: 33.4484, lng: -112.0741 }, OWNER, 9);
  act({ customerId: coastal, date: day(-4), kind: "Email", subject: "Chlorine line sheet", summary: "Sent the line sheet and freight options." }, SALES, 4);

  /* deals */
  add("deal", { title: "Weekly Mobil 1 supply", customerId: desert, division: "Oil", value: 18000, stage: "Negotiating", contactId: maria, expectedClose: day(10), ownerId: OWNER, nextStep: "Send revised pricing", nextStepDate: day(-1), lostReason: "", notes: "" }, OWNER, 2);
  add("deal", { title: "Q4 fleet oil program", customerId: mesa, division: "Oil", value: 42000, stage: "Quoted", expectedClose: day(14), ownerId: COOWNER, nextStep: "Follow up on quote", nextStepDate: day(3), lostReason: "", notes: "" }, COOWNER, 5);
  add("deal", { title: "Pool season pre-buy", customerId: coastal, division: "Commercial supply", value: 9500, stage: "Contacted", expectedClose: day(45), ownerId: SALES, nextStep: "Send chlorine line sheet", nextStepDate: day(0), lostReason: "", notes: "" }, OWNER, 9);
  add("deal", { title: "200 × iPhone 14, Grade A", customerId: andes, division: "Phones & electronics", value: 61000, stage: "Lead", expectedClose: day(30), ownerId: SALES, nextStep: "Confirm stock with supplier", nextStepDate: day(2), lostReason: "", notes: "" }, COOWNER, 1);
  add("deal", { title: "Shop restock", customerId: desert, division: "Oil", value: 7200, stage: "Won", expectedClose: day(-20), ownerId: OWNER, nextStep: "", nextStepDate: "", lostReason: "", notes: "" }, OWNER, 20);
  add("deal", { title: "Bulk ATF order", customerId: valley, division: "Oil", value: 5400, stage: "Lost", expectedClose: day(-40), ownerId: OWNER, nextStep: "", nextStepDate: "", lostReason: "Went with a local distributor", notes: "" }, OWNER, 40);
  add("deal", { title: "Monthly diesel oil contract", customerId: sonoran, division: "Oil", value: 24000, stage: "Contacted", probability: "", expectedClose: day(25), ownerId: COOWNER, nextStep: "Send pricing", nextStepDate: day(1), lostReason: "", notes: "" }, COOWNER, 6);
  add("deal", { title: "Grade A iPhone 13 restock", customerId: bay, contactId: 0, division: "Phones & electronics", value: 36500, stage: "Stock confirmed", expectedClose: day(12), ownerId: SALES, nextStep: "Send quote", nextStepDate: day(0), lostReason: "", notes: "" }, SALES, 4);
  add("deal", { title: "First container, mixed oil", customerId: azteca, division: "Oil", value: 52000, stage: "Quoted", probability: 40, expectedClose: day(40), ownerId: SALES, nextStep: "Follow up on quote", nextStepDate: day(5), lostReason: "", notes: "" }, SALES, 9);
  add("deal", { title: "Opening order", customerId: caribe, division: "Phones & electronics", value: 18000, stage: "Lead", expectedClose: day(60), ownerId: SALES, nextStep: "Intro call", nextStepDate: day(3), lostReason: "", notes: "" }, SALES, 7);
  add("deal", { title: "Summer chemicals program", customerId: gulfside, division: "Commercial supply", value: 14800, stage: "Sample sent", expectedClose: day(20), ownerId: OWNER, nextStep: "Check sample results", nextStepDate: day(6), lostReason: "", notes: "" }, OWNER, 11);
  add("deal", { title: "Las Vegas route expansion", customerId: neon, division: "Oil", value: 9600, stage: "Won", expectedClose: day(-8), ownerId: OWNER, nextStep: "", nextStepDate: "", lostReason: "", notes: "" }, OWNER, 8);
  add("deal", { title: "Phone accessories add-on", customerId: andes, division: "Phones & electronics", value: 7400, stage: "Lost", expectedClose: day(-15), ownerId: SALES, nextStep: "", nextStepDate: "", lostReason: "Price too high", notes: "" }, SALES, 15);
  add("deal", { title: "Pool opening bundle", customerId: coastal, division: "Commercial supply", value: 6200, stage: "Lost", expectedClose: day(-30), ownerId: SALES, nextStep: "", nextStepDate: "", lostReason: "Went with another supplier", notes: "" }, SALES, 30);

  /* quotes & invoices (numbers and totals are filled in by the staging server) */
  const doc = (type, d, by, ago) => add(type, Object.assign({ shipping: 0, taxRate: 0, notes: "", internalNotes: "", currency: "USD", fxRate: 0, emails: [] }, type === "invoice" ? { payments: [] } : {}, d), by, ago);
  doc("quote", { customerId: mesa, repId: COOWNER, date: day(-2), validUntil: day(1), status: "Sent", division: "Oil", lines: [L("m530", 600, { price: 37.9 }), freight(900, "Freight, 2 truckloads")], notes: "Pricing assumes two truckload deliveries in Q4.",
    emails: [{ at: iso(-2), to: "james@example.com", kind: "document", by: COOWNER }] }, COOWNER, 2);
  doc("quote", { customerId: coastal, repId: SALES, date: day(-1), validUntil: day(2), status: "Draft", division: "Commercial supply", lines: [L("cal", 40), L("tabs", 10)], shipping: 380, internalNotes: "Confirm hazmat freight with carrier." }, SALES, 1);
  doc("quote", { customerId: quetzal, repId: SALES, date: day(-6), validUntil: day(-3), status: "Sent", division: "Oil", lines: [L("m530", 300), L("m1540", 80)], currency: "GTQ", fxRate: 7.72, notes: "Prepaid by wire. Loads in Miami within 5 business days of payment.",
    emails: [{ at: iso(-6), to: "andres@example.com", kind: "document", by: SALES }] }, SALES, 6);

  // this month
  doc("invoice", { customerId: desert, repId: OWNER, date: mday(2), dueDate: day(28), status: "Sent", division: "Oil", lines: [L("m530", 120), freight(250)], payments: [{ date: mday(5), amount: 2500, method: "Wire", ref: "Sample wire" }] }, OWNER, 5);
  doc("invoice", { customerId: quetzal, repId: SALES, date: mday(4), dueDate: mday(4), status: "Sent", division: "Oil", lines: [L("m530", 240), L("m020", 60)], currency: "GTQ", fxRate: 7.72, payments: [{ date: mday(4), amount: 11700, method: "Wire", ref: "Sample wire" }] }, SALES, 4);
  doc("invoice", { customerId: andes, repId: SALES, date: day(-3), dueDate: day(-3), status: "Sent", division: "Phones & electronics", lines: [L("i13a", 50), L("i13b", 30)], shipping: 420, notes: "Prepaid. Ships from Miami on receipt of payment.", currency: "PEN", fxRate: 3.76,
    emails: [{ at: iso(-3), to: "lucia@example.com", kind: "document", by: SALES }] }, SALES, 3);
  doc("invoice", { customerId: desert, repId: OWNER, date: day(0), dueDate: day(30), status: "Draft", division: "Oil", lines: [L("m530", 60)] }, OWNER, 0);
  // earlier months (paid unless noted)
  doc("invoice", { customerId: mesa, repId: COOWNER, date: day(-40), dueDate: day(-25), status: "Sent", division: "Oil", lines: [L("m1540", 220)], internalNotes: "Promised payment by Friday.", payments: [{ date: day(-20), amount: 6000, method: "ACH", ref: "" }],
    emails: [{ at: iso(-40), to: "james@example.com", kind: "document", by: COOWNER }, { at: iso(-8), to: "james@example.com", kind: "reminder", by: OWNER }] }, COOWNER, 20);
  doc("invoice", { customerId: desert, repId: OWNER, date: day(-48), dueDate: day(-18), status: "Sent", division: "Oil", lines: [L("m020", 90)], payments: [{ date: day(-30), amount: 3690, method: "Check", ref: "Check 2231" }] }, OWNER, 30);
  const hist = [[5, desert, OWNER, "Oil", [["m530", 110], ["m020", 40]]], [5, andes, SALES, "Phones & electronics", [["i13a", 40]]], [4, mesa, COOWNER, "Oil", [["m1540", 180]]], [4, coastal, SALES, "Commercial supply", [["cal", 30]]],
    [3, desert, OWNER, "Oil", [["m530", 140]]], [3, quetzal, SALES, "Oil", [["m530", 200], ["m1540", 40]]], [2, andes, SALES, "Phones & electronics", [["i13a", 30], ["i13b", 20]]], [2, mesa, COOWNER, "Oil", [["m1540", 200]]],
    [1, desert, OWNER, "Oil", [["m530", 160], ["atf", 50]]], [1, quetzal, SALES, "Oil", [["m530", 260]]], [1, coastal, SALES, "Commercial supply", [["tabs", 24]]]];
  hist.forEach(([m, cust, rep, div, ls], i) => {
    const date = mago(m, 6 + (i % 3) * 7), lines = ls.map(([k, q]) => L(k, q));
    const total = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
    doc("invoice", { customerId: cust, repId: rep, date, dueDate: date, status: "Sent", division: div, lines, payments: [{ date, amount: total, method: "Wire", ref: "Sample" }] }, rep, 30 * m);
  });

  // order rhythms for the newer accounts, so account health shows every state
  const paid = (cust, rep, date, ls) => { const lines = ls.map(([k, q]) => L(k, q)); const total = Math.round(lines.reduce((a, l) => a + l.qty * l.price, 0) * 100) / 100;
    doc("invoice", { customerId: cust, repId: rep, date, dueDate: date, status: "Sent", division: D(cust).divisions[0], lines, payments: [{ date, amount: total, method: "Wire", ref: "Sample" }] }, rep, 10); };
  [170, 140, 110, 80, 50].forEach(n => paid(sonoran, COOWNER, day(-n), [["m1540", 60]]));        // every ~30 days, last 50 days ago: overdue
  [95, 75, 55, 35, 15].forEach(n => paid(neon, OWNER, day(-n), [["m530", 40], ["m020", 20]]));     // every ~20 days, on rhythm: healthy
  [190, 160, 130, 100].forEach(n => paid(bay, SALES, day(-n), [["i13a", 25]]));                     // stopped ordering: at risk
  paid(azteca, SALES, day(-10), [["m530", 200]]);                                                    // new customer
  [195, 150, 105, 60].forEach(n => paid(gulfside, OWNER, day(-n), [["cal", 20], ["tabs", 6]]));     // every ~45 days, last 60 days ago: due
  doc("quote", { customerId: desert, contactId: maria, repId: OWNER, date: day(-1), validUntil: day(5), status: "Sent", division: "Oil", lines: [L("m530", 150), L("m020", 50), freight(250)], notes: "Holiday volume pricing. Two deliveries.",
    emails: [{ at: iso(-1), to: "maria@example.com", kind: "document", by: OWNER }] }, OWNER, 1);

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
  add("po", { supplierId: sunbelt, date: day(-9), expectedDate: day(-2), status: "Confirmed", division: "Commercial supply", lines: [{ desc: "Calcium hypochlorite 65%, 50 lb pail", grade: "", qty: 40, price: 89, cost: 89, productId: P.cal }], shipping: 300, taxRate: 0, shipTo: "SNP Wholesale LLC\nArizona, USA", notes: "", internalNotes: "" }, OWNER, 9);
  add("po", { supplierId: devices, date: day(-5), expectedDate: day(-1), status: "Received", division: "Phones & electronics", lines: [{ desc: "iPhone 13 128GB", grade: "Grade A", qty: 50, price: 318, cost: 318, productId: P.i13a }, { desc: "iPhone 13 128GB", grade: "Grade B", qty: 30, price: 265, cost: 265, productId: P.i13b }], shipping: 0, taxRate: 0, shipTo: "Miami forwarder (sample)", notes: "", internalNotes: "" }, COOWNER, 1);
  add("po", { supplierId: gulf, date: day(0), expectedDate: day(7), status: "Draft", division: "Oil", lines: [{ desc: "Mobil 1 5W-30, case of 6 qt", grade: "", qty: 300, price: 31.4, cost: 31.4, productId: P.m530 }], shipping: 0, taxRate: 0, shipTo: "Customer direct: Desert Auto Parts, Phoenix AZ", notes: "", internalNotes: "" }, OWNER, 0);

  /* tasks */
  add("task", { title: "Renew Arizona TPT license", assigneeId: OWNER, due: day(-2), status: "Open", priority: "High", relatedType: "", relatedId: 0, relatedLabel: "", notes: "", doneAt: "" }, OWNER, 10);
  add("task", { title: "Call Mesa Fleet about the overdue invoice", assigneeId: OWNER, due: day(0), status: "Open", priority: "Normal", relatedType: "customer", relatedId: mesa, relatedLabel: "Mesa Fleet Services", notes: "", doneAt: "" }, OWNER, 1);
  add("task", { title: "Get resale certificate from Coastal Pool", assigneeId: COOWNER, due: day(5), status: "Open", priority: "Normal", relatedType: "customer", relatedId: coastal, relatedLabel: "Coastal Pool Supply", notes: "", doneAt: "" }, OWNER, 2);
  add("task", { title: "Reconcile last month's rewards", assigneeId: ACCT, due: day(2), status: "Open", priority: "Normal", relatedType: "", relatedId: 0, relatedLabel: "", notes: "", doneAt: "" }, OWNER, 3);
  add("task", { title: "File monthly sales tax returns", assigneeId: ACCT, due: day(11), status: "Open", priority: "High", relatedType: "", relatedId: 0, relatedLabel: "", notes: "", doneAt: "" }, OWNER, 3);
  add("task", { title: "Review the Terms of Sale draft", assigneeId: LAW, due: day(4), status: "Open", priority: "Normal", relatedType: "", relatedId: 0, relatedLabel: "", notes: "", doneAt: "" }, OWNER, 3);
  add("task", { title: "Send W-9 to Gulf Coast Lubricants", assigneeId: OWNER, due: day(-6), status: "Done", priority: "Normal", relatedType: "", relatedId: 0, relatedLabel: "", notes: "", doneAt: iso(-6) }, OWNER, 6);

  add("task", { title: "Send Quetzal the renewed quote", assigneeId: SALES, due: day(0), status: "Open", priority: "High", relatedType: "customer", relatedId: quetzal, relatedLabel: "Quetzal Distribuidora", notes: "", doneAt: "" }, OWNER, 1);
  add("task", { title: "Call back the Monterrey lead", assigneeId: SALES, due: day(1), status: "Open", priority: "Normal", relatedType: "", relatedId: 0, relatedLabel: "", notes: "", doneAt: "" }, SALES, 0);

  /* leads (website ones arrive automatically on the live system) */
  const web = (fields, extra) => fields.map(([k, v]) => `${k}: ${v}`).join("\n") + (extra ? "\n\nSupply needs:\n" + extra : "");
  add("lead", { name: "Jorge Salinas", company: "Lubricantes del Norte", email: "jorge@example.com", phone: "+52 81 5555 0144", location: "Monterrey, Mexico", lat: 25.6866, lng: -100.3161, division: "Oil", source: "Website quote form", status: "New", ownerId: 0,
    message: "Need pricing on 2 truckloads of Mobil 1 5W-30 and 0W-20 delivered to Laredo every month.", receivedAt: iso(-0.12), nextStepDate: "",
    details: web([["Name", "Jorge Salinas"], ["Company", "Lubricantes del Norte"], ["Email", "jorge@example.com"], ["Phone / WhatsApp", "+52 81 5555 0144"], ["Location", "Monterrey, Mexico"], ["Division", "Oil"]], "2 truckloads a month, mixed 5W-30 / 0W-20, delivered to Laredo.") }, OWNER, 0);
  add("lead", { name: "Priya Shah", company: "CellPoint Wholesale", email: "priya@example.com", phone: "(214) 555-0187", location: "Dallas, TX", lat: 32.7767, lng: -96.797, division: "Phones & electronics", source: "Website account form", status: "New", ownerId: 0,
    message: "Applying for a wholesale account. Buy 300–500 Grade A iPhones a month.", receivedAt: iso(-1.6), nextStepDate: "",
    details: web([["Name", "Priya Shah"], ["Company", "CellPoint Wholesale"], ["Email", "priya@example.com"], ["Phone", "(214) 555-0187"], ["State", "TX"], ["Resale certificate", "Yes"]], "300–500 Grade A iPhone 13/14 per month.") }, OWNER, 1);
  add("lead", { name: "Carla Mendes", company: "Piscinas Sol", email: "carla@example.com", phone: "+55 11 5555 0199", location: "São Paulo, Brazil", lat: -23.5505, lng: -46.6333, division: "Commercial supply", source: "WhatsApp", status: "Contacted", ownerId: SALES,
    message: "Pool chemicals for 12 resorts. Wants a sample price list in reais.", receivedAt: iso(-5), nextStepDate: day(0), details: "" }, SALES, 4);
  add("lead", { name: "Ben Ward", company: "Ward Auto Group", email: "ben@example.com", phone: "(520) 555-0103", location: "Tucson, AZ", lat: 32.25, lng: -110.91, division: "Oil", source: "Referral", status: "Qualified", ownerId: COOWNER,
    message: "Six service bays; currently buying from a local distributor.", receivedAt: iso(-9), nextStepDate: day(3), details: "" }, COOWNER, 8);
  add("lead", { name: "Andrés Castillo", company: "Quetzal Distribuidora", email: "andres@example.com", phone: "+502 5555 0110", location: "Guatemala City, Guatemala", division: "Oil", source: "Website quote form", status: "Converted", ownerId: SALES, customerId: quetzal,
    message: "Monthly oil for 4 stores.", receivedAt: iso(-75), nextStepDate: "", details: "" }, SALES, 70);
  add("lead", { name: "Test Person", company: "", email: "test@example.com", phone: "", location: "", division: "", source: "Website quote form", status: "Not a fit", ownerId: OWNER,
    message: "Asking for a single phone at retail.", receivedAt: iso(-20), nextStepDate: "", details: "" }, OWNER, 19);

  /* notes */
  add("note", { title: "Holiday delivery cutoff", body: "Last truck loads for December go out on the 18th. Tell every customer with a standing order this week.", color: "pink", visibility: "team", pinned: true }, OWNER, 2);
  add("note", { title: "Oil price floor", body: "Don't quote Mobil 1 5W-30 below $36.50 a case without checking with an owner first.", color: "yellow", visibility: "owners", pinned: true }, COOWNER, 6);
  add("note", { title: "", body: "Lucía at Andes prefers WhatsApp voice notes over email. Send pro formas as PDF on WhatsApp.", color: "green", visibility: "team", pinned: false }, SALES, 3);
  add("note", { title: "Call list for Friday", body: "Desert Auto (holiday volume)\nMesa Fleet (overdue balance)\nCoastal Pool (pre-buy)", color: "blue", visibility: "private", pinned: false }, OWNER, 1);
  add("note", { title: "Month-end", body: "Send the bank statements by the 3rd so the reward reconciliation can close.", color: "grey", visibility: "team", pinned: false }, ACCT, 9);
  add("note", { title: "My follow-ups", body: "Quetzal: renewed quote\nPiscinas Sol: price list in reais", color: "yellow", visibility: "private", pinned: false }, SALES, 0);

  /* saved segments, email templates and campaigns */
  const blank = { q: "", status: "", tags: [], tagMode: "any", division: "", region: "", industry: "", ownerId: 0, health: "", noOrderDays: 0, hasEmail: false };
  const segAZ = add("segment", { name: "Arizona oil customers", entity: "customer", filters: Object.assign({}, blank, { status: "Active", division: "Oil", region: "AZ" }) }, OWNER, 20);
  add("segment", { name: "Due to reorder", entity: "customer", filters: Object.assign({}, blank, { health: "Due to reorder" }) }, OWNER, 20);
  const segLatam = add("segment", { name: "Latin America buyers", entity: "contact", filters: Object.assign({}, blank, { tags: ["LatAm"], hasEmail: true }) }, SALES, 12);
  const tPrice = add("email_template", { name: "Monthly price update", category: "Campaign", subject: "{{company_name}} prices for this month", body: "Hi {{first_name}},\n\nHere are this month's prices from {{company_name}}. The price list is attached.\n\nReply to this email or call {{company_phone}} to place an order.\n\nThank you,\n{{my_name}}\n{{company_name}}" }, OWNER, 30);
  add("email_template", { name: "Reorder check-in", category: "Follow-up", subject: "Time to restock?", body: "Hi {{first_name}},\n\nIt's been a little while since your last order, so I wanted to check in. Need anything this week? I can hold stock and send a quote today.\n\nThank you,\n{{my_name}}\n{{company_name}} · {{company_phone}}" }, OWNER, 30);
  add("email_template", { name: "Quote follow-up", category: "Quote", subject: "Following up on your quote", body: "Hi {{first_name}},\n\nI wanted to follow up on the quote we sent {{company}}. Happy to adjust quantities or delivery. Just reply here and I'll update it.\n\nThank you,\n{{my_name}}" }, SALES, 25);
  add("campaign", { name: "Last month's oil prices", segmentId: segAZ, templateId: tPrice, subject: "SNP Wholesale prices for this month", body: "Hi {{first_name}},\n\nHere are this month's prices. The price list is attached.\n\nThank you,\n{{my_name}}", attachPriceList: true, priceDivision: "Oil",
    status: "Sent", sentAt: iso(-28), stats: { total: 3, sent: 3, failed: 0, skipped: 0, unsubscribed: 0 },
    queue: [{ email: "maria@example.com", name: "Maria Lopez", company: "Desert Auto Parts", contactId: maria, customerId: desert, state: "sent" }, { email: "james@example.com", name: "James Carter", company: "Mesa Fleet Services", contactId: james, customerId: mesa, state: "sent" }, { email: "tom@sonoran.example", name: "Tom Alvarez", company: "Sonoran Truck & Diesel", contactId: 0, customerId: sonoran, state: "sent" }] }, OWNER, 28);
  add("campaign", { name: "LatAm: new container availability", segmentId: segLatam, templateId: 0, subject: "Nuevo contenedor disponible / New container available", body: "Hola {{first_name}},\n\nWe have a new container of Mobil 1 and Grade A phones leaving Miami next month. Reply to reserve your allocation.\n\n{{my_name}}\n{{company_name}}", attachPriceList: false, priceDivision: "", status: "Draft" }, OWNER, 1);

  /* company records: vary the starting statuses so the checklist looks lived-in */
  const status = { "CO-01": "On file", "CO-02": "Needs review", "CO-03": "On file", "CO-05": "On file", "TX-01": "On file", "TX-02": "In progress", "TX-05": "On file", "SA-01": "Needs review", "SA-02": "In progress", "SA-03": "In progress", "SU-05": "Missing", "PA-02": "On file", "PR-01": "Missing", "IN-01": "On file", "IN-02": "Missing" };
  const due = { "TX-07": day(20), "SA-01": day(5), "IN-02": day(-3), "CO-02": day(12) };
  let docId = 1;
  const docs = window.SNP_STAGING_DOCS.map(d => Object.assign({}, d, { id: docId++, status: status[d.code] || d.status, due: due[d.code] || "", updatedAt: status[d.code] ? iso(-3) : "", updatedBy: status[d.code] ? OWNER : 0 }));

  return {
    v: 5, seq: 5000,
    portalUsers: [{ id: 30, name: "Maria Lopez", email: "maria@example.com", customerId: desert, lastLogin: iso(-2) }], portalCustomer: desert,
    suppressed: ["oldbuyer@example.com"], mailCount: null,
    cats: window.SNP_STAGING_CATS,
    assignees: ["Owner 1", "Owner 2", "Accountant", "Attorney"],
    docs, files: [],
    templates: window.SNP_STAGING_TEMPLATES.map(t => Object.assign({ updatedAt: "", updatedBy: 0 }, t)),
    people: [
      { id: OWNER, name: "Demo Owner", email: "owner@example.com", role: "owner", snpRole: "", label: "Site administrator", isAdmin: true },
      { id: COOWNER, name: "Co-owner (sample)", email: "coowner@example.com", role: "owner", snpRole: "snp_owner", label: "Owner", isAdmin: false },
      { id: ACCT, name: "Accountant (sample)", email: "accountant@example.com", role: "accountant", snpRole: "snp_accountant", label: "Accountant", isAdmin: false },
      { id: LAW, name: "Attorney (sample)", email: "attorney@example.com", role: "attorney", snpRole: "snp_attorney", label: "Attorney", isAdmin: false },
      { id: SALES, name: "Sales rep (sample)", email: "sales@example.com", role: "sales", snpRole: "snp_sales", label: "Sales", isAdmin: false },
    ],
    activity: [],
    settings: { companyName: "SNP Wholesale LLC", companyAddress: "Arizona, USA", companyPhone: "+1 (775) 250-6263", companyEmail: "sales@snpwholesale.com", companyWebsite: "snpwholesale.com",
      quoteValidDays: 3, invoiceDueDays: 15, taxRate: 0, paymentInfo: "SAMPLE: payment instructions appear here. Real bank details are entered in Settings on the live system only.",
      documentFooter: "All sales are subject to SNP Wholesale LLC's Terms & Conditions of Sale.", partnerName: "Partner (sample)", partnerShare: 50, costsBeforeSplit: true, memberships: M, reminders: true, programName: "Wholesale club (sample)",
      targets: { [OWNER]: 30000, [COOWNER]: 25000, [SALES]: 40000 }, hoursOpen: "08:00", hoursClose: "17:00", workdays: [1, 2, 3, 4, 5],
      pipelines: window.SNP_STAGING_SEED.PIPELINES, defaultReorderDays: 30, emailDailyLimit: 200, portalEnabled: true,
      customFields: [{ key: "fleet_size", label: "Fleet size", type: "number", entity: "customer", options: [] }, { key: "delivery_day", label: "Preferred delivery day", type: "select", entity: "customer", options: ["Mon", "Tue", "Wed", "Thu", "Fri"] }, { key: "birthday", label: "Birthday", type: "date", entity: "contact", options: [] }],
      lostReasons: ["Price too high", "Went with another supplier", "No stock / lead time", "Credit or payment terms", "Went quiet", "Not a fit"],
      industries: ["Auto parts store", "Fleet", "Repair shop", "Distributor", "Exporter", "Phone retailer", "Pool & spa", "Other"] },
    items,
  };
};
/* Same default pipelines as the plugin (includes/crm.php). */
window.SNP_STAGING_SEED.PIPELINES = [
  { key: "oil", name: "Oil", stages: [{ name: "Lead", prob: 10, type: "open" }, { name: "Contacted", prob: 20, type: "open" }, { name: "Quoted", prob: 50, type: "open" }, { name: "Negotiating", prob: 70, type: "open" }, { name: "Won", prob: 100, type: "won" }, { name: "Lost", prob: 0, type: "lost" }] },
  { key: "phones", name: "Phones & electronics", stages: [{ name: "Lead", prob: 10, type: "open" }, { name: "Contacted", prob: 20, type: "open" }, { name: "Stock confirmed", prob: 40, type: "open" }, { name: "Quoted", prob: 60, type: "open" }, { name: "Negotiating", prob: 75, type: "open" }, { name: "Won", prob: 100, type: "won" }, { name: "Lost", prob: 0, type: "lost" }] },
  { key: "supply", name: "Commercial supply", stages: [{ name: "Lead", prob: 10, type: "open" }, { name: "Contacted", prob: 20, type: "open" }, { name: "Sample sent", prob: 35, type: "open" }, { name: "Quoted", prob: 55, type: "open" }, { name: "Negotiating", prob: 70, type: "open" }, { name: "Won", prob: 100, type: "won" }, { name: "Lost", prob: 0, type: "lost" }] },
];
