import colors from 'ansi-colors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import * as BLE from './ble.js';
import * as HTTP from './http.js';
import { PromiseRetry } from './promises.js';
import * as WIFI from './wifi.js';

const main = async () => {
  console.log(colors.yellow('Connecting BLE...'));
  await PromiseRetry(() => BLE.connect(args.id));

  const { name, serial } = await BLE.info();
  const id = serial.slice(-4);
  console.log(`${colors.cyan(`[${id}]`)} ${name}`);

  console.log(colors.green('Enabling AP...'));
  const { ssid, password } = await PromiseRetry(BLE.enableAP);

  console.log(colors.yellow('Connecting WIFI...'));
  await PromiseRetry(() => WIFI.connect(args.wifi, ssid, password));

  console.log(colors.green('Listing media...'));
  await PromiseRetry(() => HTTP.turboTransfer(true));
  let media = await PromiseRetry(HTTP.list);
  console.log(`${media.length} files on camera`);

  const output = args.output ? (
    path.resolve(args.output)
  ) : (
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'output', id)
  );
  !fs.existsSync(output) && fs.mkdirSync(output, { recursive: true });

  if (args.filter) {
    media = media.filter((file) => !fs.existsSync(path.join(output, file.n)));
  }

  if (media.length) {
    console.log(colors.cyan(`Downloading ${media.length} ${args.filter ? 'new ' : ''}files to:`));
    console.log(output);
    await HTTP.download(media, output);
  } else {
    console.log(colors.cyan(`No ${args.filter ? 'new ' : ''}files on camera.`));
  }

  console.log(colors.yellow('Shutting down...'));
  await HTTP.turboTransfer(false);
  await WIFI.disconnect();
  await BLE.disableAP();
  await BLE.setClock();
  await BLE.sleep();
  await BLE.disconnect();

  console.log('Done!');
  process.exit(0);
};

const args = yargs(process.argv)
  .scriptName('pnpm start')
  .usage('Usage:\n  $0 --id "1234"')
  .option('filter', {
    alias: 'f',
    type: 'boolean',
    description: 'Filter out already downloaded',
    default: true,
  })
  .option('id', {
    alias: 'i',
    type: 'string',
    description: 'Last 4 digits from the camera serial number',
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'Output folder',
  })
  .option('wifi', {
    alias: 'w',
    type: 'string',
    description: 'WIFI interface',
  })
  .parse();

main().catch((e) => {
  console.log(colors.red(e));
  process.exit(1);
});
