import noble from 'noble';
import { PromiseTimeout } from './promises.js';

const address = (uuid) => `b5f9${uuid}aa8d11e390460002a5d5c51b`;

let connection;
let interval;
let services;

const read = (service) => PromiseTimeout(1000, (resolve, reject) => (
  service.read((err, data) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(data);
  })
));

const request = ({ req, res }, payload, size = 1) => PromiseTimeout(1000, (resolve, _reject, onTimeout) => {
  const packets = [];
  const response = (data) => {
    packets.push(data);
    if (--size <= 0) {
      res.listeners.splice(res.listeners.indexOf(response), 1);
      resolve(packets);
    }
  };
  res.listeners.push(response);
  onTimeout(() => res.listeners.splice(res.listeners.indexOf(response), 1));
  req.write(Buffer.from([payload.length, ...payload]));
});

const command = (payload, size) => request(services.command, payload, size);

export const connect = async (id) => {
  await PromiseTimeout(1000, (resolve, _reject, onTimeout) => {
    if (noble.state === 'poweredOn') {
      resolve();
      return;
    }
    const onStateChange = (state) => {
      if (state === 'poweredOn') {
        noble.removeListener('stateChange', onStateChange);
        resolve();
      }
    };
    noble.on('stateChange', onStateChange);
    onTimeout(() => noble.removeListener('stateChange', onStateChange));
  });
  const peripheral = await PromiseTimeout(3000, (resolve, _reject, onTimeout) => {
    noble.startScanning(['fea6']);
    onTimeout(() => noble.stopScanning());
    noble.on('discover', (peripheral) => {
      const name = peripheral.advertisement.localName;
      if (
        !name
        || !(id ? `GoPro ${id}` === name : /GoPro [A-Z0-9]{4}/.test(name))
      ) {
        return;
      }
      noble.stopScanning();
      resolve(peripheral);
    });
  });
  const characteristics = await new Promise((resolve, reject) => (
    peripheral.connect((err) => {
      if (err) {
        reject(err);
        return;
      }
      peripheral.discoverSomeServicesAndCharacteristics(
        [],
        [
          address('0002'),
          address('0003'),
          address('0005'),
          address('0072'),
          address('0073'),
          address('0074'),
          address('0075'),
        ],
        (err, _, characteristics) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(characteristics);
        }
      );
    })
  ));

  connection = peripheral;
  services = {
    ap: {
      ssid: characteristics.find(({ uuid }) => uuid === address('0002')),
      password: characteristics.find(({ uuid }) => uuid === address('0003')),
      state: characteristics.find(({ uuid }) => uuid === address('0005')),
    },
    command: {
      req: characteristics.find(({ uuid }) => uuid === address('0072')),
      res: characteristics.find(({ uuid }) => uuid === address('0073')),
    },
    keepalive: {
      req: characteristics.find(({ uuid }) => uuid === address('0074')),
      res: characteristics.find(({ uuid }) => uuid === address('0075')),
    },
  };
  await Promise.all([services.command, services.keepalive].map(({ res }) => new Promise((resolve, reject) => {
    res.listeners = [];
    res.on('data', (data) => (
      res.listeners.forEach((listener) => listener(data))
    ));
    res.subscribe((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  })))
    .catch((err) => {
      disconnect();
      throw err;
    });

  clearInterval(interval);
  interval = setInterval(() => (
    request(services.keepalive, [0x5B, 0x01, 0x42]).catch(() => {})
  ), 3000);

  return connection;
};

export const disconnect = () => new Promise((resolve, reject) => {
  if (!connection) {
    reject(new Error());
    return;
  }
  connection.disconnect(() => {
    connection = undefined;
    clearInterval(interval);
    services = undefined;
    resolve();
  });
});

export const enableAP = async () => {
  if (!connection) {
    throw new Error();
  }
  await command([0x17, 0x01, 0x01]);
  await PromiseTimeout(3000, async (resolve, _reject, onTimeout) => {
    let hasTimeout = false;
    onTimeout(() => {
      hasTimeout = true;
    });
    while (true) {
      if (hasTimeout) {
        return;
      }
      const [state] = await read(services.ap.state);
      if (state !== 0x00) {
        resolve();
        return;
      }
    }
  });
  let [ssid, password] = await Promise.all([
    read(services.ap.ssid),
    read(services.ap.password),
  ]);
  ssid = ssid.toString('utf-8');
  password = password.toString('utf-8');
  return {
    ssid,
    password,
  };
};

export const disableAP = async () => {
  if (!connection) {
    throw new Error();
  }
  await command([0x17, 0x01, 0x00]);
};

export const setClock = async () => {
  if (!connection) {
    throw new Error();
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const offset = now.getTimezoneOffset();
  const jan = new Date(now.getFullYear(), 0, 1);
  const jul = new Date(now.getFullYear(), 6, 1);
  const dst = (
    offset < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset())
  ) ? 1 : 0;
  const tz = new Uint16Array([Math.abs(-offset)]);
  if (offset > 0) tz[0] = 1 + ~tz[0];
  await command([
    0x0F, // Set local date
    0x0A, // Date length
    (year >> 8) & 0xFF, year & 0xFF, month, date,
    hours, minutes, seconds,
    (tz[0] >> 8) & 0xFF, tz[0] & 0xFF, dst
  ]);
};

export const sleep = async () => {
  if (!connection) {
    throw new Error();
  }
  await command([0x05]);
};

export const info = async () => {
  if (!connection) {
    throw new Error();
  }
  const res = (await command([0x3C], 5)) 
    .reduce((res, p) => {
      res.push(...p.slice(1));
      return res;
    }, []);

  let p = 3;
  const ml = res[p++];
  const model = res.slice(p, p + ml).map((n) => Buffer.from([n]).toString('hex')).join(':');
  p += ml;
  const nl = res[p++];
  const name = Buffer.from(res.slice(p, p + nl)).toString('utf-8');
  p += nl;
  const bl = res[p++];
  const board = Buffer.from(res.slice(p, p + bl)).toString('utf-8');
  p += bl;
  const fl = res[p++];
  const firmware = Buffer.from(res.slice(p, p + fl)).toString('utf-8');
  p += fl;
  const sl = res[p++];
  const serial = Buffer.from(res.slice(p, p + sl)).toString('utf-8');
  p += sl;
  const apl = res[p++];
  const ap = Buffer.from(res.slice(p, p + apl)).toString('utf-8');
  p += apl;
  const mcl = res[p++];
  const mac = Buffer.from(res.slice(p, p + mcl)).toString('utf-8');

  return {
    name,
    model,
    board,
    firmware,
    serial,
    ssid: ap,
    bssid: mac,
  };
};
