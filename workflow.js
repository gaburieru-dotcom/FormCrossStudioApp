'use strict';
const MAX_PAGES = 20;
let pages = [], activePage = 0, workspaceReady = false, persistChain = Promise.resolve(), persistenceError = null;
let brand = {name:'マイブランド',primary:'#688bff',secondary:'#172033',text:'#ffffff',font:"'Noto Sans JP', sans-serif",logo:''};
const baseRestore = restore;
const baseValidate = validateProject;
const pageId = () => crypto.randomUUID();
function captureWorkspace() {
    if (pages[activePage]) pages[activePage].state = snapshot();
    return {version:3,activePage,brand:{...brand},pages:pages.map(page=>({...page}))};
}
function normalizeWorkspace(data) {
    if(data?.version>3)throw Error('このプロジェクト形式は新しいバージョンのアプリが必要です。');
    if (data?.version !== 3) return {version:3,activePage:0,brand:{...brand},pages:[{id:pageId(),name:'ページ 1',state:baseValidate(data)}]};
    if (!Array.isArray(data.pages) || data.pages.length < 1 || data.pages.length > MAX_PAGES) throw Error('ページ数は1〜20ページです。');
    const result = data.pages.map((page,i)=>({id:pageId(),name:String(page.name||`ページ ${i+1}`).slice(0,60),state:baseValidate(page.state)}));
    const nextBrand={...brand};
    if(data.brand){for(const key of ['primary','secondary','text'])if(/^#[0-9a-f]{6}$/i.test(data.brand[key]))nextBrand[key]=data.brand[key];
        nextBrand.name=String(data.brand.name||'マイブランド').slice(0,60);
        const fonts=[...$('brand-font').options].map(o=>o.value);if(fonts.includes(data.brand.font))nextBrand.font=data.brand.font;
        nextBrand.logo=/^data:image\/(png|jpeg|webp);base64,/.test(data.brand.logo||'')?data.brand.logo:'';
    }
    return {version:3,activePage:Math.max(0,Math.min(result.length-1,Math.floor(Number(data.activePage)||0))),brand:nextBrand,pages:result};
}
function restoreWorkspace(data, validate=true) {
    const doc=validate?normalizeWorkspace(data):data;
    pages=doc.pages.map(page=>({...page}));activePage=doc.activePage;brand={...doc.brand};
    baseRestore(pages[activePage].state);syncBrandUI();renderPages();renderLayers();
}
async function workspaceStore(action,value) {
    const db=await assetDB;
    return new Promise((resolve,reject)=>{const tx=db.transaction('workspace',action==='get'?'readonly':'readwrite');const request=tx.objectStore('workspace')[action](value);tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
function persistWorkspace(doc) {
    const stable=JSON.parse(JSON.stringify(doc));
    persistChain=persistChain.catch(()=>{}).then(()=>workspaceStore('put',{id:'autosave',document:stable})).then(()=>{persistenceError=null;toast('全ページをこの端末に自動保存しました');},error=>{persistenceError=error;toast('自動保存に失敗しました。「保存」でファイルを保存してください');});
    return persistChain;
}
async function flushWorkspace() { commit();await persistChain;if(persistenceError)throw persistenceError; }
function syncHistoryButtons() { $('undo-button').disabled=historyIndex<1;$('redo-button').disabled=historyIndex>=history.length-1; }
commit = function() {
    if(!workspaceReady||restoring||busy)return;
    const doc=captureWorkspace();const state=JSON.stringify(doc);
    if(history[historyIndex]===state)return;
    history=history.slice(0,historyIndex+1);history.push(state);
    while(history.length>35 || (history.length>2 && history.reduce((n,s)=>n+s.length,0)>80000000))history.shift();
    historyIndex=history.length-1;syncHistoryButtons();renderPages();renderLayers();persistWorkspace(doc);
};
undo = function(delta=-1) {
    if(busy)return;commit();const next=historyIndex+delta;if(next<0||next>=history.length)return;
    historyIndex=next;restoreWorkspace(JSON.parse(history[next]),false);history[next]=JSON.stringify(captureWorkspace());
    syncHistoryButtons();persistWorkspace(captureWorkspace());toast(delta<0?'元に戻しました':'やり直しました');
};
function renderPages() {
    const strip=$('page-strip');if(!strip)return;strip.replaceChildren();
    pages.forEach((page,i)=>{const button=document.createElement('button');button.className='page-card'+(i===activePage?' active':'');button.setAttribute('aria-current',String(i===activePage));
        const swatch=document.createElement('span');swatch.className='page-swatch';swatch.style.background=page.state.bgStyle;button.append(swatch,document.createTextNode(`${i+1}. ${page.name}`));button.onclick=()=>switchPage(i);strip.append(button);});
    if(document.activeElement!==$('page-name'))$('page-name').value=pages[activePage]?.name||'';
    for(const axis of ['x','y']){const slider=$('background-'+axis);if(slider){const value=canvas.style[axis==='x'?'backgroundPositionX':'backgroundPositionY'];slider.value=value?.endsWith('%')?parseFloat(value):50;}}
    $('page-count').textContent=`${activePage+1} / ${pages.length}`;
    $('remove-page').disabled=pages.length===1;$('add-page').disabled=pages.length>=MAX_PAGES;$('copy-page').disabled=pages.length>=MAX_PAGES;
    $('move-page-left').disabled=activePage===0;$('move-page-right').disabled=activePage===pages.length-1;
}
function switchPage(index) {
    if(busy||index===activePage||!pages[index])return;commit();activePage=index;baseRestore(pages[index].state);commit();resetZoom();
}
function addPage(duplicate=false) {
    if(busy||pages.length>=MAX_PAGES)return;commit();const state=snapshot();if(!duplicate)state.elementsHtml='';
    const page={id:pageId(),name:duplicate?pages[activePage].name+' コピー':`ページ ${pages.length+1}`,state};
    pages.splice(activePage+1,0,page);activePage++;baseRestore(state);commit();resetZoom();
}
function removePage() { if(busy||pages.length<2)return;commit();pages.splice(activePage,1);activePage=Math.min(activePage,pages.length-1);baseRestore(pages[activePage].state);commit();toast('ページを削除しました。元に戻すで復元できます'); }
function movePage(delta) { const next=activePage+delta;if(busy||next<0||next>=pages.length)return;commit();[pages[next],pages[activePage]]=[pages[activePage],pages[next]];activePage=next;commit(); }
async function saveOutput(blob,name,kind) {
    if(kind==='project' && blob.size>200000000)throw Error('プロジェクトが200MBを超えています。画像やページを減らして保存してください。');
    if(window.desktopAPI)return window.desktopAPI.saveFile({name,kind,data:await blob.arrayBuffer()});
    download(blob,name);return {success:true};
}
saveProject = async function() {
    if(busy)return;commit();try{const result=await saveOutput(new Blob([JSON.stringify(captureWorkspace())],{type:'application/json'}),'AppVisual-project.fcs','project');toast(result.success?'全ページと使用画像を保存しました':'保存をキャンセルしました');}catch(error){toast('保存に失敗しました：'+error.message);}
};
loadProject = async function(event) {
    const file=event.target.files[0];event.target.value='';if(!file||busy)return;
    try{if(file.size>200000000)throw Error('200MB以下のプロジェクトを選択してください。');const doc=normalizeWorkspace(JSON.parse(await file.text()));commit();restoreWorkspace(doc,false);commit();resetZoom();toast('全ページを読み込みました。元に戻すで前の作品に戻せます');}catch(error){toast('読み込み失敗：'+error.message);}
};
// Page navigation and editing commands stay visible while the libraries scroll.
const pageBar=document.createElement('section');pageBar.className='page-bar';pageBar.innerHTML=`<div class="page-controls"><strong>ページ</strong><span id="page-count"></span><input id="page-name" maxlength="60" aria-label="ページ名"><button id="add-page" class="studio-button" onclick="addPage()">＋ 新規</button><button id="copy-page" class="studio-button" onclick="addPage(true)">複製</button><button id="move-page-left" class="studio-button" onclick="movePage(-1)" title="ページを前へ">←</button><button id="move-page-right" class="studio-button" onclick="movePage(1)" title="ページを後ろへ">→</button><button id="remove-page" class="studio-button" onclick="removePage()">削除</button></div><div id="page-strip"></div>`;
document.querySelector('.studio-footer').before(pageBar);
$('page-name').onchange=e=>{if(pages[activePage]){pages[activePage].name=e.target.value.trim()||'名称未設定';commit();}};
// Exports render a detached clone, so the editor never jumps or changes page.
let exportCancelled=false;
async function renderPageFiles(state,prefix,scale=1) {
    const host=document.createElement('div');host.className='export-host';
    const {width,height,panorama:pano}=canvasDimensions(state.size);
    const clone=document.createElement('div');clone.style.cssText=`position:relative;width:${width}px;height:${height}px;overflow:hidden;`;clone.style.background=state.bgStyle;
    const content=document.createElement('div');content.innerHTML=baseValidate(state).elementsHtml;content.querySelectorAll('.selected').forEach(el=>el.classList.remove('selected'));clone.append(content);
    if(state.bgOverlay){const shade=document.createElement('div');shade.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,.4);z-index:1;';clone.prepend(shade);}
    host.append(clone);document.body.append(host);
    try{
        await document.fonts.ready;
        await Promise.all([...clone.querySelectorAll('img')].filter(img=>img.getAttribute('src')).map(img=>img.decode()));
        await rasterizeDeviceScreens(clone);
        const background=state.bgStyle?.match(/url\(["']?([^"')]+)["']?\)/);if(background)await imageInfo(background[1]);
        if(exportCancelled)throw Error('キャンセルしました');
        const result=await html2canvas(clone,{scale,useCORS:true,backgroundColor:null,logging:false});
        const files=[];for(let i=0;i<(pano?2:1);i++){const part=document.createElement('canvas');part.width=result.width/(pano?2:1);part.height=result.height;part.getContext('2d').drawImage(result,i*part.width,0,part.width,part.height,0,0,part.width,part.height);const blob=await new Promise(resolve=>part.toBlob(resolve,'image/png'));if(!blob)throw Error('PNGの生成に失敗しました');files.push({name:`${prefix}${pano?'_'+(i+1):''}.png`,blob});}return files;
    }finally{host.remove();}
}
async function exportPages(all=false) {
    if(busy)return;commit();const selected=all?captureWorkspace().pages:[{...pages[activePage],state:snapshot()}];busy=true;exportCancelled=false;
    $('export-dialog').showModal();$('export-progress').textContent='準備中…';
    try{
        const scale=Number($('export-scale').value);const files=[];
        for(let i=0;i<selected.length;i++){if(exportCancelled)throw Error('キャンセルしました');$('export-progress').textContent=`${i+1} / ${selected.length} ページを描画中`;const safeName=selected[i].name.replace(/[\\/:*?"<>|]/g,'_').slice(0,60);files.push(...await renderPageFiles(selected[i].state,`${String(i+1).padStart(2,'0')}_${safeName}`,scale));}
        if(exportCancelled)throw Error('キャンセルしました');
        let blob,name,kind;if(files.length===1){blob=files[0].blob;name=files[0].name;kind='image';}else{const zip=new JSZip();for(const file of files)zip.file(file.name,await file.blob.arrayBuffer());$('export-progress').textContent='ZIPを作成中…';blob=await zip.generateAsync({type:'blob',compression:'STORE'});name='AppVisual-pages.zip';kind='zip';}
        if(exportCancelled)throw Error('キャンセルしました');const result=await saveOutput(blob,name,kind);toast(result.success?`${files.length}枚を書き出しました`:'保存をキャンセルしました');
    }catch(error){toast('書き出し：'+error.message);}finally{busy=false;$('export-dialog').close();}
}
exportImage = () => exportPages(false);
const toolbar=document.createElement('div');toolbar.className='workflow-toolbar';toolbar.innerHTML=`<label><input type="checkbox" id="snap-enabled" checked>整列ガイド・吸着 <small>Altで一時解除</small></label><label>書き出し倍率 <select id="export-scale" aria-label="書き出し倍率"><option value="1">原寸 1×</option><option value="0.5">確認用 0.5×</option></select></label><button class="studio-button" onclick="exportPages(true)">全ページを一括書き出し</button><button class="studio-button" onclick="document.getElementById('brand-dialog').showModal()">ブランド設定</button><button class="studio-button" onclick="document.getElementById('help-dialog').showModal()">使い方</button>`;
document.querySelector('.navbar').after(toolbar);
document.body.insertAdjacentHTML('beforeend',`<dialog id="export-dialog"><h2>画像を書き出しています</h2><p id="export-progress" role="status"></p><button class="studio-button" onclick="exportCancelled=true">キャンセル</button></dialog><dialog id="help-dialog"><h2>制作の流れ</h2><ol><li>テンプレートを選び、テキストやスクリーンショットを編集</li><li>「素材」から画像をインポートし、配置や背景に使用</li><li>ページを追加・複製して紹介画像を揃える</li><li>ブランド設定で配色と文字を統一</li><li>「全ページを一括書き出し」でPNGをZIPに保存</li></ol><p>⌘/Ctrl+Z：元に戻す　⌘/Ctrl+D：複製<br>矢印：1px移動　Shift＋矢印：10px移動<br>Space＋ドラッグ：画面を移動　Alt：吸着を解除</p><p>ライブラリの削除は配置済み画像に影響しません。ページやレイヤーの削除は「元に戻す」で復元できます。</p><button class="studio-button" onclick="this.closest('dialog').close()">閉じる</button></dialog>`);
$('export-dialog').addEventListener('cancel',e=>{e.preventDefault();exportCancelled=true;});
// Visual bounds are used for alignment, including scaled and rotated objects.
function elementBounds(el) {const r=el.getBoundingClientRect(),c=canvas.getBoundingClientRect();return {x:(r.left-c.left)/currentScale,y:(r.top-c.top)/currentScale,w:r.width/currentScale,h:r.height/currentScale};}
const guideX=document.createElement('div'),guideY=document.createElement('div');guideX.className='snap-guide vertical';guideY.className='snap-guide horizontal';canvas.append(guideX,guideY);
function hideSnapGuides(){guideX.style.display=guideY.style.display='none';}
function snapElement(el,bypass=false) {
    hideSnapGuides();if(bypass||!$('snap-enabled').checked)return;
    const b=elementBounds(el),xs=[0,canvas.offsetWidth/2,canvas.offsetWidth],ys=[0,canvas.offsetHeight/2,canvas.offsetHeight];
    for(const other of elementsContainer.children){if(other===el||other.dataset.hidden==='true')continue;const r=elementBounds(other);xs.push(r.x,r.x+r.w/2,r.x+r.w);ys.push(r.y,r.y+r.h/2,r.y+r.h);}
    const nearest=(points,targets)=>{let best=null;for(const p of points)for(const t of targets){const delta=t-p;if(Math.abs(delta)<=6/currentScale&&(!best||Math.abs(delta)<Math.abs(best.delta)))best={delta,target:t};}return best;};
    const x=nearest([b.x,b.x+b.w/2,b.x+b.w],xs),y=nearest([b.y,b.y+b.h/2,b.y+b.h],ys);
    if(x){el.style.left=(parseFloat(el.style.left)+x.delta)+'px';guideX.style.left=x.target+'px';guideX.style.display='block';}
    if(y){el.style.top=(parseFloat(el.style.top)+y.delta)+'px';guideY.style.top=y.target+'px';guideY.style.display='block';}
}
function alignElement(direction) {
    if(!selectedElement||selectedElement.dataset.locked==='true')return;const b=elementBounds(selectedElement);const horizontal=['left','center','right'].includes(direction);
    const target=horizontal?(direction==='left'?0:direction==='center'?(canvas.offsetWidth-b.w)/2:canvas.offsetWidth-b.w):(direction==='top'?0:direction==='middle'?(canvas.offsetHeight-b.h)/2:canvas.offsetHeight-b.h);
    const prop=horizontal?'left':'top';selectedElement.style[prop]=(parseFloat(selectedElement.style[prop])+target-(horizontal?b.x:b.y))+'px';commit();
}
alignSelected=()=>alignElement('center');
$('prop-global').insertAdjacentHTML('beforeend',`<div class="alignment-grid">${[['left','左'],['center','左右中央'],['right','右'],['top','上'],['middle','上下中央'],['bottom','下']].map(([key,name])=>`<button class="studio-button" onclick="alignElement('${key}')">${name}</button>`).join('')}</div><label class="asset-help">レイヤー名<input id="layer-name" maxlength="60" class="inspector-input"></label>`);
$('layer-name').onchange=e=>{if(selectedElement){selectedElement.dataset.name=e.target.value.slice(0,60);commit();}};
const selectBeforeWorkflow=selectElement;
selectElement=function(el,type){selectBeforeWorkflow(el,type);$('layer-name').value=el.dataset.name||'';syncCropUI(el);const locked=el.dataset.locked==='true';document.querySelectorAll('.prop-section input,.prop-section select,.prop-section textarea,.prop-section button').forEach(input=>{input.disabled=locked;});};
const clearBeforeWorkflow=clearSelection;
clearSelection=function(){clearBeforeWorkflow();document.querySelectorAll('.prop-section input,.prop-section select,.prop-section textarea,.prop-section button').forEach(input=>input.disabled=false);};
const deleteBeforeWorkflow=deleteSelected;
deleteSelected=function(){if(selectedElement?.dataset.locked==='true')return;deleteBeforeWorkflow();};
const duplicateBeforeWorkflow=duplicateSelected;
duplicateSelected=function(){if(selectedElement?.dataset.locked==='true')return;duplicateBeforeWorkflow();};
changeLayer=function(action){
    if(!selectedElement||selectedElement.dataset.locked==='true')return;
    const order=[...elementsContainer.children].sort((a,b)=>(Number(a.style.zIndex)||20)-(Number(b.style.zIndex)||20));
    const index=order.indexOf(selectedElement);const target=action==='front'?order.length-1:action==='back'?0:Math.max(0,Math.min(order.length-1,index+Number(action)));
    order.splice(index,1);order.splice(target,0,selectedElement);order.forEach((el,i)=>el.style.zIndex=String(20+i));commit();
};
renderLayers=function(){const list=$('layer-list');if(!list)return;list.replaceChildren();[...elementsContainer.children].reverse().sort((a,b)=>(Number(b.style.zIndex)||20)-(Number(a.style.zIndex)||20)).forEach(el=>{const row=document.createElement('div');row.className='layer-row';const name=document.createElement('button');name.textContent=el.dataset.name||(el.dataset.type==='device'?'デバイス':el.textContent.trim().slice(0,20)||'画像素材');name.onclick=()=>selectElement(el,el.dataset.type);row.append(name);for(const [field,label,active] of [['locked','固定','解除'],['hidden','隠す','表示']]){const btn=document.createElement('button');btn.textContent=el.dataset[field]==='true'?active:label;btn.title=field==='locked'?'編集ロックの切り替え':'表示の切り替え';btn.onclick=()=>{el.dataset[field]=el.dataset[field]==='true'?'false':'true';if(field==='hidden')el.style.display=el.dataset.hidden==='true'?'none':'';if(selectedElement===el)clearSelection();commit();};row.append(btn);}list.append(row);});};
window.addEventListener('keydown',e=>{if((busy && !e.target.closest('dialog')) || (selectedElement?.dataset.locked==='true' && !e.target.closest('input,textarea,select') && (e.key.startsWith('Arrow')||['Delete','Backspace'].includes(e.key)))){e.preventDefault();e.stopImmediatePropagation();}},true);
// Crops are rendered into pixels for consistent PNG export. Originals stay embedded.
$('prop-image').insertAdjacentHTML('beforeend',`<hr><div class="panel-title">トリミング</div><label>切り抜く比率<select id="crop-ratio" class="inspector-input"><option value="original">元画像</option><option value="1">正方形 1:1</option><option value="1.3333333333">横長 4:3</option><option value="1.7777777778">横長 16:9</option><option value="0.75">縦長 3:4</option><option value="0.5625">縦長 9:16</option></select></label><label>横の位置<input id="crop-x" type="range" min="0" max="100" value="50"></label><label>縦の位置<input id="crop-y" type="range" min="0" max="100" value="50"></label><label>拡大率<input id="crop-zoom" type="range" min="100" max="300" value="100"></label><div class="studio-actions"><button class="studio-button" id="apply-crop">適用</button><button class="studio-button" id="reset-crop">元画像に戻す</button></div><p class="asset-help">元画像も保存されるので、何度でもやり直せます。</p>`);
function syncCropUI(el) {if(el.dataset.type!=='image')return;$('crop-ratio').value=el.dataset.cropRatio||'original';$('crop-x').value=el.dataset.cropX||'50';$('crop-y').value=el.dataset.cropY||'50';$('crop-zoom').value=el.dataset.cropZoom||'100';}
async function cropImage(el,ratio,x=50,y=50,zoom=100) {
    if(!el||el.dataset.type!=='image'||el.dataset.locked==='true')return;
    const source=el.dataset.source||el.querySelector('img').src;const original=await imageInfo(source);
    if(!el.isConnected)return;
    const r=ratio==='original'?original.naturalWidth/original.naturalHeight:Number(ratio);
    if(!Number.isFinite(r)||r<=0)throw Error('比率が不正です');
    let width=original.naturalWidth,height=width/r;if(height>original.naturalHeight){height=original.naturalHeight;width=height*r;}
    const factor=Math.max(1,Math.min(3,Number(zoom)/100));width/=factor;height/=factor;
    const sx=(original.naturalWidth-width)*Math.max(0,Math.min(100,Number(x)))/100,sy=(original.naturalHeight-height)*Math.max(0,Math.min(100,Number(y)))/100;
    const cropped=document.createElement('canvas');const scale=Math.min(1,4096/Math.max(width,height));cropped.width=Math.max(1,Math.round(width*scale));cropped.height=Math.max(1,Math.round(height*scale));
    cropped.getContext('2d').drawImage(original,sx,sy,width,height,0,0,cropped.width,cropped.height);
    el.dataset.source=source;el.dataset.cropRatio=String(ratio);el.dataset.cropX=String(x);el.dataset.cropY=String(y);el.dataset.cropZoom=String(zoom);el.querySelector('img').src=cropped.toDataURL('image/png');commit();
}
$('apply-crop').onclick=async()=>{const button=$('apply-crop');button.disabled=true;try{await cropImage(selectedElement,$('crop-ratio').value,$('crop-x').value,$('crop-y').value,$('crop-zoom').value);toast('トリミングを適用しました');}catch(error){toast(error.message);}finally{button.disabled=false;}};
function resetCrop(el){if(!el?.dataset.source||el.dataset.locked==='true')return;el.querySelector('img').src=el.dataset.source;for(const key of ['source','cropRatio','cropX','cropY','cropZoom'])delete el.dataset[key];syncCropUI(el);commit();}
$('reset-crop').onclick=()=>resetCrop(selectedElement);
// Brand settings live with the document, and a reusable preset lives on the device.
const fonts=[...$('prop-text-font').options].map(option=>({value:option.value,label:option.textContent}));
document.body.insertAdjacentHTML('beforeend',`<dialog id="brand-dialog"><h2>ブランド設定</h2><p class="asset-help">名前・配色・フォント・ロゴを保存して、作品の見た目を揃えます。</p><label>ブランド名<input id="brand-name" class="inspector-input" maxlength="60"></label><div class="brand-colors"><label>背景 上<input id="brand-primary" type="color"></label><label>背景 下<input id="brand-secondary" type="color"></label><label>文字色<input id="brand-text" type="color"></label></div><label>フォント<select id="brand-font" class="inspector-input"></select></label><div class="studio-actions"><button class="studio-button" onclick="document.getElementById('brand-logo-file').click()">ロゴを読み込む</button><button id="place-brand-logo" class="studio-button">ロゴを配置</button><button id="remove-brand-logo" class="studio-button">ロゴを解除</button></div><input hidden id="brand-logo-file" type="file" accept="image/png,image/jpeg,image/webp"><img id="brand-logo-preview" alt="登録ロゴ"><div class="studio-actions"><button id="save-brand" class="studio-button">設定を保存</button><button id="load-brand" class="studio-button">保存済み設定を読込</button></div><div class="studio-actions"><button id="apply-brand" class="studio-button">このページに適用</button><button id="apply-brand-all" class="studio-button">全ページに適用</button><button class="studio-button" onclick="this.closest('dialog').close()">閉じる</button></div><p id="brand-status" role="status" class="asset-help"></p></dialog>`);
for(const font of fonts){const option=document.createElement('option');option.value=font.value;option.textContent=font.label;$('brand-font').append(option);}
let draftLogo='';
function syncBrandUI(){if(!$('brand-name'))return;$('brand-name').value=brand.name;for(const key of ['primary','secondary','text','font'])$('brand-'+key).value=brand[key];draftLogo=brand.logo;renderBrandLogo();}
function renderBrandLogo(){$('brand-logo-preview').src=draftLogo||'';$('brand-logo-preview').hidden=!draftLogo;$('place-brand-logo').disabled=!draftLogo;$('remove-brand-logo').disabled=!draftLogo;}
function readBrandUI(){return {name:$('brand-name').value.trim()||'マイブランド',primary:$('brand-primary').value,secondary:$('brand-secondary').value,text:$('brand-text').value,font:$('brand-font').value,logo:draftLogo};}
$('brand-logo-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{draftLogo=await readImage(file);renderBrandLogo();$('brand-status').textContent='ロゴを読み込みました。設定を保存してください。';}catch(error){$('brand-status').textContent=error.message;}};
$('remove-brand-logo').onclick=()=>{draftLogo='';renderBrandLogo();};
$('place-brand-logo').onclick=async()=>{try{await addImageAsset({name:'ブランドロゴ',url:draftLogo});$('brand-dialog').close();}catch(error){$('brand-status').textContent=error.message;}};
$('save-brand').onclick=async()=>{try{brand=readBrandUI();commit();await workspaceStore('put',{id:'brand-preset',brand});$('brand-status').textContent='この端末に設定を保存しました';}catch(error){$('brand-status').textContent='保存に失敗しました：'+error.message;}};
$('load-brand').onclick=async()=>{try{const saved=await workspaceStore('get','brand-preset');if(!saved)return void($('brand-status').textContent='保存済み設定はありません');brand=saved.brand;syncBrandUI();commit();$('brand-status').textContent='保存済み設定を読み込みました';}catch(error){$('brand-status').textContent=error.message;}};
function applyBrandToState(state,kit) {
    const updated={...state,bgC1:kit.primary,bgC2:kit.secondary,bgOverlay:false,bgStyle:`linear-gradient(135deg, ${kit.primary}, ${kit.secondary})`};
    const box=document.createElement('div');box.innerHTML=state.elementsHtml;
    box.querySelectorAll('.element[data-type="text"]').forEach(el=>{if(el.dataset.locked==='true')return;const h=el.querySelector('h1');el.dataset.font=kit.font;el.dataset.color=kit.text;applyTextStyles(el,{size:parseFloat(h.style.fontSize)||100,font:kit.font,color:kit.text,effect:el.dataset.effect||'normal',shadow:el.dataset.shadow||'none',lineHeight:h.style.lineHeight||1.2,spacing:parseFloat(h.style.letterSpacing)||0});});
    updated.elementsHtml=box.innerHTML;return updated;
}
function applyBrand(all=false){commit();brand=readBrandUI();pages.forEach((page,i)=>{if(all||i===activePage)page.state=applyBrandToState(page.state,brand);});baseRestore(pages[activePage].state);commit();$('brand-dialog').close();toast('ブランドの配色とフォントを適用しました。元に戻すこともできます');}
$('apply-brand').onclick=()=>applyBrand(false);$('apply-brand-all').onclick=()=>applyBrand(true);
// Favorites are non-destructive and independent from project history.
let favoriteOnly=false;
const favoriteToggle=document.createElement('button');favoriteToggle.className='studio-button';favoriteToggle.textContent='☆ お気に入りだけ表示';$('asset-search').before(favoriteToggle);
favoriteToggle.onclick=()=>{favoriteOnly=!favoriteOnly;favoriteToggle.textContent=favoriteOnly?'★ すべて表示':'☆ お気に入りだけ表示';renderAssetLibrary();};
const renderLibraryBeforeWorkflow=renderAssetLibrary;
renderAssetLibrary=function(){renderLibraryBeforeWorkflow();const visible=importedAssets.filter(a=>a.name.toLowerCase().includes(assetFilter.toLowerCase()));[...$('imported-assets').querySelectorAll('.library-card')].forEach((card,i)=>{const asset=visible[i];card.hidden=favoriteOnly&&!asset.favorite;const favorite=document.createElement('button');favorite.className='studio-button';favorite.textContent=asset.favorite?'★':'☆';favorite.title='お気に入りを切り替え';favorite.onclick=async()=>{try{const next={...asset,favorite:!asset.favorite};await assetStore('put',next);Object.assign(asset,next);renderAssetLibrary();}catch(error){toast('お気に入りを保存できませんでした');}};card.querySelector('.library-actions').prepend(favorite);});};
// Only the final UI initialization restores old projects, avoiding overwrite during startup.
document.body.classList.add('workspace-loading');
const workspaceInitialized=(async()=>{
    try{
        const saved=await workspaceStore('get','autosave');
        if(saved?.document)restoreWorkspace(saved.document);
        else{let old=null;try{old=JSON.parse(localStorage.getItem(STORAGE_KEY));}catch{}if(old)restoreWorkspace(old);else{pages=[{id:pageId(),name:'ページ 1',state:snapshot()}];syncBrandUI();}}
    }catch(error){pages=[{id:pageId(),name:'ページ 1',state:snapshot()}];toast('自動復元できませんでした。保存ファイルを開いてください');}
    finally{workspaceReady=true;renderTemplates();renderPages();renderLayers();commit();resetZoom();document.body.classList.remove('workspace-loading');}
})();
if(window.desktopAPI)window.desktopAPI.onPrepareClose(async()=>{try{if(busy)throw Error('書き出し完了後に終了してください');await flushWorkspace();window.desktopAPI.completeClose(true);}catch(error){toast('終了前に保存できませんでした。ファイル保存を確認してください');window.desktopAPI.completeClose(false);}});
// Preview the crop before applying it, without changing the original or the canvas.
const cropPreview=document.createElement('canvas');cropPreview.id='crop-preview';cropPreview.width=240;cropPreview.height=150;cropPreview.setAttribute('aria-label','トリミング範囲のプレビュー');$('apply-crop').parentElement.before(cropPreview);
let cropPreviewRevision=0;
async function previewCrop(){const revision=++cropPreviewRevision;const el=selectedElement;if(el?.dataset.type!=='image')return;try{const original=await imageInfo(el.dataset.source||el.querySelector('img').src);if(revision!==cropPreviewRevision)return;const ratio=$('crop-ratio').value==='original'?original.width/original.height:Number($('crop-ratio').value);let w=original.width,h=w/ratio;if(h>original.height){h=original.height;w=h*ratio;}const zoom=Number($('crop-zoom').value)/100;w/=zoom;h/=zoom;const x=(original.width-w)*Number($('crop-x').value)/100,y=(original.height-h)*Number($('crop-y').value)/100;const ctx=cropPreview.getContext('2d');ctx.clearRect(0,0,240,150);const scale=Math.min(240/w,150/h);ctx.drawImage(original,x,y,w,h,(240-w*scale)/2,(150-h*scale)/2,w*scale,h*scale);}catch{}}
for(const id of ['crop-ratio','crop-x','crop-y','crop-zoom'])$(id).addEventListener('input',previewCrop);
const syncCropBeforePreview=syncCropUI;syncCropUI=function(el){syncCropBeforePreview(el);if(el.dataset.type==='image')previewCrop();};
$('prop-image').insertAdjacentHTML('afterbegin',`<button class="studio-button" onclick="document.getElementById('replace-image-file').click()">画像を差し替え</button><input hidden id="replace-image-file" type="file" accept="image/png,image/jpeg,image/webp">`);
$('replace-image-file').onchange=async event=>{const file=event.target.files[0],target=selectedElement;event.target.value='';if(!file||target?.dataset.type!=='image'||target.dataset.locked==='true')return;try{const url=await readImage(file);if(!target.isConnected)return;target.querySelector('img').src=url;target.dataset.name=file.name;for(const key of ['source','cropRatio','cropX','cropY','cropZoom'])delete target.dataset[key];if(target===selectedElement)selectElement(target,'image');commit();}catch(error){toast(error.message);}};

// Match the screen's cover crop before raster export instead of stretching uploads.
async function rasterizeDeviceScreens(root){
    for(const img of root.querySelectorAll('.device-screen img')){
        if(!img.getAttribute('src')||img.style.display==='none')continue;
        const width=img.parentElement.clientWidth,height=img.parentElement.clientHeight;if(!width||!height)continue;
        const factor=Math.max(width/img.naturalWidth,height/img.naturalHeight),sw=width/factor,sh=height/factor;
        const buffer=document.createElement('canvas');buffer.width=width;buffer.height=height;
        buffer.getContext('2d').drawImage(img,(img.naturalWidth-sw)/2,(img.naturalHeight-sh)/2,sw,sh,0,0,width,height);
        img.src=buffer.toDataURL('image/png');await img.decode();
    }
}
bgImporter.insertAdjacentHTML('beforeend','<label class="asset-help">背景の横位置<input id="background-x" type="range" min="0" max="100" value="50"></label><label class="asset-help">背景の縦位置<input id="background-y" type="range" min="0" max="100" value="50"></label>');
for(const id of ['background-x','background-y'])$(id).oninput=()=>{if(canvas.style.backgroundImage.includes('url('))canvas.style.backgroundPosition=`${$('background-x').value}% ${$('background-y').value}%`;};
