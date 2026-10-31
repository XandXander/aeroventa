'use strict';
const app = document.querySelector('#app');
const STATE = {session:null, items:[], files:[], active:'overview', selected:null, form:{}, original:{}, editMode:'main', filter:'', statusFilter:'all', page:1, pageSize:7, categories:[], fileOptions:[], showCreateCategory:false, publisher:{configured:false}, releaseRun:null, releaseId:'', previewRunId:'', previewReady:false, saving:false, error:'', notice:'', dirty:false,blocks:[],blockEditing:null,blockDraft:null,blockType:'text',blockBusy:false,baselineRunning:false,baselineDone:0,baselineResult:[],baselineExportBusy:false,baselineBackupReady:false,baselineVerify:null,baselineVerifyBusy:false};
const E = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safePath = p => typeof p==='string' && /^\/[a-z0-9/_-]*\/$/i.test(p) ? p : '/';
const formatDate = s => {if(!s)return '—';const d=new Date(s);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('ru-RU')};
const icons = {overview:'◫',content:'▤',sections:'≡',media:'▧',releases:'◇',baseline:'▣',settings:'⚙'};
const fields=[['title','Название','main',240],['h1','Заголовок H1','main',240],['excerpt','Краткое описание','main',1600],['seo_title','SEO-заголовок','seo',240],['seo_description','SEO-описание','seo',480],['og_title','Заголовок для соцсетей','seo',240],['og_description','Описание для соцсетей','seo',480],['canonical_override','Canonical URL (при необходимости)','seo',240],['schema_type','Тип Schema.org','seo',48]];
const byId=id=>STATE.items.find(x=>x.id===id);
async function api(action, opts={}) {
 const config={method:opts.post?'POST':'GET',credentials:'same-origin',headers:{'Accept':'application/json','X-CSRF-Token':STATE.session?.csrf||''}};
 if(opts.post){ config.headers['Content-Type']='application/json'; config.headers['X-CSRF-Token']=STATE.session?.csrf||'';config.body=JSON.stringify(opts.post);}
 const response=await fetch('/index.php?action='+encodeURIComponent(action)+(opts.query?'&'+new URLSearchParams(opts.query):''),config);
 let json={};try{json=await response.json();}catch{}
 if(response.status===401 && action!=='login') { STATE.session={authenticated:false,csrf:STATE.session?.csrf};renderLogin();throw Error('Сессия истекла. Войдите снова.'); }
 if(!response.ok)throw Error(json.error||'Ошибка запроса ('+response.status+')');
 return json;
}
function notify(text,kind='notice'){STATE[kind]=text;const n=document.querySelector('.notice-live');if(n){n.textContent=text;n.dataset.kind=kind;}}
function renderLogin(){
 app.innerHTML=`<main class="login-wrap"><section class="login-card"><div class="brand"><img class="brand-logo" src="/assets/logo-header-color.svg" alt="AEROVENTA.RU"><span class="brand-subtitle">РЕДАКТОР САЙТА</span></div><div class="login-copy"><p class="eyebrow">Управление содержимым</p><h1>Точность в каждой детали.</h1><p>Закрытая редакционная панель AEROVENTA. Войдите под своей учётной записью Directus.</p></div><form id="login-form"><label>Электронная почта<input type="email" name="email" autocomplete="username" required placeholder="editor@aeroventa.ru"></label><label>Пароль<input type="password" name="password" autocomplete="current-password" required placeholder="Ваш пароль"></label><label>Одноразовый код <small>если включён</small><input type="text" name="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="Необязательно"></label><button class="primary wide" type="submit">Открыть редактор <span>↗</span></button><p class="login-error" role="alert"></p></form><p class="smallprint">Сайт aeroventa.ru не меняется при сохранении черновика.<br>Пароль не записывается в файлы приложения.</p></section><aside class="login-art"><span class="art-index">AEROVENTA / 01</span><span class="art-grid"></span><div class="air-lines"><i></i><i></i><i></i><i></i><i></i></div><div class="art-message"><span>РЕДАКТОР САЙТА</span><strong>Содержание под контролем.</strong><span>Редактирование · Проверка · Утверждение</span></div></aside></main>`;
 document.querySelector('#login-form').addEventListener('submit',async ev=>{ev.preventDefault();const form=ev.currentTarget;const btn=form.querySelector('button');btn.disabled=true;form.querySelector('.login-error').textContent='';try{const vals=Object.fromEntries(new FormData(form).entries());const res=await api('login',{post:vals});STATE.session=res;await loadData();render();}catch(e){form.querySelector('.login-error').textContent=e.message;}finally{btn.disabled=false;}});
}
async function loadData(){const data=await api('dashboard');STATE.items=data.items||[];if(STATE.selected && !byId(STATE.selected)) STATE.selected=null;try{STATE.publisher=await api('publisher_status');}catch{STATE.publisher={configured:false};}}
function sidebar(){const nav=[['overview','Обзор'],['content','Материалы'],['sections','Разделы'],['media','Медиатека'],['releases','Публикация'],['baseline','Перенос сайта']];return `<aside class="sidebar"><a class="identity" href="/" aria-label="AEROVENTA Editor"><img class="brand-logo" src="/assets/logo-header-color.svg" alt="AEROVENTA.RU"><span class="brand-subtitle">РЕДАКТОР САЙТА</span></a><p class="nav-label">Рабочая область</p><nav>${nav.map(([key,label])=>`<button data-nav="${key}" class="nav-item ${STATE.active===key?'selected':''}"><span class="nav-icon">${icons[key]}</span>${label}${key==='releases'&&!STATE.publisher?.configured?'<span class="lock">●</span>':''}</button>`).join('')}</nav><div class="sidebar-tail"><div class="connected"><span class="dot"></span>Directus · защищённое соединение</div><a target="_blank" rel="noopener noreferrer" href="https://aeroventa.ru">Открыть действующий сайт ↗</a><button class="logout" id="signout">Выйти из редактора</button></div></aside>`}
function topbar(title,subtitle=''){return `<header class="topbar"><div class="breadcrumbs">РАБОЧАЯ ОБЛАСТЬ <span>/</span> <b>${E(title).toUpperCase()}</b></div><div class="top-right"><span class="readonly-pill">${STATE.publisher?.configured?'Выпуск через GitHub · с проверкой':'Публикация не активирована'}</span><span class="avatar" aria-label="Пользователь">●</span></div></header><div class="page-head"><p class="eyebrow">AEROVENTA / УПРАВЛЕНИЕ САЙТОМ</p><h1>${E(title)}</h1>${subtitle?`<p>${E(subtitle)}</p>`:''}</div>`}
function statusBadge(s){if(s==='draft')return '<span class="status draft"><i></i>Черновик</span>';if(s==='published')return '<span class="status published"><i></i>Опубликовано в CMS</span>';return `<span class="status"><i></i>${E(s||'Неизвестно')}</span>`}
function overview(){const all=STATE.items, draft=all.filter(x=>x.status==='draft').length,approved=all.filter(x=>x.status==='published'&&x.owner_approved_at).length;return topbar('Обзор','Управление материалами без вмешательства в работающий сайт.')+`<div class="stat-grid"><button type="button" class="stat stat-link" data-show="all"><span>Всего материалов</span><strong>${all.length}</strong><small>Открыть все материалы ↗</small></button><button type="button" class="stat stat-link" data-show="draft"><span>Черновики</span><strong>${draft}</strong><small>Перейти к черновикам ↗</small></button><button type="button" class="stat stat-link" data-show="approved"><span>Одобрены в Directus</span><strong>${approved}</strong><small>Показать одобренные ↗</small></button></div><div class="overview-grid"><section class="panel feature"><p class="eyebrow">РЕДАКЦИОННЫЙ ПРОЦЕСС</p><h2>Сначала содержание.<br>Затем публикация.</h2><p>Работайте с черновиками, уточняйте формулировки и SEO. Ничего не попадает на основной сайт без отдельной проверенной сборки.</p><button class="primary" data-nav="content">Перейти к материалам <span>↗</span></button></section><section class="panel workflow"><h3>Порядок работы</h3><button type="button" class="workflow-step workflow-action" data-show="draft" aria-label="Открыть черновики"><b>01</b><div><strong>Черновик</strong><span>Редактирование в Directus</span></div><span class="ok">Открыть ↗</span></button><button type="button" class="workflow-step workflow-action" data-stage="2" aria-label="Статус предварительной сборки"><b>02</b><div><strong>Предварительная сборка</strong><span>Изолированный тест Astro / noindex</span></div><span>Подробнее ↗</span></button><button type="button" class="workflow-step workflow-action" data-stage="3" aria-label="Статус утверждения"><b>03</b><div><strong>Утверждение</strong><span>Отдельное разрешение владельца</span></div><span>Подробнее ↗</span></button><button type="button" class="workflow-step workflow-action" data-stage="4" aria-label="Статус публикации"><b>04</b><div><strong>Публикация</strong><span>Проверка перед изменением сайта</span></div><span>Подробнее ↗</span></button></section></div><section class="panel recent"><div class="panel-title"><h3>Материалы</h3><button class="link" data-nav="content">Все материалы ↗</button></div>${all.slice(0,3).map(x=>`<button class="recent-row" data-open="${E(x.id)}"><strong>${E(x.title||x.h1||x.path)}</strong>${statusBadge(x.status)}<span>↗</span></button>`).join('')}</section>`;}
function contents(){
 const matches=STATE.items.filter(x=> (x.title+' '+x.path+' '+x.content_type).toLocaleLowerCase('ru').includes(STATE.filter.toLocaleLowerCase('ru')) && (STATE.statusFilter==='all'||(STATE.statusFilter==='approved'?x.status==='published'&&!!x.owner_approved_at:x.status===STATE.statusFilter)));
 const pages=Math.max(1,Math.ceil(matches.length/STATE.pageSize));STATE.page=Math.min(pages,Math.max(1,STATE.page));
 const shown=matches.slice((STATE.page-1)*STATE.pageSize,STATE.page*STATE.pageSize);
 const pageBar=`<div class="listing-footer"><span class="count">Страница ${STATE.page} из ${pages} · ${matches.length} материалов</span><div class="page-buttons"><button type="button" data-page="prev" ${STATE.page===1?'disabled':''}>← Назад</button><button type="button" data-page="next" ${STATE.page===pages?'disabled':''}>Далее →</button></div></div>`;
 return topbar('Материалы','Реальные записи Directus. Сохраняются только неутверждённые черновики.')+`<div class="section-actions"><button class="primary" data-nav="newArticle">Новая статья ↗</button><span>Новые материалы не появляются на сайте автоматически.</span></div><div class="panel listing"><div class="listing-toolbar"><label class="search"><span>⌕</span><input id="search" placeholder="Найти статью, объект или страницу…" value="${E(STATE.filter)}" aria-label="Поиск материалов"></label><label class="filter-label">Статус <select id="status-filter"><option value="all" ${STATE.statusFilter==='all'?'selected':''}>Все</option><option value="draft" ${STATE.statusFilter==='draft'?'selected':''}>Черновики</option><option value="approved" ${STATE.statusFilter==='approved'?'selected':''}>Одобрены</option></select></label></div><div class="table-scroll"><table><thead><tr><th>Материал</th><th>Раздел</th><th>Статус</th><th></th></tr></thead><tbody>${shown.map(x=>`<tr><td><button class="table-name" data-open="${E(x.id)}"><strong>${E(x.title||x.h1||x.path)}</strong><span>${E(x.path)}</span></button></td><td>${E(x.content_type||'Страница')}</td><td>${statusBadge(x.status)}</td><td class="open-arrow"><button data-open="${E(x.id)}" aria-label="Открыть материал">↗</button></td></tr>`).join('')||'<tr><td colspan="4">Материалов по выбранному фильтру нет.</td></tr>'}</tbody></table></div>${pageBar}</div>`;
}
function editor(){const x=byId(STATE.selected);if(!x){STATE.active='content';return contents()}const readonly=x.status!=='draft'||x.owner_approved_at!==null;const title=x.title||x.h1||x.path;const chosen=fields.filter(row=>row[2]===STATE.editMode);return `<div class="backrow"><button data-nav="content">← Все материалы</button><span>${E(x.path)}</span></div><div class="page-head detail-head"><p class="eyebrow">AEROVENTA / ${E(x.content_type||'МАТЕРИАЛ')}</p><h1>${E(title)}</h1><div class="detail-pills">${statusBadge(x.status)}<span>Сайт не изменён</span></div></div><div class="editor-grid"><section class="panel edit-panel"><div class="edit-tabs"><button data-tab="main" class="${STATE.editMode==='main'?'active':''}">Содержание</button><button data-tab="seo" class="${STATE.editMode==='seo'?'active':''}">SEO и соцсети</button><button data-tab="body" class="${STATE.editMode==='body'?'active':''}">Текст статьи</button><button data-tab="images" class="${STATE.editMode==='images'?'active':''}">Изображения</button><button data-tab="blocks" class="${STATE.editMode==='blocks'?'active':''}">Секции и галереи</button><button data-tab="preview" class="${STATE.editMode==='preview'?'active':''}">Предпросмотр</button></div>${readonly?'<div class="warning">Этот материал уже утверждён или опубликован в Directus. Редактирование здесь отключено.</div>':''}${STATE.editMode==='preview'?preview(x):STATE.editMode==='blocks'?blocksEditor(x):`<form id="edit-form">${STATE.editMode==='body'?bodyEditor(x):''}${STATE.editMode==='images'?imagesEditor(x):''}${chosen.map(([key,label,_,max])=>`<label class="edit-label" for="f_${key}">${label}<small>${max} знаков</small></label>${key==='excerpt'||key==='seo_description'?`<textarea id="f_${key}" name="${key}" maxlength="${max}" ${readonly?'disabled':''}>${E(STATE.form[key]??'')}</textarea>`:`<input id="f_${key}" name="${key}" maxlength="${max}" value="${E(STATE.form[key]??'')}" ${readonly?'disabled':''}>`}`).join('')}<div class="edit-action"><span class="action-note">Изменения сохраняются в Directus как черновик.</span><button class="primary" type="submit" ${readonly?'disabled':''}>Сохранить черновик ↗</button></div></form>`}</section><aside class="editor-side"><div class="panel guard"><span class="eyebrow">ЗАЩИТА САЙТА</span><h3>Выпуск по утверждению владельца</h3><p>Черновики не меняют aeroventa.ru. После согласования можно подготовить выпуск в разделе «Публикация».</p><a href="https://aeroventa.ru${E(safePath(x.path))}" target="_blank" rel="noopener noreferrer">Посмотреть действующую страницу ↗</a></div><div class="panel metadata"><h3>Сведения</h3><dl><dt>Адрес</dt><dd>${E(x.path)}</dd><dt>Тип</dt><dd>${E(x.content_type)}</dd><dt>Статус</dt><dd>${E(x.status)}</dd><dt>Утверждение</dt><dd>${x.owner_approved_at?E(formatDate(x.owner_approved_at)):'Не утверждено'}</dd></dl></div></aside></div>`}
function imagesEditor(x){
 const choices=(field)=>{const selected=STATE.form[field]||'';const media=STATE.fileOptions||[];
 const unknown=selected&&!media.some(f=>f.id===selected)?`<option selected value="${E(selected)}">Текущий файл (${E(selected)})</option>`:'';
 return `<option value="">Не выбрано</option>`+unknown+media.map(f=>`<option value="${E(f.id)}" ${selected===f.id?'selected':''}>${E(f.filename_download||f.id)}</option>`).join('');};
 return `<div class="media-editor-intro"><strong>Изображения материала</strong><p>Выбор из существующей медиатеки Directus. Файлы не удаляются; действующий сайт и галереи Astro не изменяются.</p></div><label class="edit-label" for="image-hero_file">Основное изображение</label><select id="image-hero_file" name="hero_file" class="image-select" ${x.status!=='draft'||x.owner_approved_at!==null?'disabled':''}>${choices('hero_file')}</select><label class="edit-label" for="image-og_image">Изображение для соцсетей</label><select id="image-og_image" name="og_image" class="image-select" ${x.status!=='draft'||x.owner_approved_at!==null?'disabled':''}>${choices('og_image')}</select><p class="action-note">Файлы должны быть JPG, PNG, WebP или AVIF. Привязки не меняют изображения на опубликованном Astro-сайте.</p>`;
}
function bodyEditor(x){const disabled=x.status!=='draft'||x.owner_approved_at!==null;const supported=x.body_editor_supported!==false;return `<div class="body-editor-intro"><strong>Основной текст</strong><p>Пишите обычным текстом. Заголовок раздела: <code>## Название</code>, подзаголовок: <code>### Название</code>, список: <code>- Пункт</code>. HTML и сценарии автоматически исключаются на сервере.</p></div>${supported?`<label class="edit-label" for="body_source">Текст и разделы статьи <small>до 60 000 байт</small></label><textarea name="body_source" id="body_source" class="body-textarea" maxlength="60000" ${disabled?'disabled':''}>${E(STATE.form.body_source??'')}</textarea><p class="action-note">Статья сохраняется в Directus. Точный визуальный вид проверяется только в сборке Astro перед выпуском.</p>`:'<p class="warning">Материал содержит ранее подготовленный HTML. Его исходную разметку нельзя безопасно заменить упрощённым редактором. Для такого материала требуется полноценное управление существующим шаблоном Astro.</p>'}`}
// Full editorial sections reuse existing Directus content_blocks and map.
const blockLabel={text:'Текстовая секция',cards:'Карточки',gallery:'Фотогалерея',cta:'Кнопка / действие'};
function mediaSelector(name,selected=''){
 const opts=(STATE.fileOptions||[]).filter(f=>/^image\/(jpeg|png|webp|avif)$/.test(f.type||''));
 const absent=selected&&!opts.some(f=>f.id===selected)?`<option selected value="${E(selected)}">Ранее выбранное изображение</option>`:'';
 return `<select name="${E(name)}" class="image-select"><option value="">Выберите фотографию</option>${absent}${opts.map(f=>`<option value="${E(f.id)}" ${f.id===selected?'selected':''}>${E(f.filename_download||f.id)}</option>`).join('')}</select><img class="cms-media-preview" alt="Предпросмотр выбранной фотографии" ${/^[a-f0-9-]{36}$/i.test(selected)?`src="/index.php?action=media_thumb&amp;id=${E(selected)}"`:'hidden'} />`;
}
function defaultBlock(type){return type==='text'?{heading:'Новый раздел',text:'Описание'}:type==='cta'?{heading:'Следующий шаг',label:'Обсудить проект',href:'/contact/'}:{heading:'Фотографии объекта',items:[type==='cards'?{title:'Название объекта',image:'',href:'/portfolio/',text:''}:{title:'Подпись к фото',image:''}]};}
function blockForm(type,data,readonly){
 const field=(name,label,value,max=240,multi=false)=>`<label class="edit-label">${label}${multi?`<textarea name="${name}" maxlength="${max}" ${readonly?'disabled':''}>${E(value??'')}</textarea>`:`<input name="${name}" maxlength="${max}" value="${E(value??'')}" ${readonly?'disabled':''}>`}</label>`;
 let html=field('heading','Заголовок секции',data.heading||'',240);
 if(type==='text')html+=field('text','Основной текст',data.text||'',8000,true);
 if(type==='cta')html+=field('label','Название кнопки',data.label||'',160)+field('href','Внутренний адрес перехода',data.href||'',320);
 if(['gallery','cards'].includes(type)){
  html+=`<p class="action-note">Фотографии выбираются из Directus. Добавьте нужное число карточек или кадров; порядок можно изменить кнопками выше.</p>`;
  (data.items||[]).forEach((item,i)=>{
   html+=`<div class="cms-media-row" data-item-row="${i}"><strong>${i+1}. ${type==='cards'?'Карточка':'Фотография'}</strong>${field('title','Название / подпись',item.title||'',240)}<label class="edit-label">Фотография ${mediaSelector('image',item.image||'')}</label>${field('alt','Альтернативное описание фото',item.alt||item.title||'',350)}`;
   if(type==='cards')html+=field('href','Ссылка на страницу',item.href||'/',320)+field('text','Описание карточки',item.text||'',1000,true);
   html+=`<button type="button" class="secondary" data-remove-item="${i}" ${readonly?'disabled':''}>Убрать фото / карточку</button></div>`;
  });
  html+=`<button type="button" class="secondary" id="add-block-item" ${readonly?'disabled':''}>Добавить ${type==='cards'?'карточку':'фотографию'} +</button>`;
 }
 return html;
}
function importedFieldRow(field,i,readonly){
 const name=field.kind==='text'?'Текст':field.kind==='alt'?'Описание фотографии':field.kind==='media'?'Фотография':'Ссылка';
 const caption=String(field.baseline||'').slice(0,165);
 const value=field.value||'';
 if(field.kind==='media'){
  const opts=(STATE.fileOptions||[]).filter(f=>/^image\/(jpeg|png|webp|avif)$/.test(f.type||''));
  return `<label class="edit-label dom-field-label" data-dom-field="${i}"><span>${E(name)} · ${E(field.node.split('/').slice(-3).join(' / '))}</span><small>Исходник: ${E(caption)}</small><select data-dom-value="${i}" class="dom-file-choice" ${readonly?'disabled':''}><option value="${E(value)}">${E(value===field.baseline?'Оставить принятую фотографию':'Текущее выбранное фото')}</option>${opts.map(f=>`<option value="${E(f.id)}">${E(f.filename_download||f.id)}</option>`).join('')}</select></label>`;
 }
 const textarea=field.kind==='text';
 const limit=field.kind==='text'?24000:field.kind==='alt'?350:2048;
 const lengthNote=field.kind==='text'?'Длинный текст поддерживается; пустое значение очищает необязательный фрагмент.':'';
 return `<label class="edit-label dom-field-label" data-dom-field="${i}"><span>${E(name)} · ${E(field.node.split('/').slice(-3).join(' / '))}</span><small>Исходное: ${E(caption)}</small><small>${lengthNote}</small>${textarea?`<textarea data-dom-value="${i}" maxlength="${limit}" rows="5" ${readonly?'disabled':''}>${E(value)}</textarea>`:`<input data-dom-value="${i}" maxlength="${limit}" value="${E(value)}" ${readonly?'disabled':''}/>`}</label>`;
}
function importedBlockRow(map,readonly){
 const b=map.block_id||{},data=b.data||{},list=data.fields||[];
 return `<details class="cms-imported-block" data-dom-map="${E(map.id)}"><summary><strong>Исходное содержание · ${list.length} элементов</strong><span>${b.fact_checked?'Исходные факты подтверждены':'Изменения требуют проверки'}</span></summary><div class="cms-imported-fields">${list.map((field,i)=>importedFieldRow(field,i,readonly)).join('')}</div><div class="edit-action"><span class="action-note">Меняется только выбранный элемент исходного Astro, не структура страницы.</span><button class="primary" type="button" data-save-dom="${E(map.id)}" ${readonly?'disabled':''}>Сохранить изменения ↗</button><button class="secondary" type="button" data-approve-block="${E(map.id)}" ${readonly||b.fact_checked?'disabled':''}>Факты проверены</button></div></details>`;
}
function blocksEditor(x){
 const readonly=x.status!=='draft'||x.owner_approved_at!==null;
 const rows=(STATE.blocks||[]);
 const kind=STATE.blockDraft?.type||STATE.blockType;
 let html=`<div class="cms-blocks"><div class="body-editor-intro"><strong>Редактируемые секции страницы</strong><p>Это реальные блоки Directus, выводимые существующими Astro-шаблонами. Публичный сайт меняется только после отдельного утверждённого выпуска.</p></div>`;
 html+=rows.map((m,i)=>{const b=m.block_id||{};if(b.block_type==='dom_fields')return importedBlockRow(m,readonly);return `<div class="cms-block-row"><div><span class="eyebrow">${E(blockLabel[b.block_type]||b.block_type)} · ${i+1}</span><strong>${E(b.data?.heading||b.data?.label||b.data?.items?.[0]?.title||'Секция')}</strong><small>${b.fact_checked?'Факты проверены':'Требуется проверка фактов'}</small></div><div class="cms-block-actions"><button type="button" data-edit-block="${m.id}" ${readonly?'disabled':''}>Изменить</button><button type="button" data-move-block="${m.id}" data-direction="up" ${readonly||i===0?'disabled':''} title="Выше">↑</button><button type="button" data-move-block="${m.id}" data-direction="down" ${readonly||i===rows.length-1?'disabled':''} title="Ниже">↓</button><button type="button" data-approve-block="${m.id}" ${readonly||b.fact_checked?'disabled':''}>Проверено</button><button type="button" data-remove-block="${m.id}" ${readonly?'disabled':''}>Убрать</button></div></div>`}).join('');
 if(!readonly){
  html+=`<div class="cms-block-builder"><h3>${STATE.blockEditing?'Редактирование секции':'Добавить секцию'}</h3><label class="edit-label">Тип секции <select id="block-type" ${STATE.blockEditing?'disabled':''}>${Object.entries(blockLabel).map(([k,v])=>`<option value="${k}" ${kind===k?'selected':''}>${v}</option>`).join('')}</select></label><form id="block-form">${blockForm(kind,STATE.blockDraft?.data||defaultBlock(kind),false)}<div class="edit-action"><span class="action-note">Данные сохраняются в черновике Directus</span><button class="primary" type="submit">${STATE.blockEditing?'Сохранить секцию':'Добавить секцию'} ↗</button><button type="button" class="secondary" id="cancel-block-edit">Сбросить</button></div></form></div>`;
 }
 html+='</div>';return html;
}
async function loadBlocks(){if(STATE.active!=='editor'||STATE.editMode!=='blocks'||!STATE.selected)return;try{const r=await api('blocks',{query:{id:STATE.selected}});STATE.blocks=r.blocks||[];render();}catch(e){notify('Секции: '+e.message,'error');}}
function collectBlock(){
 const form=document.querySelector('#block-form');if(!form)return null;
 const kind=STATE.blockDraft?.type||STATE.blockType;
 const data={heading:form.querySelector('[name="heading"]')?.value.trim()||''};
 if(kind==='text')data.text=form.querySelector('[name="text"]')?.value||'';
 if(kind==='cta'){data.label=form.querySelector('[name="label"]')?.value.trim()||'';data.href=form.querySelector('[name="href"]')?.value.trim()||'';}
 if(['cards','gallery'].includes(kind))data.items=[...form.querySelectorAll('[data-item-row]')].map(row=>{
  const get=n=>row.querySelector('[name="'+n+'"]')?.value.trim()||'';
  const item={title:get('title'),image:get('image'),alt:get('alt')||get('title')};
  if(kind==='cards'){item.href=get('href');item.text=get('text');}
  return item;
 });
 return {type:kind,data};
}
async function blockAction(action,payload){if(STATE.blockBusy)return;STATE.blockBusy=true;try{const r=await api(action,{post:{content_id:STATE.selected,...payload}});STATE.blockEditing=null;STATE.blockDraft=null;await loadBlocks();notify(r.message||'Изменения сохранены');}catch(e){notify(e.message,'error');}finally{STATE.blockBusy=false;}}
function bindBlocks(){
 document.querySelectorAll('#block-form .image-select').forEach(el=>el.addEventListener('change',()=>{const img=el.nextElementSibling;if(!img)return;const id=el.value;img.hidden=!/^[a-f0-9-]{36}$/i.test(id);if(!img.hidden)img.src='/index.php?action=media_thumb&id='+encodeURIComponent(id);}));
 document.querySelector('#block-type')?.addEventListener('change',e=>{STATE.blockType=e.target.value;STATE.blockEditing=null;STATE.blockDraft={type:STATE.blockType,data:defaultBlock(STATE.blockType)};render();});
 document.querySelector('#cancel-block-edit')?.addEventListener('click',()=>{STATE.blockEditing=null;STATE.blockDraft=null;render();});
 document.querySelectorAll('[data-edit-block]').forEach(btn=>btn.addEventListener('click',()=>{const m=STATE.blocks.find(x=>String(x.id)===btn.dataset.editBlock);if(!m)return;STATE.blockEditing=m.id;STATE.blockDraft={type:m.block_id.block_type,data:structuredClone(m.block_id.data||{})};render();}));
 document.querySelectorAll('[data-remove-block]').forEach(btn=>btn.addEventListener('click',()=>{if(confirm('Отвязать секцию от черновика? Исходный блок остаётся в Directus.'))blockAction('block_remove',{map_id:Number(btn.dataset.removeBlock),owner_confirmation:'ОТВЯЗАТЬ СЕКЦИЮ'});}));
 document.querySelectorAll('[data-approve-block]').forEach(btn=>btn.addEventListener('click',()=>{if(confirm('Вы лично проверили все факты, ссылки и фотографии этой секции?'))blockAction('block_approve',{map_id:Number(btn.dataset.approveBlock),owner_confirmation:'ФАКТЫ ПРОВЕРЕНЫ'});}));
 document.querySelectorAll('[data-move-block]').forEach(btn=>btn.addEventListener('click',()=>blockAction('block_move',{map_id:Number(btn.dataset.moveBlock),direction:btn.dataset.direction})));
 document.querySelector('#add-block-item')?.addEventListener('click',()=>{const v=collectBlock();if(!v)return;v.data.items.push(v.type==='cards'?{title:'Новая карточка',image:'',href:'/portfolio/',text:''}:{title:'Новая фотография',image:''});STATE.blockDraft=v;render();});
 document.querySelectorAll('[data-remove-item]').forEach(btn=>btn.addEventListener('click',()=>{const v=collectBlock();if(!v||v.data.items.length<=1)return notify('В секции нужна хотя бы одна карточка или фотография','error');v.data.items.splice(Number(btn.dataset.removeItem),1);STATE.blockDraft=v;render();}));
 document.querySelectorAll('[data-save-dom]').forEach(btn=>btn.addEventListener('click',async()=>{
  const m=STATE.blocks.find(row=>String(row.id)===btn.dataset.saveDom);if(!m)return;
  const holder=btn.closest('[data-dom-map]');if(!holder)return;
  const before=m.block_id?.data||{};const data=structuredClone(before);
  for(const node of holder.querySelectorAll('[data-dom-value]')){
   const i=Number(node.dataset.domValue);if(!data.fields?.[i])return notify('Не найден исходный элемент','error');
   data.fields[i].value=node.value;
  }
  if(JSON.stringify(data)===JSON.stringify(before))return notify('Изменений нет');
  if(!confirm('Сохранить только изменённые поля в черновик Directus? Действующий сайт не изменится.'))return;
  await blockAction('block_update',{map_id:Number(m.id),data,before});
 }));
 document.querySelector('#block-form')?.addEventListener('submit',ev=>{ev.preventDefault();const v=collectBlock();if(!v)return;const payload=STATE.blockEditing?{map_id:Number(STATE.blockEditing),data:v.data,before:STATE.blocks.find(m=>Number(m.id)===Number(STATE.blockEditing))?.block_id?.data}:{block_type:v.type,data:v.data};blockAction(STATE.blockEditing?'block_update':'block_add',payload);});
}
function newArticle(){return topbar('Новая статья','Создать только черновик в Directus, без изменения работающего сайта.')+`<div class="panel creation-panel"><h2>Новая статья</h2><p>Статья появится в разделе «Материалы». Адрес в Astro будет создан только после отдельной проверки и выпуска.</p><form id="new-article-form"><label>Название статьи<input name="title" required maxlength="240" minlength="5" placeholder="Например: Как подготовить проект вентиляции"></label><label>Адрес латиницей, без пробелов<input name="slug" required minlength="3" maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="kak-podgotovit-proekt"></label><div class="path-preview">Адрес черновика: /blog/detail/<strong id="article-slug-preview">...</strong>/</div><div class="creation-actions"><button type="submit" class="primary">Создать черновик ↗</button><button type="button" class="secondary" data-nav="content">Отмена</button></div><p class="create-error" role="alert"></p></form></div>`}
function sections(){return topbar('Разделы','Категории материалов из Directus. Созданные разделы не появляются в меню действующего сайта.')+`<div class="panel sections-panel"><div class="panel-title"><h3>Существующие разделы</h3><button type="button" id="refresh-sections" class="link">Обновить ↻</button><button class="primary" type="button" data-create-category="1">Новый раздел ↗</button></div><div id="categories-list" class="category-list">Загрузка разделов…</div></div>${STATE.showCreateCategory?`<section class="panel category-create"><h3>Создать раздел блога</h3><form id="new-category-form"><div class="category-fields"><label>Название<input name="name" minlength="3" maxlength="160" placeholder="Например: Инженерные решения" required></label><label>Адрес латиницей<input name="slug" maxlength="60" minlength="3" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="inzhenernye-resheniya" required></label></div><p class="action-note">Создаётся как черновик /blog/адрес/. Это не меняет навигацию и URL действующего сайта.</p><button class="primary" type="submit">Создать черновик раздела ↗</button><p class="create-error" role="alert"></p></form></section>`:''}`}
async function loadCategories(){const e=document.querySelector('#categories-list');if(!e)return;try{const o=await api('categories');STATE.categories=o.items||[];e.innerHTML=STATE.categories.map(x=>`<div class="category-row"><strong>${E(x.name)}</strong><span>${E(x.path)}</span><small>${x.status==='draft'?'Черновик':E(x.status||'Неизвестно')}</small></div>`).join('')||'<p>Разделы ещё не созданы</p>';}catch(err){e.textContent=err.message}}
async function loadImageOptions(){const ss=[...document.querySelectorAll('.image-select')];if(!ss.length)return;try{const o=await api('media');const files=(o.items||[]).filter(x=>/^image\/(jpeg|png|webp|avif)$/i.test(x.type||''));STATE.fileOptions=files;for(const node of ss){const key=node.name,sel=key==='image'?node.value:(STATE.form[key]||'');node.innerHTML='<option value="">Не выбрано</option>'+ (sel&&!files.some(f=>f.id===sel)?`<option value="${E(sel)}">Текущий файл (${E(sel)})</option>`:'')+files.map(f=>`<option value="${E(f.id)}">${E(f.filename_download||f.id)}</option>`).join('');node.value=sel;}
  for(const field of document.querySelectorAll('.dom-file-choice')){const current=field.value;field.innerHTML=`<option value=\"${E(current)}\">Текущее изображение</option>`+files.map(f=>`<option value=\"${E(f.id)}\">${E(f.filename_download||f.id)}</option>`).join('');field.value=current;}
 }catch(err){notify('Не удалось загрузить изображения: '+err.message,'error')}}
async function createRecord(ev,action){ev.preventDefault();const form=ev.currentTarget;if(!form.reportValidity())return;const button=form.querySelector('button[type="submit"]');const error=form.querySelector('.create-error');button.disabled=true;error.textContent='';try{const data=Object.fromEntries(new FormData(form));const r=await api(action,{post:data});if(action==='create_article'){await loadData();if(r.id && byId(r.id)){STATE.selected=r.id;const x=byId(r.id);STATE.original=JSON.parse(JSON.stringify(x));STATE.form=Object.fromEntries(fields.map(([k])=>[k,String(x[k]??'')]));STATE.form.body_source=x.body_source||'';STATE.form.hero_file=x.hero_file||'';STATE.form.og_image=x.og_image||'';STATE.active='editor';STATE.editMode='main';}else{STATE.active='content'}}else {STATE.showCreateCategory=false;await loadCategories();}render();notify(r.message||'Черновик создан');}catch(ex){error.textContent=ex.message;}finally{button.disabled=false;}}
function preview(x){return `<div class="preview"><span class="preview-mark">ПРЕДПРОСМОТР ДАННЫХ · НЕ ПУБЛИКОВАТЬ</span><div class="preview-browser"><span>◦ ◦ ◦</span><span>aeroventa.ru${E(safePath(x.path))}</span></div><div class="preview-body"><small>AEROVENTA / МАТЕРИАЛ</small><h2>${E(STATE.form.h1||'Без заголовка')}</h2><p>${E(STATE.form.excerpt||'Описание отсутствует')}</p></div></div><p class="preview-footnote">Это проверка текста, а не точный макет страницы. Полный HTML и фотографии остаются в существующем Astro.</p>`}
function media(){return topbar('Медиатека','Фотографии сохраняются в Directus. На опубликованный сайт попадают только после проверенной Astro-сборки.')+`<div class="panel"><div class="panel-title"><h3>Загруженные файлы</h3><button class="link" id="refresh-media">Обновить ↻</button></div><form id="upload-image-form" class="upload-image-form"><label>Загрузить фотографию в Directus (до 12 МБ)<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/avif" required></label><button type="submit" class="secondary">Загрузить изображение ↗</button><p role="alert" class="upload-error"></p></form><div id="media-content" class="media-list">Загрузка списка…</div></div>`}
async function uploadImage(ev){ev.preventDefault();const form=ev.currentTarget;const file=form.querySelector('input[name="image"]')?.files?.[0];const err=form.querySelector('.upload-error');if(!file||file.size>12*1024*1024){err.textContent='Выберите JPG, PNG, WebP или AVIF не более 12 МБ';return;}const btn=form.querySelector('button');btn.disabled=true;err.textContent='';try{const fd=new FormData();fd.append('image',file);const r=await fetch('/index.php?action=upload_image',{method:'POST',headers:{'X-CSRF-Token':STATE.session?.csrf||''},body:fd,credentials:'same-origin'});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Directus не принял фото');form.reset();await loadMedia();notify(data.message||'Фотография загружена');}catch(e){err.textContent=e.message}finally{btn.disabled=false}}

function releases(){
 const ready=STATE.publisher?.configured===true;
 const records=STATE.items.filter(x=>x.status==='draft'||(x.status==='published'&&x.owner_approved_at));
 const selected=STATE.releaseId||records[0]?.id||'';
 const opts=records.map(x=>`<option value="${E(x.id)}" ${selected===x.id?'selected':''}>${E(x.title||x.path)} · ${x.status==='draft'?'Черновик':'Утверждён в Directus'}</option>`).join('');
 const info=ready?`<div class="publisher-controls"><label class="edit-label" for="release-item">Материал для выпуска</label><select id="release-item" class="release-select">${opts}</select><div class="release-actions"><button class="secondary" data-release-action="owner_approve" ${!selected?'disabled':''}>1. Утвердить ↗</button><button class="secondary" data-release-action="prepare_release" ${!selected?'disabled':''}>2. Проверить сборку ↗</button><button class="primary" data-release-action="publish_release" ${!selected?'disabled':''}>3. Выпустить на сайт ↗</button></div><p class="action-note">Публикация использует только неизменяемый артефакт успешно завершённого предпросмотра. После проверки результата перейдите к выпуску, который дополнительно требует подтверждения GitHub Environment.</p><label class="edit-label" for="preview-run-id">Номер проверочной сборки GitHub (если не определён автоматически)</label><input id="preview-run-id" inputmode="numeric" pattern="[0-9]*" placeholder="Номер запуска из ссылки GitHub Actions" value="${E(STATE.previewRunId||'')}" /><button type="button" class="secondary" id="release-refresh-status">Проверить результат последнего выпуска ↻</button><button type="button" class="secondary" id="open-reviewed-preview">Открыть настоящий Astro-предпросмотр ↗</button><div class="action-note" id="release-run-status" role="status">${STATE.releaseRun?E(STATE.releaseRun):'Запуск ещё не проверен.'}</div><a id="release-run-link" target="_blank" rel="noopener noreferrer" hidden>Журнал последнего выпуска ↗</a><a class="publisher-link" target="_blank" rel="noopener noreferrer" href="https://github.com/XandXander/aeroventa/actions/workflows/pr12-cms-live-publish.yml">Открыть сборки и журнал отката в GitHub ↗</a></div>`:'<p>Для публикации ещё не подключён защищённый доступ к GitHub Actions и отдельный FTP-аккаунт Beget. Действующий сайт не меняется. После однократной безопасной настройки здесь появятся действия утверждения, предпросмотра и выпуска.</p>';
 return topbar('Публикация','Утверждение, проверка и выпуск материалов на действующий сайт.')+`<section class="panel locked-screen publisher-screen"><span class="locked-icon">◇</span><p class="eyebrow">${ready?'КОНТРОЛИРУЕМЫЙ ВЫПУСК':'ПУБЛИКАЦИЯ НЕ АКТИВИРОВАНА'}</p><h2>${ready?'Выпуск под контролем владельца.':'Действующий сайт защищён.'}</h2>${info}</section>`;
}
async function loadMedia(){const node=document.querySelector('#media-content');if(!node)return;node.textContent='Загрузка…';try{let data=await api('media');const items=data.items||[];node.innerHTML=items.length?items.map(x=>`<div class="file-row"><span class="file-icon">▧</span><span><strong>${E(x.filename_download||x.id)}</strong><small>${E(x.type||'Файл')} · ${Math.max(0,Math.round((Number(x.filesize)||0)/1024))} КБ</small></span></div>`).join(''):'Файлов пока нет.';}catch(e){node.textContent=e.message;}}
function baseline(){return topbar('Перенос принятого сайта','Один защищённый перенос существующих страниц Astro в черновики Directus, без публикации.')+
 `<section class="panel baseline-screen"><p class="eyebrow">ИСХОДНЫЙ САЙТ — ЭТАЛОН</p><h2>Перенести существующее содержимое, не создавать его заново.</h2><p>49 канонических страниц · 2342 связуемых поля. Переносятся оригинальные тексты, ссылки, фотографии и подписи в существующие коллекции Directus. Ручные правки черновиков сохраняются. Исторический алиас не импортируется как новая страница.</p><p>Публичный сайт, работающие формы, консультант и FTP не меняются.</p><div class="baseline-progress" role="status">${STATE.baselineRunning?'Обработка страниц: '+STATE.baselineDone+' / 49':STATE.baselineDone?'Проверено в текущем сеансе: '+STATE.baselineDone+' / 49':'Состояние переноса определяется проверкой Directus, а не счётчиком браузера.'}</div><button class="secondary" type="button" id="baseline-verify" ${STATE.baselineVerifyBusy?'disabled':''}>${STATE.baselineVerifyBusy?'Проверка связей Directus…':'Проверить полноту переноса без изменений ↗'}</button><div class="action-note" role="status">${STATE.baselineVerify ? (STATE.baselineVerify.complete?'Перенос подтверждён: '+STATE.baselineVerify.verified_pages+' / 49 страниц, '+STATE.baselineVerify.verified_fields+' / 2342 полей. Ручных редакций сохранено: '+STATE.baselineVerify.preserved_editor_changes+'. Повторный перенос не требуется.':'Перенос требует проверки: '+STATE.baselineVerify.verified_pages+' / 49 страниц, '+STATE.baselineVerify.verified_fields+' / 2342 полей. '+(STATE.baselineVerify.issues||[]).join('; ')) : 'Данные Directus не изменяются при проверке.'}</div><button class="secondary" type="button" id="baseline-export" ${STATE.baselineExportBusy?'disabled':''}>${STATE.baselineExportBusy?'Подготовка копии…':'Скачать резервную копию Directus ↗'}</button><button class="primary" type="button" id="baseline-run" ${(STATE.baselineRunning||!STATE.baselineBackupReady||STATE.baselineVerify?.complete)?'disabled':''}>${STATE.baselineRunning?'Перенос выполняется…':'Перенести принятый сайт в Directus ↗'}</button><p class="action-note">${STATE.baselineBackupReady?'Экспорт получен. Убедитесь, что файл сохранился, прежде чем запускать перенос.':'Перед переносом скачайте резервную копию Directus.'} Повторный запуск переноса сохраняет черновики.</p></section>`;}
async function verifyAcceptedBaseline(){
 if(STATE.baselineVerifyBusy||STATE.baselineRunning)return;
 STATE.baselineVerifyBusy=true;render();
 try{
  const result=await api('baseline_verify');
  STATE.baselineVerify=result;
  if(result.complete)notify('Проверка пройдена. 49 страниц и 2342 поля на месте. Публичный сайт не изменён.');
  else notify('Обнаружены несоответствия переноса. Ничего не исправлялось автоматически.','error');
 }catch(e){notify('Проверка Directus: '+e.message,'error')}
 finally{STATE.baselineVerifyBusy=false;render();}
}
async function exportAcceptedBaseline(){
 if(STATE.baselineExportBusy||STATE.baselineRunning)return;
 STATE.baselineExportBusy=true;STATE.baselineBackupReady=false;render();
 try{
  // Same authenticated, same-origin request path as the working Directus
  // dashboard. Never let Chrome download a 401 JSON error as index.json.
  const response=await fetch('/index.php?action=baseline_export',{
   method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',
   headers:{'Accept':'application/json','X-CSRF-Token':STATE.session?.csrf||''}
  });
  if(!response.ok){
   const failure=await response.json().catch(()=>({}));
   if(response.status===401){
    STATE.session={authenticated:false,csrf:STATE.session?.csrf};
    throw Error('Сессия на сервере недействительна. Войдите в редактор заново.');
   }
   throw Error((failure.error||'Сервер отказал в экспорте')+' (HTTP '+response.status+')');
  }
  if(!(response.headers.get('Content-Type')||'').toLowerCase().includes('application/json'))
   throw Error('Сервер вернул не JSON: резервная копия отклонена');
  const filename=/filename="(AEROVENTA_DIRECTUS_BEFORE_IMPORT_[0-9_]+\.json)"/i.exec(
    response.headers.get('Content-Disposition')||'')?.[1];
  if(!filename)throw Error('Сервер не подтвердил имя резервной копии');
  const expected=(response.headers.get('X-Content-SHA256')||'').toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(expected))throw Error('Сервер не предоставил контрольную сумму SHA-256');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength<100||bytes.byteLength>12000000)throw Error('Недопустимый размер резервной копии');
  const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==expected)throw Error('Резервная копия повреждена: SHA-256 не совпал');
  const backup=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(backup.format!=='AEROVENTA_DIRECTUS_EDITORIAL_SNAPSHOT_V1'||
     !backup.read_only||!backup.counts||!Array.isArray(backup.data?.content)||
     backup.counts.content!==backup.data.content.length)
    throw Error('Некорректный формат данных Directus');
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/json'}));
  try{
   const link=document.createElement('a');link.href=url;link.download=filename;
   document.body.appendChild(link);link.click();link.remove();
  }finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}
  STATE.baselineBackupReady=true;
  notify('Резервная копия проверена: '+backup.counts.content+' материалов Directus. Проверьте файл в загрузках Chrome.');
 }catch(e){
  STATE.baselineBackupReady=false;
  notify('Экспорт НЕ выполнен: '+e.message,'error');
 }finally{STATE.baselineExportBusy=false;render();}
}
async function importAcceptedBaseline(){
 if(!STATE.baselineBackupReady)return notify('Сначала скачайте и сохраните резервную копию Directus','error');
 if(STATE.baselineRunning)return;
 if(!confirm('Перенести принятое содержание 49 страниц в черновики Directus? Существующие редакции не будут перезаписаны. Публичный сайт не изменится.'))return;
 STATE.baselineRunning=true;STATE.baselineResult=[];STATE.baselineDone=0;render();
 try{
  const info=await api('baseline_status');if(!info.available||info.pages!==49)throw Error('Неверная версия исходного реестра');
  for(let i=0;i<info.pages;i++){
   const res=await api('baseline_import_page',{post:{index:i,owner_confirmation:'ПЕРЕНЕСТИ ПРИНЯТЫЙ САЙТ В ЧЕРНОВИКИ'}});
   STATE.baselineResult.push(res);STATE.baselineDone=i+1;
   document.querySelector('.baseline-progress').textContent=`Перенесено ${i+1} из ${info.pages} страниц · создано секций ${STATE.baselineResult.reduce((n,r)=>n+r.new_blocks,0)}`;
  }
  await loadData();notify('Принятое содержание перенесено в Directus. Страницы остались черновиками.');
 }catch(e){notify('Перенос остановлен на странице '+(STATE.baselineDone+1)+': '+e.message+'. Повторный запуск продолжит без перезаписи.','error');}
 finally{STATE.baselineRunning=false;render();}
}
function render(){if(!STATE.session?.authenticated){renderLogin();return;}let content='';if(STATE.active==='overview')content=overview();if(STATE.active==='content')content=contents();if(STATE.active==='sections')content=sections();if(STATE.active==='newArticle')content=newArticle();if(STATE.active==='editor')content=editor();if(STATE.active==='media')content=media();if(STATE.active==='releases')content=releases();if(STATE.active==='baseline')content=baseline();app.innerHTML=`<div class="workspace">${sidebar()}<main class="main">${topHeaderPlaceholder()}<div class="main-content">${content}</div><div class="notice-live" role="status" data-kind="${STATE.error?'error':'notice'}">${E(STATE.error||STATE.notice)}</div></main></div>`;bind();if(STATE.active==='media')loadMedia();if(STATE.active==='sections')loadCategories();if(STATE.active==='editor'&&['images','blocks'].includes(STATE.editMode))loadImageOptions();}
function topHeaderPlaceholder(){return ''}
function bind(){
 document.querySelector('#baseline-verify')?.addEventListener('click',verifyAcceptedBaseline);
 document.querySelector('#baseline-export')?.addEventListener('click',exportAcceptedBaseline);
 document.querySelector('#baseline-run')?.addEventListener('click',importAcceptedBaseline);
 document.querySelector('#new-article-form')?.addEventListener('submit',e=>createRecord(e,'create_article'));
 bindBlocks();
 document.querySelector('#release-item')?.addEventListener('change',e=>{STATE.releaseId=e.target.value;});
 document.querySelector('#release-refresh-status')?.addEventListener('click',refreshReleaseStatus);
 document.querySelector('#open-reviewed-preview')?.addEventListener('click',()=>{
  const id=document.querySelector('#release-item')?.value||STATE.releaseId;
  const run=String(document.querySelector('#preview-run-id')?.value||STATE.previewRunId||'').trim();
  if(!id||!/^[1-9][0-9]{5,14}$/.test(run))return notify('Сначала дождитесь успешной проверочной сборки и укажите её номер','error');
  window.open('/index.php?action=reviewed_preview&run_id='+encodeURIComponent(run)+'&id='+encodeURIComponent(id),'_blank','noopener,noreferrer');
 });
 document.querySelectorAll('[data-release-action]').forEach(el=>el.addEventListener('click',runReleaseAction));
 document.querySelector('#new-category-form')?.addEventListener('submit',e=>createRecord(e,'create_category'));
 document.querySelector('#upload-image-form')?.addEventListener('submit',uploadImage);
 document.querySelector('#refresh-sections')?.addEventListener('click',loadCategories);document.querySelector('[data-create-category]')?.addEventListener('click',()=>{STATE.showCreateCategory=!STATE.showCreateCategory;render();});
 document.querySelector('#new-article-form input[name="slug"]')?.addEventListener('input',e=>{document.querySelector('#article-slug-preview').textContent=e.target.value||'...';});
 document.querySelectorAll('[data-show]').forEach(el=>el.addEventListener('click',()=>{STATE.filter='';STATE.statusFilter=el.dataset.show;STATE.page=1;STATE.active='content';render();window.scrollTo(0,0)}));
 const messages={2:'Сборка запускается в разделе «Публикация» после утверждения материала и настройки GitHub.',3:'Утверждение выполняет владелец в разделе «Публикация».',4:'Выпуск требует защищённого доступа к GitHub, ограниченного FTPS Beget и отдельного разрешения владельца.'};
 document.querySelectorAll('[data-stage]').forEach(el=>el.addEventListener('click',()=>{const step=el.dataset.stage;STATE.active='releases';render();notify(messages[step]||'Этап ещё не подключён');window.scrollTo(0,0)}));
 document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>{STATE.page=Math.max(1,STATE.page+(el.dataset.page==='next'?1:-1));render();window.scrollTo(0,0)}));
 document.querySelector('#status-filter')?.addEventListener('change',ev=>{STATE.statusFilter=ev.target.value;STATE.page=1;render();window.scrollTo(0,0)});
 document.querySelectorAll('[data-nav]').forEach(el=>el.addEventListener('click',()=>{if(STATE.dirty&&!confirm('Есть несохранённые изменения. Покинуть страницу?'))return;STATE.active=el.dataset.nav;if(STATE.active==='content'){STATE.statusFilter='all';STATE.page=1;STATE.filter=''}STATE.selected=null;STATE.dirty=false;STATE.error='';render();window.scrollTo(0,0)}));document.querySelectorAll('[data-open]').forEach(el=>el.addEventListener('click',()=>{STATE.selected=el.dataset.open;let x=byId(STATE.selected);STATE.original=JSON.parse(JSON.stringify(x));STATE.form=Object.fromEntries(fields.map(([key])=>[key,String(x?.[key]??'')]));STATE.form.body_source=x?.body_source||'';STATE.form.hero_file=x?.hero_file||'';STATE.form.og_image=x?.og_image||'';STATE.active='editor';STATE.editMode='main';STATE.blocks=[];STATE.blockEditing=null;STATE.blockDraft=null;STATE.dirty=false;render();window.scrollTo(0,0)}));document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>{collectForm();STATE.editMode=el.dataset.tab;render();if(STATE.editMode==='blocks')loadBlocks();}));document.querySelector('#signout')?.addEventListener('click',async()=>{try{await api('logout',{post:{}});}catch{}STATE.session={authenticated:false};renderLogin()});document.querySelector('#search')?.addEventListener('input',ev=>{STATE.filter=ev.target.value;STATE.page=1;const sel=ev.target.selectionStart;render();const fresh=document.querySelector('#search');fresh?.focus();fresh?.setSelectionRange(sel,sel)});document.querySelector('#refresh-media')?.addEventListener('click',loadMedia);document.querySelectorAll('#edit-form input,#edit-form textarea,#edit-form select').forEach(el=>el.addEventListener('input',()=>{STATE.form[el.name]=el.value;STATE.dirty=true}));document.querySelector('#edit-form')?.addEventListener('submit',saveDraft);}
function collectForm(){document.querySelectorAll('#edit-form input,#edit-form textarea,#edit-form select').forEach(el=>STATE.form[el.name]=el.value)}
async function saveDraft(ev){ev.preventDefault();collectForm();let x=byId(STATE.selected);if(!x||STATE.saving)return;let changes={};for(const [key] of fields){if((STATE.form[key]??'')!==(String(STATE.original[key]??'')))changes[key]=STATE.form[key]??'';}if(STATE.form.body_source!==undefined && STATE.form.body_source!==(STATE.original.body_source||''))changes.body_source=STATE.form.body_source;for(const key of ['hero_file','og_image']){if((STATE.form[key]||'')!==(STATE.original[key]||''))changes[key]=STATE.form[key]||null;}
if(!Object.keys(changes).length){notify('Изменений нет');return;}if(!confirm('Сохранить '+Object.keys(changes).length+' полей только в черновике Directus? Действующий сайт не изменится.'))return;STATE.saving=true;try{const payload={id:x.id,before:STATE.original,changes};const res=await api('save',{post:payload});await loadData();STATE.original=JSON.parse(JSON.stringify(byId(x.id)));STATE.form=Object.fromEntries(fields.map(([key])=>[key,String(STATE.original?.[key]??'')]));STATE.form.body_source=STATE.original?.body_source||'';STATE.form.hero_file=STATE.original?.hero_file||'';STATE.form.og_image=STATE.original?.og_image||'';STATE.dirty=false;render();notify(res.message);}catch(e){notify(e.message,'error')}finally{STATE.saving=false}}

async function refreshReleaseStatus(){
 const display=document.querySelector('#release-run-status');
 if(display)display.textContent='Проверка выполнения в GitHub…';
 try{
   const r=await api('release_status');
   const outcome=r.status==='completed'?(r.conclusion==='success'?(r.requested_live?'Публикация подтверждена GitHub. Проверьте действующую страницу.':'Проверочная сборка завершена. Сайт не изменён.'):('Выпуск завершился: '+(r.conclusion||'неизвестно'))):('Статус '+(r.status||'неизвестен')+', выпуск ещё выполняется');
   STATE.releaseRun=outcome+(r.workflow_url?' · '+r.workflow_url:'');
   if(r.preview_ready && r.preview_run_id){STATE.previewRunId=String(r.preview_run_id);STATE.previewReady=true;}
   if(r.requested_live && r.status==='completed'){STATE.previewReady=false;}
   if(display)display.textContent=outcome;
   if(r.workflow_url){const link=document.querySelector('#release-run-link');if(link){link.href=r.workflow_url;link.hidden=false;}}
 }catch(e){STATE.releaseRun='Не удалось проверить результат: '+e.message;if(display)display.textContent=STATE.releaseRun;}
}
async function runReleaseAction(ev){
 const btn=ev.currentTarget,action=btn.dataset.releaseAction,id=document.querySelector('#release-item')?.value||STATE.releaseId;
 if(!id)return notify('Выберите материал','error');
 const row=byId(id);if(!row)return notify('Материал не найден','error');
 let confirmation='';
 if(action==='owner_approve'){
  confirmation=prompt('Утверждение разрешит подготовку публичной версии. Напишите точно: УТВЕРЖДАЮ ПУБЛИКАЦИЮ МАТЕРИАЛА')||'';
  if(confirmation!=='УТВЕРЖДАЮ ПУБЛИКАЦИЮ МАТЕРИАЛА')return;
 }else if(action==='publish_release'){
  if(!STATE.previewReady&&!document.querySelector('#preview-run-id')?.value?.trim())return notify('Сначала проверьте успешную сборку и её номер в GitHub Actions','error');
  confirmation=prompt('Проверьте точный предпросмотр и состав изменения. Для фактического выпуска введите: ПРОВЕРИЛ ПРЕДПРОСМОТР И ПОДТВЕРЖДАЮ')||'';
  if(confirmation!=='ПРОВЕРИЛ ПРЕДПРОСМОТР И ПОДТВЕРЖДАЮ')return;
 }else if(!confirm('Запустить проверочную Astro-сборку без изменения действующего сайта?'))return;
 btn.disabled=true;
 try{
  const previewRun=(document.querySelector('#preview-run-id')?.value||STATE.previewRunId||'').trim();
  const r=await api(action,{post:{id,owner_confirmation:confirmation,preview_run_id:previewRun}});
  if(action==='prepare_release'){STATE.previewReady=false;STATE.previewRunId=r.preview_run_id?String(r.preview_run_id):'';}
  await loadData();STATE.releaseId=id;STATE.releaseRun='Запрос принят GitHub. Это ещё не подтверждение выпуска.';render();notify(r.message||'Запрос принят');
  if(r.workflow)window.open(r.workflow,'_blank','noopener,noreferrer');
 }catch(e){notify(e.message,'error');}finally{btn.disabled=false;}
}
async function bootstrap(){try{STATE.session=await api('session');if(STATE.session.authenticated){await loadData();render();}else{renderLogin();}}catch(e){app.textContent='Ошибка запуска редактора: '+e.message}}
bootstrap();