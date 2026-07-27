'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Apply small upstream fixes to ZK device libraries.
 * Re-applied on npm install via postinstall.
 */
function patchFile(relativePath, replacements) {
  const target = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(target)) {
    return false;
  }

  let content = fs.readFileSync(target, 'utf8');
  let changed = false;

  for (const [broken, fixed] of replacements) {
    if (content.includes(broken)) {
      content = content.replace(broken, fixed);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(target, content, 'utf8');
  }
  return changed;
}

const zktecoJs = patchFile('node_modules/zkteco-js/src/ztcp.js', [
  [
    [
      '            } catch (err) {',
      '                reject(err)',
      '                console.log(reply)',
      '',
      '            }',
    ].join('\n'),
    [
      '            } catch (err) {',
      '                reject(err);',
      '                return;',
      '            }',
    ].join('\n'),
  ],
  [
    '            console.error("Promise Rejected:", err); // Log the rejection reason',
    '            // Promise rejection handled by caller',
  ],
  [
    "            console.error('Error getting attendance records:', err);",
    '            // Attendance download errors are handled by caller',
  ],
]);

const nodeZkLib = patchFile('node_modules/node-zklib/zklibtcp.js', [
  [
    [
      '      } catch (err) {',
      '        reject(err)',
      '      }',
      '',
      '      const header = decodeTCPHeader(reply.subarray(0, 16))',
    ].join('\n'),
    [
      '      } catch (err) {',
      '        reject(err);',
      '        return;',
      '      }',
      '',
      '      const header = decodeTCPHeader(reply.subarray(0, 16))',
    ].join('\n'),
  ],
  [
    [
      "    this.socket.listenerCount('data') === 0 && this.socket.on('data', (data) => {",
      '',
      '      if (!checkNotEventTCP(data)) return;',
      '      if (data.length > 16) {',
      '        cb(decodeRecordRealTimeLog52(data))',
      '      }',
      '',
      '    })',
    ].join('\n'),
    [
      '    if (this._realtimeLogHandler) {',
      '      this.socket.removeListener(\'data\', this._realtimeLogHandler)',
      '    }',
      '    this._realtimeLogHandler = (data) => {',
      '      if (!checkNotEventTCP(data)) return',
      '      if (data.length > 16) {',
      '        cb(decodeRecordRealTimeLog52(data))',
      '      }',
      '    }',
      '    this.socket.on(\'data\', this._realtimeLogHandler)',
    ].join('\n'),
  ],
]);

const zktecoRealtime = patchFile('node_modules/zkteco-js/src/ztcp.js', [
  [
    [
      '            // Ensure data listeners are added only once',
      '            if (this.socket.listenerCount(\'data\') === 0) {',
      '                this.socket.on(\'data\', (data) => {',
      '                    // Check if the data is an event and not just a regular response',
      '                    if (checkNotEventTCP(data)) {',
      '                        // Process the data if it is of the expected length',
      '                        if (data.length > 16) {',
      '                            // Decode and pass the log to the callback',
      '                            cb(decodeRecordRealTimeLog52(data));',
      '                        }',
      '                    }',
      '                });',
      '            }',
    ].join('\n'),
    [
      '            if (this._realtimeLogHandler) {',
      '                this.socket.removeListener(\'data\', this._realtimeLogHandler);',
      '            }',
      '            this._realtimeLogHandler = (data) => {',
      '                if (checkNotEventTCP(data)) {',
      '                    if (data.length > 16) {',
      '                        cb(decodeRecordRealTimeLog52(data));',
      '                    }',
      '                }',
      '            };',
      '            this.socket.on(\'data\', this._realtimeLogHandler);',
    ].join('\n'),
  ],
]);

if (zktecoJs || nodeZkLib || zktecoRealtime) {
  // eslint-disable-next-line no-console
  console.log('Applied device library patches.', { zktecoJs, nodeZkLib, zktecoRealtime });
}
