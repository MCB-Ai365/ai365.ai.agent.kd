const {JSDOM}=require('jsdom');
const html=require('fs').readFileSync('mockup/knowledge-agent-v2.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true});
const w=dom.window,E=s=>w.eval(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ok=(c,m)=>{if(c){pass++;}else{fail++;console.log("FAIL:",m);}};

(async()=>{
await sleep(120);
// ── 기존 회귀 ──
ok(E("DB.docs.filter(d=>d.state==='uploaded').length")===6,"6 uploaded");
ok(E("DB.docs.filter(d=>d.state==='held').length")===4,"4 held");
ok(E("DB.docs.filter(d=>d.state==='staged').length")===1,"1 staged seed");
ok(E("(DB.docs.find(d=>d.source.indexOf('Apex')>=0)||{}).evalWhy").indexOf("용도 불충족")>=0,"apex near-miss why");
ok(E("DB.docs.filter(d=>d.state==='uploaded'&&d.dist&&d.dist.rag&&d.dist.viva).length")===6,"rag+viva all");
// ── 카탈로그·R13 데모 문서 ──
ok(E("DB.docs.filter(d=>d.state==='review').length")===4,"4 in review (incl CC-NC)");
const cc=E("DB.docs.find(d=>d.catalogId==='CC-BY-NC-4.0')");
ok(cc&&E("DB.docs.find(d=>d.catalogId==='CC-BY-NC-4.0').state")==="review","CC-NC doc in review");
ok(E("DB.docs.find(d=>d.catalogId==='CC-BY-NC-4.0').rules.join()").indexOf("R13")>=0,"R13 applied");
ok(E("DB.docs.find(d=>d.catalogId==='CC-BY-NC-4.0').evalWhy").indexOf("legal_review")>=0,"why mentions legal_review");
// KOGL-1 문서는 R02 규칙 보유
ok(E("DB.docs.some(d=>d.catalogId==='KOGL-1'&&d.rules&&d.rules.indexOf('R02')>=0)"),"KOGL-1 doc has R02");
// ── 카탈로그 뷰 렌더 ──
E("setView('ledger')");
ok(w.document.getElementById("view").innerHTML.indexOf("표준 카탈로그")>=0,"ledger mode toggle rendered");
E("ledgerMode='cat';renderView()");
const vc=w.document.getElementById("view").innerHTML;
ok(vc.indexOf("CC-BY-NC-4.0")>=0&&vc.indexOf("법무 확정 대기")>=0,"catalog cards + pending verdict");
ok(vc.indexOf("법무 의견서 등록")>=0,"legal confirm button");
// ── 법무 확정 → 재평가 → CC 문서 staged로 (fileMeta 기확보라 즉시) ──
E("legalConfirm('CC-BY-NC-4.0')");
await sleep(150);
ok(E("CATALOG.find(c=>c.id==='CC-BY-NC-4.0').uses.ai")==="a","verdict flipped to allow");
ok(E("DB.docs.find(d=>d.catalogId==='CC-BY-NC-4.0').state")==="staged","legal confirm moved doc to staged");
ok(E("DB.docs.find(d=>d.catalogId==='CC-BY-NC-4.0').rules.indexOf('R06')")>=0,"post-confirm rules updated");
// ── 상세 트레이스 ──
E("openDetail(DB.docs.find(d=>d.catalogId==='CC-BY-NC-4.0').id)");
const dd=w.document.getElementById("dlgroot").innerHTML;
ok(dd.indexOf("판정 근거")>=0&&dd.indexOf("AI 분석 생략")>=0,"trace group: catalog code-match");
ok(dd.indexOf("R02")>=0,"trace shows rules");
E("closeDlg()");
// 미스 문서(카탈로그 null) 트레이스는 #5 표기
E("openDetail(DB.docs.find(d=>!d.catalogId&&d.state==='review').id)");
ok(w.document.getElementById("dlgroot").innerHTML.indexOf("AI 정밀 분석")>=0,"trace: catalog miss uses #5");
E("closeDlg()");
// terms=0 문서 패키지 경고
E("openDetail(DB.docs.find(d=>d.fetchFail).id)");
ok(w.document.getElementById("dlgroot").innerHTML.indexOf("미수집 (신뢰도 −15)")>=0,"package terms missing note");
E("closeDlg()");
// ── 기존 플로우 회귀: 승인→staged (ASHRAE 지정) ──
E("openDecision(DB.docs.find(d=>d.state==='review'&&d.title.indexOf('ASHRAE')>=0).id,'approve')");
w.document.getElementById("dec-reason").value="확인";E("applyDecision()");
ok(E("DB.docs.filter(d=>d.state==='staged').length")===3,"approve->staged (with CC doc)");
// 번들 라이선스 등록 → Apex 이동
E("openLicForm('Apex Market Intelligence')");
w.document.getElementById("lf-name").value="Apex 전체 갱신";
w.document.getElementById("lf-sv").checked=true;
E("saveLic()");
await sleep(1700);
ok(E("DB.docs.find(d=>d.source.indexOf('Apex')>=0).state")==="staged","full-bundle license -> staged");
ok(E("DB.docs.find(d=>d.source.indexOf('Apex')>=0).rules.indexOf('R10')")>=0,"R10 on licensed doc");
// 해지(잔존 없음) → 기적재 불변 (사후 삭제는 SharePoint 거버넌스 영역)
E("DB.licenses.find(l=>l.id==='LIC-001').survival=false");
E("revokeLic('LIC-001')");
E("var cb=_confirmCb;_confirmCb=null;closeDlg();cb()");
ok(E("DB.docs.filter(d=>d.appliedLic==='LIC-001'&&d.state==='uploaded').length")===1,"uploaded immutable");
// 업로드 체크리스트 확정 + 파일명 코드
const sid=E("DB.docs.find(d=>d.state==='staged').id");
E(`openUploadConfirm('${sid}')`);E("dialog.ack=true");E("confirmUpload()");
ok(E(`DB.docs.find(d=>d.id==='${sid}').state`)==="uploaded","checklist upload");
ok(E(`DB.docs.find(d=>d.id==='${sid}').spName`).indexOf("[AI365-")>=0,"filename pointer");
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})().catch(e=>{console.error("ERROR:",e.stack);process.exit(1)});
