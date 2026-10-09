/* Customer portal (/portal): a customer's own quotes and invoices, PDFs, and accepting or declining quotes online. */
(() => {
"use strict";
const { S, el, items, item, money, money0, fmtDate, fmtWhen, badge, today, api, round2 } = SNP;

/* The document helpers docs.js expects (the staff app gets these from sales.js). */
function calc(d){
  const sub=round2((d.lines||[]).reduce((s,l)=>s+round2((Number(l.qty)||0)*(Number(l.price)||0)),0));
  const tax=round2(sub*(Number(d.taxRate)||0)/100), total=round2(sub+tax+(Number(d.shipping)||0));
  const paid=round2((d.payments||[]).reduce((s,p)=>s+(Number(p.amount)||0),0));
  return {sub,tax,total,paid,balance:round2(total-paid)};
}
function statusOf(it){
  const d=it.data;
  if (it.type==="quote") return d.status==="Sent"&&d.validUntil&&d.validUntil<today()?"Expired":d.status;
  if (d.status==="Void") return "Void";
  if ((d.balance??calc(d).balance)<=0) return "Paid";
  if (d.dueDate&&d.dueDate<today()) return "Overdue";
  return (d.paid||0)>0?"Partially paid":"Unpaid";
}
const canRespond = q => q.data.status==="Sent" && (!q.data.validUntil||q.data.validUntil>=today());
SNP.sales = SNP.sales || { calc, statusOf, openDoc:(kind,id)=>view(kind,id) };

function view(kind, id){
  const it=item(kind,id); if(!it) return;
  const d=it.data, t=calc(d), st=statusOf(it);
  const rows=(d.lines||[]).filter(l=>l.desc||l.qty||l.price);
  const pdf=el("button",{class:"btn",type:"button",onclick:e=>SNP.docs.downloadPDF(kind,it,e.currentTarget)},"Download PDF");
  const body=el("div",{class:"stack"},
    el("div",{class:"tags"}, badge(st), d.validUntil&&kind==="quote"?el("span",{class:"muted small"},"Valid until "+fmtDate(d.validUntil)):null, d.dueDate&&kind==="invoice"?el("span",{class:"muted small"},"Due "+fmtDate(d.dueDate)):null),
    el("div",{class:"tbl-wrap"}, el("table",{class:"list"}, el("thead",{}, el("tr",{}, el("th",{},"Item"), el("th",{class:"num"},"Qty"), el("th",{class:"num"},"Unit price"), el("th",{class:"num"},"Amount"))),
      el("tbody",{}, rows.map(l=>el("tr",{}, el("td",{"data-label":"Item"}, l.desc, l.grade?el("div",{class:"muted small"},"Condition: "+l.grade):null), el("td",{class:"num","data-label":"Qty"},String(l.qty)), el("td",{class:"num","data-label":"Unit price"},money(l.price)), el("td",{class:"num","data-label":"Amount"},money((Number(l.qty)||0)*(Number(l.price)||0)))))))),
    el("div",{class:"tot-rows"}, el("div",{}, el("span",{},"Subtotal"), el("span",{},money(t.sub))), t.tax?el("div",{}, el("span",{},`Tax (${d.taxRate}%)`), el("span",{},money(t.tax))):null,
      Number(d.shipping)?el("div",{}, el("span",{},"Shipping"), el("span",{},money(d.shipping))):null, el("div",{class:"grand"}, el("span",{},"Total (USD)"), el("span",{},money(t.total))),
      kind==="invoice"&&t.paid?el("div",{}, el("span",{},"Paid"), el("span",{},"−"+money(t.paid))):null, kind==="invoice"&&t.paid?el("div",{class:"grand"}, el("span",{},"Balance due"), el("span",{},money(Math.max(0,t.balance)))):null),
    d.currency&&d.currency!=="USD"&&Number(d.fxRate)>0?el("p",{class:"muted small"},`About ${SNP.docs.fmtCur((kind==="invoice"?t.balance:t.total)*d.fxRate,d.currency)} at ${d.fxRate} ${d.currency} per US dollar, for reference. Amounts are payable in US dollars.`):null,
    d.notes?el("div",{class:"add-box flat"}, el("div",{class:"sec-h"},"Notes"), el("p",{class:"pre"},d.notes)):null,
    kind==="invoice"&&S.settings.paymentInfo&&st!=="Paid"?el("div",{class:"add-box flat"}, el("div",{class:"sec-h"},"How to pay"), el("p",{class:"pre"},S.settings.paymentInfo+`\nPlease include ${d.number} with your payment.`)):null,
    d.response?el("p",{class:"scope-banner"}, `${d.response.decision==="accept"?"Accepted":"Declined"} by ${d.response.name||"you"} on ${fmtWhen(d.response.at)}${d.response.comment?`: “${d.response.comment}”`:"."}`):null,
    kind==="quote"&&canRespond(it)?respondBox(it):null,
    el("div",{class:"row-actions"}, pdf));
  SNP.drawer(`${kind==="quote"?"Quote":"Invoice"} ${d.number}`, fmtDate(d.date)+(d.division?" · "+d.division:""), body, {wide:true});
}
function respondBox(q){
  const name=el("input",{type:"text",placeholder:"Your full name","aria-label":"Your full name",autocomplete:"name"});
  const comment=el("textarea",{rows:3,placeholder:"PO number, delivery instructions or questions (optional)","aria-label":"Comment"});
  const err=el("div",{class:"err",role:"alert"});
  const send=async(decision,btn)=>{ err.textContent=""; if(decision==="accept"&&!name.value.trim()) return err.textContent="Type your full name to accept.";
    btn.disabled=true; try{ const r=await api("portal/quotes/"+q.id,{method:"POST",body:{decision,name:name.value.trim(),comment:comment.value.trim()}}); SNP.putItem(r.item);
      SNP.closeAll(); SNP.toast(decision==="accept"?"Thank you. We've got your acceptance and will be in touch to confirm delivery.":"Thanks for letting us know."); SNP.refresh(true); }
    catch(e){ err.textContent=e.message; btn.disabled=false; } };
  const acc=el("button",{class:"btn primary",type:"button"},"Accept quote"), dec=el("button",{class:"btn ghost",type:"button"},"Decline");
  acc.onclick=()=>send("accept",acc); dec.onclick=()=>send("decline",dec);
  return el("section",{class:"respond"}, el("h3",{},"Ready to go ahead?"),
    el("p",{class:"muted small"},`Accepting confirms you'd like to order at these prices, subject to availability. ${(S.settings||{}).companyName||"We"} will confirm and send the invoice.`),
    el("div",{class:"field"}, el("label",{},"Name"), name), el("div",{class:"field"}, el("label",{},"Comment"), comment), err, el("div",{class:"row-actions"}, acc, dec));
}

function home(main){
  const qs=items("quote"), inv=items("invoice"), waiting=qs.filter(canRespond);
  const open=inv.filter(i=>["Unpaid","Partially paid","Overdue"].includes(statusOf(i))), over=open.filter(i=>statusOf(i)==="Overdue");
  const bal=open.reduce((s,i)=>s+Math.max(0,i.data.balance??calc(i.data).balance),0);
  const last=inv.map(i=>i.data.date).sort().pop();
  const s=S.settings||{}, rep=S.portal&&S.portal.rep, co=(items("customer")[0]||{data:{}}).data;
  main.append(el("section",{class:"hero portal-hero"}, el("div",{class:"hero-l"}, el("div",{class:"eyebrow"}, co.name||""), el("h2",{class:"hero-h"}, `Welcome, ${(S.me.name||"").split(" ")[0]}`),
      el("p",{class:"hero-sub"}, waiting.length?`${waiting.length} quote${waiting.length===1?"":"s"} waiting for your answer.`:over.length?`${over.length} invoice${over.length===1?" is":"s are"} past due.`:"You're all caught up."))),
    el("div",{class:"kpis"}, SNP.kpi(money(bal),"Open balance",bal?"warn":""), SNP.kpi(String(over.length),"Past due",over.length?"bad":""), SNP.kpi(String(waiting.length),"Quotes to review",waiting.length?"warn":""), SNP.kpi(last?fmtDate(last):"—","Last invoice")),
    el("div",{class:"two-col"},
      el("div",{class:"col"},
        el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"Quotes waiting for you"), el("a",{href:"#quotes",class:"small"},"All quotes →")),
          waiting.length?el("ul",{class:"attn"}, waiting.map(q=>el("li",{}, el("a",{href:"#",onclick:e=>{ e.preventDefault(); view("quote",q.id); }}, `${q.data.number} · ${money(q.data.total)}`), el("span",{class:"muted small"}, q.data.validUntil?"valid until "+fmtDate(q.data.validUntil):"")))):el("p",{class:"muted small"},"No quotes need an answer right now.")),
        el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"Open invoices"), el("a",{href:"#invoices",class:"small"},"All invoices →")),
          open.length?el("ul",{class:"attn"}, open.map(i=>el("li",{class:statusOf(i)==="Overdue"?"bad":""}, el("a",{href:"#",onclick:e=>{ e.preventDefault(); view("invoice",i.id); }}, `${i.data.number} · ${money(i.data.balance)}`), el("span",{class:"muted small"}, (statusOf(i)==="Overdue"?"past due since ":"due ")+fmtDate(i.data.dueDate))))):el("p",{class:"muted small"},"Nothing owed. Thank you."))),
      el("div",{class:"col"},
        s.paymentInfo?el("section",{class:"panel"}, el("h3",{},"How to pay"), el("p",{class:"pre small"}, s.paymentInfo)):null,
        el("section",{class:"panel"}, el("h3",{},"Your contact"),
          rep?el("p",{}, el("strong",{},rep.name), el("br"), el("a",{href:"mailto:"+rep.email},rep.email)):null,
          el("p",{class:"small"}, s.companyName, el("br"), s.companyPhone?el("a",{href:"tel:"+s.companyPhone},s.companyPhone):null, el("br"), s.companyWebsite?el("a",{href:/^https?:/.test(s.companyWebsite)?s.companyWebsite:"https://"+s.companyWebsite,target:"_blank",rel:"noopener"},s.companyWebsite):null)))));
}
function list(kind){
  return main=>{
    const rows=items(kind).slice().sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||""));
    main.append(SNP.pageHead(kind==="quote"?"Quotes":"Invoices", kind==="quote"?"Quotes we've sent you. Open one to download it or accept it online.":"Your invoices and what's still open. Open one to download the PDF."),
      SNP.table({rows,onRow:x=>view(kind,x.id),empty:kind==="quote"?"No quotes yet.":"No invoices yet.",columns:[
        {label:"Number",value:x=>el("span",{class:"mono"},x.data.number)},{label:"Date",value:x=>fmtDate(x.data.date)},
        {label:kind==="quote"?"Valid until":"Due",value:x=>fmtDate(kind==="quote"?x.data.validUntil:x.data.dueDate)||"—"},
        {label:"Status",value:x=>el("span",{}, badge(statusOf(x)), kind==="quote"&&canRespond(x)?el("span",{class:"mini-tag warn"},"Needs your answer"):null)},
        {label:"Total",cls:"num",value:x=>money(x.data.total)}, ...(kind==="invoice"?[{label:"Balance",cls:"num",value:x=>money(Math.max(0,x.data.balance))}]:[])]}));
  };
}

SNP.module({ id:"home", label:"Overview", render:home });
SNP.module({ id:"quotes", label:"Quotes", render:list("quote"), badge:()=>items("quote").filter(canRespond).length });
SNP.module({ id:"invoices", label:"Invoices", render:list("invoice"), badge:()=>items("invoice").filter(i=>statusOf(i)==="Overdue").length });
SNP.start();
})();
