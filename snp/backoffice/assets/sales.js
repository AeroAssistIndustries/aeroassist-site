/* Quotes, invoices and the shared document editor (also used for purchase orders). */
(() => {
"use strict";
const { S, el, items, item, money, money0, fmtDate, badge, today, addDays, round2 } = SNP;
const DIVS = ["Oil","Phones & electronics","Commercial supply"];
const METHODS = ["Wire","ACH","Check","Zelle","Card","Cash","Other"];
const CURRENCIES = ["USD","MXN","GTQ","HNL","CRC","DOP","COP","PEN","CLP","ARS","BRL","CAD","EUR"];
const KIND = {
  quote:   { label:"Quote", party:"customer", d2:"validUntil", d2label:"Valid until", statuses:["Draft","Sent","Accepted","Declined","Expired"] },
  invoice: { label:"Invoice", party:"customer", d2:"dueDate", d2label:"Due date", statuses:["Draft","Sent","Void"] },
  po:      { label:"Purchase order", party:"supplier", d2:"expectedDate", d2label:"Expected delivery", statuses:["Draft","Sent","Confirmed","Received","Paid","Cancelled"] },
};
const QF = { q:"", status:"", mine:false }, IF = { q:"", status:"open", mine:false };
const blankLine = () => ({desc:"",grade:"",qty:1,price:0,cost:0,productId:0});

function statusOf(it){
  const d=it.data;
  if (it.type==="quote") return d.status==="Sent"&&d.validUntil&&d.validUntil<today()?"Expired":d.status;
  if (it.type==="invoice"){
    if (d.status==="Draft"||d.status==="Void") return d.status;
    if ((d.balance??calc(d).balance)<=0) return "Paid";
    if (d.dueDate&&d.dueDate<today()) return "Overdue";
    return (d.paid||0)>0?"Partially paid":"Unpaid";
  }
  return d.status;
}
function calc(d){
  const sub=round2((d.lines||[]).reduce((s,l)=>s+round2((Number(l.qty)||0)*(Number(l.price)||0)),0));
  const cost=round2((d.lines||[]).reduce((s,l)=>s+round2((Number(l.qty)||0)*(Number(l.cost)||0)),0));
  const tax=round2(sub*(Number(d.taxRate)||0)/100), total=round2(sub+tax+(Number(d.shipping)||0));
  const paid=round2((d.payments||[]).reduce((s,p)=>s+(Number(p.amount)||0),0));
  return {sub,tax,total,paid,balance:round2(total-paid),cost,profit:round2(sub-cost),margin:sub>0?Math.round((sub-cost)/sub*1000)/10:0};
}
function termDays(customerId){
  const c=item("customer",customerId); const t=c&&c.data.terms;
  if (t==="Net 15") return 15; if (t==="Net 30") return 30; if (t==="Prepaid") return 0;
  return (S.settings&&S.settings.invoiceDueDays)||15;
}
function defaultsFor(kind, extra={}){
  const s=S.settings||{}, d={date:today(), status:"Draft", lines:[blankLine()], shipping:0, taxRate:s.taxRate||0, notes:"", internalNotes:"", currency:"USD", fxRate:0};
  if (kind==="quote") d.validUntil=addDays(today(), s.quoteValidDays??3);
  if (kind==="invoice"){ d.payments=[]; }
  if (kind==="po") d.shipTo=[s.companyName,s.companyAddress].filter(Boolean).join("\n");
  Object.assign(d, extra);
  if (kind==="invoice"&&!d.dueDate) d.dueDate=addDays(d.date, termDays(d.customerId));
  if (kind!=="po"&&!d.repId){ const c=item("customer",d.customerId); d.repId=(c&&c.data.ownerId)||(S.me&&S.me.id)||0; }
  return d;
}
const isMine = it => it.data.repId===(S.me&&S.me.id);

/* ---------- editor ---------- */
function newDoc(kind, extra={}){ openEditor(kind, null, defaultsFor(kind, extra)); }
function openDoc(kind, id){ const it=item(kind,id); if(it) openEditor(kind, it.id, JSON.parse(JSON.stringify(it.data))); }

function openEditor(kind, id, draft){
  const K=KIND[kind], ro=!SNP.can(kind,"rw"), seeCosts=!!S.perms.seeCosts, priceKey=kind==="po"?"cost":"price";
  let saved = id ? item(kind,id) : null, dirty=false;
  draft.lines=(draft.lines&&draft.lines.length?draft.lines:[blankLine()]).map(l=>Object.assign(blankLine(),l));
  const panel=el("div",{class:"modal xl editor",role:"dialog","aria-modal":"true"});
  const title=el("h2",{});
  const err=el("div",{class:"err",role:"alert"});
  const setTitle=()=>{ title.replaceChildren(saved?`${K.label} ${saved.data.number}`:`New ${K.label.toLowerCase()}`, saved?el("span",{class:"title-badge"}, badge(statusOf(saved))):null); };
  const markDirty=()=>{ dirty=true; };

  /* header fields */
  const partyType=K.party, partyKey=partyType==="customer"?"customerId":"supplierId";
  const partySel=SNP.field({key:partyKey,label:partyType==="customer"?"Customer":"Supplier",type:partyType,full:true}, draft[partyKey], ro);
  const ps=partySel.querySelector("select");
  if (!ro && (partyType==="customer"?SNP.can("customer","rw"):SNP.can("supplier","rw"))){
    ps.append(el("option",{value:"__new"}, partyType==="customer"?"+ Add a new customer…":"+ Add a new supplier…"));
  }
  ps.addEventListener("change",()=>{
    if (ps.value==="__new"){ ps.value=draft[partyKey]?String(draft[partyKey]):"";
      const cb=c=>{ draft[partyKey]=c.id; ps.append(el("option",{value:String(c.id)},c.data.name)); ps.value=String(c.id); markDirty(); updateDue(); };
      if (partyType==="customer") SNP.crm.editCustomer(null,{status:"Active"},cb); else SNP.buy.editSupplier(null,{},cb);
      return; }
    draft[partyKey]=ps.value?Number(ps.value):0; markDirty(); updateDue();
    if (kind!=="po"&&!saved){ const c=item("customer",draft.customerId); if(c&&c.data.ownerId){ draft.repId=c.data.ownerId; const r=head.querySelector('[data-key="repId"]'); if(r) r.value=String(draft.repId); } }
  });
  const headDefs=[
    {key:"date",label:"Date",type:"date"}, {key:K.d2,label:K.d2label,type:"date"},
    {key:"status",label:"Status",type:"select",options:K.statuses},
    {key:"division",label:"Division",type:"select",options:[["","—"],...DIVS.map(x=>[x,x])]}];
  if (kind!=="po") headDefs.push({key:"repId",label:"Sales rep",type:"user",readonly:S.me&&S.me.role!=="owner"});
  const head=el("div",{class:"fields cols4"}, partySel, ...headDefs.map(d=>SNP.field(d, draft[d.key], ro)));
  const onHead=e=>{ const k=e.target.dataset.key; if(!k||k===partyKey) return; draft[k]=k==="repId"?Number(e.target.value)||0:e.target.value; markDirty(); if(k==="date") updateDue(); };
  head.addEventListener("input",onHead); head.addEventListener("change",onHead);
  function updateDue(){ if(kind!=="invoice"||saved) return; draft.dueDate=addDays(draft.date||today(), termDays(draft.customerId)); const n=head.querySelector('[data-key="dueDate"]'); if(n) n.value=draft.dueDate; }

  /* product picker */
  const products=items("product").filter(p=>p.data.active!==false);
  const plabel=p=>p.data.name+(p.data.grade?` · ${p.data.grade}`:"")+(p.data.sku?` (${p.data.sku})`:"");
  const plist=el("datalist",{id:"plist-"+Date.now()}, products.map(p=>el("option",{value:plabel(p)}, (kind==="po"?(seeCosts?money(p.data.cost):""):money(p.data.price))+(p.data.unit?" / "+p.data.unit:""))));

  /* lines */
  const linesBox=el("div",{class:"lines"}), totalsBox=el("div",{class:"totals"});
  const showCost = seeCosts && kind!=="po";
  function drawLines(){
    const tb=el("tbody");
    draft.lines.forEach((l,i)=>{
      const amt=el("td",{class:"num amt","data-label":"Amount"}, money((Number(l.qty)||0)*(Number(l[priceKey])||0)));
      const inp=(key,attrs,label)=>{ const n=el("input",Object.assign({value:l[key]??"",disabled:ro||null,"aria-label":label+" line "+(i+1)},attrs));
        n.addEventListener("input",()=>{ l[key]=attrs.type==="number"?(n.value===""?0:Number(n.value)):n.value; markDirty();
          if (key==="desc"){ const byName=products.filter(x=>x.data.name===n.value), p=products.find(x=>plabel(x)===n.value)||(byName.length===1?byName[0]:null); if(p){ l.productId=p.id; l.desc=p.data.name; n.value=p.data.name; l.grade=p.data.grade||l.grade; l.price=kind==="po"?l.price:(p.data.price||0); l.cost=p.data.cost||0; drawLines(); drawTotals(); return; } else l.productId=0; }
          amt.textContent=money((Number(l.qty)||0)*(Number(l[priceKey])||0)); drawTotals(); });
        return n; };
      const descIn=inp("desc",{type:"text",placeholder:products.length?"Type or pick a product":"Item or service",list:plist.id},"Description");
      tb.append(el("tr",{},
        el("td",{"data-label":"Description",class:"desc"}, descIn, l.productId?el("span",{class:"prod-tag",title:"From the product list"},"Product"):null),
        el("td",{"data-label":"Condition",class:"grade"}, inp("grade",{type:"text",placeholder:"—"},"Condition")),
        el("td",{"data-label":"Qty",class:"num"}, inp("qty",{type:"number",step:"any",inputmode:"decimal"},"Quantity")),
        el("td",{"data-label":kind==="po"?"Unit cost":"Unit price",class:"num"}, inp(priceKey,{type:"number",step:"0.01",inputmode:"decimal"},kind==="po"?"Unit cost":"Unit price")),
        showCost?el("td",{"data-label":"Unit cost",class:"num costcol"}, inp("cost",{type:"number",step:"0.01",inputmode:"decimal"},"Unit cost")):null,
        amt,
        el("td",{class:"rm"}, ro?null:el("button",{class:"btn small ghost",type:"button","aria-label":"Remove line "+(i+1),onclick:()=>{ draft.lines.splice(i,1); if(!draft.lines.length) draft.lines.push(blankLine()); markDirty(); drawLines(); drawTotals(); }},"×"))));
    });
    linesBox.replaceChildren(plist, el("div",{class:"tbl-wrap"}, el("table",{class:"lines-t"},
      el("thead",{}, el("tr",{}, el("th",{},"Description"), el("th",{},"Condition"), el("th",{class:"num"},"Qty"), el("th",{class:"num"},kind==="po"?"Unit cost":"Unit price"), showCost?el("th",{class:"num costcol"},"Unit cost"):null, el("th",{class:"num"},"Amount"), el("th",{}))), tb)),
      ro?null:el("div",{class:"row-actions"}, el("button",{class:"btn small",type:"button",onclick:()=>{ draft.lines.push(blankLine()); markDirty(); drawLines(); linesBox.querySelector("tbody tr:last-child input").focus(); }},"+ Add line"),
        products.length?null:(SNP.can("product","rw")?el("a",{href:"#products",class:"small muted"},"Add products to pick from"):null)));
  }
  function drawTotals(){
    if (kind==="po") draft.lines.forEach(l=>{ l.price=l.cost; });
    const num=(key,label,step)=>{ const n=el("input",{type:"number",step,value:draft[key]??0,disabled:ro||null,"aria-label":label,inputmode:"decimal"}); n.addEventListener("input",()=>{ draft[key]=n.value===""?0:Number(n.value); markDirty(); redraw(); }); return n; };
    const vals=el("div",{class:"tot-rows"});
    const fxOut=el("div",{class:"fx-out"});
    const redraw=()=>{ const t=calc(draft); vals.replaceChildren(
      el("div",{}, el("span",{},"Subtotal"), el("span",{class:"num"},money(t.sub))),
      el("div",{}, el("span",{},`Tax (${Number(draft.taxRate)||0}%)`), el("span",{class:"num"},money(t.tax))),
      el("div",{}, el("span",{},"Shipping"), el("span",{class:"num"},money(draft.shipping))),
      el("div",{class:"grand"}, el("span",{},"Total"), el("span",{class:"num"},money(t.total))),
      kind==="invoice"?el("div",{}, el("span",{},"Paid"), el("span",{class:"num"},money(t.paid))):null,
      kind==="invoice"?el("div",{class:"grand"+(t.balance>0?" warn-t":"")}, el("span",{},"Balance due"), el("span",{class:"num"},money(t.balance))):null,
      showCost?el("div",{class:"profit-row"}, el("span",{},"Profit (internal)"), el("span",{class:"num"+(t.profit<0?" bad-t":"")}, `${money(t.profit)} · ${t.margin}%`)):null);
      if (kind!=="po"&&draft.currency&&draft.currency!=="USD"&&Number(draft.fxRate)>0){ const base=kind==="invoice"&&t.paid?t.balance:t.total; fxOut.textContent=`≈ ${SNP.docs.fmtCur(base*Number(draft.fxRate),draft.currency)} for the customer's reference`; } else fxOut.textContent=""; };
    const inputs=el("div",{class:"tot-inputs"}, el("label",{}, "Tax rate %", num("taxRate","Tax rate percent","0.001")), el("label",{}, "Shipping", num("shipping","Shipping","0.01")));
    if (kind!=="po"){
      const cur=SNP.selectEl(CURRENCIES.map(c=>[c,c==="USD"?"USD only":c]),draft.currency||"USD",async v=>{ draft.currency=v; markDirty(); rateLabel.hidden=v==="USD"; if(v==="USD"){ draft.fxRate=0; rateIn.value=""; redraw(); return; } await fetchRate(); },"Show amount in currency");
      const rateIn=el("input",{type:"number",step:"0.0001",value:draft.fxRate||"",placeholder:"rate",disabled:ro||null,"aria-label":"Exchange rate per US dollar",inputmode:"decimal"});
      rateIn.addEventListener("input",()=>{ draft.fxRate=Number(rateIn.value)||0; markDirty(); redraw(); });
      const fetchRate=async()=>{ try{ const r=await SNP.docs.rate(draft.currency); draft.fxRate=Math.round(r*10000)/10000; rateIn.value=draft.fxRate; redraw(); SNP.toast(`Today's rate: ${draft.fxRate} ${draft.currency} per US dollar.`); }catch(e){ SNP.toast("Couldn't get today's rate. Type it in instead."); } };
      if (ro) cur.disabled=true;
      const rateLabel=el("label",{hidden:!draft.currency||draft.currency==="USD"}, "Rate per US$", rateIn, ro?null:el("button",{class:"btn small ghost",type:"button",onclick:fetchRate},"Today's rate"));
      inputs.append(el("label",{}, "Also show in", cur), rateLabel);
    }
    totalsBox.replaceChildren(el("div",{}, inputs, fxOut), vals);
    redraw();
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
    SNP.field({key:"notes",label:kind==="po"?"Notes to supplier (on the PDF)":"Notes to customer (on the PDF)",type:"textarea",rows:3}, draft.notes, ro),
    SNP.field({key:"internalNotes",label:"Internal notes (never on the PDF)",type:"textarea",rows:3}, draft.internalNotes, ro));
  notes.addEventListener("input",e=>{ const k=e.target.dataset.key; if(k){ draft[k]=e.target.value; markDirty(); } });

  /* emails sent */
  const sentBox=el("div");
  const drawSent=()=>{ const em=(saved&&saved.data.emails)||[];
    sentBox.replaceChildren(em.length?el("section",{class:"ed-sec"}, el("h3",{},"Emails sent"), el("ul",{class:"attn"}, em.slice().reverse().map(e=>el("li",{}, el("span",{}, (e.kind==="reminder"?"Payment reminder to ":"Sent to ")+e.to), el("span",{class:"muted small"}, SNP.fmtWhen(e.at)+(e.by?" · "+SNP.nameOf(e.by):"")))))):""); };

  /* actions */
  const save=el("button",{class:"btn primary",type:"button"},"Save");
  const actions=el("div",{class:"row-actions ed-actions"});
  const needSaved=async()=>{ if(ro) return saved; if(dirty||!saved){ const s=await doSave(); return s; } return saved; };
  const drawActions=()=>{
    const st=saved?statusOf(saved):"";
    const canSend=S.perms.sendEmail&&!ro;
    actions.replaceChildren(
      ro?null:save,
      el("button",{class:"btn",type:"button",onclick:async e=>{ const s=await needSaved(); if(s) SNP.docs.downloadPDF(kind,s,e.currentTarget); }},"Download PDF"),
      canSend?el("button",{class:"btn",type:"button",onclick:async()=>{ const s=await needSaved(); if(s) SNP.docs.openEmail(kind,s,"document",it=>{ saved=it||saved; setTitle(); drawSent(); }); }},"Email"):null,
      el("button",{class:"btn",type:"button",onclick:async e=>{ const s=await needSaved(); if(s) SNP.docs.share(kind,s,e.currentTarget); }},"Share / WhatsApp"),
      canSend&&kind==="invoice"&&saved&&["Overdue","Unpaid","Partially paid"].includes(st)?el("button",{class:"btn warn",type:"button",onclick:()=>SNP.docs.openEmail(kind,saved,"reminder",it=>{ saved=it||saved; drawSent(); })},"Payment reminder"):null,
      kind==="quote"&&saved&&!saved.data.invoiceId&&SNP.can("invoice","rw")&&!ro?el("button",{class:"btn",type:"button",onclick:convert},"Convert to invoice"):null,
      kind==="quote"&&saved&&saved.data.invoiceId?el("button",{class:"btn ghost",type:"button",onclick:()=>{ close(true); openDoc("invoice",saved.data.invoiceId); }},"Open invoice"):null,
      saved&&!ro?el("button",{class:"btn ghost",type:"button",onclick:dup},"Duplicate"):null,
      saved&&S.perms.deleteAny?SNP.confirmBtn("Delete",`Delete ${saved.data.number}?`, async()=>{ await SNP.deleteItem(kind,saved.id); close(true); SNP.toast("Deleted."); SNP.refresh(true); }):null);
  };

  async function doSave(){
    err.textContent="";
    if (!draft[partyKey]) { err.textContent=`Choose the ${partyType}.`; return null; }
    save.disabled=true;
    try{
      draft.lines=draft.lines.filter(l=>(l.desc||"").trim()||Number(l.qty)||Number(l.price)||Number(l.cost));
      if(!draft.lines.length) draft.lines.push(blankLine());
      if (kind==="po") draft.lines.forEach(l=>{ l.price=l.cost; });
      saved=await SNP.saveItem(kind, saved?saved.id:null, draft);
      draft=JSON.parse(JSON.stringify(saved.data)); draft.lines=draft.lines.map(l=>Object.assign(blankLine(),l)); dirty=false;
      setTitle(); drawActions(); drawLines(); drawTotals(); drawPayments(); drawSent();
      SNP.toast(`${K.label} ${saved.data.number} saved.`); SNP.refresh(true);
      return saved;
    } catch(e){ err.textContent=e.message||"That didn't save."; return null; }
    finally{ save.disabled=false; }
  }
  save.onclick=doSave;
  async function convert(){
    if (dirty){ if(!await doSave()) return; }
    try{ const q=saved.data;
      const inv=await SNP.saveItem("invoice",null,defaultsFor("invoice",{customerId:q.customerId,lines:q.lines,shipping:q.shipping,taxRate:q.taxRate,notes:q.notes,division:q.division,quoteId:saved.id,currency:q.currency,fxRate:q.fxRate,repId:q.repId}));
      await SNP.saveItem("quote",saved.id,Object.assign({},q,{status:"Accepted",invoiceId:inv.id}));
      SNP.toast(`Invoice ${inv.data.number} created from ${q.number}.`); close(true); SNP.refresh(true); openDoc("invoice",inv.id);
    } catch(e){ SNP.fail(e); }
  }
  function dup(){ const copy=JSON.parse(JSON.stringify(saved.data)); ["number","invoiceId","quoteId","emails"].forEach(k=>delete copy[k]);
    Object.assign(copy,{status:"Draft",date:today(),payments:[]}); if(kind==="quote") copy.validUntil=addDays(today(),(S.settings&&S.settings.quoteValidDays)||3);
    if (kind==="invoice") copy.dueDate=addDays(today(),termDays(copy.customerId));
    close(true); openEditor(kind,null,copy); }

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
  setTitle(); drawActions(); drawLines(); drawTotals(); drawPayments(); drawSent();
  panel.append(
    el("div",{class:"m-head"}, title, closeWrap, el("button",{class:"x",type:"button","aria-label":"Close",onclick:()=>close(false)},"×")),
    el("div",{class:"m-body"},
      ro?el("div",{class:"scope-banner"},"View only. You can download or share it, but only owners can make changes."):null,
      head,
      el("section",{class:"ed-sec"}, el("h3",{},"Items"), linesBox, totalsBox),
      payBox,
      el("section",{class:"ed-sec"}, el("h3",{},"Notes"), notes),
      sentBox, err, actions,
      saved?el("div",{class:"foot"}, el("span",{}, `Created by ${SNP.nameOf(saved.createdBy)||"the website"} · last updated ${SNP.fmtWhen(saved.updatedAt)} by ${SNP.nameOf(saved.updatedBy)}`)):null));
  SNP.pushPanel(panel,{locked:true});
  panel.dataset.noesc="1"; panel._esc=()=>close(false); // Esc asks before discarding unsaved changes
}

/* ---------- lists ---------- */
function mineToggle(F, draw){
  if (!S.me||S.me.role==="accountant") return null;
  const cb=el("input",{type:"checkbox",id:"mine-"+Math.random().toString(36).slice(2),checked:F.mine||null}); cb.onchange=()=>{ F.mine=cb.checked; draw(); };
  return el("label",{class:"chk",for:cb.id}, cb, "Only mine");
}
function renderQuotes(main){
  const listBox=el("div");
  const draw=()=>{
    const q=QF.q.trim().toLowerCase();
    const rows=items("quote").filter(x=>(!QF.status||statusOf(x)===QF.status)&&(!QF.mine||isMine(x))&&(!q||`${x.data.number} ${SNP.customerName(x.data.customerId)}`.toLowerCase().includes(q)))
      .sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||"")||b.id-a.id);
    listBox.replaceChildren(SNP.table({rows,onRow:x=>openDoc("quote",x.id),empty:items("quote").length?"No quotes match.":"No quotes yet.",columns:[
      {label:"Number",value:x=>el("span",{class:"mono"},x.data.number)},{label:"Customer",value:x=>SNP.customerName(x.data.customerId)},
      {label:"Date",value:x=>fmtDate(x.data.date)},{label:"Valid until",value:x=>fmtDate(x.data.validUntil)||"—"},
      {label:"Rep",value:x=>SNP.nameOf(x.data.repId)||"—"},
      {label:"Status",value:x=>el("span",{}, badge(statusOf(x)), (x.data.emails||[]).length?el("span",{class:"mini-tag"},"Emailed"):null)},{label:"Total",cls:"num",value:x=>money(x.data.total)}]}));
  };
  const open=items("quote").filter(x=>["Draft","Sent"].includes(statusOf(x)));
  const m=SNP.thisMonth(), accepted=items("quote").filter(x=>x.data.status==="Accepted"&&(x.updatedAt||"").slice(0,7)===m);
  const q=SNP.search("Search quotes", e=>{ QF.q=e.target.value; draw(); }); q.value=QF.q;
  main.append(SNP.pageHead("Quotes","Price quotes for customers. Email them as PDFs, and convert accepted ones into invoices in one step.",
      SNP.can("quote","rw")?el("button",{class:"btn primary",type:"button",onclick:()=>newDoc("quote")},"+ Quote"):null),
    el("div",{class:"kpis"}, SNP.kpi(String(open.length),"Open quotes"), SNP.kpi(money0(open.reduce((s,x)=>s+(x.data.total||0),0)),"Open value"),
      SNP.kpi(String(accepted.length),"Accepted this month"), SNP.kpi(String(items("quote").filter(x=>x.data.status==="Sent"&&x.data.validUntil&&x.data.validUntil>=today()&&x.data.validUntil<=addDays(today(),3)).length),"Expiring in 3 days")),
    SNP.toolbar(q, SNP.selectEl([["","All statuses"],...KIND.quote.statuses.map(s=>[s,s])],QF.status,v=>{QF.status=v;draw();},"Status"), mineToggle(QF,draw)), listBox);
  draw();
}
function renderInvoices(main){
  const listBox=el("div");
  const match=x=>{ const st=statusOf(x);
    if (IF.status==="open") return ["Unpaid","Partially paid","Overdue"].includes(st);
    return !IF.status||st===IF.status; };
  const draw=()=>{
    const q=IF.q.trim().toLowerCase();
    const rows=items("invoice").filter(x=>match(x)&&(!IF.mine||isMine(x))&&(!q||`${x.data.number} ${SNP.customerName(x.data.customerId)}`.toLowerCase().includes(q)))
      .sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||"")||b.id-a.id);
    const sumT=rows.reduce((s,x)=>s+(x.data.status==="Void"?0:x.data.total||0),0), sumB=rows.reduce((s,x)=>s+(x.data.status==="Sent"?x.data.balance||0:0),0);
    listBox.replaceChildren(SNP.table({rows,onRow:x=>openDoc("invoice",x.id),empty:items("invoice").length?"No invoices match.":"No invoices yet.",columns:[
      {label:"Number",value:x=>el("span",{class:"mono"},x.data.number)},{label:"Customer",value:x=>SNP.customerName(x.data.customerId)},
      {label:"Date",value:x=>fmtDate(x.data.date)},{label:"Due",value:x=>fmtDate(x.data.dueDate)||"—"},
      {label:"Status",value:x=>el("span",{}, badge(statusOf(x)), (x.data.emails||[]).some(e=>e.kind==="reminder")?el("span",{class:"mini-tag"},"Reminder sent"):(x.data.emails||[]).length?el("span",{class:"mini-tag"},"Emailed"):null)},
      {label:"Total",cls:"num",value:x=>money(x.data.total)},{label:"Balance",cls:"num",value:x=>x.data.status==="Sent"?money(x.data.balance):"—"}],
      foot:rows.length?el("tr",{}, el("td",{colspan:"5"},`${rows.length} invoice${rows.length===1?"":"s"}`), el("td",{class:"num"},money(sumT)), el("td",{class:"num"},money(sumB))):null}));
  };
  const m=SNP.thisMonth(), inv=items("invoice").filter(x=>x.data.status!=="Void"&&x.data.status!=="Draft");
  const billed=inv.filter(x=>(x.data.date||"").slice(0,7)===m).reduce((s,x)=>s+(x.data.total||0),0);
  const collected=inv.reduce((s,x)=>s+(x.data.payments||[]).filter(p=>(p.date||"").slice(0,7)===m).reduce((a,p)=>a+(p.amount||0),0),0);
  const unpaid=inv.reduce((s,x)=>s+Math.max(0,x.data.balance||0),0), overdue=inv.filter(x=>statusOf(x)==="Overdue");
  const q=SNP.search("Search invoices", e=>{ IF.q=e.target.value; draw(); }); q.value=IF.q;
  main.append(SNP.pageHead("Invoices", SNP.can("invoice","rw")?"Bill customers, email PDFs, record payments and chase what's overdue.":"View only.",
      el("button",{class:"btn ghost",type:"button",onclick:exportInvoices},"Export CSV"),
      SNP.can("invoice","rw")?el("button",{class:"btn primary",type:"button",onclick:()=>newDoc("invoice")},"+ Invoice"):null),
    el("div",{class:"kpis"}, SNP.kpi(money0(billed),"Invoiced this month"), SNP.kpi(money0(collected),"Collected this month"),
      SNP.kpi(money0(unpaid),"Unpaid", unpaid?"warn":""), SNP.kpi(`${overdue.length} · ${money0(overdue.reduce((s,x)=>s+x.data.balance,0))}`,"Overdue", overdue.length?"bad":"")),
    SNP.toolbar(q, SNP.selectEl([["open","Unpaid & overdue"],["","All invoices"],["Overdue","Overdue"],["Paid","Paid"],["Draft","Drafts"],["Void","Void"]],IF.status,v=>{IF.status=v;draw();},"Status"), mineToggle(IF,draw)), listBox);
  draw();
}
function exportInvoices(){
  const costs=!!S.perms.seeCosts;
  SNP.csv("SNP invoices "+today()+".csv",["Number","Customer","Date","Due","Status","Division","Rep","Subtotal","Tax","Shipping","Total","Paid","Balance",...(costs?["Cost","Profit","Margin %"]:[])],
    items("invoice").map(x=>{const d=x.data; return [d.number,SNP.customerName(d.customerId),d.date,d.dueDate,statusOf(x),d.division,SNP.nameOf(d.repId),d.subtotal,d.tax,d.shipping,d.total,d.paid,d.balance,...(costs?[d.costTotal,d.profit,d.margin]:[])];}));
}

SNP.sales = { newDoc, openDoc, openEditor, statusOf, calc, defaultsFor, isMine };
SNP.module({ id:"quotes", label:"Quotes", group:"Sales", visible:()=>SNP.can("quote"), render:renderQuotes });
SNP.module({ id:"invoices", label:"Invoices", group:"Sales", visible:()=>SNP.can("invoice"), render:renderInvoices,
  badge:()=>items("invoice").filter(x=>statusOf(x)==="Overdue").length });
})();
