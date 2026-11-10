import * as channel from './channel.js';
import * as panel from './panel.js';
import * as tiktok from './tiktok/index.js';
import * as youtube from './youtube/index.js';
import * as getrole from './getrole.js';
import * as verificationPanel from './verification-panel.js';
import * as help from './help.js';
// Members verify by posting a screenshot in the submission channel, so there are
// no member commands besides /help. `npm run register` replaces the whole set.
const modules = [channel, panel, tiktok, youtube, getrole, verificationPanel, help];
export const commands = modules.map(command => command.data);
export const commandHandlers = new Map(modules.map(command => [command.data.name, command.execute]));
