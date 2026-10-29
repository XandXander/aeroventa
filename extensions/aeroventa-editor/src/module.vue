<template>
  <private-view title="AEROVENTA · Редактор">
    <div class="av-editor">
      <div class="av-intro">
        <p class="av-eyebrow">AEROVENTA / CONTENT OPERATIONS</p>
        <h2>Редактор материалов</h2>
        <p>Только проверка и сохранение черновиков. Сайт aeroventa.ru не обновляется автоматически.</p>
      </div>
      <div class="av-metrics">
        <div><span>Материалов в Directus</span><strong>{{ rows.length }}</strong></div>
        <div><span>Черновики</span><strong>{{ draftsCount }}</strong></div>
        <div><span>Опубликованных и одобренных</span><strong>{{ approvedCount }}</strong></div>
      </div>
      <div class="av-shell">
        <section class="av-panel">
          <div class="av-panel-head"><h3>Материалы</h3><button type="button" class="av-button light" :disabled="busy" @click="load">Обновить</button></div>
          <p class="av-muted">В пилоте изменять разрешено только описание одного объекта.</p>
          <input v-model="search" class="av-field" placeholder="Поиск по заголовку или адресу" aria-label="Поиск материалов" />
          <div class="av-list">
            <button v-for="item in filteredRows" :key="item.id" type="button"
              class="av-item" :class="{active:selected?.id===item.id}" @click="select(item)">
              <span class="av-item-text"><b>{{ item.title || item.path }}</b><small>{{ item.path }}</small></span>
              <span class="av-tag" :class="item.path===PILOT_PATH ? 'pilot' : ''">{{ item.path===PILOT_PATH ? 'Пилот' : 'Просмотр' }}</span>
            </button>
          </div>
        </section>
        <section class="av-panel av-detail">
          <template v-if="selected">
            <div class="av-panel-head"><h3>{{ selected.title || 'Материал' }}</h3><span class="av-tag">{{ selected.status }}</span></div>
            <p class="av-muted selectable">{{ selected.path }}</p>
            <p v-if="!editable" class="av-hold">Этот материал только для просмотра. Публикация и изменение остальных страниц отключены.</p>
            <template v-else>
              <p class="av-hold">Пилот «НТФФ Полисан»: редактируется только поле «Краткое описание». Тексты остальных блоков, фото и SEO не затрагиваются.</p>
              <label for="av-excerpt">Краткое описание — черновик Directus</label>
              <textarea id="av-excerpt" v-model="edited" class="av-field av-textarea" :disabled="busy" maxlength="1600"></textarea>
              <div class="av-count">{{ edited.length }} / 1600</div>
              <div class="av-actions">
                <button type="button" class="av-button light" :disabled="busy || !changed" @click="reviewed=true">Проверить изменение</button>
                <button type="button" class="av-button primary" :disabled="busy || !changed || !reviewed" @click="saveDraft">Сохранить только черновик</button>
              </div>
              <div v-if="reviewed && changed" class="av-review">
                <h4>Перед сохранением</h4>
                <p><b>Было</b></p><p class="selectable">{{ snapshotAtLoad?.excerpt }}</p>
                <p><b>Станет</b></p><p class="selectable">{{ edited }}</p>
                <p class="av-muted">Статус останется draft. Сборка сайта не запускается, публичная страница не меняется.</p>
              </div>
            </template>
            <a class="av-native-link" :href="'/admin/content/content/' + encodeURIComponent(selected.id)">Открыть стандартный редактор Directus</a>
          </template>
          <p v-else class="av-muted">Выберите материал из списка.</p>
          <p v-if="message" class="av-feedback" role="status">{{ message }}</p>
          <p v-if="error" class="av-error" role="alert">{{ error }}</p>
        </section>
      </div>
      <footer class="av-footnote">Публикация, настройки сервера, GitHub Actions и перенос фотографий намеренно отсутствуют в этом модуле. Владелец утверждает каждое изменение отдельно.</footer>
    </div>
  </private-view>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { PILOT_PATH, snapshot, buildDraftPatch } from './pilot-guards.js';
const api = useApi();
const rows = ref([]), selected = ref(null), edited = ref(''), snapshotAtLoad = ref(null);
const search = ref(''), busy = ref(false), error = ref(''), message = ref(''), reviewed = ref(false);
const draftsCount = computed(() => rows.value.filter(x => x.status === 'draft').length);
const approvedCount = computed(() => rows.value.filter(x => x.status === 'published' && x.owner_approved_at).length);
const filteredRows = computed(() => rows.value.filter(x =>
  (String(x.title || '')+' '+String(x.path || '')).toLocaleLowerCase('ru').includes(search.value.toLocaleLowerCase('ru'))));
const editable = computed(() => selected.value?.path === PILOT_PATH && selected.value?.status === 'draft' &&
  selected.value?.owner_approved_at === null && !!snapshotAtLoad.value);
const changed = computed(() => editable.value && edited.value !== snapshotAtLoad.value.excerpt);
watch(edited, () => { reviewed.value = false; message.value = ''; });
function select(item) {
  selected.value = item;
  edited.value = String(item.excerpt ?? '');
  snapshotAtLoad.value = null;
  reviewed.value = false;
  error.value = ''; message.value = '';
  if (item.path === PILOT_PATH && item.status === 'draft' && item.owner_approved_at === null) {
    try { snapshotAtLoad.value = snapshot(item); }
    catch (e) { error.value = e.message; }
  }
}
async function load() {
  busy.value = true; error.value = ''; message.value = '';
  try {
    const response = await api.get('/items/content', {params:{
      fields:'id,path,title,excerpt,status,owner_approved_at',limit:100,sort:'path'
    }});
    if (!Array.isArray(response.data?.data)) throw new Error('Directus returned invalid data');
    if(response.data.data.length >= 100) throw new Error('Too many items for the bounded pilot; add pagination');
    rows.value = response.data.data;
    const prior = selected.value?.path;
    select(rows.value.find(x => x.path === prior) || rows.value.find(x => x.path === PILOT_PATH) || rows.value[0]);
  } catch(e) { error.value = 'Ошибка чтения Directus: '+(e.response?.status || e.message); }
  finally { busy.value = false; }
}
async function saveDraft() {
  error.value = ''; message.value = '';
  if (!reviewed.value || !editable.value || busy.value || !selected.value) return;
  busy.value = true;
  try {
    // Re-read immediately before updating to fail closed on a stale editor.
    const id = selected.value.id;
    const fetched = await api.get('/items/content/'+encodeURIComponent(id),
      {params:{fields:'id,path,title,excerpt,status,owner_approved_at'}});
    const current = fetched.data?.data;
    const patch = buildDraftPatch(snapshotAtLoad.value,current,edited.value);
    if (!window.confirm('Сохранить ТОЛЬКО черновик «НТФФ Полисан»? Публичный сайт не изменится.')) return;
    await api.patch('/items/content/'+encodeURIComponent(id),patch);
    await load();
    message.value = 'Черновик сохранён в Directus. Публикации не было. Для проверки предварительной сборки используется отдельный GitHub Actions.';
  } catch(e) { error.value = 'Не сохранено: '+(e.response?.status || e.message); }
  finally { busy.value = false; reviewed.value = false; }
}
onMounted(load);
</script>

<style scoped>
.av-editor{max-width:1380px;margin:auto;padding:32px 40px 50px;color:var(--theme--foreground,#24312e);font-family:inherit}
.av-intro{padding:18px 0 26px;border-bottom:1px solid var(--theme--border-color,#d9e1dd)}
.av-eyebrow{font-size:11px;letter-spacing:.14em;color:#55786e;font-weight:700;margin:0 0 10px}
.av-intro h2{font-size:clamp(26px,3vw,42px);font-weight:550;letter-spacing:-.045em;line-height:1.15;margin:0 0 10px}
.av-intro p{max-width:680px;line-height:1.6;color:var(--theme--foreground-subdued,#60756c)}
.av-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}
.av-metrics>div{border:1px solid var(--theme--border-color,#d9e1dd);border-radius:10px;padding:18px 20px;display:flex;flex-direction:column;gap:8px}
.av-metrics span{font-size:12px;color:var(--theme--foreground-subdued,#60756c)}.av-metrics strong{font-size:29px;font-weight:550}
.av-shell{display:grid;grid-template-columns:minmax(260px,40%) minmax(0,1fr);gap:20px}
.av-panel{border:1px solid var(--theme--border-color,#d9e1dd);border-radius:12px;padding:24px;min-width:0}
.av-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
.av-panel-head h3{font-size:19px;margin:0;font-weight:600;line-height:1.3}.av-muted{color:var(--theme--foreground-subdued,#60756c);font-size:13px;line-height:1.6}
.av-field{display:block;width:100%;border:1px solid var(--theme--border-color,#cbd6d1);background:var(--theme--background,#fff);border-radius:7px;padding:12px;color:inherit;font:inherit;margin:18px 0 14px}
.av-list{overflow:auto;max-height:540px;display:flex;flex-direction:column;gap:4px}
.av-item{text-align:left;border:1px solid transparent;background:transparent;border-radius:8px;padding:12px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;color:inherit;cursor:pointer}
.av-item:hover,.av-item.active{background:var(--theme--background-subdued,#f1f5f3);border-color:var(--theme--border-color,#d7e1dc)}
.av-item-text{display:flex;flex-direction:column;gap:5px;min-width:0}.av-item-text b{font-size:13px;line-height:1.4}.av-item-text small{font-size:11px;color:var(--theme--foreground-subdued,#62776e);overflow-wrap:anywhere}
.av-tag{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--theme--foreground-subdued,#60756c);white-space:nowrap}
.av-tag.pilot{color:#4b7e67}.av-hold{border-left:2px solid #819e8c;background:var(--theme--background-subdued,#f5f8f5);padding:13px 16px;margin:18px 0;font-size:13px;line-height:1.5}
.av-detail label{font-weight:600;font-size:13px}.av-textarea{min-height:180px;resize:vertical;line-height:1.6}
.av-count{text-align:right;font-size:11px;color:var(--theme--foreground-subdued,#60756c)}
.av-actions{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.av-button{padding:11px 16px;border-radius:6px;font-size:12px;cursor:pointer;border:1px solid #688d80}
.av-button.light{color:var(--theme--foreground,#24312e);background:transparent}.av-button.primary{background:#315c4e;color:white}
.av-button:disabled{opacity:.4;cursor:not-allowed}.av-review{padding:18px;border:1px solid #acc2b7;border-radius:8px;line-height:1.55;margin-top:16px}
.av-review h4{font-size:15px}.av-review p{font-size:13px;overflow-wrap:anywhere}.selectable{user-select:text}
.av-native-link{display:inline-block;margin:28px 0 8px;font-size:12px;text-decoration:underline;color:var(--theme--primary,#3b7163)}
.av-feedback,.av-error{padding:12px 16px;border-radius:6px;font-size:13px;line-height:1.5}.av-feedback{background:#e5f3ed;color:#245943}.av-error{background:#fff0ee;color:#9c382a}
.av-footnote{margin-top:30px;font-size:12px;line-height:1.6;color:var(--theme--foreground-subdued,#60756c)}
@media(max-width:850px){.av-editor{padding:22px 16px}.av-shell{grid-template-columns:1fr}.av-metrics{grid-template-columns:1fr}}
</style>
