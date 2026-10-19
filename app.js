(function () {
  'use strict';
  const M=globalThis.MoviwiModel, $=id=>document.getElementById(id);
  const STORE='moviwi-profit-planner-v1';
  const nf=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0});
  const num=(v,d=0)=>Number(v).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
  const wan=(v,sign=false)=>(v<0?'−':sign&&v>0?'+':'')+num(Math.abs(v)/10000,2);
  const cash=(v,d=0)=>(v<0?'−':'')+'¥'+num(Math.abs(v),d);
  const pct=(v,d=1)=>v===null?'—':num(v*100,d)+'%';
  const signClass=v=>v>1e-7?'positive':v< -1e-7?'negative':'neutral';
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state=M.defaultState(), name='当前优化方案', saved=[],selected=[],view='overview',inputTab='main',lastResult=null,storageOK=true,saveTimer,toastTimer;
  let undoAction=null;
  try {
    const raw=localStorage.getItem(STORE);
    if(raw){const data=JSON.parse(raw);state=M.importState(data.state);name=typeof data.name==='string'?data.name.slice(0,60):name;
      saved=Array.isArray(data.saved)?data.saved.slice(0,30).filter(x=>{try{M.importState(x.state);return typeof x.id==='string'&&typeof x.name==='string';}catch{return false;}}).map(x=>({...x,name:x.name.slice(0,60),state:M.importState(x.state)})):[];
      selected=Array.isArray(data.selected)?data.selected.filter(id=>saved.some(x=>x.id===id)).slice(0,2):[];
    }
  }catch{storageOK=false;}
  const ICONS={profit:'<path d="m3 14 5-5 4 3 6-8M13 4h5v5"/>',gmv:'<path d="M3 5h14v12H3zM6 5V3h8v2M7 9h6M7 12h4"/>',budget:'<rect x="3" y="5" width="14" height="12" rx="2"/><path d="M3 9h14M12 13h2"/>',cost:'<path d="M5 3h10v14l-2-1-3 1-3-1-2 1zM8 7h4M8 10h4"/>',monthly:'<path d="M3 16V9h3v7M9 16V5h3v11M15 16V2h3v14"/>',recovery:'<circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/>'};
  const icon=k=>`<svg viewBox="0 0 20 20" aria-hidden="true">${ICONS[k]||ICONS.profit}</svg>`;
  const colors={Meta:'#5285d6',Google:'#64a28b',Amazon:'#dba94d',TikTok:'#3d5060',KOL:'#9d8fc5',PR:'#6eaeba',commission:'#d99191',other:'#b1bcc9'};
  function toast(text,action){
    clearTimeout(toastTimer);undoAction=action||null;
    $('toast').innerHTML=`<span>${esc(text)}</span>${action?'<button type="button" id="undo-action">撤销</button>':''}`;$('toast').hidden=false;
    toastTimer=setTimeout(()=>{$('toast').hidden=true;undoAction=null;},action?7000:4000);
  }
  function persist(){
    clearTimeout(saveTimer);saveTimer=setTimeout(()=>{
      try {if(!M.validate(state).length){localStorage.setItem(STORE,JSON.stringify({version:1,state,name,saved,selected}));storageOK=true;}}
      catch{storageOK=false;}
      $('save-status').classList.toggle('failed',!storageOK);
      $('save-status').innerHTML=`<span class="status-dot"></span>${storageOK?'本机已自动保存':'无法保存，请导出备份'}`;
    },200);
  }
  function field(key,label,{min=0,max=100,step=1,unit='%',decimals=0,disabled=false}={}){
    const value=state[key],d=Number.isFinite(value)?String(Number(value.toFixed(4))):'',rangeMax=Math.max(max,Number.isFinite(value)?value:0,min+step);
    return `<div class="field${disabled?' is-disabled':''}" data-field="${key}"><div class="field-head"><label class="field-label" for="input-${key}">${label}</label><div class="value-box"><input type="number" id="input-${key}" aria-label="${esc(label)}数值" data-key="${key}" data-decimals="${decimals}" min="${min}" step="${step}" value="${d}" ${disabled?'disabled':''}><span>${unit}</span></div></div><input type="range" aria-label="${esc(label)}" data-key="${key}" min="${min}" max="${rangeMax}" data-max="${max}" step="${step}" value="${Number.isFinite(value)?value:min}" ${disabled?'disabled':''}><div class="range-ends"><span>${num(min)}${unit}</span><span data-range-end="${key}">${num(rangeMax)}${unit}</span></div></div>`;
  }
  function full(key,label,unit='',step=.01){
    const value=Number.isFinite(state[key])?String(Number(state[key].toFixed(4))):'';
    return `<div class="full-number" data-field="${key}"><label for="input-${key}">${label}</label><div class="value-box"><input id="input-${key}" type="number" aria-label="${esc(label)}" data-key="${key}" min="0" step="${step}" value="${value}"><span>${unit}</span></div></div>`;
  }
  const toggle=(key,label)=>`<label class="toggle-field"><input type="checkbox" data-key="${key}" ${state[key]?'checked':''}>${label}</label>`;
  const group=(number,title,body,tag='')=>`<section class="control-group"><h3 class="control-group-title"><span><span class="group-number">${number} / </span>${title}</span>${tag?`<span class="section-tag">${tag}</span>`:''}</h3>${body}</section>`;
  const quick=(kind,items)=>`<div class="quick-buttons">${items.map(([value,label])=>`<button type="button" data-preset="${kind}" data-value="${value}">${label}</button>`).join('')}</div>`;
  function renderControls(){
    document.querySelectorAll('[data-input-tab]').forEach(el=>el.setAttribute('aria-selected',el.dataset.inputTab===inputTab));
    let h='';
    if(inputTab==='main'){
      h+=group('01','销售目标',field('qty','首发发货目标',{max:10000,step:1,unit:'台'})+`<div class="quantity-presets">${[3000,4000,5000].map(n=>`<button type="button" data-preset="qty" data-value="${n}">${num(n)} 台</button>`).join('')}</div>`+field('transfer','TikTok转移至Amazon',{max:M.maxTransfer(state),step:1,unit:'台'})+'<p class="control-note" id="mix-note"></p>');
      h+=group('02','广告ROAS',quick('roas',[[1,'原参考值'],[1.1,'＋10%'],[1.2,'＋20%']])+Object.keys(M.BASE_ROAS).map(k=>field('roas'+k,k+' ROAS',{min:.5,max:8,step:.001,unit:'倍',decimals:3})).join('')+'<p class="control-note">快捷键以原参考值为起点。固定销售目标下，ROAS用于反推广告预算。</p>');
      h+=group('03','非当期广告成交',field('organicWeb','官网非广告占比')+field('organicAmazon','Amazon非广告占比')+field('organicTikTok','TikTok非广告占比')+'<p class="control-note">包含达人、PR、品牌搜索和自然访问带来的去重订单；相关合作费用仍计入成本。</p>');
      h+=group('04','退货损失',quick('returns',[[0,'保留原值'],[1,'下降1pp'],[2,'下降2pp']])+field('returnWeb','官网退货损失率',{max:30,step:.1,decimals:1})+field('returnAmazon','Amazon退货损失率',{max:30,step:.1,decimals:1})+field('returnTikTok','TikTok退货损失率',{max:30,step:.1,decimals:1})+'<p class="control-note">pp指百分点。这里调整的是GMV损失比例，发货目标不重复扣减退货。</p>');
    }else if(inputTab==='cost'){
      h+=group('01','汇率与单台成本',full('fx','人民币／美元汇率','',.01)+full('costProduct','产品采购成本','元／台')+full('costHead','销售商品头程','元／台')+full('tailWeb','官网尾程','美元／台')+full('tailAmazon','Amazon尾程','美元／台')+full('tailTikTok','TikTok尾程','美元／台'));
      h+=group('02','平台费用与佣金',full('feeWeb','官网平台及支付费率','%')+full('feeAmazon','Amazon平台费率','%')+quick('amzFee',[[15,'15% 原口径'],[8,'8% 待核实试算']])+full('feeTikTok','TikTok平台费率','%')+full('commNatural','TikTok自然订单佣金','%')+full('commAd','TikTok广告订单佣金','%')+full('commCoverage','TikTok付佣覆盖率','%')+'<p class="control-note">8%需核对ASIN费用预览。自然与广告订单佣金互斥，按扣除退货后的成交额计提。</p>');
      h+=group('03','首发固定投入',full('kolUSD','KOL合作总预算','美元',100)+full('prWireCNY','美通社B套餐','元')+full('prTargetUSD','Kest定向发布','美元')+full('extraFixedCNY','其他一次性投入','元')+'<p class="control-note"><strong>TVC计入0元，另表管理。</strong>KOL为全部机构合计，不按机构重复采购。</p>');
      h+=group('04','预留及执行明细',full('reservePct','其他营销预留／GMV','%')+full('launchSamples','额外寄样台数','台',1)+full('sampleShippingCNY','每台样机总运费','元')+full('launchOps','首发执行及其他杂费','元')+full('launchRights','KOL包外素材授权','元')+toggle('launchReserveCover','优先由其他营销预留覆盖以上明细')+'<p class="control-note">样机成本＝采购成本＋样机总运费，不占待售库存。预留覆盖时仅追加超出部分；包内授权不再填入。</p>');
      h+=group('05','阶段价格与比例',`<table class="small-table"><thead><tr><th>阶段</th><th>售价／美元</th><th>销量／%</th></tr></thead><tbody>${M.PHASES.map((p,i)=>`<tr><td>${p[0]}<br><span style="color:#a4afb8;font-size:8px">${p[1]}</span></td><td><input type="number" data-key="phasePrice${i}" aria-label="${p[0]}售价" min="0" step="1" value="${state['phasePrice'+i]}"></td><td><input type="number" data-key="phaseWeight${i}" aria-label="${p[0]}销量占比" min="0" max="100" step=".1" value="${state['phaseWeight'+i]}"></td></tr>`).join('')}</tbody></table>`+full('baseWeb','正式开售官网基础比例','%')+full('baseAmazon','正式开售Amazon基础比例','%')+full('baseTikTok','正式开售TikTok基础比例','%')+'<p class="control-note">阶段占比及正式开售渠道占比分别合计100%。预售仅官网，500台转移按正式开售阶段权重分配。</p>');
      h+=group('06','官网广告分配',field('webMetaShare','官网广告GMV分给Meta')+'<p class="control-note">剩余分给Google。这里分配的是广告归因GMV，不是预算占比。</p>');
    }else{
      h+=group('01','正常运营规模',field('monthQty','后续每月发货量',{max:10000,step:1,unit:'台'})+quick('monthlyQty',[[2000,'2,000台'],[3000,'3,000台'],[5000,'5,000台']])+full('monthPrice','常态成交价','美元')+`<div class="full-number"><label for="month-start">运营起始月</label><input type="month" id="month-start" aria-label="运营起始月" data-key="monthStart" value="${esc(state.monthStart)}"></div>`);
      h+=group('02','常态渠道结构',toggle('monthInheritMix','沿用首发最终渠道比例')+field('monthWeb','常态官网比例',{disabled:state.monthInheritMix,step:.1,decimals:1})+field('monthAmazon','常态Amazon比例',{disabled:state.monthInheritMix,step:.1,decimals:1})+field('monthTikTok','常态TikTok比例',{disabled:state.monthInheritMix,step:.1,decimals:1})+'<p class="control-note">独立设置时合计100%。沿用时按首发最终比例，不在每月再次扣转500台。</p>');
      h+=group('03','常态获客效果',field('monthRoasFactor','相对当前ROAS的效率',{min:20,max:150,step:1})+toggle('monthInheritOrganic','沿用首发非广告成交占比')+field('monthOrganicWeb','常态官网非广告',{disabled:state.monthInheritOrganic})+field('monthOrganicAmazon','常态Amazon非广告',{disabled:state.monthInheritOrganic})+field('monthOrganicTikTok','常态TikTok非广告',{disabled:state.monthInheritOrganic})+'<p class="control-note">100%表示沿用当前四个平台ROAS。成本、平台费率及退货损失率沿用当前输入。</p>');
      h+=group('04','日常内容与执行',full('monthKOLUSD','每月额外付费KOL','美元')+full('monthPRCNY','每月额外PR','元')+full('monthSamples','每月额外寄样','台',1)+full('monthOps','每月执行及工具','元')+full('monthRights','每月包外授权及剪辑','元')+full('monthOther','每月其他固定追加','元')+toggle('monthReserveCover','寄样、执行及授权优先由2%预留覆盖')+'<p class="control-note">默认由内部置换接续，额外付费KOL月包为0。原执行、样机和续权预算均可按实际调整。</p>');
    }
    $('controls').innerHTML=h;syncControls();
  }
  function syncControls(){
    document.querySelectorAll('[data-key]').forEach(el=>{
      const key=el.dataset.key;let v=state[key];
      if(lastResult&&state.monthInheritMix&&['monthWeb','monthAmazon','monthTikTok'].includes(key)){
        const i=['monthWeb','monthAmazon','monthTikTok'].indexOf(key);
        v=lastResult.first.qty>0?lastResult.first.channels[i].qty/lastResult.first.qty*100:[state.baseWeb,state.baseAmazon,state.baseTikTok][i];
      }
      if(state.monthInheritOrganic&&['monthOrganicWeb','monthOrganicAmazon','monthOrganicTikTok'].includes(key))v=state[key.replace('monthOrganic','organic')];
      if(el.type==='checkbox'){el.checked=Boolean(v);return;}
      if(el.type==='range'){
        const max=key==='transfer'?M.maxTransfer(state):Math.max(Number(el.dataset.max),Number.isFinite(v)?v:0);
        el.max=String(Math.max(Number(el.min),max));
        if(document.activeElement!==el&&Number.isFinite(v))el.value=String(v);
        const fill=Math.max(0,Math.min(100,(Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min)||1)*100));el.style.setProperty('--fill',fill+'%');
        const end=document.querySelector(`[data-range-end="${key}"]`);if(end)end.textContent=num(max)+(key==='transfer'?'台':key==='qty'||key==='monthQty'?'台':key.startsWith('roas')?'倍':'%');
      }else if(document.activeElement!==el){
        el.value=typeof v==='string'?v:Number.isFinite(v)?String(Number(v.toFixed(4))):'';
      }
    });
    document.querySelectorAll('[data-preset]').forEach(el=>{
      const v=Number(el.dataset.value),kind=el.dataset.preset;
      let active=kind==='qty'?state.qty===v:kind==='monthlyQty'?state.monthQty===v:kind==='amzFee'?state.feeAmazon===v:false;
      if(kind==='roas')active=Object.keys(M.BASE_ROAS).every(k=>Math.abs(state['roas'+k]-M.BASE_ROAS[k]*v)<1e-6);
      if(kind==='returns')active=[state.returnWeb,state.returnAmazon,state.returnTikTok].every((r,i)=>Math.abs(r-([8,15,15][i]-v))<1e-6);
      el.classList.toggle('active',active);
    });
    if($('mix-note')&&lastResult){const ns=balancedCounts(lastResult.first.channels.map(c=>c.qty));$('mix-note').innerHTML=`目标 <strong>官网${num(ns[0])}／Amazon${num(ns[1])}／TikTok${num(ns[2])}</strong> 台。最多可转${num(lastResult.maxTransfer)}台。`;}
  }
  function balancedCounts(values){
    const a=values.map(x=>Math.floor(x+1e-9));let remain=Math.round(values.reduce((a,b)=>a+b,0))-a.reduce((a,b)=>a+b,0);
    const order=values.map((x,i)=>({i,f:x-a[i]})).sort((a,b)=>b.f-a.f);for(let i=0;i<remain;i++)a[order[i%order.length].i]++;
    return a;
  }
  function metric(label,value,sub,key,extra=''){
    return `<article class="metric ${extra}" data-metric="${key}"><div class="metric-label">${icon(key)}${label}</div><div class="metric-value${key==='recovery'&&typeof value==='string'&&!/[0-9]/.test(value)?' metric-wide-text':''}" id="metric-${key}">${value}</div><div class="metric-sub">${sub}</div></article>`;
  }
  function renderMetrics(r){
    const a=r.first,m=r.month,rec=r.recovery;
    const profitLabel=a.netProfit<0?'项目预计亏损':'项目税前利润';
    const imp=`<span class="${r.improvement>=0?'pill-up':'pill-down'}">较对照 ${wan(r.improvement,true)}万</span>`;
    let payValue,paySub;
    if(rec.status==='covered'){payValue='首发已保本';paySub='后续经营贡献可继续累计';}
    else if(rec.status==='unrecoverable'){payValue='暂无回收期';paySub='当前常态月结余不为正';}
    else{payValue=`${num(rec.months,2)}<span class="metric-unit">月</span>`;paySub=`按${rec.wholeMonths}个完整月预算 · 后续约${num(rec.units)}台`;}
    $('metrics').innerHTML=
      metric(profitLabel,`<span class="${signClass(a.netProfit)}">${wan(a.netProfit)}</span><span class="metric-unit">万元</span>`,`${imp}<span>利润率 ${pct(a.profitMargin)}</span>`,'profit','metric-profit '+(a.netProfit<0?'negative':''))+
      metric('目标销售额 GMV',`${wan(a.gmv)}<span class="metric-unit">万元</span>`,`${num(state.qty)}台 · 加权售价 $${a.qty>0?num(a.gmv/a.qty/state.fx,2):'—'}`,'gmv')+
      metric('完整营销投入',`${wan(a.marketingTotal)}<span class="metric-unit">万元</span>`,`含KOL、PR、广告、佣金及预留 · ${a.gmv>0?pct(a.marketingTotal/a.gmv):'—'}`,'budget')+
      metric('全部经营成本',`${wan(a.totalCost)}<span class="metric-unit">万元</span>`,`含商品、履约、平台及退货损失 · TVC另列`,'cost')+
      metric('常态项目月结余',`<span class="${signClass(m.netProfit)}">${wan(m.netProfit)}</span><span class="metric-unit">万元</span>`,`月发${num(state.monthQty)}台 · 均价$${num(state.monthPrice)} · 可调整`,'monthly')+
      metric('首发亏损回收期',payValue,paySub,'recovery');
    $('scenario-meta').innerHTML=`<span class="meta-chip">${num(state.qty)}台首发</span><span class="meta-chip">汇率 ${num(state.fx,2)}</span><span class="meta-chip">其他预留 ${num(state.reservePct,1)}%</span>${state.feeAmazon!==15?`<span class="meta-chip warning">Amazon ${num(state.feeAmazon,1)}% 试算</span>`:'<span class="meta-chip">TVC另列</span>'}`;
  }
  function budgetSegments(a){return [
    ...a.media.map(m=>({name:m.name+'广告',value:m.ad,color:colors[m.name]})),
    {name:'KOL合作',value:a.fixed.kol,color:colors.KOL},{name:'PR发布',value:a.fixed.pr,color:colors.PR},
    {name:'成交佣金',value:a.commission,color:colors.commission},
    {name:'预留及其他',value:a.reserve+a.coverage.extra+a.fixed.other,color:colors.other}
  ];}
  function renderBudget(a){
    const seg=budgetSegments(a),total=a.marketingTotal,C=2*Math.PI*80;let offset=0;
    const circles=seg.filter(x=>x.value>0).map(x=>{const dash=total>0?x.value/total*C:0;const h=`<circle cx="110" cy="110" r="80" fill="none" stroke="${x.color}" stroke-width="25" stroke-dasharray="${dash} ${C-dash}" stroke-dashoffset="${-offset}"><title>${esc(x.name)}：${cash(x.value)}，${pct(x.value/total)}</title></circle>`;offset+=dash;return h;}).join('');
    $('budget-chart').innerHTML=`<div class="donut-wrap"><svg viewBox="0 0 220 220" role="img" aria-label="营销费用构成"><circle cx="110" cy="110" r="80" stroke="#edf1f5" stroke-width="25" fill="none"/>${circles}</svg><div class="donut-center"><span>完整营销投入</span><strong>${wan(total)}</strong><small>万元 CNY</small></div></div><div class="donut-legend">${seg.map(x=>`<div class="legend-row"><span class="legend-dot" style="background:${x.color}"></span><span class="legend-name">${x.name}</span><b>${wan(x.value)}</b><small>${total>0?num(x.value/total*100,0):0}%</small></div>`).join('')}</div>`;
  }
  function svgWrap(label,body,width=640,height=260){return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${body}</svg>`;}
  function renderWaterfall(a){
    const items=[['销售GMV',a.gmv,true],['采购头程',-(a.purchase+a.head)],['尾程履约',-a.tail],['平台费用',-a.platform],['退货损失',-a.returnLoss],['KOL及PR',-(a.fixed.kol+a.fixed.pr)],['广告佣金',-(a.ad+a.commission)],['预留其他',-(a.reserve+a.coverage.extra+a.fixed.other)],['项目利润',a.netProfit,true]];
    const W=640,H=270,L=12,R=10,T=28,B=213,hi=Math.max(a.gmv,1)*1.07,lo=Math.min(0,a.netProfit)*1.13,scale=(B-T)/(hi-lo||1),y=v=>B-(v-lo)*scale;
    let current=a.gmv,body=`<line x1="${L}" x2="${W-R}" y1="${y(0)}" y2="${y(0)}" stroke="#e4eaf0"/>`;
    const step=(W-L-R)/items.length,bw=33;
    items.forEach((it,i)=>{
      const x=L+step*i+(step-bw)/2;let start,end;
      if(i===0){start=0;end=a.gmv;}else if(i===items.length-1){start=0;end=a.netProfit;}else{start=current;end=current+it[1];current=end;}
      const top=Math.min(y(start),y(end)),height=Math.max(2,Math.abs(y(end)-y(start)));
      const color=i===0?'#547d97':i===items.length-1?(a.netProfit>=0?'#4f9d84':'#cf8784'):'#b8cbd8';
      body+=`<rect x="${x}" y="${top}" width="${bw}" height="${height}" rx="3" fill="${color}"><title>${it[0]}：${cash(it[1])}</title></rect><text x="${x+bw/2}" y="${Math.max(12,top-7)}" fill="${i===items.length-1?color:'#8a9daa'}" font-size="9" text-anchor="middle">${wan(it[1])}</text><text x="${x+bw/2}" y="239" font-size="9" fill="#879ba9" text-anchor="middle">${it[0]}</text>`;
      if(i>0&&i<items.length-2)body+=`<line x1="${x+bw}" x2="${x+step}" y1="${y(end)}" y2="${y(end)}" stroke="#d9e3eb" stroke-dasharray="3 3"/>`;
    });
    $('waterfall-chart').innerHTML=svgWrap('销售额扣减各项成本后形成项目利润',body,W,H);
  }
  function renderChannelChart(a){
    const W=640,H=250,L=104,R=95,vals=a.channels.map(c=>c.contribution),lo=Math.min(0,...vals)*1.15,hi=Math.max(1,...vals)*1.15;
    const x=v=>L+(v-lo)/(hi-lo)*(W-L-R),zero=x(0);let body=`<line x1="${zero}" x2="${zero}" y1="22" y2="214" stroke="#e2eaf0" stroke-dasharray="4 4"/>`;
    const counts=balancedCounts(a.channels.map(c=>c.qty));
    a.channels.forEach((c,i)=>{const yy=35+i*64,xx=x(c.contribution),color=c.contribution>=0?'#6a91a7':'#d59a97';body+=`<text x="10" y="${yy+13}" font-size="12" fill="#4b6a80">${c.name}</text><text x="10" y="${yy+31}" font-size="9" fill="#a0adb8">${num(counts[i])} 台 · ${num(a.qty>0?c.qty/a.qty*100:0,1)}%</text><rect x="${Math.min(xx,zero)}" y="${yy}" width="${Math.max(2,Math.abs(xx-zero))}" height="24" rx="5" fill="${color}"><title>${c.name}分摊前贡献：${cash(c.contribution)}</title></rect><text x="${xx+(c.contribution>=0?8:-8)}" y="${yy+16}" font-size="11" font-weight="550" text-anchor="${c.contribution>=0?'start':'end'}" fill="${c.contribution>=0?'#517b91':'#bf7774'}">${wan(c.contribution)}万</text>`;});
    body+='<text x="630" y="239" text-anchor="end" font-size="9" fill="#9aabb7">共同费用在整体利润中另扣</text>';
    $('channel-chart').innerHTML=svgWrap('各渠道扣广告及佣金后的分摊前贡献',body,W,H);
  }
  function monthLabel(index){
    if(index===0)return '首发结束';
    const [y,m]=state.monthStart.split('-').map(Number),t=y*12+m-1+index-1;
    return `${Math.floor(t/12)}/${String(t%12+1).padStart(2,'0')}`;
  }
  function renderRecovery(r){
    const rec=r.recovery,points=rec.points.slice(0,rec.horizon+1),W=640,H=270,L=51,R=18,T=28,B=212;
    const values=points.map(p=>p.balance),min=Math.min(0,...values),max=Math.max(0,...values);let range=Math.max(max-min,10000),lo=min-range*.09,hi=max+range*.12;
    const x=i=>L+i/rec.horizon*(W-L-R),y=v=>B-(v-lo)/(hi-lo)*(B-T);let body='';
    for(let i=0;i<4;i++){const v=lo+(hi-lo)*i/3,yy=y(v);body+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="#edf1f5"/><text x="${L-9}" y="${yy+3}" font-size="9" text-anchor="end" fill="#9eadb9">${num(v/10000,0)}</text>`;}
    body+=`<text x="${L-12}" y="14" text-anchor="end" font-size="9" fill="#9eadb9">万元</text><line x1="${L}" x2="${W-R}" y1="${y(0)}" y2="${y(0)}" stroke="#b7cbbf" stroke-dasharray="4 4"/>`;
    const path=points.map((p,i)=>(i?'L':'M')+x(p.month).toFixed(2)+','+y(p.balance).toFixed(2)).join(' '),color=r.month.netProfit>=0?'#4d927d':'#c58a87';
    body+=`<defs><linearGradient id="recovery-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".13"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${path} L${x(rec.horizon)},${B} L${L},${B} Z" fill="url(#recovery-fill)"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`;
    const spacing=rec.horizon<=8?1:Math.ceil(rec.horizon/6);
    points.forEach(p=>{if(p.month%spacing===0||p.month===rec.horizon){body+=`<circle cx="${x(p.month)}" cy="${y(p.balance)}" r="3" fill="white" stroke="${color}" stroke-width="1.5"><title>${monthLabel(p.month)}累计利润：${cash(p.balance)}</title></circle><text x="${x(p.month)}" y="235" font-size="8.5" text-anchor="middle" fill="#9aaab6">${monthLabel(p.month)}</text>`;}});
    if(rec.months!==null&&rec.months>0&&rec.months<=rec.horizon){const xx=x(rec.months);body+=`<circle cx="${xx}" cy="${y(0)}" r="5" fill="#4d927d" stroke="white" stroke-width="2"/><text x="${Math.min(W-110,Math.max(65,xx+9))}" y="${Math.min(B-8,Math.max(T+12,y(0)-12))}" font-size="9" fill="#498a76">约${num(rec.months,2)}月覆盖</text>`;}
    body+=`<text x="${W-R}" y="260" font-size="8" text-anchor="end" fill="#a1aeb9">按相同月销量与效率平稳运行测算</text>`;
    $('recovery-chart').innerHTML=svgWrap('首发及后续运营累计利润回收曲线',body,W,H);
    $('recovery-subtitle').textContent=rec.status==='covered'?'首发已覆盖本表成本，继续观察常态经营贡献。':rec.status==='unrecoverable'?'当前月结余不为正，曲线尚不能覆盖首发亏损。':'首发结束后，以常态经营贡献覆盖待回收亏损。';
  }
  function renderMonthly(r){
    const a=r.month;
    $('monthly-mix-badge').textContent=state.monthInheritMix?'沿用首发渠道比例':'独立月度渠道比例';
    const items=[['月度发货与成交价',`${num(state.monthQty)}台 / $${num(state.monthPrice)}`,`官网${num(a.channels[0].qty,0)} / Amazon${num(a.channels[1].qty,0)} / TikTok${num(a.channels[2].qty,0)}`],['每月广告消耗',`${wan(a.ad)} 万元`,`最终ROAS×${num(state.monthRoasFactor/100,2)}，非广告占比可独立设置`],['每月内容与执行明细',`${wan(a.coverage.requested)} 万元`,`样机${state.monthSamples}台 · 单台含运费${cash(a.sampleUnitCost,2)}`],['常态月结余',`${wan(a.netProfit)} 万元`,`另列付费KOL $${num(state.monthKOLUSD)} · 额外PR ${cash(state.monthPRCNY)}`]];
    $('operating-stats').innerHTML=items.map((x,i)=>`<div class="operating-stat"><p>${x[0]}</p><strong class="${i===3?signClass(a.netProfit):''}">${x[1]}</strong><small>${x[2]}</small></div>`).join('');
    $('coverage-row').innerHTML=`<span>月度其他预留 <b>${wan(a.reserve)}万</b></span><span>已覆盖执行明细 <b>${wan(a.coverage.covered)}万</b></span><span>额外追加 <b class="${a.coverage.extra>0?'negative':''}">${wan(a.coverage.extra)}万</b></span><span>预留剩余 <b>${wan(a.coverage.remaining)}万</b></span>`;
  }
  function renderPhases(a){
    const counts=balancedCounts(a.rows.map(x=>x.qty));
    $('phase-summary').innerHTML=`<div class="phase-grid">${a.rows.map((p,i)=>`<div class="phase-item${i===1?' highlight':''}"><span class="phase-date">${p.dates}</span><h3>${p.name}</h3><strong>$${num(p.price)}</strong><div class="phase-qty">${num(counts[i])} 台 · 销量 ${num(state['phaseWeight'+i],1)}%</div><div class="phase-bar"><span style="width:${state['phaseWeight'+i]}%"></span></div></div>`).join('')}</div>`;
  }
  const table=(heads,rows,cls='')=>`<div class="table-wrap"><table class="data-table ${cls}"><thead><tr>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(x=>`<tr${x.total?' class="total"':''}>${x.cells.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const platform=(name)=>`<span class="media-name"><span class="platform-icon" style="background:${colors[name]||'#6b8ba1'}18;color:${colors[name]||'#6b8ba1'}">${name==='官网'?'W':name[0]}</span>${name}</span>`;
  function renderAdPerformance(r){
    const price=$('ad-price').value;
    const data=M.adUnitEconomics(state,price,r.first);
    $('ad-performance').innerHTML=table(['广告平台','当前ROAS','预计获客成本／台','广告费上限／台','单笔保本ROAS','单笔贡献','状态'],data.map(x=>({cells:[platform(x.name),`${num(x.roas,3)}<small>售价 $${num(x.price,2)}</small>`,`${cash(x.adCost,2)}<small>$${num(x.adCost/state.fx,2)}</small>`,`${cash(x.maxAd,2)}<small>含适用佣金，未含共同费用</small>`,x.breakEvenROAS===null?'无正向获客空间':num(x.breakEvenROAS,2),`<span class="${signClass(x.unitProfit)}">${cash(x.unitProfit,2)}</span>`,`<span class="status-badge ${x.unitProfit<0?'bad':''}">${x.unitProfit>=0?'高于单笔保本':'低于单笔保本'}</span>`]})));
  }
  function renderChannelDetails(r){
    const a=r.first,counts=balancedCounts(a.channels.map(c=>c.qty)),allocated=state.allocationMode!=='none';
    $('allocation-mode').value=state.allocationMode;
    $('custom-allocation').hidden=state.allocationMode!=='custom';
    if(state.allocationMode==='custom'&&!$('custom-allocation').firstElementChild)$('custom-allocation').innerHTML=`<div class="allocation-fields">${full('allocWeb','官网分摊','%')+full('allocAmazon','Amazon分摊','%')+full('allocTikTok','TikTok分摊','%')}</div>`;
    else if(state.allocationMode!=='custom')$('custom-allocation').innerHTML='';
    const rows=a.channels.map((c,i)=>({cells:[platform(c.name),num(counts[i]),wan(c.gmv),wan(c.purchase+c.head+c.tail),wan(c.platform+c.returnLoss+c.reserve),wan(c.ad),wan(c.commission),`<span class="${signClass(c.contribution)}">${wan(c.contribution)}</span>`,allocated?wan(c.allocatedCommon):'共同费用单列',`<span class="${signClass(c.profitAfterAllocation)}">${wan(c.profitAfterAllocation)}</span>`]}));
    rows.push({total:true,cells:['合计',num(state.qty),wan(a.gmv),wan(a.purchase+a.head+a.tail),wan(a.platform+a.returnLoss+a.reserve),wan(a.ad),wan(a.commission),wan(a.contribution),allocated?wan(a.common):'单列 '+wan(a.common),`<span class="${signClass(allocated?a.netProfit:a.contribution)}">${wan(allocated?a.netProfit:a.contribution)}</span>`]});
    $('channel-details').innerHTML=table(['渠道','发货台数','GMV／万','采购及物流／万','平台退货预留／万','广告／万','佣金／万','分摊前贡献／万','共同费用／万',allocated?'分摊后利润／万':'分摊前利润／万'],rows)+`<div class="common-summary"><span>共同费用 ${wan(a.common)}万元＝KOL ${wan(a.fixed.kol)}万＋PR ${wan(a.fixed.pr)}万＋其他及预留超支 ${wan(a.fixed.other+a.coverage.extra)}万</span><b>整体项目利润 <span class="${signClass(a.netProfit)}">${wan(a.netProfit)}万元</span></b></div>`;
  }
  function renderMedia(r){
    const a=r.first;
    const rows=a.media.map(m=>({cells:[platform(m.name),num(m.roas,3),wan(m.gmv),wan(m.ad),num(m.qty,1),m.cpa===null?'—':cash(m.cpa,2)]}));
    rows.push({total:true,cells:['综合／合计',a.blendROAS===null?'无需广告支撑':num(a.blendROAS,3),wan(a.paidGMV),wan(a.ad),num(a.paidQty,1),a.adCPA===null?'—':cash(a.adCPA,2)]});
    $('media-details').innerHTML=table(['媒体','最终ROAS','广告归因GMV／万','预计消耗／万','支撑订单／台','平均获客成本'],rows)+`<div class="common-summary"><span>整体营销投入产出 GMV／完整营销成本：<b>${a.mer===null?'—':num(a.mer,2)+'倍'}</b>，与广告ROAS口径不同。</span><span>当前保本所需综合广告ROAS：<b>${a.breakEvenROAS===null?'仅靠广告效率无法覆盖':num(a.breakEvenROAS,2)}</b></span></div>`;
  }
  function recoveryText(r){return r.recovery.status==='covered'?'首发已保本':r.recovery.months===null?'当前无法回收':num(r.recovery.months,2)+'月 / '+num(r.recovery.units)+'台';}
  function renderComparison(r){
    $('scenario-count').textContent=String(saved.length);
    const ref=M.compute(M.referenceState(state.qty));
    const columns=[{name:'同销量原经营假设',r:ref},{name:name||'当前方案',r},...selected.map(id=>saved.find(x=>x.id===id)).filter(Boolean).map(x=>({name:x.name,r:M.compute(x.state)})).filter(x=>x.r.ok)];
    const definitions=[['销售目标',r=>num(r.state.qty)+'台'],['目标GMV',r=>wan(r.first.gmv)+'万'],['完整营销投入',r=>wan(r.first.marketingTotal)+'万'],['广告预算',r=>wan(r.first.ad)+'万'],['项目税前利润',r=>`<span class="${signClass(r.first.netProfit)}">${wan(r.first.netProfit)}万</span>`],['利润率',r=>pct(r.first.profitMargin)],['官网／Amazon／TikTok',r=>balancedCounts(r.first.channels.map(c=>c.qty)).map(n=>num(n)).join(' / ')],['官网非广告比例',r=>num(r.state.organicWeb)+'%'],['退货损失 官网／AMZ／TT',r=>[r.state.returnWeb,r.state.returnAmazon,r.state.returnTikTok].map(x=>num(x,1)+'%').join(' / ')],['常态月发货目标',r=>num(r.state.monthQty)+'台'],['常态月结余',r=>`<span class="${signClass(r.month.netProfit)}">${wan(r.month.netProfit)}万</span>`],['首发亏损回收',recoveryText]];
    $('comparison-table').innerHTML=`<div class="table-wrap"><table class="data-table comparison-table"><thead><tr><th>同口径比较</th>${columns.map((c,i)=>`<th class="${i===1?'current-column':''}">${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${definitions.map(([title,get])=>`<tr><td>${title}</td>${columns.map((c,i)=>`<td class="${i===1?'current-column':''}">${get(c.r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="panel-footnote">首发对照采用相同台数、KOL10万美元、原ROAS、官网非广告35%、未转移渠道及原退货损失率。月度对照使用本页默认置换费用与其各自投放效率；保存方案按各自完整参数计算。</p>`;
    $('saved-scenarios').innerHTML=saved.length?`<div class="saved-list">${saved.map(x=>{const sr=M.compute(x.state);return `<div class="saved-item"><div><h3>${esc(x.name)}</h3><p>${num(x.state.qty)}台 · 项目利润 <span class="${signClass(sr.first.netProfit)}">${wan(sr.first.netProfit)}万</span> · ${esc(new Date(x.updatedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}))}</p></div><div class="saved-item-actions"><label class="compare-check"><input type="checkbox" data-compare-id="${esc(x.id)}" ${selected.includes(x.id)?'checked':''}>加入对比</label><button type="button" data-load-id="${esc(x.id)}">载入</button><button type="button" class="delete-scenario" data-delete-id="${esc(x.id)}">删除</button></div></div>`;}).join('')}</div>`:'<div class="empty-state"><span class="empty-icon">▤</span><h3>保存第一份方案</h3><p>调整好参数后点击“保存方案”，随时载入或比较。</p></div>';
  }
  function renderBasis(r){
    const sources=[['Meta电子类广告基准','https://www.triplewhale.com/blog/facebook-ads-benchmarks','原参考ROAS 1.94'],['Google电子类广告基准','https://www.triplewhale.com/blog/google-ads-benchmarks','原参考ROAS 2.91'],['Amazon电子类广告基准','https://www.triplewhale.com/blog/amazon-benchmarks','原参考ROAS 3.93'],['TikTok电子类广告基准','https://www.triplewhale.com/blog/tiktok-benchmarks','原参考ROAS 1.98'],['Amazon美国站官方费表','https://sell.amazon.com/pricing','类目实际费率以ASIN费用预览为准'],['美通社传播效果衡量','https://www.prnewswire.com/resources/articles/how-to-measure-press-release-performance/','发布服务与实际阅读分别统计']];
    $('basis-content').innerHTML=`<div class="basis-content"><h3>本页的范围</h3><p>这是按手动输入条件即时重算的经营预测，不是广告平台实时业绩。发货目标按付款并发货台数，退货单列损失。样机不从待售库存扣减。所有美元费用按当前汇率折算人民币。</p><p>项目税前利润已扣商品、头程、尾程、平台费、退货损失、营销预留、广告、适用佣金及首发KOL／PR；未计总部费用、融资、所得税及另列TVC。利润回收期不等同库存采购现金回笼。</p><h3>主要计算关系</h3><ol><li>各阶段GMV＝阶段目标台数×阶段售价×汇率；只有正式开售阶段参与TikTok向Amazon的台数转移。</li><li>渠道广告支撑GMV＝渠道GMV×（1－该渠道非当期广告成交比例）。官网广告GMV再按Meta与Google的比例拆分。</li><li>广告费＝该媒体广告支撑GMV÷最终ROAS；综合ROAS＝全部广告支撑GMV÷全部广告费。</li><li>TikTok佣金＝扣除原表退货损失后的成交额×适用佣金率×付佣覆盖率。自然与广告订单适用各自费率，不叠加。</li><li>其他预留＝GMV×预留比例。勾选“优先覆盖”时，样机、寄样、执行及包外授权仅追加超出预留的差额；KOL包内权益不重复列支。</li><li>首发亏损回收期＝首发待回收亏损÷常态项目月结余；月结余非正时不提供虚假回收期。首发已盈利时显示已保本。</li></ol><h3>当前关键前提</h3><p>KOL <code>$${num(state.kolUSD)}</code>；美通社 <code>¥${num(state.prWireCNY,2)}</code>；Kest <code>$${num(state.prTargetUSD)}</code>；TVC <code>0元</code>。官网／Amazon／TikTok非广告比例为 <code>${state.organicWeb}% / ${state.organicAmazon}% / ${state.organicTikTok}%</code>，均需上线数据验证。</p><p>Amazon平台费当前按 <code>${num(state.feeAmazon,1)}%</code>测算。8%仅为待核实情景，不能自动认定本品适用。平台返还、品牌激励及未经验证的长尾收益均未自动计入。</p><h3>预算文件与行业参考</h3><p>成本与阶段结构依据项目《Moviwi_营销预算与回收_20261016.xlsx》，首发KOL已按10万美元更新。PR沿用美通社B套餐与Kest五媒体报价。行业ROAS来自以下参考，统计期为2025年8月至2026年7月，客户样本不等于本品冷启动效果。</p>${sources.map(x=>`<div class="source-row"><a href="${x[1]}" target="_blank" rel="noopener noreferrer">${x[0]} ↗</a><span>${x[2]}</span></div>`).join('')}<h3>数据保存</h3><p>参数与命名方案保存在当前浏览器；不会自动跨设备同步。可以导出JSON备份，或用CSV和打印模式留存当前结果。导入会替换当前参数，已保存方案保留。</p></div>`;
    let summary=$('print-summary');if(!summary){summary=document.createElement('section');summary.id='print-summary';summary.className='print-summary';$('view-channels').append(summary);}
    summary.innerHTML=`<b>方案 ${esc(name)}</b> · ${num(state.qty)}台 · 汇率${state.fx} · KOL $${num(state.kolUSD)} · PR ¥${num(r.first.fixed.pr,2)} · TVC另列<br>非广告占比 官网${state.organicWeb}%／Amazon${state.organicAmazon}%／TikTok${state.organicTikTok}%；退货损失 ${state.returnWeb}%／${state.returnAmazon}%／${state.returnTikTok}%；Amazon平台费 ${state.feeAmazon}%。<br>正常运营：每月${num(state.monthQty)}台，均价$${state.monthPrice}，月结余${wan(r.month.netProfit)}万元。首发亏损回收：${recoveryText(r)}。项目税前贡献口径，未含总部、融资、所得税及TVC。${esc(new Date().toLocaleString('zh-CN'))}`;
  }
  function refresh(){
    const r=M.compute(state);
    document.querySelectorAll('.invalid').forEach(x=>x.classList.remove('invalid'));
    if(!r.ok){$('validation-banner').hidden=false;$('validation-banner').innerHTML=`<strong>请检查参数，结果暂保留上一组有效值：</strong>${esc([...new Set(r.errors.map(e=>e.message))].join('；'))}`;
      r.errors.forEach(e=>document.querySelectorAll(`[data-field="${e.key}"]`).forEach(x=>x.classList.add('invalid')));
      $('results').classList.add('results-invalid');$('metrics').classList.add('results-invalid');syncControls();return;
    }
    state=r.state;lastResult=r;$('validation-banner').hidden=true;$('results').classList.remove('results-invalid');$('metrics').classList.remove('results-invalid');
    $('notice-banner').hidden=!(r.warnings.length||state.feeAmazon===8);
    $('notice-banner').textContent=[...r.warnings,...(state.feeAmazon===8?['Amazon按8%进行情景测算，适用类目及其他服务费仍需费用预览核实。']:[])].join(' ');
    renderMetrics(r);renderBudget(r.first);renderWaterfall(r.first);renderChannelChart(r.first);renderRecovery(r);renderMonthly(r);renderPhases(r.first);renderAdPerformance(r);renderChannelDetails(r);renderMedia(r);renderComparison(r);renderBasis(r);syncControls();persist();
  }
  function setView(next){view=next;document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);if(el.dataset.view===view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});document.querySelectorAll('.view-panel').forEach(el=>el.hidden=el.id!=='view-'+view);}
  function setInputTab(next){inputTab=next;renderControls();$('controls').scrollTop=0;}
  function openSave(){if(M.validate(state).length){toast('请先修正无效参数');return;}$('save-name').value=name||'当前方案';$('save-dialog').showModal();$('save-name').focus();$('save-name').select();}
  function download(filename,contents,mime){const blob=new Blob([contents],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);$('export-menu').open=false;}
  function validExport(){if(M.validate(state).length){toast('请先修正无效参数，再导出');return false;}return true;}
  function exportJSON(){if(!validExport())return;download('Moviwi_参数_'+state.qty+'台_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({app:'moviwi-profit-planner',schemaVersion:1,name,exportedAt:new Date().toISOString(),settings:state},null,2),'application/json;charset=utf-8');toast('当前参数已导出，可用作跨设备备份');}
  function exportCSV(){
    if(!validExport())return;
    const r=lastResult,a=r.first,rows=[['Moviwi 营销经营测算',name],['导出时间',new Date().toLocaleString('zh-CN')],['口径','人民币；付款并发货；项目税前贡献；TVC另列'],[],['经营指标','人民币元'],['目标销量／台',state.qty],['目标GMV',a.gmv],['完整营销投入',a.marketingTotal],['全部经营成本',a.totalCost],['项目税前利润',a.netProfit],['利润率',a.profitMargin],['常态月发货／台',state.monthQty],['常态月结余',r.month.netProfit],['亏损回收月数',r.recovery.months===null?'当前无法回收':r.recovery.months],['后续回收销量／台',r.recovery.units===null?'当前无法回收':r.recovery.units],[],['渠道','发货台数','GMV','采购','头程','尾程','平台费','退货损失','其他预留','广告','佣金','分摊前贡献','分摊共同费用','分摊后利润']];
    a.channels.forEach(c=>rows.push([c.name,c.qty,c.gmv,c.purchase,c.head,c.tail,c.platform,c.returnLoss,c.reserve,c.ad,c.commission,c.contribution,c.allocatedCommon,c.profitAfterAllocation]));
    rows.push([],['共同费用','人民币元'],['KOL',a.fixed.kol],['PR',a.fixed.pr],['其他一次性',a.fixed.other],['执行明细超出预留',a.coverage.extra],[],['媒体','最终ROAS','归因GMV','广告费','广告支撑台数','平均获客成本']);
    a.media.forEach(m=>rows.push([m.name,m.roas,m.gmv,m.ad,m.qty,m.cpa===null?'—':m.cpa]));
    rows.push([],['当前参数代码','当前输入值']);Object.entries(state).forEach(([k,v])=>rows.push([k,v]));
    const cell=v=>{let text=typeof v==='number'?String(Number(v.toFixed(6))):String(v??'');if(typeof v==='string'&&/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
    download('Moviwi_经营测算_'+state.qty+'台_'+new Date().toISOString().slice(0,10)+'.csv','\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');toast('数据表已导出，可直接用Excel打开');
  }
  document.addEventListener('input',event=>{
    const el=event.target,key=el.dataset.key;
    if(key&&Object.hasOwn(M.DEFAULTS,key)&&el.type!=='checkbox'){
      state[key]=typeof M.DEFAULTS[key]==='string'?el.value:el.value===''?NaN:Number(el.value);refresh();
    }
    if(el.id==='scenario-name'){name=el.value.slice(0,60);if(lastResult)renderComparison(lastResult);persist();}
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.type==='checkbox'&&el.dataset.key){state[el.dataset.key]=el.checked;renderControls();refresh();}
    if(el.id==='ad-price'&&lastResult)renderAdPerformance(lastResult);
    if(el.id==='allocation-mode'){state.allocationMode=el.value;refresh();}
    if(el.dataset.compareId){const id=el.dataset.compareId;if(el.checked){if(selected.length>=2){el.checked=false;toast('最多再选两份保存方案进行比较');return;}selected.push(id);}else selected=selected.filter(x=>x!==id);renderComparison(lastResult);persist();}
  });
  document.addEventListener('click',event=>{
    const el=event.target.closest('button');if(!el)return;
    if(el.dataset.view){setView(el.dataset.view);return;}
    if(el.dataset.inputTab){setInputTab(el.dataset.inputTab);return;}
    if(el.dataset.preset){const kind=el.dataset.preset,value=Number(el.dataset.value);
      if(kind==='qty')state.qty=value;if(kind==='monthlyQty')state.monthQty=value;
      if(kind==='roas')Object.keys(M.BASE_ROAS).forEach(k=>state['roas'+k]=M.BASE_ROAS[k]*value);
      if(kind==='returns')[state.returnWeb,state.returnAmazon,state.returnTikTok]=[8,15,15].map(x=>Math.max(0,x-value));
      if(kind==='amzFee')state.feeAmazon=value;refresh();return;
    }
    if(el.dataset.loadId){const item=saved.find(x=>x.id===el.dataset.loadId);if(item){state=M.importState(item.state);name=item.name;$('scenario-name').value=name;renderControls();refresh();toast('已载入：'+name);}return;}
    if(el.dataset.deleteId){const previous=M.clone(saved),oldSelected=[...selected];saved=saved.filter(x=>x.id!==el.dataset.deleteId);selected=selected.filter(x=>x!==el.dataset.deleteId);renderComparison(lastResult);persist();toast('方案已删除',()=>{saved=previous;selected=oldSelected;renderComparison(lastResult);persist();});return;}
    switch(el.id){
      case 'save-scenario':case 'save-scenario-second':openSave();break;
      case 'cancel-save':$('save-dialog').close();break;
      case 'reset-defaults':{const prev=M.clone(state),oldName=name;state=M.defaultState();name='当前优化方案';$('scenario-name').value=name;renderControls();refresh();toast('已恢复4,000台默认优化方案',()=>{state=prev;name=oldName;$('scenario-name').value=name;renderControls();refresh();});break;}
      case 'report-toggle':{const active=document.body.classList.toggle('report-mode');el.textContent=active?'返回编辑':'汇报视图';$('scenario-name').readOnly=active;break;}
      case 'export-json':exportJSON();break;
      case 'export-csv':exportCSV();break;
      case 'import-json':$('import-file').click();$('export-menu').open=false;break;
      case 'print-report':if(validExport()){window.print();$('export-menu').open=false;}break;
      case 'edit-monthly':setInputTab('monthly');if(innerWidth<=720)toggleMobile(true);break;
      case 'edit-phases':setInputTab('cost');$('controls').scrollTop=$('controls').scrollHeight;if(innerWidth<=720)toggleMobile(true);break;
      case 'mobile-inputs':toggleMobile(!$('sidebar').classList.contains('mobile-open'));break;
      case 'close-inputs':toggleMobile(false);break;
      case 'undo-action':if(undoAction){undoAction();undoAction=null;$('toast').hidden=true;}break;
    }
  });
  $('save-form').addEventListener('submit',event=>{
    event.preventDefault();if(!validExport())return;const title=$('save-name').value.trim().slice(0,60);if(!title)return;
    const existing=saved.find(x=>x.name===title);const item={id:existing?.id||globalThis.crypto?.randomUUID?.()||'scenario-'+Date.now(),name:title,updatedAt:new Date().toISOString(),state:M.clone(state)};
    saved=[item,...saved.filter(x=>x.id!==item.id)].slice(0,30);selected=selected.filter(id=>saved.some(x=>x.id===id));name=title;$('scenario-name').value=name;renderComparison(lastResult);persist();$('save-dialog').close();toast(existing?'同名方案已更新':'方案已保存');
  });
  $('import-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{if(file.size>256*1024)throw new Error('参数文件过大，请使用本页导出的JSON');const raw=JSON.parse(await file.text());if(raw.app!=='moviwi-profit-planner'||raw.schemaVersion!==1||!raw.settings)throw new Error('请导入本页导出的参数JSON文件');
      const next=M.importState(raw.settings),prev=M.clone(state),prevName=name;state=next;name=typeof raw.name==='string'?raw.name.slice(0,60):'导入的方案';$('scenario-name').value=name;renderControls();refresh();toast('参数导入成功，已保存方案保留',()=>{state=prev;name=prevName;$('scenario-name').value=name;renderControls();refresh();});
    }catch(error){toast('导入失败：'+error.message);}finally{event.target.value='';}
  });
  const scrim=document.createElement('div');scrim.className='mobile-scrim';scrim.setAttribute('aria-hidden','true');document.body.append(scrim);
  function toggleMobile(open){$('sidebar').classList.toggle('mobile-open',open);scrim.classList.toggle('visible',open);$('mobile-inputs').textContent=open?'关闭参数':'调整参数';}
  scrim.addEventListener('click',()=>toggleMobile(false));document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleMobile(false);});
  window.addEventListener('beforeprint',()=>{if(lastResult)renderBasis(lastResult);});
  $('scenario-name').value=name;renderControls();setView(view);refresh();
})();
