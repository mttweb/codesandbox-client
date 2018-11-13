// import tsServerExtension from 'buffer-loader!vscode/extensions/styled-components.zip';
import { default as Module } from 'node-services/lib/module';
import resolve from 'resolve';

function syncFile(fs, path: string, target: string) {
  return new Promise(resolve => {
    fs.readFile(path, (e, str) => {
      if (e) {
        try {
          fs.unlinkSync(target);
        } catch (e) {
          /* */
        }
        resolve();
        return;
      }

      fs.writeFileSync(target, str);
      resolve();
    });
  });
}

function syncDirectory(fs, path: string, target: string) {
  return new Promise(resolve => {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target);
    }

    fs.readdir(path, (e, entries) => {
      if (e) {
        resolve();
        return;
      }

      const promise = Promise.all(
        entries.map(
          entry =>
            new Promise(r => {
              const fullEntry = path + '/' + entry;
              const fullTarget = target + '/' + entry;
              fs.stat(fullEntry, (err, stat) => {
                if (err) {
                  try {
                    fs.unlinkSync(target);
                  } catch (e) {
                    /* */
                  }
                  r();
                  return;
                }

                if (stat.isDirectory()) {
                  r(syncDirectory(fs, fullEntry, fullTarget));
                } else {
                  r(syncFile(fs, fullEntry, fullTarget));
                }
              });
            })
        )
      );

      resolve(promise);
    });
  });
}

async function initializeBrowserFS() {
  return new Promise(resolve => {
    BrowserFS.configure(
      {
        fs: 'MountableFileSystem',
        options: {
          '/': { fs: 'InMemory', options: {} },
          '/tmp': { fs: 'InMemory', options: {} },
          '/worker': { fs: 'WorkerFS', options: { worker: self } },
          '/sandbox': { fs: 'InMemory', options: {} },
          '/vscode': {
            fs: 'InMemory',
            options: {},
          },
          // '/extensions': {
          //   fs: 'ZipFS',
          //   options: {
          //     zipData: tsServerExtension,
          //   },
          // },
          '/extensions': {
            fs: 'HTTPRequest',
            options: {
              index: '/vscode/extensions-bundle/extensions/index.json',
              baseUrl: '/vscode/extensions-bundle/extensions',
            },
          },
          // '/vscode': {
          //   fs: 'AsyncMirror',
          //   options: {
          //     sync: {
          //       fs: 'InMemory',
          //     },
          //     async: {
          //       fs: 'IndexedDB',
          //       options: {
          //         storeName: 'VSCode',
          //       },
          //     },
          //   },
          // },
        },
      },
      e => {
        if (e) {
          console.error(e);
          return;
        }

        const fs = BrowserFS.BFSRequire('fs');

        resolve(
          syncDirectory(fs, '/worker/sandbox', '/sandbox')
            .then(() => syncDirectory(fs, '/worker/worker/sandbox', '/sandbox'))
            .then(() =>
              syncDirectory(fs, '/worker/worker/worker/sandbox', '/sandbox')
            )
        );

        // BrowserFS is initialized and ready-to-use!
      }
    );
  });
}

const pendingMessages = [];
let initialized = false;

function processMessage(data) {
  const process = BrowserFS.BFSRequire('process');
  const { $data, $type } = data;

  if ($type === 'message') {
    process.emit('message', JSON.parse($data));
  } else if ($data && $data.$type) {
    process.stdin.emit('data', $data.$data);
  } else if ($type) {
    process.stdin.emit('data', $data);
  } else {
    if (data.browserfsMessage || (data.$data && data.$data.browserfsMessage)) {
      return;
    }

    console.log('ignoring', data);
  }
}

self.addEventListener('message', async e => {
  const { data } = e;

  if (data.$type === 'worker-manager') {
    if (data.$event === 'init') {
      const process = BrowserFS.BFSRequire('process');
      await initializeBrowserFS();

      process.send = (message, _a, _b, callback) => {
        const m = {
          $type: 'message',
          $data: JSON.stringify(message),
        };

        self.postMessage(m);
        callback(null);
      };

      process.stdout = {
        write: (message, callback) => {
          const m = {
            $type: 'stdout',
            $data: message,
          };

          // TODO look into wildcard
          self.postMessage(m);

          if (callback) {
            callback(null, null);
          }
        },
      };

      process.env = data.data.env || {};
      process.env.HOME = '/home';
      process.cwd = () => data.data.cwd || '/';
      process.argv = ['node', data.data.entry, ...data.data.argv] || [];

      if (data.data.entry) {
        const resolvedPath = resolve.sync(data.data.entry);

        try {
          const module = new Module(resolvedPath);
          module.load(resolvedPath);

          initialized = true;

          pendingMessages.forEach(processMessage);
        } catch (e) {
          console.error(e);
        }
      }
    }
  } else {
    if (!initialized) {
      pendingMessages.push(data);
    } else {
      processMessage(data);
    }
  }
});
