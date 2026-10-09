/* Leads: website quote requests and account applications (imported automatically) plus leads added by hand. */
(() => {
"use strict";
const { S, el, items, item, fmtDate, fmtWhen, nameOf, badge, today } = SNP;
const STATUSES = ["New","Contacted","Qualified","Converted","Not a fit"];
const OPEN = ["New","Contacted","Qualified"];
const SOURCES = ["Website quote form","Website account form","Phone","WhatsApp","Email","Referral","Trade show","Other"];
const LF = { tab:"open", q:"", mine:false };
const digits = s => String(s||"").replace(/[^\d]/g,"");
const received = l => (l.data.receivedAt||l.createdAt||"");
const ageLabel = iso => { if(!iso) return ""; const h=(Date.now()-new Date(iso))/36e5; if(h<1) return "just now"; if(h<24) return `${Math.floor(h)} h ago`; const d=Math.floor(h/24); return d===1?"yesterday":`${d} days ago`; };

const fields = () => [
  {key:"name",label:"Contact name"},{key:"company",label:"Company"},
  {key:"email",label:"Email",type:"email"},{key:"phone",label:"Phone / WhatsApp"},
  {key:"location",label:"Location"},{key:"division",label:"Interested in"},
  {key:"source",label:"Source",type:"select",options:SOURCES},{key:"status",label:"Status",type:"select",options:STATUSES},
  {key:"ownerId",label:"Assigned to",type:"user"},{key:"nextStepDate",label:"Follow up on",type:"date"},
  {key:"tags",label:"Tags",type:"tags",full:true},
  {key:"message",label:"What they need",type:"textarea",rows:4}];

function open(id){
  const l=item("lead",id); if(!l) return;
  const d=l.data, ph=digits(d.phone);
  const quick=el("div",{class:"lead-quick"},
    d.phone?el("a",{class:"btn small",href:"tel:"+d.phone},"Call "+d.phone):null,
    d.email&&S.perms.sendEmail&&SNP.activities?el("button",{class:"btn small",type:"button",onclick:()=>SNP.activities.compose({to:d.email,name:d.name,company:d.company,leadId:l.id,subject:"Your inquiry with "+((S.settings&&S.settings.companyName)||"SNP Wholesale")})},"Email")
      :d.email?el("a",{class:"btn small",href:"mailto:"+d.email+"?subject="+encodeURIComponent("Your inquiry with SNP Wholesale")},"Email"):null,
    SNP.map&&(d.lat&&d.lng||d.location)?el("button",{class:"btn small ghost",type:"button",onclick:()=>SNP.map.checkIn("lead",l)},"Check in"):null,
    ph?el("a",{class:"btn small",href:"https://wa.me/"+ph,target:"_blank",rel:"noopener"},"WhatsApp"):null,
    d.email||d.phone?el("button",{class:"btn small ghost",type:"button",onclick:()=>SNP.copyText([d.name,d.company,d.email,d.phone].filter(Boolean).join("\n"))},"Copy details"):null);
  SNP.editRecord({type:"lead", id, title:d.company||d.name, eyebrow:`Lead · ${d.source} · received ${fmtWhen(received(l))}`, fields:fields(),
    after:(drawer,it)=>{
      const body=drawer.querySelector(".d-body .stack");
      body.prepend(quick);
      if (it && it.data.status!=="Converted" && SNP.can("customer","rw")) body.insertBefore(el("div",{class:"convert-box"},
        el("div",{}, el("strong",{},"Ready to do business?"), el("div",{class:"muted small"},"Creates the customer with these details, marks the lead converted, and logs it on the customer's timeline.")),
        el("div",{class:"row-actions"},
          el("button",{class:"btn primary",type:"button",onclick:()=>convert(it,false)},"Convert to customer"),
          el("button",{class:"btn",type:"button",onclick:()=>convert(it,true)},"Convert + start a deal"))), body.children[1]);
      if (it && it.data.customerId) body.insertBefore(el("p",{}, "Converted to ", el("a",{href:"#customers/"+it.data.customerId,onclick:()=>SNP.closeAll()}, SNP.customerName(it.data.customerId)), "."), body.children[1]);
      if (it && it.data.details) body.append(el("details",{class:"add-box"}, el("summary",{},"Original website submission"), el("pre",{class:"pre small"}, it.data.details)));
      if (it && SNP.activities) body.append(SNP.activities.panel({leadId:it.id,compact:true}));
      if (it && it.data.status==="New" && SNP.can("lead","rw")) SNP.saveItem("lead",it.id,Object.assign({},it.data,{ownerId:it.data.ownerId||(S.me&&S.me.id)})).catch(()=>{});
    }});
}
async function convert(l, withDeal){
  const d=l.data;
  try{
    const isLatam = /mexico|peru|colombia|chile|argentina|brazil|guatemala|honduras|dominican|ecuador|bolivia|panama|costa rica|venezuela|uruguay|paraguay|el salvador|nicaragua/i.test(d.location||"");
    const usState = (d.location||"").match(/\b([A-Z]{2})\b/);
    const divs=["Oil","Phones & electronics","Commercial supply"].filter(x=>(d.division||"").toLowerCase().includes(x.split(" ")[0].toLowerCase()));
    const c=await SNP.saveItem("customer",null,{ name:d.company||d.name, status:d.source==="Website account form"?"Active":"Lead", contactName:d.name, email:d.email, phone:d.phone,
      state:usState&&!isLatam?usState[1]:"", country:isLatam?(d.location||"").split(",").pop().trim():"", divisions:divs, ownerId:d.ownerId||(S.me&&S.me.id), source:d.source,
      notes:d.message?`From ${d.source.toLowerCase()} (${fmtDate(received(l).slice(0,10))}):\n${d.message}`:"", terms:"Prepaid", tags:d.tags||[], lat:d.lat||"", lng:d.lng||"" });
    if (d.name||d.email) await SNP.saveItem("contact",null,{name:d.name||d.email,email:d.email,phone:d.phone,customerId:c.id,primary:true,ownerId:d.ownerId||(S.me&&S.me.id)});
    // activity logged against the lead moves to the new customer
    for (const a of items("interaction").filter(x=>x.data.leadId===l.id)) { try{ await SNP.saveItem("interaction",a.id,Object.assign({},a.data,{customerId:c.id})); }catch(e){} }
    await SNP.saveItem("interaction",null,{customerId:c.id,date:today(),kind:"Note",summary:`Converted from a ${d.source.toLowerCase()} lead.`+(d.message?"\n\n"+d.message:"")});
    await SNP.saveItem("lead",l.id,Object.assign({},d,{status:"Converted",customerId:c.id}));
    SNP.closeAll(); SNP.toast(`${c.data.name} added as a customer.`);
    SNP.go("customers",c.id);
    if (withDeal) setTimeout(()=>SNP.crm.editDeal(null,{customerId:c.id,title:(d.division?d.division+" for ":"")+c.data.name,division:["Oil","Phones & electronics","Commercial supply"].find(x=>(d.division||"").toLowerCase().includes(x.split(" ")[0].toLowerCase()))||"",nextStep:"Send quote",nextStepDate:SNP.addDays(today(),2)}),150);
  } catch(e){ SNP.fail(e); }
}
function newLead(){ SNP.editRecord({type:"lead", title:"New lead", eyebrow:"Leads", fields:fields(), defaults:{source:"Phone",status:"New",ownerId:S.me&&S.me.id}}); }

function render(main){
  const all=items("lead");
  const counts={}; STATUSES.forEach(s=>counts[s]=all.filter(l=>l.data.status===s).length);
  const tabs=SNP.subtabs([["open",`Open (${all.filter(l=>OPEN.includes(l.data.status)).length})`],["New",`New (${counts.New})`],["Converted",`Converted (${counts.Converted})`],["Not a fit",`Not a fit (${counts["Not a fit"]})`],["all","All"]],LF.tab,t=>{LF.tab=t;SNP.refresh(true);});
  const box=el("div");
  const draw=()=>{
    const q=LF.q.trim().toLowerCase();
    const rows=all.filter(l=>(LF.tab==="all"||(LF.tab==="open"?OPEN.includes(l.data.status):l.data.status===LF.tab))&&(!LF.mine||l.data.ownerId===(S.me&&S.me.id))
      &&(!q||`${l.data.name} ${l.data.company} ${l.data.email} ${l.data.phone} ${l.data.location} ${l.data.message}`.toLowerCase().includes(q)))
      .sort((a,b)=>received(b).localeCompare(received(a)));
    box.replaceChildren(SNP.table({rows,onRow:l=>open(l.id),empty:all.length?"No leads match.":"No leads yet. Quote requests and account applications from snpwholesale.com show up here automatically.",columns:[
      {label:"Received",value:l=>el("div",{}, fmtDate(received(l).slice(0,10)), el("div",{class:"muted small"},ageLabel(received(l))))},
      {label:"Lead",value:l=>el("div",{}, el("strong",{},l.data.company||l.data.name), l.data.company?el("div",{class:"muted small"},l.data.name):null)},
      {label:"Interested in",value:l=>l.data.division||"—"},
      {label:"Location",value:l=>l.data.location||"—"},
      {label:"Source",value:l=>l.data.source.replace("Website ","Web ")},
      {label:"Status",value:l=>badge(l.data.status, l.data.status==="New"?"s-missing":SNP.slug(l.data.status))},
      {label:"Assigned",value:l=>nameOf(l.data.ownerId)||el("span",{class:"warn-t"},"Unassigned")},
      {label:"Follow up",value:l=>l.data.nextStepDate?el("span",{class:l.data.nextStepDate<today()&&OPEN.includes(l.data.status)?"bad-t":""},fmtDate(l.data.nextStepDate)):"—"}]}));
  };
  const q=SNP.search("Search leads",e=>{LF.q=e.target.value;draw();}); q.value=LF.q;
  const mine=el("input",{type:"checkbox",id:"lead-mine",checked:LF.mine||null}); mine.onchange=()=>{LF.mine=mine.checked;draw();};
  const week=all.filter(l=>received(l)>=new Date(Date.now()-7*864e5).toISOString()).length;
  const conv=all.filter(l=>l.data.status==="Converted").length, closed=conv+counts["Not a fit"];
  main.append(SNP.pageHead("Leads","Website quote requests and account applications arrive here on their own. Call, convert, or close them out.",
      el("button",{class:"btn primary",type:"button",onclick:newLead},"+ Lead")),
    el("div",{class:"kpis"}, SNP.kpi(String(counts.New),"New, not yet contacted",counts.New?"warn":""), SNP.kpi(String(week),"Received in the last 7 days"),
      SNP.kpi(String(all.filter(l=>OPEN.includes(l.data.status)&&!l.data.ownerId).length),"Unassigned"), SNP.kpi(closed?Math.round(conv/closed*100)+"%":"—","Converted (of closed leads)")),
    tabs, SNP.toolbar(q, el("label",{class:"chk",for:"lead-mine"}, mine, "Only mine")), box);
  draw();
}

SNP.leads = { open, newLead, OPEN };
SNP.module({ id:"leads", label:"Leads", group:"Sales", visible:()=>SNP.can("lead"), render, badge:()=>items("lead").filter(l=>l.data.status==="New").length });
})();
