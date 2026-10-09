/* Document output: real PDFs for quotes, invoices, POs and tables; emailing them; sharing to WhatsApp. */
(() => {
"use strict";
const { S, el, CFG, money, fmtDate, item, toast } = SNP;
const LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
              "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"];
const KIND = { quote:{label:"Quote",title:"QUOTE",d2:"validUntil",d2label:"Valid until",party:"customer"},
  invoice:{label:"Invoice",title:"INVOICE",d2:"dueDate",d2label:"Due date",party:"customer"},
  po:{label:"Purchase order",title:"PURCHASE ORDER",d2:"expectedDate",d2label:"Expected",party:"supplier"} };
const CUR_NAMES = { USD:"US dollar", MXN:"Mexican peso", GTQ:"Guatemalan quetzal", HNL:"Honduran lempira", CRC:"Costa Rican colón", DOP:"Dominican peso",
  COP:"Colombian peso", PEN:"Peruvian sol", CLP:"Chilean peso", ARS:"Argentine peso", BRL:"Brazilian real", CAD:"Canadian dollar", EUR:"Euro" };

function loadScript(src){ return new Promise((res,rej)=>{ if(document.querySelector(`script[src="${src}"]`)&&window.jspdf) return res(); const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=()=>rej(new Error("load")); document.head.append(s); }); }
async function libs(){
  if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) return window.jspdf.jsPDF;
  try { for (const u of LIBS) await loadScript(u); } catch(e){ throw {message:"The PDF tool didn't load. Check your connection and try again."}; }
  return window.jspdf.jsPDF;
}
let logoData=null;
async function logo(){
  if (logoData!==null) return logoData;
  try{ const b=await (await fetch(CFG.logo)).blob(); logoData=await new Promise(r=>{ const f=new FileReader(); f.onload=()=>r(f.result); f.readAsDataURL(b); }); }
  catch(e){ logoData=""; }
  return logoData;
}
/* PDF fonts are Latin-1: swap characters they can't draw. */
const safe = s => String(s??"").replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—−]/g,"-").replace(/…/g,"...").replace(/[→]/g,"->").replace(/[^\x00-\xFF]/g,"");
const fmtCur = (n,cur) => { try{ return new Intl.NumberFormat("en-US",{style:"currency",currency:cur}).format(Number(n)||0); }catch(e){ return cur+" "+(Number(n)||0).toFixed(2); } };
function partyOf(kind,d){ const p=kind==="po"?item("supplier",d.supplierId):item("customer",d.customerId); return p?p.data:{name:kind==="po"?SNP.supplierName(d.supplierId):SNP.customerName(d.customerId)}; }
const fileName = (kind,d) => `SNP ${KIND[kind].label} ${d.number||"draft"}${partyOf(kind,d).name?" - "+partyOf(kind,d).name:""}.pdf`.replace(/[\/\\:*?"<>|]/g,"-");

function header(doc, title, lines){
  const s=S.settings||{}, W=doc.internal.pageSize.getWidth(), M=40;
  if (logoData) doc.addImage(logoData,"JPEG",M,32,58,58);
  doc.setFont("helvetica","bold").setFontSize(14).setTextColor(24,20,21).text(safe(s.companyName||"SNP Wholesale LLC"),M+70,50);
  doc.setFont("helvetica","normal").setFontSize(9).setTextColor(102,94,96);
  const info=[...(s.companyAddress||"").split("\n"), [s.companyPhone,s.companyEmail].filter(Boolean).join("  ·  "), s.companyWebsite||""].filter(Boolean);
  info.slice(0,5).forEach((l,i)=>doc.text(safe(l),M+70,64+i*11));
  doc.setFont("helvetica","bolditalic").setFontSize(24).setTextColor(200,16,46).text(title,W-M,56,{align:"right"});
  doc.setFont("helvetica","normal").setFontSize(9.5).setTextColor(24,20,21);
  lines.forEach((l,i)=>{ doc.setFont("helvetica",i===0?"bold":"normal"); doc.text(safe(l),W-M,74+i*12,{align:"right"}); });
  doc.setDrawColor(24,20,21).setLineWidth(1.6).line(M,112,W-M,112);
  return 130;
}
function footer(doc, text){
  const n=doc.internal.getNumberOfPages(), W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight();
  for (let i=1;i<=n;i++){ doc.setPage(i); doc.setFont("helvetica","normal").setFontSize(8).setTextColor(102,94,96);
    doc.splitTextToSize(safe(text),W-160).slice(0,2).forEach((l,j)=>doc.text(l,40,H-30+j*10));
    doc.text(`Page ${i} of ${n}`,W-40,H-30,{align:"right"}); }
}
function box(doc, y, label, text){
  const W=doc.internal.pageSize.getWidth(), M=40, lines=doc.splitTextToSize(safe(text),W-2*M-20);
  const h=24+lines.length*11;
  if (y+h>doc.internal.pageSize.getHeight()-60){ doc.addPage(); y=50; }
  doc.setDrawColor(225,219,220).setLineWidth(0.8).roundedRect(M,y,W-2*M,h,4,4);
  doc.setFont("helvetica","bold").setFontSize(7.5).setTextColor(102,94,96).text(label.toUpperCase(),M+10,y+14);
  doc.setFont("helvetica","normal").setFontSize(9.5).setTextColor(24,20,21).text(lines,M+10,y+27);
  return y+h+10;
}

/* Quote, invoice or purchase order as a PDF Blob. */
async function documentPDF(kind, it){
  const jsPDF=await libs(); await logo();
  const K=KIND[kind], d=it.data, s=S.settings||{}, p=partyOf(kind,d);
  const t=SNP.sales.calc(d), st=SNP.sales.statusOf(it);
  const doc=new jsPDF({unit:"pt",format:"letter"}), W=doc.internal.pageSize.getWidth(), M=40;
  let y=header(doc, K.title, [d.number||"DRAFT", "Date: "+fmtDate(d.date), d[K.d2]?K.d2label+": "+fmtDate(d[K.d2]):""].filter(Boolean));
  const col=(x,label,lines)=>{ doc.setFont("helvetica","bold").setFontSize(7.5).setTextColor(102,94,96).text(label.toUpperCase(),x,y);
    doc.setFont("helvetica","normal").setFontSize(9.5).setTextColor(24,20,21); let yy=y+13;
    lines.filter(Boolean).forEach((l,i)=>{ doc.setFont("helvetica",i===0?"bold":"normal"); doc.splitTextToSize(safe(l),220).forEach(z=>{ doc.text(z,x,yy); yy+=11.5; }); }); return yy; };
  const y1=col(M, kind==="po"?"Vendor":kind==="quote"?"Prepared for":"Bill to", [p.name, p.contactName?"Attn: "+p.contactName:"", ...(p.address||"").split("\n"), [p.state,p.country].filter(Boolean).join(", "), p.email, p.phone]);
  const y2=kind==="po"?col(W/2+10,"Ship to",(d.shipTo||"").split("\n")):col(W/2+10,"Details",[d.division?"Division: "+d.division:"", kind==="invoice"&&st==="Paid"?"Status: PAID":"", d.currency&&d.currency!=="USD"?"Prices in US dollars":""]);
  y=Math.max(y1,y2)+8;
  const rows=(d.lines||[]).filter(l=>l.desc||l.qty||l.price).map(l=>[safe(l.desc)+(l.grade?"\nCondition: "+safe(l.grade):""), String(l.qty), money(l.price), money((Number(l.qty)||0)*(Number(l.price)||0))]);
  doc.autoTable({ startY:y, head:[["Description","Qty","Unit price","Amount"]], body:rows.length?rows:[["No items","","",""]], margin:{left:M,right:M},
    theme:"plain", styles:{font:"helvetica",fontSize:9.5,cellPadding:{top:6,bottom:6,left:5,right:5},textColor:[24,20,21],lineColor:[225,219,220],lineWidth:{bottom:0.6}},
    headStyles:{fillColor:[24,20,21],textColor:[255,255,255],fontStyle:"bold",fontSize:8.5}, columnStyles:{1:{halign:"right",cellWidth:55},2:{halign:"right",cellWidth:85},3:{halign:"right",cellWidth:90}} });
  y=doc.lastAutoTable.finalY+12;
  const totals=[["Subtotal",money(t.sub)]]; if(t.tax) totals.push([`Tax (${Number(d.taxRate)}%)`,money(t.tax)]); if(Number(d.shipping)) totals.push(["Shipping",money(d.shipping)]);
  totals.push(["Total (USD)",money(t.total),1]);
  if (kind==="invoice"&&t.paid){ totals.push(["Paid","-"+money(t.paid)]); totals.push(["Balance due",money(t.balance),1]); }
  if (y+totals.length*16>doc.internal.pageSize.getHeight()-80){ doc.addPage(); y=50; }
  totals.forEach(([l,v,b])=>{ if(b){ doc.setDrawColor(24,20,21).setLineWidth(1.2).line(W-M-220,y-9,W-M,y-9); }
    doc.setFont("helvetica",b?"bold":"normal").setFontSize(b?11:9.5).setTextColor(24,20,21).text(l,W-M-220,y); doc.text(v,W-M,y,{align:"right"}); y+=b?18:15; });
  if (kind==="invoice"&&st==="Paid"){ doc.setDrawColor(21,112,58).setTextColor(21,112,58).setLineWidth(2).roundedRect(M,y-50,70,26,3,3); doc.setFont("helvetica","bold").setFontSize(14).text("PAID",M+35,y-32,{align:"center"}); }
  y+=6;
  if (d.currency&&d.currency!=="USD"&&Number(d.fxRate)>0 && kind!=="po"){
    const amt=(kind==="invoice"&&t.paid?t.balance:t.total)*Number(d.fxRate);
    y=box(doc,y,"Amount in "+(CUR_NAMES[d.currency]||d.currency)+"s (for reference)",`Approx. ${fmtCur(amt,d.currency)} at ${Number(d.fxRate).toLocaleString("en-US",{maximumFractionDigits:4})} ${d.currency} per US dollar. Amounts are payable in US dollars; the converted figure is a reference only.`);
  }
  if (d.notes) y=box(doc,y,"Notes",d.notes);
  if (kind==="invoice"&&s.paymentInfo) y=box(doc,y,"How to pay",s.paymentInfo+`\nPlease include ${d.number||"the invoice number"} with your payment.`);
  if (kind==="quote") y=box(doc,y,"Terms",`Prices are in US dollars${d.validUntil?" and valid until "+fmtDate(d.validUntil):""}, subject to availability. To accept, reply to this quote or send a purchase order referencing ${d.number||"this quote"}.`);
  if (kind==="po") y=box(doc,y,"Purchase terms",`Please confirm this PO in writing within two business days. Ship only the items, quantities and condition grades listed; substitutions need written approval. Include ${d.number||"this PO number"} on every invoice, packing list and bill of lading.`);
  footer(doc, [kind==="po"?"":s.documentFooter, `${s.companyName||""} · ${s.companyEmail||""} · ${s.companyPhone||""}`].filter(Boolean).join("  "));
  return doc.output("blob");
}
/* Any table as a PDF (price lists, reports). */
async function tablePDF(title, subtitle, head, rows, {landscape=false, right=[]}={}){
  const jsPDF=await libs(); await logo();
  const doc=new jsPDF({unit:"pt",format:"letter",orientation:landscape?"landscape":"portrait"});
  const y=header(doc, title, [subtitle, "As of "+fmtDate(SNP.today())]);
  const cs={}; right.forEach(i=>cs[i]={halign:"right"});
  doc.autoTable({ startY:y, head:[head.map(safe)], body:rows.map(r=>r.map(safe)), margin:{left:40,right:40}, theme:"plain",
    styles:{font:"helvetica",fontSize:9,cellPadding:5,textColor:[24,20,21],lineColor:[225,219,220],lineWidth:{bottom:0.6}},
    headStyles:{fillColor:[24,20,21],textColor:[255,255,255],fontStyle:"bold",fontSize:8.5}, columnStyles:cs });
  footer(doc, `${(S.settings||{}).companyName||"SNP Wholesale LLC"} · ${(S.settings||{}).companyEmail||""}`);
  return doc.output("blob");
}

async function withBusy(btn, fn){ const t=btn&&btn.textContent; if(btn){ btn.disabled=true; btn.textContent="Working…"; } try{ return await fn(); } catch(e){ SNP.fail(e); } finally{ if(btn){ btn.disabled=false; btn.textContent=t; } } }
async function downloadPDF(kind, it, btn){ await withBusy(btn, async()=>{ SNP.saveBlob(fileName(kind,it.data), await documentPDF(kind,it)); toast("PDF downloaded."); }); }

const digits = s => String(s||"").replace(/[^\d]/g,"");
async function share(kind, it, btn){
  await withBusy(btn, async()=>{
    const d=it.data, p=partyOf(kind,d), blob=await documentPDF(kind,it);
    const file=new File([blob], fileName(kind,d), {type:"application/pdf"});
    const t=SNP.sales.calc(d), what=`${KIND[kind].label} ${d.number||""}`.trim();
    const text=kind==="invoice"&&t.balance>0&&t.paid>=0 ? `${what} from ${(S.settings||{}).companyName||"SNP Wholesale"}: ${money(t.balance)} due${d.dueDate?" by "+fmtDate(d.dueDate):""}.` : `${what} from ${(S.settings||{}).companyName||"SNP Wholesale"}: ${money(t.total)}.`;
    if (navigator.canShare && navigator.canShare({files:[file]})){
      try{ await navigator.share({files:[file], title:what, text}); return; }
      catch(e){ if(e&&e.name==="AbortError") return; }
    }
    SNP.saveBlob(file.name, blob);
    const ph=digits(p.phone);
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(text+" (PDF attached separately)")}`,"_blank","noopener");
    toast("PDF downloaded. Attach it in WhatsApp; this device can't share files directly.");
  });
}

/* ---------- email ---------- */
function emailDefaults(kind, it, mode){
  const d=it.data, s=S.settings||{}, p=partyOf(kind,d), t=SNP.sales.calc(d);
  const first=(p.contactName||"").split(" ")[0]||"there", co=s.companyName||"SNP Wholesale", me=(S.me&&S.me.name)||co;
  const sign=`\n\nThank you,\n${me}\n${co}\n${[s.companyPhone,s.companyEmail].filter(Boolean).join(" · ")}`;
  if (mode==="reminder") return { subject:`Payment reminder: invoice ${d.number}`, message:`Hi ${first},\n\nThis is a friendly reminder that invoice ${d.number} for ${money(t.balance)} was due on ${fmtDate(d.dueDate)}. A copy is attached.\n\nIf you've already sent payment, please let us know the date and reference so we can match it.`+sign };
  if (kind==="quote") return { subject:`Quote ${d.number} from ${co}`, message:`Hi ${first},\n\nThanks for the opportunity. Your quote ${d.number} for ${money(t.total)} is attached${d.validUntil?" and is valid until "+fmtDate(d.validUntil):""}.\n\nReply to this email or send a PO referencing ${d.number} to confirm.`+sign };
  if (kind==="invoice") return { subject:`Invoice ${d.number} from ${co}`, message:`Hi ${first},\n\nPlease find invoice ${d.number} for ${money(t.balance||t.total)} attached${d.dueDate?", due "+fmtDate(d.dueDate):""}.${s.paymentInfo?"\n\nHow to pay:\n"+s.paymentInfo:""}`+sign };
  return { subject:`Purchase order ${d.number} from ${co}`, message:`Hi ${first},\n\nPlease find purchase order ${d.number} attached. Kindly confirm in writing within two business days, including the ship date.`+sign };
}
function openEmail(kind, it, mode="document", onSent){
  const d=it.data, p=partyOf(kind,d), def=emailDefaults(kind,it,mode);
  const known=[p.email, ...((p.contacts||[]).map(c=>c.email))].filter(Boolean);
  const dl=el("datalist",{id:"em-list"}, known.map(e=>el("option",{value:e})));
  const f=SNP.form([
    {key:"to",label:"To",type:"email",full:true,placeholder:"customer@example.com"},
    {key:"cc",label:"Cc (optional)",full:true},
    {key:"subject",label:"Subject",full:true},
    {key:"message",label:"Message",type:"textarea",rows:9},
    {key:"copyMe",label:"Send me a copy",type:"checkbox"}], {to:known[0]||"",subject:def.subject,message:def.message,copyMe:true});
  f.querySelector('[data-key="to"]').setAttribute("list","em-list");
  const err=el("div",{class:"err",role:"alert"});
  const send=el("button",{class:"btn primary",type:"button"}, mode==="reminder"?"Send reminder":"Send with PDF");
  const prev=(d.emails||[]).slice(-3).reverse();
  const m=SNP.modal(mode==="reminder"?`Payment reminder · ${d.number}`:`Email ${KIND[kind].label.toLowerCase()} ${d.number||""}`,
    el("div",{class:"stack"}, dl, f,
      el("div",{class:"attach-chip"}, el("span",{class:"lbl"},"Attached"), fileName(kind,d)),
      prev.length?el("div",{class:"muted small"},"Sent before: ", prev.map(e=>`${fmtDate((e.at||"").slice(0,10))} to ${e.to}${e.kind==="reminder"?" (reminder)":""}`).join("; ")):null,
      err, el("div",{class:"row-actions"}, send)), {size:"sm"});
  send.onclick=async()=>{
    err.textContent=""; const v=SNP.readForm(f);
    if (!v.to.trim()){ err.textContent="Enter the customer's email address."; return; }
    send.disabled=true; send.textContent="Sending…";
    try{
      const blob=await documentPDF(kind,it);
      const b64=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(",")[1]); r.onerror=rej; r.readAsDataURL(blob); });
      const r=await SNP.api("send",{method:"POST",body:{itemId:it.id,to:v.to,cc:v.cc,subject:v.subject,message:v.message,copyMe:v.copyMe,kind:mode,filename:fileName(kind,d),pdf:b64}});
      if (r.item) SNP.putItem(r.item);
      SNP.closePanel(m); toast(r.note||`Sent to ${v.to}.`); SNP.load(); onSent&&onSent(r.item);
    } catch(e){ err.textContent=e.message||"That didn't send."; send.disabled=false; send.textContent=mode==="reminder"?"Send reminder":"Send with PDF"; }
  };
}

/* ---------- live exchange rate (same public source the website's converter uses) ---------- */
let fx=null;
async function rate(cur){
  if (cur==="USD") return 1;
  if (!fx || Date.now()-fx.at>3600e3){ const r=await fetch("https://open.er-api.com/v6/latest/USD"); const j=await r.json(); if(j.result!=="success") throw new Error("rate"); fx={at:Date.now(),rates:j.rates,date:j.time_last_update_utc}; }
  if (!fx.rates[cur]) throw new Error("rate");
  return fx.rates[cur];
}

SNP.docs = { documentPDF, tablePDF, downloadPDF, share, openEmail, rate, fmtCur, CUR_NAMES, fileName, libs };
})();
