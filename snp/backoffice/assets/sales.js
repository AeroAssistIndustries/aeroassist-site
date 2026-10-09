/* Quotes, invoices and the shared document editor (also used for purchase orders). */
(() => {
"use strict";
const { S, el, items, item, money, money0, fmtDate, badge, today, addDays, round2, esc, nl2br } = SNP;
const DIVS = ["Oil","Phones & electronics","Commercial supply"];
const METHODS = ["Wire","ACH","Check","Zelle","Card","Cash","Other"];
const KIND = {
  quote:   { label:"Quote", title:"QUOTE", party:"customer", d2:"validUntil", d2label:"Valid until", statuses:["Draft","Sent","Accepted","Declined","Expired"] },
  invoice: { label:"Invoice", title:"INVOICE", party:"customer", d2:"dueDate", d2label:"Due date", statuses:["Draft","Sent","Void"] },
  po:      { label:"Purchase order", title:"PURCHASE ORDER", party:"supplier", d2:"expectedDate", d2label:"Expected delivery", statuses:["Draft","Sent","Confirmed","Received","Paid","Cancelled"] },
};
const QF = { q:"", status:"" }, IF = { q:"", status:"open" };

function statusOf(it){
  const d=it.data;
  if (it.type==="quote") return d.status==="Sent"&&d.validUntil&&d.validUntil<today()?"Expired":d.status;
  if (it.type==="invoice"){
    if (d.status==="Draft"||d.status==="Void") return d.status;
    if ((d.balance||0)<=0) return "Paid";
    if (d.dueDate&&d.dueDate<today()) return "Overdue";
    return (d.paid||0)>0?"Partially paid":"Unpaid";
  }
  return d.status;
}
function calc(d){
  const sub=round2((d.lines||[]).reduce((s,l)=>s+round2((Number(l.qty)||0)*(Number(l.price)||0)),0));
  const tax=round2(sub*(Number(d.taxRate)||0)/100), total=round2(sub+tax+(Number(d.shipping)||0));
  const paid=round2((d.payments||[]).reduce((s,p)=>s+(Number(p.amount)||0),0));
  return {sub,tax,total,paid,balance:round2(total-paid)};
}
function termDays(customerId){
  const c=item("customer",customerId); const t=c&&c.data.terms;
  if (t==="Net 15") return 15; if (t==="Net 30") return 30; if (t==="Prepaid") return 0;
  return (S.settings&&S.settings.invoiceDueDays)||15;
}
function defaultsFor(kind, extra={}){
  const s=S.settings||{}, d={date:today(), status:"Draft", lines:[{desc:"",grade:"",qty:1,price:0}], shipping:0, taxRate:s.taxRate||0, notes:"", internalNotes:""};
  if (kind==="quote") d.validUntil=addDays(today(), s.quoteValidDays??3);
  if (kind==="invoice"){ d.payments=[]; }
  if (kind==="po") d.shipTo=[s.companyName,s.companyAddress].filter(Boolean).join("\n");
  Object.assign(d, extra);
  if (kind==="invoice"&&!d.dueDate) d.dueDate=addDays(d.date, termDays(d.customerId));
  return d;
}

/* ---------- editor ---------- */
function newDoc(kind, extra={}){ openEditor(kind, null, defaultsFor(kind, extra)); }
function openDoc(kind, id){ const it=item(kind,id); if(it) openEditor(kind, it.id, JSON.parse(JSON.stringify(it.data))); }

function openEditor(kind, id, draft){
  const K=KIND[kind], ro=!SNP.can(kind,"rw");
  let saved = id ? item(kind,id) : null, dirty=false;
  const panel=el("div",{class:"modal xl editor",role:"dialog","aria-modal":"true"});
  const title=el("h2",{});
  const err=el("div",{class:"err",role:"alert"});
  const setTitle=()=>{ title.replaceChildren(saved?`${K.label} ${saved.data.number}`:`New ${K.label.toLowerCase()}`, saved?el("span",{class:"title-badge"}, badge(statusOf(saved))):null); };
  const markDirty=()=>{ dirty=true; };

  /* header fields */
  const partyType=K.party, partyKey=partyType==="customer"?"customerId":"supplierId";
  const partySel=SNP.field({key:partyKey,label:partyType==="customer"?"Customer":"Supplier",type:partyType,full:true}, draft[partyKey], ro);
  const ps=partySel.querySelector("select");
  if (!ro){ ps.append(el("option",{value:"__new"}, partyType==="customer"?"+ Add a new customer…":"+ Add a new supplier…"));
    ps.addEventListener("change",()=>{
      if (ps.value==="__new"){ ps.value=draft[partyKey]?String(draft[partyKey]):"";
        const cb=c=>{ draft[partyKey]=c.id; ps.append(el("option",{value:String(c.id)},c.data.name)); ps.value=String(c.id); markDirty(); updateDue(); };
        if (partyType==="customer") SNP.crm.editCustomer(null,{status:"Active"},cb); else SNP.buy.editSupplier(null,{},cb);
        return; }
      draft[partyKey]=ps.value?Number(ps.value):0; markDirty(); updateDue(); }); }
  const head=el("div",{class:"fields cols4"}, partySel,
    SNP.field({key:"date",label:"Date",type:"date"}, draft.date, ro),
    SNP.field({key:K.d2,label:K.d2label,type:"date"}, draft[K.d2], ro),
    SNP.field({key:"status",label:"Status",type:"select",options:K.statuses}, draft.status, ro),
    SNP.field({key:"division",label:"Division",type:"select",options:[["","—"],...DIVS.map(x=>[x,x])]}, draft.division, ro));
  head.addEventListener("input",e=>{ const k=e.target.dataset.key; if(!k||k===partyKey) return; draft[k]=e.target.value; markDirty(); if(k==="date") updateDue(); });
  head.addEventListener("change",e=>{ const k=e.target.dataset.key; if(!k||k===partyKey) return; draft[k]=e.target.value; markDirty(); });
  function updateDue(){ if(kind!=="invoice"||saved) return; draft.dueDate=addDays(draft.date||today(), termDays(draft.customerId)); const n=head.querySelector('[data-key="dueDate"]'); if(n) n.value=draft.dueDate; }

  /* lines */
  const linesBox=el("div",{class:"lines"});
  const totalsBox=el("div",{class:"totals"});
  function drawLines(){
    const tb=el("tbody");
    draft.lines.forEach((l,i)=>{
      const inp=(key,attrs)=>{ const n=el("input",Object.assign({value:l[key]??"",disabled:ro||null,"aria-label":key+" line "+(i+1)},attrs)); n.addEventListener("input",()=>{ l[key]=attrs.type==="number"?(n.value===""?0:Number(n.value)):n.value; markDirty(); amt.textContent=money((Number(l.qty)||0)*(Number(l.price)||0)); drawTotals(); }); return n; };
      const amt=el("td",{class:"num amt","data-label":"Amount"}, money((Number(l.qty)||0)*(Number(l.price)||0)));
      tb.append(el("tr",{},
        el("td",{"data-label":"Description",class:"desc"}, inp("desc",{type:"text",placeholder:"Item or service"})),
        el("td",{"data-label":"Condition",class:"grade"}, inp("grade",{type:"text",placeholder:"—"})),
        el("td",{"data-label":"Qty",class:"num"}, inp("qty",{type:"number",step:"any",inputmode:"decimal"})),
        el("td",{"data-label":"Unit price",class:"num"}, inp("price",{type:"number",step:"0.01",inputmode:"decimal"})),
        amt,
        el("td",{class:"rm"}, ro?null:el("button",{class:"btn small ghost",type:"button","aria-label":"Remove line "+(i+1),onclick:()=>{ draft.lines.splice(i,1); if(!draft.lines.length) draft.lines.push({desc:"",grade:"",qty:1,price:0}); markDirty(); drawLines(); drawTotals(); }},"×"))));
    });
    linesBox.replaceChildren(el("div",{class:"tbl-wrap"}, el("table",{class:"lines-t"},
      el("thead",{}, el("tr",{}, el("th",{},"Description"), el("th",{},"Condition"), el("th",{class:"num"},"Qty"), el("th",{class:"num"},"Unit price"), el("th",{class:"num"},"Amount"), el("th",{}))), tb)),
      ro?null:el("button",{class:"btn small",type:"button",onclick:()=>{ draft.lines.push({desc:"",grade:"",qty:1,price:0}); markDirty(); drawLines(); linesBox.querySelector("tbody tr:last-child input").focus(); }},"+ Add line"));
  }
  function drawTotals(){
    const t=calc(draft);
    const num=(key,label,step)=>{ const n=el("input",{type:"number",step,value:draft[key]??0,disabled:ro||null,"aria-label":label,inputmode:"decimal"}); n.addEventListener("input",()=>{ draft[key]=n.value===""?0:Number(n.value); markDirty(); redraw(); }); return n; };
    const vals=el("div",{class:"tot-rows"});
    const redraw=()=>{ const t2=calc(draft); vals.replaceChildren(
      el("div",{}, el("span",{},"Subtotal"), el("span",{class:"num"},money(t2.sub))),
      el("div",{}, el("span",{},`Tax (${Number(draft.taxRate)||0}%)`), el("span",{class:"num"},money(t2.tax))),
      el("div",{}, el("span",{},"Shipping"), el("span",{class:"num"},money(draft.shipping))),
      el("div",{class:"grand"}, el("span",{},"Total"), el("span",{class:"num"},money(t2.total))),
      kind==="invoice"?el("div",{}, el("span",{},"Paid"), el("span",{class:"num"},money(t2.paid))):null,
      kind==="invoice"?el("div",{class:"grand"+(t2.balance>0?" warn-t":"")}, el("span",{},"Balance due"), el("span",{class:"num"},money(t2.balance))):null); };
    totalsBox.replaceChildren(el("div",{class:"tot-inputs"},
      el("label",{}, "Tax rate %", num("taxRate","Tax rate percent","0.001")),
      el("label",{}, "Shipping", num("shipping","Shipping","0.01"))), vals);
    redraw(); void t;
  }

  /* payments */
  const payBox=el("div");
  function drawPayments(){
    if (kind!=="invoice"){ payBox.replaceChildren(); return; }
    draft.payments=draft.payments||[];
    const list=draft.payments.length?SNP.table({rows:draft.payments.map((p,i)=>({p,i})), columns:[
      {label:"Date",value:r=>fmtDate(r.p.date)},{label:"Amount",cls:"num",value:r=>money(r.p.amount)},{label:"Method",value:r=>r.p.method||"—"},{label:"Reference",value:r=>r.p.ref||"—"},
      {label:"",value:r=>ro?"":el("button",{class:"btn small ghost",type:"button",onclick:()=>{ draft.payments.splice(r.i,1); markDirty(); drawPayments(); drawTotals(); }},"Remove")}]}):el("p",{class:"muted small"},"No payments recorded.");
    const f=SNP.form([{key:"date",label:"Date",type:"date"},{key:"amount",label:"Amount",type:"money"},{key:"method",label:"Method",type:"select",options:METHODS},{key:"ref",label:"Reference"}],{date:today(),amount:Math.max(0,calc(draft).balance)||"",method:"Wire"});
    f.classList.add("cols4");
    const add=el("button",{class:"btn small primary",type:"button"},"Record payment");
    add.onclick=()=>{ const v=SNP.readForm(f); if(!(v.amount>0)) return SNP.toast("Enter the amount received."); draft.payments.push(v); markDirty(); drawPayments(); drawTotals(); SNP.toast("Payment added. Save to keep it."); };
    payBox.replaceChildren(el("section",{class:"ed-sec"}, el("h3",{},"Payments"), list, ro?null:el("details",{class:"add-box"}, el("summary",{},"+ Record a payment"), f, el("div",{class:"row-actions"},add))));
  }

  /* notes */
  const notes=el("div",{class:"fields"},
    kind==="po"?SNP.field({key:"shipTo",label:"Ship to",type:"textarea",rows:3}, draft.shipTo, ro):null,
    SNP.field({key:"notes",label:kind==="po"?"Notes to supplier (printed)":"Notes to customer (printed)",type:"textarea",rows:3}, draft.notes, ro),
    SNP.field({key:"internalNotes",label:"Internal notes (not printed)",type:"textarea",rows:3}, draft.internalNotes, ro));
  notes.addEventListener("input",e=>{ const k=e.target.dataset.key; if(k){ draft[k]=e.target.value; markDirty(); } });

  /* actions */
  const save=el("button",{class:"btn primary",type:"button"},"Save");
  const printB=el("button",{class:"btn",type:"button"},"Print / PDF");
  const convert=el("button",{class:"btn",type:"button"},"Convert to invoice");
  const dup=el("button",{class:"btn ghost",type:"button"},"Duplicate");
  const actions=el("div",{class:"row-actions"});
  const drawActions=()=>{ actions.replaceChildren(
    ro?null:save, printB,
    kind==="quote"&&saved&&!saved.data.invoiceId&&!ro?convert:null,
    kind==="quote"&&saved&&saved.data.invoiceId?el("button",{class:"btn ghost",type:"button",onclick:()=>{ close(true); openDoc("invoice",saved.data.invoiceId); }},"Open invoice"):null,
    saved&&!ro?dup:null,
    saved&&!ro?SNP.confirmBtn("Delete",`Delete ${saved.data.number}?`, async()=>{ await SNP.deleteItem(kind,saved.id); close(true); SNP.toast("Deleted."); SNP.refresh(true); }):null); };

  async function doSave(){
    err.textContent="";
    if (!draft[partyKey]) { err.textContent=`Choose the ${partyType}.`; return null; }
    save.disabled=true;
    try{
      draft.lines=draft.lines.filter(l=>(l.desc||"").trim()||Number(l.qty)||Number(l.price));
      if(!draft.lines.length) draft.lines.push({desc:"",grade:"",qty:1,price:0});
      saved=await SNP.saveItem(kind, saved?saved.id:null, draft);
      draft=JSON.parse(JSON.stringify(saved.data)); dirty=false;
      setTitle(); drawActions(); drawLines(); drawTotals(); drawPayments();
      SNP.toast(`${K.label} ${saved.data.number} saved.`); SNP.refresh(true);
      return saved;
    } catch(e){ err.textContent=e.message||"That didn't save."; return null; }
    finally{ save.disabled=false; }
  }
  save.onclick=doSave;
  printB.onclick=async()=>{ if(!ro&&(dirty||!saved)){ const s=await doSave(); if(!s) return; } printDoc(kind, saved||{data:draft,type:kind}); };
  convert.onclick=async()=>{ if(dirty){ if(!await doSave()) return; }
    try{ const q=saved.data;
      const inv=await SNP.saveItem("invoice",null,defaultsFor("invoice",{customerId:q.customerId,lines:q.lines,shipping:q.shipping,taxRate:q.taxRate,notes:q.notes,division:q.division,quoteId:saved.id}));
      await SNP.saveItem("quote",saved.id,Object.assign({},q,{status:"Accepted",invoiceId:inv.id}));
      SNP.toast(`Invoice ${inv.data.number} created from ${q.number}.`); close(true); SNP.refresh(true); openDoc("invoice",inv.id);
    } catch(e){ SNP.fail(e); } };
  dup.onclick=()=>{ const copy=JSON.parse(JSON.stringify(saved.data)); delete copy.number; delete copy.invoiceId; delete copy.quoteId;
    Object.assign(copy,{status:"Draft",date:today(),payments:[]}); if(kind==="quote") copy.validUntil=addDays(today(),(S.settings&&S.settings.quoteValidDays)||3);
    close(true); openEditor(kind,null,copy); };

  const closeWrap=el("span");
  function close(force){
    if (!force && dirty && !ro){
      closeWrap.replaceChildren(el("span",{class:"confirm"},"Discard unsaved changes? ",
        el("button",{class:"btn small danger",type:"button",onclick:()=>close(true)},"Discard"),
        el("button",{class:"btn small ghost",type:"button",onclick:()=>closeWrap.replaceChildren()},"Keep editing")));
      return;
    }
    SNP.closePanel(panel);
  }
  setTitle(); drawActions(); drawLines(); drawTotals(); drawPayments();
  const party = partyType==="customer"?item("customer",draft.customerId):item("supplier",draft.supplierId);
  panel.append(
    el("div",{class:"m-head"}, title, closeWrap, el("button",{class:"x",type:"button","aria-label":"Close",onclick:()=>close(false)},"×")),
    el("div",{class:"m-body"},
      ro?el("div",{class:"scope-banner"},"View only. Owners can make changes."):null,
      head,
      el("section",{class:"ed-sec"}, el("h3",{},"Items"), linesBox, totalsBox),
      payBox,
      el("section",{class:"ed-sec"}, el("h3",{},"Notes"), notes),
      err, actions,
      saved?el("div",{class:"foot"}, el("span",{}, `Created by ${SNP.nameOf(saved.createdBy)} · last updated ${SNP.fmtWhen(saved.updatedAt)} by ${SNP.nameOf(saved.updatedBy)}`)):null));
  void party;
  SNP.pushPanel(panel,{locked:true});
  panel.dataset.noesc="1";
}

/* ---------- printing ---------- */
function printDoc(kind, it){
  const K=KIND[kind], d=it.data, s=S.settings||{};
  const party = kind==="po"?item("supplier",d.supplierId):item("customer",d.customerId);
  const p = party?party.data:{name:kind==="po"?SNP.supplierName(d.supplierId):SNP.customerName(d.customerId)};
  const t=calc(d), st=statusOf(it);
  const partyHTML=`<b>${esc(p.name)}</b>${p.contactName?"<br>Attn: "+esc(p.contactName):""}${p.address?"<br>"+nl2br(p.address):""}${p.state||p.country?"<br>"+esc([p.state,p.country].filter(Boolean).join(", ")):""}${p.email?"<br>"+esc(p.email):""}${p.phone?"<br>"+esc(p.phone):""}`;
  const rows=(d.lines||[]).filter(l=>l.desc||l.qty||l.price).map(l=>`<tr><td>${esc(l.desc)}${l.grade?`<div class="muted">Condition: ${esc(l.grade)}</div>`:""}</td><td class="r">${esc(l.qty)}</td><td class="r">${money(l.price)}</td><td class="r">${money((Number(l.qty)||0)*(Number(l.price)||0))}</td></tr>`).join("");
  const payRows = kind==="invoice" && t.paid ? `<tr><td>Paid</td><td class="r">−${money(t.paid)}</td></tr><tr class="g"><td>Balance due</td><td class="r">${money(t.balance)}</td></tr>` : "";
  const html=`
<div class="hd">${SNP.companyBlock()}<div><h1>${K.title}</h1><div class="meta"><b>${esc(d.number||"Draft")}</b><br>Date: ${fmtDate(d.date)}${d[K.d2]?`<br>${K.d2label}: ${fmtDate(d[K.d2])}`:""}${kind==="invoice"&&st==="Paid"?'<br><br><span class="stamp">PAID</span>':""}</div></div></div>
<div class="cols"><div><div class="lbl">${kind==="po"?"Vendor":kind==="quote"?"Prepared for":"Bill to"}</div>${partyHTML}</div>${kind==="po"?`<div><div class="lbl">Ship to</div>${nl2br(d.shipTo)}</div>`:""}${d.division?`<div><div class="lbl">Division</div>${esc(d.division)}</div>`:""}</div>
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="muted">No items</td></tr>'}</tbody></table>
<table class="tot"><tr><td>Subtotal</td><td class="r">${money(t.sub)}</td></tr>${t.tax?`<tr><td>Tax (${Number(d.taxRate)}%)</td><td class="r">${money(t.tax)}</td></tr>`:""}${Number(d.shipping)?`<tr><td>Shipping</td><td class="r">${money(d.shipping)}</td></tr>`:""}<tr class="g"><td>Total (USD)</td><td class="r">${money(t.total)}</td></tr>${payRows}</table>
${d.notes?`<div class="box"><div class="lbl">Notes</div>${nl2br(d.notes)}</div>`:""}
${kind==="invoice"&&s.paymentInfo?`<div class="box"><div class="lbl">How to pay</div>${nl2br(s.paymentInfo)}<br>Please include ${esc(d.number)} with your payment.</div>`:""}
${kind==="quote"?`<div class="box">Prices are in US dollars${d.validUntil?` and valid until ${fmtDate(d.validUntil)}`:""}, subject to availability. To accept, reply to this quote or send a purchase order referencing ${esc(d.number)}.</div>`:""}
${kind==="po"?`<div class="box"><div class="lbl">Purchase terms</div>Please confirm this PO in writing within two business days. Ship only the items, quantities and condition grades listed; substitutions need written approval. Include ${esc(d.number)} on every invoice, packing list and bill of lading.</div>`:""}
<div class="foot">${nl2br(kind==="po"?"":s.documentFooter)} ${esc(s.companyName)} · ${esc(s.companyEmail)} · ${esc(s.companyPhone)}</div>`;
  SNP.printHTML(`${K.label} ${d.number||""}`, html);
}

/* ---------- lists ---------- */
function renderQuotes(main){
  const listBox=el("div");
  const draw=()=>{
    const q=QF.q.trim().toLowerCase();
    const rows=items("quote").filter(x=>(!QF.status||statusOf(x)===QF.status)&&(!q||`${x.data.number} ${SNP.customerName(x.data.customerId)}`.toLowerCase().includes(q)))
      .sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||"")||b.id-a.id);
    listBox.replaceChildren(SNP.table({rows,onRow:x=>openDoc("quote",x.id),empty:items("quote").length?"No quotes match.":"No quotes yet.",columns:[
      {label:"Number",value:x=>el("span",{class:"mono"},x.data.number)},{label:"Customer",value:x=>SNP.customerName(x.data.customerId)},
      {label:"Date",value:x=>fmtDate(x.data.date)},{label:"Valid until",value:x=>fmtDate(x.data.validUntil)||"—"},
      {label:"Status",value:x=>badge(statusOf(x))},{label:"Total",cls:"num",value:x=>money(x.data.total)}]}));
  };
  const open=items("quote").filter(x=>["Draft","Sent"].includes(statusOf(x)));
  const m=SNP.thisMonth(), accepted=items("quote").filter(x=>x.data.status==="Accepted"&&(x.updatedAt||"").slice(0,7)===m);
  const q=SNP.search("Search quotes", e=>{ QF.q=e.target.value; draw(); }); q.value=QF.q;
  main.append(SNP.pageHead("Quotes","Price quotes for customers. Convert an accepted quote into an invoice in one step.",
      el("button",{class:"btn primary",type:"button",onclick:()=>newDoc("quote")},"+ Quote")),
    el("div",{class:"kpis"}, SNP.kpi(String(open.length),"Open quotes"), SNP.kpi(money0(open.reduce((s,x)=>s+(x.data.total||0),0)),"Open value"),
      SNP.kpi(String(accepted.length),"Accepted this month"), SNP.kpi(String(items("quote").filter(x=>x.data.status==="Sent"&&x.data.validUntil&&x.data.validUntil>=today()&&x.data.validUntil<=addDays(today(),3)).length),"Expiring in 3 days")),
    SNP.toolbar(q, SNP.selectEl([["","All statuses"],...KIND.quote.statuses.map(s=>[s,s])],QF.status,v=>{QF.status=v;draw();},"Status")), listBox);
  draw();
}
function renderInvoices(main){
  const listBox=el("div");
  const match=x=>{ const st=statusOf(x);
    if (IF.status==="open") return ["Unpaid","Partially paid","Overdue"].includes(st);
    return !IF.status||st===IF.status; };
  const draw=()=>{
    const q=IF.q.trim().toLowerCase();
    const rows=items("invoice").filter(x=>match(x)&&(!q||`${x.data.number} ${SNP.customerName(x.data.customerId)}`.toLowerCase().includes(q)))
      .sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||"")||b.id-a.id);
    const sumT=rows.reduce((s,x)=>s+(x.data.status==="Void"?0:x.data.total||0),0), sumB=rows.reduce((s,x)=>s+(x.data.status==="Sent"?x.data.balance||0:0),0);
    listBox.replaceChildren(SNP.table({rows,onRow:x=>openDoc("invoice",x.id),empty:items("invoice").length?"No invoices match.":"No invoices yet.",columns:[
      {label:"Number",value:x=>el("span",{class:"mono"},x.data.number)},{label:"Customer",value:x=>SNP.customerName(x.data.customerId)},
      {label:"Date",value:x=>fmtDate(x.data.date)},{label:"Due",value:x=>fmtDate(x.data.dueDate)||"—"},
      {label:"Status",value:x=>badge(statusOf(x))},{label:"Total",cls:"num",value:x=>money(x.data.total)},{label:"Balance",cls:"num",value:x=>x.data.status==="Sent"?money(x.data.balance):"—"}],
      foot:rows.length?el("tr",{}, el("td",{colspan:"5"},`${rows.length} invoice${rows.length===1?"":"s"}`), el("td",{class:"num"},money(sumT)), el("td",{class:"num"},money(sumB))):null}));
  };
  const m=SNP.thisMonth(), inv=items("invoice").filter(x=>x.data.status!=="Void"&&x.data.status!=="Draft");
  const billed=inv.filter(x=>(x.data.date||"").slice(0,7)===m).reduce((s,x)=>s+(x.data.total||0),0);
  const collected=inv.reduce((s,x)=>s+(x.data.payments||[]).filter(p=>(p.date||"").slice(0,7)===m).reduce((a,p)=>a+(p.amount||0),0),0);
  const unpaid=inv.reduce((s,x)=>s+Math.max(0,x.data.balance||0),0), overdue=inv.filter(x=>statusOf(x)==="Overdue");
  const q=SNP.search("Search invoices", e=>{ IF.q=e.target.value; draw(); }); q.value=IF.q;
  main.append(SNP.pageHead("Invoices", SNP.can("invoice","rw")?"Bill customers, record payments and see what's owed.":"View only.",
      el("button",{class:"btn ghost",type:"button",onclick:exportInvoices},"Export CSV"),
      SNP.can("invoice","rw")?el("button",{class:"btn primary",type:"button",onclick:()=>newDoc("invoice")},"+ Invoice"):null),
    el("div",{class:"kpis"}, SNP.kpi(money0(billed),"Invoiced this month"), SNP.kpi(money0(collected),"Collected this month"),
      SNP.kpi(money0(unpaid),"Unpaid", unpaid?"warn":""), SNP.kpi(`${overdue.length} · ${money0(overdue.reduce((s,x)=>s+x.data.balance,0))}`,"Overdue", overdue.length?"bad":"")),
    SNP.toolbar(q, SNP.selectEl([["open","Unpaid & overdue"],["","All invoices"],["Overdue","Overdue"],["Paid","Paid"],["Draft","Drafts"],["Void","Void"]],IF.status,v=>{IF.status=v;draw();},"Status")), listBox);
  draw();
}
function exportInvoices(){
  SNP.csv("SNP invoices "+today()+".csv",["Number","Customer","Date","Due","Status","Division","Subtotal","Tax","Shipping","Total","Paid","Balance"],
    items("invoice").map(x=>{const d=x.data; return [d.number,SNP.customerName(d.customerId),d.date,d.dueDate,statusOf(x),d.division,d.subtotal,d.tax,d.shipping,d.total,d.paid,d.balance];}));
}

SNP.sales = { newDoc, openDoc, openEditor, statusOf, calc, printDoc, defaultsFor };
SNP.module({ id:"quotes", label:"Quotes", group:"Sales", visible:()=>SNP.can("quote"), render:renderQuotes });
SNP.module({ id:"invoices", label:"Invoices", group:"Sales", visible:()=>SNP.can("invoice"), render:renderInvoices,
  badge:()=>items("invoice").filter(x=>statusOf(x)==="Overdue").length });
})();
