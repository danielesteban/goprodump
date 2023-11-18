import colors from 'ansi-colors';
import { MultiBar } from 'cli-progress';
import easydl from 'easydl';

const url = (endpoint) => `http://10.5.5.9:8080/${endpoint}`;

const request = (endpoint) => (
  fetch(url(endpoint))
    .then((res) => {
      if (
        res.status < 200
        || res.status >= 400
        || res.headers.get('content-type').indexOf('application/json') !== 0
      ) {
        throw new Error();
      }
      return res.json();
    })
);

export const download = (files, path) => {
  const downloaded = {
    file: 1,
    size: 0,
  };
  const downloadSequentially = async () => {
    const file = files.shift();
    if (!file) {
      progress.stop();
      return;
    }

    current.update(0, { name: file.n });
    overall.update(downloaded.size, { file: downloaded.file });
    const size = parseInt(file.s, 10);
    await new easydl(url(`videos/DCIM/100GOPRO/${file.n}`), path, { connections: 1 })
      .on('progress', ({ total }) => {
        current.update(total.percentage, {
          ...(total.speed ? { speed: (total.speed / 1024 / 1024).toFixed(2) } : {}),
        });
        overall.update(downloaded.size + size * (total.percentage / 100));
      })
      .wait();
    downloaded.file++;
    downloaded.size += size;
    return downloadSequentially();
  };
  const progress = new MultiBar({
    format: '{name} |' + colors.cyan('{bar}') + '| {percentage}% ' + colors.green('[{speed}mb/s]'),
    autopadding: true,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });
  const overall = progress.create(files.reduce((size, { s }) => size + parseInt(s, 10), 0), 0, { file: 1, files: files.length }, {
    format: colors.yellow('[{file}/{files}]') + ' |' + colors.cyan('{bar}') + '| {percentage}%',
    barCompleteChar: '>',
    barIncompleteChar: ' ',
  });
  const current = progress.create(100, 0, { name: '', speed: 0 }, { barsize: 24 });
  return downloadSequentially();
};

export const list = async () => {
  const { media: [{ fs: media } = { fs: [] }] } = await request('gopro/media/list');
  return media.reduce((media, file) => {
    if (file.g) {
      const { b, l, m, n, s, ...data } = file;
      const deleted = m.map((i) => parseInt(i, 10));
      const extension = n.slice(n.lastIndexOf('.'));
      const group = n.slice(0, 4);
      const from = parseInt(b, 10);
      const to = parseInt(l, 10);
      const size = Math.floor(parseInt(s, 10) / (to - from - deleted.length));
      for (let i = from; i <= to; i++) {
        if (!deleted.includes(i)) {
          media.push({
            n: group + ('0000' + i).slice(-4) + extension,
            s: size,
            ...data,
          });
        }
      }
    } else {
      media.push(file);
    }
    return media;
  }, []);
};

export const turboTransfer = (enabled) => request(`gopro/media/turbo_transfer?p=${enabled ? 1 : 0}`);
