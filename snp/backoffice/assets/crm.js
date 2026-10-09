/* CRM core: companies (customers), account health, saved segments, deal stage helpers.
   The server has the same health and segment rules in includes/crm.php; keep them in step. */
(() => {
"use strict";
const { S, el, items, item, money, money0, fmtDate, nameOf, badge, today } = SNP;
const DIVS = ["Oil","Phones & electronics","Commercial supply"];
const HEALTH = ["Healthy","Due to reorder","Overdue","At risk","No orders","Prospect","Inactive"];
const HCLASS = {"Healthy":"h-good","Due to reorder":"h-due","Overdue":"h-over","At risk":"h-risk","No orders":"h-none","Prospect":"h-none","Inactive":"h-none"};
const CF = { q:"", status:"", health:"", tag:"", ownerId:"", division:"", region:"", industry:"", noOrderDays:0, hasEmail:false, tagMode:"any", segment:"", more:false };
const SEL = new Set();

/* ---------- deals: pipelines and stages from Settings ---------- */
const pipelines = () => (S.settings&&S.settings.pipelines&&S.settings.pipelines.length) ? S.settings.pipelines
  : [{key:"oil",name:"Sales",stages:[["Lead",10],["Contacted",20],["Quoted",50],["Negotiating",70]].map(([name,prob])=>({name,prob,type:"open"})).concat([{name:"Won",prob:100,type:"won"},{name:"Lost",prob:0,type:"lost"}])}];
const pipelineOf = d => pipelines().find(p=>p.key===d.data.pipeline)||pipelines()[0];
const stageOf = d => { const p=pipelineOf(d); return p.stages.find(s=>s.name===d.data.stage)||{name:d.data.stage,prob:0,type:["Won","Lost"].includes(d.data.stage)?d.data.stage.toLowerCase():"open"}; };
const deals = {
  pipelines, pipelineOf, stageOf,
  isOpen: d => stageOf(d).type==="open", isWon: d => stageOf(d).type==="won", isLost: d => stageOf(d).type==="lost",
  prob: d => d.data.probability!==""&&d.data.probability!=null ? Number(d.data.probability) : stageOf(d).prob,
  weighted: d => (d.data.value||0)*deals.prob(d)/100,
  closedAt: d => (d.data.closedAt||d.updatedAt||"").slice(0,10),
  daysInStage: d => { const h=d.data.history||[]; const at=h.length?h[h.length-1].at:d.createdAt; return at?Math.max(0,Math.floor((Date.now()-new Date(at))/864e5)):0; },
  /* Which pipeline a new deal for this division belongs in. */
  pipelineFor: division => (pipelines().find(p=>division&&p.name.toLowerCase()===division.toLowerCase())||pipelines()[0]).key,
};

/* ---------- account health (same rules as snp_rec_health_all) ---------- */
const dayNum = ymd => { const [y,m,d]=ymd.split("-").map(Number); return Date.UTC(y,m-1,d)/864e5; };
const daysBetween = (a,b) => Math.round(dayNum(b)-dayNum(a));
const addDaysUTC = (ymd,n) => new Date((dayNum(ymd)+n)*864e5).toISOString().slice(0,10);
let hCache=null, hAt=0;
function healthAll(){
  if (hCache && Date.now()-hAt<400) return hCache;
  const def=Math.max(7,Number(S.settings&&S.settings.defaultReorderDays)||30), td=today();
  const dates=new Map(), m=new Map(), mon=id=>m.get(id)||(m.set(id,{balance:0,overdue:0,rev12:0}),m.get(id));
  const addDate=(id,d)=>{ if(!dates.has(id)) dates.set(id,new Set()); dates.get(id).add(d); };
  items("invoice").forEach(x=>{ const d=x.data; if(!d.customerId||!d.date||d.status!=="Sent") return; addDate(d.customerId,d.date);
    const r=mon(d.customerId), bal=Math.max(0,Number(d.balance)||0); r.balance+=bal; if(bal>0&&d.dueDate&&d.dueDate<td) r.overdue+=bal; if(daysBetween(d.date,td)<=365) r.rev12+=Number(d.subtotal)||0; });
  items("oil_order").forEach(x=>{ const d=x.data; if(d.customerId&&d.date&&d.rewardStatus!=="Cancelled") addDate(d.customerId,d.date); });
  const out=new Map();
  items("customer").forEach(c=>{
    const list=[...(dates.get(c.id)||[])].sort(), n=list.length, gaps=[];
    for (let i=Math.max(1,n-12);i<n;i++) gaps.push(daysBetween(list[i-1],list[i]));
    let interval;
    if (c.data.reorderDays) interval=c.data.reorderDays;
    else if (n>=3){ gaps.sort((a,b)=>a-b); const k=gaps.length; interval=k%2?gaps[(k-1)/2]:Math.round((gaps[k/2-1]+gaps[k/2])/2); }
    else interval=def;
    interval=Math.max(1,interval);
    const last=n?list[n-1]:"", since=n?daysBetween(last,td):null, st=c.data.status||"Lead";
    const h = st==="Inactive"?"Inactive" : !n?(st==="Lead"?"Prospect":"No orders") : since<=interval?"Healthy" : since<=interval*1.5?"Due to reorder" : since<=interval*2.5?"Overdue" : "At risk";
    const r=m.get(c.id)||{balance:0,overdue:0,rev12:0}, limit=Number(c.data.creditLimit)||0, over=limit>0&&r.balance>limit;
    let score=null;
    if (["Healthy","Due to reorder","Overdue","At risk"].includes(h)) score=Math.max(0,100-{"Healthy":0,"Due to reorder":15,"Overdue":40,"At risk":70}[h]-(r.overdue>0?20:0)-(over?15:0));
    out.set(c.id,{status:h,orders:n,last,daysSince:since,interval,next:n?addDaysUTC(last,interval):"",balance:SNP.round2(r.balance),overdue:SNP.round2(r.overdue),rev12:SNP.round2(r.rev12),overCredit:over,creditLimit:limit,score,dates:list});
  });
  hCache=out; hAt=Date.now(); return out;
}
const health = { all:healthAll, of:id=>healthAll().get(Number(id))||null, NAMES:HEALTH,
  badge:(h,short)=>h?el("span",{class:"hbadge "+HCLASS[h.status],title:h.score!=null?`Health score ${h.score}/100`:""}, h.status+(short||h.score==null?"":" · "+h.score)):"—" };

/* ---------- saved segments (same rules as snp_rec_segment_match) ---------- */
function blankFilters(){ return {q:"",status:"",tags:[],tagMode:"any",division:"",region:"",industry:"",ownerId:0,health:"",noOrderDays:0,hasEmail:false}; }
function match(entity, f, it){
  const d=it.data, co=entity==="contact"?((item("customer",d.customerId)||{}).data||{}):d, cid=entity==="contact"?d.customerId:it.id;
  const h=health.of(cid), tags=[...(d.tags||[]),...(entity==="contact"?(co.tags||[]):[])].map(t=>t.toLowerCase());
  if (f.q){ const hay=(entity==="contact"?[d.name,d.title,d.email,d.phone,d.mobile,co.name]:[d.name,d.contactName,d.email,d.phone,d.state,d.country,d.industry]).concat(tags).join(" ").toLowerCase();
    if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every(w=>hay.includes(w))) return false; }
  if (f.status && co.status!==f.status) return false;
  if (f.tags&&f.tags.length){ const want=[...new Set(f.tags.map(t=>t.toLowerCase()))], hit=want.filter(t=>tags.includes(t)); if(f.tagMode==="all"?hit.length<want.length:!hit.length) return false; }
  if (f.division && !(co.divisions||[]).includes(f.division)) return false;
  if (f.region && ![co.state,co.country].some(x=>(x||"").toLowerCase()===f.region.toLowerCase())) return false;
  if (f.industry && (co.industry||"").toLowerCase()!==f.industry.toLowerCase()) return false;
  if (f.ownerId){ const owner=entity==="contact"&&d.ownerId?d.ownerId:co.ownerId; if(Number(owner)!==Number(f.ownerId)) return false; }
  if (f.health && (!h||h.status!==f.health)) return false;
  if (f.noOrderDays && h && h.daysSince!=null && h.daysSince<f.noOrderDays) return false;
  if (f.hasEmail){ let has=!!d.email; if(entity==="customer"&&!has) has=items("contact").some(c=>c.data.customerId===it.id&&c.data.email); if(!has) return false; }
  return true;
}
const segments = { match, blankFilters, list:entity=>items("segment").filter(s=>s.data.entity===entity).sort((a,b)=>a.data.name.localeCompare(b.data.name)),
  run:(seg)=>items(seg.data.entity).filter(it=>match(seg.data.entity,Object.assign(blankFilters(),seg.data.filters),it)) };
function describe(f){
  const b=[]; if(f.q) b.push(`“${f.q}”`); if(f.status) b.push(f.status); if(f.health) b.push(f.health); if(f.tags&&f.tags.length) b.push((f.tagMode==="all"?"all of ":"")+"tags "+f.tags.join(", "));
  if(f.division) b.push(f.division); if(f.region) b.push(f.region); if(f.industry) b.push(f.industry); if(f.ownerId) b.push("owner "+nameOf(f.ownerId)); if(f.noOrderDays) b.push(`no order in ${f.noOrderDays}+ days`); if(f.hasEmail) b.push("has email");
  return b.join(" · ")||"Everyone";
}
segments.describe=describe;

/* Shared filter bar for customers and contacts. F is the page's filter state; draw() redraws the list. */
function filterBar(entity, F, draw){
  const segs=segments.list(entity);
  const segSel=SNP.selectEl([["","Saved segments…"],...segs.map(s=>[String(s.id),s.data.name])],F.segment,v=>{ F.segment=v; const s=item("segment",Number(v));
    if (s){ const f=Object.assign(blankFilters(),s.data.filters); Object.assign(F,{q:f.q,status:f.status,health:f.health,tag:f.tags[0]||"",tags:f.tags,tagMode:f.tagMode,division:f.division,region:f.region,industry:f.industry,ownerId:f.ownerId?String(f.ownerId):"",noOrderDays:f.noOrderDays,hasEmail:f.hasEmail,more:true}); }
    SNP.refresh(true); },"Saved segments");
  const q=SNP.search(entity==="contact"?"Search contacts":"Search customers",e=>{ F.q=e.target.value; draw(); }); q.value=F.q;
  const tags=SNP.allTags();
  const more=el("details",{class:"more-filters",open:F.more||null,ontoggle:e=>F.more=e.target.open}, el("summary",{},"More filters"),
    el("div",{class:"filters"},
      SNP.selectEl([["","Any division"],...DIVS.map(d=>[d,d])],F.division,v=>{F.division=v;draw();},"Division"),
      el("input",{type:"text",placeholder:"State or country",value:F.region,"aria-label":"State or country",oninput:e=>{F.region=e.target.value.trim();draw();}}),
      SNP.selectEl([["","Any industry"],...((S.settings&&S.settings.industries)||[]).map(x=>[x,x])],F.industry,v=>{F.industry=v;draw();},"Industry"),
      el("label",{class:"chk"},"No order in", el("input",{type:"number",min:"0",step:"15",value:F.noOrderDays||"",style:"width:72px",oninput:e=>{F.noOrderDays=Number(e.target.value)||0;draw();}}),"days"),
      el("label",{class:"chk"}, el("input",{type:"checkbox",checked:F.hasEmail||null,onchange:e=>{F.hasEmail=e.target.checked;draw();}}),"Has email")));
  const save=el("button",{class:"btn small ghost",type:"button",onclick:()=>saveSegment(entity,F)},"Save as segment");
  return el("div",{}, SNP.toolbar(q,
      SNP.selectEl([["","All statuses"],["Lead","Leads"],["Active","Active"],["Inactive","Inactive"]],F.status,v=>{F.status=v;draw();},"Status"),
      SNP.selectEl([["","Any health"],...HEALTH.map(h=>[h,h])],F.health,v=>{F.health=v;draw();},"Health"),
      SNP.selectEl([["","Any tag"],...tags.map(t=>[t,t])],F.tag,v=>{F.tag=v;F.tags=v?[v]:[];draw();},"Tag"),
      SNP.selectEl([["","Any owner"],...SNP.peopleWithAccess().map(p=>[String(p.id),p.name])],F.ownerId,v=>{F.ownerId=v;draw();},"Owner"),
      segSel, save), more);
}
function filtersOf(F){ return Object.assign(blankFilters(),{q:F.q,status:F.status,health:F.health,tags:F.tags&&F.tags.length?F.tags:(F.tag?[F.tag]:[]),tagMode:F.tagMode,division:F.division,region:F.region,industry:F.industry,ownerId:Number(F.ownerId)||0,noOrderDays:F.noOrderDays,hasEmail:F.hasEmail}); }
function saveSegment(entity, F){
  const f=filtersOf(F), n=items(entity).filter(it=>match(entity,f,it)).length;
  const name=el("input",{type:"text",placeholder:"e.g. Arizona oil shops due to reorder","aria-label":"Segment name",autofocus:true});
  const err=el("div",{class:"err",role:"alert"}), ok=el("button",{class:"btn primary",type:"button"},"Save segment");
  const m=SNP.modal("Save segment", el("div",{class:"stack"}, el("p",{class:"muted small"},`${describe(f)} · ${n} ${entity}${n===1?"":"s"} right now. Saved segments update on their own and can be used for email campaigns.`),
    el("div",{class:"field"}, el("label",{},"Name"), name), err, el("div",{class:"row-actions"},ok)), {size:"sm"});
  ok.onclick=async()=>{ if(!name.value.trim()){ err.textContent="Name the segment."; return; } ok.disabled=true;
    try{ const s=await SNP.saveItem("segment",null,{name:name.value.trim(),entity,filters:f}); F.segment=String(s.id); SNP.closePanel(m); SNP.toast("Segment saved."); SNP.refresh(true); }catch(e){ err.textContent=e.message; ok.disabled=false; } };
}

/* ---------- selection checkboxes for bulk actions ---------- */
function selectColumn(sel, rows, redraw){
  const all=el("input",{type:"checkbox","aria-label":"Select all",checked:rows.length&&rows.every(r=>sel.has(r.id))||null});
  all.onchange=()=>{ rows.forEach(r=>all.checked?sel.add(r.id):sel.delete(r.id)); redraw(); };
  return {label:all, cls:"selcol", value:r=>{ const c=el("input",{type:"checkbox","aria-label":"Select",checked:sel.has(r.id)||null}); c.onchange=()=>{ c.checked?sel.add(r.id):sel.delete(r.id); redraw(); }; return c; }};
}

/* ---------- customers ---------- */
const customerFields = () => [
  {section:"Company"},
  {key:"name",label:"Company name",full:true},
  {key:"status",label:"Status",type:"select",options:["Lead","Active","Inactive"]},
  {key:"ownerId",label:"Account owner",type:"user"},
  {key:"industry",label:"Type of business",type:"datalist",options:(S.settings&&S.settings.industries)||[]},
  {key:"website",label:"Website"},
  {key:"divisions",label:"Divisions",type:"multi",options:DIVS},
  {key:"tags",label:"Tags",type:"tags",full:true},
  {section:"Main phone and email"},
  {key:"contactName",label:"Main contact (people go under Contacts)"},
  {key:"phone",label:"Phone / WhatsApp"},
  {key:"email",label:"Email",type:"email",full:true},
  {key:"address",label:"Address",type:"textarea",rows:2},
  {key:"state",label:"State / province"},
  {key:"country",label:"Country"},
  {section:"Terms and reorders"},
  {key:"terms",label:"Payment terms",type:"select",options:["Prepaid","Net 15","Net 30"]},
  {key:"creditLimit",label:"Credit limit",type:"money"},
  {key:"reorderDays",label:"Reorders every (days)",type:"number",step:"1",hint:"Leave empty to learn it from their order history."},
  {key:"resaleCert",label:"Resale certificate on file",type:"checkbox"},
  {key:"resaleExpiry",label:"Certificate expires",type:"date"},
  {key:"source",label:"How they found us",full:true},
  ...SNP.customFieldDefs("customer").length?[{section:"More details"},...SNP.customFieldDefs("customer")]:[],
  {key:"notes",label:"Notes",type:"textarea"}];

function editCustomer(id=null, defaults={}, onSaved){
  return SNP.editRecord({type:"customer", id, title:id?"Edit customer":"New customer", eyebrow:"Customer", fields:customerFields(), wide:true,
    defaults:Object.assign({status:"Lead",terms:"Prepaid",ownerId:S.me&&S.me.id},defaults), onSaved:onSaved||(c=>{ if(!id) SNP.go("customers",c.id); }),
    onDeleted:()=>SNP.go("customers")});
}
const unpaidFor = id => items("invoice").filter(i=>i.data.customerId===id&&i.data.status==="Sent").reduce((s,i)=>s+Math.max(0,i.data.balance||0),0);
const openDealsFor = id => items("deal").filter(d=>d.data.customerId===id&&deals.isOpen(d));
const contactsOf = id => items("contact").filter(c=>c.data.customerId===id).sort((a,b)=>(b.data.primary?1:0)-(a.data.primary?1:0)||(a.data.name||"").localeCompare(b.data.name||""));
const lastTouch = id => { const a=items("interaction").filter(i=>i.data.customerId===id&&i.data.status!=="Planned"&&i.data.status!=="Canceled").map(i=>i.data.date).sort(); return a[a.length-1]||""; };

function renderCustomers(main, arg){
  if (arg) return renderCustomer(main, Number(arg));
  const listBox=el("div"), bulkBox=el("div");
  const draw=()=>{
    const f=filtersOf(CF);
    const rows=items("customer").filter(c=>match("customer",f,c)).sort((a,b)=>(a.data.name||"").localeCompare(b.data.name||""));
    [...SEL].forEach(id=>{ if(!item("customer",id)) SEL.delete(id); });
    bulkBox.replaceChildren(SEL.size&&SNP.bulk?SNP.bulk.bar("customer",[...SEL],()=>{ SEL.clear(); SNP.refresh(true); },()=>{ SEL.clear(); draw(); }):"");
    listBox.replaceChildren(el("p",{class:"muted small list-count"}, `${rows.length} of ${items("customer").length} customers · ${describe(f)}`),
      SNP.table({ rows, onRow:c=>SNP.go("customers",c.id),
      empty: items("customer").length?"No customers match.":"No customers yet. Add your first customer, or import a spreadsheet.",
      columns:[ selectColumn(SEL,rows,draw),
        {label:"Customer", value:c=>el("div",{}, el("strong",{},c.data.name), el("div",{class:"muted small"}, [c.data.industry,[c.data.state,c.data.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")),
          (c.data.tags||[]).length?el("div",{class:"tags"},(c.data.tags||[]).slice(0,4).map(t=>el("span",{class:"tag"},t))):null)},
        {label:"Status", value:c=>badge(c.data.status)},
        {label:"Health", value:c=>health.badge(health.of(c.id),true)},
        {label:"Last order", value:c=>{ const h=health.of(c.id); return h&&h.last?el("div",{}, fmtDate(h.last), el("div",{class:"muted small"},`${h.daysSince} d ago · every ~${h.interval} d`)):"—"; }},
        {label:"Sales 12 mo", cls:"num", value:c=>{ const h=health.of(c.id); return h&&h.rev12?money0(h.rev12):"—"; }},
        {label:"Unpaid", cls:"num", value:c=>{ const h=health.of(c.id); return h&&h.balance?el("span",{class:h.overdue?"bad-t":"warn-t"},money(h.balance)):"—"; }},
        {label:"Owner", value:c=>nameOf(c.data.ownerId)||"—"}]}));
  };
  const counts=s=>items("customer").filter(c=>c.data.status===s).length;
  main.append(SNP.pageHead("Customers", `${counts("Active")} active · ${counts("Lead")} leads · ${counts("Inactive")} inactive`,
      SNP.imports?el("button",{class:"btn ghost",type:"button",onclick:()=>SNP.imports.open("customer")},"Import"):null,
      SNP.imports&&S.perms.deleteAny?el("button",{class:"btn ghost",type:"button",onclick:()=>SNP.imports.duplicates("customer")},"Find duplicates"):null,
      el("button",{class:"btn ghost",type:"button",onclick:exportCustomers},"Export CSV"),
      el("button",{class:"btn primary",type:"button",onclick:()=>editCustomer()},"+ Customer")),
    filterBar("customer",CF,draw), bulkBox, listBox);
  draw();
}
function exportCustomers(){
  const cf=((S.settings&&S.settings.customFields)||[]).filter(f=>f.entity==="customer");
  const rows=items("customer").filter(c=>match("customer",filtersOf(CF),c));
  SNP.csv("SNP customers "+today()+".csv",["Name","Status","Type of business","Divisions","Tags","Main contact","Email","Phone","Address","State","Country","Website","Terms","Credit limit","Resale cert","Cert expires","Owner","Health","Last order","Sales 12 mo","Unpaid",...cf.map(f=>f.label)],
    rows.map(c=>{const d=c.data, h=health.of(c.id)||{}; return [d.name,d.status,d.industry,(d.divisions||[]).join("; "),(d.tags||[]).join("; "),d.contactName,d.email,d.phone,d.address,d.state,d.country,d.website,d.terms,d.creditLimit,d.resaleCert?"Yes":"No",d.resaleExpiry,nameOf(d.ownerId),h.status,h.last,h.rev12,h.balance,...cf.map(f=>(d.custom||{})[f.key]??"")];}));
}

/* ---------- one customer ---------- */
function salesByMonth(id){
  const t=new Date(), months=[...Array(12)].map((_,i)=>{ const d=new Date(t.getFullYear(),t.getMonth()-11+i,1); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); });
  const inv=items("invoice").filter(x=>x.data.customerId===id&&x.data.status==="Sent");
  const vals=months.map(m=>inv.filter(x=>(x.data.date||"").slice(0,7)===m).reduce((s,x)=>s+(x.data.subtotal||0),0));
  const max=Math.max(1,...vals);
  return el("div",{class:"spark",role:"img","aria-label":"Sales by month, last 12 months"}, months.map((m,i)=>el("span",{title:`${SNP.fmtMonth(m)}: ${money0(vals[i])}`}, el("i",{style:`height:${Math.round(vals[i]/max*100)}%`}))));
}
function renderCustomer(main, id){
  const c=item("customer",id);
  if (!c){ main.append(el("div",{class:"empty"}, el("b",{},"Customer not found"), "It may have been deleted or merged. ", el("a",{href:"#customers"},"Back to customers"))); return; }
  const d=c.data, h=health.of(id)||{}, td=today();
  const info=(label,val)=>val?el("div",{class:"info"}, el("div",{class:"lbl"},label), el("div",{}, val)):null;
  const certWarn = d.resaleCert && d.resaleExpiry && d.resaleExpiry < td;
  const people=contactsOf(id), primary=people.find(p=>p.data.email)||null;
  const head=el("div",{class:"page-head"},
    el("div",{style:"min-width:0"}, el("div",{class:"eyebrow"}, el("a",{href:"#customers"},"Customers")," / ", d.industry||""), el("h2",{class:"page-title"}, d.name),
      el("div",{class:"tags",style:"margin-top:6px"}, badge(d.status), health.badge(h), ...(d.divisions||[]).map(x=>el("span",{class:"tag div"},x)), ...(d.tags||[]).map(x=>el("span",{class:"tag"},x)))),
    el("div",{class:"row-actions"},
      el("button",{class:"btn",type:"button",onclick:()=>editCustomer(c.id)},"Edit"),
      SNP.activities&&(primary||d.email)&&S.perms.sendEmail?el("button",{class:"btn",type:"button",onclick:()=>SNP.activities.compose({to:primary?primary.data.email:d.email,name:primary?primary.data.name:d.contactName,company:d.name,customerId:c.id,contactId:primary?primary.id:0})},"Email"):null,
      SNP.activities?el("button",{class:"btn",type:"button",onclick:()=>SNP.activities.edit(null,{customerId:c.id,status:"Planned",kind:"Call"})},"Schedule"):null,
      el("button",{class:"btn",type:"button",onclick:()=>SNP.crm.editDeal(null,{customerId:c.id,division:(d.divisions||[])[0]||""})},"+ Deal"),
      el("button",{class:"btn",type:"button",onclick:()=>SNP.sales.newDoc("quote",{customerId:c.id})},"+ Quote"),
      el("button",{class:"btn primary",type:"button",onclick:()=>SNP.sales.newDoc("invoice",{customerId:c.id})},"+ Invoice")));
  const nextLbl = h.next ? (h.next<td?`was due ${fmtDate(h.next)}`:fmtDate(h.next)) : "—";
  const kpis=el("div",{class:"kpis"},
    SNP.kpi(money0(h.rev12||0),"Sales, last 12 months"),
    SNP.kpi(money(h.balance||0), h.creditLimit?`Unpaid · ${Math.round((h.balance||0)/h.creditLimit*100)}% of ${money0(h.creditLimit)} limit`:"Unpaid", h.overdue?"bad":h.overCredit?"warn":""),
    SNP.kpi(h.last?`${h.daysSince} d`:"—", h.last?`Since last order (${fmtDate(h.last)})`:"No orders yet"),
    SNP.kpi(nextLbl, h.orders?`Next order expected · every ~${h.interval} d`:"Next order", h.status==="Overdue"||h.status==="At risk"?"bad":h.status==="Due to reorder"?"warn":""),
    SNP.kpi(money0(openDealsFor(id).reduce((s,x)=>s+(x.data.value||0),0)),`Open deals · ${openDealsFor(id).length}`));

  const cf=(S.settings&&S.settings.customFields||[]).filter(f=>f.entity==="customer");
  const infoPanel=el("section",{class:"panel"}, el("h3",{},"Details"),
    el("div",{class:"info-grid"}, info("Main phone",d.phone?el("a",{href:"tel:"+d.phone},d.phone):""), info("Main email",d.email?el("a",{href:"mailto:"+d.email},d.email):""),
      info("Website",d.website?el("a",{href:/^https?:/.test(d.website)?d.website:"https://"+d.website,target:"_blank",rel:"noopener"},d.website):""),
      info("Address",d.address), info("Location",[d.state,d.country].filter(Boolean).join(", ")), info("Payment terms",d.terms),
      info("Resale certificate", d.resaleCert?el("span",{class:certWarn?"bad-t":""}, "On file"+(d.resaleExpiry?(certWarn?" · expired ":" · expires ")+fmtDate(d.resaleExpiry):"")):el("span",{class:"warn-t"},"Not on file")),
      info("Account owner",nameOf(d.ownerId)), info("Source",d.source),
      ...cf.map(f=>{ const v=(d.custom||{})[f.key]; return info(f.label, f.type==="checkbox"?(v?"Yes":""):f.type==="date"?fmtDate(v):v); })),
    d.notes?el("p",{class:"pre"}, d.notes):null);

  const contactPanel=el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},`Contacts · ${people.length}`),
      el("button",{class:"btn small",type:"button",onclick:()=>SNP.contacts.edit(null,{customerId:id,primary:!people.length,ownerId:d.ownerId||(S.me&&S.me.id)})},"+ Contact")),
    people.length?el("div",{class:"contacts"}, people.map(p=>SNP.contacts.card(p))):el("p",{class:"muted small"},"No contacts yet. Add the buyer, accounts payable and anyone else you deal with."));

  const healthPanel=el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"Account health"), health.badge(h)),
    h.score!=null?el("div",{class:"meter",title:`${h.score}/100`}, el("i",{class:HCLASS[h.status],style:`width:${h.score}%`})):null,
    salesByMonth(id),
    el("ul",{class:"attn"},
      el("li",{}, el("span",{},"Orders on record"), el("span",{class:"muted small"}, String(h.orders||0))),
      el("li",{}, el("span",{},"Usual time between orders"), el("span",{class:"muted small"}, h.orders?`${h.interval} days${d.reorderDays?" (set by hand)":h.orders>=3?" (from their history)":" (default until 3 orders)"}`:"—")),
      el("li",{}, el("span",{},"Credit"), el("span",{class:"muted small"+(h.overCredit?" bad-t":"")}, h.creditLimit?`${money(h.balance||0)} of ${money0(h.creditLimit)}${h.overCredit?" · over limit":""}`:"No limit set")),
      h.overdue?el("li",{class:"bad"}, el("span",{},"Overdue balance"), el("span",{class:"muted small"}, money(h.overdue))):null),
    ["Due to reorder","Overdue","At risk"].includes(h.status)&&SNP.activities?el("div",{class:"row-actions"},
      el("button",{class:"btn small primary",type:"button",onclick:()=>SNP.activities.edit(null,{customerId:id,contactId:primary?primary.id:0,status:"Planned",kind:"Call",subject:"Reorder check-in",date:td})},"Schedule a reorder call")):null);

  const located=d.lat&&d.lng;
  const locPanel=el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"Location & visits"), located?el("a",{class:"small",href:"#map/"+id},"On the map →"):null),
    el("p",{class:"small"}, [d.address&&d.address.replace(/\n/g,", "),d.state,d.country].filter(Boolean).join(", ")||el("span",{class:"muted"},"No address yet.")),
    el("div",{class:"row-actions"},
      located||d.address?el("a",{class:"btn small",href:located?`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([d.name,d.address,d.state,d.country].filter(Boolean).join(", "))}`,target:"_blank",rel:"noopener"},"Directions"):null,
      SNP.map&&!located&&d.address?el("button",{class:"btn small ghost",type:"button",onclick:e=>SNP.map.locate("customer",c,e.currentTarget)},"Find on map"):null,
      SNP.map?el("button",{class:"btn small primary",type:"button",onclick:()=>SNP.map.checkIn("customer",c)},"Check in here"):null),
    (()=>{ const v=items("interaction").filter(i=>i.data.customerId===id&&i.data.kind==="Visit").sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||"")).slice(0,3);
      return v.length?el("ul",{class:"attn"}, v.map(x=>el("li",{}, el("span",{}, x.data.subject||"Visit"), el("span",{class:"muted small"}, `${fmtDate(x.data.date)} · ${nameOf(x.data.ownerId||x.createdBy)}`)))):null; })());

  const portalPanel=SNP.portalAdmin?SNP.portalAdmin.panel(c):null;
  const tasks=items("task").filter(t=>t.data.relatedType==="customer"&&t.data.relatedId===id&&t.data.status==="Open");
  const taskPanel=el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"Open tasks"), el("button",{class:"btn small",type:"button",onclick:()=>SNP.newTask({relatedType:"customer",relatedId:id,relatedLabel:d.name})},"+ Task")),
    tasks.length?el("ul",{class:"tasks"}, tasks.map(SNP.tasks.taskRow)):el("p",{class:"muted small"},"No open tasks."));

  const rel=(title, rows, cols, onRow, emptyText, action)=>el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},title), action||null), SNP.table({rows,columns:cols,onRow,empty:emptyText}));
  const dls=items("deal").filter(x=>x.data.customerId===id).sort((a,b)=>b.id-a.id);
  const quotes=items("quote").filter(x=>x.data.customerId===id);
  const orders=items("oil_order").filter(x=>x.data.customerId===id).sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||""));

  main.append(head, kpis,
    el("div",{class:"two-col"},
      el("div",{class:"col"}, SNP.activities?SNP.activities.panel({customerId:id, contacts:people}):null),
      el("div",{class:"col"}, contactPanel, healthPanel, infoPanel, locPanel, portalPanel, taskPanel)),
    rel("Deals", dls, [{label:"Deal",value:x=>x.data.title},{label:"Pipeline",value:x=>pipelineOf(x).name},{label:"Stage",value:x=>badge(x.data.stage,"s-"+stageOf(x).type)},{label:"Value",cls:"num",value:x=>money0(x.data.value)},{label:"Next step",value:x=>x.data.nextStep?(x.data.nextStep+(x.data.nextStepDate?" · "+fmtDate(x.data.nextStepDate):"")):"—"}], x=>SNP.crm.editDeal(x.id), "No deals yet."),
    rel("Quotes & invoices", [...quotes, ...items("invoice").filter(x=>x.data.customerId===id)].sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||"")),
      [{label:"Number",value:x=>el("span",{class:"mono"},x.data.number)},{label:"Type",value:x=>x.type==="quote"?"Quote":"Invoice"},{label:"Date",value:x=>fmtDate(x.data.date)},
       {label:"Status",value:x=>el("span",{}, badge(SNP.sales.statusOf(x)), x.data.response?el("span",{class:"mini-tag"},"via portal"):null)},{label:"Total",cls:"num",value:x=>money(x.data.total)},{label:"Balance",cls:"num",value:x=>x.type==="invoice"&&x.data.status!=="Void"?money(x.data.balance):"—"}],
      x=>SNP.sales.openDoc(x.type,x.id), "No quotes or invoices yet."),
    orders.length?rel("Oil orders", orders, [{label:"Date",value:x=>fmtDate(x.data.date)},{label:"Order",value:x=>x.data.description||"—"},{label:"Amount",cls:"num",value:x=>money(x.data.amount)},{label:"Reward",cls:"num",value:x=>money(x.data.rewardAmount)},{label:"Status",value:x=>badge(x.data.rewardStatus)}], x=>SNP.oil.editOrder(x.id)):null);
}

SNP.deals = deals;
SNP.health = health;
SNP.segments = segments;
SNP.crm = { editCustomer, unpaidFor, openDealsFor, contactsOf, lastTouch, filterBar, filtersOf, selectColumn, saveSegment, HEALTH,
  get OPEN_STAGES(){ return [...new Set(pipelines().flatMap(p=>p.stages.filter(s=>s.type==="open").map(s=>s.name)))]; },
  interactionsFor: id => items("interaction").filter(i=>i.data.customerId===id) };
SNP.module({ id:"customers", label:"Customers", group:"Sales", visible:()=>SNP.can("customer","rw"), render:renderCustomers,
  badge:()=>{ let n=0; healthAll().forEach((h,id)=>{ const c=item("customer",id); if(h.status==="Due to reorder"&&c&&c.data.ownerId===(S.me&&S.me.id)) n++; }); return n; } });
})();
