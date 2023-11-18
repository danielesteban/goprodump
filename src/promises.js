import colors from 'ansi-colors';
import readline from 'readline';

export const PromiseRetry = (handler, attempts = 10) => new Promise((resolve, reject) => {
  let count = 0;
  let delay = 1000;
  const terminal = process.stderr;
  const clearLine = () => {
    readline.cursorTo(terminal, 0, null);
    readline.clearLine(terminal, 0);
  };
  const attempt = () => (
    handler()
      .then((res) => {
        count > 0 && clearLine();
        resolve(res);
      })
      .catch((err) => {
        count > 0 && clearLine();
        if (++count === attempts) {
          reject(err);
          return;
        }
        terminal.write(`${colors.red('Failed.')} Retrying (${count}/${attempts})...`);
        setTimeout(attempt, delay);
        delay += 500;
      })
  );
  attempt();
});

export const PromiseTimeout = (timeout, handler) => new Promise((resolve, reject) => {
  let onTimeout;
  let hasTimeout = false;
  const timer = setTimeout(() => {
    hasTimeout = true;
    reject(new Error('timeout'));
    onTimeout && onTimeout();
  }, timeout);
  handler((res) => {
    if (hasTimeout) {
      return;
    }
    clearTimeout(timer);
    resolve(res);
  }, (err) => {
    if (hasTimeout) {
      return;
    }
    clearTimeout(timer);
    reject(err);
  }, (cb) => {
    onTimeout = cb;
  });
});
