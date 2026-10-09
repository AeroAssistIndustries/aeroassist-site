/* Products & price list. Owners edit; sales see prices (never costs). Products fill in quote, invoice and PO lines. */
(() => {
"use strict";
const { S, el, items, item, money, badge } = SNP;
const DIVS = ["Oil","Phones & electronics","Commercial supply"];
const PF = { q:"", div:"", inactive:false };

function edit(id=null, defaults={}){
  const costs=!!S.perms.seeCosts;
  return SNP.editRecord({type:"product", id, title:id?"Product":"New product", eyebrow:"Products", defaults:Object.assign({active:true},defaults),
    fields:[{key:"name",label:"Product",full:true,placeholder:"e.g. Mobil 1 5W-30, case of 6 qt"},
      {key:"sku",label:"SKU / part number"},{key:"division",label:"Division",type:"select",options:[["","—"],...DIVS.map(d=>[d,d])]},
      {key:"category",label:"Category",placeholder:"e.g. Motor oil, iPhone, Chlorine"},{key:"unit",label:"Sold per",placeholder:"case, pallet, unit, pail"},
      {key:"grade",label:"Condition / grade",placeholder:"New, Grade A, Grade B…"},{key:"stock",label:"On hand",type:"number",step:"any"},
      ...(costs?[{key:"cost",label:"Cost (what SNP pays)",type:"money"}]:[]),
      {key:"price",label:"Price (to customers)",type:"money"},
      {key:"active",label:"Active (shown when building quotes and on the price list)",type:"checkbox"},
      {key:"notes",label:"Notes",type:"textarea",rows:2}],
    after:(d,it)=>{ if(!costs) return; const f=d.querySelector(".fields"), out=el("div",{class:"margin-live full muted small"});
      const upd=()=>{ const c=Number(f.querySelector('[data-key="cost"]').value)||0, p=Number(f.querySelector('[data-key="price"]').value)||0;
        out.textContent = p ? `Margin ${money(p-c)} per ${f.querySelector('[data-key="unit"]').value||"unit"} · ${Math.round((p-c)/p*1000)/10}%` : ""; };
      f.addEventListener("input",upd); f.append(out); upd(); }});
}

const visible = () => items("product").filter(p=>(PF.inactive||p.data.active!==false)&&(!PF.div||p.data.division===PF.div)
  &&(!PF.q||`${p.data.name} ${p.data.sku} ${p.data.category} ${p.data.grade}`.toLowerCase().includes(PF.q.toLowerCase())))
  .sort((a,b)=>(a.data.division||"").localeCompare(b.data.division||"")||(a.data.name||"").localeCompare(b.data.name||""));

async function priceListPDF(btn){
  const rows=items("product").filter(p=>p.data.active!==false&&(!PF.div||p.data.division===PF.div)).sort((a,b)=>(a.data.division||"").localeCompare(b.data.division||"")||a.data.name.localeCompare(b.data.name));
  if (!rows.length) return SNP.toast("No active products to put on the price list.");
  btn.disabled=true;
  try{ const blob=await SNP.docs.tablePDF("PRICE LIST", PF.div||"All divisions", ["Product","SKU","Condition","Sold per","Price (USD)"],
      rows.map(p=>[p.data.name, p.data.sku||"", p.data.grade||"", p.data.unit||"", money(p.data.price)]), {right:[4]});
    SNP.saveBlob(`SNP price list${PF.div?" - "+PF.div:""} ${SNP.today()}.pdf`, blob); SNP.toast("Price list downloaded."); }
  catch(e){ SNP.fail(e); } finally{ btn.disabled=false; }
}

function render(main){
  const costs=!!S.perms.seeCosts, rw=SNP.can("product","rw");
  const box=el("div");
  const draw=()=>{ const rows=visible();
    box.replaceChildren(SNP.table({rows,onRow:p=>edit(p.id),empty:items("product").length?"No products match.":"No products yet. Add what you sell, and they'll appear when you build quotes, invoices and POs.",columns:[
      {label:"Product",value:p=>el("div",{}, el("strong",{},p.data.name), p.data.sku?el("div",{class:"muted small mono"},p.data.sku):null)},
      {label:"Division",value:p=>p.data.division||"—"},{label:"Condition",value:p=>p.data.grade||"—"},{label:"Sold per",value:p=>p.data.unit||"—"},
      ...(costs?[{label:"Cost",cls:"num",value:p=>money(p.data.cost)}]:[]),
      {label:"Price",cls:"num",value:p=>el("strong",{},money(p.data.price))},
      ...(costs?[{label:"Margin",cls:"num",value:p=>{ const m=p.data.price?Math.round((p.data.price-p.data.cost)/p.data.price*1000)/10:0; return el("span",{class:m<0?"bad-t":m<8?"warn-t":""},`${m}%`); }}]:[]),
      {label:"On hand",cls:"num",value:p=>p.data.stock?String(p.data.stock):"—"},
      {label:"",value:p=>p.data.active===false?badge("Inactive","s-inactive"):""}]}));
  };
  const q=SNP.search("Search products",e=>{PF.q=e.target.value;draw();}); q.value=PF.q;
  const inact=el("input",{type:"checkbox",id:"prod-inact",checked:PF.inactive||null}); inact.onchange=()=>{PF.inactive=inact.checked;draw();};
  const pdfBtn=el("button",{class:"btn",type:"button"},"Price list PDF"); pdfBtn.onclick=()=>priceListPDF(pdfBtn);
  const act=items("product").filter(p=>p.data.active!==false);
  main.append(SNP.pageHead("Products & price list", rw?"What SNP sells, with cost and price. Pick these when building quotes, invoices and purchase orders.":"Current prices. Pick these when building quotes and invoices.",
      pdfBtn, el("button",{class:"btn ghost",type:"button",onclick:exportCSV},"Export CSV"),
      rw?el("button",{class:"btn primary",type:"button",onclick:()=>edit()},"+ Product"):null),
    el("div",{class:"kpis"}, SNP.kpi(String(act.length),"Active products"), ...DIVS.map(d=>SNP.kpi(String(act.filter(p=>p.data.division===d).length),d)),
      ...(costs&&act.length?[SNP.kpi(Math.round(act.reduce((s,p)=>s+(p.data.price?(p.data.price-p.data.cost)/p.data.price:0),0)/act.length*1000)/10+"%","Average margin")]:[])),
    SNP.toolbar(q, SNP.selectEl([["","All divisions"],...DIVS.map(d=>[d,d])],PF.div,v=>{PF.div=v;draw();},"Division"), el("label",{class:"chk",for:"prod-inact"}, inact, "Show inactive")), box);
  draw();
}
function exportCSV(){
  const costs=!!S.perms.seeCosts;
  SNP.csv("SNP products "+SNP.today()+".csv",["Product","SKU","Division","Category","Condition","Sold per",...(costs?["Cost"]:[]),"Price","On hand","Active"],
    items("product").map(p=>{const d=p.data; return [d.name,d.sku,d.division,d.category,d.grade,d.unit,...(costs?[d.cost]:[]),d.price,d.stock,d.active===false?"No":"Yes"];}));
}

SNP.products = { edit };
SNP.module({ id:"products", label:"Products", group:"Operations", visible:()=>SNP.can("product"), render });
})();
