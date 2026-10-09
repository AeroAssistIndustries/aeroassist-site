/* Field sales map: customers and leads on OpenStreetMap, colored by account health; near-me list; check-ins that log a visit. */
(() => {
"use strict";
const { S, el, items, item, fmtDate, money0, nameOf, today } = SNP;
const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
const MF = { tab:"map", customers:true, leads:true, health:"", mine:false, near:null };
const COLORS = {"Healthy":"#15703A","Due to reorder":"#C77700","Overdue":"#C8102E","At risk":"#7A0E1F","No orders":"#6B6466","Prospect":"#1E4FC2","Inactive":"#9A9395",lead:"#7B3FC4"};
let map=null, layer=null, mapNode=null, fitKey="";

const miles = (a,b) => { const R=3958.8, r=x=>x*Math.PI/180, dLat=r(b.lat-a.lat), dLng=r(b.lng-a.lng);
  const h=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
const distLabel = m => m<0.1?`${Math.round(m*5280)} ft`:m<10?`${m.toFixed(1)} mi`:`${Math.round(m)} mi`;
const addrOf = (type,d) => type==="lead"?(d.location||""):[String(d.address||"").replace(/\n/g,", "),d.state,d.country].filter(Boolean).join(", ");
const directions = p => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

/* OpenStreetMap's free geocoder: one lookup per second, only for records that have an address and no pin yet. */
async function geocode(q){
  const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,{headers:{"Accept":"application/json"}});
  if (!r.ok) throw new Error("geocode");
  const j=await r.json(); return j&&j[0]?{lat:Number(j[0].lat),lng:Number(j[0].lon)}:null;
}
async function locate(type, it, btn){
  const q=type==="lead"?it.data.location:[it.data.address&&it.data.address.replace(/\n/g,", "),it.data.state,it.data.country].filter(Boolean).join(", ");
  if (!q) return SNP.toast("Add an address first.");
  if (btn) btn.disabled=true;
  try{ const p=await geocode(q); if(!p) { SNP.toast("Couldn't find that address on the map. Check the spelling."); return false; }
    await SNP.saveItem(type,it.id,Object.assign({},it.data,{lat:p.lat,lng:p.lng})); SNP.toast("Placed on the map."); SNP.refresh(true); return true; }
  catch(e){ SNP.toast("The map lookup isn't reachable right now. Try again later."); return false; }
  finally{ if(btn) btn.disabled=false; }
}
function here(){ return new Promise((res,rej)=>{ if(!navigator.geolocation) return rej(new Error("none"));
  navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy}),rej,{enableHighAccuracy:true,timeout:12000,maximumAge:60000}); }); }

/* Check in at a customer or lead: logs a Visit with where you were. */
function checkIn(type, it){
  const d=it.data, name=type==="lead"?(d.company||d.name):d.name;
  const status=el("p",{class:"muted small"},"Getting your location…");
  const note=el("textarea",{rows:3,placeholder:"Who you saw, what they need, next step","aria-label":"Visit notes",autofocus:true});
  const ok=el("button",{class:"btn primary",type:"button"},"Check in");
  let pos=null;
  const m=SNP.modal(`Check in: ${name}`, el("div",{class:"stack"}, status, el("div",{class:"field"}, el("label",{},"Notes"), note), el("div",{class:"row-actions"},ok)), {size:"sm"});
  here().then(p=>{ pos=p; const acct=d.lat&&d.lng?{lat:d.lat,lng:d.lng}:null;
    status.textContent=acct?`You're ${distLabel(miles(p,acct))} from ${name}.`:"Location found. This account has no map pin yet; your spot will be saved with the visit.";
    status.className=acct&&miles(p,acct)>0.5?"warn-t small":"muted small"; })
    .catch(()=>{ status.textContent="Location isn't available (permission off or no signal). You can still log the visit."; });
  ok.onclick=async()=>{ ok.disabled=true;
    const acct=d.lat&&d.lng?{lat:d.lat,lng:d.lng}:null, dist=pos&&acct?miles(pos,acct):null;
    try{ await SNP.saveItem("interaction",null,Object.assign({kind:"Visit",status:"Done",date:today(),time:new Date().toTimeString().slice(0,5),ownerId:S.me&&S.me.id,
        subject:`Visit: ${name}`,summary:note.value.trim()||`Checked in at ${name}.`,location:dist!=null?`${distLabel(dist)} from the account`:pos?"Location recorded":"No location"},
        type==="lead"?{leadId:it.id}:{customerId:it.id}, pos?{lat:pos.lat,lng:pos.lng}:{}));
      SNP.closePanel(m); SNP.toast("Checked in."); SNP.refresh(true); }
    catch(e){ SNP.fail(e); ok.disabled=false; } };
}

function points(){
  const pts=[], me=S.me&&S.me.id;
  if (MF.customers&&SNP.can("customer","rw")) items("customer").forEach(c=>{ if(!(c.data.lat&&c.data.lng)) return; const h=SNP.health.of(c.id);
    if (MF.health&&(!h||h.status!==MF.health)) return; if (MF.mine&&c.data.ownerId!==me) return;
    pts.push({type:"customer",it:c,lat:c.data.lat,lng:c.data.lng,name:c.data.name,color:COLORS[h?h.status:"No orders"],h}); });
  if (MF.leads&&SNP.can("lead")&&!MF.health) items("lead").forEach(l=>{ if(!(l.data.lat&&l.data.lng)||!SNP.leads.OPEN.includes(l.data.status)) return; if(MF.mine&&l.data.ownerId&&l.data.ownerId!==me) return;
    pts.push({type:"lead",it:l,lat:l.data.lat,lng:l.data.lng,name:l.data.company||l.data.name,color:COLORS.lead}); });
  return pts;
}
function popup(p){
  const d=p.it.data, box=el("div",{class:"map-pop"},
    el("strong",{},p.name), el("div",{class:"muted small"}, p.type==="lead"?`Lead · ${d.status}`:`${p.h?p.h.status:""}${p.h&&p.h.last?" · last order "+fmtDate(p.h.last):""}`),
    el("div",{class:"small"}, addrOf(p.type,d)),
    el("div",{class:"row-actions"},
      el("a",{class:"btn small",href:p.type==="lead"?"#leads":"#customers/"+p.it.id,onclick:()=>{ if(p.type==="lead") setTimeout(()=>SNP.leads.open(p.it.id),60); }},"Open"),
      el("a",{class:"btn small",href:directions(p),target:"_blank",rel:"noopener"},"Directions"),
      el("button",{class:"btn small primary",type:"button",onclick:()=>checkIn(p.type,p.it)},"Check in")));
  return box;
}
async function drawMap(container, focusId){
  try{ SNP.loadCSS(LEAFLET+"leaflet.min.css"); await SNP.loadScript(LEAFLET+"leaflet.min.js"); }
  catch(e){ container.replaceChildren(el("div",{class:"empty"}, el("b",{},"The map didn't load"), "Check your connection. The list below still works.")); return; }
  const L=window.L;
  if (!mapNode){ mapNode=el("div",{class:"map-canvas"}); map=L.map(mapNode,{scrollWheelZoom:true}); L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map); layer=L.layerGroup().addTo(map); }
  container.replaceChildren(mapNode);
  layer.clearLayers();
  const pts=points(), bounds=[];
  const key=JSON.stringify([MF.customers,MF.leads,MF.health,MF.mine,!!MF.near,focusId,pts.length]), refit=key!==fitKey; fitKey=key; // keep the user's pan and zoom on background refreshes
  pts.forEach(p=>{ const mk=L.circleMarker([p.lat,p.lng],{radius:p.type==="lead"?7:9,color:"#fff",weight:2,fillColor:p.color,fillOpacity:.95}); mk.bindPopup(()=>popup(p)); mk.addTo(layer); bounds.push([p.lat,p.lng]); if(refit&&focusId&&p.type==="customer"&&p.it.id===focusId) setTimeout(()=>{ map.setView([p.lat,p.lng],14); mk.openPopup(); },80); });
  if (MF.near) { L.circleMarker([MF.near.lat,MF.near.lng],{radius:7,color:"#fff",weight:3,fillColor:"#1E4FC2",fillOpacity:1}).bindTooltip("You").addTo(layer); bounds.push([MF.near.lat,MF.near.lng]); }
  setTimeout(()=>{ map.invalidateSize(); if(refit&&!focusId){ if(bounds.length>1) map.fitBounds(bounds,{padding:[30,30],maxZoom:12}); else if(bounds.length) map.setView(bounds[0],11); else map.setView([33.45,-112.07],6); } },60);
}

async function findMissing(btn){
  const todo=[...(SNP.can("customer","rw")?items("customer").filter(c=>!(c.data.lat&&c.data.lng)&&(c.data.address||c.data.state||c.data.country)).map(c=>["customer",c]):[]),
    ...(SNP.can("lead","rw")?items("lead").filter(l=>!(l.data.lat&&l.data.lng)&&l.data.location&&SNP.leads.OPEN.includes(l.data.status)).map(l=>["lead",l]):[])];
  if (!todo.length) return SNP.toast("Everything with an address is already on the map.");
  btn.disabled=true; let ok=0, miss=0;
  for (const [i,[type,it]] of todo.entries()){
    btn.textContent=`Placing ${i+1} of ${todo.length}…`;
    try{ const p=await geocode(addrOf(type,it.data)); if(p){ await SNP.saveItem(type,it.id,Object.assign({},item(type,it.id).data,{lat:p.lat,lng:p.lng})); ok++; } else miss++; }
    catch(e){ miss++; if(i===0){ SNP.toast("The map lookup isn't reachable right now. Try again later."); break; } }
    await new Promise(r=>setTimeout(r,1100));
  }
  btn.disabled=false; SNP.toast(`Placed ${ok} on the map${miss?`; ${miss} address${miss===1?"":"es"} couldn't be found`:""}.`); SNP.refresh(true);
}

function nearList(){
  if (!MF.near) return null;
  const list=points().map(p=>Object.assign(p,{dist:miles(MF.near,p)})).sort((a,b)=>a.dist-b.dist).slice(0,12);
  return el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"Closest to you"), el("button",{class:"btn small ghost",type:"button",onclick:()=>{ MF.near=null; SNP.refresh(true); }},"Clear")),
    list.length?el("ul",{class:"attn near"}, list.map(p=>el("li",{}, el("span",{}, el("i",{class:"dot",style:`background:${p.color}`}), el("a",{href:p.type==="lead"?"#leads":"#customers/"+p.it.id}, p.name), el("span",{class:"muted small"}, " · "+distLabel(p.dist))),
      el("span",{class:"row-actions"}, el("a",{class:"btn small",href:directions(p),target:"_blank",rel:"noopener"},"Go"), el("button",{class:"btn small primary",type:"button",onclick:()=>checkIn(p.type,p.it)},"Check in"))))):el("p",{class:"muted small"},"No accounts with map pins yet."));
}
function visits(){
  const me=S.me&&S.me.id;
  const list=items("interaction").filter(a=>a.data.kind==="Visit"&&(!MF.mine||(a.data.ownerId||a.createdBy)===me)).sort((a,b)=>(b.data.date+(b.data.time||"")).localeCompare(a.data.date+(a.data.time||"")));
  const week=list.filter(a=>a.data.date>=SNP.addDays(today(),-6)).length;
  return el("div",{}, el("div",{class:"kpis"}, SNP.kpi(String(week),"Visits in the last 7 days"), SNP.kpi(String(new Set(list.filter(a=>a.data.date>=SNP.addDays(today(),-29)).map(a=>a.data.customerId||("l"+a.data.leadId))).size),"Accounts visited, 30 days")),
    SNP.table({rows:list,onRow:a=>SNP.activities.edit(a.id),empty:"No visits yet. Use Check in when you're at a customer.",columns:[
      {label:"When",value:a=>SNP.activities.whenLabel(a)},{label:"Account",value:a=>a.data.customerId?SNP.customerName(a.data.customerId):a.data.leadId&&item("lead",a.data.leadId)?"Lead: "+(item("lead",a.data.leadId).data.company||item("lead",a.data.leadId).data.name):"—"},
      {label:"Who",value:a=>nameOf(a.data.ownerId||a.createdBy)},{label:"Where",value:a=>el("span",{class:/^[0-9.]+ mi/.test(a.data.location||"")&&parseFloat(a.data.location)>0.5?"warn-t":""},a.data.location||"—")},
      {label:"Notes",value:a=>(a.data.summary||"").slice(0,80)}]}));
}

function render(main, arg){
  const focus=arg?Number(arg):0;
  const missing=items("customer").filter(c=>!(c.data.lat&&c.data.lng)&&(c.data.address||c.data.state||c.data.country)).length+(SNP.can("lead")?items("lead").filter(l=>!(l.data.lat&&l.data.lng)&&l.data.location&&SNP.leads.OPEN.includes(l.data.status)).length:0);
  const findBtn=el("button",{class:"btn ghost",type:"button",onclick:e=>findMissing(e.currentTarget)},`Place ${missing} on the map`);
  const nearBtn=el("button",{class:"btn primary",type:"button"},"Near me");
  nearBtn.onclick=async()=>{ nearBtn.disabled=true; nearBtn.textContent="Finding you…"; try{ MF.near=await here(); SNP.refresh(true); }catch(e){ SNP.toast("Location isn't available. Allow location for this site and try again."); nearBtn.disabled=false; nearBtn.textContent="Near me"; } };
  const tabs=SNP.subtabs([["map","Map"],["visits","Visits"]],MF.tab,v=>{MF.tab=v;SNP.refresh(true);});
  const filters=SNP.toolbar(
    el("label",{class:"chk"}, el("input",{type:"checkbox",checked:MF.customers||null,onchange:e=>{MF.customers=e.target.checked;SNP.refresh(true);}}),"Customers"),
    SNP.can("lead")?el("label",{class:"chk"}, el("input",{type:"checkbox",checked:MF.leads||null,onchange:e=>{MF.leads=e.target.checked;SNP.refresh(true);}}),"Open leads"):null,
    SNP.selectEl([["","Any health"],...SNP.health.NAMES.map(h=>[h,h])],MF.health,v=>{MF.health=v;SNP.refresh(true);},"Health"),
    el("label",{class:"chk"}, el("input",{type:"checkbox",checked:MF.mine||null,onchange:e=>{MF.mine=e.target.checked;SNP.refresh(true);}}),"Only mine"));
  const legend=el("div",{class:"legend map-legend"}, Object.entries(COLORS).filter(([k])=>k!=="Inactive").map(([k,c])=>el("span",{}, el("i",{style:`background:${c}`}), k==="lead"?"Lead":k)));
  main.append(SNP.pageHead("Map", "Customers and leads by location. Tap a pin for directions or to check in.", missing?findBtn:null, nearBtn), tabs);
  if (MF.tab==="visits"){ main.append(filters, visits()); return; }
  const canvas=el("div",{class:"map-wrap"}, el("div",{class:"empty"},"Loading the map…"));
  main.append(filters, legend, nearList(), canvas,
    el("p",{class:"muted small"}, `${points().length} on the map${missing?` · ${missing} with an address but no pin yet`:""}. Addresses are looked up with OpenStreetMap.`));
  drawMap(canvas, focus);
}

SNP.map = { locate, checkIn, miles };
SNP.module({ id:"map", label:"Map", group:"Sales", visible:()=>SNP.can("customer","rw"), render });
})();
