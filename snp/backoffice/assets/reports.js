/* Reports: sales, profit, collections and oil income for any period, broken down by customer, division, product and rep. */
(() => {
"use strict";
const { S, el, items, money, money0, fmtDate, fmtMonth, nameOf, today } = SNP;
const RF = { period:"month", from:"", to:"", tab:"customer" };
const svgNS="http://www.w3.org/2000/svg";
const sv=(tag,attrs={},...kids)=>{ const n=document.createElementNS(svgNS,tag); for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,v); kids.forEach(k=>n.append(k.nodeType?k:document.createTextNode(k))); return n; };
const pad=n=>String(n).padStart(2,"0"), ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const pct=(a,b)=>b?Math.round(a/b*1000)/10:0;
const short=v=>Math.abs(v)>=1e6?"$"+(v/1e6).toFixed(1)+"m":Math.abs(v)>=1e3?"$"+Math.round(v/1e3)+"k":"$"+Math.round(v);

function range(){
  const t=new Date(), y=t.getFullYear(), m=t.getMonth();
  switch(RF.period){
    case "month": return [ymd(new Date(y,m,1)), today(), "This month"];
    case "last": return [ymd(new Date(y,m-1,1)), ymd(new Date(y,m,0)), "Last month"];
    case "quarter": { const q=Math.floor(m/3)*3; return [ymd(new Date(y,q,1)), today(), "This quarter"]; }
    case "ytd": return [y+"-01-01", today(), "Year to date"];
    case "12m": return [ymd(new Date(y,m-11,1)), today(), "Last 12 months"];
    default: return [RF.from||ymd(new Date(y,m,1)), RF.to||today(), "Custom range"];
  }
}
const billable = () => items("invoice").filter(x=>!["Draft","Void"].includes(x.data.status));
function inRange(a,b){ return billable().filter(x=>x.data.date>=a&&x.data.date<=b); }
function oilNet(a,b){
  if (!SNP.can("oil_order")) return null;
  const months=new Set(); let d=new Date(a.slice(0,7)+"-01T12:00");
  while (d.toISOString().slice(0,7)<=b.slice(0,7)){ months.add(d.toISOString().slice(0,7)); d.setMonth(d.getMonth()+1); }
  let rewards=0, owners=0; months.forEach(m=>{ const st=SNP.oil.statement(m); rewards+=st.R; owners+=st.owners; });
  return {rewards, owners};
}
function group(list, keyFn, labelFn){
  const g=new Map();
  list.forEach(inv=>keyFn(inv).forEach(([k,sales,cost])=>{ const r=g.get(k)||{key:k,label:labelFn(k),sales:0,cost:0,count:0,inv:new Set()}; r.sales+=sales; r.cost+=cost; r.inv.add(inv.id); g.set(k,r); }));
  return [...g.values()].map(r=>({...r,count:r.inv.size,profit:r.sales-r.cost,margin:pct(r.sales-r.cost,r.sales)})).sort((a,b)=>b.sales-a.sales);
}
const byCustomer = list => group(list, inv=>[[inv.data.customerId, inv.data.subtotal||0, inv.data.costTotal||0]], k=>SNP.customerName(k)||"Unknown");
const byDivision = list => group(list, inv=>[[inv.data.division||"Unassigned", inv.data.subtotal||0, inv.data.costTotal||0]], k=>k);
const byRep = list => group(list, inv=>[[inv.data.repId||0, inv.data.subtotal||0, inv.data.costTotal||0]], k=>nameOf(k)||"Unassigned");
const byProduct = list => group(list, inv=>(inv.data.lines||[]).map(l=>[l.productId?"p"+l.productId:"d"+(l.desc||"(no description)"), (Number(l.qty)||0)*(Number(l.price)||0), (Number(l.qty)||0)*(Number(l.cost)||0)]),
  k=>{ if(k[0]==="p"){ const p=SNP.item("product",Number(k.slice(1))); return p?p.data.name+(p.data.grade?" · "+p.data.grade:""):"Deleted product"; } return k.slice(1); });

function chart(){
  const t=new Date(), months=[...Array(12)].map((_,i)=>{ const d=new Date(t.getFullYear(),t.getMonth()-11+i,1); return d.getFullYear()+"-"+pad(d.getMonth()+1); });
  const inv=billable(), seeCost=!!S.perms.seeCosts;
  const sales=months.map(m=>inv.filter(x=>(x.data.date||"").slice(0,7)===m).reduce((s,x)=>s+(x.data.subtotal||0),0));
  const prof=months.map(m=>inv.filter(x=>(x.data.date||"").slice(0,7)===m).reduce((s,x)=>s+(x.data.profit||0),0));
  const max=Math.max(1,...sales), step=Math.pow(10,Math.floor(Math.log10(max))), top=Math.ceil(max/step)*step;
  const W=760,H=240,L=56,B=28,T=12,R=8, ch=H-B-T, cw=(W-L-R)/12, bw=Math.min(22,cw/2.6);
  const svg=sv("svg",{viewBox:`0 0 ${W} ${H}`,class:"chart",role:"img","aria-label":"Sales and profit, last 12 months"});
  for(let i=0;i<=4;i++){ const v=top*i/4, y=T+ch-(ch*i/4); svg.append(sv("line",{x1:L,x2:W-R,y1:y,y2:y,class:"grid"}), sv("text",{x:L-8,y:y+4,class:"axis","text-anchor":"end"}, short(v))); }
  months.forEach((m,i)=>{ const x=L+cw*i+cw/2, h1=ch*sales[i]/top, h2=Math.max(0,ch*prof[i]/top);
    const b1=sv("rect",{x:seeCost?x-bw-1:x-bw/2,y:T+ch-h1,width:bw,height:Math.max(h1,0),rx:2,class:"bar-a"}); b1.append(sv("title",{},`${fmtMonth(m)} sales: ${money(sales[i])}`)); svg.append(b1);
    if (seeCost){ const b2=sv("rect",{x:x+1,y:T+ch-h2,width:bw,height:h2,rx:2,class:"bar-c"}); b2.append(sv("title",{},`${fmtMonth(m)} profit: ${money(prof[i])}`)); svg.append(b2); }
    svg.append(sv("text",{x,y:H-8,class:"axis","text-anchor":"middle"}, new Date(m+"-01T12:00").toLocaleDateString(undefined,{month:"short"})));
  });
  return el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"Last 12 months"), el("div",{class:"legend"}, el("span",{}, el("i",{class:"lg-a"}),"Sales"), seeCost?el("span",{}, el("i",{class:"lg-c"}),"Gross profit"):null)), el("div",{class:"chart-wrap"}, svg));
}

function render(main){
  const [a,b,label]=range(), list=inRange(a,b), seeCost=!!S.perms.seeCosts;
  const sales=list.reduce((s,x)=>s+(x.data.subtotal||0),0), profit=list.reduce((s,x)=>s+(x.data.profit||0),0);
  const collected=billable().reduce((s,x)=>s+(x.data.payments||[]).filter(p=>p.date>=a&&p.date<=b).reduce((t,p)=>t+(p.amount||0),0),0);
  const oil=oilNet(a,b);
  const inR=d=>{ const c=SNP.deals.closedAt(d); return c>=a&&c<=b; }, won=items("deal").filter(d=>SNP.deals.isWon(d)&&inR(d)), lost=items("deal").filter(d=>SNP.deals.isLost(d)&&inR(d));
  const period=SNP.selectEl([["month","This month"],["last","Last month"],["quarter","This quarter"],["ytd","Year to date"],["12m","Last 12 months"],["custom","Custom…"]],RF.period,v=>{RF.period=v;SNP.refresh(true);},"Period");
  const custom=RF.period==="custom"?[el("input",{type:"date",value:a,"aria-label":"From",onchange:e=>{RF.from=e.target.value;SNP.refresh(true);}}), el("span",{class:"muted"},"to"), el("input",{type:"date",value:b,"aria-label":"To",onchange:e=>{RF.to=e.target.value;SNP.refresh(true);}})]:[];

  const TABS={customer:["By customer",byCustomer],division:["By division",byDivision],product:["By product",byProduct],rep:["By sales rep",byRep]};
  const rows=TABS[RF.tab][1](list);
  const unpaid=id=>billable().filter(x=>x.data.customerId===id).reduce((s,x)=>s+Math.max(0,x.data.balance||0),0);
  const cols=[{label:TABS[RF.tab][0].replace("By ",""),value:r=>el("strong",{},r.label)},{label:"Invoices",cls:"num",value:r=>String(r.count)},{label:"Sales",cls:"num",value:r=>money(r.sales)},
    ...(seeCost?[{label:"Gross profit",cls:"num",value:r=>el("span",{class:r.profit<0?"bad-t":""},money(r.profit))},{label:"Margin",cls:"num",value:r=>r.margin+"%"}]:[]),
    {label:"Share of sales",cls:"num",value:r=>el("span",{class:"share"}, el("i",{style:`width:${Math.max(2,pct(r.sales,sales))}%`}), pct(r.sales,sales)+"%")},
    ...(RF.tab==="customer"?[{label:"Unpaid now",cls:"num",value:r=>{ const u=unpaid(r.key); return u?el("span",{class:"warn-t"},money(u)):"—"; }}]:[])];
  if (RF.tab==="rep"){ const tg=(S.settings&&S.settings.targets)||{}; if(RF.period==="month") cols.push({label:"Target",cls:"num",value:r=>tg[r.key]?`${money0(tg[r.key])} · ${pct(r.sales,tg[r.key])}%`:"—"}); }
  const exp=()=>SNP.csv(`SNP sales ${TABS[RF.tab][0].toLowerCase()} ${a} to ${b}.csv`,["Name","Invoices","Sales",...(seeCost?["Cost","Gross profit","Margin %"]:[]),"Share %"],rows.map(r=>[r.label,r.count,r.sales.toFixed(2),...(seeCost?[r.cost.toFixed(2),r.profit.toFixed(2),r.margin]:[]),pct(r.sales,sales)]));
  const pdfB=el("button",{class:"btn small",type:"button"},"PDF");
  pdfB.onclick=async()=>{ pdfB.disabled=true; try{ SNP.saveBlob(`SNP sales ${TABS[RF.tab][0].toLowerCase()} ${a} to ${b}.pdf`, await SNP.docs.tablePDF("SALES REPORT", `${TABS[RF.tab][0]} · ${fmtDate(a)} – ${fmtDate(b)}`,
      ["Name","Invoices","Sales",...(seeCost?["Gross profit","Margin"]:[]),"Share"], rows.map(r=>[r.label,String(r.count),money(r.sales),...(seeCost?[money(r.profit),r.margin+"%"]:[]),pct(r.sales,sales)+"%"]), {right:seeCost?[1,2,3,4,5]:[1,2,3]})); }catch(e){ SNP.fail(e); } finally{ pdfB.disabled=false; } };

  main.append(SNP.pageHead("Reports", `${label}: ${fmtDate(a)} – ${fmtDate(b)}. Sales are invoice subtotals before tax and shipping; drafts and void invoices are left out.`, period, ...custom),
    el("div",{class:"kpis"},
      SNP.kpi(money0(sales),"Sales"), seeCost?SNP.kpi(money0(profit),`Gross profit · ${pct(profit,sales)}% margin`,profit<0?"bad":""):null,
      SNP.kpi(money0(collected),"Collected"), SNP.kpi(String(list.length)+(list.length?` · avg ${money0(sales/list.length)}`:""),"Invoices"),
      oil?SNP.kpi(money0(oil.owners),`Oil rewards kept by SNP (of ${money0(oil.rewards)})`):null,
      SNP.kpi(`${won.length} won · ${lost.length} lost`,`Deals closed · ${pct(won.length,won.length+lost.length)}% win rate`)),
    chart(),
    el("section",{class:"panel"}, el("div",{class:"panel-h"}, SNP.subtabs(Object.entries(TABS).map(([k,v])=>[k,v[0]]),RF.tab,t=>{RF.tab=t;SNP.refresh(true);}),
      el("div",{class:"row-actions"}, el("button",{class:"btn small ghost",type:"button",onclick:exp},"CSV"), pdfB)),
      SNP.table({rows,columns:cols,empty:"No invoices in this period."})),
    seeCost&&list.some(x=>(x.data.lines||[]).some(l=>(Number(l.price)||0)>0&&!(Number(l.cost)>0)))?el("p",{class:"muted small"},"Some invoice lines have no cost recorded, so profit for them counts as the full sale. Pick products from the list, or enter a unit cost, to make profit exact."):null);
}

SNP.reports = { byRep, inRange };
SNP.module({ id:"reports", label:"Reports", group:"Insights", visible:()=>!!S.perms.reports, render });
})();
