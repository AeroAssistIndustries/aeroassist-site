/* Contacts: the people at each customer. Tags, custom fields, opt-outs, quick call/email/WhatsApp, activity history. */
(() => {
"use strict";
const { S, el, items, item, fmtDate, nameOf, badge, today } = SNP;
const F = { q:"", status:"", health:"", tag:"", ownerId:"", division:"", region:"", industry:"", noOrderDays:0, hasEmail:false, tagMode:"any", segment:"", more:false, optedOut:false };
const SEL = new Set();
const digits = s => String(s||"").replace(/[^\d]/g,"");

const fields = (customerId) => [
  {key:"name",label:"Full name",full:true},
  {key:"title",label:"Job title",placeholder:"Buyer, owner, accounts payable…"},
  {key:"customerId",label:"Company",type:"customer"},
  {key:"email",label:"Email",type:"email"},
  {key:"phone",label:"Office phone"},
  {key:"mobile",label:"Mobile / WhatsApp"},
  {key:"language",label:"Prefers",type:"select",options:["English","Spanish","Portuguese"]},
  {key:"ownerId",label:"Contact owner",type:"user"},
  {key:"tags",label:"Tags",type:"tags",full:true},
  {key:"primary",label:"Main contact for this company",type:"checkbox"},
  {key:"optOut",label:"Opted out of marketing emails",type:"checkbox"},
  ...SNP.customFieldDefs("contact"),
  {key:"notes",label:"Notes",type:"textarea",rows:3}];

function quick(c){
  const d=c.data, ph=digits(d.mobile||d.phone);
  return el("div",{class:"lead-quick"},
    d.phone?el("a",{class:"btn small",href:"tel:"+d.phone},"Call"):null,
    d.mobile&&d.mobile!==d.phone?el("a",{class:"btn small",href:"tel:"+d.mobile},"Call mobile"):null,
    ph?el("a",{class:"btn small",href:"https://wa.me/"+ph,target:"_blank",rel:"noopener"},"WhatsApp"):null,
    d.email&&S.perms.sendEmail&&SNP.activities?el("button",{class:"btn small",type:"button",onclick:()=>SNP.activities.compose({to:d.email,name:d.name,company:SNP.customerName(d.customerId),customerId:d.customerId,contactId:c.id})},"Email"):d.email?el("a",{class:"btn small",href:"mailto:"+d.email},"Email"):null,
    SNP.activities&&d.customerId?el("button",{class:"btn small ghost",type:"button",onclick:()=>SNP.activities.edit(null,{customerId:d.customerId,contactId:c.id,status:"Planned",kind:"Call",subject:"Call "+d.name.split(" ")[0]})},"Schedule"):null);
}
/* Small card used on the customer page. */
function card(c){
  const d=c.data;
  return el("div",{class:"contact",tabindex:"0",onclick:e=>{ if(!e.target.closest("a,button")) open(c.id); },onkeydown:e=>{ if(e.key==="Enter"&&e.target===e.currentTarget) open(c.id); }},
    el("div",{style:"min-width:0"}, el("strong",{},d.name), d.primary?el("span",{class:"mini-tag"},"Main"):null, d.optOut?el("span",{class:"mini-tag warn"},"No marketing"):null,
      d.title?el("span",{class:"muted"}," · "+d.title):null,
      el("div",{class:"muted small"}, [d.email,d.mobile||d.phone].filter(Boolean).join(" · ")||"No email or phone yet")),
    quick(c));
}
function edit(id=null, defaults={}){
  return SNP.editRecord({type:"contact", id, title:id?"Edit contact":"New contact", eyebrow:"Contacts", fields:fields(defaults.customerId), defaults:Object.assign({ownerId:S.me&&S.me.id,language:"English"},defaults),
    onSaved:async saved=>{ if(saved.data.primary&&saved.data.customerId){ // one main contact per company
        for (const o of items("contact").filter(x=>x.id!==saved.id&&x.data.customerId===saved.data.customerId&&x.data.primary)) { try{ await SNP.saveItem("contact",o.id,Object.assign({},o.data,{primary:false})); }catch(e){} }
        SNP.refresh(true); } }});
}
function open(id){
  const c=item("contact",id); if(!c) return;
  const d=c.data;
  const body=el("div",{class:"stack"},
    quick(c),
    el("div",{class:"info-grid"},
      ...[["Company",d.customerId?el("a",{href:"#customers/"+d.customerId,onclick:()=>SNP.closeAll()},SNP.customerName(d.customerId)):"—"],["Title",d.title],["Email",d.email],["Office",d.phone],["Mobile",d.mobile],["Prefers",d.language],["Owner",nameOf(d.ownerId)],
        ...((S.settings&&S.settings.customFields)||[]).filter(f=>f.entity==="contact").map(f=>[f.label,(d.custom||{})[f.key]])]
        .filter(([,v])=>v).map(([l,v])=>el("div",{class:"info"}, el("div",{class:"lbl"},l), el("div",{},v)))),
    (d.tags||[]).length?el("div",{class:"tags"}, d.tags.map(t=>el("span",{class:"tag"},t))):null,
    d.optOut?el("p",{class:"scope-banner"},"Opted out of marketing emails. You can still email them directly about orders."):null,
    d.notes?el("p",{class:"pre"},d.notes):null,
    el("div",{class:"row-actions"}, SNP.can("contact","rw")?el("button",{class:"btn",type:"button",onclick:()=>{ SNP.closePanel(dr); edit(c.id); }},"Edit"):null,
      S.perms.deleteAny?SNP.confirmBtn("Delete","Delete this contact?",async()=>{ await SNP.deleteItem("contact",c.id); SNP.closePanel(dr); SNP.toast("Deleted."); SNP.refresh(true); }):null),
    SNP.activities&&d.customerId?SNP.activities.panel({customerId:d.customerId,contactId:c.id,compact:true}):null);
  const dr=SNP.drawer(d.name, "Contact"+(d.customerId?" · "+SNP.customerName(d.customerId):""), body, {wide:true});
}

function render(main){
  const listBox=el("div"), bulkBox=el("div");
  const draw=()=>{
    const f=SNP.crm.filtersOf(F);
    const rows=items("contact").filter(c=>SNP.segments.match("contact",f,c)&&(!F.optedOut||c.data.optOut)).sort((a,b)=>(a.data.name||"").localeCompare(b.data.name||""));
    [...SEL].forEach(id=>{ if(!item("contact",id)) SEL.delete(id); });
    bulkBox.replaceChildren(SEL.size&&SNP.bulk?SNP.bulk.bar("contact",[...SEL],()=>{ SEL.clear(); SNP.refresh(true); },()=>{ SEL.clear(); draw(); }):"");
    listBox.replaceChildren(el("p",{class:"muted small list-count"}, `${rows.length} of ${items("contact").length} contacts · ${SNP.segments.describe(f)}`),
      SNP.table({rows,onRow:c=>open(c.id),empty:items("contact").length?"No contacts match.":"No contacts yet. Add people from a customer's page, or import a spreadsheet.",columns:[
      SNP.crm.selectColumn(SEL,rows,draw),
      {label:"Name",value:c=>el("div",{}, el("strong",{},c.data.name), c.data.primary?el("span",{class:"mini-tag"},"Main"):null, c.data.title?el("div",{class:"muted small"},c.data.title):null)},
      {label:"Company",value:c=>c.data.customerId?el("a",{href:"#customers/"+c.data.customerId},SNP.customerName(c.data.customerId)):"—"},
      {label:"Email",value:c=>c.data.email?el("span",{class:c.data.optOut?"muted":""},c.data.email+(c.data.optOut?" (opted out)":"")):"—"},
      {label:"Phone",value:c=>c.data.mobile||c.data.phone||"—"},
      {label:"Tags",value:c=>(c.data.tags||[]).length?el("div",{class:"tags"},c.data.tags.slice(0,4).map(t=>el("span",{class:"tag"},t))):"—"},
      {label:"Owner",value:c=>nameOf(c.data.ownerId)||"—"}]}));
  };
  main.append(SNP.pageHead("Contacts", `${items("contact").length} people at ${new Set(items("contact").map(c=>c.data.customerId).filter(Boolean)).size} companies · ${items("contact").filter(c=>c.data.optOut).length} opted out of marketing`,
      SNP.imports?el("button",{class:"btn ghost",type:"button",onclick:()=>SNP.imports.open("contact")},"Import"):null,
      SNP.imports&&S.perms.deleteAny?el("button",{class:"btn ghost",type:"button",onclick:()=>SNP.imports.duplicates("contact")},"Find duplicates"):null,
      el("button",{class:"btn ghost",type:"button",onclick:exportCSV},"Export CSV"),
      el("button",{class:"btn primary",type:"button",onclick:()=>edit()},"+ Contact")),
    SNP.crm.filterBar("contact",F,draw),
    el("label",{class:"chk",style:"margin:-6px 0 8px"}, el("input",{type:"checkbox",checked:F.optedOut||null,onchange:e=>{F.optedOut=e.target.checked;draw();}}),"Only people who opted out"),
    bulkBox, listBox);
  draw();
}
function exportCSV(){
  const cf=((S.settings&&S.settings.customFields)||[]).filter(f=>f.entity==="contact");
  const rows=items("contact").filter(c=>SNP.segments.match("contact",SNP.crm.filtersOf(F),c));
  SNP.csv("SNP contacts "+today()+".csv",["Name","Title","Company","Email","Office phone","Mobile","Prefers","Tags","Main contact","Opted out","Owner",...cf.map(f=>f.label)],
    rows.map(c=>{ const d=c.data; return [d.name,d.title,SNP.customerName(d.customerId),d.email,d.phone,d.mobile,d.language,(d.tags||[]).join("; "),d.primary?"Yes":"",d.optOut?"Yes":"",nameOf(d.ownerId),...cf.map(f=>(d.custom||{})[f.key]??"")]; }));
}

SNP.contacts = { open, edit, card, quick };
SNP.module({ id:"contacts", label:"Contacts", group:"Sales", visible:()=>SNP.can("contact","rw"), render });
})();
