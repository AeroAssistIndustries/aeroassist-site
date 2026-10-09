/* Suppliers and purchase orders. Owners only. POs reuse the sales document editor. */
(() => {
"use strict";
const { el, items, money, money0, fmtDate, badge, today } = SNP;
const DIVS = ["Oil","Phones & electronics","Commercial supply"];
const SF = { q:"" }, PF = { q:"", status:"open" };
const OPEN = ["Draft","Sent","Confirmed","Received"];

function editSupplier(id=null, defaults={}, onSaved){
  return SNP.editRecord({type:"supplier", id, title:id?"Supplier":"New supplier", eyebrow:"Suppliers", defaults, onSaved,
    fields:[{key:"name",label:"Company name",full:true},{key:"divisions",label:"Supplies",type:"multi",options:DIVS},
      {key:"contactName",label:"Contact"},{key:"phone",label:"Phone"},{key:"email",label:"Email",type:"email",full:true},
      {key:"address",label:"Address",type:"textarea",rows:2},{key:"terms",label:"Payment terms",placeholder:"e.g. Prepaid wire, Net 30"},
      {key:"w9",label:"W-9 on file",type:"checkbox"},{key:"coi",label:"Insurance certificate on file",type:"checkbox"},
      {key:"notes",label:"Notes",type:"textarea"}],
    extra:it=>{ const pos=items("po").filter(p=>p.data.supplierId===it.id).sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||""));
      return el("div",{}, el("div",{class:"panel-h"}, el("div",{class:"sec-h"},"Purchase orders"), el("button",{class:"btn small",type:"button",onclick:()=>{ SNP.closeAll(); SNP.sales.newDoc("po",{supplierId:it.id}); }},"+ PO")),
        SNP.table({rows:pos,onRow:p=>{ SNP.closeAll(); SNP.sales.openDoc("po",p.id); },empty:"No purchase orders yet.",columns:[{label:"Number",value:p=>el("span",{class:"mono"},p.data.number)},{label:"Date",value:p=>fmtDate(p.data.date)},{label:"Status",value:p=>badge(p.data.status)},{label:"Total",cls:"num",value:p=>money(p.data.total)}]})); }});
}

function renderSuppliers(main){
  const box=el("div");
  const draw=()=>{ const q=SF.q.trim().toLowerCase();
    const rows=items("supplier").filter(s=>!q||`${s.data.name} ${s.data.contactName} ${s.data.email}`.toLowerCase().includes(q)).sort((a,b)=>(a.data.name||"").localeCompare(b.data.name||""));
    box.replaceChildren(SNP.table({rows,onRow:s=>editSupplier(s.id),empty:items("supplier").length?"No suppliers match.":"No suppliers yet.",columns:[
      {label:"Supplier",value:s=>el("div",{}, el("strong",{},s.data.name), s.data.contactName?el("div",{class:"muted small"},s.data.contactName):null)},
      {label:"Supplies",value:s=>(s.data.divisions||[]).join(", ")||"—"},{label:"Contact",value:s=>[s.data.phone,s.data.email].filter(Boolean).join(" · ")||"—"},
      {label:"W-9",value:s=>s.data.w9?badge("On file","s-onfile"):badge("Missing","s-missing")},{label:"Insurance",value:s=>s.data.coi?badge("On file","s-onfile"):badge("Missing","s-missing")},
      {label:"Open POs",cls:"num",value:s=>{ const v=items("po").filter(p=>p.data.supplierId===s.id&&OPEN.includes(p.data.status)); return v.length?`${v.length} · ${money0(v.reduce((a,p)=>a+(p.data.total||0),0))}`:"—"; }}]}));
  };
  const q=SNP.search("Search suppliers",e=>{SF.q=e.target.value;draw();}); q.value=SF.q;
  main.append(SNP.pageHead("Suppliers","Who SNP buys from, with their paperwork status.", el("button",{class:"btn primary",type:"button",onclick:()=>editSupplier()},"+ Supplier")), SNP.toolbar(q), box);
  draw();
}

function renderPOs(main){
  const box=el("div");
  const draw=()=>{ const q=PF.q.trim().toLowerCase();
    const rows=items("po").filter(p=>(PF.status==="open"?OPEN.includes(p.data.status):!PF.status||p.data.status===PF.status)&&(!q||`${p.data.number} ${SNP.supplierName(p.data.supplierId)}`.toLowerCase().includes(q)))
      .sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||"")||b.id-a.id);
    box.replaceChildren(SNP.table({rows,onRow:p=>SNP.sales.openDoc("po",p.id),empty:items("po").length?"No purchase orders match.":"No purchase orders yet.",columns:[
      {label:"Number",value:p=>el("span",{class:"mono"},p.data.number)},{label:"Supplier",value:p=>SNP.supplierName(p.data.supplierId)},
      {label:"Date",value:p=>fmtDate(p.data.date)},{label:"Expected",value:p=>{ const late=p.data.expectedDate&&p.data.expectedDate<today()&&["Sent","Confirmed"].includes(p.data.status); return p.data.expectedDate?el("span",{class:late?"bad-t":""},(late?"Late · ":"")+fmtDate(p.data.expectedDate)):"—"; }},
      {label:"Status",value:p=>badge(p.data.status)},{label:"Total",cls:"num",value:p=>money(p.data.total)}]}));
  };
  const open=items("po").filter(p=>OPEN.includes(p.data.status));
  const toPay=items("po").filter(p=>p.data.status==="Received");
  const q=SNP.search("Search purchase orders",e=>{PF.q=e.target.value;draw();}); q.value=PF.q;
  main.append(SNP.pageHead("Purchase orders","Orders SNP places with suppliers, from draft to received and paid.", el("button",{class:"btn primary",type:"button",onclick:()=>SNP.sales.newDoc("po")},"+ Purchase order")),
    el("div",{class:"kpis"}, SNP.kpi(String(open.length),"Open POs"), SNP.kpi(money0(open.reduce((s,p)=>s+(p.data.total||0),0)),"Open value"),
      SNP.kpi(String(items("po").filter(p=>p.data.expectedDate&&p.data.expectedDate<today()&&["Sent","Confirmed"].includes(p.data.status)).length),"Late deliveries"),
      SNP.kpi(money0(toPay.reduce((s,p)=>s+(p.data.total||0),0)),"Received, not yet paid", toPay.length?"warn":"")),
    SNP.toolbar(q, SNP.selectEl([["open","Open"],["","All"],...["Draft","Sent","Confirmed","Received","Paid","Cancelled"].map(s=>[s,s])],PF.status,v=>{PF.status=v;draw();},"Status")), box);
  draw();
}

SNP.buy = { editSupplier };
SNP.module({ id:"suppliers", label:"Suppliers", group:"Operations", visible:()=>SNP.can("supplier","rw"), render:renderSuppliers });
SNP.module({ id:"pos", label:"Purchase orders", group:"Operations", visible:()=>SNP.can("po","rw"), render:renderPOs });
})();
