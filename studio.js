'use strict';
const $ = id => document.getElementById(id);
const escapeHTML = value => { const el = document.createElement('div'); el.textContent = value; return el.innerHTML; };
const textToSafeHtml = value => escapeHTML(String(value ?? '').slice(0, 2000)).replace(/\r?\n/g, '<br>');
let history = [], historyIndex = -1, restoring = false, busy = false, saveTimer;
const STORAGE_KEY = 'formcross-project-v2';
function toast(message) { $('studio-status').textContent = message; }
function snapshot() {
    const copy = elementsContainer.cloneNode(true);
    copy.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    return { version: 2, size: $('canvas-size').value, lang: currentLang, bgC1: $('bg-c1').value, bgC2: $('bg-c2').value, bgOverlay: $('bg-overlay').checked, bgStyle: canvas.style.background, elementsHtml: copy.innerHTML };
}
function validateProject(data) {
    if (!data || ![...$('canvas-size').options].some(option => option.value === data.size) || typeof data.elementsHtml !== 'string' || data.elementsHtml.length > 40000000) throw Error('対応する .fcs プロジェクトを選択してください。');
    const clean = DOMPurify.sanitize(data.elementsHtml, { ALLOWED_TAGS: ['div','h1','span','i','br','img'], ALLOWED_ATTR: ['class','style','src','data-type','data-ja','data-en','data-color','data-font','data-effect','data-shadow','data-name','data-locked','data-hidden','data-source','data-crop-ratio','data-crop-x','data-crop-y','data-crop-zoom'] });
    const box = document.createElement('div'); box.innerHTML = clean;
    if (box.children.length > 200) throw Error('要素数は200個までです。');
    for (const el of box.children) {
        if (!el.classList.contains('element') || !['text','device','badge','image'].includes(el.dataset.type) || !el.querySelector(el.dataset.type === 'text' ? 'h1' : el.dataset.type === 'device' ? '.device-frame .device-screen img' : el.dataset.type === 'image' ? 'img' : 'span')) throw Error('プロジェクトの要素が破損しています。');
        for (const lang of ['ja','en']) if (el.dataset[lang]) el.dataset[lang] = DOMPurify.sanitize(el.dataset[lang], { ALLOWED_TAGS: ['br','i'], ALLOWED_ATTR: ['class'] });
    }
    return { ...data, elementsHtml: box.innerHTML };
}
function restore(data) {
    data = validateProject(data); restoring = true;
    try {
        clearSelection(); updateCanvasSize(data.size);
        currentLang = data.lang === 'en' ? 'en' : 'ja'; $('ui-lang').value = currentLang;
        $('bg-c1').value = data.bgC1 || '#1e3c72'; $('bg-c2').value = data.bgC2 || '#2a5298';
        canvas.style.background = data.bgStyle || `linear-gradient(135deg, ${$('bg-c1').value}, ${$('bg-c2').value})`;
        $('bg-overlay').checked = !!data.bgOverlay; toggleOverlay();
        elementsContainer.innerHTML = data.elementsHtml;
        
        // Migrate old device-notch to new iPhone 15 Pro hardware
        elementsContainer.querySelectorAll('.device-wrapper').forEach(el => {
            const frame = el.querySelector('.device-frame');
            if (frame) {
                const oldNotch = frame.querySelector('.device-notch');
                if (oldNotch) {
                    oldNotch.remove();
                    if (!frame.classList.contains('ipad')) {
                        frame.insertAdjacentHTML('afterbegin', `
                <div class="device-hardware-buttons">
                    <div class="button-action"></div>
                    <div class="button-vol-up"></div>
                    <div class="button-vol-down"></div>
                    <div class="button-power"></div>
                </div>
                <div class="device-dynamic-island">
                    <div class="island-sensor"></div>
                    <div class="island-camera"></div>
                </div>`);
                    }
                }
            }
        });

        for (const el of elementsContainer.children) makeDraggableAndSelectable(el, el.dataset.type);
        renderTemplates(); renderLayers();
    } finally { restoring = false; }
}
function commit() {
    if (restoring || busy) return;
    const state = JSON.stringify(snapshot());
    if (history[historyIndex] === state) return;
    history = history.slice(0, historyIndex + 1); history.push(state);
    if (history.length > 35) history.shift(); historyIndex = history.length - 1;
    $('undo-button').disabled = historyIndex < 1; $('redo-button').disabled = true;
    renderLayers(); clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(STORAGE_KEY, state); toast('この端末に自動保存しました'); } catch { toast('自動保存の容量を超えました。「保存」でファイルに保存してください'); } }, 500);
}
function undo(delta = -1) {
    commit(); const next = historyIndex + delta;
    if (next < 0 || next >= history.length) return;
    clearTimeout(saveTimer); historyIndex = next; restore(JSON.parse(history[next])); history[next] = JSON.stringify(snapshot());
    $('undo-button').disabled = next === 0; $('redo-button').disabled = next === history.length - 1;
    try { localStorage.setItem(STORAGE_KEY, history[next]); } catch {}
    toast(delta < 0 ? '元に戻しました' : 'やり直しました');
}
function download(blob, name) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function saveProject() { commit(); download(new Blob([JSON.stringify(snapshot())], {type:'application/json'}), 'AppVisual-design.fcs'); toast('プロジェクトを保存しました'); }
async function loadProject(event) {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    try { if (file.size > 40000000) throw Error('40MB以下のプロジェクトを選択してください。'); const data = validateProject(JSON.parse(await file.text())); commit(); restore(data); commit(); resetZoom(); toast('読み込みました。元に戻すこともできます'); } catch (error) { toast('読み込み失敗：' + error.message); }
}
async function readImage(file) {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 12000000) throw Error('12MB以下のPNG・JPEG・WebP画像を選択してください。');
    const url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('画像を読み込めませんでした')); reader.readAsDataURL(file); });
    const image = new Image(); image.src = url; await image.decode(); if (image.naturalWidth * image.naturalHeight > 40000000) throw Error('画像は4000万画素以下にしてください。'); return url;
}
function duplicateSelected() { if (!selectedElement) return; const el = selectedElement.cloneNode(true); el.style.left = (parseFloat(el.style.left) + 50) + 'px'; el.style.top = (parseFloat(el.style.top) + 50) + 'px'; elementsContainer.append(el); makeDraggableAndSelectable(el, el.dataset.type); selectElement(el, el.dataset.type); commit(); }
function alignSelected() { if (!selectedElement) return; selectedElement.style.left = ((canvas.offsetWidth - selectedElement.offsetWidth) / 2) + 'px'; commit(); }
function renderLayers() {
    const list = $('layer-list'); if (!list) return; list.replaceChildren();
    [...elementsContainer.children].sort((a,b) => (Number(b.style.zIndex)||20)-(Number(a.style.zIndex)||20)).forEach(el => { const button = document.createElement('button'); button.textContent = el.dataset.type === 'device' ? '▣ デバイス' : (el.dataset.name || el.textContent.trim().slice(0,25) || '素材'); button.onclick = () => selectElement(el, el.dataset.type); list.append(button); });
}
async function exportImage() {
    if (busy) return; commit(); busy = true;
    const button = document.querySelector('.export-btn'), original = button.innerHTML;
    const transform = canvas.style.transform, guide = $('split-guide').style.display, selection = selectedElement;
    button.disabled = true; button.textContent = '書き出し中…'; clearSelection(); $('split-guide').style.display = 'none';
    try {
        await document.fonts.ready;
        await Promise.all([...canvas.querySelectorAll('img')].filter(img => img.getAttribute('src')).map(img => img.decode()));
        canvas.style.transform = 'none';
        
        // Use html-to-image to perfectly preserve modern CSS like gradient text!
        const result = await htmlToImage.toCanvas(canvas, { pixelRatio: 1, backgroundColor: null });
        const count = isPanorama ? 2 : 1;
        for (let i = 0; i < count; i++) { 
            const part = document.createElement('canvas'); 
            part.width = result.width/count; 
            part.height = result.height; 
            const ctx = part.getContext('2d');
            // Fill white background just in case to prevent transparency
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, part.width, part.height);
            ctx.drawImage(result, i*part.width, 0, part.width, part.height, 0,0,part.width,part.height); 
            const blob = await new Promise(resolve => part.toBlob(resolve,'image/jpeg', 1.0)); 
            if (!blob) throw Error('画像を生成できませんでした'); 
            download(blob, `AppVisual_${$('canvas-size').value}_${i+1}.jpg`); 
        }
        toast('JPG画像を書き出しました（App Store完全対応）');
    } catch (error) { toast('書き出し失敗：画像やネットワークを確認してください。' + error.message); }
    finally { 
        canvas.style.transform = transform; 
        $('split-guide').style.display = guide; 
        if(selection?.isConnected) selectElement(selection, selection.dataset.type); 
        busy = false; button.disabled = false; button.innerHTML = original; 
    }
}
const palettes = [ ['ミント','#ecfdf5','#a7f3d0'], ['ラベンダー','#f5f3ff','#c4b5fd'], ['ピーチ','#fff7ed','#fed7aa'], ['オーシャン','#0c4a6e','#06b6d4'], ['ミッドナイト','#0f172a','#312e81'], ['ローズ','#fff1f2','#fda4af'], ['スカイ','#eff6ff','#93c5fd'], ['グラファイト','#18181b','#52525b'], ['ライム','#f7fee7','#bef264'], ['サンド','#fffbeb','#fde68a'], ['ベリー','#701a75','#db2777'], ['アイス','#f0fdfa','#99f6e4'] ];
const headlines = [['習慣を、少しずつ。','Build better habits.'],['アイデアをひとつに。','Ideas, together.'],['次の旅を見つけよう。','Find your next trip.'],['毎日の成長を記録。','Track your progress.'],['集中できる毎日へ。','Make room for focus.'],['好きな瞬間を残そう。','Save your moments.'],['学ぶ楽しさ、もっと。','Enjoy learning.'],['仕事がすっと整う。','Organize your work.'],['一歩先の自分へ。','Your next chapter.'],['暮らしに、小さな余白。','Space for living.'],['ひらめきを逃さない。','Capture inspiration.'],['心地よい時間を。','Time to unwind.']];
templates.push({group_ja:'用途で選ぶ・新作12種', group_en:'Everyday essentials · 12', items: palettes.map((p,i) => ({id:37+i,name_ja:['習慣トラッカー','ノート・メモ','旅行ガイド','フィットネス','集中タイマー','フォトアルバム','学習アプリ','タスク管理','目標設定','ライフスタイル','クリエイティブ','ウェルネス'][i], name_en:['Habits','Notes','Travel','Fitness','Focus','Photos','Learning','Tasks','Goals','Lifestyle','Creative','Wellness'][i],size:i===7?'ipad':'iphone',bg:p.slice(1),elements:[{t:'badge',text_ja:'NEW COLLECTION',text_en:'NEW COLLECTION',style:'dark',x:120,y:140},{t:'text',html_ja:headlines[i][0],html_en:headlines[i][1],x:100,y:330,size:85,color:[3,4,7,10].includes(i)?'#ffffff':'#172033',align:'left',w:1080},{t:'text',html_ja:'あなたに合った、新しい体験。',html_en:'A new experience, made for you.',x:110,y:500,size:38,color:[3,4,7,10].includes(i)?'#ffffff':'#334155',align:'left',w:1000},{t:'device',type:i===7?'ipad-silver':'iphone-silver',x:i===7?250:120,y:740,ry:0,rx:0,scale:i===7?.85:.79}]}))});
templates.push({group_ja:'ストーリー・2画面セット6種', group_en:'Two-screen stories', items: palettes.slice(0,6).map((p,i)=>({id:49+i,name_ja:['習慣の変化','アイデアの整理','旅の思い出','成長の記録','集中と休息','瞬間の共有'][i],name_en:['Habits story','Ideas story','Travel story','Progress story','Focus story','Photo story'][i],size:'iphone-pano',bg:p.slice(1),elements:[{t:'text',html_ja:headlines[i][0],html_en:headlines[i][1],x:120,y:180,size:100,color:i>2?'#ffffff':'#172033',align:'left',w:2200},{t:'device',type:'iphone-silver',x:100,y:650,scale:.8},{t:'device',type:'iphone-black',x:1340,y:650,scale:.8},{t:'text',html_ja:'01  はじめる',html_en:'01  Get started',x:150,y:460,size:55,color:i>2?'#ffffff':'#172033',w:950},{t:'text',html_ja:'02  続ける',html_en:'02  Keep going',x:1390,y:460,size:55,color:i>2?'#ffffff':'#172033',w:950}]}))});
let templateQuery = '';
renderTemplates = function() {
    const container = $('template-container'); container.replaceChildren();
    const heading = document.createElement('div'); heading.className='panel-title'; heading.textContent=`テンプレート · ${templates.flatMap(g=>g.items).length}種類`; container.append(heading);
    const search = document.createElement('input'); search.className='inspector-input'; search.placeholder='用途・名前で検索…'; search.setAttribute('aria-label','テンプレート検索'); search.value=templateQuery;
    const results=document.createElement('div'); container.append(search,results);
    const draw=()=>{results.replaceChildren(); let count=0; for(const group of templates){const items=group.items.filter(t => `${t.name_ja} ${t.name_en} ${group.group_ja}`.toLowerCase().includes(templateQuery.toLowerCase())); if(!items.length)continue; const title=document.createElement('h3'); title.className='template-group-title'; title.textContent=currentLang==='ja'?group.group_ja:group.group_en; results.append(title); const grid=document.createElement('div');grid.className='template-grid'; results.append(grid); for(const tpl of items){count++;const button=document.createElement('button');button.className='template-btn';const preview=document.createElement('div');preview.className='template-preview';preview.style.background=`linear-gradient(135deg,${tpl.bg.join(',')})`;const text=tpl.elements.find(e=>e.t==='text');const caption=document.createElement('b');caption.textContent=(text?.html_ja || text?.text_ja || tpl.name_ja).replace(/<[^>]*>/g,' ');caption.style.color=text?.color||'#fff';preview.append(caption);const devices=tpl.elements.filter(e=>e.t==='device');for(const d of devices.slice(0,2)){const mock=document.createElement('div');mock.className='preview-phone';preview.append(mock);}button.append(preview,document.createTextNode(currentLang==='ja'?tpl.name_ja:tpl.name_en));button.onclick=()=>{commit();loadTemplate(tpl);commit();resetZoom();toast('テンプレートを適用しました · 元に戻すで復元できます');};grid.append(button);}}if(!count)results.textContent='一致するテンプレートがありません。';};search.oninput=()=>{templateQuery=search.value;draw();};draw();
};
const nav=document.querySelector('.nav-tools');
nav.insertAdjacentHTML('afterbegin','<button id="undo-button" class="studio-button" title="元に戻す ⌘/Ctrl+Z" onclick="undo()">↶</button><button id="redo-button" class="studio-button" title="やり直す ⌘/Ctrl+Shift+Z" onclick="undo(1)">↷</button><button class="studio-button" onclick="saveProject()">保存</button><button class="studio-button" onclick="document.getElementById(\'project-file\').click()">開く</button><input hidden id="project-file" type="file" accept=".fcs,.json" onchange="loadProject(event)">');
document.body.insertAdjacentHTML('beforeend','<footer class="studio-footer"><span id="studio-status" role="status" aria-live="polite">準備完了</span><span>⌘/Ctrl+Z 元に戻す · ⌘/Ctrl+D 複製 · 矢印キー 移動 · Space ドラッグ</span></footer>');
$('prop-global').insertAdjacentHTML('beforeend','<div class="studio-actions"><button class="studio-button" onclick="duplicateSelected()">複製</button><button class="studio-button" onclick="alignSelected()">左右中央に整列</button></div>');
document.querySelector('.sidebar-right').insertAdjacentHTML('beforeend','<section class="panel-section"><div class="panel-title">レイヤー · クリックで選択</div><div id="layer-list"></div></section>');
const materials=document.createElement('section');materials.className='panel-section';materials.innerHTML='<div class="panel-title">すぐに使える装飾 · 20種類</div><div class="asset-grid"></div>';
['●','■','◆','★','♥','✓','→','↗','＋','✦','01','02','03','NEW','TIP','Before','After','シンプル','かんたん操作','はじめよう'].forEach((label,i)=>{const button=document.createElement('button');button.className='studio-button';button.textContent=label;button.onclick=()=>{addTextObj(escapeHTML(label),escapeHTML(label),180,220,i<10?160:70,i%2?'#38bdf8':'#ffffff','center',null,'none','sans-serif','normal');const el=elementsContainer.lastElementChild;selectElement(el,'text');commit();};materials.querySelector('.asset-grid').append(button);});$('tab-materials').prepend(materials);
const backgrounds=document.createElement('section');backgrounds.className='panel-section';backgrounds.innerHTML='<div class="panel-title">背景パレット · オフライン対応</div><div class="palette-grid"></div>';palettes.forEach(p=>{const button=document.createElement('button');button.className='palette';button.style.background=`linear-gradient(135deg,${p[1]},${p[2]})`;button.title=p[0];button.setAttribute('aria-label',p[0]);button.onclick=()=>{$('bg-c1').value=p[1];$('bg-c2').value=p[2];customColor();commit();};backgrounds.lastElementChild.append(button);});$('tab-design').append(backgrounds);
document.addEventListener('click',()=>queueMicrotask(commit));document.addEventListener('change',()=>queueMicrotask(commit));document.addEventListener('pointerup',()=>setTimeout(commit,0));document.addEventListener('input',()=>{clearTimeout(window.studioInputTimer);window.studioInputTimer=setTimeout(commit,350);});
window.addEventListener('keydown',event=>{const editing=event.target.closest('input,textarea,select,[contenteditable="true"]');if(editing)return;const mod=event.metaKey||event.ctrlKey; if(mod&&['z','s','d','y'].includes(event.key.toLowerCase())){event.preventDefault();const key=event.key.toLowerCase();if(key==='z')undo(event.shiftKey?1:-1);if(key==='y')undo(1);if(key==='s')saveProject();if(key==='d')duplicateSelected();return;}if(event.key==='Escape')clearSelection();if(!selectedElement)return;if(['Delete','Backspace'].includes(event.key)){event.preventDefault();deleteSelected();commit();}if(event.key.startsWith('Arrow')){event.preventDefault();const step=event.shiftKey?10:1;selectedElement.style.left=(parseFloat(selectedElement.style.left)+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0))+'px';selectedElement.style.top=(parseFloat(selectedElement.style.top)+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0))+'px';commit();}});
window.addEventListener('blur',()=>{isSpacePressed=false;isPanning=false;canvasArea.style.cursor='default';commit();});
for(const card of document.querySelectorAll('.material-card')){card.tabIndex=0;card.setAttribute('role','button');card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click();}};}

// --- AI Generation Logic ---
async function generateWithAI() {
    const promptInput = document.getElementById('ai-prompt-input');
    const prompt = promptInput.value.trim();
    if (!prompt) {
        alert('アプリの概要を入力してください。');
        return;
    }
    
    const bgStyleSelect = document.getElementById('ai-bg-style');
    const selectedBgAction = bgStyleSelect ? bgStyleSelect.value : 'keep';

    const btn = document.getElementById('ai-generate-btn');
    const originalBtnText = btn.innerHTML;
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 生成中...';
    btn.disabled = true;

    try {
        const textElementsList = elementsContainer.querySelectorAll('.element[data-type="text"]');
        const templateTexts = Array.from(textElementsList).map(el => {
            const h1 = el.querySelector('h1');
            return h1 ? h1.innerText : '';
        });
        const response = await fetch(API_BASE_URL + '/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, templateTexts })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'API通信エラーが発生しました');
        }

        if (!data.pages || !Array.isArray(data.pages)) {
            throw new Error('AIが不正な形式を返しました。');
        }

        // Apply pages (Using the current design)
        
        let unifiedPalette = null;
        if (selectedBgAction === 'random-unified' && typeof palettes !== 'undefined') {
            unifiedPalette = palettes[Math.floor(Math.random() * palettes.length)];
        }

        for (let i = 0; i < data.pages.length; i++) {
            const pageData = data.pages[i];
            
            // For the first page, we reuse the current page.
            // For subsequent pages, we duplicate the previous page so the design is maintained.
            if (i > 0) {
                addPage(true);
            }
            
            // Clean up the page name
            pages[activePage].name = `ページ ${activePage + 1}`;
            
            // Apply Background
            if (selectedBgAction === 'random-unified' && unifiedPalette) {
                canvas.style.background = `linear-gradient(135deg, ${unifiedPalette[1]}, ${unifiedPalette[2]})`;
                pages[activePage].state.bgStyle = canvas.style.background;
            } else if (selectedBgAction === 'random-varied' && typeof palettes !== 'undefined') {
                const randomPalette = palettes[Math.floor(Math.random() * palettes.length)];
                canvas.style.background = `linear-gradient(135deg, ${randomPalette[1]}, ${randomPalette[2]})`;
                pages[activePage].state.bgStyle = canvas.style.background;
            } else if (selectedBgAction === 'dark') {
                canvas.style.background = `linear-gradient(135deg, #1a1a1a, #0a0a0a)`;
                pages[activePage].state.bgStyle = canvas.style.background;
            } else if (selectedBgAction === 'light') {
                canvas.style.background = `linear-gradient(135deg, #f0f0f0, #ffffff)`;
                pages[activePage].state.bgStyle = canvas.style.background;
            }
            
            // Rewrite texts
            const textElements = elementsContainer.querySelectorAll('.element[data-type="text"]');
            
            if (pageData.texts && Array.isArray(pageData.texts)) {
                for (let j = 0; j < Math.min(pageData.texts.length, textElements.length); j++) {
                    const h1 = textElements[j].querySelector('h1');
                    if (h1) {
                        const htmlText = textToSafeHtml(pageData.texts[j]);
                        h1.innerHTML = htmlText;
                        textElements[j].dataset.ja = htmlText;
                        textElements[j].dataset.en = htmlText;
                    }
                }
            } else if (pageData.headline) {
                // fallback
                if (textElements.length > 0) textElements[0].querySelector('h1').innerHTML = textToSafeHtml(pageData.headline);
                if (textElements.length > 1 && pageData.subtext) textElements[1].querySelector('h1').innerHTML = textToSafeHtml(pageData.subtext);
            }
            
            // Save the state after rewriting texts
            commit();
        }
        
        // Hide modal
        document.getElementById('ai-modal').style.display = 'none';
        toast('AIがスクリーンショットを自動生成しました！');
        
    } catch (error) {
        console.error(error);
        alert('エラー: ' + error.message);
    } finally {
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
    }
}


async function translateSelectedText() {
    if (!selectedElement || selectedElement.dataset.type !== 'text') {
        alert('テキスト要素を選択してください。');
        return;
    }
    
    const h1 = selectedElement.querySelector('h1');
    const currentText = h1 ? h1.innerText : '';
    if (!currentText) return;
    
    const targetLang = document.getElementById('prop-text-lang').value;
    const btn = document.getElementById('prop-text-translate-btn');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
    btn.disabled = true;
    
    try {
        const response = await fetch(API_BASE_URL + '/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: currentText, targetLang })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '翻訳失敗');
        if (!data.translatedText) throw new Error('翻訳結果が空です');
        
        // Update DOM
        const htmlText = textToSafeHtml(data.translatedText);
        h1.innerHTML = htmlText;
        document.getElementById('prop-text-content').value = htmlText.replace(/<br>/g, '\n');
        
        // Update element dataset to trigger commit
        updateSelectedElementContent(); 
        toast('翻訳が完了しました');
    } catch (err) {
        alert('エラー: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
