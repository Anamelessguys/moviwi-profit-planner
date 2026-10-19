(function (root) {
  'use strict';
  const BASE_ROAS = Object.freeze({ Meta: 1.94, Google: 2.91, Amazon: 3.93, TikTok: 1.98 });
  const CHANNELS = ['官网', 'Amazon', 'TikTok'];
  const PHASES = [
    ['官网早鸟预售', '11/10—11/19'], ['首发活动', '11/20—12/02'],
    ['常规促销', '12/03—12/17'], ['年末正价', '12/18—12/31']
  ];
  const DEFAULTS = {
    qty: 4000, fx: 6.7, transfer: 500,
    baseWeb: 40, baseAmazon: 40, baseTikTok: 20,
    phasePrice0: 279, phasePrice1: 319, phasePrice2: 339, phasePrice3: 399,
    phaseWeight0: 5, phaseWeight1: 60, phaseWeight2: 30, phaseWeight3: 5,
    organicWeb: 40, organicAmazon: 50, organicTikTok: 35,
    roasMeta: BASE_ROAS.Meta * 1.1, roasGoogle: BASE_ROAS.Google * 1.1,
    roasAmazon: BASE_ROAS.Amazon * 1.1, roasTikTok: BASE_ROAS.TikTok * 1.1,
    webMetaShare: 70,
    returnWeb: 8, returnAmazon: 15, returnTikTok: 15,
    feeWeb: 6, feeAmazon: 15, feeTikTok: 6,
    tailWeb: 15.96, tailAmazon: 7.98, tailTikTok: 15.96,
    costProduct: 850, costHead: 110.16, reservePct: 2,
    kolUSD: 100000, prWireCNY: 17741.5, prTargetUSD: 21900, extraFixedCNY: 0,
    commNatural: 20, commAd: 5, commCoverage: 100,
    sampleShippingCNY: 217.092,
    launchSamples: 0, launchOps: 0, launchRights: 0, launchReserveCover: true,
    monthQty: 3000, monthPrice: 339,
    monthWeb: 40, monthAmazon: 40, monthTikTok: 20, monthInheritMix: false,
    monthRoasFactor: 100, monthInheritOrganic: true,
    monthOrganicWeb: 40, monthOrganicAmazon: 50, monthOrganicTikTok: 35,
    monthKOLUSD: 0, monthPRCNY: 0, monthSamples: 30,
    monthOps: 24780, monthRights: 5000, monthOther: 0, monthReserveCover: true,
    allocationMode: 'none', allocWeb: 43, allocAmazon: 50.5, allocTikTok: 6.5,
    monthStart: '2027-01'
  };
  const pctKeys = Object.keys(DEFAULTS).filter(k => /^(base|organic|return|fee|monthOrganic|alloc)/.test(k) || ['webMetaShare','reservePct','commNatural','commAd','commCoverage','monthWeb','monthAmazon','monthTikTok'].includes(k) || /^phaseWeight/.test(k));
  const intKeys = ['qty','transfer','launchSamples','monthQty','monthSamples'];
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const sum = xs => xs.reduce((a,b) => a+b,0);
  const near = (a,b) => Math.abs(a-b) < 1e-6;
  const defaultState = () => clone(DEFAULTS);
  function referenceState(qty = 4000) {
    const s = defaultState(); s.qty = qty; s.transfer = 0; s.organicWeb = 35;
    Object.entries(BASE_ROAS).forEach(([k,v]) => { s['roas'+k] = v; });
    return s;
  }
  function validate(s) {
    const errors = [];
    for (const [key,value] of Object.entries(DEFAULTS)) {
      if (typeof value === 'number' && (typeof s[key] !== 'number' || !Number.isFinite(s[key]))) errors.push({key,message:'请填写有效数字'});
      else if (typeof value === 'boolean' && typeof s[key] !== 'boolean') errors.push({key,message:'开关值无效'});
    }
    if (errors.length) return errors;
    for (const [key,value] of Object.entries(DEFAULTS)) {
      if (typeof value === 'number' && s[key] < 0) errors.push({key,message:'数值不能小于0'});
      if (typeof value === 'number' && s[key] > 1e9) errors.push({key,message:'数值超出可测算范围'});
    }
    pctKeys.forEach(key => { if (s[key] > 100) errors.push({key,message:'比例应在0%至100%之间'}); });
    intKeys.forEach(key => { if (!Number.isInteger(s[key]) || s[key] > 1000000) errors.push({key,message:'台数应为0至1,000,000的整数'}); });
    ['roasMeta','roasGoogle','roasAmazon','roasTikTok'].forEach(key => {
      if (s[key] < .01 || s[key] > 1000) errors.push({key,message:'ROAS应大于0，且不超过1,000'});
    });
    if (s.fx <= 0 || s.fx > 1000) errors.push({key:'fx',message:'汇率应大于0，且不超过1,000'});
    if (s.monthRoasFactor <= 0 || s.monthRoasFactor > 1000) errors.push({key:'monthRoasFactor',message:'常态效率比例应大于0，且不超过1,000%'});
    for (let i=0;i<4;i++) if (s['phasePrice'+i] > 100000) errors.push({key:'phasePrice'+i,message:'阶段售价超出测算范围'});
    if (!near(sum([0,1,2,3].map(i=>s['phaseWeight'+i])),100)) errors.push({key:'phaseWeight0',message:'四个阶段的销量占比合计须为100%'});
    if (!near(s.baseWeb+s.baseAmazon+s.baseTikTok,100)) errors.push({key:'baseWeb',message:'正式开售阶段的渠道占比合计须为100%'});
    if (!s.monthInheritMix && !near(s.monthWeb+s.monthAmazon+s.monthTikTok,100)) errors.push({key:'monthWeb',message:'常态运营渠道占比合计须为100%'});
    if (!['none','gmv','units','custom'].includes(s.allocationMode)) errors.push({key:'allocationMode',message:'费用分摊方式无效'});
    if (s.allocationMode==='custom' && !near(s.allocWeb+s.allocAmazon+s.allocTikTok,100)) errors.push({key:'allocWeb',message:'自定义分摊比例合计须为100%'});
    if (typeof s.monthStart!=='string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(s.monthStart)) errors.push({key:'monthStart',message:'请填写有效运营起始月份'});
    return errors;
  }
  function maxTransfer(s) {
    const postWeight = sum([1,2,3].map(i=>s['phaseWeight'+i]))/100;
    return Math.max(0,Math.floor(s.qty*postWeight*s.baseTikTok/100 + 1e-7));
  }
  function launchRows(s) {
    const postWeight = sum([1,2,3].map(i=>s['phaseWeight'+i]))/100;
    const appliedTransfer = Math.min(s.transfer,maxTransfer(s));
    const shift = s.qty*postWeight > 0 ? appliedTransfer/(s.qty*postWeight) : 0;
    return [0,1,2,3].map(i=>({ name:PHASES[i][0], dates:PHASES[i][1], price:s['phasePrice'+i],
      qty:s.qty*s['phaseWeight'+i]/100,
      shares:i===0?[1,0,0]:[s.baseWeb/100,s.baseAmazon/100+shift,Math.max(0,s.baseTikTok/100-shift)] }));
  }
  function aggregate(s, rows, organic, roasFactor=1) {
    const suffixes=['Web','Amazon','TikTok'];
    const channels=CHANNELS.map((name,i)=>({name,index:i,qty:0,gmv:0,purchase:0,head:0,tail:0,platform:0,returnLoss:0,reserve:0,ad:0,commission:0,paidGMV:0,paidQty:0,organicQty:0,preMarketing:0,contribution:0}));
    const media=['Meta','Google','Amazon','TikTok'].map(name=>({name,ad:0,gmv:0,qty:0,roas:s['roas'+name]*roasFactor}));
    for (const row of rows) for (let k=0;k<3;k++) {
      const c=channels[k], suffix=suffixes[k], n=row.qty*row.shares[k];
      const gmv=n*row.price*s.fx, org=organic[k]/100;
      const purchase=n*s.costProduct, head=n*s.costHead, tail=n*s['tail'+suffix]*s.fx;
      const platform=gmv*s['fee'+suffix]/100, returnLoss=gmv*s['return'+suffix]/100, reserve=gmv*s.reservePct/100;
      const paidGMV=gmv*(1-org), paidQty=n*(1-org);
      let ad=0;
      if (k===0) {
        const split=s.webMetaShare/100;
        for (const [mi,share] of [[0,split],[1,1-split]]) {
          const spend=paidGMV*share/media[mi].roas;
          media[mi].ad+=spend;media[mi].gmv+=paidGMV*share;media[mi].qty+=paidQty*share;ad+=spend;
        }
      } else {
        const mi=k+1;ad=paidGMV/media[mi].roas;
        media[mi].ad+=ad;media[mi].gmv+=paidGMV;media[mi].qty+=paidQty;
      }
      const commission=k===2 ? gmv*(1-s.returnTikTok/100)*(org*s.commNatural/100+(1-org)*s.commAd/100)*s.commCoverage/100 : 0;
      const preMarketing=gmv-purchase-head-tail-platform-returnLoss-reserve;
      for (const [key,value] of Object.entries({qty:n,gmv,purchase,head,tail,platform,returnLoss,reserve,ad,commission,paidGMV,paidQty,organicQty:n*org,preMarketing,contribution:preMarketing-ad-commission})) c[key]+=value;
    }
    const totals={};
    for (const key of ['qty','gmv','purchase','head','tail','platform','returnLoss','reserve','ad','commission','paidGMV','paidQty','organicQty','preMarketing','contribution']) totals[key]=sum(channels.map(c=>c[key]));
    const priceFallback=sum(rows.map(r=>r.qty*r.price))/(totals.qty||1);
    channels.forEach(c=>{c.avgPrice=c.qty>0?c.gmv/c.qty/s.fx:priceFallback;c.unitContribution=c.qty>0?c.contribution/c.qty:0;});
    media.forEach(m=>{m.cpa=m.qty>0?m.ad/m.qty:null;});
    return {...totals,channels,media,rows,blendROAS:totals.ad>0?totals.paidGMV/totals.ad:null,adCPA:totals.paidQty>0?totals.ad/totals.paidQty:null};
  }
  function expenseCoverage(reserve, requested, cover) {
    return {requested,covered:cover?Math.min(reserve,requested):0,extra:cover?Math.max(0,requested-reserve):requested,remaining:cover?Math.max(0,reserve-requested):reserve};
  }
  function finish(s, a, fixed, coverage, allocationMode='none') {
    const common=fixed.kol+fixed.pr+fixed.other+coverage.extra;
    const netProfit=a.contribution-common;
    const totalCost=a.gmv-netProfit;
    const marketingTotal=a.ad+a.commission+a.reserve+common;
    let weights=[0,0,0];
    if (allocationMode==='gmv') weights=a.channels.map(c=>a.gmv>0?c.gmv/a.gmv:1/3);
    if (allocationMode==='units') weights=a.channels.map(c=>a.qty>0?c.qty/a.qty:1/3);
    if (allocationMode==='custom') weights=[s.allocWeb,s.allocAmazon,s.allocTikTok].map(x=>x/100);
    a.channels.forEach((c,i)=>{c.allocatedCommon=common*weights[i];c.profitAfterAllocation=c.contribution-c.allocatedCommon;});
    const maxAd=a.ad+netProfit;
    return {...a,fixed,coverage,common,totalCost,marketingTotal,netProfit,profitMargin:a.gmv>0?netProfit/a.gmv:null,
      mer:marketingTotal>0?a.gmv/marketingTotal:null,
      unallocatedCommon:allocationMode==='none'?common:0,
      sampleUnitCost:s.costProduct+s.sampleShippingCNY,
      breakEvenAd:maxAd>0?maxAd:0,
      breakEvenROAS:maxAd>0&&a.paidGMV>0?a.paidGMV/maxAd:null,
      efficiencyToBreakEven:maxAd>0&&a.ad>0?a.ad/maxAd:null};
  }
  function launch(s) {
    const a=aggregate(s,launchRows(s),[s.organicWeb,s.organicAmazon,s.organicTikTok]);
    const requested=s.launchSamples*(s.costProduct+s.sampleShippingCNY)+s.launchOps+s.launchRights;
    const coverage=expenseCoverage(a.reserve,requested,s.launchReserveCover);
    return finish(s,a,{kol:s.kolUSD*s.fx,pr:s.prWireCNY+s.prTargetUSD*s.fx,other:s.extraFixedCNY},coverage,s.allocationMode);
  }
  function monthly(s, first) {
    const shares=s.monthInheritMix ? first.channels.map(c=>first.qty>0?c.qty/first.qty:0) : [s.monthWeb,s.monthAmazon,s.monthTikTok].map(x=>x/100);
    if (s.monthInheritMix&&first.qty===0) shares.splice(0,3,s.baseWeb/100,s.baseAmazon/100,s.baseTikTok/100);
    const organic=s.monthInheritOrganic?[s.organicWeb,s.organicAmazon,s.organicTikTok]:[s.monthOrganicWeb,s.monthOrganicAmazon,s.monthOrganicTikTok];
    const a=aggregate(s,[{name:'常态运营',dates:s.monthStart,price:s.monthPrice,qty:s.monthQty,shares}],organic,s.monthRoasFactor/100);
    const requested=s.monthSamples*(s.costProduct+s.sampleShippingCNY)+s.monthOps+s.monthRights;
    return finish(s,a,{kol:s.monthKOLUSD*s.fx,pr:s.monthPRCNY,other:s.monthOther},expenseCoverage(a.reserve,requested,s.monthReserveCover));
  }
  function recovery(first, month, s) {
    const loss=Math.max(0,-first.netProfit);
    const covered=first.netProfit>=-1e-7;
    const months=covered?0:month.netProfit>0?loss/month.netProfit:null;
    return {loss,status:covered?'covered':month.netProfit>0?'recovering':'unrecoverable',months,
      wholeMonths:months===null?null:Math.ceil(months-1e-10),
      units:months===null?null:Math.ceil(months*s.monthQty-1e-8),
      horizon:months!==null?Math.max(6,Math.min(24,Math.ceil(months)+2)):12,
      points:Array.from({length:25},(_,i)=>({month:i,balance:first.netProfit+month.netProfit*i}))};
  }
  function compute(input) {
    const errors=validate(input);
    if (errors.length) return {ok:false,errors};
    const s=clone(input);const cap=maxTransfer(s);const requestedTransfer=s.transfer;
    s.transfer=Math.min(s.transfer,cap);
    const first=launch(s), month=monthly(s,first), ref=launch(referenceState(s.qty));
    return {ok:true,state:s,first,month,reference:ref,recovery:recovery(first,month,s),maxTransfer:cap,
      improvement:first.netProfit-ref.netProfit,
      warnings:requestedTransfer>s.transfer?[`转移台数已限制为${s.transfer}台，未超过TikTok可承接转出的目标。`]:[]};
  }
  function adUnitEconomics(s, price, result) {
    const first=result||launch(s);
    return ['Meta','Google','Amazon','TikTok'].map((name,i)=>{
      const k=i<2?0:i-1, suffix=['Web','Amazon','TikTok'][k];
      const fallback=[0,1,2,3].reduce((n,i)=>n+s['phasePrice'+i]*s['phaseWeight'+i]/100,0);
      const p=price==='weighted'?(first.channels[k].qty>0?first.channels[k].avgPrice:fallback):Number(price);
      const revenue=p*s.fx;
      const pre=revenue*(1-s['fee'+suffix]/100-s['return'+suffix]/100-s.reservePct/100)-s.costProduct-s.costHead-s['tail'+suffix]*s.fx;
      const commission=k===2?revenue*(1-s.returnTikTok/100)*s.commAd/100*s.commCoverage/100:0;
      const maxAd=pre-commission, roas=s['roas'+name], adCost=revenue/roas;
      return {name,price:p,revenue,roas,maxAd,breakEvenROAS:maxAd>0?revenue/maxAd:null,adCost,unitProfit:maxAd-adCost,commission};
    });
  }
  function importState(raw) {
    if (!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('参数文件格式不正确');
    const s=defaultState();
    for (const key of Object.keys(DEFAULTS)) if (Object.hasOwn(raw,key)) s[key]=raw[key];
    const errors=validate(s);
    if (errors.length) throw new Error(errors[0].message);
    return s;
  }
  root.MoviwiModel=Object.freeze({BASE_ROAS,CHANNELS,PHASES,DEFAULTS,defaultState,referenceState,clone,validate,maxTransfer,launch,monthly,compute,adUnitEconomics,importState});
})(globalThis);
