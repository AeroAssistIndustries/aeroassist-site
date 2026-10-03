/* ==========================================================
   AeroAssist — one page. All simulation data is synthetic.
   ========================================================== */
(function(){
'use strict';
var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
var $  = function(s,c){return (c||document).querySelector(s);};
var $$ = function(s,c){return Array.prototype.slice.call((c||document).querySelectorAll(s));};
var pad2=function(n){return String(n).padStart(2,'0');};
var mmss=function(s){return Math.floor(s/60)+':'+pad2(Math.round(s%60));};
var ri=function(a,b){return Math.floor(Math.random()*(b-a+1))+a;};
var rand=function(a){return a[Math.floor(Math.random()*a.length)];};
var clamp=function(v,a,b){return Math.max(a,Math.min(b,v));};

/* ---------- toast ---------- */
var toastT, toastEl=$('#toast');
function toast(m){if(!toastEl)return;toastEl.textContent=m;toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(function(){toastEl.classList.remove('on');},1900);}

/* header, menus, progress, reveals and counters live in chrome.js */

/* ==========================================================
   1. HERO LIVE MISSION
   ========================================================== */
(function(){
  var air=$('#mAir'), airPath=$('#mAirPath'), grd=$('#mGrd'), grdPath=$('#mGrdPath'),
      ping=$('#mPing'), clock=$('#mClock'), cap=$('#mCap'), tag=$('#mTag');
  if(!air) return;
  function pt(p,t){var L=p.getTotalLength();return p.getPointAtLength(clamp(t,0,1)*L);}
  function place(el,p,rot){el.setAttribute('transform','translate('+p.x.toFixed(1)+','+p.y.toFixed(1)+')'+(rot!=null?' rotate('+rot.toFixed(1)+')':''));}
  function say(t,live){cap.textContent=t;tag.textContent=live?'LIVE':'STANDBY';tag.classList.toggle('live',!!live);}
  if(reduce){
    air.setAttribute('opacity','1');grd.setAttribute('opacity','1');ping.setAttribute('opacity','1');
    place(air,{x:360,y:150},45);place(grd,{x:190,y:356},null);airPath.setAttribute('stroke-dashoffset','0');
    clock.textContent='1:19';clock.style.color='var(--signal)';
    say('Overhead in 79 seconds — ground unit still en route.',true); return;
  }
  var t0=null,phase=-1;
  function frame(ts){
    if(t0===null)t0=ts;
    var el=(ts-t0)/1000;
    if(el<1){ if(phase!==0){phase=0;say('Sector quiet. Aircraft on dock, ready.',false);clock.style.color='';}
      clock.textContent='0:00';ping.setAttribute('opacity','0');air.setAttribute('opacity','0');grd.setAttribute('opacity','0');
      airPath.setAttribute('stroke-dashoffset','600');grdPath.setAttribute('stroke-dashoffset','600');
    } else if(el<2){ if(phase!==1){phase=1;say('911 call received — priority one.',true);}
      ping.setAttribute('opacity','1'); clock.textContent='0:0'+Math.floor(el-1);
    } else {
      if(phase!==2 && phase!==3){phase=2;say('Aircraft launched from dock.',true);}
      var mt=el-2, ta=Math.min(1,mt/7.2), tg=Math.min(1,mt/2.05*0.22);
      air.setAttribute('opacity','1');grd.setAttribute('opacity','1');
      var pa=pt(airPath,ta), pa2=pt(airPath,Math.min(1,ta+0.02));
      place(air,pa,Math.atan2(pa2.x-pa.x,-(pa2.y-pa.y))*180/Math.PI);
      place(grd,pt(grdPath,tg),null);
      airPath.setAttribute('stroke-dashoffset',String(600-600*ta));
      grdPath.setAttribute('stroke-dashoffset',String(600-600*tg));
      var secs=Math.floor(mt*11); clock.textContent=Math.floor(secs/60)+':'+pad2(secs%60);
      if(ta>=1&&phase!==3){phase=3;say('Overhead. Live video to responders — ground unit still en route.',true);clock.style.color='var(--signal)';}
      if(el>12.5){t0=null;phase=-1;}
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* ==========================================================
   2. RESPONSE GAP CALCULATOR
   ========================================================== */
(function(){
  var g=$('#cGround'), d=$('#cDist'), c=$('#cCalls');
  if(!g) return;
  var LAUNCH=22;           // seconds from dispatch to airborne
  var CRUISE=35;           // mph — multirotor cruise
  function calc(){
    var gMin=+g.value, dist=+d.value, calls=+c.value;
    $('#oGround').textContent=gMin.toFixed(1)+' min';
    $('#oDist').textContent=dist.toFixed(1)+' mi';
    $('#oCalls').textContent=calls;
    var airSec=LAUNCH+(dist/CRUISE)*3600;
    var grdSec=gMin*60;
    var maxSec=Math.max(airSec,grdSec);
    $('#barAir').style.width=(airSec/maxSec*100)+'%';
    $('#barGrd').style.width=(grdSec/maxSec*100)+'%';
    $('#tAir').textContent=mmss(airSec);
    $('#tGrd').textContent=mmss(grdSec);
    var gap=grdSec-airSec;
    var v=$('#vGap'), copy=$('#vCopy');
    if(gap>0){
      v.textContent=mmss(gap); v.style.color='var(--signal)';
      var hrs=(gap*calls/3600);
      copy.textContent='Eyes overhead this far ahead of the first ground unit. Across '+calls+' calls a day that is '+hrs.toFixed(1)+' hours of aerial awareness you do not have today.';
    } else {
      v.textContent=mmss(-gap); v.style.color='var(--amber)';
      copy.textContent='At this distance the ground unit arrives first. Move a dock closer, or use XR-3 for the outer edge of the sector.';
    }
  }
  [g,d,c].forEach(function(el){el.addEventListener('input',calc);});
  calc();
})();

/* ==========================================================
   3. COVERAGE PLANNER
   ========================================================== */
(function(){
  var docks=$('#cDocks'), radius=$('#cRadius'), sector=$('#cSector'), map=$('#planMap');
  if(!docks) return;
  var SPEED={'XR-1':35,'XR-2':35,'XR-3':55}, plat='XR-1';
  $$('#segPlat button').forEach(function(b){
    b.addEventListener('click',function(){
      $$('#segPlat button').forEach(function(x){x.classList.remove('on');});
      b.classList.add('on'); plat=b.dataset.plat; draw();
    });
  });
  function layout(n){
    // Deterministic spread of dock positions across the sector.
    var pts=[], W=640,H=400;
    if(n===1) pts=[[0.5,0.5]];
    else if(n===2) pts=[[0.3,0.5],[0.7,0.5]];
    else if(n===3) pts=[[0.28,0.32],[0.72,0.32],[0.5,0.74]];
    else if(n===4) pts=[[0.28,0.3],[0.72,0.3],[0.28,0.72],[0.72,0.72]];
    else if(n===5) pts=[[0.25,0.28],[0.75,0.28],[0.5,0.5],[0.25,0.75],[0.75,0.75]];
    else {
      var cols=Math.ceil(Math.sqrt(n)), rows=Math.ceil(n/cols), k=0;
      for(var r=0;r<rows;r++)for(var c2=0;c2<cols&&k<n;c2++,k++)
        pts.push([(c2+1)/(cols+1),(r+1)/(rows+1)]);
    }
    return pts.map(function(p){return {x:p[0]*W,y:p[1]*H};});
  }
  function draw(){
    var n=+docks.value, R=+radius.value, area=+sector.value;
    $('#oDocks').textContent=n;
    $('#oRadius').textContent=R.toFixed(1)+' mi';
    $('#oSector').textContent=area+' sq mi';

    // The map is 640x400, so model the sector as a rectangle of the same
    // shape with the requested area. This keeps one uniform scale and makes
    // the coverage percentage an honest fraction of the whole sector.
    var hMi=Math.sqrt(area/1.6), wMi=area/hMi;   // 640:400 = 1.6
    var pxPerMi=640/wMi;                          // same as 400/hMi
    var pts=layout(n);
    var rPx=R*pxPerMi;

    // Monte-Carlo-free coverage estimate on a sample grid.
    var covered=0,total=0;
    for(var gx=0;gx<40;gx++)for(var gy=0;gy<25;gy++){
      var px=(gx+0.5)/40*640, py=(gy+0.5)/25*400; total++;
      for(var i=0;i<pts.length;i++){
        if(Math.hypot(px-pts[i].x,py-pts[i].y)<=rPx){covered++;break;}
      }
    }
    var pct=Math.round(covered/total*100);

    // average distance to nearest dock among covered samples -> time
    var sum=0,cnt=0,worstMi=0;
    for(gx=0;gx<40;gx++)for(gy=0;gy<25;gy++){
      px=(gx+0.5)/40*640; py=(gy+0.5)/25*400;
      var best=1e9;
      for(i=0;i<pts.length;i++) best=Math.min(best,Math.hypot(px-pts[i].x,py-pts[i].y));
      if(best<=rPx){var mi=best/pxPerMi; sum+=mi; cnt++; if(mi>worstMi) worstMi=mi;}
    }
    var avgMi=cnt?sum/cnt:0;
    var sec=22+(avgMi/SPEED[plat])*3600;          // 22s = launch overhead
    var worstSec=22+(worstMi/SPEED[plat])*3600;

    $('#pCover').textContent=pct+'%';
    $('#pTime').textContent=mmss(sec);
    $('#pWorst').textContent=mmss(worstSec);
    $('#pFleet').textContent=Math.max(n,Math.ceil(n*1.3));

    // render
    var s='<rect width="640" height="400" fill="#050505"/>';
    s+='<g stroke="rgba(255,255,255,.07)" stroke-width="1">';
    for(var x=0;x<=640;x+=40) s+='<line x1="'+x+'" y1="0" x2="'+x+'" y2="400"/>';
    for(var y=0;y<=400;y+=40) s+='<line x1="0" y1="'+y+'" x2="640" y2="'+y+'"/>';
    s+='</g>';
    s+='<g stroke="rgba(255,255,255,.16)" stroke-width="4"><line x1="0" y1="200" x2="640" y2="200"/><line x1="320" y1="0" x2="320" y2="400"/></g>';
    pts.forEach(function(p){
      s+='<circle cx="'+p.x.toFixed(0)+'" cy="'+p.y.toFixed(0)+'" r="'+rPx.toFixed(0)+'" fill="rgba(53,224,216,.09)" stroke="rgba(53,224,216,.35)" stroke-dasharray="4 6"/>';
    });
    pts.forEach(function(p){
      s+='<rect x="'+(p.x-7).toFixed(0)+'" y="'+(p.y-7).toFixed(0)+'" width="14" height="14" fill="#0A0A0B" stroke="#D2AC64" stroke-width="2" transform="rotate(45 '+p.x.toFixed(0)+' '+p.y.toFixed(0)+')"/>';
      s+='<circle cx="'+p.x.toFixed(0)+'" cy="'+p.y.toFixed(0)+'" r="2.5" fill="#E8CE86"/>';
    });
    s+='<text x="14" y="26" fill="#9DB0C6" font-family="IBM Plex Mono" font-size="11" letter-spacing="1.4">'+wMi.toFixed(1)+' × '+hMi.toFixed(1)+' mi sector · '+plat+' @ '+SPEED[plat]+' mph</text>';
    map.innerHTML=s;
  }
  [docks,radius,sector].forEach(function(el){el.addEventListener('input',draw);});
  draw();
})();

/* ==========================================================
   4. PLATFORM TABS
   ========================================================== */
(function(){
  var tabs=$$('#tabs .tab');
  tabs.forEach(function(t){
    t.addEventListener('click',function(){
      tabs.forEach(function(x){x.classList.remove('on');});
      t.classList.add('on');
      var key=t.dataset.tab;
      $$('[data-panel]').forEach(function(p){p.classList.toggle('on', p.dataset.panel===key);});
    });
  });
})();

/* ==========================================================
   5. FLEET ESTIMATOR
   ========================================================== */
(function(){
  var st=$('#eStations'), hr=$('#eHours'), ca=$('#eCalls'), te=$('#eTerrain');
  if(!st) return;
  var TERRAIN=['Dense urban','Suburban','Rural / wide area'];
  var TIERS={
    Responder:'A single agency with one aircraft and dock, live streaming to dispatch, with training and standard support.',
    Command:'A multi-site department running a docked network, with the incident-command console, analytics and priority support.',
    Regional:'County-wide coverage including XR-3 wide-area response, cross-agency integration and a dedicated program team.'
  };
  function calc(){
    var stations=+st.value, hours=+hr.value, calls=+ca.value, terr=+te.value;
    $('#oStations').textContent=stations;
    $('#oHours').textContent=hours+' hrs';
    $('#oECalls').textContent=calls;
    $('#oTerrain').textContent=TERRAIN[terr];

    var plat = terr===2 ? 'XR-3' : (hours>=20 || calls>40 ? 'XR-2' : 'XR-1');
    // one aircraft sustains roughly 9 sorties per 8-hour block; add spare per site
    var sorties=Math.ceil(calls/9);
    var shiftFactor=hours>16?1.6:hours>12?1.3:1;
    var aircraft=Math.max(stations, Math.ceil((sorties*shiftFactor)) + Math.ceil(stations*0.4));
    var flightHours=calls*(terr===2?0.42:0.25);
    var seats=Math.max(1,Math.ceil(stations/3)+(hours>16?1:0));

    $('#rPlat').textContent=plat;
    $('#rAir').textContent=aircraft;
    $('#rDocks').textContent=stations;
    $('#rFlights').textContent=calls;
    $('#rHours').textContent=flightHours.toFixed(1);
    $('#rSeats').textContent=seats;

    var tier = stations<=1 ? 'Responder' : (stations>=6||terr===2&&stations>=4 ? 'Regional' : 'Command');
    $('#rTier').textContent=tier;
    $('#rTierCopy').textContent=TIERS[tier];
  }
  [st,hr,ca,te].forEach(function(el){el.addEventListener('input',calc);});
  calc();
})();

/* ==========================================================
   6. CONTACT FORM
   ========================================================== */
(function(){
  var f=$('#cform'); if(!f) return;
  function valid(field){
    var input=$('input,textarea',field)||$('input',field);
    if(!input) return true;
    var v=input.value.trim(), ok=true;
    if(field.hasAttribute('data-req') && !v) ok=false;
    if(ok && field.hasAttribute('data-email') && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) ok=false;
    field.classList.toggle('bad',!ok);
    return ok;
  }
  $$('.field[data-req]',f).forEach(function(fl){
    var i=$('input,textarea',fl); if(i) i.addEventListener('blur',function(){valid(fl);});
  });
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var ok=true;
    $$('.field[data-req]',f).forEach(function(fl){ if(!valid(fl)) ok=false; });
    if(!ok){ toast('Check the highlighted fields'); return; }
    var body='Name: '+$('#fName').value+'\nAgency: '+$('#fOrg').value+'\nEmail: '+$('#fEmail').value+
             '\nPhone: '+$('#fPhone').value+'\nTopic: '+$('#fTopic').value+'\n\n'+$('#fMsg').value;
    location.href='mailto:info@aeroassist.us?subject='+encodeURIComponent('AeroAssist enquiry — '+$('#fOrg').value)+'&body='+encodeURIComponent(body);
    var ok=document.getElementById('cOk'); if(ok) ok.classList.add('on');
    var note=document.getElementById('cNote'); if(note) note.style.display='none';
    toast('Message ready to send');
  });
  $('#copyMail').addEventListener('click',function(){
    var t='info@aeroassist.us';
    if(navigator.clipboard) navigator.clipboard.writeText(t).then(function(){toast('Email address copied');},function(){location.href='mailto:'+t;});
    else location.href='mailto:'+t;
  });
})();

/* ==========================================================
   7. COMMAND CENTER
   ========================================================== */
(function(){
  var mapLive=$('#mapLive'); if(!mapLive) return;
  var W=800,H=520, UNIT_MI=5.8/W;
  var dist=function(a,b){return Math.hypot(a.x-b.x,a.y-b.y);};
  var hdg=function(a,b){return ((Math.atan2(b.x-a.x,-(b.y-a.y))*180/Math.PI)+360)%360;};
  var GEO={lat:34.0203,lon:-117.8653,dLat:.0555,dLon:.1012};
  var SIMX=24;   // flights play back this many times faster than real time
  function ll(x,y){return (GEO.lat-(y-H/2)/H*GEO.dLat).toFixed(4)+', '+(GEO.lon+(x-W/2)/W*GEO.dLon).toFixed(4);}

  var DOCKS=[
    {id:'S1',name:'Walnut Sheriff',x:265,y:235},
    {id:'S2',name:'Mt. SAC',x:530,y:395},
    {id:'S3',name:'Suzanne Park',x:135,y:410},
    {id:'S4',name:'Lemon Creek',x:620,y:160}
  ];
  var PLAT={'XR-1':{speed:35,alt:280},'XR-2':{speed:35,alt:340},'XR-3':{speed:55,alt:400}};
  var drones=[
    {cs:'AERO-1',plat:'XR-2',dock:'S1',bat:98},{cs:'AERO-2',plat:'XR-1',dock:'S1',bat:100},
    {cs:'AERO-3',plat:'XR-2',dock:'S2',bat:91},{cs:'AERO-4',plat:'XR-3',dock:'S4',bat:96},
    {cs:'AERO-5',plat:'XR-1',dock:'S3',bat:88},{cs:'AERO-6',plat:'XR-3',dock:'S2',bat:64}
  ].map(function(d){
    var k=DOCKS.filter(function(x){return x.id===d.dock;})[0];
    return Object.assign({},d,{x:k.x,y:k.y,home:{x:k.x,y:k.y},status:'ready',alt:0,spd:0,hd:0,
      target:null,eta:0,launch:0,sensor:'EO',zoom:1,spot:false,beacon:false,siren:false,pa:false,
      rec:false,snaps:0,mode:'orbit',hold:false,ang:Math.random()*6.28});
  });

  var TYPES=[{t:'Armed robbery in progress',p:1},{t:'Shots fired — multiple callers',p:1},
    {t:'Structure fire — occupied',p:1},{t:'Vehicle pursuit in progress',p:1},
    {t:'Traffic collision w/ injuries',p:2},{t:'Assault in progress',p:2},
    {t:'Burglary — alarm and audio',p:2},{t:'Person down — unknown',p:2},
    {t:'Commercial alarm activation',p:3},{t:'Welfare check',p:3},{t:'Reckless driver',p:3}];
  var STREETS=['Valley Blvd','Grand Ave','Amar Rd','Lemon Ave','La Puente Rd','Nogales St',
    'Fairway Dr','Meadow Pass Rd','Colima Rd','Temple Ave','Brea Canyon Rd','Pierre Rd'];

  var calls=[], seq=4817, logs=[], selCall=null, selDrone=null, flights=0, times=[];

  [['Armed robbery in progress',1,430,210,'21500 Valley Blvd'],
   ['Structure fire — occupied',1,200,140,'20700 Amar Rd'],
   ['Traffic collision w/ injuries',2,600,300,'Grand Ave & Valley Blvd'],
   ['Commercial alarm activation',3,480,240,'1100 N Grand Ave']
  ].forEach(function(a){
    calls.push({id:'CAD-'+(++seq),type:a[0],prio:a[1],x:a[2],y:a[3],addr:a[4],
      t:Date.now()-ri(30,600)*1000,status:'pending',drone:null});
  });

  function log(cls,tag,msg){
    var d=new Date();
    logs.unshift({ts:pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds()),cls:cls,tag:tag,msg:msg});
    if(logs.length>40) logs.pop();
    $('#log').innerHTML=logs.map(function(l){
      return '<div class="lg '+l.cls+'"><span class="ts">'+l.ts+'</span><span class="tg">'+l.tag+'</span><span class="m">'+l.msg+'</span></div>';
    }).join('');
  }

  /* ---- audio ---- */
  var actx,sirenN=null;
  function AC(){ if(!actx) actx=new (window.AudioContext||window.webkitAudioContext)(); return actx; }
  function sirenOn(){ try{var a=AC(),o=a.createOscillator(),g=a.createGain(),l=a.createOscillator(),lg=a.createGain();
    o.type='sawtooth';o.frequency.value=680;l.frequency.value=.55;lg.gain.value=260;
    l.connect(lg);lg.connect(o.frequency);g.gain.value=.03;o.connect(g);g.connect(a.destination);
    o.start();l.start();sirenN={o:o,l:l};}catch(e){} }
  function sirenOff(){ if(sirenN){try{sirenN.o.stop();sirenN.l.stop();}catch(e){} sirenN=null;} }
  function chirp(f,d){ try{var a=AC(),o=a.createOscillator(),g=a.createGain();
    o.type='square';o.frequency.value=f||900;g.gain.value=.035;o.connect(g);g.connect(a.destination);
    o.start();g.gain.exponentialRampToValueAtTime(.001,a.currentTime+(d||.08));o.stop(a.currentTime+(d||.08));}catch(e){} }

  /* ---- dispatch ---- */
  function nearest(c){
    var r=drones.filter(function(d){return d.status==='ready'&&d.bat>25;});
    if(!r.length) return null;
    return r.sort(function(a,b){return dist(a,c)-dist(b,c);})[0];
  }
  function etaTo(d,c){ return 22+(dist(d,c)*UNIT_MI/PLAT[d.plat].speed)*3600; }
  function dispatch(c,d,auto){
    if(!c||!d) return;
    d.status='enroute'; d.target=c; d.launch=Date.now(); d.eta=etaTo(d,c); d.rec=true; d.hold=false; d.simT=0;
    c.status='assigned'; c.drone=d.cs; flights++;
    selDrone=d; selCall=c;
    log('d',auto?'AUTO':'LAUNCH', d.cs+' ('+d.plat+') tasked to '+c.id+' — ETA '+mmss(d.eta));
    render();
  }
  function rth(d){
    if(!d) return;
    if(['enroute','onscene','landed'].indexOf(d.status)<0){toast(d.cs+' is not airborne');return;}
    if(d.target) d.target.status='cleared';
    d.status='returning'; d.hold=false; d.spot=false; d.beacon=false; d.pa=false;
    if(d.siren){d.siren=false;sirenOff();}
    log('i','RTH', d.cs+' returning to dock');
    render();
  }
  var airborne=function(d){return d&&['enroute','onscene','landed'].indexOf(d.status)>=0;};

  /* ---- controls ---- */
  function ctl(a){
    var d=selDrone;
    if(!d){toast('Select an aircraft first');return;}
    if(!airborne(d)&&a!=='rth'){toast(d.cs+' is docked — dispatch it to a call first');return;}
    switch(a){
      case 'ir': d.sensor=d.sensor==='EO'?'IR':'EO'; log('i','SENSOR',d.cs+' → '+(d.sensor==='IR'?'thermal':'electro-optical')); break;
      case 'zin': d.zoom=Math.min(8,+(d.zoom+(d.zoom<2?.5:1)).toFixed(1)); break;
      case 'zout': d.zoom=Math.max(1,+(d.zoom-(d.zoom<=2?.5:1)).toFixed(1)); break;
      case 'snap': d.snaps++; flash=6; chirp(1400,.05); log('o','CAPTURE',d.cs+' snapshot saved to evidence (#'+d.snaps+')'); break;
      case 'spot': d.spot=!d.spot; log('i','PAYLOAD',d.cs+' spotlight '+(d.spot?'ON':'off')); break;
      case 'beacon': d.beacon=!d.beacon; log('i','PAYLOAD',d.cs+' strobes '+(d.beacon?'ON':'off')); break;
      case 'siren': d.siren=!d.siren; d.siren?sirenOn():sirenOff(); log(d.siren?'a':'i','PAYLOAD',d.cs+' siren '+(d.siren?'ACTIVATED':'off')); break;
      case 'pa': d.pa=true; chirp(520,.12); setTimeout(function(){chirp(760,.1);},140);
        log('a','PA',d.cs+' broadcasting to the scene');
        setTimeout(function(){d.pa=false;paint();},4000); break;
      case 'orbit': d.mode='orbit'; d.hold=false; log('i','FLIGHT',d.cs+' orbiting target'); break;
      case 'hold': d.hold=!d.hold; log('i','FLIGHT',d.cs+(d.hold?' holding position':' resuming')); break;
      case 'land': if(d.status==='landed'){toast('Already landed');break;} d.status='landed'; d.alt=0; d.spd=0; d.hold=true; log('i','FLIGHT',d.cs+' landing in place'); break;
      case 'rth': rth(d); break;
    }
    paint();
  }
  var flash=0;

  /* ---- simulation ---- */
  var last=performance.now();
  function step(now){
    var dt=Math.min((now-last)/1000,.1); last=now;
    drones.forEach(function(d){
      var P=PLAT[d.plat];
      if(d.status==='enroute'||d.status==='returning'){
        var tgt=d.status==='enroute'?d.target:d.home;
        if(tgt){
          if(d.status==='enroute'&&d.hold){d.spd=0;d.alt=P.alt;}
          else{
            var dp=dist(d,tgt), sp=(P.speed/3600)/UNIT_MI*SIMX, mv=sp*dt;
            d.hd=hdg(d,tgt);
            if(dp<=mv){
              d.x=tgt.x;d.y=tgt.y;
              if(d.status==='enroute'){
                d.status='onscene';d.spd=0;d.alt=P.alt;
                if(d.target){d.target.status='active';times.push(Math.round(22+(d.simT||0)));
                  log('o','ON SCENE',d.cs+' overwatch established on '+d.target.id);}
              } else { d.status='charging';d.alt=0;d.spd=0;d.target=null;d.rec=false;log('i','DOCKED',d.cs+' secured — recharging'); }
              render();
            } else {
              d.x+=(tgt.x-d.x)/dp*mv; d.y+=(tgt.y-d.y)/dp*mv;
              d.alt=P.alt; d.spd=P.speed+ri(-4,4); d.bat=Math.max(0,d.bat-dt*.5); d.eta=etaTo(d,tgt);
              d.simT=(d.simT||0)+dt*SIMX;          // simulated seconds of flight
            }
          }
        }
      } else if(d.status==='onscene'){
        d.bat=Math.max(0,d.bat-dt*.28);
        if(d.mode==='orbit'&&!d.hold&&d.target){
          d.ang+=dt*.9; d.x=d.target.x+Math.cos(d.ang)*18; d.y=d.target.y+Math.sin(d.ang)*18;
          d.hd=(d.ang*180/Math.PI+90)%360; d.spd=8+ri(0,3); d.alt=P.alt+Math.round(Math.sin(now/900)*6);
        } else { d.spd=0; d.alt=P.alt; }
        if(d.bat<22){ log('a','LOW BAT',d.cs+' battery '+Math.round(d.bat)+'% — auto return'); rth(d); }
      } else if(d.status==='landed'){ d.alt=0; d.spd=0; }
      else if(d.status==='charging'){ d.bat=Math.min(100,d.bat+dt*2.4); if(d.bat>=100) d.status='ready'; }
      else if(d.status==='ready'){ d.bat=Math.min(100,d.bat+dt*.4); }
    });
    drawMap(); drawTel(); drawFeed(now);
    requestAnimationFrame(step);
  }

  /* ---- map ---- */
  function baseMap(){
    var s='<g stroke="rgba(255,255,255,.06)" stroke-width="1">';
    for(var x=0;x<=W;x+=40) s+='<line x1="'+x+'" y1="0" x2="'+x+'" y2="'+H+'"/>';
    for(var y=0;y<=H;y+=40) s+='<line x1="0" y1="'+y+'" x2="'+W+'" y2="'+y+'"/>';
    s+='</g><g stroke="rgba(255,255,255,.15)" stroke-width="5" stroke-linecap="round">';
    s+='<line x1="0" y1="235" x2="800" y2="235"/><line x1="0" y1="400" x2="800" y2="400"/>';
    s+='<line x1="265" y1="0" x2="265" y2="520"/><line x1="530" y1="0" x2="530" y2="520"/></g>';
    DOCKS.forEach(function(k){
      s+='<circle cx="'+k.x+'" cy="'+k.y+'" r="120" fill="none" stroke="rgba(198,161,91,.13)" stroke-dasharray="3 7"/>';
      s+='<rect x="'+(k.x-8)+'" y="'+(k.y-8)+'" width="16" height="16" fill="#0A0A0B" stroke="#D2AC64" stroke-width="2" transform="rotate(45 '+k.x+' '+k.y+')"/>';
      s+='<text x="'+(k.x+14)+'" y="'+(k.y+4)+'" fill="#5F7492" font-family="IBM Plex Mono" font-size="10">'+k.name+'</text>';
    });
    $('#mapBase').innerHTML=s;
  }
  function drawMap(){
    var s='';
    drones.forEach(function(d){
      if(d.status==='enroute'&&d.target) s+='<line x1="'+d.x.toFixed(0)+'" y1="'+d.y.toFixed(0)+'" x2="'+d.target.x+'" y2="'+d.target.y+'" stroke="rgba(233,162,59,.5)" stroke-width="1.5" stroke-dasharray="5 5"/>';
      else if(d.status==='returning') s+='<line x1="'+d.x.toFixed(0)+'" y1="'+d.y.toFixed(0)+'" x2="'+d.home.x+'" y2="'+d.home.y+'" stroke="rgba(53,224,216,.4)" stroke-width="1.5" stroke-dasharray="5 5"/>';
    });
    calls.forEach(function(c){
      if(c.status==='cleared') return;
      var col=c.prio===1?'#FF5A4E':c.prio===2?'#E9A23B':'#93A7C4';
      var sel=selCall&&selCall.id===c.id?'<circle cx="'+c.x+'" cy="'+c.y+'" r="15" fill="none" stroke="#C6A15B" stroke-width="2"/>':'';
      var pulse=c.status==='pending'?'<circle cx="'+c.x+'" cy="'+c.y+'" r="12" fill="'+col+'" opacity=".22"><animate attributeName="r" values="8;20;8" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values=".3;0;.3" dur="1.8s" repeatCount="indefinite"/></circle>':'';
      s+='<g data-call="'+c.id+'" style="cursor:pointer">'+pulse+sel+
         '<path d="M'+c.x+' '+(c.y-12)+' c-7 0 -7 10 0 14 c7 -4 7 -14 0 -14 Z" fill="'+col+'"/>'+
         '<circle cx="'+c.x+'" cy="'+(c.y-8)+'" r="2.6" fill="#040404"/></g>';
    });
    drones.forEach(function(d){
      if(d.status==='ready'||d.status==='charging'){
        s+='<g data-drone="'+d.cs+'" style="cursor:pointer"><circle cx="'+(d.home.x-20)+'" cy="'+(d.home.y-6)+'" r="3.5" fill="'+(d.status==='ready'?'#3DD68C':'#93A7C4')+'"/></g>';
        return;
      }
      var col=d.status==='enroute'?'#E9A23B':d.status==='returning'?'#35E0D8':d.status==='landed'?'#4E86F0':'#E8CE86';
      var ring=selDrone&&selDrone.cs===d.cs?'<circle r="14" fill="none" stroke="#E8CE86" stroke-width="1.5" opacity=".8"/>':'';
      var scene=d.status==='onscene'?'<circle r="20" fill="none" stroke="'+col+'" stroke-width="1.4" opacity=".5"><animate attributeName="r" values="14;26;14" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".6;0;.6" dur="2.4s" repeatCount="indefinite"/></circle>':'';
      var spot=d.spot?'<circle r="26" fill="rgba(232,206,134,.15)"/><circle r="13" fill="rgba(232,206,134,.26)"/>':'';
      var beac=d.beacon?'<circle cx="-8" cy="-8" r="3.2" fill="#FF5A4E"><animate attributeName="opacity" values="1;0;1" dur=".5s" repeatCount="indefinite"/></circle><circle cx="8" cy="-8" r="3.2" fill="#4E86F0"><animate attributeName="opacity" values="0;1;0" dur=".5s" repeatCount="indefinite"/></circle>':'';
      var sir=d.siren?'<circle r="28" fill="none" stroke="#FF5A4E" stroke-width="1"><animate attributeName="r" values="10;32;10" dur="1s" repeatCount="indefinite"/><animate attributeName="opacity" values=".7;0;.7" dur="1s" repeatCount="indefinite"/></circle>':'';
      s+='<g data-drone="'+d.cs+'" style="cursor:pointer" transform="translate('+d.x.toFixed(1)+','+d.y.toFixed(1)+')">'+
         spot+sir+scene+ring+'<g transform="rotate('+d.hd.toFixed(0)+')"><path d="M0 -9 L6 8 L0 4 L-6 8 Z" fill="'+col+'" stroke="#040404" stroke-width="1"/></g>'+beac+
         '<text y="-15" text-anchor="middle" fill="'+col+'" font-family="Oxanium" font-weight="700" font-size="10">'+d.cs+'</text></g>';
    });
    mapLive.innerHTML=s;
    var a=selDrone;
    $('#mapPos').textContent = a&&airborne(a) ? a.cs+' '+ll(a.x,a.y) : '—';
  }

  /* ---- lists ---- */
  function ago(t){var s=Math.floor((Date.now()-t)/1000);return s<60?s+'s ago':Math.floor(s/60)+'m ago';}
  function renderCalls(){
    var a=calls.filter(function(c){return c.status!=='cleared';});
    $('#cCallN').textContent=a.length;
    $('#callList').innerHTML=a.map(function(c){
      return '<div class="call'+(selCall&&selCall.id===c.id?' on':'')+'" data-call="'+c.id+'">'+
        '<div class="call-r1"><span class="pri p'+c.prio+'">P'+c.prio+'</span>'+
        '<span class="call-s s-'+c.status+'">'+c.status.toUpperCase()+'</span>'+
        '<span class="call-id">'+c.id+'</span></div>'+
        '<div class="call-t">'+c.type+'</div><div class="call-a">'+c.addr+'</div>'+
        '<div class="call-a" style="color:var(--mist-dim);margin-top:3px">'+ago(c.t)+(c.drone?' · <span style="color:var(--gold)">◇ '+c.drone+'</span>':'')+'</div></div>';
    }).join('');
  }
  function renderFleet(){
    var ready=0;
    $('#fleetList').innerHTML=drones.map(function(d){
      if(d.status==='ready') ready++;
      var lbl={ready:'READY',enroute:'EN ROUTE',onscene:'ON SCENE',returning:'RETURNING',charging:'CHARGING',landed:'LANDED'}[d.status];
      var col=d.bat>50?'var(--green)':d.bat>25?'var(--amber)':'var(--alert)';
      var stc={ready:'var(--green)',enroute:'var(--amber)',onscene:'var(--gold-hi)',returning:'var(--signal)',charging:'var(--mist)',landed:'var(--blue)'}[d.status];
      return '<div class="call'+(selDrone&&selDrone.cs===d.cs?' on':'')+'" data-drone="'+d.cs+'" style="display:flex;gap:10px;align-items:center">'+
        '<div style="flex:1"><div class="call-t">'+d.cs+' <span style="font-family:\'IBM Plex Mono\';font-size:9.5px;color:var(--mist-dim)">'+d.plat+'</span></div>'+
        '<div class="call-a">'+(d.status==='enroute'&&d.target?'→ '+d.target.id+' · '+mmss(d.eta):d.status==='onscene'&&d.target?'overwatch · '+d.target.id:'&nbsp;')+'</div></div>'+
        '<div style="text-align:right"><div style="font-family:Oxanium;font-weight:800;font-size:9px;color:'+stc+'">'+lbl+'</div>'+
        '<div class="data" style="font-size:11px;color:'+col+';margin-top:3px">'+Math.round(d.bat)+'%</div></div></div>';
    }).join('');
    $('#cReadyN').textContent=ready+' ready';
    $('#cOnline').textContent=drones.length;
  }
  function renderBar(){
    var t=$('#selT'), s=$('#selS'), b=$('#btnDispatch');
    if(!selCall){ t.textContent='No call selected'; s.textContent='Pick a call from the queue to task an aircraft.'; b.disabled=true; b.textContent='Dispatch'; return; }
    t.textContent='P'+selCall.prio+' · '+selCall.type;
    s.textContent=selCall.id+' · '+selCall.addr;
    if(selCall.status==='pending'){
      var d=nearest(selCall);
      if(d){ b.disabled=false; b.textContent='Dispatch '+d.cs+' · '+mmss(etaTo(d,selCall)); }
      else { b.disabled=true; b.textContent='No aircraft available'; }
    } else { b.disabled=true; b.textContent=selCall.status==='assigned'?'En route':'On scene'; }
  }
  function paint(){
    var d=selDrone, air=airborne(d);
    $('#opCs').textContent = d? d.cs+' · '+d.plat : 'standby';
    $$('.cbtn').forEach(function(b){
      var a=b.dataset.ctl;
      var en = a==='rth' ? (d&&['enroute','onscene','landed'].indexOf(d.status)>=0) : air;
      b.classList.toggle('locked',!en);
      b.classList.remove('on','red','blue');
      if(!d) return;
      if(a==='ir'&&d.sensor==='IR') b.classList.add('on');
      if(a==='spot'&&d.spot) b.classList.add('on');
      if(a==='beacon'&&d.beacon) b.classList.add('on','blue');
      if(a==='siren'&&d.siren) b.classList.add('on','red');
      if(a==='hold'&&d.hold) b.classList.add('on');
      if(a==='land'&&d.status==='landed') b.classList.add('on','blue');
      if(a==='orbit'&&d.status==='onscene'&&!d.hold) b.classList.add('on');
    });
    $('#irL').textContent = d&&d.sensor==='IR' ? 'EO camera' : 'Thermal';
    $('#feedOff').style.display = air ? 'none' : 'flex';
    $('#feedRec').style.display = air&&d.rec ? 'flex' : 'none';
    $('#feedChip').textContent = d ? d.sensor+' · '+d.zoom.toFixed(1)+'×' : '—';
    $('#pcSpot').style.display = air&&d.spot?'block':'none';
    $('#pcBeacon').style.display = air&&d.beacon?'block':'none';
    $('#pcSiren').style.display = air&&d.siren?'block':'none';
  }
  function drawTel(){
    var d=selDrone; if(!d) return;
    var on=['enroute','onscene','returning'].indexOf(d.status)>=0;
    $('#tBat').textContent=Math.round(d.bat);
    $('#tAlt').textContent=Math.round(d.alt);
    $('#tSpd').textContent=Math.round(d.spd);
    $('#tHdg').textContent=on?Math.round(d.hd):'—';
    var tgt=d.status==='returning'?d.home:d.target;
    $('#tDist').textContent=tgt?(dist(d,tgt)*UNIT_MI).toFixed(2):'—';
    $('#tEta').textContent=d.status==='onscene'?'ON SCENE':d.status==='enroute'?mmss(d.eta):'—';
    if(on&&d.rec){var s=Math.floor(22+(d.simT||0));$('#recT').textContent=pad2(Math.floor(s/60))+':'+pad2(s%60);}
    $('#kFlights').textContent=flights;
    $('#kActive').textContent=drones.filter(function(x){return ['enroute','onscene','returning','landed'].indexOf(x.status)>=0;}).length;
    $('#kAvg').textContent=times.length?mmss(times.reduce(function(a,b){return a+b;},0)/times.length):'—';
  }
  function render(){ renderCalls(); renderFleet(); renderBar(); paint(); }

  /* ---- feed ---- */
  var cv=$('#feed'), cx=cv.getContext('2d');
  function drawFeed(now){
    var d=selDrone, w=cv.width, h=cv.height;
    if(!d||['enroute','onscene','returning'].indexOf(d.status)<0){cx.clearRect(0,0,w,h);return;}
    var ir=d.sensor==='IR', fly=d.status!=='onscene', t=now/1000, z=d.zoom;
    cx.fillStyle=ir?'#050505':'#0b0b0c'; cx.fillRect(0,0,w,h);
    var cell=80*z, px=fly?(t*40*z)%cell:Math.sin(t*.4)*8, py=fly?(t*26*z)%cell:Math.cos(t*.4)*8;
    cx.save(); cx.translate(-px,-py);
    for(var gx=-1;gx<w/cell+2;gx++)for(var gy=-1;gy<h/cell+2;gy++){
      var sd=(((gx+99)*928371+(gy+77)*1237)%97)/97;
      var bx=gx*cell+10*z, by=gy*cell+10*z, bw=(44+sd*20)*z, bh=(44+((sd*13)%1)*18)*z;
      if(ir){ cx.fillStyle = sd>.72?'rgba(230,'+Math.round(120+sd*60)+',60,.9)':sd>.4?'rgba('+Math.round(90+sd*80)+','+Math.round(90+sd*70)+',110,.8)':'rgba(20,26,38,.9)'; }
      else { cx.fillStyle='rgb('+Math.round(30+sd*20)+','+Math.round(44+sd*22)+','+Math.round(60+sd*26)+')'; }
      cx.fillRect(bx,by,bw,bh);
    }
    cx.strokeStyle=ir?'rgba(120,140,166,.1)':'rgba(120,140,166,.18)'; cx.lineWidth=6*z;
    for(gx=0;gx<w/cell+2;gx++){cx.beginPath();cx.moveTo(gx*cell,-10);cx.lineTo(gx*cell,h+10);cx.stroke();}
    for(gy=0;gy<h/cell+2;gy++){cx.beginPath();cx.moveTo(-10,gy*cell);cx.lineTo(w+10,gy*cell);cx.stroke();}
    cx.restore();
    if(d.spot){ var lx=w/2, ly=h*.62, g=cx.createRadialGradient(lx,ly,4,lx,ly,110*z);
      g.addColorStop(0,'rgba(255,244,210,.5)');g.addColorStop(.5,'rgba(255,240,200,.18)');g.addColorStop(1,'rgba(255,240,200,0)');
      cx.fillStyle=g;cx.beginPath();cx.arc(lx,ly,110*z,0,7);cx.fill(); }
    var vg=cx.createRadialGradient(w/2,h/2,h*.2,w/2,h/2,h*.75);
    vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.55)');cx.fillStyle=vg;cx.fillRect(0,0,w,h);
    if(d.status==='onscene'){
      var rx=w/2+Math.sin(t*.5)*6, ry=h/2+Math.cos(t*.5)*6;
      cx.strokeStyle=ir?'#ff7a3c':'#E8CE86';cx.lineWidth=1.4;cx.strokeRect(rx-32,ry-28,64,56);
      cx.beginPath();cx.moveTo(rx-42,ry);cx.lineTo(rx-32,ry);cx.moveTo(rx+32,ry);cx.lineTo(rx+42,ry);
      cx.moveTo(rx,ry-38);cx.lineTo(rx,ry-28);cx.moveTo(rx,ry+28);cx.lineTo(rx,ry+38);cx.stroke();
      cx.fillStyle=ir?'#ff7a3c':'#E8CE86';cx.font='600 9px IBM Plex Mono';cx.fillText('TARGET LOCK',rx-31,ry-33);
    }
    cx.strokeStyle='rgba(198,161,91,.5)';cx.lineWidth=1.4;
    [[8,8,1,1],[w-8,8,-1,1],[8,h-8,1,-1],[w-8,h-8,-1,-1]].forEach(function(c2){
      cx.beginPath();cx.moveTo(c2[0],c2[1]+14*c2[3]);cx.lineTo(c2[0],c2[1]);cx.lineTo(c2[0]+14*c2[2],c2[1]);cx.stroke();
    });
    cx.fillStyle='#EAF1FA';cx.font='600 10px IBM Plex Mono';cx.fillText(d.cs+'  '+d.plat,14,20);
    cx.fillStyle=ir?'#ff9a3c':'#E8CE86';cx.font='600 9px IBM Plex Mono';
    cx.fillText('ALT '+Math.round(d.alt)+'ft',14,h-12);
    cx.fillText('SPD '+Math.round(d.spd)+'mph',96,h-12);
    cx.fillText('HDG '+Math.round(d.hd)+'°',186,h-12);
    cx.fillStyle=d.bat>25?'#3DD68C':'#FF5A4E';cx.fillText('BAT '+Math.round(d.bat)+'%',258,h-12);
    if(d.pa){cx.fillStyle='rgba(61,214,140,.9)';cx.font='700 10px Oxanium';cx.textAlign='center';cx.fillText('▶ PA BROADCAST LIVE',w/2,h-28);cx.textAlign='left';}
    if(d.siren){cx.fillStyle='rgba(255,90,78,'+(.5+Math.abs(Math.sin(t*6))*.4)+')';cx.fillRect(0,0,w,3);cx.fillRect(0,h-3,w,3);}
    cx.fillStyle='rgba(0,0,0,.06)';for(var y=0;y<h;y+=3)cx.fillRect(0,y,w,1);
    if(flash>0){cx.fillStyle='rgba(255,255,255,'+(flash/6*.8)+')';cx.fillRect(0,0,w,h);flash--;}
  }

  /* ---- events ---- */
  $('#callList').addEventListener('click',function(e){
    var el=e.target.closest('[data-call]'); if(!el) return;
    selCall=calls.filter(function(c){return c.id===el.dataset.call;})[0];
    if(selCall.drone) selDrone=drones.filter(function(d){return d.cs===selCall.drone;})[0];
    render();
  });
  $('#fleetList').addEventListener('click',function(e){
    var el=e.target.closest('[data-drone]'); if(!el) return;
    selDrone=drones.filter(function(d){return d.cs===el.dataset.drone;})[0];
    if(selDrone.target) selCall=selDrone.target;
    render();
  });
  $('#conMap').addEventListener('click',function(e){
    var c=e.target.closest('[data-call]');
    if(c){ selCall=calls.filter(function(x){return x.id===c.dataset.call;})[0]; render(); return; }
    var d=e.target.closest('[data-drone]');
    if(d){ selDrone=drones.filter(function(x){return x.cs===d.dataset.drone;})[0]; if(selDrone.target) selCall=selDrone.target; render(); }
  });
  $('#btnDispatch').addEventListener('click',function(){
    if(selCall&&selCall.status==='pending'){ var d=nearest(selCall); if(d) dispatch(selCall,d,false); }
  });
  $('#btnRTH').addEventListener('click',function(){ rth(selDrone); });
  $$('.cbtn').forEach(function(b){ b.addEventListener('click',function(){ ctl(b.dataset.ctl); }); });

  /* ---- clock + new calls ---- */
  setInterval(function(){
    $('#cClock').textContent=new Date().toLocaleTimeString('en-US',{hour12:false});
    renderCalls();
  },1000);
  setInterval(function(){
    if(Math.random()<.6){
      var ty=rand(TYPES);
      var c={id:'CAD-'+(++seq),type:ty.t,prio:ty.p,
        addr:(ri(4,88)*100)+' '+(Math.random()<.5?'S':'N')+' '+rand(STREETS),
        x:ri(80,720),y:ri(70,450),t:Date.now(),status:'pending',drone:null};
      calls.unshift(c);
      log('a','DISPATCH',c.id+' · P'+c.prio+' '+c.type+' — '+c.addr);
      renderCalls();
    }
  },18000);

  /* ---- scripted demo mission ---- */
  var timers=[], running=false;
  function say(tag,msg){ $('#demoStep').innerHTML='<b>'+tag+'</b>'+msg; }
  function at(ms,fn){ timers.push(setTimeout(fn,ms)); }
  function stopDemo(){
    running=false; timers.forEach(clearTimeout); timers=[];
    $('#demoBtn').textContent='▶ Play demo mission';
    say('SCRIPTED WALKTHROUGH','Five stages: dispatch, arrival, thermal, spotlight and siren, then return to dock.');
  }
  function playDemo(){
    if(running){ stopDemo(); return; }
    running=true; $('#demoBtn').textContent='■ Stop';
    var d=drones.filter(function(x){return x.cs==='AERO-2';})[0];
    d.status='ready'; d.bat=100; d.target=null; d.sensor='EO'; d.zoom=1;
    d.spot=false; d.beacon=false; d.pa=false; if(d.siren){d.siren=false;sirenOff();}
    var c={id:'CAD-'+(++seq),type:'Armed robbery in progress',prio:1,addr:'20800 Valley Blvd',
      x:400,y:200,t:Date.now(),status:'pending',drone:null};
    calls.unshift(c); selCall=c; selDrone=d; render();
    log('a','DISPATCH',c.id+' · P1 Armed robbery in progress — 20800 Valley Blvd');
    say('01 · CALL RECEIVED','Priority-one robbery at 20800 Valley Blvd. The console recommends the nearest ready aircraft.');
    at(2600,function(){ dispatch(c,d,false); say('02 · LAUNCHED','AERO-2 is airborne and streaming. Watch the flight path and the telemetry.'); });
    var w=setInterval(function(){
      if(!running){clearInterval(w);return;}
      if(d.status==='onscene'){
        clearInterval(w);
        say('03 · OVERHEAD','Overwatch established — live video on scene before any ground unit.');
        at(2000,function(){ ctl('ir'); say('03 · THERMAL','Thermal sensor selected. Heat signatures show through darkness and cover.'); });
        at(4800,function(){ ctl('zin'); ctl('zin'); say('03 · ZOOM','Optical zoom tightens on the target while the aircraft holds its orbit.'); });
        at(7600,function(){ ctl('snap'); say('04 · EVIDENCE','Snapshot captured and logged to the evidence record.'); });
        at(10000,function(){ ctl('spot'); ctl('beacon'); say('04 · PAYLOAD','Spotlight and strobes on — the aircraft lights the scene and makes itself visible.'); });
        at(13000,function(){ ctl('siren'); say('04 · SIREN','Siren active. Click anywhere first if your browser has blocked audio.'); });
        at(16500,function(){ ctl('siren'); ctl('pa'); say('04 · LOUDSPEAKER','Broadcasting over the aircraft PA to the scene below.'); });
        at(20500,function(){ ctl('rth'); say('05 · RETURN TO DOCK','Mission complete. AERO-2 flies home, re-docks and recharges for the next call.'); });
        at(25500,stopDemo);
      }
    },400);
  }
  $('#demoBtn').addEventListener('click',playDemo);

  /* ---- boot: start with a live scene so the console looks alive ---- */
  baseMap();
  log('i','SYSTEM','AeroAssist DFR console online — Walnut, CA · 6 aircraft nominal');
  log('o','SYSTEM','Dock stations reporting · secure link established');
  (function(){
    var c=calls[0], d=drones[0];
    d.status='onscene'; d.target=c; d.x=c.x; d.y=c.y; d.alt=PLAT[d.plat].alt; d.rec=true;
    d.launch=Date.now()-92000; c.status='active'; c.drone=d.cs; flights++; times.push(92);
    log('o','ON SCENE',d.cs+' overwatch active on '+c.id);
    var c2=calls[2], d2=drones[3];
    d2.status='enroute'; d2.target=c2; d2.launch=Date.now(); d2.eta=etaTo(d2,c2); d2.rec=true;
    c2.status='assigned'; c2.drone=d2.cs; flights++;
    log('d','LAUNCH',d2.cs+' ('+d2.plat+') tasked to '+c2.id);
    selDrone=d; selCall=c;
  })();
  render();
  requestAnimationFrame(step);
})();

/* ==========================================================
   8. CALL TYPES EXPLORER
   ========================================================== */
(function(){
  var list=document.getElementById('ctList'); if(!list) return;
  var DATA=[
    {n:'Armed subject / robbery',s:'PRIORITY ONE',score:'Highest',plat:'XR-2',sensor:'EO + thermal',hold:'Long hold',
     c:'The call where arriving blind costs the most. Overhead video gives responders a count of subjects, a direction of travel and a layout of the property before anyone steps out of a vehicle.',
     w:['Units approach on a caller description alone','Containment set after arrival, often too late','No view of a rear exit or second subject'],
     a:['Subject count and location before arrival','Perimeter placed on real geometry, not guesswork','Continuous view while the scene develops']},
    {n:'Structure fire',s:'PRIORITY ONE',score:'Highest',plat:'XR-2',sensor:'Thermal',hold:'Long hold',
     c:'Thermal from above shows where a fire actually is and where it is going, which changes the interior approach and tells command whether the roof is a place anyone should be.',
     w:['Size-up happens from the street on arrival','Roof and rear conditions unknown','Hot spots found by walking the structure'],
     a:['360-degree size-up before the first engine arrives','Heat behavior visible through smoke','Overhaul guided by thermal instead of guesswork']},
    {n:'Missing person / search',s:'TIME CRITICAL',score:'Highest',plat:'XR-3',sensor:'Thermal',hold:'Long hold',
     c:'Search is arithmetic: area covered per minute. One aircraft with thermal covers ground that would take a dozen people on foot, and it works in the dark, which is when most searches happen.',
     w:['Ground search grids consume every available unit','Darkness and terrain stall progress','Hours pass before mutual aid arrives'],
     a:['Wide-area thermal sweep within minutes','Ground teams directed to actual heat signatures','Searchable area expands instead of the clock running']},
    {n:'Vehicle pursuit',s:'HIGH RISK',score:'High',plat:'XR-3',sensor:'EO',hold:'Medium hold',
     c:'The safest pursuit is often the one units back out of while something overhead keeps the vehicle in sight. Aerial tracking lets a supervisor terminate ground pursuit without losing the subject.',
     w:['Speed and risk escalate to keep visual','Terminating pursuit means losing the vehicle','Danger to the public rises with every mile'],
     a:['Visual maintained from above','Ground units can disengage and shadow','Containment set where the vehicle actually stops']},
    {n:'Traffic collision',s:'PRIORITY TWO',score:'High',plat:'XR-1',sensor:'EO + mapping',hold:'Short hold',
     c:'Two jobs at once: tell incoming units what they need, and document the scene from above so the roadway reopens sooner.',
     w:['Resource needs unclear until arrival','Reconstruction closes lanes for hours','Scene documented on foot with a wheel'],
     a:['Extrication and medical needs known en route','Overhead capture in minutes','Lanes reopen while analysis happens later']},
    {n:'Alarm activation',s:'PRIORITY THREE',score:'Moderate',plat:'XR-1',sensor:'EO',hold:'Short hold',
     c:'Most alarms are nothing. That is exactly the point: a two-minute look from above closes the call without sending a unit across the district.',
     w:['A unit is committed to every alarm','Time spent on calls that were never real','Fewer units available for genuine calls'],
     a:['Exterior checked from the air first','Unfounded calls closed without a ground unit','Real break-ins get a unit with a description']},
    {n:'Welfare check',s:'PRIORITY THREE',score:'Moderate',plat:'XR-1',sensor:'EO + thermal',hold:'Short hold',
     c:'Useful for the exterior picture and for spotting someone down in a yard or a field. It informs the response but rarely resolves the call on its own.',
     w:['Unit dispatched with no context','No view of the rear of the property'],
     a:['Exterior condition visible before contact','Person down in a yard spotted quickly','Medical staged if the picture warrants it']},
    {n:'Crowd / large event',s:'PLANNED',score:'High',plat:'XR-2',sensor:'EO',hold:'Long hold',
     c:'Planned operations are where sustained endurance matters most. A continuous overhead picture lets command move resources against crowd flow rather than react to reports.',
     w:['Crowd density estimated from the ground','Bottlenecks discovered when they fail','Command relies on radio reports'],
     a:['Live density and flow from above','Resources moved before a crush forms','Documented record of the operation']}
  ];
  function render(i){
    var d=DATA[i];
    Array.prototype.forEach.call(list.children,function(el,k){el.classList.toggle('on',k===i);});
    document.getElementById('ctName').textContent=d.n;
    document.getElementById('ctSub').textContent=d.s;
    document.getElementById('ctScore').textContent=d.score;
    document.getElementById('ctCopy').textContent=d.c;
    document.getElementById('ctWithout').innerHTML=d.w.map(function(x){return '<li>'+x+'</li>';}).join('');
    document.getElementById('ctWith').innerHTML=d.a.map(function(x){return '<li>'+x+'</li>';}).join('');
    document.getElementById('ctSensor').textContent=d.sensor;
    document.getElementById('ctPlat').textContent=d.plat;
    document.getElementById('ctHold').textContent=d.hold;
  }
  list.innerHTML=DATA.map(function(d,i){
    return '<button class="ct-item'+(i===0?' on':'')+'" data-i="'+i+'"><span class="bar"></span><span class="nm">'+d.n+'</span><span class="sc">'+d.score+'</span></button>';
  }).join('');
  list.addEventListener('click',function(e){
    var b=e.target.closest('[data-i]'); if(b) render(+b.dataset.i);
  });
  render(0);
})();

/* ==========================================================
   9. AIRCRAFT ANATOMY
   ========================================================== */
(function(){
  var svg=document.getElementById('anatSvg'); if(!svg) return;
  var D={
    powertrain:{n:'01',t:'Hybrid gas-electric powertrain',
      p:'A compact combustion generator charges the flight battery while airborne, so endurance is governed by fuel rather than cell capacity. That is the difference between covering an incident and leaving in the middle of one.',
      tags:['Endurance','Refuels at dock','XR-1 / XR-2 / XR-3']},
    gimbal:{n:'02',t:'Stabilized EO/IR gimbal',
      p:'The camera is the product. A stabilized gimbal holds a usable picture in wind and while the aircraft orbits, and switches between daylight optical zoom and thermal without landing.',
      tags:['Optical zoom','Thermal','Target lock']},
    rotors:{n:'03',t:'Propulsion and redundancy',
      p:'Oversized rotors turning slower move the same air with less noise and more margin. The airframe is designed to stay controllable and reach a safe landing if a motor is lost.',
      tags:['Quieter profile','Fault tolerant','Wind margin']},
    comms:{n:'04',t:'Command and video link',
      p:'Encrypted control and video over a redundant link, with graceful degradation: if bandwidth drops the aircraft keeps flying its task and video quality steps down rather than the feed dying.',
      tags:['Encrypted','Redundant','Degrades gracefully']},
    payload:{n:'05',t:'Public-safety payload bay',
      p:'Spotlight, loudspeaker and strobes mount to a common bay, so an agency can configure an airframe for night patrol support or standoff communication without a different aircraft.',
      tags:['Spotlight','Loudspeaker','Strobes']},
    avionics:{n:'06',t:'Avionics and autonomy',
      p:'NDAA-compliant flight computer handling launch, transit, orbit and return without a pilot on the sticks. The operator directs the mission; the aircraft flies it.',
      tags:['NDAA §848','Auto launch and return','Orbit and hold']}
  };
  var hots=Array.prototype.slice.call(svg.querySelectorAll('.hot'));
  function show(key){
    hots.forEach(function(h){h.classList.toggle('on',h.dataset.hot===key);});
    var d=D[key];
    document.getElementById('anatN').textContent=d.n;
    document.getElementById('anatT').textContent=d.t;
    document.getElementById('anatP').textContent=d.p;
    document.getElementById('anatTags').innerHTML=d.tags.map(function(t){return '<span>'+t+'</span>';}).join('');
  }
  hots.forEach(function(h){ h.addEventListener('click',function(){ show(h.dataset.hot); }); });
  show('powertrain');
})();

/* ==========================================================
   10. ROI COMPARISON
   ========================================================== */
(function(){
  var calls=document.getElementById('rCalls'); if(!calls) return;
  var min=document.getElementById('rMin'), sites=document.getElementById('rSites'), wage=document.getElementById('rWage');
  var money=function(n){
    if(n>=1e6) return '$'+(n/1e6).toFixed(1)+'M';
    if(n>=1e3) return '$'+Math.round(n/1e3)+'K';
    return '$'+Math.round(n);
  };
  function calc(){
    var c=+calls.value, m=+min.value, s=+sites.value, w=+wage.value;
    document.getElementById('oRCalls').textContent=c;
    document.getElementById('oRMin').textContent=m+' min';
    document.getElementById('oRSites').textContent=s;
    document.getElementById('oRWage').textContent='$'+w;

    var flightHrs=c*365*(m/60);

    // Helicopter: crewed aviation, high hourly operating cost, cannot serve routine calls.
    var heliHourly=1200, heliCrew=2;
    var heliServed=Math.min(c,3);                    // realistically a few calls a day
    var heliHrs=heliServed*365*((m+18)/60);          // add transit and spin-up
    var heli=heliHrs*heliHourly + heliCrew*s*w*2080*0.35;
    var heliCover=Math.round(heliServed/c*100);

    // Manual team: two people per launch, drive time, limited to on-duty hours.
    var manualServed=Math.min(c,Math.round(6*s));
    var manualHrs=manualServed*365*((m+22)/60);      // add drive and setup
    var manual=manualHrs*w*2 + s*42000;              // crew time + equipment/vehicle
    var manualCover=Math.round(manualServed/c*100);

    // Docked DFR: one operator seat covers several sites, no drive time.
    var seats=Math.max(1,Math.ceil(s/3));
    var dfrOpHrs=seats*2080;
    var dfr=dfrOpHrs*w + s*38000 + flightHrs*38;      // operator time + per-site program cost + per-hour operating
    var dfrCover=100;

    var rows=[
      {k:'Helicopter',s:'CREWED AVIATION',v:heli,cov:heliCover,
       r:[['Calls served','~'+heliServed+'/day'],['Flight hours','~'+Math.round(heliHrs).toLocaleString()+'/yr'],['Time to scene','8–15 min']],best:false},
      {k:'Manual drone team',s:'DRIVE AND DEPLOY',v:manual,cov:manualCover,
       r:[['Calls served','~'+manualServed+'/day'],['Crew per launch','2 people'],['Time to scene','12–25 min']],best:false},
      {k:'AeroAssist docked',s:'AUTONOMOUS DFR',v:dfr,cov:dfrCover,
       r:[['Calls served',c+'/day'],['Operator seats',seats],['Time to scene','3–5 min']],best:true}
    ];
    document.getElementById('roiCards').innerHTML=rows.map(function(x){
      return '<div class="roi-card'+(x.best?' best':'')+'">'+
        '<h4>'+x.k+'</h4><div class="sub">'+x.s+'</div>'+
        '<div class="big">'+money(x.v)+'</div><div class="unit">modeled annual cost · '+x.cov+'% of eligible calls covered</div>'+
        '<div class="roi-rows">'+x.r.map(function(r){return '<div><span>'+r[0]+'</span><b>'+r[1]+'</b></div>';}).join('')+'</div></div>';
    }).join('');
  }
  [calls,min,sites,wage].forEach(function(el){el.addEventListener('input',calc);});
  calc();
})();

/* ==========================================================
   11. DEPLOYMENT ROADMAP
   ========================================================== */
(function(){
  var track=document.getElementById('roadTrack'); if(!track) return;
  var P=[
    {t:'Sector study',d:'Days 1–14',ph:'PHASE 1',
     p:'Before anything is ordered, we model your call data against your geography to work out whether DFR helps and where the docks belong.',
     l:['Call-type analysis against your CAD history','Coverage modeling for candidate dock sites','Airspace review, including controlled airspace and obstacles','A plain recommendation, including if the answer is not yet']},
    {t:'Authority and policy',d:'Days 10–75',ph:'PHASE 2',
     p:'The long pole. Airspace authority and operating policy run in parallel with everything else because they take the longest.',
     l:['Part 107 certification for your operators','LAANC provider setup','COA and BVLOS applications prepared with your counsel','Operating and retention policy drafted before the first flight']},
    {t:'Site and install',d:'Days 45–75',ph:'PHASE 3',
     p:'Physical work. Docks go where the study said they should, and network and power get commissioned.',
     l:['Structural and power assessment at each site','Dock installation and weather sealing','Network commissioning and link testing','Console integration with CAD and evidence systems']},
    {t:'Training and shadow ops',d:'Days 70–85',ph:'PHASE 4',
     p:'Your people learn the system on real flights that are not attached to real calls, then shadow live dispatch before taking any.',
     l:['Operator and supervisor courses','Supervised flights with no live tasking','Shadow operations alongside dispatch','Failure and lost-link scenario drills']},
    {t:'Go live',d:'Day 90',ph:'PHASE 5',
     p:'First tasked calls, with our team on site, and a deliberately narrow call-type list that widens as the program proves itself.',
     l:['Launch on a limited set of call types','Daily debriefs for the first two weeks','Metrics baseline established','Call-type list expanded as confidence builds']},
    {t:'Review and expand',d:'Ongoing',ph:'PHASE 6',
     p:'A program that is not measured gets cancelled. Reporting is built for the six-month conversation with your council.',
     l:['Monthly performance review against baseline','Public transparency reporting','Coverage gaps identified for additional docks','Recurrent training and annual program audit']}
  ];
  function show(i){
    Array.prototype.forEach.call(track.children,function(el,k){el.classList.toggle('on',k===i);});
    var p=P[i];
    document.getElementById('roadPh').textContent=p.ph;
    document.getElementById('roadT').textContent=p.t;
    document.getElementById('roadD').textContent=p.d;
    document.getElementById('roadP').textContent=p.p;
    document.getElementById('roadL').innerHTML=p.l.map(function(x){return '<li>'+x+'</li>';}).join('');
  }
  track.innerHTML=P.map(function(p,i){
    return '<button class="rd'+(i===0?' on':'')+'" data-i="'+i+'"><span class="num">'+(i+1)+'</span>'+
      '<span><span class="t">'+p.t+'</span><span class="d">'+p.d+'</span></span></button>';
  }).join('');
  track.addEventListener('click',function(e){var b=e.target.closest('[data-i]');if(b)show(+b.dataset.i);});
  show(0);
})();

/* ==========================================================
   12. FAQ
   ========================================================== */
(function(){
  var box=document.getElementById('faqList'); if(!box) return;
  var Q=[
    ['Do we need a pilot on a roof for every flight?',
     'No. That is the difference between DFR and a drone team. The aircraft launches from a dock and flies its task autonomously while an operator directs the mission from the console. You still need certificated operators and the airspace authority to fly this way, which is why the regulatory path above starts early.'],
    ['What happens if the link drops mid-flight?',
     'The aircraft continues its programmed task and, if the link does not recover within a set window, returns to its dock automatically. Lost-link behavior is configured before deployment and drilled during training, because it is one of the first things an oversight body will ask about.'],
    ['Is this surveillance?',
     'It should not be, and the system is built to keep it from becoming that. Aircraft launch against a call for service, every flight is logged with its incident number, and video access is auditable. Agencies that publish those numbers keep their programs. The ones that cannot answer the question lose them.'],
    ['How loud is it from the ground?',
     'Larger rotors turning more slowly move the same air with less noise than a small aircraft working hard, and typical overwatch altitude puts meaningful distance between the aircraft and the people below. Perceived noise depends on altitude, ambient conditions and the airframe, so ask for a demonstration over your own neighborhood rather than taking any vendor number at face value.'],
    ['Can it fly at night or in weather?',
     'Night operations are routine with the required lighting and authority, and thermal is most of the value after dark. Weather is a real limit: sustained high wind, icing and heavy precipitation ground aircraft, and the honest answer is that DFR supplements your response rather than replacing units that can drive through anything.'],
    ['What does it cost?',
     'It depends on dock count, coverage hours and how many aircraft your call volume needs, which is what the estimator and cost comparison above are for. Those are models, not quotes. A real number comes out of the sector study, and we would rather give you one you can defend in a budget hearing than a headline figure.'],
    ['Is it eligible for grant funding?',
     'Often, yes. NDAA §848 compliance and domestic manufacturing matter for federal and state public-safety funding, and we support the technical portions of applications. Eligibility rules change, so confirm the current terms of any specific program before building a budget around it.'],
    ['Who owns the video?',
     'Your agency does. Retention periods follow your policy, the system enforces them, and access is logged. Export to your existing records and digital evidence systems is part of the integration work, not an afterthought.'],
    ['What if our airspace is complicated?',
     'Most useful sectors are. LAANC handles routine controlled-airspace authorization near airports quickly, and the sector study maps obstacles, approach paths and restricted areas before any dock site is chosen. If the answer for a particular area is that DFR does not work there, we will tell you that during the study.'],
    ['Can it clear calls without sending a unit?',
     'That is where a lot of the operational value sits. Alarm activations, unfounded reports and some checks can be resolved from the air, which keeps a ground unit available for something that needs one. How much of your call volume that covers depends entirely on your call mix and your policy on what may be cleared remotely, which is one of the things the sector study looks at.'],
    ['How is this different from the drone our team already owns?',
     'A hand-flown drone needs someone to drive to the scene, set up and launch, which means it arrives after your units and only gets used on major calls. A docked aircraft launches on dispatch with nobody on site, so it is worth sending to routine calls too. The aircraft matters less than the fact that launching costs nobody anything.'],
    ['How many aircraft do we actually need?',
     'Fewer than most agencies expect, because a docked aircraft spends its time waiting rather than driving. The estimator above gives a working figure from your station count, coverage hours and call volume; the sector study replaces it with one built on your real data.']
  ];
  box.innerHTML=Q.map(function(q,i){
    return '<div class="fq" data-i="'+i+'"><button class="fq-q"><span>'+q[0]+'</span>'+
      '<svg class="ic" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>'+
      '<div class="fq-a"><p>'+q[1]+'</p></div></div>';
  }).join('');
  box.addEventListener('click',function(e){
    var btn=e.target.closest('.fq-q'); if(!btn) return;
    var fq=btn.parentNode, a=fq.querySelector('.fq-a'), open=fq.classList.contains('on');
    Array.prototype.forEach.call(box.children,function(x){
      x.classList.remove('on'); x.querySelector('.fq-a').style.maxHeight=null;
    });
    if(!open){ fq.classList.add('on'); a.style.maxHeight=a.scrollHeight+'px'; }
  });
})();

/* ==========================================================
   13. GLOSSARY
   ========================================================== */
(function(){
  var box=document.getElementById('glosList'); if(!box) return;
  var T=[
    ['DFR','Drone as First Responder. A program where an aircraft is dispatched to a call for service and arrives before ground units, rather than being brought to a scene afterward.'],
    ['BVLOS','Beyond Visual Line of Sight. Flying without a person keeping eyes on the aircraft. It requires a waiver and is what makes a docked program work across a whole sector.'],
    ['LAANC','Low Altitude Authorization and Notification Capability. The automated FAA system that grants airspace authorization near airports in near real time.'],
    ['COA','Certificate of Waiver or Authorization. The FAA instrument that covers public-aircraft operations for a government agency.'],
    ['Part 107','The FAA rules covering small commercial drone operations, including the remote pilot certificate your operators hold.'],
    ['NDAA §848','The federal provision restricting drone components and manufacturers from certain countries. Compliance determines whether a public agency can buy an aircraft at all.'],
    ['Overwatch','Holding position above an incident with a continuous view, as opposed to a single pass or a photo run.'],
    ['Dock','The enclosure the aircraft launches from, returns to, and services itself in. What removes crew time from every launch.'],
    ['EO','Electro-optical. The daylight camera, usually with optical zoom.'],
    ['IR','Infrared, or thermal. Shows heat rather than light, which is what finds people in the dark and reads fire behavior through smoke.'],
    ['CAD','Computer-Aided Dispatch. The system calls for service live in, and where DFR tasking should happen.'],
    ['RTCC','Real-Time Crime Center. A monitoring facility combining camera feeds and data, where an aircraft becomes one more movable source.'],
    ['Time to scene','Elapsed time from dispatch to a resource being on scene. The core DFR metric, measured against the first ground unit.'],
    ['Sortie','A single tasked flight, from launch to return.'],
    ['Lost link','Loss of the command connection to the aircraft, and the pre-programmed behavior that follows, usually return to dock.'],
    ['VTOL','Vertical Take-Off and Landing. An aircraft that launches vertically from a pad but can transition to more efficient wing-borne flight.']
  ];
  box.innerHTML=T.map(function(t){return '<div class="gt" data-term="'+(t[0]+' '+t[1]).toLowerCase()+'"><h4>'+t[0]+'</h4><p>'+t[1]+'</p></div>';}).join('');
  var q=document.getElementById('glosQ'), none=document.getElementById('glosNone');
  q.addEventListener('input',function(){
    var v=q.value.trim().toLowerCase(), shown=0;
    Array.prototype.forEach.call(box.children,function(el){
      var hit=!v||el.dataset.term.indexOf(v)>=0;
      el.style.display=hit?'':'none'; if(hit) shown++;
    });
    none.style.display=shown?'none':'block';
  });
})();


/* ==========================================================
   14. CLIENTS / AGENCIES
   ========================================================== */
(function(){
  var stat=document.getElementById('clA'); if(!stat) return;
  /* ----------------------------------------------------------
     EDIT THIS LIST.
     rel = the actual relationship. Use wording you can defend:
     "Customer", "Pilot program", "Evaluation", "Demonstration",
     "Training partner", "In procurement".
     cat = law | fire | gov | fed
     ---------------------------------------------------------- */
  var CLIENTS=[
    {n:'Arizona Department of Transportation', a:'ADOT', loc:'State of Arizona', cat:'gov',  rel:'Agency engagement'},
    {n:'City of Chandler',                     a:'CHD',  loc:'Chandler, AZ',     cat:'gov',  rel:'Agency engagement'},
    {n:'Phoenix Police Department',            a:'PPD',  loc:'Phoenix, AZ',      cat:'law',  rel:'Agency engagement'},
    {n:'Prescott Police Department',           a:'PRPD', loc:'Prescott, AZ',     cat:'law',  rel:'Agency engagement'},
    {n:'Prescott Fire Department',             a:'PRFD', loc:'Prescott, AZ',     cat:'fire', rel:'Agency engagement'},
    {n:'Federal Bureau of Investigation',      a:'FBI',  loc:'Federal',          cat:'fed',  rel:'Agency engagement'},
    {n:'Mountain Rescue Association',          a:'MRA',  loc:'National',         cat:'fire', rel:'Agency engagement'},
    {n:'Alpine Rescue Team',                   a:'ART',  loc:'Search & rescue',  cat:'fire', rel:'Agency engagement'}
  ];

  document.getElementById('clA').textContent=CLIENTS.length;
  document.getElementById('clB').textContent=CLIENTS.filter(function(c){return c.cat==='law';}).length;
  document.getElementById('clC').textContent=CLIENTS.filter(function(c){return c.cat==='fire';}).length;
})();


/* ==========================================================
   15. IMAGE SLOTS
   Any .shot whose image fails to load shows its placeholder
   instead of a broken-image icon. Drop a file at the path
   shown in the placeholder and it appears on next load.
   ========================================================== */
(function(){
  var shots=Array.prototype.slice.call(document.querySelectorAll('.shot'));
  shots.forEach(function(sh){
    var img=sh.querySelector('img');
    if(!img){ sh.classList.add('empty'); return; }
    function fail(){ sh.classList.add('empty'); }
    if(img.complete){ if(!img.naturalWidth) fail(); }
    img.addEventListener('error',fail);
    img.addEventListener('load',function(){ if(!img.naturalWidth) fail(); });
    // lazy-load everything below the fold
    img.loading='lazy'; img.decoding='async';
  });
})();



/* ==========================================================
   17. GUIDED TOUR
   Six stops across the site. A stop on another page opens that
   page with ?tour=N, and the tour picks up where it left off.
   ========================================================== */
(function(){
  var bar=document.getElementById('tourBar');
  if(!bar) return;
  var STEPS=[
    ['index.html','#gap','The problem in one number. Put in how long your units actually take to arrive, and see how far ahead an aircraft gets there.'],
    ['index.html','#roi','Helicopter, a hand-flown drone team, or a docked network. The honest annual comparison.'],
    ['platform.html','#platforms','Three aircraft on one architecture. XR-1 for routine calls, XR-2 to hold a scene, XR-3 for wide-area and rural response.'],
    ['operations.html','#console','This is the console your dispatchers would run, as a live simulation. Press Play demo mission and watch a full call end to end.'],
    ['deploy.html','#coverage','Coverage for a real city. The defaults are sized to Chandler, Arizona: two docks, full coverage, about four minutes to a call.'],
    ['contact.html','#contact','That is the tour. Tell us how your agency runs calls and we will model your sector with your own data.']
  ];
  var here=(location.pathname.split('/').pop()||'index.html');
  var i=-1, prev=null;
  function show(k){
    var st=STEPS[k], el=document.querySelector(st[1]);
    if(!el || (here!==st[0] && !(here==='' && st[0]==='index.html'))){ try{ sessionStorage.setItem('aaTour',String(k)); }catch(e){} location.href=st[0]+'?tour='+k+st[1]; return; }
    if(prev) prev.classList.remove('tour-focus');
    i=k;
    document.getElementById('tourStep').textContent=(k+1)+' / '+STEPS.length;
    document.getElementById('tourTxt').textContent=st[2];
    document.getElementById('tourNext').textContent = k===STEPS.length-1 ? 'Finish' : 'Next';
    bar.classList.add('on');
    el.scrollIntoView({behavior:reduce?'auto':'smooth', block:'start'});
    el.classList.add('tour-focus'); prev=el;
  }
  function end(){
    bar.classList.remove('on');
    if(prev) prev.classList.remove('tour-focus');
    prev=null; i=-1;
    try{ sessionStorage.removeItem('aaTour'); }catch(e){}
    if(/[?&]tour=/.test(location.search) && history.replaceState) history.replaceState(null,'',location.pathname+location.hash);
  }
  document.querySelectorAll('#tourBtn,[data-tour]').forEach(function(b){ b.addEventListener('click',function(){ show(0); }); });
  document.getElementById('tourNext').addEventListener('click',function(){
    if(i>=STEPS.length-1) end(); else show(i+1);
  });
  document.getElementById('tourEnd').addEventListener('click',end);
  document.addEventListener('keydown',function(e){
    if(!bar.classList.contains('on')) return;
    if(e.key==='Escape') end();
    if(e.key==='ArrowRight'){ if(i<STEPS.length-1) show(i+1); }
    if(e.key==='ArrowLeft'){ if(i>0) show(i-1); }
  });
  var m=/[?&]tour=(\d+)/.exec(location.search), saved=null;
  try{ saved=sessionStorage.getItem('aaTour'); }catch(e){}
  if(!m&&saved!==null) m=[0,saved];
  if(m){ var k=+m[1]; if(k>=0&&k<STEPS.length) setTimeout(function(){ show(k); },350); }
})();



/* ---- logo marquee: duplicate the track once at runtime so the loop is
   seamless without shipping the logo data twice ---- */
(function(){
  var t=document.querySelector('.wall-track');
  if(t && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    t.innerHTML += t.innerHTML;
  }
})();



/* ==========================================================
   18. BY MISSION selector
   ========================================================== */
(function(){
  var grid=document.querySelector('.mgrid'); if(!grid) return;
  var M={
    le:{t:'Law enforcement',r:'PATROL · TACTICAL · INVESTIGATIONS',
      p:'The everyday value is arriving with a picture. An aircraft overhead gives responders a subject count, a direction of travel and the layout of a scene before anyone steps out of a vehicle — and clears the routine calls that never needed a unit at all.',
      a:[['Armed and in-progress calls','Subject location and scene geometry before officers arrive.'],
         ['Pursuits','Maintain visual from above so ground units can safely disengage.'],
         ['Alarms and checks','Close unfounded calls from the air without committing a unit.'],
         ['Investigations','Overhead scene capture tied to the incident record.']]},
    fire:{t:'Fire & rescue',r:'STRUCTURE · WILDLAND · HAZMAT',
      p:'Thermal from above changes the interior approach and tells command whether the roof is a place anyone should be. On a moving fire, sustained overwatch keeps a continuous read on where it is going.',
      a:[['Structure fires','360° thermal size-up before the first engine arrives.'],
         ['Wildland','Track hotspots and fire behavior across ground crews can\u2019t see.'],
         ['Hazmat standoff','Assess a scene and read placards from a safe distance.'],
         ['Water and technical rescue','Aerial search and coordination over difficult terrain.']]},
    sar:{t:'Search & rescue',r:'THERMAL · WIDE-AREA · NIGHT',
      p:'Search is arithmetic — area covered per minute. One aircraft with thermal covers ground that would take a dozen people on foot, and it works in the dark, which is when most searches happen. XR-3 extends that reach into rural and open country.',
      a:[['Missing persons','Wide-area thermal sweep within minutes of the call.'],
         ['Night operations','Heat signatures show through darkness and light cover.'],
         ['Rural and open ground','Extended-range coverage where a multirotor runs out.'],
         ['Team coordination','Direct ground searchers to real signatures, not guesswork.']]},
    dis:{t:'Disaster response',r:'FLOOD · STORM · EARTHQUAKE',
      p:'When the ground picture is chaos, an aerial one is how command allocates what it has. Rapid damage assessment, access routes, and where people are stranded — captured and shared without putting a crew in the hazard.',
      a:[['Damage assessment','Fast overhead survey of an affected area.'],
         ['Access and routing','See which roads and approaches are open.'],
         ['Locating people','Thermal and visual search across flood and rubble.'],
         ['Documentation','Capture for after-action and federal reporting.']]},
    sec:{t:'Private security',r:'PATROL · PERIMETER · EVENT',
      p:'For campuses, ports, utilities and large events, a docked aircraft patrols a perimeter far faster than a vehicle and gives a control room a movable camera it can send to any alarm in seconds.',
      a:[['Perimeter patrol','Cover a large site from above on a schedule or on alarm.'],
         ['Alarm response','Send a camera to a trip before dispatching a guard.'],
         ['Event overwatch','Continuous read on crowd flow and bottlenecks.'],
         ['Deterrence','A visible, logged aerial presence across the site.']]}
  };
  function show(k){
    Array.prototype.forEach.call(grid.children,function(b){b.classList.toggle('on',b.dataset.m===k);});
    var d=M[k];
    document.getElementById('mDetail').innerHTML =
      '<h3>'+d.t+'</h3><div class="role">'+d.r+'</div><p>'+d.p+'</p>'+
      '<div class="apps">'+d.a.map(function(x){return '<div class="app"><b>'+x[0]+'</b><span>'+x[1]+'</span></div>';}).join('')+'</div>';
  }
  grid.addEventListener('click',function(e){var b=e.target.closest('[data-m]');if(b)show(b.dataset.m);});
  show('le');
})();

})();

/* ==========================================================
   AeroAssist — site chrome, shared by every page:
   header and dropdown menus, progress bar, back-to-top,
   reveals, counters, Phoenix clock, page sub-nav, card light.
   ========================================================== */
(function(){
'use strict';
var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
var $=function(s,c){return (c||document).querySelector(s);};
var $$=function(s,c){return Array.prototype.slice.call((c||document).querySelectorAll(s));};
var head=$('#head'), prog=$('#progress'), toTop=$('#toTop'), nav=$('#nav'), burger=$('#burger');
var mq=matchMedia('(max-width:1100px)');

/* ---------- pinned header, progress, back to top ---------- */
function onScroll(){
  var y=scrollY;
  if(head) head.classList.toggle('pinned', y>24);
  if(toTop) toTop.classList.toggle('on', y>700);
  if(prog){ var h=document.documentElement.scrollHeight-innerHeight; prog.style.width=(h>0?(y/h*100):0)+'%'; }
  spy();
}
addEventListener('scroll',onScroll,{passive:true});
if(toTop) toTop.addEventListener('click',function(){ scrollTo({top:0,behavior:reduce?'auto':'smooth'}); });

/* ---------- dropdown menus ----------
   Desktop: open on hover (with a short grace period) or click; Esc closes
   and returns focus; arrow keys move between items.
   Phone and tablet: the burger opens a drawer and each menu is an accordion. */
var items=$$('.mm'), openItem=null, hoverT=0;
function setOpen(li,on,focusFirst){
  if(!li) return;
  var b=$('.mm-btn',li);
  li.classList.toggle('open',on); b.setAttribute('aria-expanded',on?'true':'false');
  if(on&&!mq.matches){ /* keep the panel inside the window */
    var pn=$('.mm-panel',li); pn.style.marginLeft='0px';
    var r=pn.getBoundingClientRect(), pad=16, shift=0;
    if(r.right>innerWidth-pad) shift=innerWidth-pad-r.right; else if(r.left<pad) shift=pad-r.left;
    pn.style.marginLeft=shift+'px';
  }
  if(on){ if(openItem&&openItem!==li&&!mq.matches) setOpen(openItem,false); openItem=li; if(focusFirst){ var a=$('.mm-panel a',li); if(a) a.focus(); } }
  else if(openItem===li) openItem=null;
}
function closeAll(){ items.forEach(function(li){ setOpen(li,false); }); }
items.forEach(function(li){
  var b=$('.mm-btn',li);
  b.addEventListener('click',function(e){ e.stopPropagation(); setOpen(li,!li.classList.contains('open')); });
  b.addEventListener('keydown',function(e){ if(e.key==='ArrowDown'){ e.preventDefault(); setOpen(li,true,true); } });
  li.addEventListener('mouseenter',function(){ if(mq.matches||!matchMedia('(hover:hover)').matches) return; clearTimeout(hoverT); setOpen(li,true); });
  li.addEventListener('mouseleave',function(){ if(mq.matches||!matchMedia('(hover:hover)').matches) return; clearTimeout(hoverT); hoverT=setTimeout(function(){ setOpen(li,false); },180); });
  li.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&li.classList.contains('open')){ setOpen(li,false); b.focus(); }
    if((e.key==='ArrowDown'||e.key==='ArrowUp')&&e.target.closest('.mm-panel')){
      e.preventDefault();
      var ls=$$('.mm-panel a',li), k=ls.indexOf(document.activeElement);
      k=e.key==='ArrowDown'?Math.min(ls.length-1,k+1):Math.max(0,k-1); ls[k].focus();
    }
  });
  li.addEventListener('focusout',function(e){ if(!mq.matches&&!li.contains(e.relatedTarget)) setOpen(li,false); });
});
document.addEventListener('click',function(e){ if(!mq.matches&&openItem&&!openItem.contains(e.target)) closeAll(); });

function drawer(on){
  if(!nav||!burger) return;
  nav.classList.toggle('open',on); burger.setAttribute('aria-expanded',on?'true':'false');
  document.documentElement.classList.toggle('nav-locked',on);
  if(!on) closeAll();
}
if(burger) burger.addEventListener('click',function(){ drawer(!nav.classList.contains('open')); });
document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&nav&&nav.classList.contains('open')){ drawer(false); burger.focus(); } });
$$('#nav a').forEach(function(a){ a.addEventListener('click',function(){ closeAll(); drawer(false); }); });
mq.addEventListener&&mq.addEventListener('change',function(){ drawer(false); closeAll(); });

/* ---------- reveals and counters ---------- */
if('IntersectionObserver' in window){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('seen'); io.unobserve(e.target); } });},{threshold:.1,rootMargin:'0px 0px -4% 0px'});
  $$('.rise').forEach(function(el){ io.observe(el); });
  var cio=new IntersectionObserver(function(es){es.forEach(function(e){
    if(!e.isIntersecting) return; cio.unobserve(e.target);
    var el=e.target, target=+el.dataset.count, t0=null;
    if(reduce){ el.textContent=target; return; }
    function step(ts){ if(!t0) t0=ts; var p=Math.min(1,(ts-t0)/900); el.textContent=Math.round(target*(1-Math.pow(1-p,3))); if(p<1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  });},{threshold:.5});
  $$('[data-count]').forEach(function(el){ cio.observe(el); });
} else { $$('.rise').forEach(function(el){ el.classList.add('seen'); }); }

/* ---------- "on this page" chips follow the reader ---------- */
var chips=$$('.aa-subnav a'), targets=chips.map(function(a){ return document.getElementById(a.getAttribute('href').slice(1)); });
function spy(){
  if(!chips.length) return;
  var best=-1;
  targets.forEach(function(t,k){ if(t&&t.getBoundingClientRect().top<=160) best=k; });
  chips.forEach(function(a,k){ a.classList.toggle('on',k===best); });
}
onScroll();

/* ---------- Phoenix time in the command strip (Arizona keeps MST all year) ---------- */
var clk=$('#cmdClock');
if(clk){
  var tick=function(){ var d=new Date(Date.now()-7*3600e3); clk.textContent=('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2)+':'+('0'+d.getUTCSeconds()).slice(-2); };
  tick(); clk.parentNode.hidden=false; setInterval(tick,1000);
}

/* ---------- cursor light on cards ---------- */
if(matchMedia('(hover:hover)').matches&&!reduce){
  document.addEventListener('pointermove',function(e){
    var c=e.target.closest&&e.target.closest('.glow-card'); if(!c) return;
    var r=c.getBoundingClientRect(); c.style.setProperty('--mx',(e.clientX-r.left)+'px'); c.style.setProperty('--my',(e.clientY-r.top)+'px');
  },{passive:true});
}

/* ---------- readiness check ---------- */
var rq=$$('#ready input[type=checkbox]');
if(rq.length){
  var NEXT={1:['Pull six months of CAD calls','deploy.html#coverage','Model coverage for your sector'],2:['Name a program owner','deploy.html#roadmap','See the six rollout phases'],3:['Get a pilot certified under Part 107','trust.html#airspace','Read the FAA path'],
            4:['Shortlist dock sites with power and network','deploy.html#coverage','Try dock placements in the planner'],5:['Find a funding route','funding.html#grants','See funding routes'],6:['Brief your council early','trust.html#myths','Use the myths and facts'],7:['Start a written policy','trust.html#policy','Read the model policy outline']};
  var meter=$('#rMeter'), C=2*Math.PI*52;
  if(meter){ meter.style.strokeDasharray=C; meter.style.strokeDashoffset=C; }
  var upd=function(){
    var n=0, miss=[];
    rq.forEach(function(b,i){ if(b.checked) n++; else if(i>0) miss.push(i); });
    $('#rScore').textContent=n;
    if(meter) meter.style.strokeDashoffset=C*(1-n/8);
    var st=n<=2?['STAGE 1 · EXPLORING','Start with the problem, not the aircraft.','Pull six months of calls from CAD and look at what arrives late and what never needed a unit. That is the case for a program, and it is the first thing we model with you.']
          :n<=5?['STAGE 2 · PLANNING','You have the start of a program.','Close the gaps below, then a sector study turns your call data into dock sites, coverage and a budget you can take to council.']
          :n<=7?['STAGE 3 · READY TO SCOPE','You are ready for a sector study.','Most agencies at this point are about ninety days from a first launch. We can model your sector with your own data.']
          :['STAGE 4 · READY TO LAUNCH','Everything is in place.','Book a briefing and we will scope dock sites, the FAA filings and a launch date with your team.'];
    $('#rStage').textContent=st[0]; $('#rHead').textContent=st[1]; $('#rCopy').textContent=st[2];
    $('#rNext').innerHTML=miss.slice(0,3).map(function(i){ var x=NEXT[i]; return '<a href="'+x[1]+'"><b>'+x[0]+'</b><span>'+x[2]+'</span></a>'; }).join('');
  };
  rq.forEach(function(b){ b.addEventListener('change',upd); }); upd();
}

/* ---------- contact.html?topic=investor picks the right subject ---------- */
var tp=/[?&]topic=(\w+)/.exec(location.search), sel=$('#fTopic');
if(tp&&sel){
  var want={investor:'Investor relations',partner:'Partnership or reseller',demo:'Requesting a demo or briefing',grants:'Grant or funding help',procurement:'Procurement or contracts',press:'Press and media',support:'Support for an existing program'}[tp[1]];
  $$('option',sel).forEach(function(o){ if(o.textContent===want) sel.value=o.value||o.textContent; });
}
})();

/* ==========================================================
   AeroAssist hero · "DFR overwatch"
   A live-rendered aerial view of a Phoenix-area city by day:
   street grid, rooftops, pools, traffic, a canal and a freeway,
   mountains on the horizon. Docks sit along the arterials; when a
   simulated call drops, the nearest aircraft launches, flies to the
   scene ahead of the ground unit, holds overwatch and returns.
   Plain WebGL for the world, a 2D canvas for the overlay.
   It is an illustration; nothing on it is live data.
   ========================================================== */
(function(){
'use strict';
var host=document.getElementById('aaSky');
if(!host) return;
var hero=host.parentNode;

/* A photograph can replace the live render: set its URL in data-photo. */
var photo=host.getAttribute('data-photo');
if(photo){ host.classList.add('photo'); host.style.backgroundImage='url("'+photo.replace(/"/g,'%22')+'")'; return; }

var cw=document.getElementById('aaWorld'), ch=document.getElementById('aaHud');
if(!cw||!ch) return;
var gl=null;
try{ gl=cw.getContext('webgl',{antialias:true,alpha:false,depth:true,stencil:false,powerPreference:'high-performance'})||cw.getContext('experimental-webgl'); }catch(e){ gl=null; }
if(!gl){ host.classList.add('nogl'); return; }
var hud=ch.getContext('2d');
var REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;
var LITE=false;
function detectTier(){
  var w=Math.min(document.documentElement.clientWidth||innerWidth,innerWidth,(screen&&screen.width)||innerWidth);
  var touch=matchMedia('(pointer: coarse)').matches, q=location.search;
  if(q.indexOf('aatier=full')>=0) return false;
  if(q.indexOf('aatier=lite')>=0) return true;
  return w<760||(touch&&w<1100)||(navigator.hardwareConcurrency||8)<=2;
}

/* ---------- small helpers ---------- */
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function h2(i,j){ var h=(Math.imul(i|0,374761393)+Math.imul(j|0,668265263))|0; h=Math.imul(h^(h>>>13),1274126177); h^=h>>>16; return (h>>>0)/4294967296; }
function clamp(v,a,b){ return v<a?a:v>b?b:v; }
function sstep(a,b,x){ var t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); }
function lerp(a,b,t){ return a+(b-a)*t; }
function ease(t){ return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2; }
function c8(v){ return v<=0?0:v>=1?255:Math.round(v*255); }

/* ---------- world constants (metres) ---------- */
var MILE=1609.34, TILE=2*MILE;          // the world repeats every two miles of flight
var RIGHT=-1;                            // screen-right is world -x in this view
var VIEW, NEAR;                          // depth of the light field / rooftop field, set per device
var ART0=RIGHT*240;                      // an arterial runs just right of the flight line
var XMAX, HX, ZEND, ZNEAR, NCOPY;
function configure(){
  LITE=detectTier();
  VIEW=LITE?7200:11500; NEAR=LITE?1250:1850;
  XMAX=380+0.9*VIEW; HX=0.95*NEAR+220;
  ZEND=TILE+VIEW+900; ZNEAR=TILE+NEAR+200;
  NCOPY=Math.ceil(ZEND/TILE)+1;
}
var CANAL_Z=1262, FWY_Z=2700;            // tile coordinates
var BAND=250;

/* dusk light: sky ambient, the sunset glow ahead-right, and street-light bounce */
var SUN_AZ=-RIGHT*0.35;
var SUN=(function(){ var x=Math.sin(SUN_AZ), y=0.95, z=Math.cos(SUN_AZ), l=Math.hypot(x,y,z); return [x/l,y/l,z/l]; })();
var AMB=[0.62,0.66,0.76], GLOW=[1.05,0.98,0.86], BOUNCE=[0.04,0.03,0.02];
function lit(b,n,warm){
  var up=Math.max(n[1],0), s=Math.max(n[0]*SUN[0]+n[1]*SUN[1]+n[2]*SUN[2],0)*0.6, a=0.30+0.70*up;
  return [b[0]*(AMB[0]*a+GLOW[0]*s+BOUNCE[0]*warm), b[1]*(AMB[1]*a+GLOW[1]*s+BOUNCE[1]*warm), b[2]*(AMB[2]*a+GLOW[2]*s+BOUNCE[2]*warm)];
}
function flat(b,warm,emit){ var c=lit(b,[0,1,0],warm); return [c8(c[0]),c8(c[1]),c8(c[2]),c8(emit||0)]; }
function solid(b,n,warm){ var c=lit(b,n,warm); return [c8(c[0]),c8(c[1]),c8(c[2]),0]; }
function emis(c,e){ var l=lit(c,[0,1,0],0), k=0.55; return [c8(l[0]*k+c[0]*0.25),c8(l[1]*k+c[1]*0.25),c8(l[2]*k+c[2]*0.25),c8(e*0.12)]; }

var BASE={
  ground:[0.40,0.34,0.27], res:[0.44,0.38,0.31], desert:[0.56,0.45,0.33], park:[0.20,0.33,0.15],
  asphalt:[0.27,0.27,0.28], concrete:[0.52,0.50,0.47], gravel:[0.58,0.50,0.40], lawn:[0.24,0.40,0.17],
  parking:[0.30,0.30,0.32], bank:[0.52,0.46,0.38]
};
var STREET={ local:flat([0.30,0.29,0.29],0), collector:flat([0.27,0.27,0.28],0), arterial:flat([0.22,0.22,0.23],0), freeway:flat([0.25,0.25,0.26],0) };
var WALLS=[[0.80,0.72,0.60],[0.74,0.62,0.48],[0.86,0.83,0.78],[0.66,0.50,0.38],[0.62,0.60,0.57]];
var ROOFS=[[0.54,0.31,0.22],[0.47,0.33,0.26],[0.41,0.39,0.38],[0.58,0.55,0.50],[0.30,0.29,0.31],[0.50,0.40,0.31],[0.36,0.28,0.24]];
var LP={
  sodium:[1.0,0.58,0.24], amber:[1.0,0.70,0.36], warm:[1.0,0.82,0.55], white:[0.86,0.92,1.0],
  win:[[1.0,0.74,0.40],[1.0,0.84,0.58],[1.0,0.68,0.34],[0.58,0.70,1.0]],
  pool:[0.20,0.95,0.92], tail:[1.0,0.12,0.10], head:[1.0,0.93,0.80],
  red:[1.0,0.10,0.08], green:[0.18,1.0,0.52],
  sign:[[1.0,0.20,0.35],[0.25,0.62,1.0],[0.26,1.0,0.58],[1.0,0.80,0.18],[0.88,0.36,1.0]]
};

/* ---------- growable buffers ---------- */
function Tri(cap){ this.p=new Float32Array(cap*3); this.c=new Uint8Array(cap*4); this.n=0; }
Tri.prototype.grow=function(){ var p=new Float32Array(this.p.length*2); p.set(this.p); this.p=p; var c=new Uint8Array(this.c.length*2); c.set(this.c); this.c=c; };
Tri.prototype.v=function(a,col){ if(this.n*3+3>this.p.length) this.grow(); var i=this.n*3, j=this.n*4; this.p[i]=a[0]; this.p[i+1]=a[1]; this.p[i+2]=a[2]; this.c[j]=col[0]; this.c[j+1]=col[1]; this.c[j+2]=col[2]; this.c[j+3]=col[3]; this.n++; };
Tri.prototype.tri=function(a,b,c,col){ this.v(a,col); this.v(b,col); this.v(c,col); };
Tri.prototype.quad=function(a,b,c,d,col){ this.tri(a,b,c,col); this.tri(a,c,d,col); };

function Pts(cap,attr){ this.k=attr; this.p=new Float32Array(cap*3); this.a=new Float32Array(cap*attr); this.c=new Uint8Array(cap*4); this.n=0; }
Pts.prototype.grow=function(){ var p=new Float32Array(this.p.length*2); p.set(this.p); this.p=p; var a=new Float32Array(this.a.length*2); a.set(this.a); this.a=a; var c=new Uint8Array(this.c.length*2); c.set(this.c); this.c=c; };
Pts.prototype.add=function(x,y,z,attrs,col,inten){
  if(this.n*3+3>this.p.length) this.grow();
  var i=this.n*3, k=this.n*this.k, j=this.n*4;
  this.p[i]=x; this.p[i+1]=y; this.p[i+2]=z;
  for(var q=0;q<this.k;q++) this.a[k+q]=attrs[q];
  this.c[j]=c8(col[0]); this.c[j+1]=c8(col[1]); this.c[j+2]=c8(col[2]); this.c[j+3]=c8(inten/2);
  this.n++;
};

var G=new Tri(1<<15);      // ground, land cover, water, fields, parking
var S=new Tri(1<<15);      // streets
var N=new Tri(1<<16);      // near-field decals: yards, driveways, pools
var B=[];                  // buildings, banded by distance
var L=new Pts(1<<16,3);    // lights: size, phase, mode
var C=new Pts(1<<13,6);    // cars: dirx, dirz, speed, length, phase, size
var T=new Pts(1<<14,1);    // trees: size
var HOUSES=[];             // tile-0 houses, for the overlay

function band(z){ var b=Math.floor(z/BAND); if(b<0) b=0; if(!B[b]) B[b]=new Tri(2048); return B[b]; }

/* oriented rectangle on the ground */
function rect(m,cx,cz,hx,hz,ang,y,col){
  var c=Math.cos(ang), s=Math.sin(ang);
  function P(u,v){ return [cx+u*c-v*s, y, cz+u*s+v*c]; }
  m.quad(P(-hx,-hz),P(hx,-hz),P(hx,hz),P(-hx,hz),col);
}
/* straight strip between two points */
function strip(m,x1,z1,x2,z2,w,y,col){
  var dx=x2-x1, dz=z2-z1, l=Math.hypot(dx,dz)||1, nx=-dz/l*w/2, nz=dx/l*w/2;
  m.quad([x1+nx,y,z1+nz],[x2+nx,y,z2+nz],[x2-nx,y,z2-nz],[x1-nx,y,z1-nz],col);
}
function decalOK(x,z){ return z>-300&&z<ZEND&&Math.abs(x)<900+0.95*Math.min(Math.max(z,0),VIEW); }
function lightsOK(x,z){ return z>-200&&z<ZEND&&Math.abs(x)<380+0.9*Math.min(Math.max(z,0),VIEW); }
function nearOK(x,z){ return z<ZNEAR&&Math.abs(x)<HX; }
function light(x,y,z,size,col,inten,mode,phase,pool){
  if(!lightsOK(x,z)) return;
  var ph=phase===undefined?Math.random():phase;
  L.add(x,y,z,[size,ph,mode||0],col,inten);
  if(pool) L.add(x,0.4,z,[pool,ph,5],[Math.min(1,col[0]*1.05),col[1]*0.80,col[2]*0.55],inten*0.42);
}
function lightRow(x1,z1,x2,z2,step,off,y,size,col,inten,R,both,pool){
  var dx=x2-x1, dz=z2-z1, l=Math.hypot(dx,dz); if(l<1) return;
  var ux=dx/l, uz=dz/l, nx=-uz, nz=ux, k=0;
  for(var d=R()*step; d<l; d+=step){
    var x=x1+ux*d, z=z1+uz*d;
    if(both){ light(x+nx*off,y,z+nz*off,size,col,inten,1,undefined,pool); light(x-nx*off,y,z-nz*off,size,col,inten,1,undefined,pool); }
    else{ var s=(k++%2)?1:-1; light(x+nx*off*s,y,z+nz*off*s,size,col,inten,1,undefined,pool); }
  }
}

/* ---------- buildings ---------- */
function house(cx,cz,hw,hd,ang,H,Rr,wall,roof,warm,R,front){
  var m=band(cz), c=Math.cos(ang), s=Math.sin(ang);
  function P(u,y,v){ return [cx+u*c-v*s, y, cz+u*s+v*c]; }
  function Nn(nu,ny,nv){ var x=nu*c-nv*s, z=nu*s+nv*c, l=Math.hypot(x,ny,z); return [x/l,ny/l,z/l]; }
  var A0=P(-hw,0,-hd),B0=P(hw,0,-hd),C0=P(hw,0,hd),D0=P(-hw,0,hd),A1=P(-hw,H,-hd),B1=P(hw,H,-hd),C1=P(hw,H,hd),D1=P(-hw,H,hd);
  m.quad(A0,B0,B1,A1,solid(wall,Nn(0,0,-1),warm));
  m.quad(B0,C0,C1,B1,solid(wall,Nn(1,0,0),warm*0.8));
  m.quad(C0,D0,D1,C1,solid(wall,Nn(0,0,1),warm));
  m.quad(D0,A0,A1,D1,solid(wall,Nn(-1,0,0),warm*0.8));
  var o=0.5, ho=hw+o, dd=hd+o, a=P(-ho,H,-dd), b=P(ho,H,-dd), cc=P(ho,H,dd), d=P(-ho,H,dd), r1, r2, w2=warm*0.35;
  if(ho>=dd){
    r1=P(-(ho-dd),H+Rr,0); r2=P(ho-dd,H+Rr,0); var k=Rr/dd;
    m.quad(a,b,r2,r1,solid(roof,Nn(0,1,-k),w2)); m.quad(cc,d,r1,r2,solid(roof,Nn(0,1,k),w2));
    m.tri(d,a,r1,solid(roof,Nn(-k,1,0),w2)); m.tri(b,cc,r2,solid(roof,Nn(k,1,0),w2));
  } else {
    r1=P(0,H+Rr,-(dd-ho)); r2=P(0,H+Rr,dd-ho); var q=Rr/ho;
    m.quad(d,a,r1,r2,solid(roof,Nn(-q,1,0),w2)); m.quad(b,cc,r2,r1,solid(roof,Nn(q,1,0),w2));
    m.tri(a,b,r1,solid(roof,Nn(0,1,-q),w2)); m.tri(cc,d,r2,solid(roof,Nn(0,1,q),w2));
  }
  /* lit windows and a porch light */
  var nw=R()<0.86?1+(R()*3|0):0;
  for(var i=0;i<nw;i++){
    var face=R()<0.55?front:(R()<0.5?2:3), u, v, wy=R()<0.3&&H>5?4.4:1.7;
    if(face===0){ u=(R()*2-1)*hw*0.7; v=-hd-0.6; } else if(face===1){ u=(R()*2-1)*hw*0.7; v=hd+0.6; }
    else if(face===2){ u=hw+0.6; v=(R()*2-1)*hd*0.6; } else { u=-hw-0.6; v=(R()*2-1)*hd*0.6; }
    var p=P(u,wy,v), wc=LP.win[R()<0.1?3:(R()*3|0)];
    if(nearOK(p[0],p[2])) L.add(p[0],p[1],p[2],[0.85+R()*0.3,R(),4],wc,1.7);
  }
  if(R()<0.62){ var pp=P((R()*2-1)*hw*0.4,2.3,front===0?-hd-0.9:hd+0.9); if(nearOK(pp[0],pp[2])) L.add(pp[0],pp[1],pp[2],[0.95,R(),4],LP.warm,1.6); }
}
function block(cx,cz,hx,hz,H,wall,roof,warm){
  var m=band(cz);
  var a0=[cx-hx,0,cz-hz],b0=[cx+hx,0,cz-hz],c0=[cx+hx,0,cz+hz],d0=[cx-hx,0,cz+hz],a1=[cx-hx,H,cz-hz],b1=[cx+hx,H,cz-hz],c1=[cx+hx,H,cz+hz],d1=[cx-hx,H,cz+hz];
  m.quad(a0,b0,b1,a1,solid(wall,[0,0,-1],warm)); m.quad(b0,c0,c1,b1,solid(wall,[1,0,0],warm*0.7));
  m.quad(c0,d0,d1,c1,solid(wall,[0,0,1],warm)); m.quad(d0,a0,a1,d1,solid(wall,[-1,0,0],warm*0.7));
  m.quad(a1,b1,c1,d1,solid(roof,[0,1,0],warm*0.25));
}

/* ---------- neighbourhoods ---------- */
function sbKind(j,k){
  var xl=ART0+j*MILE, xr=xl+MILE, onPath=xl<900&&xr>-900, h=h2(j*31+7,k*17+3);
  if(!onPath){ if(h<0.08) return 'park'; if(h<0.15) return 'desert'; }
  return h2(j*13+1,k*29+11)<0.36?'curvy':'grid';
}

function lot(x,zc,ang,s,sw,lotD,lw,R0,pal,near,front){
  var zt=((zc%TILE)+TILE)%TILE, R=mulberry((h2(Math.round(x*4),Math.round(zt*4)+s*7919)*4294967296)|0);
  var c=Math.cos(ang), sn=Math.sin(ang), nx=-sn*s, nz=c*s;
  var lcx=x+nx*(sw/2+lotD/2), lcz=zc+nz*(sw/2+lotD/2);
  if(!near||!nearOK(lcx,lcz)) return;
  var hd=5.6+R()*2.6, hw=Math.min(lw/2-1.9,6.2+R()*2.4), set=6+R()*2;
  var hcx=x+nx*(sw/2+set+hd), hcz=zc+nz*(sw/2+set+hd);
  rect(N,lcx,lcz,lw/2-0.5,lotD/2-0.5,ang,0.02,flat(R()<0.58?BASE.gravel:BASE.lawn,0.15+R()*0.25));
  var dvx=(R()<0.5?1:-1)*(hw-3.2);
  rect(N,x+c*dvx+nx*(sw/2+set/2),zc+sn*dvx+nz*(sw/2+set/2),2.7,set/2+0.2,ang,0.04,flat(BASE.concrete,0.55));
  var two=R()<0.22, H=two?6.0:3.1;
  house(hcx,hcz,hw,hd,ang,H,1.7+R()*1.0,WALLS[R()*WALLS.length|0],ROOFS[R()*ROOFS.length|0],0.3+R()*0.7,R,front);
  var rec={x:hcx,z:hcz,hw:hw,hd:hd,ang:ang,bx:nx,bz:nz};
  if(R()<0.33){
    var px=x+nx*(sw/2+lotD-6.2)+c*(R()*2-1)*(lw/2-6), pz=zc+nz*(sw/2+lotD-6.2)+sn*(R()*2-1)*(lw/2-6);
    var pa=ang+(R()<0.5?0:Math.PI/2);
    rect(N,px,pz,4.4,2.3,pa,0.06,emis([0.05,0.40,0.50],0.8));
    L.add(px,0.8,pz,[5.5,R(),4],LP.pool,0.38);
    rec.pool=1;
  }
  var nt=R()<0.75?1+(R()*2|0):0;
  for(var t=0;t<nt;t++){
    var tb=R()<0.5?(sw/2+lotD-3):(sw/2+2.5), tu=(R()*2-1)*(lw/2-2.5);
    var tx=x+nx*tb+c*tu, tz=zc+nz*tb+sn*tu;
    T.add(tx,4,tz,[4+R()*3],[0,0,0],1);
    if(R()<0.11) L.add(tx,2,tz,[1.05,R(),4],[[1.0,0.80,0.55],[0.66,0.46,1.0],[0.36,0.62,1.0]][R()*3|0],1.3);
  }
  if(lcz<TILE) HOUSES.push(rec);
}

function quarter(qx0,qx1,qz0,qz1,R,curvy,pal,excl){
  var sw=10.5, lotD=31+R()*5, pitch=2*lotD+sw+1;
  var amp=curvy?8+R()*14:0, wl=70+R()*50, ph=R()*6.28;
  var cross=[], cx=qx0+70+R()*60;
  while(cx<qx1-60){ cross.push(cx); cx+=230+R()*80; }
  var near=qz0<ZNEAR&&qx1>-HX&&qx0<HX;
  var vis=decalOK((qx0+qx1)/2,qz0)||decalOK(qx0,qz0)||decalOK(qx1,qz0), fine=qz0<ZNEAR+400;
  for(var i=0;i<cross.length;i++){
    if(vis&&!excl(cross[i],(qz0+qz1)/2)){ strip(S,cross[i],qz0,cross[i],qz1,9.5,0,STREET.local); }
    lightRow(cross[i],qz0,cross[i],qz1,64+R()*16,6,7,1.7,pal,1.15,R,false,22);
  }
  for(var zs=qz0+lotD+sw/2+5; zs<qz1-lotD-sw/2; zs+=pitch){
    var f=(function(z0){ return function(x){ return z0+amp*Math.sin(x/wl+ph); }; })(zs);
    var prev=null;
    var stp=fine?(curvy?14:40):(curvy?45:(qx1-qx0));
    for(var x=qx0; vis&&x<=qx1+0.1; x+=stp){
      var xx=Math.min(x,qx1), pz=f(xx);
      if(prev&&!excl((prev[0]+xx)/2,(prev[1]+pz)/2)) strip(S,prev[0],prev[1],xx,pz,sw,0,STREET.local);
      prev=[xx,pz];
      if(xx>=qx1) break;
    }
    var k=0;
    for(var lx=qx0+30+R()*30; lx<qx1-20; lx+=58+R()*14){
      var lz=f(lx), sl=(f(lx+1)-f(lx-1))/2, n=1/Math.hypot(1,sl), s=(k++%2)?1:-1;
      if(!excl(lx,lz)) light(lx-sl*n*6.5*s,7,lz+n*6.5*s,1.7,pal,1.15,1,undefined,22);
    }
    var edges=[qx0+6].concat(cross.reduce(function(a,c){ a.push(c-9,c+9); return a; },[]),[qx1-6]);
    for(var e=0;e+1<edges.length;e+=2){
      var lw;
      for(var lx2=edges[e]; lx2+16<edges[e+1]; lx2+=lw){
        lw=18+R()*5; var mx=lx2+lw/2; if(mx+lw/2>edges[e+1]) break;
        var mz=f(mx), ang=Math.atan((f(mx+1)-f(mx-1))/2);
        for(var s2=-1;s2<=1;s2+=2){
          var tz=mz+s2*(sw/2+lotD/2);
          if(excl(mx,tz)) continue;
          lot(mx,mz,ang,s2,sw,lotD,lw,R,pal,near,s2>0?0:1);
        }
      }
    }
  }
}

function commercial(x0,x1,z0,z1,R,toward){
  var cx=(x0+x1)/2, cz=(z0+z1)/2, hx=(x1-x0)/2, hz=(z1-z0)/2;
  rect(G,cx,cz,hx,hz,0,0.03,flat(BASE.parking,0.6,0.25));
  for(var x=x0+14; x<x1-8; x+=31) for(var z=z0+14; z<z1-8; z+=31) light(x,9,z,2.4,LP.white,1.3,1,undefined,26);
  var nb=1+(R()*3|0), bw=(x1-x0-30)/nb;
  for(var i=0;i<nb;i++){
    var bx=x0+15+bw*(i+0.5), bz=toward>0?z1-24:z0+24, bhx=bw/2-6, bhz=14+R()*10, bh=7+R()*3;
    if(nearOK(bx,bz)) block(bx,bz,bhx,bhz,bh,[0.55,0.54,0.56],[0.62,0.62,0.66],0.8);
    var fz=toward>0?bz-bhz-1:bz+bhz+1;
    for(var s=0;s<2+(R()*3|0);s++) light(bx+(R()*2-1)*bhx*0.8,6,fz,1.6,LP.sign[R()*LP.sign.length|0],1.6,0);
  }
  if(R()<0.55){
    var gx=toward>0?x0+26:x1-26, gz=toward>0?z0+22:z1-22;
    rect(G,gx,gz,13,8,0,0.05,emis([0.92,0.93,1.0],1));
    for(var g=0;g<4;g++) light(gx+(g%2?7:-7),5,gz+(g<2?4:-4),2.6,LP.white,1.6,0);
  }
}

function school(x0,x1,z0,z1,R){
  var cx=(x0+x1)/2, cz=(z0+z1)/2;
  rect(G,cx,cz,(x1-x0)/2,(z1-z0)/2,0,0.03,flat(BASE.res,0.3));
  rect(G,cx,cz+20,82,52,0,0.05,emis([0.15,0.40,0.15],0.55));
  rect(G,cx,cz+20,64,34,0,0.06,emis([0.18,0.46,0.18],0.6));
  for(var i=0;i<6;i++){ var sx=cx+(i%3-1)*72, sz=cz+20+(i<3?-58:58); light(sx,24,sz,5.4,[1,1,0.97],1.5,0); }
  if(nearOK(cx,z0+30)){ block(cx-50,z0+28,40,16,8,[0.60,0.54,0.46],[0.56,0.56,0.58],0.6); block(cx+52,z0+30,30,18,8,[0.60,0.54,0.46],[0.56,0.56,0.58],0.6); }
}

function park(x0,x1,z0,z1,R){
  rect(G,(x0+x1)/2,(z0+z1)/2,(x1-x0)/2,(z1-z0)/2,0,0.03,flat(BASE.park,0.15));
  for(var a=0;a<6.28;a+=0.22){ var px=(x0+x1)/2+Math.cos(a)*(x1-x0)*0.38, pz=(z0+z1)/2+Math.sin(a)*(z1-z0)*0.38; light(px,3.5,pz,0.9,LP.warm,0.55,1); }
  var Rt=mulberry((h2(Math.round(x0),Math.round(((z0%TILE)+TILE)%TILE))*4294967296)|0);
  if(nearOK((x0+x1)/2,(z0+z1)/2)) for(var t=0;t<40;t++) T.add(lerp(x0,x1,Rt()),5,lerp(z0,z1,Rt()),[7+Rt()*5],[0,0,0],1);
}

function superblock(j,k,copy){
  var R=mulberry(((j+500)*92821)^((k+77)*68917)^0x5bd1e995);
  var xl=ART0+j*MILE, xr=xl+MILE, z0=copy*TILE+k*MILE, z1=z0+MILE;
  if(xr<-XMAX||xl>XMAX||z0>ZEND) return;
  var kind=sbKind(j,k), pal=[LP.warm,LP.white,LP.sodium,LP.amber][h2(j*5+2,k*7+9)*4|0];
  if(kind==='park'){ park(xl+20,xr-20,z0+20,z1-20,R); return; }
  if(kind==='desert'){ rect(G,(xl+xr)/2,(z0+z1)/2,MILE/2,MILE/2,0,0.02,flat(BASE.desert,0.05)); for(var i=0;i<14;i++) light(lerp(xl,xr,R()),5,lerp(z0,z1,R()),1.1,LP.warm,0.6,1); return; }
  rect(G,(xl+xr)/2,(z0+z1)/2,MILE/2,MILE/2,0,0.015,flat(BASE.res,0.15));
  var zones=[];
  function excl(x,z){ for(var i=0;i<zones.length;i++){ var q=zones[i]; if(x>q[0]&&x<q[1]&&z>q[2]&&z<q[3]) return true; } return false; }
  if(k===0) zones.push([xl,xr,z0+CANAL_Z-46,z0+CANAL_Z+46]);
  if(k===1) zones.push([xl,xr,copy*TILE+FWY_Z-62,copy*TILE+FWY_Z+62]);
  var corners=[[xl,z0,1,1],[xr,z0,-1,1],[xl,z1,1,-1],[xr,z1,-1,-1]];
  for(var c=0;c<4;c++){
    if(R()<0.42){
      var cc=corners[c], ax=cc[0]+cc[2]*18, az=cc[1]+cc[3]*18, bx=ax+cc[2]*(200+R()*60), bz=az+cc[3]*(170+R()*50);
      var q=[Math.min(ax,bx),Math.max(ax,bx),Math.min(az,bz),Math.max(az,bz)];
      zones.push(q); commercial(q[0],q[1],q[2],q[3],R,cc[3]>0?1:-1);
    }
  }
  var xm=xl+MILE/2, zm=z0+MILE/2;
  strip(S,xm,z0,xm,z1,17,0,STREET.collector);
  strip(S,xl,zm,xr,zm,17,0,STREET.collector);
  lightRow(xm,z0,xm,z1,46,10,9,2.0,LP.amber,1.25,R,true,26);
  lightRow(xl,zm,xr,zm,46,10,9,2.0,LP.amber,1.25,R,true,26);
  var quads=[[xl+17,xm-9,z0+17,zm-9],[xm+9,xr-17,z0+17,zm-9],[xl+17,xm-9,zm+9,z1-17],[xm+9,xr-17,zm+9,z1-17]];
  if(R()<0.24){ var qs=quads[R()*4|0], sx=(qs[0]+qs[1])/2, sz=(qs[2]+qs[3])/2; var sq=[sx-130,sx+130,sz-100,sz+100]; zones.push(sq); school(sq[0],sq[1],sq[2],sq[3],R); }
  if(R()<0.22){ var qp=quads[R()*4|0], px=lerp(qp[0],qp[1],0.3), pz=lerp(qp[2],qp[3],0.6); var pq=[px-110,px+110,pz-80,pz+80]; zones.push(pq); park(pq[0],pq[1],pq[2],pq[3],R); }
  for(var qi=0;qi<4;qi++){ var Q=quads[qi]; quarter(Q[0],Q[1],Q[2],Q[3],R,kind==='curvy',pal,excl); }
}

/* ---------- arterials, freeway, canal, traffic ---------- */
function arterials(){
  var jmin=Math.floor((-XMAX-ART0)/MILE)-1, jmax=Math.ceil((XMAX-ART0)/MILE)+1, R=mulberry(77);
  var asph=STREET.arterial;
  for(var j=jmin;j<=jmax;j++){
    var x=ART0+j*MILE; if(Math.abs(x)>XMAX) continue;
    strip(S,x,-600,x,ZEND,32,0.01,asph);
    var col=(j%3===0)?LP.white:LP.sodium;
    for(var z=-400; z<ZEND; z+=42){ light(x+17,10,z,2.3,col,1.35,1,undefined,30); light(x-17,10,z+21,2.3,col,1.35,1,undefined,30); }
    /* cars: two lanes each way; away-traffic shows tail lights, oncoming shows headlights */
    var lanes=[[RIGHT*4,1,LP.tail],[RIGHT*8,1,LP.tail],[-RIGHT*4,-1,LP.head],[-RIGHT*8,-1,LP.head]];
    for(var li=0;li<lanes.length;li++){
      var Rl=mulberry(j*991+li*7+3), ln=lanes[li], phases=[], d=Rl()*80;
      while(d<TILE){ phases.push(d); d+=38+Rl()*120; }
      var spd=15+Rl()*5;
      for(var cpy=0;cpy<NCOPY;cpy++){
        var zs=ln[1]>0?cpy*TILE:(cpy+1)*TILE;
        if(cpy*TILE>ZEND) continue;
        for(var p=0;p<phases.length;p++) if(lightsOK(x+ln[0],cpy*TILE+phases[p])) C.add(x+ln[0],0.9,zs,[0,ln[1],spd,TILE,phases[p],1.6],ln[2],1.8);
      }
    }
  }
  for(var cpy2=0;cpy2<NCOPY;cpy2++){
    for(var k=0;k<2;k++){
      var z0=cpy2*TILE+k*MILE; if(z0>ZEND) continue;
      strip(S,-XMAX,z0,XMAX,z0,32,0.01,asph);
      for(var xx=-XMAX; xx<XMAX; xx+=42){ light(xx,10,z0+17,2.3,LP.sodium,1.35,1,undefined,30); light(xx+21,10,z0-17,2.3,LP.sodium,1.35,1,undefined,30); }
      var xl=[[4,1],[8,1],[-4,-1],[-8,-1]];
      for(var q=0;q<xl.length;q++){
        var Rq=mulberry(k*313+q*17+11), d2=Rq()*90, spd2=15+Rq()*5;
        while(d2<2*XMAX){
          var colr=Rq()<0.55?LP.head:LP.tail, start=xl[q][1]>0?-XMAX:XMAX;
          C.add(start,0.9,z0+xl[q][0],[xl[q][1],0,spd2,2*XMAX,d2,1.6],colr,1.7);
          d2+=45+Rq()*150;
        }
      }
      for(var j2=jmin;j2<=jmax;j2++){
        var ix=ART0+j2*MILE; if(Math.abs(ix)>XMAX) continue;
        var ph=h2(j2,k+cpy2*0);
        for(var sgn=-1;sgn<=1;sgn+=2){
          light(ix+sgn*15,6,z0+sgn*15,1.0,LP.red,1.8,2,ph); light(ix+sgn*15,6.6,z0+sgn*15,1.0,LP.green,1.8,2,ph+0.5);
          light(ix-sgn*15,6,z0+sgn*15,1.0,LP.green,1.8,2,ph); light(ix-sgn*15,6.6,z0+sgn*15,1.0,LP.red,1.8,2,ph+0.5);
        }
      }
    }
    /* freeway */
    var fz=cpy2*TILE+FWY_Z;
    if(fz<ZEND){
      strip(S,-XMAX,fz,XMAX,fz,66,0.02,STREET.freeway);
      strip(G,-XMAX,fz,XMAX,fz,4,0.03,flat([0.5,0.48,0.46],1.2));
      for(var fx=-XMAX; fx<XMAX; fx+=50){ light(fx,13,fz-35,2.7,LP.amber,1.4,1,undefined,34); light(fx+25,13,fz+35,2.7,LP.amber,1.4,1,undefined,34); light(fx+12,13,fz,2.4,LP.white,1.1,1); }
      var fl=[[-8,1],[-13,1],[-18,1],[8,-1],[13,-1],[18,-1]];
      for(var f=0;f<fl.length;f++){
        var Rf=mulberry(f*97+5), df=Rf()*40, sf=27+Rf()*6;
        while(df<2*XMAX){ C.add(fl[f][1]>0?-XMAX:XMAX,1.0,fz+fl[f][0],[fl[f][1],0,sf,2*XMAX,df,1.7],Rf()<0.5?LP.head:LP.tail,1.8); df+=28+Rf()*70; }
      }
    }
    /* canal: still water that holds the sky, with lit towpaths */
    var cz=cpy2*TILE+CANAL_Z;
    if(cz<ZEND){
      strip(G,-XMAX,cz,XMAX,cz,40,0.02,flat(BASE.bank,0.25));
      strip(G,-XMAX,cz,XMAX,cz,24,0.03,emis([0.34,0.20,0.40],0.8));
      for(var cx=-XMAX; cx<XMAX; cx+=46){ light(cx,4,cz-17,1.2,LP.white,0.8,1,undefined,14); light(cx+23,4,cz+17,1.2,LP.white,0.8,1,undefined,14); }
    }
  }
}

/* ---------- build ---------- */
function build(){
  rect(G,0,ZEND/2,XMAX+3000,ZEND/2+3000,0,0,flat(BASE.ground,0.05));
  var jmin=Math.floor((-XMAX-ART0)/MILE)-1, jmax=Math.ceil((XMAX-ART0)/MILE)+1;
  for(var copy=0;copy<NCOPY;copy++) for(var k=0;k<2;k++) for(var j=jmin;j<=jmax;j++) superblock(j,k,copy);
  arterials();
}

/* ---------- GL ---------- */
function sh(type,src){ var s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function prog(vs,fs,attrs){
  var p=gl.createProgram(); gl.attachShader(p,sh(gl.VERTEX_SHADER,vs)); gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));
  attrs.forEach(function(a,i){ gl.bindAttribLocation(p,i,a); });
  gl.linkProgram(p); if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  var u={}, n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(var i=0;i<n;i++){ var info=gl.getActiveUniform(p,i); u[info.name.replace(/\[0\]$/,'')]=gl.getUniformLocation(p,info.name); }
  return {p:p,u:u,n:attrs.length};
}
function buf(data){ var b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW); return b; }
var HP='#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';

var VS_SKY='attribute vec2 a_p; varying vec2 v; void main(){ v=a_p; gl_Position=vec4(a_p,0.0,1.0); }';
var FS_SKY=HP+[
'varying vec2 v; uniform vec3 u_r,u_u,u_f; uniform vec2 u_t; uniform float u_time; uniform vec3 u_haze,u_haze2; uniform vec4 u_tow;',
'float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
'float n1(float x){ float i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f); return mix(hash(vec2(i,0.0)),hash(vec2(i+1.0,0.0)),f); }',
'float fbm(float x){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n1(x); x=x*2.03+1.7; a*=0.5; } return s; }',
'float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }',
'float fbm2(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.02+vec2(1.7,9.2); a*=0.5; } return s; }',
'void main(){',
'  vec3 d=normalize(v.x*u_t.x*u_r+v.y*u_t.y*u_u+u_f);',
'  float e=d.y, az=atan(d.x,d.z), ee=max(e,0.0);',
'  float g=exp(-pow((az-('+SUN_AZ.toFixed(3)+'))/0.62,2.0));',
'  if(e<-0.012){ gl_FragColor=vec4(u_haze2,1.0); return; }',
'  vec3 zen=vec3(0.09,0.26,0.60), hi=vec3(0.18,0.40,0.76), mid=vec3(0.38,0.58,0.87), low=vec3(0.64,0.76,0.92), hor=vec3(0.84,0.88,0.93);',
'  vec3 c=mix(hor,low,smoothstep(0.0,0.05,ee));',
'  c=mix(c,mid,smoothstep(0.03,0.14,ee));',
'  c=mix(c,hi,smoothstep(0.12,0.32,ee));',
'  c=mix(c,zen,smoothstep(0.28,0.7,ee));',
'  c+=vec3(1.0,0.96,0.86)*exp(-ee*30.0)*0.06;',
/* a few high fair-weather clouds */
'  float band=smoothstep(0.03,0.07,ee)*(1.0-smoothstep(0.20,0.34,ee));',
'  if(band>0.0){ float cl=smoothstep(0.58,0.86,fbm2(vec2(az*3.0+u_time*0.003,ee*18.0)))*band;',
'    c=mix(c,vec3(0.98,0.98,0.99),cl*0.75); }',
/* mountains: a hazy far range and a dark near range with lit rims and tower beacons */
'  if(e<0.075){',
'    float hf=0.022*smoothstep(0.30,0.78,fbm(az*2.6+3.1))-0.0006;',
'    float hn=0.044*pow(smoothstep(0.36,0.84,fbm(az*1.65+11.3)),1.5)-0.0006;',
'    if(e<hf){ c=mix(vec3(0.56,0.56,0.64),u_haze2,0.40); }',
'    if(e<hn){ c=mix(vec3(0.46,0.38,0.34),u_haze,0.30)+vec3(0.10,0.08,0.05)*smoothstep(hn-0.004,hn,e); }',
'  }',
'  if(e<0.0) c=mix(u_haze2*(1.0+0.7*g*exp(e*70.0)),c,smoothstep(-0.012,0.0,e)*0.0);',
'  gl_FragColor=vec4(c,1.0);',
'}'].join('\n');

var VS_SOLID='attribute vec3 a_pos; attribute vec4 a_col; uniform mat4 u_vp; uniform vec3 u_cam; varying vec4 v_col; varying float v_d;'+
 'void main(){ gl_Position=u_vp*vec4(a_pos,1.0); v_col=a_col; v_d=distance(a_pos.xz,u_cam.xz); }';
var FS_SOLID=HP+'varying vec4 v_col; varying float v_d; uniform vec3 u_haze,u_haze2; uniform float u_fogD,u_near,u_nearOnly;'+
 'void main(){ float f=1.0-exp(-pow(v_d/u_fogD,1.32)); f*=1.0-0.6*v_col.a; f=max(f,u_nearOnly*smoothstep(0.7*u_near,u_near,v_d));'+
 ' vec3 hz=mix(u_haze,u_haze2,smoothstep(2200.0,13000.0,v_d)); gl_FragColor=vec4(mix(v_col.rgb*(1.0+0.7*v_col.a),hz,f),1.0); }';

var PT_COMMON='uniform mat4 u_vp; uniform vec3 u_cam; uniform float u_px,u_time,u_view,u_near,u_dpr,u_maxPt,u_k; varying vec4 v_col; varying vec2 v_m;'+
 'void shade(vec3 pos,float size,float inten,float mode,float ph,vec3 col){'+
 '  gl_Position=u_vp*vec4(pos,1.0); float d=max(distance(pos,u_cam),1.0); float sz=size*u_px/d; float k=inten*u_k;'+
 '  if(mode>0.5&&mode<1.5){ k*=0.84+0.16*sin(u_time*(1.1+ph*2.3)+ph*40.0); }'+
 '  else if(mode>1.5&&mode<2.5){ k*=step(0.5,fract(u_time*0.045+ph)); }'+
 '  else if(mode>3.5&&mode<4.5){ k*=1.0-smoothstep(0.7*u_near,u_near,d); }'+
 '  k*=1.0/(1.0+d/5200.0); k*=1.0-smoothstep(0.80*u_view,u_view,d);'+
 '  if(mode>4.5){ float asp=clamp((u_cam.y-pos.y)/d,0.05,1.0); gl_PointSize=min(sz,u_maxPt); k*=min(1.0,sz/(6.0*u_dpr)); v_col=vec4(col,k); v_m=vec2(1.0,asp); return; }'+
 '  float mn=1.2*u_dpr; k*=min(1.0,sz/mn*0.6+0.42); float s=max(sz,mn)*3.0;'+
 '  gl_PointSize=min(s,u_maxPt); v_col=vec4(col,k); v_m=vec2(0.0,1.0); }';
var VS_LIGHT='attribute vec3 a_pos; attribute vec3 a_par; attribute vec4 a_col; '+PT_COMMON+
 'void main(){ shade(a_pos,a_par.x,a_col.a*2.0,a_par.z,a_par.y,a_col.rgb); }';
var VS_CAR='attribute vec3 a_pos; attribute vec3 a_dir; attribute vec3 a_len; attribute vec4 a_col; '+PT_COMMON+
 'void main(){ float t=mod(a_len.y+u_time*a_dir.z,a_len.x); vec3 p=a_pos+vec3(a_dir.x*t,0.0,a_dir.y*t); shade(p,a_len.z,a_col.a*2.0,0.0,0.0,a_col.rgb); }';
var FS_LIGHT=HP+'varying vec4 v_col; varying vec2 v_m; void main(){ vec2 q=gl_PointCoord*2.0-1.0;'+
 ' if(v_m.x>0.5){ q.y/=v_m.y; float p2=dot(q,q); if(p2>1.0) discard; float pa=exp(-p2*2.6)*(1.0-p2)*v_col.a; gl_FragColor=vec4(v_col.rgb*pa,1.0); return; }'+
 ' float r2=dot(q,q); if(r2>1.0) discard; float a=(exp(-r2*24.0)+exp(-r2*4.2)*0.22)*v_col.a; gl_FragColor=vec4(v_col.rgb*a,1.0); }';
var VS_TREE='attribute vec3 a_pos; attribute float a_sz; uniform mat4 u_vp; uniform vec3 u_cam; uniform float u_px,u_near,u_fogD,u_maxPt; varying float v_a; varying float v_f;'+
 'void main(){ gl_Position=u_vp*vec4(a_pos,1.0); float d=max(distance(a_pos,u_cam),1.0); gl_PointSize=min(a_sz*u_px/d,u_maxPt);'+
 ' v_f=1.0-exp(-pow(d/u_fogD,1.32)); v_a=1.0-smoothstep(0.7*u_near,u_near,d); }';
var FS_TREE=HP+'varying float v_a; varying float v_f; uniform vec3 u_haze; void main(){ vec2 q=gl_PointCoord*2.0-1.0; float r2=dot(q,q); if(r2>1.0) discard;'+
 ' float a=smoothstep(1.0,0.35,r2)*0.78*v_a; vec3 c=mix(vec3(0.17,0.27,0.12)*(1.25-0.5*r2)+vec3(0.06,0.05,0.0)*(1.0-r2),u_haze,v_f); gl_FragColor=vec4(c,a); }';

var P={}, BUF={}, CNT={}, BANDS=[], MAXPT=64, TOW=[0,0,0,0];
(function(){
  function fr(x){ return x-Math.floor(x); }
  function hash(x,y){ return fr(Math.sin(x*127.1+y*311.7)*43758.5453); }
  function n1(x){ var i=Math.floor(x), f=fr(x); f=f*f*(3-2*f); return hash(i,0)*(1-f)+hash(i+1,0)*f; }
  function fbm(x){ var s=0, a=0.5; for(var i=0;i<5;i++){ s+=a*n1(x); x=x*2.03+1.7; a*=0.5; } return s; }
  function ss(a,b,x){ var t=Math.min(1,Math.max(0,(x-a)/(b-a))); return t*t*(3-2*t); }
  for(var i=0;i<4;i++){ var ta=RIGHT*0.18+i*0.137-0.2; TOW[i]=0.044*Math.pow(ss(0.36,0.84,fbm(ta*1.65+11.3)),1.5)-0.0006; }
})();
function upload(){
  P.sky=prog(VS_SKY,FS_SKY,['a_p']);
  P.solid=prog(VS_SOLID,FS_SOLID,['a_pos','a_col']);
  P.light=prog(VS_LIGHT,FS_LIGHT,['a_pos','a_par','a_col']);
  P.car=prog(VS_CAR,FS_LIGHT,['a_pos','a_dir','a_len','a_col']);
  P.tree=prog(VS_TREE,FS_TREE,['a_pos','a_sz']);
  BUF.sky=buf(new Float32Array([-1,-1,3,-1,-1,3]));
  [['G',G],['S',S],['N',N]].forEach(function(e){ BUF[e[0]+'p']=buf(e[1].p.subarray(0,e[1].n*3)); BUF[e[0]+'c']=buf(e[1].c.subarray(0,e[1].n*4)); CNT[e[0]]=e[1].n; });
  /* bands -> one buffer with ranges */
  var tot=0; B.forEach(function(m){ if(m) tot+=m.n; });
  var bp=new Float32Array(tot*3), bc=new Uint8Array(tot*4), off=0;
  for(var i=0;i<B.length;i++){ var m=B[i]; if(!m){ BANDS[i]=[off,0]; continue; } bp.set(m.p.subarray(0,m.n*3),off*3); bc.set(m.c.subarray(0,m.n*4),off*4); BANDS[i]=[off,m.n]; off+=m.n; }
  BUF.Bp=buf(bp); BUF.Bc=buf(bc);
  BUF.Lp=buf(L.p.subarray(0,L.n*3)); BUF.La=buf(L.a.subarray(0,L.n*3)); BUF.Lc=buf(L.c.subarray(0,L.n*4)); CNT.L=L.n;
  /* cars: split the 6 attrs into dir(3) and len(3) */
  var cd=new Float32Array(C.n*3), cl=new Float32Array(C.n*3);
  for(var c=0;c<C.n;c++){ cd[c*3]=C.a[c*6]; cd[c*3+1]=C.a[c*6+1]; cd[c*3+2]=C.a[c*6+2]; cl[c*3]=C.a[c*6+3]; cl[c*3+1]=C.a[c*6+4]; cl[c*3+2]=C.a[c*6+5]; }
  BUF.Cp=buf(C.p.subarray(0,C.n*3)); BUF.Cd=buf(cd); BUF.Cl=buf(cl); BUF.Cc=buf(C.c.subarray(0,C.n*4)); CNT.C=C.n;
  BUF.Tp=buf(T.p.subarray(0,T.n*3)); BUF.Ta=buf(T.a.subarray(0,T.n)); CNT.T=T.n;
  var r=gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE); MAXPT=r?r[1]:64;
  G=S=N=L=C=T=null; B=[];
}
function attr(i,b,size,type,norm){ gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i,size,type||gl.FLOAT,!!norm,0,0); }
function attrsOff(n){ for(var i=0;i<6;i++) if(i>=n) gl.disableVertexAttribArray(i); }

/* ---------- camera ---------- */
function persp(fy,asp,n,f){ var t=1/Math.tan(fy/2), nf=1/(n-f); return [t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)*nf,-1, 0,0,2*f*n*nf,0]; }
function lookAt(e,c){
  var zx=e[0]-c[0], zy=e[1]-c[1], zz=e[2]-c[2], l=1/Math.hypot(zx,zy,zz); zx*=l; zy*=l; zz*=l;
  var xx=zz, xy=0, xz=-zx; l=1/Math.hypot(xx,xy,xz); xx*=l; xy*=l; xz*=l;      // up (0,1,0) x z
  var yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
  return [xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0, -(xx*e[0]+xy*e[1]+xz*e[2]), -(yx*e[0]+yy*e[1]+yz*e[2]), -(zx*e[0]+zy*e[1]+zz*e[2]), 1];
}
function mul(a,b){ var o=new Float32Array(16); for(var i=0;i<4;i++) for(var j=0;j<4;j++){ var s=0; for(var k=0;k<4;k++) s+=a[k*4+j]*b[i*4+k]; o[i*4+j]=s; } return o; }

var cam={x:0,y:150,z:0,yaw:0,pitch:0,fov:0.9}, VP=null, VIEWM=null, TANY=0.45, ASP=1;
var W=1, H=1, DPR=1, ptr={x:0,y:0}, ptrS={x:0,y:0}, scrollP=0, CLOCK=0, Z0=0, SPEED=9.5;
function setCamera(){
  var portrait=H>W*1.05;
  cam.fov=(portrait?70:52)*Math.PI/180;
  var hy=portrait?0.19:0.205;
  TANY=Math.tan(cam.fov/2); ASP=W/H;
  var pitch=Math.atan((1-2*hy)*TANY)+scrollP*0.13+ptrS.y*0.022;
  var yaw=0.032*Math.sin(CLOCK*0.047)+ptrS.x*0.055;
  cam.z=((Z0+CLOCK*SPEED)%TILE+TILE)%TILE;
  cam.x=RIGHT*(-30+26*Math.sin(CLOCK*0.041));
  cam.y=(portrait?185:150)+5*Math.sin(CLOCK*0.07)+scrollP*45;
  cam.yaw=yaw; cam.pitch=pitch;
  var f=[Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
  var e=[cam.x,cam.y,cam.z];
  VIEWM=lookAt(e,[e[0]+f[0],e[1]+f[1],e[2]+f[2]]);
  VP=mul(persp(cam.fov,ASP,4,32000),VIEWM);
  cam.f=f;
}
function proj(x,y,z){
  var m=VP, cx=m[0]*x+m[4]*y+m[8]*z+m[12], cy=m[1]*x+m[5]*y+m[9]*z+m[13], w=m[3]*x+m[7]*y+m[11]*z+m[15];
  if(w<2) return null;
  return [(cx/w*0.5+0.5)*W,(0.5-cy/w*0.5)*H,w];
}

/* ---------- drawing the world ---------- */
var HAZE=[0.70,0.76,0.84], HAZE2=[0.74,0.82,0.92];
function drawWorld(){
  gl.viewport(0,0,cw.width,cw.height);
  gl.clearColor(HAZE[0],HAZE[1],HAZE[2],1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
  /* sky */
  gl.useProgram(P.sky.p); attr(0,BUF.sky,2); attrsOff(1);
  var r=[VIEWM[0],VIEWM[4],VIEWM[8]], u=[VIEWM[1],VIEWM[5],VIEWM[9]];
  gl.uniform3fv(P.sky.u.u_r,r); gl.uniform3fv(P.sky.u.u_u,u); gl.uniform3fv(P.sky.u.u_f,cam.f);
  gl.uniform2f(P.sky.u.u_t,TANY*ASP,TANY); gl.uniform1f(P.sky.u.u_time,CLOCK); gl.uniform3fv(P.sky.u.u_haze,HAZE); gl.uniform3fv(P.sky.u.u_haze2,HAZE2); gl.uniform4f(P.sky.u.u_tow,TOW[0],TOW[1],TOW[2],TOW[3]);
  gl.drawArrays(gl.TRIANGLES,0,3);
  /* ground layers, painter's order */
  var s=P.solid; gl.useProgram(s.p);
  gl.uniformMatrix4fv(s.u.u_vp,false,VP); gl.uniform3f(s.u.u_cam,cam.x,cam.y,cam.z);
  gl.uniform3fv(s.u.u_haze,HAZE); gl.uniform3fv(s.u.u_haze2,HAZE2); gl.uniform1f(s.u.u_fogD,LITE?2500:3400); gl.uniform1f(s.u.u_near,NEAR);
  gl.uniform1f(s.u.u_nearOnly,0);
  ['G','S'].forEach(function(k){ attr(0,BUF[k+'p'],3); attr(1,BUF[k+'c'],4,gl.UNSIGNED_BYTE,true); attrsOff(2); gl.drawArrays(gl.TRIANGLES,0,CNT[k]); });
  gl.uniform1f(s.u.u_nearOnly,1);
  attr(0,BUF.Np,3); attr(1,BUF.Nc,4,gl.UNSIGNED_BYTE,true); gl.drawArrays(gl.TRIANGLES,0,CNT.N);
  /* buildings, only the bands in range */
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL);
  attr(0,BUF.Bp,3); attr(1,BUF.Bc,4,gl.UNSIGNED_BYTE,true);
  var b0=Math.max(0,Math.floor((cam.z-260)/BAND)), b1=Math.min(BANDS.length-1,Math.floor((cam.z+NEAR+60)/BAND));
  var first=-1, count=0;
  for(var b=b0;b<=b1;b++){ var rg=BANDS[b]; if(!rg||!rg[1]) continue; if(first<0) first=rg[0]; count=rg[0]+rg[1]-first; }
  if(first>=0&&count>0) gl.drawArrays(gl.TRIANGLES,first,count);
  /* trees */
  gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  var t=P.tree; gl.useProgram(t.p);
  gl.uniformMatrix4fv(t.u.u_vp,false,VP); gl.uniform3f(t.u.u_cam,cam.x,cam.y,cam.z); gl.uniform1f(t.u.u_px,PXM); gl.uniform1f(t.u.u_near,NEAR);
  gl.uniform1f(t.u.u_fogD,LITE?2400:3200); gl.uniform1f(t.u.u_maxPt,Math.min(MAXPT,90*DPR)); gl.uniform3fv(t.u.u_haze,HAZE);
  attr(0,BUF.Tp,3); attr(1,BUF.Ta,1); attrsOff(2); gl.drawArrays(gl.POINTS,0,CNT.T);
  /* lights and traffic, additive */
  gl.blendFunc(gl.ONE,gl.ONE);
  /* street, window and pool lights are off by day; only traffic shows */
  var c=P.car; gl.useProgram(c.p); ptUniforms(c);
  attr(0,BUF.Cp,3); attr(1,BUF.Cd,3); attr(2,BUF.Cl,3); attr(3,BUF.Cc,4,gl.UNSIGNED_BYTE,true); attrsOff(4); gl.drawArrays(gl.POINTS,0,CNT.C);
  gl.disable(gl.BLEND); gl.depthMask(true);
}
var PXM=800;
function ptUniforms(p){
  gl.uniformMatrix4fv(p.u.u_vp,false,VP); gl.uniform3f(p.u.u_cam,cam.x,cam.y,cam.z);
  gl.uniform1f(p.u.u_px,PXM); gl.uniform1f(p.u.u_time,CLOCK); gl.uniform1f(p.u.u_view,VIEW); gl.uniform1f(p.u.u_near,NEAR);
  gl.uniform1f(p.u.u_dpr,DPR); gl.uniform1f(p.u.u_maxPt,Math.min(MAXPT,120*DPR)); gl.uniform1f(p.u.u_k,p===P.car?0.22:0.0);
}

/* ---------- overlay: docks, the call, the aircraft and the ground unit ---------- */
var DOCKS=[];
function pickDocks(){
  /* five docks per two-mile tile, on pads just off the arterial */
  [[ART0-RIGHT*26,260],[ART0+RIGHT*30,900],[ART0-RIGHT*24,1540],[ART0+RIGHT*28,2180],[ART0-RIGHT*26,2820]].forEach(function(d,i){
    DOCKS.push({id:i+1,x:d[0],z:d[1]});
  });
}
function ringPts(x,z,r,y,n){ var out=[]; for(var i=0;i<=n;i++){ var a=i/n*6.2832, p=proj(x+Math.cos(a)*r,y,z+Math.sin(a)*r); if(!p) return null; out.push(p); } return out; }
function path(pts){ hud.beginPath(); hud.moveTo(pts[0][0],pts[0][1]); for(var i=1;i<pts.length;i++) hud.lineTo(pts[i][0],pts[i][1]); }
function hull(pts){
  pts=pts.slice().sort(function(a,b){ return a[0]-b[0]||a[1]-b[1]; });
  function cr(o,a,b){ return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]); }
  var lo=[], up=[], i;
  for(i=0;i<pts.length;i++){ while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],pts[i])<=0) lo.pop(); lo.push(pts[i]); }
  for(i=pts.length-1;i>=0;i--){ while(up.length>=2&&cr(up[up.length-2],up[up.length-1],pts[i])<=0) up.pop(); up.push(pts[i]); }
  up.pop(); lo.pop(); return lo.concat(up);
}
function tag(x,y,txt,col,a){
  hud.globalAlpha=a; hud.font='600 10px "IBM Plex Mono", ui-monospace, monospace';
  var w=hud.measureText(txt).width+14;
  if(x+w>W-12) x=Math.max(12,x-w-36);
  hud.fillStyle='rgba(6,9,16,.86)'; hud.fillRect(x,y-16,w,19);
  hud.fillStyle=col; hud.fillRect(x,y-16,2,19);
  hud.fillText(txt,x+8,y-3); hud.globalAlpha=1;
}
function rgba(c,a){ return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a.toFixed(3)+')'; }
var GOLD=[246,214,140], TEAL=[91,237,226], RED=[255,92,80], BLUE=[140,170,255], BEAM=[190,240,255];

/* the call cycle alternates two daytime jobs:
   TRAFFIC  a collision on the arterial: launch, transit, overwatch, units arrive, reroute, return
   SAR      a missing person: launch, transit, expanding-square search, thermal contact, team guided in, return */
var EV=null, NEXT_EV=2.6, OPS=null, UNIT=4, KIND=0;
var PH={traffic:[2.0,1.3,3.2,3.6,2.6,2.6], sar:[2.0,1.3,3.0,4.6,3.0,2.6]};
var CRUISE=15.6, LAUNCH_S=22;   /* 35 mph, and a 22-second launch, as in the response-gap calculator */
var COPYT=1e9;
function measureOps(){ var cp=document.querySelector('.aa-hero-copy'); if(cp){ COPYT=cp.getBoundingClientRect().top-host.getBoundingClientRect().top; } var o=document.getElementById('aaOps'); if(!o||!o.offsetParent){ OPS=null; return; } var a=o.getBoundingClientRect(), b=host.getBoundingClientRect(); OPS={l:a.left-b.left,t:a.top-b.top}; }
var LOGQ=[];
function log(cls,txt,ago){ LOGQ.push([cls,txt,ago||0]); }
function mmss(s){ s=Math.round(s); return Math.floor(s/60)+':'+('0'+s%60).slice(-2); }
function inFrame(p,port){
  if(!p) return false;
  if(port) return p[0]>W*0.24&&p[0]<W*0.76&&p[1]>COPYT*0.64&&p[1]<COPYT-36;
  if(p[0]<W*0.56||p[0]>W*0.80||p[1]<H*0.30||p[1]>H*0.52) return false;
  if(OPS&&p[0]>OPS.l-60&&p[1]>OPS.t-150) return false;
  return true;
}
function startEvent(){
  var port=H>W*1.05, kind=(KIND++%2)?'sar':'traffic', spot=null;
  for(var zr=port?700:520; zr<(port?4200:1300)&&!spot; zr+=40){
    var z=cam.z+zr;
    var xs=kind==='traffic'?[ART0+RIGHT*5,ART0-RIGHT*5]:[ART0-RIGHT*170,ART0+RIGHT*150,ART0-RIGHT*240,ART0+RIGHT*260,ART0-RIGHT*90,ART0+RIGHT*90,ART0-RIGHT*320,ART0+RIGHT*360];
    for(var i=0;i<xs.length;i++){ var p=proj(xs[i],0,z); if(inFrame(p,port)){ spot={x:xs[i],z:z}; break; } }
  }
  if(!spot) return false;
  var dock=null;
  for(var c=0;c<2;c++) DOCKS.forEach(function(d){
    var dz=d.z+c*TILE, zr=dz-cam.z, gap=spot.z-dz; if(zr<120||gap<140||gap>(port?1900:900)) return;
    var dist=Math.hypot(spot.x-d.x,spot.z-dz);
    if(!dock||dist<dock.dist) dock={d:d,x:d.x,z:dz,dist:dist};
  });
  if(!dock) for(var c2=0;c2<2;c2++) DOCKS.forEach(function(d){
    /* nothing ideal: take the nearest dock that is still ahead of the camera */
    var dz=d.z+c2*TILE; if(dz-cam.z<60||dz>spot.z+300) return;
    var dist=Math.hypot(spot.x-d.x,spot.z-dz); if(dist<120) return;
    if(!dock||dist<dock.dist) dock={d:d,x:d.x,z:dz,dist:dist};
  });
  if(!dock){ KIND--; return false; }
  EV={kind:kind,ix:spot.x,iz:spot.z,dock:dock,i:0,t:0,tts:LAUNCH_S+dock.dist/CRUISE,unit:UNIT++,
      grid:'ABCDEFGH'.charAt(Math.abs(Math.round(spot.x/90))%8)+(1+Math.abs(Math.round(spot.z/400))%9),
      /* SAR: the subject is somewhere off the last-known point; the search finds them */
      sx:spot.x+(Math.random()<0.5?-1:1)*(26+Math.random()*14), sz:spot.z+(Math.random()<0.5?-1:1)*(20+Math.random()*16)};
  if(kind==='traffic') log('red','P1 · Traffic collision, 3 vehicles · grid '+EV.grid);
  else log('red','P1 · Missing person, age 78 · last seen grid '+EV.grid);
  return true;
}
function stepEvent(dt){
  if(window.__aaNoEvents) return;
  if(!EV){ NEXT_EV-=dt; if(NEXT_EV<=0){ if(!startEvent()) NEXT_EV=1.0; } return; }
  var ph=PH[EV.kind]; EV.t+=dt;
  if(EV.t>=ph[EV.i]){
    EV.t=0; EV.i++;
    var T=EV.kind==='traffic', D='DOCK-0'+EV.dock.d.id;
    if(EV.i===1) log('teal','XR-1 launched · '+D);
    else if(EV.i===2) log('',T?'Engine '+EV.unit+' and Unit '+EV.unit+'A en route · ETA '+mmss(EV.tts*2.4):'Search team '+EV.unit+' staging · ETA '+mmss(EV.tts*2.8));
    else if(EV.i===3) log('gold',T?'On scene in '+mmss(EV.tts)+' · 2 lanes blocked, no fire':'On scene in '+mmss(EV.tts)+' · thermal search started');
    else if(EV.i===4) log(T?'blue':'gold',T?'Reroute posted · NB traffic to 48th St':'Thermal contact · subject located, responsive');
    else if(EV.i===5) log('blue',T?'Units on scene · lanes reopening':'Team '+EV.unit+' guided in by video · subject safe');
    else if(EV.i>=ph.length){ log('teal',D+' · landed · refuel and charge'); EV=null; NEXT_EV=2.5+Math.random()*2.5; return; }
  }
}
function searchPt(k){
  /* an expanding-square search around the last-known point, k from 0 to 1 */
  var legs=[[1,0],[0,1],[-1,0],[-1,0],[0,-1],[0,-1],[1,0],[1,0],[1,0],[0,1],[0,1],[0,1]], step=14, x=EV.ix, z=EV.iz, n=legs.length, L=[];
  var len=[1,1,2,2,2,2,3,3,3,3,3,3];
  var tot=0; for(var i=0;i<n;i++) tot+=len[i]; var want=k*tot, acc=0;
  for(i=0;i<n;i++){ var l=len[i]; if(acc+l>=want){ var f=(want-acc)/l; return [x+legs[i][0]*step*f, z+legs[i][1]*step*f]; } x+=legs[i][0]*step; z+=legs[i][1]*step; acc+=l; }
  return [x,z];
}
function dronePos(){
  var d=EV.dock, ph=PH[EV.kind], hov=[EV.ix,62,EV.iz-10], k, a;
  if(EV.i===0) return {p:[d.x,1.5,d.z],t:null,on:false};
  if(EV.i===1){ k=ease(EV.t/ph[1]); return {p:[d.x,lerp(1.5,62,k),d.z],t:null,on:true}; }
  if(EV.i===2){ k=ease(EV.t/ph[2]); return {p:[lerp(d.x,hov[0],k),62+Math.sin(k*3.14)*8,lerp(d.z,hov[2],k)],t:null,on:true,k:k}; }
  if(EV.kind==='sar'&&EV.i===3){ var q=searchPt(clamp(EV.t/ph[3],0,1)); return {p:[q[0],48,q[1]],t:[q[0],0.5,q[1]],on:true,search:true}; }
  var cx=EV.kind==='sar'?EV.sx:EV.ix, cz=EV.kind==='sar'?EV.sz:EV.iz;
  if(EV.i<5){ a=CLOCK*0.55; return {p:[cx+Math.cos(a)*22,58,cz+Math.sin(a)*22],t:[cx,0.5,cz],on:true}; }
  k=ease(EV.t/ph[5]); a=CLOCK*0.55; var s0=[cx+Math.cos(a)*22,58,cz+Math.sin(a)*22];
  return {p:[lerp(s0[0],d.x,k),k>0.85?lerp(58,1.5,(k-0.85)/0.15):58,lerp(s0[2],d.z,k)],t:null,on:true};
}
function unitPos(){
  /* responders on the ground: down the arterial; the SAR team then walks in to the subject */
  if(EV.i<2) return null;
  var ph=PH[EV.kind], total=ph[2]+ph[3]+(EV.kind==='sar'?ph[4]:0), el=EV.i===2?EV.t:EV.i===3?ph[2]+EV.t:EV.i===4&&EV.kind==='sar'?ph[2]+ph[3]+EV.t:total, k=clamp(el/total,0,1);
  var ax=ART0+RIGHT*(EV.kind==='traffic'?-6:6), z0=EV.iz-760, z1=EV.kind==='traffic'?EV.iz-14:EV.sz;
  var tx=EV.kind==='traffic'?ax:EV.sx;
  var seg1=Math.abs(z1-z0), seg2=Math.abs(tx-ax), L=seg1+seg2, s2=ease(k)*L;
  if(s2<=seg1) return [ax,0.8,z0+s2];
  return [lerp(ax,tx,(s2-seg1)/Math.max(seg2,1)),0.8,z1];
}

function dot(pt,r,col,a){ hud.fillStyle=rgba(col,a); hud.beginPath(); hud.arc(pt[0],pt[1],r,0,6.2832); hud.fill(); }
function drawHud(){
  hud.setTransform(DPR,0,0,DPR,0,0);
  hud.clearRect(0,0,W,H);
  var labels=[], port=H>W*1.05, i, c;
  /* docks along the arterials */
  for(c=0;c<2;c++) for(i=0;i<DOCKS.length;i++){
    var D=DOCKS[i], dz=D.z+c*TILE, zr=dz-cam.z;
    if(zr<60||zr>1700) continue;
    var fade=sstep(1700,1200,zr)*sstep(60,200,zr), dp=proj(D.x,1,dz); if(!dp) continue;
    if(!port){ fade*=sstep(W*0.40,W*0.54,dp[0]); } if(fade<0.02) continue;
    var busy=EV&&EV.dock.d===D&&EV.dock.z===dz&&EV.i>=1;
    var pad=ringPts(D.x,dz,7,0.6,4);
    if(pad){ hud.lineWidth=3; hud.strokeStyle=rgba([4,8,20],0.45*fade); path(pad); hud.stroke(); hud.lineWidth=1.6; hud.strokeStyle=rgba(TEAL,(busy?0.55:0.95)*fade); path(pad); hud.stroke(); }
    if(zr>180&&zr<1100&&fade>0.45) labels.push([dp[0]+12,dp[1]+16,'DOCK-0'+D.id+(busy?' · LAUNCHED':' · READY'),TEAL,0.9*fade]);
  }
  if(EV){
    var T=EV.kind==='traffic', ph=PH[EV.kind];
    var ip=proj(EV.ix,0.6,EV.iz);
    if(ip){
      if(T){
        /* the wreck: three stopped vehicles across the lanes, and the queue behind */
        [[-3,-2],[2,1],[5,-3]].forEach(function(v,n){ var vp=proj(EV.ix+v[0]*RIGHT,0.8,EV.iz+v[1]); if(vp){ dot(vp,3.6,[4,8,20],0.8); dot(vp,2.4,n===1?[255,255,255]:[255,170,60],1); } });
        if(EV.i<5) for(var q=1;q<9;q++){ var qp=proj(EV.ix+RIGHT*(q%2?4:8),0.8,EV.iz-10-q*9); if(qp){ dot(qp,2.6,[4,8,20],0.55); dot(qp,1.6,[255,70,60],0.9); } }
      }
      var hot=EV.i<3?1:0.55;
      for(var q2=0;q2<2;q2++){ var pr=((CLOCK*0.8+q2*0.5)%1), rg=ringPts(EV.ix,EV.iz,4+pr*(T?30:44),0.6,26); if(rg){ hud.lineWidth=1.8; hud.strokeStyle=rgba(RED,(1-pr)*0.95*hot); path(rg); hud.stroke(); } }
      if(!T&&EV.i===3){ /* the search box */
        var sb=ringPts(EV.ix+7,EV.iz+7,34,0.6,4); if(sb){ hud.setLineDash([3,5]); hud.lineWidth=1.2; hud.strokeStyle=rgba(GOLD,0.85); path(sb); hud.stroke(); hud.setLineDash([]); }
        hud.lineWidth=1.6; hud.strokeStyle=rgba(TEAL,0.9); hud.beginPath();
        for(var t=0;t<=clamp(EV.t/ph[3],0,1)+1e-6;t+=0.01){ var sp=searchPt(Math.min(t,1)), pp=proj(sp[0],0.6,sp[1]); if(!pp) continue; if(t===0) hud.moveTo(pp[0],pp[1]); else hud.lineTo(pp[0],pp[1]); } hud.stroke();
      }
      var itxt=T?['P1 · TRAFFIC COLLISION','CALL · AIRCRAFT TASKED','CALL · AIRCRAFT EN ROUTE','SCENE · 2 LANES BLOCKED','REROUTE · 48TH ST','LANES REOPENING'][EV.i]
                :['P1 · MISSING PERSON','LAST SEEN · AIRCRAFT TASKED','LAST SEEN · AIRCRAFT EN ROUTE','THERMAL SEARCH · GRID '+EV.grid,'LAST SEEN','LAST SEEN'][EV.i];
      labels.push([ip[0]+18,ip[1]-24,itxt,EV.i>=3?GOLD:RED,1]);
    }
    if(!T&&EV.i>=4){ /* the subject, found */
      var sp2=proj(EV.sx,0.6,EV.sz);
      if(sp2){ var pu=0.6+0.4*Math.sin(CLOCK*6); hud.lineWidth=2; hud.strokeStyle=rgba([255,255,255],0.95); hud.strokeRect(sp2[0]-9,sp2[1]-12,18,18); dot(sp2,3.4,[255,220,90],pu);
        labels.push([sp2[0]+16,sp2[1]-18,EV.i===4?'SUBJECT · THERMAL 98%':'SUBJECT · TEAM ON SITE',[255,226,140],1]); }
    }
    /* responders */
    var up=unitPos();
    if(up){ var us=proj(up[0],up[1],up[2]); if(us){
      var on=(CLOCK*6|0)%2, s0=clamp(2200/us[2],2.2,6);
      dot(us,s0*1.9,[4,8,20],0.55);
      dot([us[0]-s0*0.8,us[1]],s0*0.8,on?[255,50,50]:[70,110,255],1); dot([us[0]+s0*0.8,us[1]],s0*0.8,on?[70,110,255]:[255,50,50],1);
      if(EV.i<(T?4:5)) labels.push([us[0]+14,us[1]+18,T?'ENGINE '+EV.unit+' · EN ROUTE':'TEAM '+EV.unit+' · EN ROUTE',BLUE,0.95]);
    } }
    /* the aircraft */
    var dr=dronePos(), ds=proj(dr.p[0],dr.p[1],dr.p[2]);
    if(EV.i===2){
      var a0=proj(EV.dock.x,40,EV.dock.z), a1=proj(EV.ix,58,EV.iz);
      if(a0&&a1){ hud.setLineDash([5,7]); hud.lineDashOffset=-CLOCK*30; hud.lineWidth=3; hud.strokeStyle='rgba(4,8,20,.35)'; hud.beginPath(); hud.moveTo(a0[0],a0[1]); hud.lineTo(a1[0],a1[1]); hud.stroke(); hud.lineWidth=1.6; hud.strokeStyle=rgba(GOLD,0.95); hud.beginPath(); hud.moveTo(a0[0],a0[1]); hud.lineTo(a1[0],a1[1]); hud.stroke(); hud.setLineDash([]); }
    }
    if(ds&&dr.on){
      if(dr.t){
        var ep=ringPts(dr.t[0],dr.t[2],dr.search?8:10,0.5,18);
        if(ep){ var cen=proj(dr.t[0],0.5,dr.t[2]); var hl=hull(ep.concat([ds]));
          var gr=hud.createLinearGradient(ds[0],ds[1],cen[0],cen[1]); gr.addColorStop(0,rgba([255,255,255],0.42)); gr.addColorStop(1,rgba(TEAL,0.18));
          hud.fillStyle=gr; path(hl); hud.closePath(); hud.fill();
          hud.lineWidth=1.4; hud.strokeStyle=rgba(TEAL,0.9); path(ep); hud.stroke(); }
      }
      var sz=clamp(2600/ds[2],3,9);
      /* by day the aircraft is a dark airframe with strobes, ringed so it reads against the ground */
      dot(ds,sz*2.6,[255,255,255],0.22); hud.lineWidth=1.4; hud.strokeStyle='rgba(255,255,255,.95)'; hud.beginPath(); hud.arc(ds[0],ds[1],sz*2.0,0,6.2832); hud.stroke();
      dot(ds,sz*0.9,[18,22,30],1);
      [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(m){ dot([ds[0]+m[0]*sz*1.05,ds[1]+m[1]*sz*0.7],sz*0.42,[30,34,44],1); });
      dot([ds[0]-sz*1.15,ds[1]],sz*0.28,[255,60,50],1); dot([ds[0]+sz*1.15,ds[1]],sz*0.28,[60,255,140],1);
      if((CLOCK*0.9%1)<0.08) dot([ds[0],ds[1]-sz*0.5],sz*0.9,[255,255,255],1);
      var st=EV.kind==='traffic'?['',' · LAUNCH',' · EN ROUTE '+mmss(EV.tts*clamp(dr.k||0,0,1)),' · OVERWATCH · 4K',' · OVERWATCH · REROUTE',' · RETURNING']
                                :['',' · LAUNCH',' · EN ROUTE '+mmss(EV.tts*clamp(dr.k||0,0,1)),' · SEARCH · THERMAL',' · OVER SUBJECT',' · RETURNING'];
      labels.push([ds[0]+sz*2.4+8,ds[1]-sz*1.2,'XR-1'+st[EV.i],TEAL,0.95]);
    }
  }
  /* labels never sit on top of each other: a clash moves the later one up a row, or drops it */
  var placed=[];
  hud.font='600 10px "IBM Plex Mono", ui-monospace, monospace';
  function clash(x,y,w){ for(var k=0;k<placed.length;k++){ var q=placed[k]; if(x<q[0]+q[2]+6&&x+w+6>q[0]&&y-17<q[1]+3&&y+3>q[1]-17) return true; } return false; }
  labels.forEach(function(l){
    if(l[0]<10||l[0]>W-30) return;
    if(!port&&l[0]<W*0.5) return;
    if(!port&&OPS&&l[0]>OPS.l-140&&l[1]>OPS.t-6) return;
    var w=hud.measureText(l[2]).width+14, x=l[0]+w>W-12?Math.max(12,l[0]-w-36):l[0], y=l[1], tries=0;
    while(clash(x,y,w)&&tries<3){ y-=22; tries++; }
    if(tries>=3||y<90) return;
    if(port&&y>COPYT-14) return;
    placed.push([x,y,w]);
    hud.strokeStyle=rgba(l[3],0.8*l[4]); hud.lineWidth=1.2; hud.beginPath(); hud.moveTo(l[0]-8,l[1]+2); hud.lineTo(l[0],y-6); hud.stroke();
    tag(x,y,l[2],rgba(l[3],1),l[4]);
  });
}

/* ---------- the dispatch panel and telemetry ---------- */
var opsLog=document.getElementById('opsLog'), opsClock=document.getElementById('opsClock'), opsUnits=document.getElementById('opsUnits'), opsTts=document.getElementById('opsTts');
var teleAlt=document.getElementById('teleAlt'), teleHdg=document.getElementById('teleHdg');
function pad(n){ return (n<10?'0':'')+n; }
function simTime(ago){ var s=Math.floor(10*3600+24*60+15+CLOCK-(ago||0)); return pad(Math.floor(s/3600)%24)+':'+pad(Math.floor(s/60)%60)+':'+pad(s%60); }
var uiT=0, lastTts='—';
function flushUI(dt){
  uiT-=dt;
  while(LOGQ.length&&opsLog){
    var e=LOGQ.shift(), li=document.createElement('li');
    li.innerHTML='<time>'+simTime(e[2])+'</time><span class="'+e[0]+'">'+e[1]+'</span>';
    opsLog.insertBefore(li,opsLog.firstChild);
    while(opsLog.children.length>5) opsLog.removeChild(opsLog.lastChild);
  }
  if(uiT>0) return; uiT=0.2;
  if(opsClock) opsClock.textContent=simTime();
  var fly=EV&&EV.i>=1;
  if(opsUnits){ opsUnits.textContent=fly?'1 IN FLIGHT':DOCKS.length+' ON DOCK'; opsUnits.className=fly?'live':''; }
  if(opsTts){
    if(EV&&EV.i===2) lastTts=mmss(EV.tts*clamp(ease(EV.t/PH[EV.kind][2]),0,1));
    else if(EV&&EV.i>=3) lastTts=mmss(EV.tts);
    else if(EV&&EV.i<2) lastTts='0:00';
    opsTts.textContent=lastTts; opsTts.className=EV&&EV.i>=3?'live':(EV?'alert':'');
  }
  if(teleAlt) teleAlt.textContent='ALT '+Math.round(cam.y*3.281/5)*5+' FT';
  if(teleHdg){ var hd=((-cam.yaw*180/Math.PI)%360+360)%360; teleHdg.textContent='HDG '+('00'+Math.round(hd)).slice(-3)+'°'; }
}

/* ---------- sizing, input, loop ---------- */
function resize(){
  var r=host.getBoundingClientRect(); W=Math.max(1,r.width); H=Math.max(1,r.height);
  var want=Math.min(window.devicePixelRatio||1,LITE?1.25:1.6)*SCALE, px=W*H*want*want, cap=LITE?1.6e6:3.4e6;
  DPR=px>cap?Math.sqrt(cap/(W*H)):want;
  cw.width=Math.round(W*DPR); cw.height=Math.round(H*DPR);
  var hd=Math.min(window.devicePixelRatio||1,2); ch.width=Math.round(W*hd); ch.height=Math.round(H*hd);
  setCamera();
  PXM=cw.height/(2*TANY);
  measureOps();
  HUDR=hd;
}
var HUDR=1, SCALE=1, slowT=0, slowN=0;
var raf=0, last=0, visible=true, alive=false;
function frame(now){
  raf=0; if(!alive) return;
  var dt=last?Math.min(0.05,(now-last)/1000):0; last=now;
  if(!REDUCE) CLOCK+=dt;
  if(dt>0){ slowT+=dt; slowN++; if(slowN>=90){ if(slowT/slowN>0.034&&SCALE>0.55){ SCALE*=0.8; resize(); } slowT=0; slowN=0; } }
  ptrS.x=lerp(ptrS.x,ptr.x,0.04); ptrS.y=lerp(ptrS.y,ptr.y,0.04);
  setCamera();
  drawWorld();
  var saved=DPR; DPR=HUDR; drawHud(); DPR=saved;
  if(!REDUCE) stepEvent(dt);
  flushUI(dt);
  if(!REDUCE&&visible&&!document.hidden) raf=requestAnimationFrame(frame);
}
function kick(){ if(!raf&&alive){ last=0; raf=requestAnimationFrame(frame); } }

function onScroll(){ var r=hero.getBoundingClientRect(); scrollP=clamp(-r.top/Math.max(r.height,1),0,1); if(REDUCE) kick(); }
hero.addEventListener('pointermove',function(e){ var r=hero.getBoundingClientRect(); ptr.x=(e.clientX-r.left)/r.width-0.5; ptr.y=(e.clientY-r.top)/r.height-0.5; },{passive:true});
hero.addEventListener('pointerleave',function(){ ptr.x=0; ptr.y=0; });
addEventListener('scroll',onScroll,{passive:true});
addEventListener('resize',function(){ resize(); kick(); });
document.addEventListener('visibilitychange',function(){ if(!document.hidden) kick(); });
cw.addEventListener('webglcontextlost',function(e){ e.preventDefault(); alive=false; host.classList.remove('ready'); host.classList.add('nogl'); });
if('IntersectionObserver' in window){ new IntersectionObserver(function(es){ visible=es[0].isIntersecting; if(visible) kick(); },{threshold:0}).observe(hero); }

function start(){
  try{
    configure(); build(); upload(); pickDocks(); alive=true;
    Z0=0;
    log('','Sector 4 · 5 aircraft on dock · ready',52); log('teal','DOCK-03 · preflight check passed',31); log('','P3 · Debris in roadway · cleared from air',12);
    resize(); onScroll();
    frame(performance.now());
    if(!REDUCE) kick();
    window.__aaSeek=function(t){ while(CLOCK<t){ CLOCK+=0.1; setCamera(); stepEvent(0.1); } setCamera(); drawWorld(); var sv=DPR; DPR=HUDR; drawHud(); DPR=sv; flushUI(1); };
    window.__aaStats={lite:LITE,view:VIEW,nearDepth:NEAR,ncopy:NCOPY,lights:CNT.L,cars:CNT.C,trees:CNT.T,ground:CNT.G,streets:CNT.S,near:CNT.N,buildings:BANDS.reduce(function(t,b){ return t+(b?b[1]:0); },0),houses:HOUSES.length,docks:DOCKS.length};
    window.__aaDbg=function(){ return {ev:EV?[EV.kind,EV.i]:null,next:NEXT_EV,kind:KIND,COPYT:COPYT,W:W,H:H}; };
    requestAnimationFrame(function(){ host.classList.add('ready'); window.__aaReady=true; });
  }catch(err){ host.classList.add('nogl'); if(window.console) console.warn('AeroAssist hero:',err); }
}
if(document.readyState==='complete') setTimeout(start,30); else addEventListener('load',function(){ setTimeout(start,30); });
})();
