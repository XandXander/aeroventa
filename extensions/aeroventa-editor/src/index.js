import { defineModule } from '@directus/extensions-sdk';
import Editor from './module.vue';

// Native Directus Studio module. No separate login, tokens, external CMS or API endpoint.
export default defineModule({
  id: 'aeroventa-editor',
  name: 'AEROVENTA · Редактор',
  icon: 'edit_note',
  color: '#345A52',
  routes: [{ path: '', component: Editor }],
});
