/* AEROVENTA private project transfer: progressive 75 MiB, resumable in tab. */
(() => {
  'use strict';
  const form = document.querySelector('[data-project-form]');
  if (!(form instanceof HTMLFormElement)) return;
  const input = form.querySelector('[data-project-files]');
  const submit = form.querySelector('[data-project-submit]');
  const status = form.querySelector('[data-project-status]');
  const summary = form.querySelector('[data-project-file-summary]');
  if (!(input instanceof HTMLInputElement) || !(submit instanceof HTMLButtonElement) || !(status instanceof HTMLElement)) return;
  const LIMIT = 75 * 1024 * 1024;
  const CHUNK = 2 * 1024 * 1024;
  const FORMATS = new Set(['pdf','dwg','dxf','zip','jpg','jpeg','png','webp','gif','bmp','tif','tiff','ifc','doc','docx','xls','xlsx','7z','rar','rvt']);
  const STORE = 'aeroventa-project-transfer-v1';
  let controller = null;
  const box = document.createElement('div');
  box.className = 'av-upload-progress';
  box.setAttribute('role','progressbar');
  box.setAttribute('aria-label','Загрузка документации');
  box.setAttribute('aria-valuemin','0');
  box.setAttribute('aria-valuemax','100');
  box.hidden = true;
  const fill = document.createElement('span');
  fill.className = 'av-upload-progress__fill';
  box.append(fill);
  status.after(box);
  function text(message, loading = false) {
    status.textContent = message;
    status.dataset.state = loading ? 'sending' : '';
  }
  const format = bytes => `${(bytes / 1048576).toFixed(1).replace('.',',')} МБ`;
  const sleep = ms => new Promise(done => setTimeout(done, ms));
  const fingerprint = files => JSON.stringify(files.map(f => [f.name,f.size,f.lastModified]));
  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(STORE) || 'null'); } catch { return null; }
  }
  function setSession(session) {
    try { sessionStorage.setItem(STORE,JSON.stringify(session)); } catch { /* recovery unavailable with blocked storage */ }
  }
  function clearSession() { try { sessionStorage.removeItem(STORE); } catch {} }
  function setProgress(bytes,total) {
    const percent = Math.min(100,Math.round(bytes / Math.max(1,total) * 100));
    box.hidden = false;
    box.setAttribute('aria-valuenow',String(percent));
    fill.style.width = `${percent}%`;
    status.textContent = `Передаём документацию · ${percent}% · ${format(bytes)} из ${format(total)}`;
    status.dataset.state = 'sending';
  }
  function refresh() {
    const files = [...(input.files || [])];
    if (summary) summary.textContent = files.length ? files.map(f=>f.name).join(' · ') : 'Файлы не выбраны';
    if (files.length && readSession()?.fingerprint === fingerprint(files)) text('Можно продолжить ранее прерванную загрузку.');
  }
  input.addEventListener('change',refresh);
  if (readSession()) text('Если передача прервалась, выберите те же файлы и повторите отправку.');
  const endpoint = action => `/api/project-transfer.php?action=${action}`;
  async function post(action,payload,session,signal) {
    const headers = {accept:'application/json'};
    if (session) { headers['X-AV-Upload-Id']=session.id;headers['X-AV-Upload-Token']=session.token; }
    if (payload !== null) headers['Content-Type']='application/json';
    const response = await fetch(endpoint(action),{
      method:'POST',credentials:'same-origin',cache:'no-store',signal,
      headers,body:payload === null ? null : JSON.stringify(payload)
    });
    const json = await response.json().catch(()=>null);
    if (!response.ok || json?.ok !== true) throw Object.assign(new Error(json?.error || 'server_unavailable'),{status:response.status,response:json});
    return json;
  }
  async function statusOffsets(session, signal) {
    const reply = await post('status',null,session,signal);
    if (reply.phase !== 'pending' || !Array.isArray(reply.offsets)) throw new Error('session_expired');
    return reply.offsets;
  }
  async function putChunk(file,idx,offset,session,signal) {
    const bytes = await file.slice(offset,Math.min(file.size,offset+CHUNK)).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256',bytes);
    const hash = [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    const response = await fetch(endpoint('chunk'),{
      method:'POST',credentials:'same-origin',cache:'no-store',signal,
      headers:{'Content-Type':'application/octet-stream','Accept':'application/json',
        'X-AV-Upload-Id':session.id,'X-AV-Upload-Token':session.token,
        'X-AV-File-Index':String(idx),'X-AV-Offset':String(offset),'X-AV-SHA256':hash},
      body:bytes
    });
    const result = await response.json().catch(()=>null);
    if (!response.ok || result?.ok!==true) throw Object.assign(new Error(result?.error || 'upload_chunk_failed'),{status:response.status});
    return result.offset;
  }
  // Preserve the previously accepted small-project intake if private storage is not writable yet.
  async function legacySmallTransfer(files, signal) {
    if (files.length > 3 || files.some(f=>f.size>4*1024*1024) || files.reduce((s,f)=>s+f.size,0)>8*1024*1024) return false;
    text('Используем резервную доставку небольшого проекта…',true);
    const response=await fetch('/api/project.php',{method:'POST',body:new FormData(form),
      credentials:'same-origin',cache:'no-store',signal,headers:{accept:'application/json'}});
    const data=await response.json().catch(()=>null);
    return response.ok && data?.ok===true;
  }
  function showSuccess() {
    const dialog = form.closest('dialog');
    if (dialog?.open) dialog.close();
    const toast=document.querySelector('[data-submission-success]');
    if (!(toast instanceof HTMLElement)) return;
    const title=toast.querySelector('[data-success-title]');
    if (title) title.textContent='Документы отправлены.';
    window.setTimeout(()=>{
      toast.hidden=false;toast.dataset.state='visible';
      window.setTimeout(()=>{
        if(toast.dataset.state==='visible') { toast.dataset.state='leaving';window.setTimeout(()=>{toast.hidden=true;toast.dataset.state='hidden';},240); }
      },5500);
    },220);
  }
  async function submitProject(event) {
    // This capture-phase handler replaces the legacy 8 MiB multipart JS handler.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (form.dataset.submitting === 'true') return;
    const files=[...(input.files || [])];
    const total=files.reduce((n,f)=>n+f.size,0);
    if (files.length<1 || files.length>20 || total>LIMIT || files.some(f=>f.size<1 || f.size>LIMIT || !FORMATS.has(f.name.split('.').pop().toLowerCase()))) {
      text('Разрешено до 20 файлов общим объёмом до 75 МБ. Проверьте формат и размер файлов.');
      return;
    }
    if (!form.reportValidity()) return;
    if (!window.crypto?.subtle) { text('Для защищённой передачи требуется HTTPS.');return; }
    controller=new AbortController();
    const signal=controller.signal;
    form.dataset.submitting='true';submit.disabled=true;submit.setAttribute('aria-busy','true');
    const id=fingerprint(files);
    try {
      let session=readSession();
      let offsets;
      if (!session || session.fingerprint!==id) {session=null;clearSession();}
      if (session) {
        try {offsets=await statusOffsets(session,signal);} catch(e) {if(e?.status===404 || e?.status===410 || e?.status===403 || e.message==='session_expired'){session=null;clearSession();} else throw e;}
      }
      if (!session) {
        text('Подготавливаем защищённую передачу…',true);
        const data=Object.fromEntries(new FormData(form));
        const initialized=await post('init',{
          name:String(data.name||''),contact:String(data.contact||''),task:String(data.task||''),
          source_page:location.pathname,website:String(data.website||''),
          consent: data.consent==='on',started_at:Number(data.started_at),
          files:files.map(f=>({name:f.name,size:f.size}))
        },null,signal);
        session={id:initialized.id,token:initialized.token,fingerprint:id};
        setSession(session);
        offsets=initialized.offsets;
      }
      for (let i=0;i<files.length;i++) {
        let offset=Number(offsets[i]||0);
        if (!Number.isInteger(offset) || offset<0 || offset>files[i].size) throw new Error('invalid_resume_offset');
        while(offset<files[i].size) {
          const complete=offsets.reduce((sum,v,j)=>sum+(j===i?offset:Math.min(Number(v)||0,files[j].size)),0);
          setProgress(complete,total);
          let retry=0;
          for (;;) {
            try {offset=await putChunk(files[i],i,offset,session,signal);offsets[i]=offset;break;}
            catch(error) {
              if(signal.aborted) throw error;
              if(error?.status===413 || error?.status===415 || error?.status===422 || error?.status===403 || error?.status===507) throw error;
              retry++;
              if(retry>5) throw new Error('network_interrupted');
              await sleep(Math.min(900*retry,4000));
              const remote=await statusOffsets(session,signal).catch(()=>null);
              if(remote && remote.length===files.length) {offsets=remote;offset=Number(remote[i]||0);}
              if(offset>=files[i].size) break;
            }
          }
        }
      }
      setProgress(total,total);
      text('Проверяем файлы и передаём уведомление…',true);
      const finished=await post('finish',null,session,signal);
      if (finished.status!=='mta_accepted_not_delivered' && finished.status!=='already_accepted') throw new Error('confirmation_missing');
      clearSession();
      form.reset();refresh();
      const stamp=form.querySelector('[name="started_at"]');
      if (stamp) stamp.value=String(Date.now());
      box.hidden=true;text('');
      try {window.aeroventaTrack?.('project_upload_accepted',{source:location.pathname});} catch {}
      showSuccess();
    } catch(e) {
      // Only a confirmed new-service unavailability can trigger the old small-file handler.
      if (['private_storage_unavailable','unsafe_storage_path','server_unavailable'].includes(e?.message) || e?.status===404) {
        try {
          if (await legacySmallTransfer(files,signal)) {
            clearSession();form.reset();refresh();box.hidden=true;text('');
            const stamp=form.querySelector('[name="started_at"]');if(stamp)stamp.value=String(Date.now());
            showSuccess();return;
          }
        } catch { /* display the error below without losing the chosen files */ }
      }
      if (e?.message==='network_interrupted' || e?.name==='AbortError') text('Связь прервалась. Выберите те же файлы и повторите отправку — загруженная часть сохранена.');
      else if (e?.message==='file_type_rejected' || e?.message==='upload_incomplete') text('Формат или содержимое файла не прошло проверку. Проверьте документацию.');
      else if (e?.message==='storage_capacity_or_rate_limit' || e?.message==='insufficient_storage') text('Временно недостаточно места для приёма проекта. Напишите на office@aeroventa.ru.');
      else text('Не удалось завершить передачу. Повторите отправку с теми же файлами или напишите на office@aeroventa.ru.');
      try {window.aeroventaTrack?.('project_upload_error',{source:location.pathname});} catch {}
    } finally {
      box.hidden=true;
      form.dataset.submitting='false';submit.disabled=false;submit.removeAttribute('aria-busy');controller=null;
    }
  }
  // Submit events captured on document before the existing form's bubble handler.
  document.addEventListener('submit',event=>{
    if (event.target===form) void submitProject(event);
  },true);
  form.closest('dialog')?.addEventListener('close',()=>{
    if(controller && form.dataset.submitting==='true') controller.abort();
  });
})();
