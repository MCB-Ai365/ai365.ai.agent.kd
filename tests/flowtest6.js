const {JSDOM}=require('jsdom');
const html=require('fs').readFileSync('mockup/knowledge-agent-v2.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true});
const w=dom.window,E=s=>w.eval(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ok=(c,m)=>{if(c){pass++;}else{fail++;console.log("FAIL:",m);}};
(async()=>{
await sleep(120);
// 표기 규칙 탭 — 기본 키워드 전시 + 사용자 추가
E("openSettings()");E("switchMTab('lic')");
let m=w.document.getElementById("modalroot").innerHTML;
ok(m.indexOf("저작권 표기 탐지 키워드")>=0,"lic tab title");
ok(m.indexOf("무단 전재 및 재배포 금지")>=0&&m.indexOf(">기본</b>")>=0,"built-in aliases shown as 기본 chips");
ok(m.indexOf("무단 복제를 금합니다")>=0,"user keyword chip shown");
ok(m.indexOf("표기의 <b>부재</b>")>=0,"NO-MARKING absence note");
// 사용자 키워드 추가 → catEntry 폴백 매칭 작동
w.document.getElementById("lkw-CC-BY-4.0").value="사내 배포 자유";
E("addLicKw('CC-BY-4.0')");
ok(E("DB.settings.licKeywords.some(r=>r.kw==='사내 배포 자유'&&r.cat==='CC-BY-4.0')"),"user kw added");
const r=E(`(function(){const d={lic:"본 문서는 사내 배포 자유",snapMark:"",lv:2,cond:["attribution"],conf:92,source:"x"};const ev=evaluate(d);return d.catalogId+"|"+ev.route;})()`);
ok(r==="CC-BY-4.0|uploaded","custom keyword fallback matched: "+r);
// 기본 alias 매칭 (KR-NEWS)
const r2=E(`(function(){const d={lic:"무단 전재 및 재배포 금지",snapMark:"",lv:4,conf:90,source:"뉴스"};const ev=evaluate(d);return d.catalogId+"|"+ev.route;})()`);
ok(r2==="KR-NEWS|held","builtin alias matched: "+r2);
E("closeSettings()");
// 개발 어휘 부재 검증 — 렌더된 전체 화면 + 5개 설정 탭
let all=w.document.getElementById('app').innerHTML;
['queue','log','staging','archive','hold','ledger','audit'].forEach(v=>{E("setView('"+v+"')");all+=w.document.getElementById("view").innerHTML;});
E("ledgerMode='cat';renderView()");all+=w.document.getElementById("view").innerHTML;
['policy','sources','lic','routing','conn'].forEach(t=>{E("openSettings()");E("switchMTab('"+t+"')");all+=w.document.getElementById("modalroot").innerHTML;});
E("closeSettings()");
E("openDetail(DB.docs.find(d=>d.catalogId==='CC-BY-NC-4.0').id)");all+=w.document.getElementById("dlgroot").innerHTML;E("closeDlg()");
ok(all.indexOf("호출#")<0&&all.indexOf("호출 #")<0,"no 호출# in any rendered UI");
ok(all.indexOf("[BACKEND]")<0,"no [BACKEND] in any rendered UI");
ok(all.indexOf("closed-book")<0,"no closed-book jargon");
ok(all.indexOf("AI 정밀 분석")>=0,"humanized wording present");
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})().catch(e=>{console.error("ERROR:",e.stack);process.exit(1)});
