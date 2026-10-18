import { loadConfig } from "../config/runtime.js";
import { checkDatabase } from "../database/connection.js";
import { json } from "../http/responses.js";

export async function health(env, openStore) {

          let settings;
          try {
            settings = await openStore(env, async (store) => {
              await checkDatabase(store);
              return store.settings();
            });
          } catch {
            return json({ ready: false, databaseReady: false }, 503);
          }
          try {
            loadConfig({ ...env, ...settings });
            return json({ ready: true, databaseReady: true });
          } catch {
            return json(
              {
                ready: false,
                databaseReady: true,
                reason: "verification_configuration_incomplete",
              },
              503,
            );
          }
        }
