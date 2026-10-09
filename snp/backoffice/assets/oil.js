/* Oil brokerage: Sam's Club orders, rewards, monthly partner statements, program costs, payouts. */
(() => {
"use strict";
const { S, el, items, item, money, money0, fmtDate, fmtMonth, badge, today, round2, esc } = SNP;
const RS = ["Pending","Earned","Deposited","Cancelled"];
const OF = { month:"", status:"", tab:"orders", stMonth:"" };

const memberships = () => (S.settings&&S.settings.memberships)||[];
const share = () => Number(S.settings&&S.settings.partnerShare)||0;
const partner = () => (S.settings&&S.settings.partnerName)||"Partner";
const monthAdd = (ym, n) => { const [y,m]=ym.split("-").map(Number); const d=new Date(y,m-1+n,1); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); };

function orderFields(){
  const mem=memberships();
  return [
    {key:"date",label:"Order date",type:"date"},
    {key:"customerId",label:"Customer",type:"customer"},
    mem.length?{key:"membership",label:"Membership used",type:"select",options:[["","—"],...mem.map(m=>[m,m])]}:{key:"membership",label:"Membership used",hint:"Owners can list memberships in Settings to pick from here."},
    {key:"amount",label:"Order amount",type:"money"},
    {key:"description",label:"What was ordered",full:true,placeholder:"e.g. 1 truckload Mobil 1 5W-30"},
    {key:"rewardAmount",label:"Reward",type:"money"},
    {key:"rewardStatus",label:"Reward status",type:"select",options:RS},
    {key:"depositDate",label:"Deposited on",type:"date",hint:"Counts toward that month's statement."},
    {key:"notes",label:"Notes",type:"textarea",rows:2}];
}
function editOrder(id=null, defaults={}){
  return SNP.editRecord({type:"oil_order", id, title:id?"Oil order":"New oil order", eyebrow:"Oil rewards", fields:orderFields(),
    defaults:Object.assign({date:today(),rewardStatus:"Pending"},defaults)});
}
const editCost = (id=null) => SNP.editRecord({type:"oil_cost", id, title:id?"Program cost":"New program cost", eyebrow:"Oil rewards",
  fields:[{key:"month",label:"Month",type:"month"},{key:"amount",label:"Amount",type:"money"},{key:"description",label:"What it was",full:true,placeholder:"e.g. Sam's Plus renewal, membership #2"}],
  defaults:{month:OF.stMonth||SNP.thisMonth()}});
const editPayout = (id=null, defaults={}) => SNP.editRecord({type:"payout", id, title:id?"Payout":"Record payout to "+partner(), eyebrow:"Oil rewards",
  fields:[{key:"month",label:"For month",type:"month"},{key:"amount",label:"Amount paid",type:"money"},{key:"paidDate",label:"Paid on",type:"date"},{key:"method",label:"Method",type:"select",options:["Wire","ACH","Zelle","Check","Cash","Other"]},{key:"reference",label:"Reference",full:true},{key:"notes",label:"Notes",type:"textarea",rows:2}],
  defaults:Object.assign({paidDate:today(),method:"Wire"},defaults)});

function statement(month){
  const rewards=items("oil_order").filter(o=>o.data.rewardStatus==="Deposited"&&(o.data.depositDate||"").slice(0,7)===month);
  const costs=items("oil_cost").filter(c=>c.data.month===month);
  const payouts=items("payout").filter(p=>p.data.month===month);
  const R=round2(rewards.reduce((s,o)=>s+(o.data.rewardAmount||0),0)), C=round2(costs.reduce((s,c)=>s+(c.data.amount||0),0));
  const before=!!(S.settings&&S.settings.costsBeforeSplit);
  const base=before?round2(R-C):R;
  const p=round2(base*share()/100), owners=round2(base-p-(before?0:C));
  const paid=round2(payouts.reduce((s,x)=>s+(x.data.amount||0),0));
  return {month,rewards,costs,payouts,R,C,before,base,partnerShare:p,owners,paid,owed:round2(p-paid)};
}

function rewardSelect(o){
  if (!SNP.can("oil_order","rw")) return badge(o.data.rewardStatus);
  return SNP.selectEl(RS,o.data.rewardStatus,async v=>{ try{ const d=Object.assign({},o.data,{rewardStatus:v}); if(v==="Deposited"&&!d.depositDate) d.depositDate=today();
    await SNP.saveItem("oil_order",o.id,d); SNP.toast(v==="Deposited"?`Marked deposited on ${fmtDate(d.depositDate)}.`:`Marked ${v.toLowerCase()}.`); SNP.refresh(true); }catch(e){ SNP.fail(e); } },"Reward status");
}

function renderOil(main){
  const rw=SNP.can("oil_order","rw");
  const tabs=SNP.subtabs([["orders","Orders"],["statement","Monthly statement"],["costs","Program costs"],["payouts","Payouts"]],OF.tab,t=>{OF.tab=t;SNP.refresh(true);});
  const m=SNP.thisMonth(), cur=statement(m);
  const pending=items("oil_order").filter(o=>["Pending","Earned"].includes(o.data.rewardStatus));
  const ordersM=items("oil_order").filter(o=>(o.data.date||"").slice(0,7)===m);
  main.append(SNP.pageHead("Oil orders & rewards", `Every Sam's Club order, the rewards it earns, and the ${share()}/${100-share()} split with ${partner()}.`,
      el("button",{class:"btn ghost",type:"button",onclick:exportOrders},"Export CSV"),
      rw?el("button",{class:"btn primary",type:"button",onclick:()=>editOrder()},"+ Order"):null),
    el("div",{class:"kpis"}, SNP.kpi(`${ordersM.length} · ${money0(ordersM.reduce((s,o)=>s+(o.data.amount||0),0))}`,"Orders this month"),
      SNP.kpi(money(cur.R),"Rewards deposited this month"), SNP.kpi(money(pending.reduce((s,o)=>s+(o.data.rewardAmount||0),0)),"Rewards not yet deposited", pending.length?"warn":""),
      SNP.kpi(money(cur.owed),`Still owed to ${partner()} (${fmtMonth(m)})`, cur.owed>0?"warn":"")),
    tabs);
  if (OF.tab==="orders") return ordersTab(main);
  if (OF.tab==="statement") return statementTab(main);
  if (OF.tab==="costs") return main.append(listSimple("oil_cost",[{label:"Month",value:x=>fmtMonth(x.data.month)},{label:"What",value:x=>x.data.description},{label:"Amount",cls:"num",value:x=>money(x.data.amount)}],x=>editCost(x.id),
    "Membership fees and other program costs. They're deducted before the split when Settings says so.", rw?el("button",{class:"btn",type:"button",onclick:()=>editCost()},"+ Cost"):null, (a,b)=>b.data.month.localeCompare(a.data.month)));
  if (OF.tab==="payouts") return main.append(listSimple("payout",[{label:"For month",value:x=>fmtMonth(x.data.month)},{label:"Paid on",value:x=>fmtDate(x.data.paidDate)},{label:"Amount",cls:"num",value:x=>money(x.data.amount)},{label:"Method",value:x=>x.data.method},{label:"Reference",value:x=>x.data.reference||"—"}],x=>editPayout(x.id),
    `Payments made to ${partner()}.`, rw?el("button",{class:"btn",type:"button",onclick:()=>editPayout(null,{month:SNP.thisMonth()})},"+ Payout"):null, (a,b)=>(b.data.paidDate||"").localeCompare(a.data.paidDate||"")));
}
function listSimple(type, columns, onRow, sub, addBtn, sort){
  const rows=items(type).slice().sort(sort);
  return el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("p",{class:"muted small",style:"margin:0"},sub), addBtn), SNP.table({rows,columns,onRow,empty:"Nothing recorded yet."}));
}
function ordersTab(main){
  const months=[...new Set(items("oil_order").map(o=>(o.data.date||"").slice(0,7)).filter(Boolean))].sort().reverse();
  const box=el("div");
  const draw=()=>{
    const rows=items("oil_order").filter(o=>(!OF.month||(o.data.date||"").startsWith(OF.month))&&(!OF.status||o.data.rewardStatus===OF.status))
      .sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||"")||b.id-a.id);
    box.replaceChildren(SNP.table({rows,onRow:o=>editOrder(o.id),empty:items("oil_order").length?"No orders match.":"No oil orders logged yet. Log each Sam's Club order to track the reward it earns.",columns:[
      {label:"Date",value:o=>fmtDate(o.data.date)},{label:"Customer",value:o=>SNP.customerName(o.data.customerId)||"—"},{label:"Membership",value:o=>o.data.membership||"—"},
      {label:"Order",value:o=>o.data.description||"—"},{label:"Amount",cls:"num",value:o=>money(o.data.amount)},{label:"Reward",cls:"num",value:o=>money(o.data.rewardAmount)},
      {label:"Reward status",value:o=>rewardSelect(o)},{label:"Deposited",value:o=>fmtDate(o.data.depositDate)||"—"}],
      foot:rows.length?el("tr",{}, el("td",{colspan:"4"},`${rows.length} order${rows.length===1?"":"s"}`), el("td",{class:"num"},money(rows.reduce((s,o)=>s+(o.data.amount||0),0))), el("td",{class:"num"},money(rows.reduce((s,o)=>s+(o.data.rewardAmount||0),0))), el("td",{colspan:"2"})):null}));
  };
  main.append(SNP.toolbar(SNP.selectEl([["","All months"],...months.map(x=>[x,fmtMonth(x)])],OF.month,v=>{OF.month=v;draw();},"Month"),
    SNP.selectEl([["","Any reward status"],...RS.map(x=>[x,x])],OF.status,v=>{OF.status=v;draw();},"Reward status")), box);
  draw();
}
function statementTab(main){
  if (!OF.stMonth) OF.stMonth=SNP.thisMonth();
  const st=statement(OF.stMonth), rw=SNP.can("payout","rw");
  const picker=el("input",{type:"month",value:OF.stMonth,"aria-label":"Statement month"}); picker.onchange=()=>{ if(picker.value){ OF.stMonth=picker.value; SNP.refresh(true); } };
  const line=(label,val,cls="")=>el("div",{class:"st-line "+cls}, el("span",{},label), el("span",{class:"num"},val));
  main.append(
    SNP.toolbar(el("button",{class:"btn small ghost",type:"button",onclick:()=>{OF.stMonth=monthAdd(OF.stMonth,-1);SNP.refresh(true);}},"← Previous"), picker,
      el("button",{class:"btn small ghost",type:"button",onclick:()=>{OF.stMonth=monthAdd(OF.stMonth,1);SNP.refresh(true);}},"Next →"),
      el("button",{class:"btn small",type:"button",onclick:()=>printStatement(st)},"Print statement")),
    el("div",{class:"two-col"},
      el("section",{class:"panel"}, el("h3",{},fmtMonth(st.month)),
        line("Rewards deposited", money(st.R)),
        line(st.before?"Less program costs":"Program costs (paid by SNP)", (st.before?"−":"")+money(st.C)),
        st.before?line("Net rewards to split", money(st.base),"strong"):null,
        line(`${partner()} share (${share()}%)`, money(st.partnerShare),"strong"),
        line(`SNP owners' share (${100-share()}%)`+(st.before?"":" after costs"), money(st.owners)),
        el("hr"),
        line(`Paid to ${partner()}`, money(st.paid)),
        line(st.owed>=0?`Still owed to ${partner()}`:`Overpaid to ${partner()}`, money(Math.abs(st.owed)), st.owed>0?"warn-t strong":"strong"),
        rw&&st.owed>0?el("div",{class:"row-actions"}, el("button",{class:"btn primary",type:"button",onclick:()=>editPayout(null,{month:st.month,amount:st.owed})},`Record payout of ${money(st.owed)}`)):null,
        el("p",{class:"muted small"}, st.before?"Costs are deducted before the split. Change this in Settings.":"Each side bears its own costs; SNP's costs come out of the owners' share. Change this in Settings.")),
      el("section",{class:"panel"}, el("h3",{},"Rewards in this statement"),
        SNP.table({rows:st.rewards,onRow:o=>editOrder(o.id),empty:"No rewards were deposited this month.",columns:[{label:"Deposited",value:o=>fmtDate(o.data.depositDate)},{label:"Customer",value:o=>SNP.customerName(o.data.customerId)||"—"},{label:"Order",value:o=>o.data.description||fmtDate(o.data.date)},{label:"Reward",cls:"num",value:o=>money(o.data.rewardAmount)}]}),
        el("h3",{style:"margin-top:16px"},"Costs this month"),
        SNP.table({rows:st.costs,onRow:c=>editCost(c.id),empty:"No costs recorded.",columns:[{label:"What",value:c=>c.data.description},{label:"Amount",cls:"num",value:c=>money(c.data.amount)}]}),
        rw?el("div",{class:"row-actions"}, el("button",{class:"btn small",type:"button",onclick:()=>editCost()},"+ Cost for this month")):null)));
}
function printStatement(st){
  const rows=st.rewards.map(o=>`<tr><td>${fmtDate(o.data.depositDate)}</td><td>${esc(SNP.customerName(o.data.customerId)||"—")}</td><td>${esc(o.data.description||"")}</td><td class="r">${money(o.data.rewardAmount)}</td></tr>`).join("");
  const costs=st.costs.map(c=>`<tr><td colspan="3">${esc(c.data.description)}</td><td class="r">${money(c.data.amount)}</td></tr>`).join("");
  SNP.printHTML(`Rewards statement ${st.month}`, `
<div class="hd">${SNP.companyBlock()}<div><h1>REWARDS STATEMENT</h1><div class="meta"><b>${esc(fmtMonth(st.month))}</b><br>Prepared for ${esc(partner())}<br>Issued ${fmtDate(today())}</div></div></div>
<div class="lbl" style="margin-top:22px">Rewards deposited</div>
<table><thead><tr><th>Deposited</th><th>Customer</th><th>Order</th><th class="r">Reward</th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="muted">None this month</td></tr>'}</tbody></table>
${st.costs.length?`<div class="lbl" style="margin-top:18px">Program costs</div><table><tbody>${costs}</tbody></table>`:""}
<table class="tot"><tr><td>Rewards deposited</td><td class="r">${money(st.R)}</td></tr>${st.before?`<tr><td>Less program costs</td><td class="r">−${money(st.C)}</td></tr><tr><td>Net to split</td><td class="r">${money(st.base)}</td></tr>`:""}
<tr class="g"><td>${esc(partner())} share (${share()}%)</td><td class="r">${money(st.partnerShare)}</td></tr><tr><td>Paid this month</td><td class="r">${money(st.paid)}</td></tr><tr class="g"><td>Balance due to ${esc(partner())}</td><td class="r">${money(st.owed)}</td></tr></table>
<div class="foot">${esc((S.settings||{}).companyName||"")} · Statement generated from SNP Records.</div>`);
}
function exportOrders(){
  SNP.csv("SNP oil orders "+today()+".csv",["Date","Customer","Membership","Order","Amount","Reward","Reward status","Deposited"],
    items("oil_order").map(o=>{const d=o.data; return [d.date,SNP.customerName(d.customerId),d.membership,d.description,d.amount,d.rewardAmount,d.rewardStatus,d.depositDate];}));
}

SNP.oil = { editOrder, statement };
SNP.module({ id:"oil", label:"Oil rewards", group:"Sales", visible:()=>SNP.can("oil_order"), render:renderOil });
})();
