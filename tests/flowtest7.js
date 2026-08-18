const {JSDOM}=require('jsdom');
const html=require('fs').readFileSync('mockup/knowledge-agent-v2.html','utf8');
const errs=[];
const vc=new (require('jsdom').VirtualConsole)();
vc.on('jsdomError',e=>errs.push(String(e)));
vc.on('error',(...a)=>errs.push(a.join(' ')));
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,E=s=>w.eval(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ok=(c,m)=>{if(c){pass++;}else{fail++;console.log("FAIL:",m);}};

(async()=>{
await sleep(150);
// ── 기본: 기존 지식 에이전트 회귀 (분기가 기존 화면을 깨지 않았는가)
ok(E("workspace")==="agent","starts in agent ws");
ok(E("DB.docs.filter(d=>d.state==='uploaded').length")===6,"agent regression: 6 uploaded");
ok(w.document.querySelectorAll(".tabs .tab").length===7,"agent 7 tabs");
ok(w.document.querySelector(".ws-seg")!==null,"ws switcher rendered");
ok(w.document.querySelectorAll(".ws-seg button").length===3,"3 workspaces");

// ── 동영상 워크스페이스
E("setWorkspace('video')");
ok(E("workspace")==="video","switched to video");
ok(w.document.getElementById("view").innerHTML.indexOf("링크 목록")>=0,"inbox rendered");
ok(w.document.querySelectorAll(".yt-card").length===5,"5 seed links");
ok(w.document.getElementById("view").innerHTML.indexOf("2차적저작물")>=0,"derivative-work warning shown");

// 수동 링크 추가 — 유튜브 아닌 URL 거부
w.document.getElementById("yt-url").value="https://vimeo.com/x";
E("addYtLink()");
ok(E("DB.videos.links.length")===5,"non-youtube rejected");
w.document.getElementById("yt-url").value="https://youtube.com/watch?v=manual-1";
w.document.getElementById("yt-title").value="수동 테스트 영상";
E("addYtLink()");
ok(E("DB.videos.links.length")===6&&E("DB.videos.links[0].ytLic")==="std","manual link added as std license");

// 승인: 표준 라이선스 영상은 ccby/own 라디오가 비활성
E("openYtApprove('YT-003')");
let dd=w.document.getElementById("dlgroot");
const radios=[...dd.querySelectorAll('input[name="ytb"]')];
ok(radios.find(x=>x.value==="ccby").disabled&&radios.find(x=>x.value==="own").disabled,"std video: ccby/own disabled");
ok(!radios.find(x=>x.value==="granted").disabled,"granted always selectable");
// 근거 없이 승인 시도 → 거부
E("approveYt()");
ok(E("DB.videos.links.find(l=>l.id==='YT-003').state")==="pending","no basis -> still pending");
// granted 선택 + 원장 연결 → 승인
radios.find(x=>x.value==="granted").checked=true;
E("approveYt()");
ok(E("DB.videos.links.find(l=>l.id==='YT-003').state")==="approved","granted approve ok");
ok(E("DB.videos.links.find(l=>l.id==='YT-003').licBasis.licId")!=null,"ledger id recorded");
ok(E("DB.audit.some(a=>a.move.indexOf('재생성 승인')>=0&&a.note.indexOf('권리자 허락')>=0)"),"approval audited with basis");

// CC 영상 승인 (ccby)
E("openYtApprove('YT-001')");
dd=w.document.getElementById("dlgroot");
[...dd.querySelectorAll('input[name="ytb"]')].find(x=>x.value==="ccby").checked=true;
E("approveYt()");
ok(E("DB.videos.links.find(l=>l.id==='YT-001').state")==="approved","ccby approve ok");

// ── 생성 스튜디오: 산출물 선택 → 질문 카드 → 생성 → 완료
E("vTab='studio';vJobSel='YT-001';vParams=null;vOutType=null;vDocTarget=null;render()");
ok(w.document.getElementById("view").innerHTML.indexOf("무엇을 만들까요")>=0,"output-type card first");
E("vOutType='video';vParams={aud:'실무자',len:'3분 요약',tone:'강의형',lang:'한국어',cap:'자막 포함'};render()");
ok(w.document.querySelectorAll(".qopt.sel").length>=6,"outtype + 5 params selected");
E("vJobSel='YT-001'");E("startVJob()");
ok(E("DB.videos.jobs.length")===2&&E("DB.videos.jobs[0].kind")==="video","video job queued");
await sleep(7200); // 4 steps × 1600ms
ok(E("DB.videos.jobs[0].state")==="ready","job completed");
ok(E("DB.videos.links.find(l=>l.id==='YT-001').state")==="generated","link marked generated");

// ── 게시: 영상 전용 트랙 분기 — 문서 대기열에 섞이지 않는다
const before=E("DB.docs.length");
E("sendVJob(DB.videos.jobs[0].id)");
ok(E("DB.docs.length")===before,"NO doc record created (separate track)");
ok(E("DB.videos.jobs[0].state")==="staged"&&E("DB.videos.jobs[0].stagedUntil")>0,"video staged on own track");
ok(E("DB.videos.jobs[0].lv")===2,"ccby -> L2 inherited");
ok(E("DB.videos.jobs[0].spName").indexOf("[AI365-VJ-")>=0,"video filename pointer");
ok(E("vTab")==="publish","moved to publish tab");
ok(w.document.getElementById("view").innerHTML.indexOf("업로드 대기")>=0,"publish shows staging");
ok(w.document.getElementById("view").innerHTML.indexOf("교육자료 > 생성 동영상")>=0&&w.document.getElementById("view").innerHTML.indexOf("교육자료 > 생성 교육문서")>=0,"both folder settings shown");
ok(w.document.getElementById("view").innerHTML.indexOf("교육자료 > 추출 텍스트")>=0&&w.document.getElementById("view").innerHTML.indexOf("중간 소재")>=0,"extracted-text folder with intermediate-asset chip");
ok(E("DB.audit.some(a=>a.move.indexOf('추출 텍스트 저장')>=0&&a.note.indexOf('추출 텍스트')>=0||a.move.indexOf('추출 텍스트 저장')>=0)"),"text-extraction save audited");
// 취소 → ready 복귀
E("cancelVJobStage(DB.videos.jobs[0].id)");
ok(E("DB.videos.jobs[0].state")==="ready","cancel returns to ready");
// 다시 보내고 강제 만료 → 비가역 업로드 확정
E("sendVJob(DB.videos.jobs[0].id)");
E("DB.videos.jobs[0].stagedUntil=Date.now()-1");
await sleep(1300);
ok(E("DB.videos.jobs[0].state")==="uploaded","expiry -> irreversible upload");
ok(E("DB.videos.jobs[0].dist.rag")===true&&E("DB.videos.jobs[0].dist.viva")===true,"rag+viva simultaneous");
ok(E("DB.uploads.some(u=>u.name.indexOf('[AI365-VJ-')>=0)"),"video in upload ledger");
ok(E("DB.audit.some(a=>a.move.indexOf('영상 SharePoint 업로드(비가역)')>=0)"),"irreversible upload audited");
// 기성 완료 잡(VJ-001)도 전용 트랙으로
E("sendVJob('VJ-001')");
ok(E("DB.videos.jobs.find(j=>j.id==='VJ-001').state")==="staged","seed job staged on video track");

// ── 문서 대기열에는 영상이 없어야 한다 (분리 확인)
E("setWorkspace('agent')");E("setView('staging')");
ok(w.document.getElementById("view").innerHTML.indexOf("사내 교육판")<0,"agent staging has NO video");
ok(E("DB.docs.length")===before,"DB.docs unchanged after all video ops");

// ── 교육 대시보드 (Graph 실필드 대응 구성)
E("setWorkspace('edu')");
const eh=w.document.getElementById("app").innerHTML;
ok(eh.indexOf("부서별 이수율")>=0&&eh.indexOf("교육 따라가기")>=0,"edu cards rendered");
ok(eh.indexOf("생성 동영상")>=0,"generated-video source in course table");
ok(w.document.querySelectorAll(".hbar").length>=10,"bars rendered");
ok(eh.indexOf("68%")>=0,"kpi doneRate shown");
ok(eh.indexOf("마감 관리 대상")>=0&&eh.indexOf("기한 초과 9")>=0,"deadline KPI with breakdown");
ok(eh.indexOf("마감 임박·기한 초과")>=0&&eh.indexOf("초과 6일")>=0&&eh.indexOf("D-2")>=0,"deadline list overdue+due-soon");
ok(eh.indexOf("출처별 교육 성과")>=0&&eh.indexOf("78%")>=0,"source-compare widget");
ok(eh.indexOf("평균 학습 시간")<0,"fake watch-time KPI removed");
ok(eh.indexOf("필수")>=0&&eh.indexOf("권장")>=0,"assignmentType chips in tables");
ok(eh.indexOf("필수 과정 이수율")>=0&&eh.indexOf("자기주도 학습 비중")>=0,"strip stats rendered");
ok(eh.indexOf("이수 완료 총 분량")>=0&&eh.indexOf("콘텐츠 분량 기준")>=0,"duration-sum stat with honest caption");
ok(eh.indexOf("주간 수강 추이")>=0&&w.document.querySelectorAll("#app svg path").length>=16,"weekly trend SVG: 16 column paths");
ok(w.document.querySelectorAll("#app svg .wkhit").length===8,"weekly trend: 8 hover bands with tips");
ok(w.document.querySelectorAll("[data-tip]").length>=20,"tooltip attrs across charts");
ok(eh.indexOf("var(--viz-1)")>=0&&eh.indexOf("#B42318")<0,"charts use validated viz tokens, no status-red bars");
ok(w.document.getElementById("viztip")!==null,"tooltip layer exists");
ok(eh.indexOf("스킬 태그별 학습 분포")>=0&&eh.indexOf("히트펌프·공조")>=0,"skill tag distribution");
ok(eh.indexOf("배정자별 현황")>=0&&eh.indexOf("HR 교육운영")>=0,"assigner table");

// ── 금지어·표기 규칙 (렌더된 화면 3종 전부)
let all="";
E("setWorkspace('agent')");all+=w.document.getElementById("app").innerHTML;
E("setWorkspace('video')");E("vTab='inbox';render()");all+=w.document.getElementById("app").innerHTML;
E("vTab='studio';render()");all+=w.document.getElementById("app").innerHTML;
E("vTab='publish';render()");all+=w.document.getElementById("app").innerHTML;
E("setWorkspace('edu')");all+=w.document.getElementById("app").innerHTML;
ok(all.indexOf("[BACKEND]")<0&&all.indexOf("호출#")<0&&all.indexOf("호출 #")<0,"no dev jargon in any workspace UI");

// ── 영상 저작권 입력 지점: 승인 창에서 라이선스 표기 수정 → 선택지 개방
E("setWorkspace('video')");E("vTab='inbox';render()");
w.document.getElementById("yt-url").value="https://youtube.com/watch?v=cc-manual";
w.document.getElementById("yt-title").value="수동 CC 영상";
E("addYtLink()");
const mid=E("DB.videos.links[0].id");
E(`openYtApprove('${mid}')`);
let add=w.document.getElementById("dlgroot");
ok([...add.querySelectorAll('input[name="ytb"]')].find(x=>x.value==="ccby").disabled,"manual std: ccby locked before fix");
// 사람이 확인한 결과로 수정 → CC-BY 선택지 열림 + 감사 기록
w.document.getElementById("yt-lic-fix").value="cc";
E("fixYtLic()");
add=w.document.getElementById("dlgroot");
ok(![...add.querySelectorAll('input[name="ytb"]')].find(x=>x.value==="ccby").disabled,"after fix: ccby enabled");
ok(E("DB.audit.some(a=>a.move.indexOf('영상 라이선스 표기 확인·수정')>=0)"),"lic fix audited");
[...add.querySelectorAll('input[name="ytb"]')].find(x=>x.value==="ccby").checked=true;
E("approveYt()");
ok(E(`DB.videos.links.find(l=>l.id==='${mid}').state`)==="approved","manual link approvable after fix");
// ── 승인 도중 '영상 원장' 등록 왕복: 저장하면 승인 창으로 복귀 + 새 계약이 첫 항목
const docLicN=E("DB.licenses.length");
E("openYtApprove('YT-004')");
E("_ytReturn=dialog.id;openVLicForm('Energy Policy Watch')");
ok(E("dialog.type")==="vlic","video lic form opened from approve");
w.document.getElementById("vl-name").value="EPW 재생성 허락 계약";
E("saveVLic()");
ok(E("dialog&&dialog.type")==="ytapprove","returned to approve dialog");
const backDlg=w.document.getElementById("dlgroot");
ok(backDlg.querySelector('input[name="ytb"][value="granted"]').checked,"granted preselected on return");
const firstOpt=backDlg.querySelector('#yt-licref option').value;
ok(firstOpt===E("DB.videos.licenses[DB.videos.licenses.length-1].id"),"newest VIDEO license first in select");
E("approveYt()");
ok(E("DB.videos.links.find(l=>l.id==='YT-004').licBasis.licId")===firstOpt,"granted approval linked to video license");
ok(E("DB.licenses.length")===docLicN,"doc ledger untouched by video registration (separation)");

// ── 재구성 허락 원장 탭: 단독 등록 창구
E("vTab='rights';render()");
let rv=w.document.getElementById("view").innerHTML;
ok(rv.indexOf("VL-001")>=0&&rv.indexOf("재구성(매체 불문")>=0,"studio ledger renders VL cards with media-agnostic scope");
ok(rv.indexOf("허락 계약 등록")>=0,"standalone register button exists");
ok(rv.indexOf("EPW 재생성 허락 계약")>=0,"roundtrip-registered contract visible in ledger");
E("openVLicForm()");
w.document.getElementById("vl-name").value="단독 등록 테스트 계약";
w.document.getElementById("vl-scope").value="Test Channel";
E("saveVLic()");
ok(E("DB.videos.licenses.some(l=>l.name==='단독 등록 테스트 계약')"),"standalone registration works");
ok(E("dialog")===null||E("dialog")===undefined||!E("dialog"),"no dialog reopen when not in approve flow");

// ── 설정 완전 분리: 문서 설정에는 동영상 항목이 없다
E("setWorkspace('agent')");E("openSettings()");E("switchMTab('sources')");
const sm=w.document.getElementById("modalroot").innerHTML;
ok(sm.indexOf("문서 수집 소스")>=0,"doc settings: doc sources present");
ok(sm.indexOf("동영상 수집 소스 — 링크만 수집")<0&&sm.indexOf("vs-query")<0,"doc settings: NO video source list");
E("switchMTab('conn')");
ok(w.document.getElementById("modalroot").innerHTML.indexOf("동영상 전용 SharePoint")<0,"doc conn: NO video SP block");
E("closeSettings()");
// 동영상 전용 설정 모달
E("setWorkspace('video')");E("openVSettings()");
let vm=w.document.getElementById("modalroot").innerHTML;
ok(vm.indexOf("콘텐츠 스튜디오 설정")>=0&&vm.indexOf("동영상 수집 소스")>=0,"studio settings modal with own tabs");
w.document.getElementById("vs-query").value="@boiler-masterclass";
w.document.getElementById("vs-kind").value="YouTube 채널";
E("addVSrc()");
ok(E("DB.videos.sources.some(s=>s.query==='@boiler-masterclass')"),"video source added via own modal");
E("toggleVSrc(0)");
ok(E("DB.videos.sources[0].on")===false&&E("DB.audit.some(a=>a.move.indexOf('동영상 소스 중지')>=0)"),"toggle+audit in own modal");
E("toggleVSrc(0)");
E("switchVTab('vstore')");
ok(w.document.getElementById("modalroot").innerHTML.indexOf("산출물 적재 위치")>=0,"store tab renders with doc folder");
E("closeVSettings()");
ok(w.document.getElementById("modalroot").innerHTML==="","studio modal closes clean");
// 링크 수집함 툴바에 가동 소스 수 표시
E("vTab='inbox';render()");
ok(w.document.getElementById("view").innerHTML.indexOf("가동 중인 동영상 소스")>=0,"inbox shows active video source count");
// 워크스페이스 탭 5개 (사내 문서함 포함)
ok(w.document.querySelectorAll(".tabs .tab").length===5,"studio has 5 tabs incl. docsbox");

// ── 사내 문서함: 시드·등록·다운로드 가드·해제
E("vTab='docsbox';render()");
let db=w.document.getElementById("view").innerHTML;
ok(db.indexOf("자사 저작물 전용")>=0&&db.indexOf("신입 기술교육 기본 교재")>=0,"docsbox seeds render with self-work warning");
ok(db.indexOf("v3")>=0&&db.indexOf("다운로드")>=0,"version + download visible");
E("mdDownload('MD-001')"); // jsdom엔 createObjectURL 없음 → 토스트 가드만 확인
ok(true,"download guard didn't throw");
const dn=E("DB.videos.docs.length");
E("mdRemove('MD-004')");
ok(E("DB.videos.docs.length")===dn-1&&E("DB.audit.some(a=>a.move.indexOf('사내 문서 등록 해제')>=0)"),"remove + audit");

// ── 신규 교육 문서 생성 플로우 (YT-002 자사 채널 승인분 사용)
E("vTab='studio';vJobSel='YT-002';vOutType='newdoc';vDocTarget=null;vParams={fmt:'요약 교재',aud:'신입·교육생',len:'2~3쪽 요약',lang:'한국어'};render()");
E("startVJob()");
ok(E("DB.videos.jobs[0].kind")==="newdoc","newdoc job queued");
await sleep(7200);
ok(E("DB.videos.jobs[0].state")==="ready"&&E("DB.videos.jobs[0].out.format")==="docx","newdoc ready as docx");
E("sendVJob(DB.videos.jobs[0].id)");
ok(E("DB.videos.jobs[0].spName").indexOf(".docx")>=0,"doc filename pointer with docx ext");
ok(E("DB.videos.jobs[0].lv")===1,"own-channel basis -> L1");
// 문서 산출물은 문서 폴더로
E("DB.videos.jobs[0].stagedUntil=Date.now()-1");
await sleep(1300);
ok(E("DB.videos.jobs[0].state")==="uploaded","newdoc uploaded");
ok(E("DB.uploads.some(u=>u.folder==='교육자료 > 생성 교육문서')"),"doc lands in doc folder");

// ── 기존 문서 업데이트 플로우: 업로드 확정 순간 버전이 오른다
const verBefore=E("DB.videos.docs.find(d=>d.id==='MD-002').ver");
E("vTab='studio';vJobSel='YT-002';vOutType='updatedoc';vDocTarget='MD-002';vParams={mode:'변경분만 반영',lang:'한국어'};render()");
ok(w.document.getElementById("view").innerHTML.indexOf("어떤 문서를 갱신할까요")>=0,"update target card shown");
E("startVJob()");
ok(E("DB.videos.jobs[0].kind")==="updatedoc"&&E("DB.videos.jobs[0].target")==="MD-002","update job with target");
ok(E("DB.videos.jobs[0].title").indexOf("v"+(verBefore+1)+" 개정판")>=0,"title carries next version");
await sleep(7200);
E("sendVJob(DB.videos.jobs[0].id)");
ok(E("DB.videos.docs.find(d=>d.id==='MD-002').ver")===verBefore,"version NOT bumped before irreversible upload");
E("DB.videos.jobs[0].stagedUntil=Date.now()-1");
await sleep(1300);
ok(E("DB.videos.docs.find(d=>d.id==='MD-002').ver")===verBefore+1,"version bumped at irreversible upload");
ok(E("DB.audit.some(a=>a.move.indexOf('사내 문서 버전 갱신')>=0)"),"version bump audited");

console.log("console errors:",errs.length,errs.slice(0,3));
ok(errs.length===0,"no runtime errors");
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})().catch(e=>{console.error("ERROR:",e.stack);process.exit(1)});
