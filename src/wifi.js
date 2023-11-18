import wifi from 'node-wifi';
import { PromiseTimeout } from './promises.js';

export const connect = async (iface, ssid, password) => {
  let connection;
  wifi.init({ iface: iface || null });
  await wifi.connect({ ssid, password, isHidden: true });
  await PromiseTimeout(5000, async (resolve, _reject, onTimeout) => {
    let hasTimeout = false;
    onTimeout(() => {
      hasTimeout = true;
    });
    while (true) {
      if (hasTimeout) {
        return;
      }
      connection = (await wifi.getCurrentConnections()).find((c) => (c.ssid === ssid && c.security !== 'Unknown'));
      if (connection) {
        resolve(connection);
        return;
      }
    }
  });
  return connection;
};

export const disconnect = () => wifi.disconnect();
