import { OpenAPI } from '@/vendor/open-api';
import { syncArtifacts } from '@/restful/sync';

const $ = new OpenAPI('sub-store');
syncArtifacts();
export default $;
